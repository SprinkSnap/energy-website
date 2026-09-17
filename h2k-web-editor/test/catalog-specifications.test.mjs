import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const specifications = JSON.parse(readFileSync(join(root, "catalog/sections/specifications.json"), "utf8"));

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

const renderSpecifications = extractFunction(appJs, "renderSpecificationsTab");
assert(renderSpecifications.includes("H2kCatalog.renderSection"), "renderSpecificationsTab delegates to catalog");
assert(renderSpecifications.includes('getSection?.("specifications")'), "renderSpecificationsTab checks catalog section");

assert(specifications.migration.status === "catalog-driven", "specifications is catalog-driven");
assert(specifications.class === "specifications-section", "specifications section class");
assert(specifications.hot2000.controlCount === 20, "specifications inventory has 20 HOT2000 controls");
assert(specifications.groups.length === 3, "specifications has three logical groups");

const groupTitles = specifications.groups.map((g) => g.title);
assert(groupTitles.includes("Building description"), "building description group");
assert(groupTitles.includes("Construction & site conditions"), "construction group");
assert(groupTitles.includes("Compliance & heated floor area"), "compliance group");

const paths = specifications.groups.flatMap((g) => g.fields).flatMap((f) => (f.path ? [f.path] : []));
for (const path of [
  "/HouseFile/House/Specifications/HouseType",
  "/HouseFile/House/Specifications/PlanShape",
  "/HouseFile/House/Specifications/HeatedFloorArea/@aboveGrade",
  "/HouseFile/House/Specifications/ThermalMass",
  "/HouseFile/House/Specifications/WallColour",
  "/HouseFile/House/Specifications/@eligibleForNBC",
]) {
  assert(paths.includes(path), `specifications catalog binds ${path}`);
}

const labels = specifications.hot2000.controls.map((c) => c.label);
assert(labels.includes("Front orientation"), "front orientation label");
assert(labels.includes("Foundation soil condition"), "foundation soil label");
assert(labels.includes("Above-grade heated area"), "above-grade heated area label");

console.log("catalog-specifications.test.mjs: all assertions passed");
