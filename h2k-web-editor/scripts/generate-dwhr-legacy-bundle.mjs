/**
 * Writes a bundled legacy catalog when the Excel workbook has not been imported yet.
 * Run `npm run import:dwhr-catalog` to replace with authoritative Model Catalog data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegacyDwhrProducts } from "../dwhr-legacy-model-lists.mjs";
import { formatGeneratedModule } from "./import-dwhr-model-catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const products = buildLegacyDwhrProducts();
const mjs = formatGeneratedModule(products);
mkdirSync(join(root, "data"), { recursive: true });
writeFileSync(join(root, "dwhr-model-catalog.generated.mjs"), mjs, "utf8");
writeFileSync(join(root, "data/dwhr-products.json"), `${JSON.stringify(products, null, 2)}\n`, "utf8");
console.log(`Legacy DWHR bundle: ${products.length} products`);
