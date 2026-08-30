"use client";

import { Shield } from "lucide-react";
import { ROLE_LABEL } from "@/lib/roles";
import type { UserRole } from "@/lib/types";

export function StaffModeBanner({
  role,
  clientName,
}: {
  role: UserRole;
  clientName: string;
}) {
  return (
    <div className="border-b border-amber-500/30 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950">
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <Shield className="size-4 shrink-0" aria-hidden />
        <span>
          <strong>{ROLE_LABEL[role]} view</strong> — editing {clientName}&apos;s account. Changes
          save to the client portal.
        </span>
      </p>
    </div>
  );
}
