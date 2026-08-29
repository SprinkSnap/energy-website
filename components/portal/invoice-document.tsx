import type { Project } from "@/lib/types";
import { cad, serviceLabel } from "@/lib/format";
import { PricingBreakdown } from "@/components/portal/pricing-breakdown";

export function invoiceNumber(projectId: string, kind: "deposit" | "final"): string {
  const suffix = kind === "deposit" ? "DEP" : "FIN";
  return `ECD-${projectId.replace(/[^A-Z0-9]/gi, "")}-${suffix}`;
}

export function InvoiceDocument({
  project,
  kind,
}: {
  project: Project;
  kind: "deposit" | "final";
}) {
  const issued = new Date(project.updatedAt).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-electric uppercase">
            {kind === "deposit" ? "Deposit invoice" : "Final invoice"}
          </p>
          <h2 className="mt-1 text-xl font-bold text-charcoal sm:text-2xl">
            {invoiceNumber(project.id, kind)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Issued {issued}</p>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-semibold text-charcoal">{project.info.builder || "Client"}</p>
          <p className="text-muted-foreground">{project.id}</p>
          <p className="text-muted-foreground">{serviceLabel(project)}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {kind === "deposit"
          ? `50% deposit for SB-12 energy compliance modelling on ${project.info.modelName || "this project"}.`
          : `Remaining balance after deposit of ${cad(project.pricing.deposit)}. Pay to unlock permit documents.`}
      </p>

      <div className="mt-5">
        <PricingBreakdown pricing={project.pricing} variant={kind === "deposit" ? "deposit" : "final"} />
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        HST registration pending. Prices shown in Canadian dollars. Deposit starts
        modelling; final payment unlocks EEDS and HOT2000 reports.
      </p>
    </article>
  );
}
