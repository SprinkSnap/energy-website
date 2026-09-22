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
assert(power.route?.screen === "generation-pv", "generation-power has dedicated PV systems screen");
assert(power.route?.containerId === "screen-systems-generation-pv", "generation-power PV screen container id");
assert(
  stylesCss.includes("#screen-systems-generation-main, #screen-systems-generation-pv .generation-pv-count-grid") ||
    stylesCss.includes("#screen-systems-generation-main .generation-main-grid"),
  "generation power screen CSS scoping exists",
);
assert(manifest.coverage.catalogDriven.includes("generation-power"), "generation-power listed as catalog-driven");
assert(manifest.optionPacks.includes("pv-module-types"), "pv-module-types in manifest option packs");

assert(generation.migration.status === "catalog-driven", "generation parent is catalog-driven");
assert(
  generation.layout === "spec-layout generation-spec-layout",
  "generation uses shared spec-layout container pattern like base-loads",
);
assert(
  generation.class === "generation-section catalog-section",
  "generation outer container uses catalog-section class",
);
assert(
  stylesCss.includes(".base-loads-section.section-card,\n.generation-section.section-card"),
  "generation shares section-card container rule with base-loads",
);
assert(
  !stylesCss.includes("#screen-systems-generation-main, #screen-systems-generation-pv .spec-group{\n  border:0;background:transparent;padding:0;gap:12px;min-width:0;\n}"),
  "generation inner spec-group borders are not globally flattened",
);
assert(
  stylesCss.includes(".generation-section .generation-pv-systems-group,\n.generation-section .generation-other-group"),
  "generation inner groups use shared spec-group card pattern",
);
assert(!generation.lead, "generation section lead removed");
assert(
  !power.groups.find((g) => g.id === "photovoltaic-systems")?.title,
  "photovoltaic-systems group title removed to avoid duplicate heading",
);
assert(appJs.includes("generationPvSystemsBodyHTML"), "generation PV body renderer split from wrapper");
assert(appJs.includes("mountGenerationPowerSection"), "mountGenerationPowerSection exists");
assert(appJs.includes('registerCustomRenderer("generation-power-editor"'), "generation power editor registered");
assert(appJs.includes('getSection?.("generation-power")'), "power section checks catalog section");
assert(appJs.includes("#generation-power-mount"), "generation power mount placeholder");
assert(appJs.includes("GENERATION_NAV"), "generation subsection nav config exists");
assert(appJs.includes("renderGenerationMainScreen"), "renderGenerationMainScreen exists");
assert(appJs.includes("renderGenerationPvScreen"), "renderGenerationPvScreen exists");
assert(appJs.includes("updateGenerationLocalNav"), "generation local nav updater exists");
assert(stylesCss.includes("@media(min-width:768px)"), "generation responsive tablet breakpoint exists");
assert(
  (stylesCss.includes("#screen-systems-generation-main, #screen-systems-generation-pv .generation-pv-count-grid") ||
    stylesCss.includes(".generation-main-grid")) &&
    stylesCss.includes("grid-template-columns:repeat(2,minmax(0,1fr))"),
  "generation pv count grid tablet columns scoped",
);
assert(
  !stylesCss.includes(".generation-pv-count-grid{grid-template-columns:repeat(3,minmax(0,1fr))}"),
  "generation pv count grid must not use three columns",
);

console.log("catalog-generation-power.test.mjs: all assertions passed");
