import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateDwhrCatalogWorkbookFacts,
  validateBundledDwhrRegressionEfficiencies,
  validateDwhrProductCatalog,
  getDWHREfficiency as getDWHREfficiencyFromProducts,
  getDwhrProduct as getDwhrProductFromProducts,
  resolveDwhrCatalogEfficiency,
} from "../dwhr-catalog-core.mjs";
import { resolveDwhrCatalogWorkbookPath } from "../scripts/dwhr-catalog-paths.mjs";
import { DWHR_REGRESSION_SPOT_CHECKS } from "./dwhr-regression-spot-checks.mjs";

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

const catalogMod = await import("../dwhr-equipment-catalog.mjs");
const {
  DWHR_PRODUCTS,
  DWHR_MANUFACTURERS,
  dwhrEfficiencyForProduct: getDWHREfficiency,
  normalizeDwhrModel,
} = catalogMod;
const getDwhrProduct = (mfg, model) => globalThis.DwhrEquipmentCatalog.getDwhrProduct(mfg, model);

if (existsSync(workbook)) {
  validateDwhrCatalogWorkbookFacts(DWHR_PRODUCTS);
} else {
  validateDwhrProductCatalog(DWHR_PRODUCTS);
  validateBundledDwhrRegressionEfficiencies(DWHR_PRODUCTS, DWHR_REGRESSION_SPOT_CHECKS);
}

assert.deepEqual(DWHR_MANUFACTURERS, [
  "ThermoDrain",
  "Ecodrain",
  "Power-Pipe",
  "Generic",
  "Watercycles Energy Recovery Inc.",
]);

assert.equal(
  DWHR_PRODUCTS.filter((p) => p.manufacturer === "ThermoDrain").length,
  83,
  "ThermoDrain model count",
);

for (const [model, expected] of [
  ["TD372B", 55.6],
  ["TD442B", 46.0],
  ["TD460B", 57.3],
  ["TD472B", 58.4],
  ["TDH3320B", 41.0],
  ["TDH3620B", 57.2],
]) {
  assert.equal(getDWHREfficiency("ThermoDrain", model), expected, `boundary ${model}`);
}

for (const row of DWHR_PRODUCTS) {
  const expected = resolveDwhrCatalogEfficiency(row.efficiencyAt9_5LMin);
  assert.equal(
    getDWHREfficiency(row.manufacturer, row.model),
    expected,
    `lookup ${row.manufacturer} / ${row.model}`,
  );
  assert.equal(
    getDWHREfficiencyFromProducts(DWHR_PRODUCTS, row.manufacturer, row.model),
    expected,
    `core lookup ${row.manufacturer} / ${row.model}`,
  );
}

for (const [manufacturer, model, expected] of DWHR_REGRESSION_SPOT_CHECKS) {
  assert.equal(
    getDWHREfficiency(manufacturer, model),
    expected,
    `regression ${manufacturer} / ${model}`,
  );
  const product = getDwhrProduct(manufacturer, model);
  assert(product, `getDwhrProduct ${manufacturer} / ${model}`);
  assert.equal(product.manufacturer, manufacturer);
  assert.equal(product.model, model);
  assert.equal(product.efficiencyAt9_5LMin, expected);
  assert.equal(
    getDwhrProductFromProducts(DWHR_PRODUCTS, manufacturer, model)?.efficiencyAt9_5LMin,
    expected,
  );
}

const wx4060 = getDwhrProduct("Watercycles Energy Recovery Inc.", "WX-4060");
assert.deepEqual(wx4060, {
  manufacturer: "Watercycles Energy Recovery Inc.",
  model: "WX-4060",
  efficiencyAt9_5LMin: 52,
});

assert.equal(normalizeDwhrModel("Power-Pipe", "POWER-Pipe R3-60"), "R3-60");

console.log(
  `dwhr-equipment-catalog.test.mjs: OK (${DWHR_PRODUCTS.length} rows, ${DWHR_MANUFACTURERS.length} manufacturers)`,
);
