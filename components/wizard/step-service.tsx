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
      <h2 className="text-2xl font-bold text-charcoal">Which route fits this house?</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Choose the path that matches how decided the specifications already are.
        You can change this later if you are unsure.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <OptionCard
          selected={project.route === "known-specs"}
          eyebrow="Route 1"
          title="I Know My Building Specifications"
          onSelect={() => select("known-specs")}
          bestFor="Production and repeat models"
          need="Drawings + confirmed envelope and mechanicals"
          time="48-hour package after deposit"
        >
          Fastest path when assemblies and equipment are already chosen.
        </OptionCard>
        <OptionCard
          selected={project.route === "custom-optimization"}
          eyebrow="Route 2"
          title="Custom (Optimization)"
          onSelect={() => select("custom-optimization")}
          bestFor="Custom homes still deciding assemblies"
          need="Drawings + a kickoff call"
          time="Structured review, then proposal"
        >
          We review options with you before the proposal is issued.
        </OptionCard>
        <OptionCard
          selected={project.route === "over-22-wwr"}
          eyebrow="Route 3"
          title="Over 22% Window-to-Wall Ratio"
          onSelect={() => select("over-22-wwr", project.over22Path ?? "path-1-known")}
          bestFor="High-glazing elevations"
          need="Drawings + Path 1 or Path 2"
          time="Performance-path modelling"
        >
          Prescriptive SB-12 packages generally cannot be used above 22% WWR.
        </OptionCard>
      </div>
      {project.route === "over-22-wwr" ? (
        <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-5">
          <h3 className="font-semibold text-charcoal">Select a path</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Path 1 if specs are known. Path 2 if you need help choosing them.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <OptionCard
              selected={project.over22Path === "path-1-known"}
              eyebrow="Path 1"
              title="I Know My Specifications"
              onSelect={() => select("over-22-wwr", "path-1-known")}
              actionLabel="Select Path 1"
            >
              Envelope and mechanical specifications are already defined. We still
              complete takeoff, WWR confirmation, and performance-path modelling.
            </OptionCard>
            <OptionCard
              selected={project.over22Path === "path-2-help"}
              eyebrow="Path 2"
              title="I Need Help With My Specifications"
              onSelect={() => select("over-22-wwr", "path-2-help")}
              actionLabel="Select Path 2"
            >
              Energy Compliant Design will review the drawings, identify options,
              and recommend a compliant assembly and mechanical mix.
            </OptionCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}
