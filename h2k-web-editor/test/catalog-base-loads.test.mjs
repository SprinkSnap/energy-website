import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const baseLoads = JSON.parse(readFileSync(join(root, "catalog/sections/base-loads.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/base-loads.json"), "utf8"),
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

const renderOccupancy = extractFunction(appJs, "renderOccupancy");
assert(renderOccupancy.includes("H2kCatalog.renderSection"), "renderOccupancy delegates to catalog");
assert(renderOccupancy.includes('getSection?.("base-loads")'), "renderOccupancy checks catalog section");
assert(appJs.includes("baseLoadsEditorHTML"), "base loads editor renderer exists");
assert(appJs.includes('registerCustomRenderer("base-loads-editor"'), "base loads editor registered");
assert(appJs.includes('registerCustomRenderer("base-loads-editor:bind"'), "base loads bind registered");

assert(baseLoads.migration.status === "catalog-driven", "base-loads is catalog-driven");
assert(baseLoads.verification.status === "unverified", "base-loads remains unverified");
assert(baseLoads.hot2000?.controlCount === 61, "base-loads hot2000 controlCount is 61");
assert(baseLoads.hot2000.controls.length === 61, "base-loads hot2000 controls array length");

const hotLabels = baseLoads.hot2000.controls.map((c) => c.label);
for (const label of [
  "User Specified Electrical and Water Usage",
  "Restore Defaults",
  "Occupied",
  "Fraction of internal gains applied to basement",
  "Faucet flow rate",
  "Daily electrical energy consumption",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const editorField = baseLoads.groups.flatMap((g) => g.fields).find((f) => f.id === "base-loads-editor");
assert(editorField?.renderer === "base-loads-editor", "base loads editor uses custom renderer");
assert(editorField?.path === "/HouseFile/House/BaseLoads", "base loads editor path");

assert(baseLoads.class === "base-loads-section catalog-section", "base-loads responsive class");
assert(stylesCss.includes(".base-loads-section"), "base loads section CSS");
assert(manifest.coverage.catalogDriven.includes("base-loads"), "base-loads listed as catalog-driven");

assert(capture.fields[0]?.xmlPath === "/HouseFile/House/BaseLoads", "capture maps BaseLoads root");

console.log("catalog-base-loads.test.mjs: all assertions passed");
