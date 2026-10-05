/**
 * Ecodrain Model Catalog — all 15 manufacturer + model → efficiency at 9.5 L/min (%).
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDWHREfficiency, getDwhrProduct } from "../dwhr-catalog-core.mjs";
import { ECODRAIN_EFFICIENCY_AT_9_5 } from "../data/dwhr-ecodrain-authoritative-efficiencies.mjs";
import { ECODRAIN_MODEL_IDS } from "../dwhr-legacy-model-lists.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await import("../dwhr-equipment-catalog.mjs");
const { DWHR_PRODUCTS } = await import("../dwhr-model-catalog.generated.mjs");

/** @type {[string, string, number][]} */
export const ECODRAIN_CATALOG_SPOT_CHECKS = Object.entries(ECODRAIN_EFFICIENCY_AT_9_5).map(
  ([model, efficiencyAt9_5LMin]) => ["Ecodrain", model, efficiencyAt9_5LMin],
);

const ecodrainProducts = DWHR_PRODUCTS.filter((product) => product.manufacturer === "Ecodrain");
assert.equal(ecodrainProducts.length, 15, "Ecodrain product count");
assert.deepEqual(
  ecodrainProducts.map((p) => p.model).sort(),
  [...ECODRAIN_MODEL_IDS].sort(),
  "Ecodrain models match catalog ids",
);

assert.equal(getDWHREfficiency(DWHR_PRODUCTS, "Ecodrain", "V1000-3-60"), 60.3, "boundary before V1000-3-72");
assert.equal(getDWHREfficiency(DWHR_PRODUCTS, "Ecodrain", "V1000-3-72"), 62.8, "V1000-3-72 boundary");

for (const [manufacturer, model, expected] of ECODRAIN_CATALOG_SPOT_CHECKS) {
  const product = getDwhrProduct(DWHR_PRODUCTS, manufacturer, model);
  assert(product, `missing catalog row ${manufacturer} / ${model}`);
  assert.equal(product.efficiencyAt9_5LMin, expected, `catalog row ${model}`);
  assert.equal(getDWHREfficiency(DWHR_PRODUCTS, manufacturer, model), expected, `lookup ${model}`);
  assert.notEqual(expected, 0);
}

for (const product of ecodrainProducts) {
  const matched = getDwhrProduct(DWHR_PRODUCTS, product.manufacturer, product.model);
  assert.deepEqual(matched, product);
  assert.equal(
    getDWHREfficiency(DWHR_PRODUCTS, product.manufacturer, product.model),
    product.efficiencyAt9_5LMin,
  );
}

console.log("dwhr-ecodrain-boundary.test.mjs: OK (15 Ecodrain products)");
