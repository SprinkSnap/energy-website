import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const spec = JSON.parse(readFileSync(join(root, "catalog/sections/heating-cooling-system-season.json"), "utf8"));
const parent = JSON.parse(readFileSync(join(root, "catalog/sections/heating-cooling.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/heating-cooling-system-season.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(spec.migration.status === "catalog-driven", "heating-cooling-system-season section is catalog-driven");
assert(spec.verification.status === "unverified", "heating-cooling-system-season remains unverified");
assert(spec.hot2000?.controlCount === 9, "heating-cooling-system-season hot2000 controlCount is 9");
assert(spec.hot2000.controls.length === 9, "heating-cooling-system-season hot2000 controls array length");

const fields = spec.groups.flatMap((g) => g.fields);
assert(fields.length >= 9, "heating-cooling-system-season catalog documents field paths");

const hotLabels = spec.hot2000.controls.map((c) => c.label);
for (const label of [
  "Starting month",
  "Design month",
  "Mode",
  "Fan / pump power",
  "Indoor mode",
  "Fan power",
  "Energy efficient motor",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(spec.class === "heating-cooling-system-season-section catalog-section", "heating-cooling-system-season responsive class");
assert(stylesCss.includes(".heating-cooling-system-season-section .heating-season-cooling-grid"), "heating-cooling-system-season section CSS");
assert(manifest.coverage.catalogDriven.includes("heating-cooling-system-season"), "heating-cooling-system-season listed as catalog-driven");
assert(manifest.optionPacks.includes("heating-months"), "heating-months in manifest option packs");
assert(manifest.optionPacks.includes("heating-type1-fan-modes"), "heating-type1-fan-modes in manifest option packs");

assert(parent.migration.status === "catalog-driven", "parent heating-cooling is catalog-driven");
assert(appJs.includes("mountHeatingCoolingSystemSeasonSection"), "mountHeatingCoolingSystemSeasonSection exists");
assert(appJs.includes('registerCustomRenderer("heating-cooling-system-season-editor"'), "heating-cooling-system-season editor registered");
assert(appJs.includes("#heating-cooling-system-season-mount"), "heating-cooling-system-season mount placeholder");

console.log("catalog-heating-cooling-system-season.test.mjs: all assertions passed");
