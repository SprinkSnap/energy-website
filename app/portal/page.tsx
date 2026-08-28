"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { PaymentBadge, StatusBadge } from "@/components/portal/status-badge";
import { useProjects } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { serviceLabel } from "@/lib/format";
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
          <p className="text-sm text-muted-foreground">Welcome back{user?.name ? `, ${user.name}` : ""}</p>
          <h1 className="text-3xl font-bold text-charcoal">My Projects</h1>
        </div>
        <Button variant="brand" size="lg" onClick={startProject}>
          <Plus className="size-4" />
          Create New Project
        </Button>
      </div>

      <div className="relative mt-8">
        {!ready ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center">
            <h2 className="text-lg font-semibold text-charcoal">No projects yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start an SB-12 energy compliance package from architectural drawings.
            </p>
            <Button className="mt-6" variant="brand" onClick={startProject}>
              + Create New Project
            </Button>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-border bg-white shadow-sm md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Project ID</th>
                    <th className="px-4 py-3 font-semibold">Model</th>
                    <th className="px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Payment</th>
                    <th className="px-4 py-3 font-semibold">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id} className="border-t border-border hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium text-charcoal">{project.id}</td>
                      <td className="px-4 py-3">{project.info.modelName || "—"}</td>
                      <td className="px-4 py-3">{serviceLabel(project)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={project.status} />
                      </td>
                      <td className="px-4 py-3">
                        <PaymentBadge payment={project.payment} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          className="font-medium text-electric hover:underline"
                          href={`/portal/projects/${project.id}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/portal/projects/${project.id}`}
                  className="rounded-2xl border border-border bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-charcoal">{project.id}</p>
                      <p className="text-sm text-muted-foreground">{project.info.modelName || "Untitled model"}</p>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Service</dt>
                      <dd>{serviceLabel(project)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Payment</dt>
                      <dd>
                        <PaymentBadge payment={project.payment} />
                      </dd>
                    </div>
                  </dl>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
      <p className="relative mt-6 text-xs text-muted-foreground md:hidden">
        <LinkButton href="/portal/projects/new" variant="brand" className="w-full justify-center">
          + Create New Project
        </LinkButton>
      </p>
    </div>
  );
}
