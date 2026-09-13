"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { sanitizeInternalNextPath } from "@/lib/sanitize-internal-next-path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AccessDenied } from "@/components/auth/access-denied";

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const { user, ready, isStaff } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const returnPath = useMemo(() => {
    const query = searchParams.toString();
    const fullPath = query ? `${pathname}?${query}` : pathname || "/admin";
    return sanitizeInternalNextPath(fullPath, "/admin");
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!ready || user) return;
    router.replace(`/login?next=${encodeURIComponent(returnPath)}`);
  }, [ready, user, router, returnPath]);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading staff portal…
      </div>
    );
  }

  if (!user) return null;

  if (!isStaff) {
    return <AccessDenied />;
  }

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
