"use client";

import { Field, NativeSelect } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fieldControlClass } from "@/components/forms/field";
import type { InsulationChoice, Project } from "@/lib/types";
import { wallsSummary } from "@/lib/format";

function InsulationBlock({
  title,
  example,
  options,
  value,
  onChange,
}: {
  title: string;
  example?: string;
  options: string[];
  value: InsulationChoice;
  onChange: (next: InsulationChoice) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-charcoal">{title}</h3>
      {example ? <p className="mt-1 text-sm text-muted-foreground">{example}</p> : null}
      <div className="mt-4 grid gap-4">
        <Field label="Rating" htmlFor={`${title}-rating`}>
          <NativeSelect
            id={`${title}-rating`}
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          >
            <option value="">Select…</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {value.value === "Other" ? (
          <Field label="Other" htmlFor={`${title}-other`}>
            <Input
              id={`${title}-other`}
              className={fieldControlClass}
              value={value.other}
              onChange={(e) => onChange({ ...value, other: e.target.value })}
            />
          </Field>
        ) : null}
        <Field label="Notes" htmlFor={`${title}-notes`}>
          <Textarea
            id={`${title}-notes`}
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
          />
        </Field>
      </div>
    </section>
  );
}

export function StepInsulation({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  const walls = project.insulation.wallsAboveGrade;
  const hasBasement = project.foundations.some((f) =>
    ["basement", "walkout-basement", "crawlspace"].includes(f),
  );
  const hasSlab = project.foundations.includes("slab-on-grade") || hasBasement;

  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal">Thermal insulation</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Proposed effective ratings for this model. Choose Other if the assembly
        is not on the list — notes are optional.
      </p>
      <div className="mt-6 grid gap-4">
        <InsulationBlock
          title="1. Ceiling With Attic Space"
          example="Typical vented attic. Example: R60 blown cellulose."
          options={["R60", "R50", "Other"]}
          value={project.insulation.ceilingAttic}
          onChange={(ceilingAttic) =>
            onChange({ insulation: { ...project.insulation, ceilingAttic } })
          }
        />
        <InsulationBlock
          title="2. Ceiling Without Attic Space"
          options={["R31", "Other"]}
          value={project.insulation.ceilingNoAttic}
          onChange={(ceilingNoAttic) =>
            onChange({ insulation: { ...project.insulation, ceilingNoAttic } })
          }
        />
        <InsulationBlock
          title="3. Exposed Floor"
          options={["R31", "R35", "Other"]}
          value={project.insulation.exposedFloor}
          onChange={(exposedFloor) =>
            onChange({ insulation: { ...project.insulation, exposedFloor } })
          }
        />
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-charcoal">4. Walls Above Grade</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Cavity Insulation" htmlFor="cavity">
              <NativeSelect
                id="cavity"
                value={walls.cavity}
                onChange={(e) =>
                  onChange({
                    insulation: {
                      ...project.insulation,
                      wallsAboveGrade: { ...walls, cavity: e.target.value },
                    },
                  })
                }
              >
                <option value="">Select…</option>
                <option value="R22">R22</option>
                <option value="Other">Other</option>
              </NativeSelect>
            </Field>
            {walls.cavity === "Other" ? (
              <Field label="Cavity Other" htmlFor="cavityOther">
                <Input
                  id="cavityOther"
                  className={fieldControlClass}
                  value={walls.cavityOther}
                  onChange={(e) =>
                    onChange({
                      insulation: {
                        ...project.insulation,
                        wallsAboveGrade: { ...walls, cavityOther: e.target.value },
                      },
                    })
                  }
                />
              </Field>
            ) : null}
            <Field label="Continuous Insulation" htmlFor="ci">
              <NativeSelect
                id="ci"
                value={walls.continuous}
                onChange={(e) =>
                  onChange({
                    insulation: {
                      ...project.insulation,
                      wallsAboveGrade: { ...walls, continuous: e.target.value },
                    },
                  })
                }
              >
                <option value="">Select…</option>
                <option value="R5 CI">R5 CI</option>
                <option value="Other">Other</option>
              </NativeSelect>
            </Field>
            {walls.continuous === "Other" ? (
              <Field label="Continuous Other" htmlFor="ciOther">
                <Input
                  id="ciOther"
                  className={fieldControlClass}
                  value={walls.continuousOther}
                  onChange={(e) =>
                    onChange({
                      insulation: {
                        ...project.insulation,
                        wallsAboveGrade: { ...walls, continuousOther: e.target.value },
                      },
                    })
                  }
                />
              </Field>
            ) : null}
          </div>
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
            Proposed assembly: <strong>{wallsSummary(project)}</strong>
          </p>
          <Field className="mt-4" label="Notes" htmlFor="wall-notes">
            <Textarea
              id="wall-notes"
              value={walls.notes}
              onChange={(e) =>
                onChange({
                  insulation: {
                    ...project.insulation,
                    wallsAboveGrade: { ...walls, notes: e.target.value },
                  },
                })
              }
            />
          </Field>
        </section>
        {hasBasement ? (
          <InsulationBlock
            title="5. Basement Walls"
            options={["R20 CI", "Other"]}
            value={project.insulation.basementWalls}
            onChange={(basementWalls) =>
              onChange({ insulation: { ...project.insulation, basementWalls } })
            }
          />
        ) : null}
        {hasSlab ? (
          <InsulationBlock
            title="6. Below Slab Insulation"
            options={["R10", "Other"]}
            value={project.insulation.belowSlab}
            onChange={(belowSlab) =>
              onChange({ insulation: { ...project.insulation, belowSlab } })
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Below-slab and basement wall fields appear when a basement, crawlspace, or slab-on-grade is selected.
          </p>
        )}
      </div>
    </div>
  );
}
