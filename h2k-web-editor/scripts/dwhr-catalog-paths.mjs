import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
