"use client";

import { Field, fieldControlClass } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import type { Project } from "@/lib/types";

export function StepProject({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  const set = (key: keyof Project["info"], value: string) => {
    onChange({ info: { ...project.info, [key]: value } });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal">Project information</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Identify the model so the energy package matches the drawings submitted for permit.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Builder" htmlFor="builder">
          <Input
            id="builder"
            className={fieldControlClass}
            value={project.info.builder}
            onChange={(e) => set("builder", e.target.value)}
          />
        </Field>
        <Field label="Model Name" htmlFor="modelName">
          <Input
            id="modelName"
            className={fieldControlClass}
            value={project.info.modelName}
            onChange={(e) => set("modelName", e.target.value)}
          />
        </Field>
        <Field label="Elevation / Model Series" htmlFor="elevation">
          <Input
            id="elevation"
            className={fieldControlClass}
            value={project.info.elevation}
            onChange={(e) => set("elevation", e.target.value)}
          />
        </Field>
        <Field label="Model Address" htmlFor="address">
          <Input
            id="address"
            className={fieldControlClass}
            value={project.info.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>
        <Field label="Model City" htmlFor="city">
          <Input
            id="city"
            className={fieldControlClass}
            value={project.info.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </Field>
        <Field label="Postal Code" htmlFor="postalCode">
          <Input
            id="postalCode"
            className={fieldControlClass}
            value={project.info.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}
