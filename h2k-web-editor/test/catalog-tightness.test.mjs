import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const tightness = JSON.parse(readFileSync(join(root, "catalog/sections/tightness.json"), "utf8"));

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
assert(valueField?.enabledWhen?.equals === "5", "leakage value enabled only for user-specified");
assert(tightness.migration.status === "catalog-driven", "tightness is catalog-driven");
assert(tightness.verification.status === "unverified", "tightness remains unverified");

console.log("catalog-tightness.test.mjs: all assertions passed");
