/**
 * Import DWHR Model Catalog from Excel (Columns A:C) into dwhr-model-catalog.generated.mjs
 *
 * Source workbook (default, first found):
 *   h2k-web-editor/catalog/source/DWHR_Efficiency_Data_Entry(3).xlsx
 *   h2k-web-editor/catalog/source/DWHR_Efficiency_Data_Entry(2).xlsx
 * Sheet: Model Catalog
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { validateDwhrCatalogWorkbookFacts, validateDwhrProductCatalog } from "../dwhr-catalog-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outMjsPath = join(root, "dwhr-model-catalog.generated.mjs");
const outJsonPath = join(root, "data/dwhr-products.json");
const sheetName = process.env.DWHR_CATALOG_SHEET || "Model Catalog";

/** @typedef {{ manufacturer: string, model: string, efficiencyAt9_5LMin: number }} DwhrProduct */

/**
 * @param {string} [editorRoot]
 * @returns {string}
 */
export function resolveDwhrCatalogWorkbookPath(editorRoot = root) {
  if (process.env.DWHR_CATALOG_XLSX) {
    return resolve(process.env.DWHR_CATALOG_XLSX);
  }
  const v3 = join(editorRoot, "catalog/source/DWHR_Efficiency_Data_Entry(3).xlsx");
  const v2 = join(editorRoot, "catalog/source/DWHR_Efficiency_Data_Entry(2).xlsx");
  if (existsSync(v3)) return v3;
  if (existsSync(v2)) return v2;
  return v3;
}

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
/**
 * @param {DwhrProduct[]} products
 * @param {{ validateWorkbookFacts?: boolean }} [options]
 */
export function formatGeneratedModule(products, options = {}) {
  const { validateWorkbookFacts = true } = options;
  if (validateWorkbookFacts) {
    validateDwhrCatalogWorkbookFacts(products);
  } else {
    validateDwhrProductCatalog(products);
  }
  const body = JSON.stringify(products, null, 2);
  return `/** Auto-generated from Model Catalog — do not edit. Run: npm run import:dwhr-catalog */\nexport const DWHR_PRODUCTS = ${body};\n`;
}

function main() {
  const workbookPath = resolveDwhrCatalogWorkbookPath();
  let workbookBytes;
  try {
    workbookBytes = readFileSync(workbookPath);
  } catch {
    console.error(`DWHR catalog workbook not found: ${workbookPath}`);
    console.error(
      "Commit DWHR_Efficiency_Data_Entry(3).xlsx to catalog/source/ or set DWHR_CATALOG_XLSX.",
    );
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
  mkdirSync(dirname(outMjsPath), { recursive: true });
  mkdirSync(dirname(outJsonPath), { recursive: true });
  writeFileSync(outMjsPath, source, "utf8");
  writeFileSync(outJsonPath, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  const manufacturers = new Set(products.map((p) => p.manufacturer));
  console.log(
    `Wrote ${outMjsPath} and ${outJsonPath}: ${products.length} rows, ${manufacturers.size} manufacturers (from ${workbookPath})`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
