import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const baseLoads = JSON.parse(readFileSync(join(root, "catalog/sections/base-loads.json"), "utf8"));
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

const renderOccupancy = extractFunction(appJs, "renderOccupancy");
assert(renderOccupancy.includes("H2kCatalog.renderSection"), "renderOccupancy delegates to catalog");
assert(renderOccupancy.includes('getSection?.("base-loads")'), "renderOccupancy checks catalog section");
assert(appJs.includes("baseLoadsGlobalControlsHTML"), "base loads global controls renderer exists");
assert(appJs.includes("baseLoadsOccupancyGridHTML"), "base loads occupancy grid renderer exists");
assert(appJs.includes("baseLoadsSummaryHTML"), "base loads summary renderer exists");
assert(appJs.includes('registerCustomRenderer("base-loads-global-controls"'), "base loads global controls registered");
assert(appJs.includes('registerCustomRenderer("base-loads-occupancy-grid"'), "base loads occupancy grid registered");
assert(appJs.includes('registerCustomRenderer("base-loads-summary"'), "base loads summary registered");
assert(appJs.includes('registerBehaviorAction("rerenderBaseLoadsSection"'), "base loads rerender behavior registered");

assert(baseLoads.migration.status === "catalog-driven", "base-loads is catalog-driven");
assert(baseLoads.verification.status === "unverified", "base-loads remains unverified");
assert(baseLoads.hot2000?.controlCount === 15, "base-loads hot2000 controlCount is 15");
assert(baseLoads.hot2000.controls.length === 15, "base-loads hot2000 controls array length");

const hotLabels = baseLoads.hot2000.controls.map((c) => c.label);
for (const label of [
  "Restore Defaults",
  "User Specified Electrical and Water Usage",
  "Occupied",
  "Fraction of internal gains applied to basement",
  "Electrical Appliances",
  "Estimated Hot Water Load",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const groupIds = baseLoads.groups.map((g) => g.id);
assert(groupIds.includes("occupancy"), "occupancy group present");
assert(groupIds.includes("internal-gains"), "internal gains group present");
assert(groupIds.includes("summary"), "summary group present");

const occupancyGrid = baseLoads.groups.flatMap((g) => g.fields).find((f) => f.id === "occupancy-grid");
assert(occupancyGrid?.renderer === "base-loads-occupancy-grid", "occupancy grid uses custom renderer");
assert(occupancyGrid?.controlSetType === "grid", "occupancy grid control set type preserved");

assert(baseLoads.class === "base-loads-section catalog-section", "base-loads responsive class");
assert(stylesCss.includes(".base-loads-section"), "base loads section CSS");
assert(stylesCss.includes(".base-loads-summary-grid"), "base loads summary grid CSS");
assert(manifest.coverage.catalogDriven.includes("base-loads"), "base-loads listed as catalog-driven");

console.log("catalog-base-loads.test.mjs: all assertions passed");
