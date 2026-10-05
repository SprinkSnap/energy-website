import assert from "node:assert/strict";
import { DWHR_PRODUCTS } from "../dwhr-model-catalog.generated.mjs";
import { getDWHREfficiency } from "../dwhr-catalog-core.mjs";

const thermoDrain = DWHR_PRODUCTS.filter((p) => p.manufacturer === "ThermoDrain");
assert.equal(thermoDrain.length, 83, "ThermoDrain product count");

for (const model of ["TD372B", "TD442B", "TD460B", "TD472B", "TDH3320B", "TDH3620B"]) {
  assert(thermoDrain.some((p) => p.model === model), `catalog includes ${model}`);
}

const boundary = [
  ["TD372B", 55.6],
  ["TD442B", 46.0],
  ["TD460B", 57.3],
  ["TD472B", 58.4],
  ["TDH3320B", 41.0],
  ["TDH3500B", 52.1],
  ["TDH3620B", 57.2],
];

for (const [model, expected] of boundary) {
  assert.equal(
    getDWHREfficiency(DWHR_PRODUCTS, "ThermoDrain", model),
    expected,
    `ThermoDrain ${model}`,
  );
}

console.log("dwhr-thermodrain-boundary.test.mjs: OK");
