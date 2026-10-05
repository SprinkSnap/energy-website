/**
 * Apply verified Model Catalog efficiencies from regression spot checks into bundled JSON.
 * Does not replace full Excel import — fills known authoritative Column C values only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DWHR_REGRESSION_SPOT_CHECKS } from "../test/dwhr-regression-spot-checks.mjs";
import { THERMODRAIN_EFFICIENCY_AT_9_5 } from "../data/dwhr-thermodrain-authoritative-efficiencies.mjs";
import { validateDwhrProductCatalog } from "../dwhr-catalog-core.mjs";

function formatGeneratedModule(products) {
  validateDwhrProductCatalog(products);
  const body = JSON.stringify(products, null, 2);
  return `/** Auto-generated from Model Catalog — do not edit. Run: npm run apply:dwhr-regression-efficiencies */\nexport const DWHR_PRODUCTS = ${body};\n`;
}

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
  if (row.manufacturer === "ThermoDrain") {
    const eff = THERMODRAIN_EFFICIENCY_AT_9_5[row.model];
    if (eff == null) {
      throw new Error(`Bundled catalog missing ThermoDrain efficiency for ${row.model}`);
    }
    if (row.efficiencyAt9_5LMin !== eff) {
      row.efficiencyAt9_5LMin = eff;
      patched += 1;
    }
    continue;
  }
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
  formatGeneratedModule(products),
  "utf8",
);
console.log(`Applied ${expected.size} regression efficiencies (${patched} rows updated)`);
