import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const spec = JSON.parse(readFileSync(join(root, "catalog/sections/ventilation-supplemental-components.json"), "utf8"));
const parent = JSON.parse(readFileSync(join(root, "catalog/sections/ventilation.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/ventilation-supplemental-components.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(spec.migration.status === "catalog-driven", "supplemental components section is catalog-driven");
assert(spec.verification.status === "unverified", "supplemental components remains unverified");
assert(spec.hot2000?.controlCount === 19, "supplemental components hot2000 controlCount is 19");
assert(spec.hot2000.controls.length === 19, "supplemental components hot2000 controls array length");

const fields = spec.groups.flatMap((g) => g.fields);
assert(fields.length >= 14, "supplemental components catalog documents field paths");

const hotLabels = spec.hot2000.controls.map((c) => c.label);
for (const label of [
  "Ventilator/Fan type",
  "Supply flow rate cfm",
  "Edit detail",
  "Operation Schedule",
  "Min/Day",
  "Fan power",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(spec.class === "ventilation-supplemental-components-section catalog-section", "supplemental components responsive class");
assert(stylesCss.includes(".ventilation-supplemental-components-section .ventilation-row-detail"), "supplemental components section CSS");
assert(manifest.coverage.catalogDriven.includes("ventilation-supplemental-components"), "supplemental components listed as catalog-driven");
assert(manifest.optionPacks.includes("supplemental-fan-types"), "supplemental-fan-types in manifest option packs");

assert(parent.migration.status === "catalog-driven", "parent ventilation is catalog-driven");
assert(appJs.includes("mountVentilationSupplementalComponentsSection"), "mountVentilationSupplementalComponentsSection exists");
assert(appJs.includes('registerCustomRenderer("ventilation-supplemental-components-editor"'), "supplemental components editor registered");
assert(appJs.includes("#ventilation-supplemental-components-mount"), "supplemental components mount placeholder");

console.log("catalog-ventilation-supplemental-components.test.mjs: all assertions passed");
