/**
 * Apply verified Model Catalog efficiencies from regression spot checks into bundled JSON.
 * Does not replace full Excel import — fills known authoritative Column C values only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DWHR_REGRESSION_SPOT_CHECKS } from "../test/dwhr-regression-spot-checks.mjs";
import { formatGeneratedModule } from "./import-dwhr-model-catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "data/dwhr-products.json");
const mjsPath = join(root, "dwhr-model-catalog.generated.mjs");

const products = JSON.parse(readFileSync(jsonPath, "utf8"));
/** @type {Map<string, number>} */
const expected = new Map(
  DWHR_REGRESSION_SPOT_CHECKS.map(([manufacturer, model, efficiencyAt9_5LMin]) => [
    `${manufacturer}\0${model}`,
    efficiencyAt9_5LMin,
  ]),
);

let patched = 0;
for (const row of products) {
  const key = `${row.manufacturer}\0${row.model}`;
  if (!expected.has(key)) continue;
  const eff = expected.get(key);
  if (row.efficiencyAt9_5LMin !== eff) {
    row.efficiencyAt9_5LMin = eff;
    patched += 1;
  }
}

writeFileSync(jsonPath, `${JSON.stringify(products, null, 2)}\n`, "utf8");
writeFileSync(
  mjsPath,
  formatGeneratedModule(products, { validateWorkbookFacts: false }),
  "utf8",
);
console.log(`Applied ${expected.size} regression efficiencies (${patched} rows updated)`);
