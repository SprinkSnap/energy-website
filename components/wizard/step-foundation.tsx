"use client";

import { ChoiceRow } from "@/components/wizard/fields";
import { FOUNDATION_LABEL } from "@/lib/format";
import type { FoundationType, Project } from "@/lib/types";

const options: FoundationType[] = [
  "basement",
  "crawlspace",
  "walkout-basement",
  "walkout-deck",
  "slab-on-grade",
];

export function StepFoundation({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  const toggle = (value: FoundationType) => {
    const selected = project.foundations.includes(value)
      ? project.foundations.filter((item) => item !== value)
      : [...project.foundations, value];
    onChange({ foundations: selected });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal">Foundation type</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Select every foundation condition that applies. More than one selection is common.
      </p>
      <div className="mt-6 grid gap-3">
        {options.map((option) => (
          <ChoiceRow
            key={option}
            name="foundation"
            checked={project.foundations.includes(option)}
            onChange={() => toggle(option)}
          >
            {FOUNDATION_LABEL[option]}
          </ChoiceRow>
        ))}
      </div>
      <p className="mt-6 rounded-xl bg-electric-soft px-4 py-3 text-sm text-charcoal">
        The next step only shows insulation fields that apply to this foundation.
      </p>
    </div>
  );
}
