/**
 * Generic Model Catalog — 3 models with efficiencies at 9.5 L/min (%).
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDWHREfficiency, getDwhrProduct } from "../dwhr-catalog-core.mjs";
import { GENERIC_EFFICIENCY_AT_9_5 } from "../data/dwhr-generic-authoritative-efficiencies.mjs";
import { GENERIC_MODEL_IDS } from "../dwhr-legacy-model-lists.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await import("../dwhr-equipment-catalog.mjs");
const { DWHR_PRODUCTS } = await import("../dwhr-model-catalog.generated.mjs");

const genericProducts = DWHR_PRODUCTS.filter((product) => product.manufacturer === "Generic");
assert.equal(genericProducts.length, 3, "Generic product count");
assert.deepEqual(
  genericProducts.map((p) => p.model).sort(),
  [...GENERIC_MODEL_IDS].sort(),
);

for (const [model, expected] of Object.entries(GENERIC_EFFICIENCY_AT_9_5)) {
  assert.equal(getDWHREfficiency(DWHR_PRODUCTS, "Generic", model), expected, `lookup ${model}`);
  const product = getDwhrProduct(DWHR_PRODUCTS, "Generic", model);
  assert.deepEqual(product, { manufacturer: "Generic", model, efficiencyAt9_5LMin: expected });
}

console.log("dwhr-generic-boundary.test.mjs: OK (3 Generic products)");
