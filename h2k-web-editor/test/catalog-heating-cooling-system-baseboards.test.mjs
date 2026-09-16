import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const spec = JSON.parse(readFileSync(join(root, "catalog/sections/heating-cooling-system-baseboards.json"), "utf8"));
const parent = JSON.parse(readFileSync(join(root, "catalog/sections/heating-cooling.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/heating-cooling-system-baseboards.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(spec.migration.status === "catalog-driven", "heating-cooling-system-baseboards section is catalog-driven");
assert(spec.verification.status === "unverified", "heating-cooling-system-baseboards remains unverified");
assert(spec.hot2000?.controlCount === 6, "heating-cooling-system-baseboards hot2000 controlCount is 6");
assert(spec.hot2000.controls.length === 6, "heating-cooling-system-baseboards hot2000 controls array length");

const fields = spec.groups.flatMap((g) => g.fields);
assert(fields.length >= 6, "heating-cooling-system-baseboards catalog documents field paths");

const hotLabels = spec.hot2000.controls.map((c) => c.label);
for (const label of [
  "Output capacity",
  "Sizing factor",
  "Efficiency",
  "Manufacturer",
  "Model",
  "Number of electronic thermostats",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(spec.class === "heating-cooling-system-baseboards-section catalog-section", "heating-cooling-system-baseboards responsive class");
assert(stylesCss.includes(".heating-cooling-system-baseboards-section .heating-baseboards-spec-grid"), "heating-cooling-system-baseboards section CSS");
assert(manifest.coverage.catalogDriven.includes("heating-cooling-system-baseboards"), "heating-cooling-system-baseboards listed as catalog-driven");
assert(manifest.optionPacks.includes("heating-capacity-modes"), "heating-capacity-modes in manifest option packs");

assert(parent.migration.status === "catalog-driven", "parent heating-cooling is catalog-driven");
assert(appJs.includes("mountHeatingCoolingSystemBaseboardsSection"), "mountHeatingCoolingSystemBaseboardsSection exists");
assert(appJs.includes('registerCustomRenderer("heating-cooling-system-baseboards-editor"'), "heating-cooling-system-baseboards editor registered");
assert(appJs.includes("#heating-cooling-system-baseboards-mount"), "heating-cooling-system-baseboards mount placeholder");

console.log("catalog-heating-cooling-system-baseboards.test.mjs: all assertions passed");
