import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import XLSX from "xlsx";
import {
  validateDwhrProductCatalog,
  getDWHRManufacturers,
  getDWHRModels,
  getDWHREfficiency,
} from "../dwhr-catalog-core.mjs";
import { parseModelCatalogRows, formatGeneratedModule } from "../scripts/import-dwhr-model-catalog.mjs";

const fixtureRows = [
  ["Manufacturer", "Model", "Efficiency at 9.5 L/min (%)"],
  ["ThermoDrain", "TD336B", 32.9],
  ["Ecodrain", "V1000-3-36", 41.2],
  ["Power-Pipe", "R3-60", 56.7],
  ["Generic", "2-Medium Efficiency", 54.2],
  ["Watercycles Energy Recovery Inc.", "WX-3036", 44.5],
];

const products = parseModelCatalogRows(fixtureRows);
assert.equal(products.length, 5);
validateDwhrProductCatalog(products);
assert.deepEqual(getDWHRManufacturers(products), [
  "ThermoDrain",
  "Ecodrain",
  "Power-Pipe",
  "Generic",
  "Watercycles Energy Recovery Inc.",
]);
assert.equal(getDWHREfficiency(products, "ThermoDrain", "TD336B"), 32.9);
assert.equal(getDWHREfficiency(products, "Power-Pipe", "R3-60"), 56.7);
assert.equal(getDWHREfficiency(products, "ThermoDrain", "TD999B"), null);
assert.equal(getDWHREfficiency(products, "Ecodrain", "R3-60"), null);

assert.throws(() => validateDwhrProductCatalog([{ manufacturer: "", model: "X", efficiencyAt9_5LMin: 1 }]));
assert.throws(() => validateDwhrProductCatalog([{ manufacturer: "A", model: "", efficiencyAt9_5LMin: 1 }]));
assert.throws(() => validateDwhrProductCatalog([{ manufacturer: "A", model: "X", efficiencyAt9_5LMin: NaN }]));
assert.throws(() => validateDwhrProductCatalog([{ manufacturer: "A", model: "X", efficiencyAt9_5LMin: 101 }]));
assert.throws(() =>
  validateDwhrProductCatalog([
    { manufacturer: "A", model: "X", efficiencyAt9_5LMin: 1 },
    { manufacturer: "A", model: "X", efficiencyAt9_5LMin: 2 },
  ]),
);

const dir = mkdtempSync(join(tmpdir(), "dwhr-import-"));
const xlsxPath = join(dir, "catalog.xlsx");
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(fixtureRows);
XLSX.utils.book_append_sheet(wb, ws, "Model Catalog");
writeFileSync(xlsxPath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
const readBack = XLSX.read(readFileSync(xlsxPath), { type: "buffer" });
const imported = parseModelCatalogRows(
  XLSX.utils.sheet_to_json(readBack.Sheets["Model Catalog"], { header: 1, defval: "" }),
);
assert.deepEqual(imported, products);
assert.throws(() => formatGeneratedModule(products.slice(0, 1)));
assert.throws(() => formatGeneratedModule(products, { validateWorkbookFacts: true }));
const legacySlice = formatGeneratedModule(products, { validateWorkbookFacts: false });
assert.match(legacySlice, /export const DWHR_PRODUCTS/);

console.log("dwhr-import-model-catalog.test.mjs: OK");
