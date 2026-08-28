"use client";

import { ChoiceRow } from "@/components/wizard/fields";
import { FOUNDATION_LABEL, WINDOW_LABEL, serviceLabel, wallsSummary } from "@/lib/format";
import type { Project } from "@/lib/types";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-charcoal">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-0 sm:flex-row sm:justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-charcoal">{value || "—"}</span>
    </div>
  );
}

export function StepReview({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  const ins = project.insulation;
  const m = project.mechanical;
  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal">Review and submit</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Check the summary, then confirm accuracy. Use Edit details if something
        needs changing — there is no extra Continue step after this.
      </p>
      <div className="mt-6 grid gap-4">
        <Block title="Project Information">
          <Row label="Service" value={serviceLabel(project)} />
          <Row label="Builder" value={project.info.builder} />
          <Row label="Model" value={project.info.modelName} />
          <Row label="Elevation / Series" value={project.info.elevation} />
          <Row label="Address" value={project.info.address} />
          <Row label="City" value={project.info.city} />
          <Row label="Postal Code" value={project.info.postalCode} />
        </Block>
        <Block title="Foundation">
          {project.foundations.length
            ? project.foundations.map((item) => FOUNDATION_LABEL[item]).join(", ")
            : "—"}
        </Block>
        <Block title="Thermal Insulation">
          <Row label="Ceiling with attic" value={ins.ceilingAttic.value === "Other" ? ins.ceilingAttic.other : ins.ceilingAttic.value} />
          <Row label="Ceiling without attic" value={ins.ceilingNoAttic.value === "Other" ? ins.ceilingNoAttic.other : ins.ceilingNoAttic.value} />
          <Row label="Exposed floor" value={ins.exposedFloor.value === "Other" ? ins.exposedFloor.other : ins.exposedFloor.value} />
          <Row label="Walls above grade" value={wallsSummary(project)} />
          <Row label="Basement walls" value={ins.basementWalls.value === "Other" ? ins.basementWalls.other : ins.basementWalls.value} />
          <Row label="Below slab" value={ins.belowSlab.value === "Other" ? ins.belowSlab.other : ins.belowSlab.value} />
        </Block>
        <Block title="Windows & Glazing">
          <Row label="Windows / SGD" value={WINDOW_LABEL[project.windows.windows] ?? project.windows.windows} />
          <Row
            label="Skylights"
            value={
              project.windows.skylights === "yes"
                ? `Yes — U ${project.windows.skylightUValue}`
                : project.windows.skylights === "no"
                  ? "No"
                  : "—"
            }
          />
        </Block>
        <Block title="Mechanical Systems">
          <Row label="Heating fuel" value={m.heatingFuel} />
          <Row label="Heating equipment" value={m.heatingEquipment} />
          <Row label="Heating" value={[m.heatingMfr, m.heatingModel].filter(Boolean).join(" ")} />
          <Row label="Cooling" value={m.coolingEquipment} />
          <Row label="HRV / ERV" value={[m.hrvMfr, m.hrvModel].filter(Boolean).join(" ")} />
          <Row label="DHW" value={[m.dhwFuel, m.dhwMfr, m.dhwModel].filter(Boolean).join(" · ")} />
          <Row label="DWHR" value={m.dwhr} />
          <Row label="Combined space/DHW" value={m.combined} />
        </Block>
        <Block title="Drawings Uploaded">
          {project.drawings.length
            ? project.drawings.map((file) => file.name).join(", ")
            : "No drawings uploaded"}
        </Block>
        <ChoiceRow
          name="confirm"
          checked={project.confirmed}
          onChange={() => onChange({ confirmed: !project.confirmed })}
        >
          I confirm that the project information and proposed specifications are accurate to the best of my knowledge.
        </ChoiceRow>
      </div>
    </div>
  );
}
