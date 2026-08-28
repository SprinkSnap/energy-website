import {
  FileCheck2,
  FileSpreadsheet,
  Layers3,
  ShieldCheck,
  FolderOpen,
} from "lucide-react";
import { DELIVERABLES } from "@/lib/constants";

const deliverableDetails: Record<string, { icon: typeof Layers3; detail: string }> = {
  "HOT2000 proposed model": {
    icon: Layers3,
    detail: "As-designed EnerGuide simulation reflecting confirmed assemblies and mechanicals.",
  },
  "HOT2000 reference/code model": {
    icon: Layers3,
    detail: "Reference model supporting SB-12 performance comparisons where required.",
  },
  "SB-12 compliance analysis": {
    icon: ShieldCheck,
    detail: "Performance-path documentation against Ontario Supplementary Standard SB-12.",
  },
  "EEDS — Energy Efficiency Design Summary": {
    icon: FileSpreadsheet,
    detail: "Municipal summary form aligned to the modelled compliance path.",
  },
  "Permit-ready documentation": {
    icon: FolderOpen,
    detail: "Coordinated reports and forms for building permit submission.",
  },
};

export function HomeDeliverables() {
  return (
    <section
      className="border-b border-border bg-muted/35 py-10 sm:py-12"
      aria-labelledby="deliverables-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="deliverables-heading" className="text-xl font-bold text-charcoal sm:text-2xl">
              Inside your permit package
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              A coordinated set of deliverables from one modelled project — not disconnected files.
              Sample municipal forms are not shown here; your package is prepared from your project
              data.
            </p>
          </div>
          <p className="text-xs font-semibold tracking-wide text-electric uppercase">
            See what is included
          </p>
        </div>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DELIVERABLES.map((item) => {
            const meta = deliverableDetails[item] ?? {
              icon: FileCheck2,
              detail: item,
            };
            const Icon = meta.icon;
            return (
              <li
                key={item}
                className="flex gap-3 rounded-xl border border-border bg-white p-4"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-electric" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-charcoal">{item}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{meta.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
