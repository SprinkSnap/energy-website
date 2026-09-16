import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const electrical = JSON.parse(readFileSync(join(root, "catalog/sections/base-loads-electrical.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/base-loads-electrical.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(electrical.migration.status === "catalog-driven", "base-loads-electrical is catalog-driven");
assert(electrical.verification.status === "unverified", "base-loads-electrical remains unverified");
assert(electrical.hot2000?.controlCount === 15, "base-loads-electrical hot2000 controlCount is 15");
assert(electrical.hot2000.controls.length === 15, "base-loads-electrical hot2000 controls array length");

const fields = electrical.groups.flatMap((g) => g.fields);
assert(fields.length === 15, "base-loads-electrical catalog has 15 fields");

const hotLabels = electrical.hot2000.controls.map((c) => c.label);
for (const label of [
  "Installed",
  "Energy source",
  "Dryer location",
  "Daily electrical energy consumption",
  "Other electrical load",
  "Avg. Exterior Use",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const groupTitles = electrical.groups.map((g) => g.title);
for (const title of ["Clothes dryer", "Stove", "Refrigerator", "Lighting", "Miscellaneous", "Exterior electrical loads"]) {
  assert(groupTitles.includes(title), `group title includes ${title}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

const dryerLocation = fields.find((f) => f.id === "dryer-location");
assert(dryerLocation?.renderer === "base-loads-electrical-dryer-location", "dryer location uses custom renderer");

assert(electrical.class === "base-loads-electrical-section catalog-section", "base-loads-electrical responsive class");
assert(stylesCss.includes(".base-loads-electrical-section .base-loads-electrical-pair-row"), "base-loads-electrical section CSS");
assert(manifest.coverage.catalogDriven.includes("base-loads-electrical"), "base-loads-electrical listed as catalog-driven");
assert(manifest.optionPacks.includes("appliance-fuels"), "appliance-fuels in manifest option packs");

assert(appJs.includes("mountBaseLoadsElectricalSection"), "mountBaseLoadsElectricalSection exists");
assert(appJs.includes('registerCustomRenderer("base-loads-electrical-dryer-location"'), "dryer location renderer registered");
assert(appJs.includes('getSection?.("base-loads-electrical")'), "electrical tab checks catalog section");
assert(appJs.includes("#base-loads-electrical-mount"), "electrical tab mount placeholder");

console.log("catalog-base-loads-electrical.test.mjs: all assertions passed");
