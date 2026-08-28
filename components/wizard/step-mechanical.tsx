"use client";

import { Field, NativeSelect, fieldControlClass } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { ChoiceRow } from "@/components/wizard/fields";
import { COOLING_EQUIPMENT, HEATING_EQUIPMENT } from "@/lib/format";
import type { Project } from "@/lib/types";

export function StepMechanical({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  const m = project.mechanical;
  const set = (key: keyof Project["mechanical"], value: string) => {
    onChange({ mechanical: { ...m, [key]: value } });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal">Mechanical systems</h2>
      <div className="mt-6 grid gap-4">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">A. Space Heating & Cooling</h3>
          <p className="mt-1 text-sm text-muted-foreground">Primary space-heating system</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Fuel Type">
              <div className="grid gap-2">
                {(["electric", "natural-gas", "propane"] as const).map((fuel) => (
                  <ChoiceRow
                    key={fuel}
                    type="radio"
                    name="heatingFuel"
                    value={fuel}
                    checked={m.heatingFuel === fuel}
                    onChange={() => set("heatingFuel", fuel)}
                  >
                    {fuel === "natural-gas" ? "Natural Gas" : fuel[0].toUpperCase() + fuel.slice(1)}
                  </ChoiceRow>
                ))}
              </div>
            </Field>
            <Field label="Space-Heating Equipment" htmlFor="heatEq">
              <NativeSelect id="heatEq" value={m.heatingEquipment} onChange={(e) => set("heatingEquipment", e.target.value)}>
                <option value="">Select…</option>
                {HEATING_EQUIPMENT.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Manufacturer" htmlFor="heatMfr">
              <Input id="heatMfr" className={fieldControlClass} value={m.heatingMfr} onChange={(e) => set("heatingMfr", e.target.value)} />
            </Field>
            <Field label="Model Number" htmlFor="heatModel">
              <Input id="heatModel" className={fieldControlClass} value={m.heatingModel} onChange={(e) => set("heatingModel", e.target.value)} />
            </Field>
            <Field label="Space-Cooling Equipment" htmlFor="coolEq">
              <NativeSelect id="coolEq" value={m.coolingEquipment} onChange={(e) => set("coolingEquipment", e.target.value)}>
                <option value="">Select…</option>
                {COOLING_EQUIPMENT.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:col-span-1">
              <Field label="Cooling Manufacturer" htmlFor="coolMfr">
                <Input id="coolMfr" className={fieldControlClass} value={m.coolingMfr} onChange={(e) => set("coolingMfr", e.target.value)} />
              </Field>
              <Field label="Cooling Model Number" htmlFor="coolModel">
                <Input id="coolModel" className={fieldControlClass} value={m.coolingModel} onChange={(e) => set("coolingModel", e.target.value)} />
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">B. HRV / ERV</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Manufacturer" htmlFor="hrvMfr">
              <Input id="hrvMfr" className={fieldControlClass} value={m.hrvMfr} onChange={(e) => set("hrvMfr", e.target.value)} />
            </Field>
            <Field label="Model Number" htmlFor="hrvModel">
              <Input id="hrvModel" className={fieldControlClass} value={m.hrvModel} onChange={(e) => set("hrvModel", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">C. Domestic Hot Water</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Fuel Type">
              <div className="grid gap-2">
                {(["electric", "natural-gas", "propane"] as const).map((fuel) => (
                  <ChoiceRow
                    key={fuel}
                    type="radio"
                    name="dhwFuel"
                    value={fuel}
                    checked={m.dhwFuel === fuel}
                    onChange={() => set("dhwFuel", fuel)}
                  >
                    {fuel === "natural-gas" ? "Natural Gas" : fuel[0].toUpperCase() + fuel.slice(1)}
                  </ChoiceRow>
                ))}
              </div>
            </Field>
            <Field label="Efficiency Rating Type" htmlFor="effType">
              <NativeSelect id="effType" value={m.dhwEfficiencyType} onChange={(e) => set("dhwEfficiencyType", e.target.value)}>
                <option value="">Select…</option>
                <option value="ef">EF</option>
                <option value="te">TE</option>
                <option value="uef">UEF</option>
              </NativeSelect>
            </Field>
            <Field label="Manufacturer" htmlFor="dhwMfr">
              <Input id="dhwMfr" className={fieldControlClass} value={m.dhwMfr} onChange={(e) => set("dhwMfr", e.target.value)} />
            </Field>
            <Field label="Model Number" htmlFor="dhwModel">
              <Input id="dhwModel" className={fieldControlClass} value={m.dhwModel} onChange={(e) => set("dhwModel", e.target.value)} />
            </Field>
            <Field label="Efficiency Rating" htmlFor="dhwEff">
              <Input id="dhwEff" className={fieldControlClass} value={m.dhwEfficiency} onChange={(e) => set("dhwEfficiency", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">D. DWHR</h3>
          <div className="mt-4 grid gap-3">
            {(
              [
                ["installed", "DWHR will be installed"],
                ["evaluate-without", "Evaluate without DWHR"],
                ["not-sure", "Not sure"],
              ] as const
            ).map(([value, label]) => (
              <ChoiceRow
                key={value}
                type="radio"
                name="dwhr"
                value={value}
                checked={m.dwhr === value}
                onChange={() => set("dwhr", value)}
              >
                {label}
              </ChoiceRow>
            ))}
          </div>
          {m.dwhr === "installed" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="DWHR Efficiency Rating (%)" htmlFor="dwhrEff">
                <Input id="dwhrEff" className={fieldControlClass} value={m.dwhrEfficiency} onChange={(e) => set("dwhrEfficiency", e.target.value)} />
              </Field>
              <Field label="Number of Showers Connected" htmlFor="dwhrShowers">
                <Input id="dwhrShowers" className={fieldControlClass} value={m.dwhrShowers} onChange={(e) => set("dwhrShowers", e.target.value)} />
              </Field>
            </div>
          ) : null}
          {m.dwhr === "evaluate-without" ? (
            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
              Energy Compliant Design may evaluate alternative compliance strategies using other efficiency measures.
            </p>
          ) : null}
          {m.dwhr === "not-sure" ? (
            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
              Additional information may be determined during Energy Compliant Design review.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">E. Combined Space / Domestic Water Heating</h3>
          <div className="mt-4 grid gap-3">
            {(
              [
                ["no", "No"],
                ["yes", "Yes"],
                ["not-sure", "Not Sure"],
              ] as const
            ).map(([value, label]) => (
              <ChoiceRow
                key={value}
                type="radio"
                name="combined"
                value={value}
                checked={m.combined === value}
                onChange={() => set("combined", value)}
              >
                {label}
              </ChoiceRow>
            ))}
          </div>
          {m.combined === "yes" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="System Type" htmlFor="combType">
                <Input id="combType" className={fieldControlClass} value={m.combinedSystemType} onChange={(e) => set("combinedSystemType", e.target.value)} />
              </Field>
              <Field label="Fuel Type" htmlFor="combFuel">
                <Input id="combFuel" className={fieldControlClass} value={m.combinedFuel} onChange={(e) => set("combinedFuel", e.target.value)} />
              </Field>
              <Field label="Manufacturer" htmlFor="combMfr">
                <Input id="combMfr" className={fieldControlClass} value={m.combinedMfr} onChange={(e) => set("combinedMfr", e.target.value)} />
              </Field>
              <Field label="Model Number" htmlFor="combModel">
                <Input id="combModel" className={fieldControlClass} value={m.combinedModel} onChange={(e) => set("combinedModel", e.target.value)} />
              </Field>
              <Field label="Efficiency Rating" htmlFor="combEff">
                <Input id="combEff" className={fieldControlClass} value={m.combinedEfficiency} onChange={(e) => set("combinedEfficiency", e.target.value)} />
              </Field>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
