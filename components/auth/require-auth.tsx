"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      const next = encodeURIComponent(pathname || "/portal");
      router.replace(`/login?next=${next}`);
    }
  }, [ready, user, router, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading portal…
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}
