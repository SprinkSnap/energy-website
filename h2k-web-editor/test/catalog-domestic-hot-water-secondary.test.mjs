import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const spec = JSON.parse(readFileSync(join(root, "catalog/sections/domestic-hot-water-secondary.json"), "utf8"));
const parent = JSON.parse(readFileSync(join(root, "catalog/sections/domestic-hot-water.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/domestic-hot-water-secondary.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(spec.migration.status === "catalog-driven", "domestic-hot-water-secondary section is catalog-driven");
assert(spec.verification.status === "unverified", "domestic-hot-water-secondary remains unverified");
assert(spec.hot2000?.controlCount === 26, "domestic-hot-water-secondary hot2000 controlCount is 26");
assert(spec.hot2000.controls.length === 26, "domestic-hot-water-secondary hot2000 controls array length");

const fields = spec.groups.flatMap((g) => g.fields);
assert(fields.length >= 26, "domestic-hot-water-secondary catalog documents field paths");

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

assert(spec.class === "domestic-hot-water-secondary-section catalog-section", "domestic-hot-water-secondary responsive class");
assert(stylesCss.includes(".domestic-hot-water-secondary-section .dhw-system-grid"), "domestic-hot-water-secondary section CSS");
assert(manifest.coverage.catalogDriven.includes("domestic-hot-water-secondary"), "domestic-hot-water-secondary listed as catalog-driven");

assert(parent.beforeRender.includes("ensureHotWaterSecondaryDefaults"), "parent domestic-hot-water ensures secondary defaults");
assert(appJs.includes("mountDomesticHotWaterSecondarySection"), "mountDomesticHotWaterSecondarySection exists");
assert(appJs.includes('registerCustomRenderer("domestic-hot-water-secondary-editor"'), "domestic-hot-water-secondary editor registered");
assert(appJs.includes("#domestic-hot-water-secondary-mount"), "domestic-hot-water-secondary mount placeholder");
assert(appJs.includes("domestic-hot-water-secondary-stack"), "domestic-hot-water-secondary mobile-first stack");
assert(appJs.includes("hotWaterDhwFieldsHTML"), "shared hotWaterDhwFieldsHTML renderer exists");

console.log("catalog-domestic-hot-water-secondary.test.mjs: all assertions passed");
