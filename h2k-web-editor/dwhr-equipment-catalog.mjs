/**
 * DWHR equipment catalog — manufacturers, models, and efficiency from Model Catalog (Excel).
 * Generated data: dwhr-model-catalog.generated.mjs (see scripts/import-dwhr-model-catalog.mjs).
 */

export { DWHR_PRODUCTS } from "./dwhr-model-catalog.generated.mjs";
import { DWHR_PRODUCTS } from "./dwhr-model-catalog.generated.mjs";
import {
  buildModelsByManufacturer,
  getDWHRManufacturers,
  getDWHRModels,
  getDWHREfficiency,
  getDwhrProduct,
} from "./dwhr-catalog-core.mjs";

export {
  validateDwhrProductCatalog,
  validateDwhrCatalogWorkbookFacts,
  validateBundledDwhrRegressionEfficiencies,
  getDWHRManufacturers,
  getDWHRModels,
  getDWHREfficiency,
  getDwhrProduct,
} from "./dwhr-catalog-core.mjs";

if (DWHR_PRODUCTS.length === 0 && typeof console !== "undefined") {
  console.error(
    "DWHR Model Catalog is empty. Run npm run generate:dwhr-legacy-catalog or npm run import:dwhr-catalog.",
  );
}

export const DWHR_MANUFACTURERS = getDWHRManufacturers(DWHR_PRODUCTS);
export const DWHR_MODELS_BY_MANUFACTURER = buildModelsByManufacturer(DWHR_PRODUCTS);

/** Map legacy stored manufacturer names to current catalog labels. */
export const DWHR_MANUFACTURER_ALIASES = {
  "RenewABILITY Energy Solutions": "Power-Pipe",
};

/** Map legacy stored model ids to current catalog labels (by manufacturer). */
export const DWHR_MODEL_ALIASES = {
  "Power-Pipe": {
    "POWER-Pipe R3-60": "R3-60",
  },
  Generic: {
    "Low Efficiency": "1-Low Efficiency",
    "Medium Efficiency": "2-Medium Efficiency",
  },
};

/**
 * @param {string | null | undefined} stored
 * @returns {string}
 */
export function normalizeDwhrManufacturer(stored) {
  const name = String(stored ?? "").trim();
  if (!name) return "";
  if (DWHR_MANUFACTURERS.includes(name)) return name;
  const alias = DWHR_MANUFACTURER_ALIASES[name];
  if (alias && DWHR_MANUFACTURERS.includes(alias)) return alias;
  return name;
}

/**
 * @param {string} manufacturer
 * @param {string | null | undefined} storedModel
 * @returns {string}
 */
export function normalizeDwhrModel(manufacturer, storedModel) {
  const mfg = normalizeDwhrManufacturer(manufacturer);
  const model = String(storedModel ?? "").trim();
  if (!model) return "";
  const alias = DWHR_MODEL_ALIASES[mfg]?.[model];
  if (alias) return alias;
  return model;
}

/**
 * @param {string} manufacturer
 * @returns {string[]}
 */
export function dwhrModelsForManufacturer(manufacturer) {
  const key = normalizeDwhrManufacturer(manufacturer);
  return key ? getDWHRModels(DWHR_PRODUCTS, key) : [];
}

/**
 * @param {string} manufacturer
 * @param {string} model
 * @returns {number | null}
 */
export function dwhrEfficiencyForProduct(manufacturer, model) {
  const mfg = normalizeDwhrManufacturer(manufacturer);
  const modelId = normalizeDwhrModel(mfg, model);
  if (!mfg || !modelId) return null;
  return getDWHREfficiency(DWHR_PRODUCTS, mfg, modelId);
}

/** @deprecated Use dwhrEfficiencyForProduct — kept for callers expecting library shape. */
export const DWHR_EQUIPMENT_LIBRARY = (() => {
  /** @type {Record<string, Record<string, { effectivenessAt95: number }>>} */
  const library = {};
  for (const row of DWHR_PRODUCTS) {
    if (!library[row.manufacturer]) library[row.manufacturer] = {};
    library[row.manufacturer][row.model] = { effectivenessAt95: row.efficiencyAt9_5LMin };
  }
  return library;
})();

globalThis.DwhrEquipmentCatalog = {
  DWHR_PRODUCTS,
  DWHR_MANUFACTURERS,
  DWHR_MODELS_BY_MANUFACTURER,
  DWHR_EQUIPMENT_LIBRARY,
  DWHR_MANUFACTURER_ALIASES,
  DWHR_MODEL_ALIASES,
  normalizeDwhrManufacturer,
  normalizeDwhrModel,
  dwhrModelsForManufacturer,
  getDWHRManufacturers: () => DWHR_MANUFACTURERS,
  getDWHRModels: (mfg) => dwhrModelsForManufacturer(mfg),
  getDWHREfficiency: (mfg, model) => dwhrEfficiencyForProduct(mfg, model),
  getDwhrProduct: (mfg, model) => {
    const normalizedMfg = normalizeDwhrManufacturer(mfg);
    const modelId = normalizeDwhrModel(normalizedMfg, model);
    return getDwhrProduct(DWHR_PRODUCTS, normalizedMfg, modelId);
  },
  dwhrEfficiencyForProduct,
};
