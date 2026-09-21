import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

const EXPECTED_IDS = [
  "general",
  "info",
  "specifications",
  "weather",
  "fuel",
  "unit-mode",
  "tightness",
  "codes",
];

const EXPECTED_TITLES = [
  "General",
  "House Info",
  "Specifications",
  "House Weather",
  "House Fuel Cost",
  "House Units & Mode",
  "Window tightness",
  "House Code Summary",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractHouseNavItems(source) {
  const marker = "const HOUSE_NAV = [";
  const start = source.indexOf(marker);
  assert(start >= 0, "HOUSE_NAV not found");
  const slice = source.slice(start);
  const ids = [...slice.matchAll(/\{id:"([^"]+)"/g)].map((m) => m[1]);
  const titles = [...slice.matchAll(/title:"([^"]+)"/g)].map((m) => m[1]);
  return { ids: ids.slice(0, 8), titles: titles.slice(0, 8) };
}

const { ids, titles } = extractHouseNavItems(appJs);
assert(ids.join("|") === EXPECTED_IDS.join("|"), `HOUSE_NAV ids must match canonical order: ${ids.join(", ")}`);
assert(titles.join("|") === EXPECTED_TITLES.join("|"), `HOUSE_NAV titles must match canonical order: ${titles.join(", ")}`);
assert(appJs.includes("getSectionNavGroups(view)"), "section navigation derives from shared nav groups");
assert(appJs.includes("if(view===\"house\") return HOUSE_NAV"), "house navigation uses HOUSE_NAV");

console.log("house-nav-order.test.mjs: all assertions passed");
