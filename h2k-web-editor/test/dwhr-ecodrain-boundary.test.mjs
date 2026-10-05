/**
 * Ecodrain catalog boundary: regression spot checks covered V1000-3-36/48/60 only;
 * bundled rows after V1000-3-60 must still resolve via full DWHR_PRODUCTS lookup.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDWHREfficiency,
  getDwhrProduct,
} from "../dwhr-catalog-core.mjs";
import { ECODRAIN_MODEL_IDS } from "../dwhr-legacy-model-lists.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await import("../dwhr-equipment-catalog.mjs");
const { DWHR_PRODUCTS } = await import("../dwhr-model-catalog.generated.mjs");

const ecodrainProducts = DWHR_PRODUCTS.filter((product) => product.manufacturer === "Ecodrain");
assert.equal(ecodrainProducts.length, 15, "Ecodrain product count");
assert.deepEqual(
  ecodrainProducts.map((p) => p.model).sort(),
  [...ECODRAIN_MODEL_IDS].sort(),
  "Ecodrain models match catalog ids",
);

assert.equal(getDWHREfficiency(DWHR_PRODUCTS, "Ecodrain", "V1000-3-60"), 60.3, "boundary before V1000-3-72");
const v372 = getDwhrProduct(DWHR_PRODUCTS, "Ecodrain", "V1000-3-72");
assert(v372, "V1000-3-72 product row exists");
assert.equal(getDWHREfficiency(DWHR_PRODUCTS, "Ecodrain", "V1000-3-72"), v372.efficiencyAt9_5LMin);
assert.notEqual(getDWHREfficiency(DWHR_PRODUCTS, "Ecodrain", "V1000-3-72"), 0);
assert.notEqual(getDWHREfficiency(DWHR_PRODUCTS, "Ecodrain", "V1000-3-72"), null);

assert.equal(getDWHREfficiency(DWHR_PRODUCTS, "Ecodrain", "V1000-4-72"), 67.5);

for (const product of ecodrainProducts) {
  const matched = getDwhrProduct(DWHR_PRODUCTS, product.manufacturer, product.model);
  assert.deepEqual(matched, product);
  assert.equal(
    getDWHREfficiency(DWHR_PRODUCTS, product.manufacturer, product.model),
    product.efficiencyAt9_5LMin,
    `efficiency ${product.model}`,
  );
  assert.ok(Number.isFinite(product.efficiencyAt9_5LMin) && product.efficiencyAt9_5LMin > 0);
}

console.log("dwhr-ecodrain-boundary.test.mjs: OK (15 Ecodrain products)");
