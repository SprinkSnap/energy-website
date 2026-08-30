"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { DeleteProjectButton } from "@/components/portal/delete-project-button";
import { PaymentBadge, StatusBadge } from "@/components/portal/status-badge";
import { useProjects } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { cad, serviceLabel } from "@/lib/format";
import { projectNextAction } from "@/lib/project-actions";
import { LogoWatermark } from "@/components/brand/watermark";

export default function PortalDashboardPage() {
  const { user } = useAuth();
  const { projects, ready, createProject } = useProjects();
  const router = useRouter();

  const startProject = async () => {
    const project = await createProject();
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
            Create an account to add projects. Each route has a fixed fee before
            deposit. You can delete a project any time before the first 50%
            deposit is paid.
          </p>
        </div>
        <Button variant="brand" size="lg" className="min-h-11 w-full sm:w-auto" onClick={startProject}>
          <Plus className="size-4" />
          Start a new project
        </Button>
      </div>

      <div className="relative mt-8">
        {!ready ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="surface-card p-8 text-center sm:p-10">
            <FolderPlus className="mx-auto size-10 text-electric" aria-hidden />
            <h2 className="mt-4 text-lg font-semibold text-charcoal">
              Start your first SB-12 package
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Create a project, choose a route with fixed pricing, answer a short
              wizard, and upload drawings. We handle takeoff, modelling, and the
              permit documents.
            </p>
            <ul className="mx-auto mt-5 max-w-sm text-left text-sm text-muted-foreground">
              <li>1. Choose a route — Route 1 from $1,480, Route 2 from $1,860, Route 3 from $1,720</li>
              <li>2. Confirm the house and upload PDFs</li>
              <li>3. Review the proposal, pay the 50% deposit invoice</li>
            </ul>
            <Button className="mt-6 min-h-11" variant="brand" onClick={startProject}>
              Start a new project
            </Button>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(11,18,32,0.04),0_12px_32px_rgba(11,18,32,0.05)] lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Project</th>
                    <th className="px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Quote</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">What to do next</th>
                    <th className="px-4 py-3 font-semibold">
                      <span className="sr-only">Actions</span>
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
                          <p className="font-medium text-charcoal">{cad(project.pricing.total)}</p>
                          <p className="text-xs text-muted-foreground">
                            {cad(project.pricing.deposit)} deposit
                          </p>
                        </td>
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
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-end gap-2">
                            <Link
                              className="font-semibold text-electric hover:underline"
                              href={next.href}
                            >
                              {next.label}
                            </Link>
                            <DeleteProjectButton
                              project={project}
                              redirectTo="/portal"
                              variant="ghost"
                              className="h-8 px-2 text-xs text-muted-foreground"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:hidden">
              {projects.map((project) => {
                const next = projectNextAction(project);
                return (
                  <article key={project.id} className="surface-card flex flex-col p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-charcoal">{project.id}</p>
                        <p className="text-sm text-muted-foreground">
                          {project.info.modelName || "Untitled model"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{serviceLabel(project)}</p>
                      </div>
                      <StatusBadge status={project.status} />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-charcoal">
                      {cad(project.pricing.total)}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {cad(project.pricing.deposit)} deposit
                      </span>
                    </p>
                    <p className="mt-3 text-sm font-medium text-electric">{next.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{next.help}</p>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <LinkButton href={next.href} variant="brand" className="flex-1 justify-center">
                        {next.label}
                      </LinkButton>
                      <DeleteProjectButton
                        project={project}
                        redirectTo="/portal"
                        variant="outline"
                        className="flex-1 justify-center"
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
      <p className="relative mt-6 lg:hidden">
        <LinkButton href="/portal/projects/new" variant="brand" className="w-full justify-center min-h-11">
          Start a new project
        </LinkButton>
      </p>
    </div>
  );
}
