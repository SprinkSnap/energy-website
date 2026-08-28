"use client";

import Link from "next/link";
import { use } from "react";
import { ArrowRight } from "lucide-react";
import { useProjects } from "@/lib/project-context";
import { PaymentBadge, StatusBadge } from "@/components/portal/status-badge";
import { LinkButton } from "@/components/ui/link-button";
import { serviceLabel } from "@/lib/format";
import { projectNextAction } from "@/lib/project-actions";

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

  const action = projectNextAction(project);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm text-muted-foreground">
        <Link href="/portal" className="hover:underline">
          My Projects
        </Link>{" "}
        / {project.id}
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-charcoal">
            {project.info.modelName || project.id}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{serviceLabel(project)}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={project.status} />
          <PaymentBadge payment={project.payment} />
        </div>
      </div>

      <section className="surface-card mt-8 p-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-electric uppercase">
          What to do next
        </p>
        <h2 className="mt-2 text-xl font-semibold text-charcoal">{action.label}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.help}</p>
        <LinkButton href={action.href} variant="brand" className="mt-5">
          {action.label}
          <ArrowRight className="size-4" />
        </LinkButton>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <LinkButton
          href={`/portal/projects/${project.id}/documents`}
          variant="outline"
          className="justify-center"
        >
          Documents
        </LinkButton>
        {project.route === "custom-optimization" ? (
          <LinkButton
            href={`/portal/projects/${project.id}/optimization`}
            variant="outline"
            className="justify-center"
          >
            Optimization timeline
          </LinkButton>
        ) : null}
        {project.route === "over-22-wwr" ? (
          <LinkButton
            href={`/portal/projects/${project.id}/wwr`}
            variant="outline"
            className="justify-center"
          >
            Over 22% WWR flow
          </LinkButton>
        ) : null}
        {project.status === "draft" ? null : (
          <LinkButton
            href={`/portal/projects/${project.id}/wizard`}
            variant="ghost"
            className="justify-center"
          >
            View submitted details
          </LinkButton>
        )}
      </div>
    </div>
  );
}
