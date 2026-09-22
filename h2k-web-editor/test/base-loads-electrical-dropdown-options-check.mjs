import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadOptionLabels(packId) {
  const pack = JSON.parse(readFileSync(join(root, "catalog/options", `${packId}.json`), "utf8"));
  return Object.values(pack.options).map((o) => o.en);
}

const fuels = loadOptionLabels("appliance-fuels");
assert(fuels.join("|") === "Electric|Natural Gas|Propane", "Appliance fuel options");

const dryerRated = loadOptionLabels("dryer-rated-values");
assert(dryerRated.join("|") === "Default|User Specified", "Dryer rated values");

const stoveRated = loadOptionLabels("stove-rated-values");
assert(stoveRated.join("|") === "Default|User Specified", "Stove rated values");

const fridgeRated = loadOptionLabels("refrigerator-rated");
assert(fridgeRated.join("|") === "Default|User Specified", "Refrigerator rated values");

const lighting = loadOptionLabels("interior-lighting");
assert(
  lighting.join("|") === "< 25% CFL or LED|25%-75% CFL or LED|>75% CFL or LED|User Specified",
  "Interior lighting options",
);

const catalog = readFileSync(join(root, "catalog/sections/base-loads-electrical.json"), "utf8");
assert(!/"readOnly"\s*:\s*true/.test(catalog), "Electrical Usage catalog must not mark fields readOnly");

console.log("base-loads-electrical-dropdown-options-check: all tests passed");
