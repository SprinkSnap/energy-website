import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const unitMode = JSON.parse(readFileSync(join(root, "catalog/sections/unit-mode.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, "m");
  const match = re.exec(source);
  assert(match, `${name} not found`);
  const start = match.index;
  let depth = 0;
  let started = false;
  for (let i = start + match[0].length - 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse ${name}`);
}

const renderUnitMode = extractFunction(appJs, "renderUnitModeTab");
assert(renderUnitMode.includes("H2kCatalog.renderSection"), "renderUnitModeTab delegates to catalog renderer");
assert(renderUnitMode.includes('getSection?.("unit-mode")'), "renderUnitModeTab checks catalog section");
assert(appJs.includes("unitModeDisplayUnitsHTML"), "display units custom renderer");
assert(appJs.includes("unitModeProgramsHTML"), "programs combobox custom renderer");

assert(unitMode.title === "House Units & Mode", "unit-mode section title");
assert(unitMode.hot2000?.controlCount === 4, "unit-mode hot2000 controlCount is 4");
const hotLabels = unitMode.hot2000.controls.map((c) => c.label);
for (const label of ["Metric", "Imperial", "US", "Programs"]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const groupTitles = unitMode.groups.map((g) => g.title);
for (const title of ["Display Units", "Programs"]) {
  assert(groupTitles.includes(title), `unit-mode group ${title}`);
}

const paths = unitMode.groups.flatMap((g) => g.fields).flatMap((f) => (f.path ? [f.path] : []));
assert(paths.includes("/HouseFile/@uiUnits"), "display units path in catalog");

const programsField = unitMode.groups.flatMap((g) => g.fields).find((f) => f.id === "programs");
assert(programsField?.optionsStatus === "pending-manual", "programs combobox options pending");
assert(programsField?.label === "Programs", "programs label preserved");

assert(unitMode.class === "unit-mode-section catalog-section", "unit-mode responsive class");
assert(manifest.coverage.catalogDriven.includes("unit-mode"), "unit-mode listed as catalog-driven");
assert(stylesCss.includes(".unit-mode-section .unit-mode-radio-row"), "unit-mode radio row responsive rules");

console.log("catalog-unit-mode.test.mjs: all assertions passed");
