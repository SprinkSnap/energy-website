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

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `${name} exists`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`could not extract ${name}`);
}

assert(electrical.migration.status === "catalog-driven", "base-loads-electrical is catalog-driven");
assert(electrical.migration.renderer === "renderBaseLoadsElectricalScreen", "base-loads-electrical uses renderBaseLoadsElectricalScreen");
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

assert(electrical.route.legacyScreen === "base-loads-electrical", "legacy route alias preserved");
assert(electrical.route.containerId === "screen-systems-base-loads-electrical", "electrical usage container id");
assert(electrical.class === "base-loads-electrical-section catalog-section", "base-loads-electrical responsive class");
assert(stylesCss.includes(".base-loads-electrical-section .base-loads-electrical-pair-row"), "base-loads-electrical section CSS");
assert(manifest.coverage.catalogDriven.includes("base-loads-electrical"), "base-loads-electrical listed as catalog-driven");
assert(manifest.optionPacks.includes("appliance-fuels"), "appliance-fuels in manifest option packs");

const renderBaseLoadsElectricalScreen = extractFunction(appJs, "renderBaseLoadsElectricalScreen");
assert(renderBaseLoadsElectricalScreen.includes("H2kCatalog.renderSection"), "renderBaseLoadsElectricalScreen delegates to catalog");
assert(renderBaseLoadsElectricalScreen.includes('getSection?.("base-loads-electrical")'), "renderBaseLoadsElectricalScreen checks catalog section");
assert(appJs.includes('registerCustomRenderer("base-loads-electrical-dryer-location"'), "dryer location renderer registered");
assert(appJs.includes("BASE_LOADS_NAV"), "base loads subsection nav config exists");
assert(appJs.includes('id:"electrical-usage"'), "electrical usage in base loads nav");

console.log("catalog-base-loads-electrical.test.mjs: all assertions passed");
