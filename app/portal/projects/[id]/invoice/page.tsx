"use client";

import { use } from "react";
import { LinkButton } from "@/components/ui/link-button";
import { useProjects } from "@/lib/project-context";
import { cad } from "@/lib/format";

export default function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject } = useProjects();
  const project = getProject(id);
  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-bold text-charcoal">Final 50% invoice</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Modelling is complete. Pay the remaining {cad(project.pricing.final)} to unlock permit documents.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-white p-5 text-sm shadow-sm">
        <div className="flex justify-between py-2">
          <span>Professional fee</span>
          <span>{cad(project.pricing.professionalFee)}</span>
        </div>
        <div className="flex justify-between py-2">
          <span>Deposit paid</span>
          <span>-{cad(project.pricing.deposit)}</span>
        </div>
        <div className="flex justify-between border-t border-border py-3 font-semibold">
          <span>Balance due</span>
          <span>{cad(project.pricing.final)}</span>
        </div>
      </div>
      <LinkButton className="mt-6" href={`/portal/projects/${project.id}/final-payment`} variant="brand" size="lg">
        Pay Final 50%
      </LinkButton>
    </div>
  );
}
