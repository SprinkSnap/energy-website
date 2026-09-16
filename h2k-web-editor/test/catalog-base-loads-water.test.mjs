import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const water = JSON.parse(readFileSync(join(root, "catalog/sections/base-loads-water.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/base-loads-water.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(water.migration.status === "catalog-driven", "base-loads-water is catalog-driven");
assert(water.verification.status === "unverified", "base-loads-water remains unverified");
assert(water.hot2000?.controlCount === 20, "base-loads-water hot2000 controlCount is 20");
assert(water.hot2000.controls.length === 20, "base-loads-water hot2000 controls array length");

const fields = water.groups.flatMap((g) => g.fields);
assert(fields.length === 20, "base-loads-water catalog has 20 fields");

const hotLabels = water.hot2000.controls.map((c) => c.label);
for (const label of [
  "Temperature",
  "Faucet flow rate",
  "Shower head flow rate",
  "Number of low flush toilets",
  "Other water consumption per occupant per day",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const groupTitles = water.groups.map((g) => g.title);
for (const title of ["Hot water", "Shower", "Clothes washer", "Dish washer", "Other", "Cold water"]) {
  assert(groupTitles.includes(title), `group title includes ${title}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(water.class === "base-loads-water-section catalog-section", "base-loads-water responsive class");
assert(stylesCss.includes(".base-loads-water-section .base-loads-water-pair-row"), "base-loads-water section CSS");
assert(manifest.coverage.catalogDriven.includes("base-loads-water"), "base-loads-water listed as catalog-driven");
assert(manifest.optionPacks.includes("bathroom-faucet-flow"), "bathroom-faucet-flow in manifest option packs");

assert(appJs.includes("mountBaseLoadsWaterSection"), "mountBaseLoadsWaterSection exists");
assert(appJs.includes('registerCustomRenderer("base-loads-water-temperature"'), "water temperature renderer registered");
assert(appJs.includes('getSection?.("base-loads-water")'), "water tab checks catalog section");
assert(appJs.includes("#base-loads-water-mount"), "water tab mount placeholder");

console.log("catalog-base-loads-water.test.mjs: all assertions passed");
