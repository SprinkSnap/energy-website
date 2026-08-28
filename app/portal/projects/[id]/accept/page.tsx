"use client";

import { use } from "react";
import { CheckCircle2 } from "lucide-react";
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
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <CheckCircle2 className="mx-auto size-12 text-brand-green" />
      <h1 className="mt-4 text-3xl font-bold text-charcoal">Proposal accepted</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        A 50% deposit of {cad(project.pricing.deposit)} starts modelling. Documents remain locked until the project is paid in full.
      </p>
      <LinkButton href={`/portal/projects/${project.id}/deposit`} variant="brand" size="lg" className="mt-8">
        Pay 50% Deposit
      </LinkButton>
    </div>
  );
}
