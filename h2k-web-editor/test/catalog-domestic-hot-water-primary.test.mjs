import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const spec = JSON.parse(readFileSync(join(root, "catalog/sections/domestic-hot-water-primary.json"), "utf8"));
const parent = JSON.parse(readFileSync(join(root, "catalog/sections/domestic-hot-water.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/domestic-hot-water-primary.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(spec.migration.status === "catalog-driven", "domestic-hot-water-primary section is catalog-driven");
assert(spec.verification.status === "unverified", "domestic-hot-water-primary remains unverified");
assert(spec.hot2000?.controlCount === 26, "domestic-hot-water-primary hot2000 controlCount is 26");
assert(spec.hot2000.controls.length === 26, "domestic-hot-water-primary hot2000 controls array length");

const fields = spec.groups.flatMap((g) => g.fields);
assert(fields.length >= 26, "domestic-hot-water-primary catalog documents field paths");

const hotLabels = spec.hot2000.controls.map((c) => c.label);
for (const label of [
  "Energy Factor",
  "Uniform Energy Factor",
  "Energy source",
  "Tank type",
  "Tank volume",
  "Value (L)",
  "Uniform Energy Factor draw pattern",
  "Tank location",
  "Drain Water Heat Recovery",
  "Standby heat loss",
  "BTU/hr",
  "%/hr",
  "Thermal efficiency",
  "Input capacity",
  "Manufacturer",
  "Model",
  "ENERGY STAR",
  "ecoEnergy",
  "Insulating blanket",
  "Pilot energy",
  "Flue combined with Furnace/Boiler flue",
  "Flue diameter",
  "Fraction of tank",
  "Edit DWHR data",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(spec.class === "domestic-hot-water-primary-section catalog-section", "domestic-hot-water-primary responsive class");
assert(stylesCss.includes(".domestic-hot-water-primary-section .dhw-system-grid"), "domestic-hot-water-primary section CSS");
assert(manifest.coverage.catalogDriven.includes("domestic-hot-water-primary"), "domestic-hot-water-primary listed as catalog-driven");
assert(manifest.optionPacks.includes("dhw-energy-sources"), "dhw-energy-sources in manifest option packs");

assert(parent.migration.status === "catalog-driven", "parent domestic-hot-water is catalog-driven");
assert(
  parent.layout === "spec-layout dhw-spec-layout",
  "domestic-hot-water parent uses shared spec-layout container pattern",
);
assert(
  stylesCss.includes("#screen-systems-domestic-hot-water .domestic-hot-water-primary-stack .spec-group"),
  "domestic-hot-water inner spec-group border flattening scoped",
);
assert(
  stylesCss.includes(".domestic-hot-water-section.section-card"),
  "domestic-hot-water shares section-card container rule",
);
assert(appJs.includes("mountDomesticHotWaterPrimarySection"), "mountDomesticHotWaterPrimarySection exists");
assert(appJs.includes('registerCustomRenderer("domestic-hot-water-primary-editor"'), "domestic-hot-water-primary editor registered");
assert(appJs.includes("#domestic-hot-water-primary-mount"), "domestic-hot-water-primary mount placeholder");
assert(appJs.includes("domestic-hot-water-primary-stack"), "domestic-hot-water-primary mobile-first stack");

console.log("catalog-domestic-hot-water-primary.test.mjs: all assertions passed");
