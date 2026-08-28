"use client";

import type { Over22Path, Project, ServiceRoute } from "@/lib/types";
import { OptionCard } from "@/components/wizard/fields";

export function StepService({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  const select = (route: ServiceRoute, over22Path: Over22Path = null) => {
    onChange({ route, over22Path: route === "over-22-wwr" ? over22Path : null });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal">Select your service route</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Choose the path that matches how much of the building specification is already decided.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <OptionCard
          selected={project.route === "known-specs"}
          eyebrow="Route 1"
          title="I Know My Building Specifications"
          onSelect={() => select("known-specs")}
        >
          Choose this route if you already know the building-envelope and mechanical specifications. It is the fastest path to a 48-hour SB-12 package.
        </OptionCard>
        <OptionCard
          selected={project.route === "custom-optimization"}
          eyebrow="Route 2"
          title="Custom (Optimization)"
          onSelect={() => select("custom-optimization")}
        >
          Choose this route if you need help determining or optimizing specifications. It includes a kickoff call, Energy Compliant Design review, optimization, an options review call, and your selection of the preferred solution.
        </OptionCard>
        <OptionCard
          selected={project.route === "over-22-wwr"}
          eyebrow="Route 3"
          title="Over 22% Window-to-Wall Ratio"
          onSelect={() => select("over-22-wwr", project.over22Path ?? "path-1-known")}
        >
          Choose this route when the project’s window-to-wall ratio is greater than 22%. Prescriptive SB-12 packages generally cannot be used.
        </OptionCard>
      </div>
      {project.route === "over-22-wwr" ? (
        <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-5">
          <h3 className="font-semibold text-charcoal">Select a path</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <OptionCard
              selected={project.over22Path === "path-1-known"}
              eyebrow="Path 1"
              title="I Know My Specifications"
              onSelect={() => select("over-22-wwr", "path-1-known")}
              actionLabel="Select Path 1"
            >
              Envelope and mechanical specifications are already defined. We still complete takeoff, WWR confirmation, and performance-path modelling.
            </OptionCard>
            <OptionCard
              selected={project.over22Path === "path-2-help"}
              eyebrow="Path 2"
              title="I Need Help With My Specifications"
              onSelect={() => select("over-22-wwr", "path-2-help")}
              actionLabel="Select Path 2"
            >
              Energy Compliant Design will review the drawings, identify options, and recommend a compliant assembly and mechanical mix.
            </OptionCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}
