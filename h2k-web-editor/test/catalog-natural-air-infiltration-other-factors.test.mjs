import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const other = JSON.parse(readFileSync(join(root, "catalog/sections/natural-air-infiltration-other-factors.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/natural-air-infiltration-other-factors.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(other.migration.status === "catalog-driven", "other-factors section is catalog-driven");
assert(other.verification.status === "unverified", "other-factors remains unverified");
assert(other.hot2000?.controlCount === 6, "other-factors hot2000 controlCount is 6");
assert(other.hot2000.controls.length === 6, "other-factors hot2000 controls array length");

const fields = other.groups.flatMap((g) => g.fields);
assert(fields.length >= 6, "other-factors catalog documents field paths");

const hotLabels = other.hot2000.controls.map((c) => c.label);
for (const label of ["Terrain", "Anemometer Height", "Leakage fractions", "Ceilings", "Walls", "Floors"]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(other.class === "infiltration-other-factors-section catalog-section", "other-factors responsive class");
assert(stylesCss.includes(".infiltration-other-factors-section .infiltration-weather-pair-row"), "other-factors section CSS");
assert(manifest.coverage.catalogDriven.includes("natural-air-infiltration-other-factors"), "other-factors listed as catalog-driven");
assert(manifest.optionPacks.includes("weather-station-terrain"), "weather-station-terrain in manifest option packs");

assert(appJs.includes("mountInfiltrationOtherFactorsSection"), "mountInfiltrationOtherFactorsSection exists");
assert(appJs.includes('registerCustomRenderer("infiltration-other-factors-editor"'), "other-factors editor registered");
assert(appJs.includes("#infiltration-other-factors-mount"), "other-factors mount placeholder");

console.log("catalog-natural-air-infiltration-other-factors.test.mjs: all assertions passed");
