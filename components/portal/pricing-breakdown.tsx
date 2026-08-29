"use client";

import type { ProjectPricing } from "@/lib/types";
import { cad } from "@/lib/format";
import { cn } from "@/lib/utils";

type PricingRow = {
  label: string;
  value: string;
  emphasize?: boolean;
  highlight?: boolean;
};

function buildRows(
  pricing: ProjectPricing,
  variant: "proposal" | "deposit" | "final",
): PricingRow[] {
  if (variant === "deposit") {
    return [
      { label: "Professional fee", value: cad(pricing.professionalFee) },
      { label: "HST (13%)", value: cad(pricing.hst) },
      { label: "Project total", value: cad(pricing.total), emphasize: true },
      { label: "50% deposit due now", value: cad(pricing.deposit), highlight: true },
      { label: "Final 50% (after modelling)", value: cad(pricing.final) },
    ];
  }

  if (variant === "final") {
    return [
      { label: "Professional fee", value: cad(pricing.professionalFee) },
      { label: "HST (13%)", value: cad(pricing.hst) },
      { label: "Project total", value: cad(pricing.total), emphasize: true },
      { label: "Deposit paid", value: `-${cad(pricing.deposit)}` },
      { label: "Balance due", value: cad(pricing.final), highlight: true },
    ];
  }

  return [
    { label: "Professional fee", value: cad(pricing.professionalFee) },
    { label: "HST (13%)", value: cad(pricing.hst) },
    { label: "Project total", value: cad(pricing.total), emphasize: true },
    { label: "50% deposit", value: cad(pricing.deposit) },
    { label: "Final 50%", value: cad(pricing.final) },
  ];
}

export function PricingBreakdown({
  pricing,
  variant = "proposal",
  className,
}: {
  pricing: ProjectPricing;
  variant?: "proposal" | "deposit" | "final";
  className?: string;
}) {
  const rows = buildRows(pricing, variant);

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-white shadow-sm lg:hidden",
          className,
        )}
      >
        <dl className="divide-y divide-border text-sm">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cn(
                "flex items-center justify-between gap-4 px-4 py-3",
                row.emphasize && "bg-muted/50 font-semibold",
                row.highlight && "bg-electric/5 font-semibold text-charcoal",
              )}
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right text-charcoal">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div
        className={cn(
          "hidden overflow-hidden rounded-2xl border border-border bg-white shadow-sm lg:block",
          className,
        )}
      >
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className={cn(
                  "border-t border-border first:border-t-0",
                  row.emphasize && "bg-muted/60 font-semibold",
                  row.highlight && "bg-electric/5 font-semibold",
                )}
              >
                <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                <td className="px-4 py-3 text-right text-charcoal">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
