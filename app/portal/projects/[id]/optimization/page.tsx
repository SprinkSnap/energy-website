"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/wizard/fields";
import { useProjects } from "@/lib/project-context";
import { cn } from "@/lib/utils";

const steps = [
  "Project Submitted",
  "Kickoff Call",
  "Project Review",
  "Building Takeoff",
  "Preliminary HOT2000 Energy Modelling",
  "Optimization",
  "Develop Options",
  "Options Review Call",
  "Client Selects Preferred Solution",
  "Confirm Selected Solution",
  "Project Proposal",
  "Accept Proposal",
  "Pay 50% Deposit",
  "Project In Progress",
];

const options = [
  { id: "A" as const, title: "Option A — DWHR-Based Solution" },
  { id: "B" as const, title: "Option B — Optimized Without DWHR" },
  { id: "C" as const, title: "Option C — Alternative Optimized Solution" },
];

export default function OptimizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject, updateProject } = useProjects();
  const router = useRouter();
  const project = getProject(id);
  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-charcoal">Custom / Optimization flow</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Route 2 includes a kickoff call, Energy Compliant Design review, optimization, and an options review call before you select a preferred solution.
      </p>
      <ol className="mt-8 grid gap-2">
        {steps.map((step, i) => (
          <li
            key={step}
            className={cn(
              "rounded-xl border border-border bg-white px-4 py-3 text-sm",
              step === "Develop Options" && "bg-electric-soft border-electric/30",
            )}
          >
            <span className="mr-2 font-semibold text-electric">{i + 1}.</span>
            {step}
            {step === "Develop Options" ? (
              <div className="mt-3 grid gap-2">
                {options.map((option) => (
                  <ChoiceRow
                    key={option.id}
                    type="radio"
                    name="option"
                    value={option.id}
                    checked={project.selectedOption === option.id}
                    onChange={() => updateProject(project.id, { selectedOption: option.id })}
                  >
                    {option.title}
                  </ChoiceRow>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <Button
        className="mt-8"
        variant="brand"
        disabled={!project.selectedOption}
        onClick={() => {
          updateProject(project.id, { status: "proposal", selectedOption: project.selectedOption });
          router.push(`/portal/projects/${project.id}/proposal`);
        }}
      >
        Confirm selected solution
      </Button>
    </div>
  );
}
