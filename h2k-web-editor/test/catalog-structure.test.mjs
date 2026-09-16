import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = join(root, "catalog");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = JSON.parse(readFileSync(join(catalog, "manifest.json"), "utf8"));
const index = JSON.parse(readFileSync(join(catalog, "sections/index.json"), "utf8"));
const weather = JSON.parse(readFileSync(join(catalog, "sections/weather.json"), "utf8"));
const regions = JSON.parse(readFileSync(join(catalog, "options/weather-regions.json"), "utf8"));
const locations = JSON.parse(readFileSync(join(catalog, "options/weather-locations.json"), "utf8"));

assert(manifest.catalogVersion === "2.0.0", "manifest catalogVersion");
assert(manifest.hot2000.build === "11.13", "manifest pins HOT2000 11.13");
assert(manifest.coverage.catalogDriven.includes("weather"), "weather listed as catalog-driven");
assert(manifest.coverage.catalogDriven.includes("general"), "general listed as catalog-driven");
assert(manifest.coverage.catalogDriven.includes("tightness"), "tightness listed as catalog-driven");
assert(manifest.coverage.catalogDriven.includes("info"), "info listed as catalog-driven");
assert(manifest.coverage.catalogDriven.includes("specifications"), "specifications listed as catalog-driven");
assert(Array.isArray(manifest.unresolvedRules) && manifest.unresolvedRules.length >= 1, "unresolved rules recorded");

assert(index.sections.includes("weather"), "sections index includes weather");
const weatherEntry = index.entries.find((e) => e.id === "weather");
assert(weatherEntry?.migration === "catalog-driven", "weather migration status");

assert(weather.verification.status === "unverified", "weather remains unverified until Desktop checks");
assert(weather.groups.length === 2, "weather has Location and Climate data groups");

const regionField = weather.groups[0].fields.find((f) => f.id === "region");
const locationField = weather.groups[0].fields.find((f) => f.id === "location");
assert(regionField?.control === "coded-select", "region is coded select");
assert(locationField?.renderer === "weather-location-search", "location uses searchable custom renderer");
assert(locationField?.dependsOn?.[0]?.optionsRef === "weather-locations", "location depends on weather-locations");

assert(Object.keys(regions.options).length === 13, "13 weather regions in catalog");
assert(Object.keys(locations.recordsByRegion).length === 5, "website currently ships 5 region location lists");

for (const id of ["general", "tightness", "info", "specifications", "codes", "temperatures", "base-loads"]) {
  const section = JSON.parse(readFileSync(join(catalog, "sections", `${id}.json`), "utf8"));
  assert(section.verification.status === "unverified", `${id} is unverified`);
  assert(section.migration.status === "catalog-driven", `${id} is catalog-driven`);
  assert(section.groups.length > 0, `${id} has catalog groups`);
}
for (const id of ["ventilation", "heating-cooling", "heating-cooling-system-main"]) {
  const section = JSON.parse(readFileSync(join(catalog, "sections", `${id}.json`), "utf8"));
  assert(section.verification.status === "unverified", `${id} is unverified`);
  assert(section.migration.status === "catalog-driven", `${id} is catalog-driven`);
  assert(section.groups.length > 0, `${id} has catalog groups`);
}

assert(existsSync(join(root, "h2k-catalog.js")), "h2k-catalog.js runtime exists");
assert(existsSync(join(root, "h2k-schema-renderer.js")), "h2k-schema-renderer.js runtime exists");
assert(existsSync(join(catalog, "schema.json")), "catalog schema.json exists");
assert(existsSync(join(catalog, "legacy-allowlist.json")), "legacy allowlist exists");
assert(existsSync(join(root, "project-state.js")), "project-state.js exists");
assert(existsSync(join(root, "docs/CATALOG_COVERAGE.md")), "coverage doc exists");

console.log("catalog-structure.test.mjs: all assertions passed");
