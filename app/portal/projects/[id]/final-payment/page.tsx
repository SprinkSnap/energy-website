"use client";

import { use } from "react";
import { PaymentForm } from "@/components/portal/payment-form";
import { useProjects } from "@/lib/project-context";
import { cad } from "@/lib/format";

export default function FinalPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject, updateProject } = useProjects();
  const project = getProject(id);
  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  return (
    <PaymentForm
      title="Pay Final 50%"
      amountLabel={cad(project.pricing.final)}
      successHref={`/portal/projects/${project.id}/documents`}
      successMessage="Payment successful. Paid in full. Documents unlocked."
      onSuccess={() => {
        updateProject(project.id, {
          payment: "paid-in-full",
          status: "complete",
        });
      }}
    />
  );
}
