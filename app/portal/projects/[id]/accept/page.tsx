"use client";

import { use } from "react";
import { CheckCircle2 } from "lucide-react";
import { InvoiceDocument } from "@/components/portal/invoice-document";
import { LinkButton } from "@/components/ui/link-button";
import { useProjects } from "@/lib/project-context";
import { cad } from "@/lib/format";

export default function AcceptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject } = useProjects();
  const project = getProject(id);
  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-brand-green" />
        <h1 className="mt-4 text-2xl font-bold text-charcoal sm:text-3xl">Proposal accepted</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Pay a 50% deposit of {cad(project.pricing.deposit)} to start modelling.
          The remaining 50% is due when documents are ready. Files stay locked
          until then.
        </p>
      </div>

      <div className="mt-8">
        <InvoiceDocument project={project} kind="deposit" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <LinkButton
          href={`/portal/projects/${project.id}/deposit`}
          variant="brand"
          size="lg"
          className="min-h-11 w-full justify-center sm:w-auto"
        >
          Pay 50% deposit
        </LinkButton>
        <LinkButton
          href={`/portal/projects/${project.id}/deposit-invoice`}
          variant="outline"
          size="lg"
          className="min-h-11 w-full justify-center sm:w-auto"
        >
          View deposit invoice
        </LinkButton>
      </div>
    </div>
  );
}
