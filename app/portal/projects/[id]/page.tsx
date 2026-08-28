"use client";

import Link from "next/link";
import { use } from "react";
import { useProjects } from "@/lib/project-context";
import { PaymentBadge, StatusBadge } from "@/components/portal/status-badge";
import { LinkButton } from "@/components/ui/link-button";
import { serviceLabel } from "@/lib/format";
import type { Project } from "@/lib/types";

function nextAction(project: Project) {
  if (project.status === "draft") {
    return { href: `/portal/projects/${project.id}/wizard`, label: "Continue wizard" };
  }
  if (project.status === "submitted" || project.status === "proposal") {
    return { href: `/portal/projects/${project.id}/proposal`, label: "View proposal" };
  }
  if (project.status === "kickoff-call" || project.status === "optimization" || project.status === "options-review" || project.status === "client-selection") {
    return { href: `/portal/projects/${project.id}/optimization`, label: "View optimization flow" };
  }
  if (project.status === "project-review") {
    return { href: `/portal/projects/${project.id}/wwr`, label: "View WWR review" };
  }
  if (project.status === "awaiting-deposit") {
    return { href: `/portal/projects/${project.id}/deposit`, label: "Pay 50% Deposit" };
  }
  if (project.status === "in-progress") {
    return { href: `/portal/projects/${project.id}/progress`, label: "View progress" };
  }
  if (project.status === "final-payment-required") {
    return { href: `/portal/projects/${project.id}/final-payment`, label: "Pay Final 50%" };
  }
  if (project.status === "complete") {
    return { href: `/portal/projects/${project.id}/documents`, label: "Download EEDS" };
  }
  return { href: `/portal/projects/${project.id}/proposal`, label: "Open project" };
}

export default function ProjectHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject, ready } = useProjects();
  const project = getProject(id);

  if (!ready) {
    return <p className="p-8 text-sm text-muted-foreground">Loading project…</p>;
  }

  if (!project) {
    return <p className="p-8 text-sm text-muted-foreground">Project not found.</p>;
  }

  const action = nextAction(project);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm text-muted-foreground">
        <Link href="/portal" className="hover:underline">
          My Projects
        </Link>{" "}
        / {project.id}
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-charcoal">{project.info.modelName || project.id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{serviceLabel(project)}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={project.status} />
          <PaymentBadge payment={project.payment} />
        </div>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <LinkButton href={action.href} variant="brand" className="justify-center">
          {action.label}
        </LinkButton>
        <LinkButton href={`/portal/projects/${project.id}/documents`} variant="outline" className="justify-center">
          Documents
        </LinkButton>
        {project.route === "custom-optimization" ? (
          <LinkButton href={`/portal/projects/${project.id}/optimization`} variant="outline" className="justify-center">
            Optimization timeline
          </LinkButton>
        ) : null}
        {project.route === "over-22-wwr" ? (
          <LinkButton href={`/portal/projects/${project.id}/wwr`} variant="outline" className="justify-center">
            Over 22% WWR flow
          </LinkButton>
        ) : null}
        {project.status === "draft" ? null : (
          <LinkButton href={`/portal/projects/${project.id}/wizard`} variant="ghost" className="justify-center">
            View submitted details
          </LinkButton>
        )}
      </div>
    </div>
  );
}
