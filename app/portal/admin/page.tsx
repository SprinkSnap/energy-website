"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchClientAccounts } from "@/lib/supabase/admin";
import type { ClientAccount } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/roles";
import { LinkButton } from "@/components/ui/link-button";

export default function AdminClientsPage() {
  const { user, isOwner } = useAuth();
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const load = async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }
      try {
        const rows = await fetchClientAccounts(supabase);
        setClients(rows);
      } catch {
        setError("Could not load client accounts. Check your staff role in Supabase.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {user?.name} · {ROLE_LABEL[user?.role ?? "employee"]}
          </p>
          <h1 className="text-2xl font-bold text-charcoal sm:text-3xl">Client accounts</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            View client profiles, open their projects, and update project details. Owners can add
            an internal account description.
          </p>
        </div>
        <LinkButton href="/portal" variant="outline" className="min-h-11 w-full sm:w-auto">
          My dashboard
        </LinkButton>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading clients…</p>
      ) : error ? (
        <p className="mt-8 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : clients.length === 0 ? (
        <div className="surface-card mt-8 p-8 text-center sm:p-10">
          <Users className="mx-auto size-10 text-electric" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold text-charcoal">No client accounts yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Client accounts appear here after users register with role{" "}
            <code className="text-xs">client</code> in Supabase.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 hidden overflow-hidden rounded-2xl border border-border bg-white shadow-sm lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Projects</th>
                  {isOwner ? (
                    <th className="px-4 py-3 font-semibold">Account notes</th>
                  ) : null}
                  <th className="px-4 py-3 font-semibold">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-charcoal">{client.name}</p>
                      <p className="text-xs text-muted-foreground">{client.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {client.company || "—"}
                    </td>
                    <td className="px-4 py-3">{client.projectCount}</td>
                    {isOwner ? (
                      <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                        <span className="line-clamp-2">{client.staffNotes || "—"}</span>
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/portal/admin/clients/${client.id}`}
                        className="font-semibold text-electric hover:underline"
                      >
                        Open account
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:hidden">
            {clients.map((client) => (
              <article key={client.id} className="surface-card flex flex-col p-4 sm:p-5">
                <p className="font-semibold text-charcoal">{client.name}</p>
                <p className="text-sm text-muted-foreground">{client.email}</p>
                {client.company ? (
                  <p className="mt-1 text-sm text-charcoal">{client.company}</p>
                ) : null}
                <p className="mt-3 text-sm">
                  <span className="font-medium">{client.projectCount}</span>{" "}
                  <span className="text-muted-foreground">projects</span>
                </p>
                {isOwner && client.staffNotes ? (
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {client.staffNotes}
                  </p>
                ) : null}
                <LinkButton
                  href={`/portal/admin/clients/${client.id}`}
                  variant="brand"
                  className="mt-4 min-h-11 w-full justify-center"
                >
                  Open account
                </LinkButton>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
