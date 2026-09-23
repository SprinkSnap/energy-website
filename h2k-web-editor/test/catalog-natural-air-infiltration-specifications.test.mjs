import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const spec = JSON.parse(readFileSync(join(root, "catalog/sections/natural-air-infiltration-specifications.json"), "utf8"));
const parent = JSON.parse(readFileSync(join(root, "catalog/sections/natural-air-infiltration.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/natural-air-infiltration-specifications.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(spec.migration.status === "catalog-driven", "specifications section is catalog-driven");
assert(spec.verification.status === "unverified", "specifications remains unverified");
assert(spec.hot2000?.controlCount === 20, "specifications hot2000 controlCount is 20");
assert(spec.hot2000.controls.length === 20, "specifications hot2000 controls array length");

const fields = spec.groups.flatMap((g) => g.fields);
assert(fields.length >= 17, "specifications catalog documents field paths");

const hotLabels = spec.hot2000.controls.map((c) => c.label);
for (const label of [
  "House Volume",
  "Air Tightness Type",
  "Depressurization test status:",
  "Air Leakage Test Data",
  "Air Change Rate @ 50 Pa.",
  "Floors",
  "Total",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(spec.class === "infiltration-specifications-section catalog-section", "specifications responsive class");
assert(stylesCss.includes(".infiltration-specifications-section .infiltration-ela-subgroup"), "ELA subgroup CSS");
assert(stylesCss.includes(".infiltration-specifications-section .infiltration-common-surfaces-row"), "common surfaces CSS");
assert(appJs.includes("infiltration-air-tightness-group"), "Air Tightness Type layout group");
assert(manifest.coverage.catalogDriven.includes("natural-air-infiltration-specifications"), "specifications listed as catalog-driven");
assert(manifest.optionPacks.includes("air-tightness-types"), "air-tightness-types in manifest option packs");

assert(parent.migration.status === "catalog-driven", "parent infiltration is catalog-driven");
assert(
  parent.layout === "spec-layout infiltration-spec-layout",
  "infiltration parent uses shared spec-layout container pattern",
);
assert(
  stylesCss.includes("#screen-systems-natural-air-infiltration .infiltration-tab-stack .spec-group{"),
  "infiltration inner spec-group border flattening scoped",
);
assert(
  stylesCss.includes(".infiltration-section.section-card"),
  "infiltration shares section-card container rule",
);
assert(appJs.includes("mountInfiltrationSpecificationsSection"), "mountInfiltrationSpecificationsSection exists");
assert(appJs.includes('registerCustomRenderer("infiltration-specifications-editor"'), "specifications editor registered");
assert(appJs.includes("infiltrationCommonSurfacesHTML"), "common surfaces HTML helper exists");
assert(appJs.includes("#infiltration-specifications-mount"), "specifications mount placeholder");

console.log("catalog-natural-air-infiltration-specifications.test.mjs: all assertions passed");
