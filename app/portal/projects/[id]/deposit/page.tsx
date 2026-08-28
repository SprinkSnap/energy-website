"use client";

import { use } from "react";
import { PaymentForm } from "@/components/portal/payment-form";
import { useProjects } from "@/lib/project-context";
import { cad } from "@/lib/format";

export default function DepositPage({
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
      title="Pay 50% Deposit"
      amountLabel={cad(project.pricing.deposit)}
      successHref={`/portal/projects/${project.id}/progress`}
      successMessage="Payment successful. Your project is now In Progress."
      onSuccess={() => {
        updateProject(project.id, {
          payment: "deposit-paid",
          status: "in-progress",
        });
      }}
    />
  );
}
