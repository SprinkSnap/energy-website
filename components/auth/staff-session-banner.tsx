"use client";

import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL } from "@/lib/roles";

export function StaffSessionBanner() {
  const { user, isStaff } = useAuth();

  if (!user || !isStaff) return null;

  return (
    <div className="border-b border-border/80 bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
      <p>
        Signed in as <span className="font-medium text-charcoal">{user.email}</span>
        {" · "}
        Role: <span className="font-medium text-charcoal">{ROLE_LABEL[user.role]}</span>
      </p>
    </div>
  );
}
