/**
 * Import DWHR Model Catalog from Excel (Columns A:C) into dwhr-model-catalog.generated.mjs
 *
 * Source workbook (default):
 *   h2k-web-editor/catalog/source/DWHR_Efficiency_Data_Entry(2).xlsx
 * Sheet: Model Catalog
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { validateDwhrProductCatalog } from "../dwhr-catalog-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWorkbook = join(root, "catalog/source/DWHR_Efficiency_Data_Entry(2).xlsx");
const workbookPath = resolve(process.env.DWHR_CATALOG_XLSX || defaultWorkbook);
const outPath = join(root, "dwhr-model-catalog.generated.mjs");
const sheetName = process.env.DWHR_CATALOG_SHEET || "Model Catalog";

/** @typedef {{ manufacturer: string, model: string, efficiencyAt9_5LMin: number }} DwhrProduct */

/**
 * @param {unknown[][]} rows
 * @returns {DwhrProduct[]}
 */
export function parseModelCatalogRows(rows) {
  /** @type {DwhrProduct[]} */
  const products = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 3) continue;
    const a = String(row[0] ?? "").trim();
    const b = String(row[1] ?? "").trim();
    const cRaw = row[2];
    const headerLike =
      /^manufacturer$/i.test(a) && /^model$/i.test(b) && /efficiency/i.test(String(cRaw ?? ""));
    if (headerLike) continue;
    if (!a && !b && (cRaw === "" || cRaw == null)) continue;
    const efficiency = Number(cRaw);
    products.push({ manufacturer: a, model: b, efficiencyAt9_5LMin: efficiency });
  }
  return products;
}

/**
 * @param {DwhrProduct[]} products
 * @returns {string}
 */
export function formatGeneratedModule(products) {
  validateDwhrProductCatalog(products);
  const body = JSON.stringify(products, null, 2);
  return `/** Auto-generated from Model Catalog — do not edit. Run: npm run import:dwhr-catalog */\nexport const DWHR_PRODUCTS = ${body};\n`;
}

function main() {
  let workbookBytes;
  try {
    workbookBytes = readFileSync(workbookPath);
  } catch {
    console.error(`DWHR catalog workbook not found: ${workbookPath}`);
    console.error("Commit DWHR_Efficiency_Data_Entry(2).xlsx to catalog/source/ or set DWHR_CATALOG_XLSX.");
    process.exit(1);
  }
  const wb = XLSX.read(workbookBytes, { type: "buffer" });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.error(`Sheet not found: ${sheetName}`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const products = parseModelCatalogRows(rows);
  const source = formatGeneratedModule(products);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, source, "utf8");
  const manufacturers = new Set(products.map((p) => p.manufacturer));
  console.log(
    `Wrote ${outPath}: ${products.length} rows, ${manufacturers.size} manufacturers`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
