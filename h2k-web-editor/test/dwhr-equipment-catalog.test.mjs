import assert from "node:assert/strict";
import {
  DWHR_MANUFACTURERS,
  DWHR_MODELS_BY_MANUFACTURER,
  thermoDrainModelIds,
  normalizeDwhrManufacturer,
} from "../dwhr-equipment-catalog.mjs";

assert.deepEqual(DWHR_MANUFACTURERS, [
  "ThermoDrain",
  "Ecodrain",
  "Power-Pipe",
  "Generic",
  "Watercycles Energy Recovery Inc.",
]);

const td = thermoDrainModelIds();
assert(td.includes("TD336B"), "ThermoDrain includes TD336B");
assert(td.includes("TD338B"), "ThermoDrain includes TD338B");
assert(td.includes("TD340B"), "ThermoDrain includes TD340B");
assert(td.includes("TDH3320B"), "ThermoDrain includes TDH3320B");
assert(td.includes("TDH3620B"), "ThermoDrain includes TDH3620B");
assert.equal(td.length, DWHR_MODELS_BY_MANUFACTURER.ThermoDrain.length);
assert.equal(td.length, 83, "ThermoDrain model count");

assert.deepEqual(DWHR_MODELS_BY_MANUFACTURER.Ecodrain, []);
assert.deepEqual(DWHR_MODELS_BY_MANUFACTURER["Watercycles Energy Recovery Inc."], []);
assert(DWHR_MODELS_BY_MANUFACTURER["Power-Pipe"].includes("POWER-Pipe R3-60"));
assert(DWHR_MODELS_BY_MANUFACTURER.Generic.includes("Low Efficiency"));

assert.equal(normalizeDwhrManufacturer("RenewABILITY Energy Solutions"), "Power-Pipe");

console.log("dwhr-equipment-catalog.test.mjs: all assertions passed");
