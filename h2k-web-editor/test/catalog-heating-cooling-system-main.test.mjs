import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const spec = JSON.parse(readFileSync(join(root, "catalog/sections/heating-cooling-system-main.json"), "utf8"));
const parent = JSON.parse(readFileSync(join(root, "catalog/sections/heating-cooling.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/heating-cooling-system-main.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(spec.migration.status === "catalog-driven", "heating-cooling-system-main section is catalog-driven");
assert(spec.verification.status === "unverified", "heating-cooling-system-main remains unverified");
assert(spec.hot2000?.controlCount === 14, "heating-cooling-system-main hot2000 controlCount is 14");
assert(spec.hot2000.controls.length === 14, "heating-cooling-system-main hot2000 controls array length");

const fields = spec.groups.flatMap((g) => g.fields);
assert(fields.length >= 14, "heating-cooling-system-main catalog documents field paths");

const hotLabels = spec.hot2000.controls.map((c) => c.label);
for (const label of [
  "Baseboard/Hydronic/Plenum heaters",
  "Furnace",
  "N/A",
  "Air Source Heat Pump",
  "Account for shading in F280 design cooling loads",
  "Supplementary heat systems",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(spec.class === "heating-cooling-system-main-section catalog-section", "heating-cooling-system-main responsive class");
assert(stylesCss.includes(".heating-cooling-system-main-section .heating-radio-grid"), "heating-cooling-system-main section CSS");
assert(manifest.coverage.catalogDriven.includes("heating-cooling-system-main"), "heating-cooling-system-main listed as catalog-driven");
assert(manifest.optionPacks.includes("heating-type1-systems"), "heating-type1-systems in manifest option packs");
assert(manifest.optionPacks.includes("heating-type2-systems"), "heating-type2-systems in manifest option packs");

assert(parent.migration.status === "catalog-driven", "parent heating-cooling is catalog-driven");
assert(
  parent.layout === "spec-layout heating-cooling-spec-layout",
  "heating-cooling parent uses shared spec-layout container pattern",
);
assert(
  stylesCss.includes("#screen-systems-heating-cooling .heating-tab-stack .spec-group{"),
  "heating-cooling inner spec-group border flattening scoped",
);
assert(
  stylesCss.includes(".heating-cooling-section.section-card"),
  "heating-cooling shares section-card container rule",
);
assert(appJs.includes("mountHeatingCoolingSystemMainSection"), "mountHeatingCoolingSystemMainSection exists");
assert(appJs.includes('registerCustomRenderer("heating-cooling-system-main-editor"'), "heating-cooling-system-main editor registered");
assert(appJs.includes("#heating-cooling-system-main-mount"), "heating-cooling-system-main mount placeholder");

console.log("catalog-heating-cooling-system-main.test.mjs: all assertions passed");
