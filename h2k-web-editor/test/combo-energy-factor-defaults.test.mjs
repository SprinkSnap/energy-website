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

// 113.6 L (code 2) — natural gas only: no table
assert(
  getComboEnergyFactorDefault({ energySource: "2", equipmentType: "4", tankVolumeCode: "2" }) === null,
  "natural gas 113.6 L not in authoritative table",
);

// Oil — 113.6 L (code 2)
ef("3", "2", "2", 0.56);
ef("3", "2", "3", 0.58);
ef("3", "2", "4", 0.6);
ef("3", "2", "6", 0.61);
ef("3", "2", "5", 0.74);

// Oil — 151.4 L (code 3)
ef("3", "3", "2", 0.55);
ef("3", "3", "3", 0.57);
ef("3", "3", "4", 0.59);
ef("3", "3", "6", 0.6);
ef("3", "3", "5", 0.72);

// Oil — 189.3 L (code 4)
ef("3", "4", "2", 0.54);
ef("3", "4", "3", 0.56);
ef("3", "4", "4", 0.58);
ef("3", "4", "6", 0.59);
ef("3", "4", "5", 0.7);

// Oil — 246.1 L (code 5)
ef("3", "5", "2", 0.52);
ef("3", "5", "3", 0.54);
ef("3", "5", "4", 0.55);
ef("3", "5", "6", 0.56);
ef("3", "5", "5", 0.68);

// Oil — 302.8 L (code 6)
ef("3", "6", "2", 0.5);
ef("3", "6", "3", 0.52);
ef("3", "6", "4", 0.53);
ef("3", "6", "6", 0.54);
ef("3", "6", "5", 0.65);

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

assert(Object.keys(COMBO_ENERGY_FACTOR_DEFAULTS["3"]).length === 5, "oil has five verified tank presets");
assert(Object.keys(COMBO_ENERGY_FACTOR_DEFAULTS["4"]).length === 0, "propane table empty until sourced");

console.log("combo-energy-factor-defaults.test.mjs: all assertions passed");
