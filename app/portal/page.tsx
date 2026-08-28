"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { PaymentBadge, StatusBadge } from "@/components/portal/status-badge";
import { useProjects } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { serviceLabel } from "@/lib/format";
import { projectNextAction } from "@/lib/project-actions";
import { LogoWatermark } from "@/components/brand/watermark";

export default function PortalDashboardPage() {
  const { user } = useAuth();
  const { projects, ready, createProject } = useProjects();
  const router = useRouter();

  const startProject = () => {
    const project = createProject();
    router.push(`/portal/projects/${project.id}/wizard`);
  };

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <LogoWatermark opacity={0.04} blend="normal" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </p>
          <h1 className="text-3xl font-bold text-charcoal">My Projects</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Each row shows what to do next. You do not need to know HOT2000 to
            move a file forward.
          </p>
        </div>
        <Button variant="brand" size="lg" onClick={startProject}>
          <Plus className="size-4" />
          Start a new project
        </Button>
      </div>

      <div className="relative mt-8">
        {!ready ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <FolderPlus className="mx-auto size-10 text-electric" aria-hidden />
            <h2 className="mt-4 text-lg font-semibold text-charcoal">
              Start your first SB-12 package
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Create a project, answer a short wizard, and upload drawings. We
              handle takeoff, modelling, and the permit documents.
            </p>
            <ul className="mx-auto mt-5 max-w-sm text-left text-sm text-muted-foreground">
              <li>1. Choose a route (known specs, optimization, or over 22% glass)</li>
              <li>2. Confirm the house and upload PDFs</li>
              <li>3. Accept the proposal and pay the deposit</li>
            </ul>
            <Button className="mt-6" variant="brand" onClick={startProject}>
              Start a new project
            </Button>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(11,18,32,0.04),0_12px_32px_rgba(11,18,32,0.05)] md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Project</th>
                    <th className="px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">What to do next</th>
                    <th className="px-4 py-3 font-semibold">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const next = projectNextAction(project);
                    return (
                      <tr key={project.id} className="border-t border-border hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <p className="font-medium text-charcoal">{project.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {project.info.modelName || "Untitled model"}
                          </p>
                        </td>
                        <td className="px-4 py-3">{serviceLabel(project)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={project.status} />
                            <PaymentBadge payment={project.payment} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-charcoal">{next.label}</p>
                          <p className="mt-0.5 max-w-xs text-xs leading-5 text-muted-foreground">
                            {next.help}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            className="font-semibold text-electric hover:underline"
                            href={next.href}
                          >
                            {next.label}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {projects.map((project) => {
                const next = projectNextAction(project);
                return (
                  <Link
                    key={project.id}
                    href={next.href}
                    className="surface-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-charcoal">{project.id}</p>
                        <p className="text-sm text-muted-foreground">
                          {project.info.modelName || "Untitled model"}
                        </p>
                      </div>
                      <StatusBadge status={project.status} />
                    </div>
                    <p className="mt-3 text-sm font-medium text-electric">{next.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{next.help}</p>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
      <p className="relative mt-6 md:hidden">
        <LinkButton href="/portal/projects/new" variant="brand" className="w-full justify-center">
          Start a new project
        </LinkButton>
      </p>
    </div>
  );
}
