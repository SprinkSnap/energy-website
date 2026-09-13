"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEMO_USER } from "@/lib/constants";
import { isDemoAuthEnabled } from "@/lib/auth-config";
import { demoAccount } from "@/lib/mock-data";
import { authLog } from "@/lib/supabase/auth-log";
import { SESSION_USER_TIMEOUT_MS, sessionUserFromSupabase } from "@/lib/supabase/auth-user";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { OperationTimeoutError, withTimeout } from "@/lib/supabase/with-timeout";
import type { AuthChangeEvent, AuthResponse, Session } from "@supabase/supabase-js";
import type { SessionUser, UserAccount, UserRole } from "@/lib/types";

const USERS_KEY = "ecd-users";
const SESSION_KEY = "ecd-session";
const SIGN_UP_TIMEOUT_MS = 15000;

type AuthResult = { ok: true } | { ok: false; error?: string };

interface AuthContextValue {
  user: SessionUser | null;
  ready: boolean;
  usingSupabase: boolean;
  isStaff: boolean;
  isOwner: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    company?: string;
    phone?: string;
  }) => Promise<AuthResult>;
  logout: () => Promise<void>;
  loginDemo: () => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toSession(account: UserAccount, role: UserRole = "client"): SessionUser {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    company: account.company,
    phone: account.phone,
    role,
  };
}

function readLocalUsers(): UserAccount[] {
  const demoEnabled = isDemoAuthEnabled();
  if (typeof window === "undefined") return demoEnabled ? [demoAccount] : [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as UserAccount[]) : [];
    if (!demoEnabled) return parsed;
    const withoutDemo = parsed.filter(
      (u) => u.email.toLowerCase() !== DEMO_USER.email.toLowerCase(),
    );
    return [demoAccount, ...withoutDemo];
  } catch {
    return demoEnabled ? [demoAccount] : [];
  }
}

function readLocalSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const usingSupabase = isSupabaseConfigured();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(() => !usingSupabase);

  useEffect(() => {
    if (!usingSupabase) {
      setUser(readLocalSession());
      setReady(true);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setUser(null);
      setReady(true);
      return;
    }

    setReady(true);

    let active = true;
    let syncing = false;

    const syncUser = async () => {
      if (syncing) return;
      syncing = true;
      try {
        const sessionUser = await sessionUserFromSupabase(supabase, {
          timeoutMs: SESSION_USER_TIMEOUT_MS,
        });
        if (active) setUser(sessionUser);
      } catch {
        if (active) setUser(null);
      } finally {
        syncing = false;
      }
    };

    void syncUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!active) return;
      if (!session?.user) {
        setUser(null);
        return;
      }
      window.setTimeout(() => {
        if (active) void syncUser();
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [usingSupabase]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const normalizedEmail = email.toLowerCase().trim();
      const isDemoEmail = normalizedEmail === DEMO_USER.email.toLowerCase();

      if (isDemoEmail && !isDemoAuthEnabled()) {
        return {
          ok: false,
          error:
            "Demo login is not available on the live site. Create your own account at /create-account, or ask your administrator to enable demo access.",
        };
      }

      if (usingSupabase) {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) return { ok: false, error: "Authentication is not configured." };

        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          if (isDemoEmail && isDemoAuthEnabled()) {
            return {
              ok: false,
              error: "Invalid demo password. Use Demo1234! or click Open demo portal.",
            };
          }
          return { ok: false, error: "Invalid email or password." };
        }

        const sessionUser = await sessionUserFromSupabase(supabase);
        setUser(sessionUser);
        return { ok: true };
      }

      const users = readLocalUsers();
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      const match = users.find(
        (u) => u.email.toLowerCase() === normalizedEmail && u.password === password,
      );
      if (!match) {
        if (isDemoEmail && isDemoAuthEnabled()) {
          return {
            ok: false,
            error: "Invalid demo password. Use Demo1234! or click Open demo portal.",
          };
        }
        return { ok: false, error: "Invalid email or password." };
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(toSession(match)));
      setUser(toSession(match));
      return { ok: true };
    },
    [usingSupabase],
  );

  const register = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
      company?: string;
      phone?: string;
    }): Promise<AuthResult> => {
      if (usingSupabase) {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) return { ok: false, error: "Authentication is not configured." };

        authLog("[auth] Supabase sign-up request started");

        let data: AuthResponse["data"];
        let error: AuthResponse["error"];
        try {
          const result = await withTimeout<AuthResponse>(
            supabase.auth.signUp({
              email: input.email.toLowerCase().trim(),
              password: input.password,
              options: {
                data: {
                  name: input.name,
                  company: input.company ?? "",
                  phone: input.phone ?? "",
                },
              },
            }),
            SIGN_UP_TIMEOUT_MS,
            "Supabase sign-up",
          );
          data = result.data;
          error = result.error;
        } catch (signUpError) {
          const category =
            signUpError instanceof OperationTimeoutError ? "timeout" : "network";
          authLog(`[auth] Supabase sign-up failed: ${category}`);
          return {
            ok: false,
            error: "Unable to reach the account service. Please try again.",
          };
        }

        if (error) {
          authLog(`[auth] Supabase sign-up failed: validation`);
          return { ok: false, error: error.message };
        }

        if (data.user && !data.session) {
          return {
            ok: false,
            error:
              "Check your email to confirm your account, then sign in. If confirmation is disabled in Supabase, try logging in now.",
          };
        }

        const sessionUser = await sessionUserFromSupabase(supabase);
        setUser(sessionUser);
        return { ok: true };
      }

      const users = readLocalUsers();
      if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
        return { ok: false, error: "An account with this email already exists." };
      }
      const account: UserAccount = { id: `user-${Date.now()}`, ...input };
      localStorage.setItem(USERS_KEY, JSON.stringify([...users, account]));
      localStorage.setItem(SESSION_KEY, JSON.stringify(toSession(account)));
      setUser(toSession(account));
      return { ok: true };
    },
    [usingSupabase],
  );

  const logout = useCallback(async () => {
    if (usingSupabase) {
      const supabase = createSupabaseBrowserClient();
      if (supabase) await supabase.auth.signOut();
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    setUser(null);
  }, [usingSupabase]);

  const loginDemo = useCallback(async (): Promise<AuthResult> => {
    if (!isDemoAuthEnabled()) {
      return { ok: false, error: "Demo login is disabled in this environment." };
    }
    return login(DEMO_USER.email, DEMO_USER.password);
  }, [login]);

  const resetPassword = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!usingSupabase) {
        return {
          ok: false,
          error: "Password reset requires Supabase. Contact support for help.",
        };
      }

      const supabase = createSupabaseBrowserClient();
      if (!supabase) return { ok: false, error: "Authentication is not configured." };

      const redirectTo = `${window.location.origin}/auth/callback?next=/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [usingSupabase],
  );

  const value = useMemo(
    () => ({
      user,
      ready,
      usingSupabase,
      isStaff: user?.role === "owner" || user?.role === "employee",
      isOwner: user?.role === "owner",
      login,
      register,
      logout,
      loginDemo,
      resetPassword,
    }),
    [user, ready, usingSupabase, login, register, logout, loginDemo, resetPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
