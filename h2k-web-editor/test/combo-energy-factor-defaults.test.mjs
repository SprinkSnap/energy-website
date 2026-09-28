import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMBO_ENERGY_FACTOR_DEFAULTS,
  getComboEnergyFactorDefault,
} from "../combo-energy-factor-defaults.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ef(fuel, tankCode, equip, expected) {
  const got = getComboEnergyFactorDefault({
    energySource: fuel,
    equipmentType: equip,
    tankVolumeCode: tankCode,
  });
  assert(got === expected, `fuel=${fuel} tank=${tankCode} equip=${equip}: expected ${expected}, got ${got}`);
}

assert(appJs.includes("heatingComboApplyEnergyFactorDefault"), "app wires combo EF default apply");
assert(appJs.includes("ComboEnergyFactorDefaults"), "app uses combo EF lookup module");
assert(!appJs.includes("data-heating-combo-ef-display"), "no duplicate EF display span");

// Natural gas — 151.4 L (code 3)
ef("2", "3", "1", 0.56);
ef("2", "3", "2", 0.6);
ef("2", "3", "3", 0.6);
ef("2", "3", "4", 0.61);
ef("2", "3", "5", 0.82);

// 189.3 L (code 4)
ef("2", "4", "1", 0.54);
ef("2", "4", "2", 0.59);
ef("2", "4", "3", 0.6);
ef("2", "4", "4", 0.59);
ef("2", "4", "5", 0.8);

// 246.1 L (code 5)
ef("2", "5", "1", 0.51);
ef("2", "5", "2", 0.58);
ef("2", "5", "3", 0.6);
ef("2", "5", "4", 0.57);
ef("2", "5", "5", 0.77);

// 302.8 L (code 6)
ef("2", "6", "1", 0.48);
ef("2", "6", "2", 0.57);
ef("2", "6", "3", 0.6);
ef("2", "6", "4", 0.55);
ef("2", "6", "5", 0.74);

// Induced draft fan across verified natural-gas tank presets
ef("2", "3", "4", 0.61);
ef("2", "4", "4", 0.59);
ef("2", "5", "4", 0.57);
ef("2", "6", "4", 0.55);

// 113.6 L (code 2) — no authoritative table
assert(
  getComboEnergyFactorDefault({ energySource: "2", equipmentType: "4", tankVolumeCode: "2" }) === null,
  "113.6 L not in authoritative table",
);

// Default new-house combination
assert(
  getComboEnergyFactorDefault({ energySource: "2", equipmentType: "4", tankVolumeCode: "3" }) === 0.61,
  "default combo EF is 0.61",
);

// User-specified tank litres matching a preset
assert(
  getComboEnergyFactorDefault({
    energySource: "2",
    equipmentType: "2",
    tankVolumeCode: "1",
    tankVolumeLitres: 189.3,
  }) === 0.59,
  "user-specified litres matching preset uses lookup",
);

assert(Object.keys(COMBO_ENERGY_FACTOR_DEFAULTS["3"]).length === 0, "oil table empty until sourced");
assert(Object.keys(COMBO_ENERGY_FACTOR_DEFAULTS["4"]).length === 0, "propane table empty until sourced");

console.log("combo-energy-factor-defaults.test.mjs: all assertions passed");
