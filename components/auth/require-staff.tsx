"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const { user, ready, isStaff } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login?next=/portal/admin");
      return;
    }
    if (!isStaff) {
      router.replace("/portal");
    }
  }, [ready, user, isStaff, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading staff portal…
      </div>
    );
  }

  if (!user || !isStaff) return null;

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-charcoal">Staff access requires Supabase</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Configure <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and assign your
          profile <code className="text-xs">role</code> to <strong>owner</strong> or{" "}
          <strong>employee</strong> in the database.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
