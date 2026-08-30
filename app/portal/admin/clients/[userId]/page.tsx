"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { use } from "react";
import { ArrowRight, FolderKanban } from "lucide-react";
import { ClientAccountNotes } from "@/components/admin/client-account-notes";
import { StaffModeBanner } from "@/components/admin/staff-mode-banner";
import { PaymentBadge, StatusBadge } from "@/components/portal/status-badge";
import { LinkButton } from "@/components/ui/link-button";
import { useAuth } from "@/lib/auth-context";
import { cad, serviceLabel } from "@/lib/format";
import { ProjectScopeProvider } from "@/lib/project-scope";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchClientAccount } from "@/lib/supabase/admin";
import { fetchProjectsForUser } from "@/lib/supabase/projects";
import { calculatePricing, professionalFeeForRoute } from "@/lib/pricing";
import type { ClientAccount, Project } from "@/lib/types";

function withPricing(project: Project): Project {
  const fee = professionalFeeForRoute(project.route, project.over22Path);
  return { ...project, pricing: calculatePricing(fee) };
}

export default function AdminClientPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const { user, isOwner } = useAuth();
  const [client, setClient] = useState<ClientAccount | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const account = await fetchClientAccount(supabase, userId);
    const rows = await fetchProjectsForUser(supabase, userId);
    setClient(account);
    setProjects(rows.map(withPricing));
  };

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading client account…</p>;
  }

  if (!client) {
    return <p className="p-8 text-sm text-muted-foreground">Client account not found.</p>;
  }

  return (
    <ProjectScopeProvider clientUserId={userId}>
      {user ? <StaffModeBanner role={user.role} clientName={client.name} /> : null}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">
          <Link href="/portal/admin" className="hover:underline">
            Client accounts
          </Link>{" "}
          / {client.name}
        </p>

        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-charcoal sm:text-3xl">{client.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{client.email}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Company</dt>
                <dd className="mt-0.5 text-charcoal">{client.company || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Phone</dt>
                <dd className="mt-0.5 text-charcoal">{client.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Projects</dt>
                <dd className="mt-0.5 text-charcoal">{projects.length}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ClientAccountNotes
            clientId={client.id}
            initialNotes={client.staffNotes}
            canEdit={isOwner}
          />

          <section className="surface-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-charcoal">Projects</h2>
              <FolderKanban className="size-5 text-electric" aria-hidden />
            </div>
            {projects.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No projects yet for this client.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {projects.map((project) => (
                  <li key={project.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-charcoal">{project.id}</p>
                      <p className="text-sm text-muted-foreground">
                        {project.info.modelName || "Untitled"} · {serviceLabel(project)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-charcoal">
                        {cad(project.pricing.total)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusBadge status={project.status} />
                        <PaymentBadge payment={project.payment} />
                      </div>
                    </div>
                    <LinkButton
                      href={`/portal/admin/clients/${userId}/projects/${project.id}`}
                      variant="brand"
                      className="min-h-10 w-full justify-center sm:w-auto"
                    >
                      Open project
                      <ArrowRight className="size-4" />
                    </LinkButton>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </ProjectScopeProvider>
  );
}
