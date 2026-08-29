"use client";

import { use } from "react";
import { InvoiceDocument } from "@/components/portal/invoice-document";
import { LinkButton } from "@/components/ui/link-button";
import { useProjects } from "@/lib/project-context";

export default function DepositInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject } = useProjects();
  const project = getProject(id);
  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-electric uppercase">Invoice</p>
      <h1 className="mt-2 text-2xl font-bold text-charcoal sm:text-3xl">50% deposit invoice</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Review the deposit invoice for {project.info.modelName || project.id}, then pay online to
        start modelling.
      </p>

      <div className="mt-6">
        <InvoiceDocument project={project} kind="deposit" />
      </div>

      <LinkButton
        className="mt-6 min-h-11 w-full justify-center sm:w-auto"
        href={`/portal/projects/${project.id}/deposit`}
        variant="brand"
        size="lg"
      >
        Pay 50% deposit
      </LinkButton>
    </div>
  );
}
