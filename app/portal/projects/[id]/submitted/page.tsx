"use client";

import Link from "next/link";
import { use } from "react";
import { CheckCircle2 } from "lucide-react";
import { LogoWatermark } from "@/components/brand/watermark";
import { LinkButton } from "@/components/ui/link-button";
import { useProjects } from "@/lib/project-context";
import { nextStatusAfterSubmit, serviceLabel } from "@/lib/format";

export default function SubmittedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject } = useProjects();
  const project = getProject(id);
  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  const next = nextStatusAfterSubmit(project.route);

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <LogoWatermark opacity={0.08} blend="screen" />
      <div className="relative rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-12 text-brand-green" />
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-electric uppercase">
          Project submitted
        </p>
        <h1 className="mt-2 text-3xl font-bold text-charcoal">Energy Compliant Design Review</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {project.id} · {project.info.modelName || "Untitled"} · {serviceLabel(project)}
        </p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Your file is in review. Next status: <strong>{next.replaceAll("-", " ")}</strong>.
          You will receive a proposal when the review is complete. In this demo, the proposal is available immediately.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href={`/portal/projects/${project.id}/proposal`} variant="brand">
            View proposal
          </LinkButton>
          <LinkButton href="/portal" variant="outline">
            Back to dashboard
          </LinkButton>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          <Link className="hover:underline" href={`/portal/projects/${project.id}`}>
            Project hub
          </Link>
        </p>
      </div>
    </div>
  );
}
