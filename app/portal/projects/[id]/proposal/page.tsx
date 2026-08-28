"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ChoiceRow } from "@/components/wizard/fields";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/lib/project-context";
import { cad } from "@/lib/format";

const included = [
  "Building takeoff",
  "Building geometry calculations",
  "HOT2000 energy modelling",
  "SB-12 compliance analysis",
  "Required optimization",
  "Proposed HOT2000 model",
  "Code/reference HOT2000 model",
  "EEDS preparation",
  "HOT2000 reports",
  "Final permit package",
];

export default function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject, updateProject } = useProjects();
  const router = useRouter();
  const project = getProject(id);
  const [accepted, setAccepted] = useState(project?.proposalAccepted ?? false);

  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  const accept = () => {
    if (!accepted) {
      toast.error("Please accept the proposal terms.");
      return;
    }
    updateProject(project.id, {
      proposalAccepted: true,
      status: "awaiting-deposit",
      payment: "unpaid",
    });
    toast.success("Proposal accepted.");
    router.push(`/portal/projects/${project.id}/accept`);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-electric uppercase">Project proposal</p>
      <h1 className="mt-2 text-3xl font-bold text-charcoal">SB-12 Energy Compliance Package</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {project.id} · {project.info.modelName || "Untitled model"}. Review the
        fee, accept the terms, then pay the 50% deposit to start modelling.
      </p>
      <section className="mt-8 rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-charcoal">Services may include</h2>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {included.map((item) => (
            <li key={item} className="rounded-lg bg-muted px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Professional Fee", cad(project.pricing.professionalFee)],
              ["HST (13%)", cad(project.pricing.hst)],
              ["Project Total", cad(project.pricing.total)],
              ["50% Deposit", cad(project.pricing.deposit)],
              ["Final 50%", cad(project.pricing.final)],
            ].map(([label, value], i) => (
              <tr key={label} className={i === 2 ? "bg-muted/60 font-semibold" : "border-t border-border"}>
                <td className="px-4 py-3">{label}</td>
                <td className="px-4 py-3 text-right">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="mt-6">
        <ChoiceRow name="accept" checked={accepted} onChange={() => setAccepted(!accepted)}>
          I accept this proposal for the SB-12 Energy Compliance Package, including the fees and 50% deposit terms shown above.
        </ChoiceRow>
      </div>
      <Button className="mt-6" variant="brand" size="lg" onClick={accept}>
        Accept Proposal
      </Button>
    </div>
  );
}
