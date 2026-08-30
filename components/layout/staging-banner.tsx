import { Construction } from "lucide-react";
import { IS_STAGING } from "@/lib/site-env";

export function StagingBanner() {
  if (!IS_STAGING) return null;

  return (
    <div
      className="border-b border-amber-500/30 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950"
      role="status"
    >
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <Construction className="size-4 shrink-0" aria-hidden />
        <span>
          <strong>Staging preview</strong> — not the live customer site. Search engines are
          blocked until the production domain is launched.
        </span>
      </p>
    </div>
  );
}
