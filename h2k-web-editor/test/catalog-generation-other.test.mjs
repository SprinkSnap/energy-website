import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const other = JSON.parse(readFileSync(join(root, "catalog/sections/generation-other.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const summary = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/generation-power-summary.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(other.migration.status === "catalog-driven", "generation-other is catalog-driven");
assert(other.hot2000?.controlCount === 4, "generation-other hot2000 controlCount is 4");
assert(other.groups[0].title === "Other Energy Systems", "other energy systems group title");

const fields = other.groups.flatMap((g) => g.fields);
assert(fields.length === 3, "generation-other catalog has 3 field entries");

const labels = other.hot2000.controls.map((c) => c.label);
for (const label of ["Battery Storage", "Wind energy contribution", "Solar Ready"]) {
  assert(labels.includes(label), `hot2000 inventory includes ${label}`);
}

assert(summary.fields.length === 6, "power generation summary capture has 6 fields");
assert(manifest.coverage.catalogDriven.includes("generation-other"), "generation-other listed as catalog-driven");
assert(stylesCss.includes(".generation-other-section"), "generation-other section CSS");
assert(appJs.includes("mountGenerationOtherSection"), "mountGenerationOtherSection exists");
assert(appJs.includes('registerCustomRenderer("generation-other-editor"'), "generation-other editor registered");
assert(appJs.includes('registerCustomRenderer("generation-wind-row"'), "generation wind row registered");
assert(appJs.includes("#generation-other-mount"), "generation-other mount placeholder");
assert(appJs.includes("Other Energy Systems"), "Other Energy Systems group label in app");

console.log("catalog-generation-other.test.mjs: all assertions passed");
