import assert from "node:assert/strict";
import {
  DWHR_MANUFACTURERS,
  DWHR_MODELS_BY_MANUFACTURER,
  DWHR_EQUIPMENT_LIBRARY,
  ECODRAIN_MODEL_IDS,
  thermoDrainModelIds,
  powerPipeModelIds,
  generateDwhrSeries,
  normalizeDwhrManufacturer,
  normalizeDwhrModel,
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

assert.equal(ECODRAIN_MODEL_IDS.length, 15, "Ecodrain model count");
assert.deepEqual(DWHR_MODELS_BY_MANUFACTURER.Ecodrain, ECODRAIN_MODEL_IDS);
assert(ECODRAIN_MODEL_IDS.includes("V1000-3-36"), "Ecodrain V1000-3-36");
assert(ECODRAIN_MODEL_IDS.includes("V1000-4-72"), "Ecodrain V1000-4-72");
assert(ECODRAIN_MODEL_IDS.includes("VT-1000-3-32"), "Ecodrain VT-1000-3-32");
assert(ECODRAIN_MODEL_IDS.includes("VT-1000-4-72"), "Ecodrain VT-1000-4-72");

assert.deepEqual(DWHR_MODELS_BY_MANUFACTURER["Watercycles Energy Recovery Inc."], []);
assert(DWHR_MODELS_BY_MANUFACTURER.Generic.includes("Low Efficiency"));

assert.equal(normalizeDwhrManufacturer("RenewABILITY Energy Solutions"), "Power-Pipe");
assert.equal(normalizeDwhrModel("Power-Pipe", "POWER-Pipe R3-60"), "R3-60");

const c3 = generateDwhrSeries("C3", 30, 120, 3);
assert.equal(c3.length, 31);
assert.deepEqual(c3[0], "C3-30");
assert.deepEqual(c3[c3.length - 1], "C3-120");
assert.deepEqual(c3[1], "C3-33");

const c4 = generateDwhrSeries("C4", 30, 120, 3);
assert.equal(c4.length, 31);
assert.deepEqual(c4[0], "C4-30");
assert.deepEqual(c4[c4.length - 1], "C4-120");

const r2 = generateDwhrSeries("R2", 24, 120, 2);
assert.equal(r2.length, 49);
assert.deepEqual(r2[0], "R2-24");
assert.deepEqual(r2[r2.length - 1], "R2-120");

const r3 = generateDwhrSeries("R3", 20, 120, 2);
assert.equal(r3.length, 51);
assert.deepEqual(r3[0], "R3-20");
assert.deepEqual(r3[r3.length - 1], "R3-120");

const r4 = generateDwhrSeries("R4", 24, 120, 2);
assert.equal(r4.length, 49);
assert.deepEqual(r4[0], "R4-24");
assert.deepEqual(r4[r4.length - 1], "R4-120");

const pp = powerPipeModelIds();
const x2 = ["X2-24", "X2-36", "X2-60", "X2-72", "X2-96"];
for (const id of x2) assert(pp.includes(id), `Power-Pipe includes ${id}`);
assert.equal(pp.filter((id) => id.startsWith("X2-")).length, 5, "X2 series count");
assert.equal(new Set(pp).size, pp.length, "Power-Pipe models have no duplicates");
assert.equal(pp.length, 31 + 31 + 49 + 51 + 49 + 5, "Power-Pipe total model count");

assert(!pp.includes("POWER-Pipe R3-60"), "legacy model id not in catalog list");
assert.equal(DWHR_EQUIPMENT_LIBRARY["Power-Pipe"]["R3-60"]?.effectivenessAt95, 56.7);

console.log("dwhr-equipment-catalog.test.mjs: all assertions passed");
