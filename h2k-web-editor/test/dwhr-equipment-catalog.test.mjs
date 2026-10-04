import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateDwhrCatalogWorkbookFacts,
  getDWHREfficiency as getDWHREfficiencyFromProducts,
} from "../dwhr-catalog-core.mjs";
import { resolveDwhrCatalogWorkbookPath } from "../scripts/import-dwhr-model-catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workbook = resolveDwhrCatalogWorkbookPath(root);

if (existsSync(workbook)) {
  const imp = spawnSync(process.execPath, [join(root, "scripts/import-dwhr-model-catalog.mjs")], {
    cwd: join(root, ".."),
    encoding: "utf8",
  });
  if (imp.status !== 0) {
    console.error(imp.stdout || imp.stderr);
    throw new Error("import:dwhr-catalog failed");
  }
}

const {
  DWHR_PRODUCTS,
  DWHR_MANUFACTURERS,
  dwhrEfficiencyForProduct: getDWHREfficiency,
  normalizeDwhrModel,
} = await import("../dwhr-equipment-catalog.mjs");

validateDwhrCatalogWorkbookFacts(DWHR_PRODUCTS);

assert.deepEqual(DWHR_MANUFACTURERS, [
  "ThermoDrain",
  "Ecodrain",
  "Power-Pipe",
  "Generic",
  "Watercycles Energy Recovery Inc.",
]);

for (const row of DWHR_PRODUCTS) {
  assert.equal(
    getDWHREfficiency(row.manufacturer, row.model),
    row.efficiencyAt9_5LMin,
    `lookup ${row.manufacturer} / ${row.model}`,
  );
  assert.equal(
    getDWHREfficiencyFromProducts(DWHR_PRODUCTS, row.manufacturer, row.model),
    row.efficiencyAt9_5LMin,
    `core lookup ${row.manufacturer} / ${row.model}`,
  );
}

/** @type {[string, string, number][]} */
const REGRESSION_SPOT_CHECKS = [
  ["ThermoDrain", "TD336B", 32.9],
  ["ThermoDrain", "TD338B", 40.4],
  ["ThermoDrain", "TD360B", 51.5],
  ["Generic", "1-Low Efficiency", 41.5],
  ["Generic", "2-Medium Efficiency", 54.2],
  ["Generic", "3-High Efficiency", 64.7],
  ["Watercycles Energy Recovery Inc.", "WX-3036", 39.7],
  ["Watercycles Energy Recovery Inc.", "WX-4060", 52.0],
  ["Ecodrain", "V1000-3-36", getDWHREfficiencyFromProducts(DWHR_PRODUCTS, "Ecodrain", "V1000-3-36")],
  ["Power-Pipe", "R3-60", getDWHREfficiencyFromProducts(DWHR_PRODUCTS, "Power-Pipe", "R3-60")],
];

for (const [manufacturer, model, expected] of REGRESSION_SPOT_CHECKS) {
  assert.equal(
    getDWHREfficiency(manufacturer, model),
    expected,
    `regression ${manufacturer} / ${model}`,
  );
}

assert.equal(normalizeDwhrModel("Power-Pipe", "POWER-Pipe R3-60"), "R3-60");

console.log(
  `dwhr-equipment-catalog.test.mjs: OK (${DWHR_PRODUCTS.length} rows, ${DWHR_MANUFACTURERS.length} manufacturers)`,
);
