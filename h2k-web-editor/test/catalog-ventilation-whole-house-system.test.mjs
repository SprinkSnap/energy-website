import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const spec = JSON.parse(readFileSync(join(root, "catalog/sections/ventilation-whole-house-system.json"), "utf8"));
const parent = JSON.parse(readFileSync(join(root, "catalog/sections/ventilation.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/ventilation-whole-house-system.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(spec.migration.status === "catalog-driven", "whole-house system section is catalog-driven");
assert(spec.verification.status === "unverified", "whole-house system remains unverified");
assert(spec.hot2000?.controlCount === 21, "whole-house system hot2000 controlCount is 21");
assert(spec.hot2000.controls.length === 21, "whole-house system hot2000 controls array length");

const fields = spec.groups.flatMap((g) => g.fields);
assert(fields.length >= 20, "whole-house system catalog documents field paths");

const hotLabels = spec.hot2000.controls.map((c) => c.label);
for (const label of [
  "Use",
  "ACH",
  "Kitchen, living room, dining room",
  "Minimum Ventilation Rate",
  "Air distribution/circulation type",
  "Operation Schedule",
  "Depressurization Limit",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(spec.class === "ventilation-whole-house-system-section catalog-section", "whole-house system responsive class");
assert(stylesCss.includes(".ventilation-whole-house-system-section .ventilation-requirements-flow-row"), "whole-house system section CSS");
assert(manifest.coverage.catalogDriven.includes("ventilation-whole-house-system"), "whole-house system listed as catalog-driven");
assert(manifest.optionPacks.includes("vent-requirements-use"), "vent-requirements-use in manifest option packs");

assert(parent.migration.status === "catalog-driven", "parent ventilation is catalog-driven");
assert(appJs.includes("mountVentilationWholeHouseSystemSection"), "mountVentilationWholeHouseSystemSection exists");
assert(appJs.includes('registerCustomRenderer("ventilation-whole-house-system-editor"'), "whole-house system editor registered");
assert(appJs.includes("#ventilation-whole-house-system-mount"), "whole-house system mount placeholder");

console.log("catalog-ventilation-whole-house-system.test.mjs: all assertions passed");
