"use client";

import Link from "next/link";
import { use } from "react";
import { ArrowRight } from "lucide-react";
import { StaffModeBanner } from "@/components/admin/staff-mode-banner";
import { PricingBreakdown } from "@/components/portal/pricing-breakdown";
import { PaymentBadge, StatusBadge } from "@/components/portal/status-badge";
import { LinkButton } from "@/components/ui/link-button";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-context";
import { ProjectScopeProvider } from "@/lib/project-scope";
import { cad, serviceLabel } from "@/lib/format";
import { projectNextAction } from "@/lib/project-actions";

function AdminProjectContent({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) {
  const { user } = useAuth();
  const { getProject, ready } = useProjects();
  const project = getProject(projectId);

  if (!ready) {
    return <p className="p-8 text-sm text-muted-foreground">Loading project…</p>;
  }

  if (!project) {
    return <p className="p-8 text-sm text-muted-foreground">Project not found.</p>;
  }

  const action = projectNextAction(project);

  return (
    <>
      {user ? <StaffModeBanner role={user.role} clientName={project.info.builder || "Client"} /> : null}
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        <p className="text-sm text-muted-foreground">
          <Link href="/portal/admin" className="hover:underline">
            Client accounts
          </Link>{" "}
          /{" "}
          <Link href={`/portal/admin/clients/${userId}`} className="hover:underline">
            Account
          </Link>{" "}
          / {project.id}
        </p>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-charcoal sm:text-3xl">
              {project.info.modelName || project.id}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{serviceLabel(project)}</p>
            <p className="mt-2 text-sm font-semibold text-charcoal">
              {cad(project.pricing.total)} total · {cad(project.pricing.deposit)} deposit
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={project.status} />
            <PaymentBadge payment={project.payment} />
          </div>
        </div>

        <section className="surface-card mt-6 p-5 sm:p-6">
          <p className="text-xs font-semibold tracking-[0.16em] text-electric uppercase">
            Client status
          </p>
          <h2 className="mt-2 text-lg font-semibold text-charcoal">{action.label}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.help}</p>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-charcoal">Route pricing</h2>
          <PricingBreakdown pricing={project.pricing} className="mt-3" />
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <LinkButton
            href={`/portal/admin/clients/${userId}/projects/${project.id}/wizard`}
            variant="brand"
            className="min-h-11 justify-center"
          >
            Edit project wizard
            <ArrowRight className="size-4" />
          </LinkButton>
          <LinkButton
            href={`/portal/admin/clients/${userId}`}
            variant="outline"
            className="min-h-11 justify-center"
          >
            Back to account
          </LinkButton>
        </div>
      </div>
    </>
  );
}

export default function AdminProjectPage({
  params,
}: {
  params: Promise<{ userId: string; projectId: string }>;
}) {
  const { userId, projectId } = use(params);

  return (
    <ProjectScopeProvider clientUserId={userId}>
      <AdminProjectContent userId={userId} projectId={projectId} />
    </ProjectScopeProvider>
  );
}
