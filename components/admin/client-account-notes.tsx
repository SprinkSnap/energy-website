"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { updateClientStaffNotes } from "@/lib/supabase/admin";

export function ClientAccountNotes({
  clientId,
  initialNotes,
  canEdit,
}: {
  clientId: string;
  initialNotes?: string;
  canEdit: boolean;
}) {
  const { isOwner } = useAuth();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setNotes(initialNotes ?? "");
    setDirty(false);
  }, [initialNotes]);

  const save = async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    try {
      await updateClientStaffNotes(supabase, clientId, notes);
      setDirty(false);
      toast.success("Account notes saved.");
    } catch {
      toast.error("Could not save account notes.");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit || !isOwner) {
    return (
      <section className="surface-card p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-charcoal">Account description</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground whitespace-pre-wrap">
          {notes || "No internal notes yet. Owners can add a description of this client account."}
        </p>
      </section>
    );
  }

  return (
    <section className="surface-card p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-charcoal">Account description</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Internal notes for owners only — not visible to the client.
      </p>
      <textarea
        className="mt-4 min-h-[120px] w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6 text-charcoal outline-none focus-visible:ring-2 focus-visible:ring-electric/40"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setDirty(true);
        }}
        placeholder="Builder relationship, billing preferences, project history, special instructions…"
      />
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="brand"
          className="min-h-10 w-full sm:w-auto"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save account description"}
        </Button>
      </div>
    </section>
  );
}
