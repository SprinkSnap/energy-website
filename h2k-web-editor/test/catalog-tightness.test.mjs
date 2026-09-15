import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const tightness = JSON.parse(readFileSync(join(root, "catalog/sections/tightness.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/tightness.json"), "utf8"),
);

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

const renderTightness = extractFunction(appJs, "renderTightnessTab");
assert(renderTightness.includes("H2kCatalog.renderSection"), "renderTightnessTab delegates to catalog");
assert(renderTightness.includes('getSection?.("tightness")'), "renderTightnessTab checks catalog section");

const fields = tightness.groups.flatMap((g) => g.fields);
const classField = fields.find((f) => f.id === "class");
const valueField = fields.find((f) => f.id === "leakage-value");
assert(classField?.optionsRef === "window-tightness", "tightness class uses window-tightness options");
assert(classField?.bind?.dictFor === "window-tightness", "tightness class bind dictFor");
assert(valueField?.enabledWhen?.equals === "5", "leakage value enabled only for user-specified");
assert(tightness.migration.status === "catalog-driven", "tightness is catalog-driven");
assert(tightness.verification.status === "unverified", "tightness remains unverified");

assert(tightness.hot2000?.controlCount === 2, "tightness hot2000 controlCount is 2");
const hotLabels = tightness.hot2000.controls.map((c) => c.label);
for (const label of ["Window tightness", "Leakage value (L/s·m²)"]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const groupTitles = tightness.groups.map((g) => g.title);
assert(groupTitles.includes("Window tightness"), "window tightness group title");

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(tightness.class === "tightness-section catalog-section", "tightness responsive class");
assert(stylesCss.includes(".tightness-section .tightness-spec-layout") || stylesCss.includes(".tightness-section"), "tightness section CSS");
assert(stylesCss.includes(".tightness-section .field select"), "tightness field select rules");

console.log("catalog-tightness.test.mjs: all assertions passed");
