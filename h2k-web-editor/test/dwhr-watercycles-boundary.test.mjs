/**
 * Watercycles Energy Recovery Inc. — 8 models with efficiencies at 9.5 L/min (%).
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDWHREfficiency, getDwhrProduct } from "../dwhr-catalog-core.mjs";
import { WATERCYCLES_EFFICIENCY_AT_9_5 } from "../data/dwhr-watercycles-authoritative-efficiencies.mjs";
import { WATERCYCLES_MODEL_IDS } from "../dwhr-legacy-model-lists.mjs";

const MANUFACTURER = "Watercycles Energy Recovery Inc.";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await import("../dwhr-equipment-catalog.mjs");
const { DWHR_PRODUCTS } = await import("../dwhr-model-catalog.generated.mjs");

const watercyclesProducts = DWHR_PRODUCTS.filter((product) => product.manufacturer === MANUFACTURER);
assert.equal(watercyclesProducts.length, 8, "Watercycles product count");
assert.deepEqual(
  watercyclesProducts.map((p) => p.model).sort(),
  [...WATERCYCLES_MODEL_IDS].sort(),
);

for (const [model, expected] of Object.entries(WATERCYCLES_EFFICIENCY_AT_9_5)) {
  assert.equal(getDWHREfficiency(DWHR_PRODUCTS, MANUFACTURER, model), expected, `lookup ${model}`);
  const product = getDwhrProduct(DWHR_PRODUCTS, MANUFACTURER, model);
  assert.deepEqual(product, { manufacturer: MANUFACTURER, model, efficiencyAt9_5LMin: expected });
}

assert.equal(getDWHREfficiency(DWHR_PRODUCTS, MANUFACTURER, "WX-4060"), 52.0);

console.log("dwhr-watercycles-boundary.test.mjs: OK (8 Watercycles products)");
