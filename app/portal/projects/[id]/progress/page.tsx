"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge, PaymentBadge } from "@/components/portal/status-badge";
import { useProjects } from "@/lib/project-context";
import { routeTimeline, STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject, updateProject } = useProjects();
  const router = useRouter();
  const project = getProject(id);
  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  const timeline = routeTimeline(project.route);
  const current = timeline.indexOf(project.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-charcoal">Project in progress</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {project.id} · Energy Compliant Design is completing takeoff, HOT2000 modelling, and the EEDS package.
      </p>
      <div className="mt-4 flex gap-2">
        <StatusBadge status={project.status} />
        <PaymentBadge payment={project.payment} />
      </div>
      <ol className="mt-8 grid gap-2">
        {timeline.map((status, i) => (
          <li
            key={status}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
              i < current && "border-brand-green/30 bg-brand-green-soft",
              i === current && "border-electric bg-electric-soft",
              i > current && "border-border bg-white",
            )}
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-white text-xs font-semibold">
              {i + 1}
            </span>
            {STATUS_LABEL[status]}
          </li>
        ))}
      </ol>
      {project.status === "in-progress" ? (
        <Button
          className="mt-8"
          variant="brand"
          onClick={() => {
            updateProject(project.id, { status: "final-payment-required" });
            router.push(`/portal/projects/${project.id}/invoice`);
          }}
        >
          Modelling complete — issue final invoice
        </Button>
      ) : null}
      {project.status === "final-payment-required" ? (
        <LinkButton className="mt-8" href={`/portal/projects/${project.id}/invoice`} variant="brand">
          View final invoice
        </LinkButton>
      ) : null}
    </div>
  );
}
