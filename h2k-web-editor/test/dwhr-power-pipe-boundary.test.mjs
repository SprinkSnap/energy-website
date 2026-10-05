/**
 * Power-Pipe Model Catalog — all 216 manufacturer + model → efficiency at 9.5 L/min (%).
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDWHREfficiency, getDwhrProduct } from "../dwhr-catalog-core.mjs";
import { POWER_PIPE_EFFICIENCY_AT_9_5 } from "../data/dwhr-power-pipe-authoritative-efficiencies.mjs";
import { powerPipeModelIds } from "../dwhr-legacy-model-lists.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await import("../dwhr-equipment-catalog.mjs");
const { DWHR_PRODUCTS } = await import("../dwhr-model-catalog.generated.mjs");

const powerPipeProducts = DWHR_PRODUCTS.filter((product) => product.manufacturer === "Power-Pipe");
assert.equal(powerPipeProducts.length, 216, "Power-Pipe product count");
assert.deepEqual(
  powerPipeProducts.map((p) => p.model).sort(),
  powerPipeModelIds().sort(),
  "Power-Pipe models match catalog ids",
);

/** @type {[string, number][]} */
const FAMILY_REGRESSION = [
  ["C3-30", 23.8],
  ["C3-120", 61.2],
  ["C4-30", 20.1],
  ["C4-120", 67.4],
  ["R2-24", 19.9],
  ["R2-120", 60.5],
  ["R3-20", 21.6],
  ["R3-120", 71.1],
  ["R4-24", 30.9],
  ["R4-120", 72.8],
  ["X2-24", 25.0],
  ["X2-96", 61.5],
];

for (const [model, expected] of FAMILY_REGRESSION) {
  assert.equal(POWER_PIPE_EFFICIENCY_AT_9_5[model], expected, `authoritative ${model}`);
  assert.equal(getDWHREfficiency(DWHR_PRODUCTS, "Power-Pipe", model), expected, `lookup ${model}`);
}

for (const model of powerPipeModelIds()) {
  const expected = POWER_PIPE_EFFICIENCY_AT_9_5[model];
  assert(expected != null, `authoritative map missing ${model}`);
  const product = getDwhrProduct(DWHR_PRODUCTS, "Power-Pipe", model);
  assert(product, `catalog row ${model}`);
  assert.equal(product.efficiencyAt9_5LMin, expected);
  assert.equal(getDWHREfficiency(DWHR_PRODUCTS, "Power-Pipe", model), expected);
  assert.ok(Number.isFinite(expected) && expected > 0 && expected <= 100);
}

console.log("dwhr-power-pipe-boundary.test.mjs: OK (216 Power-Pipe products)");
