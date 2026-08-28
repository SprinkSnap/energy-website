"use client";

import { use } from "react";
import { Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge, PaymentBadge } from "@/components/portal/status-badge";
import { LogoWatermark } from "@/components/brand/watermark";
import { useProjects } from "@/lib/project-context";
import { toast } from "sonner";

const documents = [
  { id: "eeds", label: "EEDS — Energy Efficiency Design Summary" },
  { id: "proposed", label: "Proposed HOT2000 Report" },
  { id: "reference", label: "Code / Reference HOT2000 Report" },
  { id: "permit", label: "Complete Permit Package" },
];

export default function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject } = useProjects();
  const project = getProject(id);
  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  const unlocked = project.payment === "paid-in-full" && project.status === "complete";

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <LogoWatermark opacity={0.05} />
      <div className="relative">
        <h1 className="text-3xl font-bold text-charcoal">Final document portal</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge status={project.status} />
          <PaymentBadge payment={project.payment} />
        </div>
        {!unlocked ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Your completed project documents are ready. Complete the final payment to unlock your downloads.
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Project status: COMPLETE · Payment status: PAID IN FULL
          </p>
        )}
        <ul className="mt-6 grid gap-3">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                {unlocked ? (
                  <Download className="size-5 text-electric" />
                ) : (
                  <Lock className="size-5 text-muted-foreground" />
                )}
                <span className="font-medium text-charcoal">{doc.label}</span>
              </div>
              {unlocked ? (
                <Button
                  variant="brand"
                  onClick={() => {
                    // Placeholder download. Replace with signed URLs from storage.
                    toast.success(`${doc.label} queued for download (placeholder).`);
                  }}
                >
                  {doc.id === "eeds" ? "Download EEDS" : "Download"}
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Locked
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!unlocked ? (
          <LinkButton className="mt-6" href={`/portal/projects/${project.id}/final-payment`} variant="brand">
            Pay Final 50%
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}
