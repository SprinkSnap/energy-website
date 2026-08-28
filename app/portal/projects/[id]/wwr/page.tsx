"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/lib/project-context";

const path1 = [
  "Project submitted",
  "Confirm specifications and drawings",
  "Building takeoff and WWR verification",
  "Performance-path HOT2000 modelling",
  "Proposal",
  "50% deposit",
  "In progress",
];

const path2 = [
  "Project submitted",
  "Energy Compliant Design review",
  "Identify envelope and mechanical options",
  "Optimization for >22% WWR",
  "Client confirmation",
  "Proposal",
  "50% deposit",
  "In progress",
];

function Flow({ title, steps }: { title: string; steps: string[] }) {
  return (
    <article className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-charcoal">{title}</h2>
      <ol className="mt-4 grid gap-2 text-sm">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-electric-soft text-xs font-semibold text-electric">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </article>
  );
}

export default function WwrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { getProject, updateProject } = useProjects();
  const router = useRouter();
  const project = getProject(id);
  if (!project) return <p className="p-8 text-sm">Project not found.</p>;

  const selected = project.over22Path === "path-2-help" ? "Path 2" : "Path 1";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-charcoal">Over 22% WWR review</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Prescriptive SB-12 packages generally cannot be used above 22% window-to-wall ratio. This project is on {selected}.
      </p>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Flow title="Path 1 — I Know My Specifications" steps={path1} />
        <Flow title="Path 2 — I Need Help With My Specifications" steps={path2} />
      </div>
      <Button
        className="mt-8"
        variant="brand"
        onClick={() => {
          updateProject(project.id, { status: "proposal" });
          router.push(`/portal/projects/${project.id}/proposal`);
        }}
      >
        Continue to proposal
      </Button>
    </div>
  );
}
