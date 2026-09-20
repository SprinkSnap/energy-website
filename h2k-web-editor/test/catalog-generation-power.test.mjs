import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const power = JSON.parse(readFileSync(join(root, "catalog/sections/generation-power.json"), "utf8"));
const generation = JSON.parse(readFileSync(join(root, "catalog/sections/generation.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/generation-power.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(power.migration.status === "catalog-driven", "generation-power is catalog-driven");
assert(power.verification.status === "unverified", "generation-power remains unverified");
assert(power.hot2000?.controlCount === 20, "generation-power hot2000 controlCount is 20");
assert(power.hot2000.controls.length === 20, "generation-power hot2000 controls array length");

const fields = power.groups.flatMap((g) => g.fields);
assert(fields.length >= 20, "generation-power catalog documents all field paths");

const hotLabels = power.hot2000.controls.map((c) => c.label);
for (const label of [
  "Photovoltaic Systems:",
  "Capacity of photovoltaic system",
  "Solar panel orientation",
  "Module type",
  "Grid absorption rate",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(power.class === "generation-power-section catalog-section", "generation-power responsive class");
assert(stylesCss.includes(".generation-power-section .pv-orientation-row"), "generation-power section CSS");
assert(
  !stylesCss.includes("#screen-systems-generation .generation-editor-group.spec-group,\n#screen-systems-generation .generation-editor-group > h4{display:none}"),
  "generation-editor-group wrapper must not be hidden (display:none regression)",
);
assert(
  stylesCss.includes("#screen-systems-generation .generation-editor-group.spec-group{"),
  "generation-editor-group wrapper border cleanup rule exists",
);
assert(manifest.coverage.catalogDriven.includes("generation-power"), "generation-power listed as catalog-driven");
assert(manifest.optionPacks.includes("pv-module-types"), "pv-module-types in manifest option packs");

assert(generation.migration.status === "catalog-driven", "generation parent is catalog-driven");
assert(appJs.includes("mountGenerationPowerSection"), "mountGenerationPowerSection exists");
assert(appJs.includes('registerCustomRenderer("generation-power-editor"'), "generation power editor registered");
assert(appJs.includes('getSection?.("generation-power")'), "power section checks catalog section");
assert(appJs.includes("#generation-power-mount"), "generation power mount placeholder");

console.log("catalog-generation-power.test.mjs: all assertions passed");
