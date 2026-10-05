/**
 * Apply verified Model Catalog efficiencies from regression spot checks into bundled JSON.
 * Does not replace full Excel import — fills known authoritative Column C values only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DWHR_REGRESSION_SPOT_CHECKS } from "../test/dwhr-regression-spot-checks.mjs";
import { THERMODRAIN_EFFICIENCY_AT_9_5 } from "../data/dwhr-thermodrain-authoritative-efficiencies.mjs";
import { ECODRAIN_EFFICIENCY_AT_9_5 } from "../data/dwhr-ecodrain-authoritative-efficiencies.mjs";
import { POWER_PIPE_EFFICIENCY_AT_9_5 } from "../data/dwhr-power-pipe-authoritative-efficiencies.mjs";
import { GENERIC_EFFICIENCY_AT_9_5 } from "../data/dwhr-generic-authoritative-efficiencies.mjs";
import { validateDwhrProductCatalog } from "../dwhr-catalog-core.mjs";
import { ECODRAIN_MODEL_IDS, GENERIC_MODEL_IDS, powerPipeModelIds } from "../dwhr-legacy-model-lists.mjs";

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

/** @type {Record<string, Record<string, number>>} */
const AUTHORITATIVE_BY_MANUFACTURER = {
  ThermoDrain: THERMODRAIN_EFFICIENCY_AT_9_5,
  Ecodrain: ECODRAIN_EFFICIENCY_AT_9_5,
  "Power-Pipe": POWER_PIPE_EFFICIENCY_AT_9_5,
  Generic: GENERIC_EFFICIENCY_AT_9_5,
};

let patched = 0;
for (const row of products) {
  const authoritative = AUTHORITATIVE_BY_MANUFACTURER[row.manufacturer];
  if (authoritative) {
    const eff = authoritative[row.model];
    if (eff == null) {
      throw new Error(`Bundled catalog missing ${row.manufacturer} efficiency for ${row.model}`);
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

for (const model of ECODRAIN_MODEL_IDS) {
  if (ECODRAIN_EFFICIENCY_AT_9_5[model] == null) {
    throw new Error(`Ecodrain authoritative map missing ${model}`);
  }
}
for (const model of powerPipeModelIds()) {
  if (POWER_PIPE_EFFICIENCY_AT_9_5[model] == null) {
    throw new Error(`Power-Pipe authoritative map missing ${model}`);
  }
}
for (const model of GENERIC_MODEL_IDS) {
  if (GENERIC_EFFICIENCY_AT_9_5[model] == null) {
    throw new Error(`Generic authoritative map missing ${model}`);
  }
}

writeFileSync(jsonPath, `${JSON.stringify(products, null, 2)}\n`, "utf8");
writeFileSync(
  mjsPath,
  formatGeneratedModule(products),
  "utf8",
);
console.log(`Applied ${expected.size} regression efficiencies (${patched} rows updated)`);
