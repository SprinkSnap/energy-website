"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createContext, useContext, type ReactNode } from "react";
import { DEMO_USER } from "@/lib/constants";
import { demoAccount } from "@/lib/mock-data";
import type { SessionUser, UserAccount } from "@/lib/types";

const USERS_KEY = "ecd-users";
const SESSION_KEY = "ecd-session";

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readUsers(): UserAccount[] {
  if (typeof window === "undefined") return [demoAccount];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [demoAccount];
    const parsed = JSON.parse(raw) as UserAccount[];
    if (!parsed.some((u) => u.email === DEMO_USER.email)) {
      return [demoAccount, ...parsed];
    }
    return parsed;
  } catch {
    return [demoAccount];
  }
}

let sessionCache: { raw: string | null; value: SessionUser | null } = {
  raw: "__unset__",
  value: null,
};

function getSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (sessionCache.raw === raw) return sessionCache.value;
  let value: SessionUser | null = null;
  try {
    value = raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    value = null;
  }
  sessionCache = { raw, value };
  return value;
}

interface AuthContextValue {
  user: SessionUser | null;
  ready: boolean;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  register: (input: {
    name: string;
    email: string;
    password: string;
    company?: string;
    phone?: string;
  }) => { ok: boolean; error?: string };
  logout: () => void;
  loginDemo: () => { ok: boolean; error?: string };
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toSession(account: UserAccount): SessionUser {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    company: account.company,
    phone: account.phone,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribe, getSession, () => null);

  const login = useCallback((email: string, password: string) => {
    const users = readUsers();
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    const match = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
    );
    if (!match) return { ok: false, error: "Invalid email or password." };
    localStorage.setItem(SESSION_KEY, JSON.stringify(toSession(match)));
    emit();
    return { ok: true };
  }, []);

  const register = useCallback(
    (input: {
      name: string;
      email: string;
      password: string;
      company?: string;
      phone?: string;
    }) => {
      const users = readUsers();
      if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
        return { ok: false, error: "An account with this email already exists." };
      }
      const account: UserAccount = { id: `user-${Date.now()}`, ...input };
      localStorage.setItem(USERS_KEY, JSON.stringify([...users, account]));
      localStorage.setItem(SESSION_KEY, JSON.stringify(toSession(account)));
      emit();
      return { ok: true };
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    emit();
  }, []);

  const loginDemo = useCallback(() => {
    return login(DEMO_USER.email, DEMO_USER.password);
  }, [login]);

  const value = useMemo(
    () => ({ user, ready: true, login, register, logout, loginDemo }),
    [user, login, register, logout, loginDemo],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
