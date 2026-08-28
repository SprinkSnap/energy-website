"use client";

import { Field, fieldControlClass } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { ChoiceRow } from "@/components/wizard/fields";
import type { Project } from "@/lib/types";

export function StepWindows({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal">Windows & glazing</h2>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-charcoal">Windows / Sliding Glass Doors</h3>
          <div className="mt-4 grid gap-3">
            {(
              [
                ["u12-er34", "U-Value 1.2 / ER 34"],
                ["u14-er29", "U-Value 1.4 / ER 29"],
                ["u16-er25", "U-Value 1.6 / ER 25"],
              ] as const
            ).map(([value, label]) => (
              <ChoiceRow
                key={value}
                type="radio"
                name="windows"
                value={value}
                checked={project.windows.windows === value}
                onChange={() =>
                  onChange({ windows: { ...project.windows, windows: value } })
                }
              >
                {label}
              </ChoiceRow>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-charcoal">Skylights</h3>
          <div className="mt-4 grid gap-3">
            {(["yes", "no"] as const).map((value) => (
              <ChoiceRow
                key={value}
                type="radio"
                name="skylights"
                value={value}
                checked={project.windows.skylights === value}
                onChange={() =>
                  onChange({ windows: { ...project.windows, skylights: value } })
                }
              >
                {value === "yes" ? "Yes" : "No"}
              </ChoiceRow>
            ))}
          </div>
          {project.windows.skylights === "yes" ? (
            <Field className="mt-4" label="Skylight U-Value" htmlFor="skylightU" hint="Default example 2.8">
              <Input
                id="skylightU"
                className={fieldControlClass}
                value={project.windows.skylightUValue}
                onChange={(e) =>
                  onChange({
                    windows: { ...project.windows, skylightUValue: e.target.value },
                  })
                }
              />
            </Field>
          ) : null}
        </section>
      </div>
    </div>
  );
}
