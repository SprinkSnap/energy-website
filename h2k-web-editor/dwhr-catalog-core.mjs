/**
 * Shared DWHR catalog validation and lookup helpers (manufacturer + model keys).
 */

/** @typedef {{ manufacturer: string, model: string, efficiencyAt9_5LMin: number }} DwhrProduct */

/** HOT2000 manufacturer dropdown order (subset validated against catalog). */
export const DWHR_MANUFACTURER_ORDER = [
  "ThermoDrain",
  "Ecodrain",
  "Power-Pipe",
  "Generic",
  "Watercycles Energy Recovery Inc.",
];

/** Expected Model Catalog row counts (DWHR_Efficiency_Data_Entry workbook). */
export const DWHR_EXPECTED_TOTAL_PRODUCTS = 325;

/** @type {Record<string, number>} */
export const DWHR_EXPECTED_MANUFACTURER_COUNTS = {
  ThermoDrain: 83,
  Ecodrain: 15,
  "Power-Pipe": 216,
  Generic: 3,
  "Watercycles Energy Recovery Inc.": 8,
};

/** @param {DwhrProduct[]} products */
export function validateDwhrProductCatalog(products) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("DWHR catalog must contain at least one product row");
  }
  const seen = new Set();
  for (let i = 0; i < products.length; i += 1) {
    const { manufacturer, model, efficiencyAt9_5LMin } = products[i];
    if (!String(manufacturer ?? "").trim()) {
      throw new Error(`Row ${i + 1}: manufacturer is blank`);
    }
    if (!String(model ?? "").trim()) {
      throw new Error(`Row ${i + 1}: model is blank`);
    }
    if (efficiencyAt9_5LMin === "" || efficiencyAt9_5LMin == null || Number.isNaN(Number(efficiencyAt9_5LMin))) {
      throw new Error(`Row ${i + 1}: efficiency is not numeric (${manufacturer} / ${model})`);
    }
    const eff = Number(efficiencyAt9_5LMin);
    if (eff < 0 || eff > 100) {
      throw new Error(`Row ${i + 1}: efficiency out of range 0–100 (${eff})`);
    }
    const key = `${manufacturer}\0${model}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate manufacturer + model: ${manufacturer} / ${model}`);
    }
    seen.add(key);
  }
}

/**
 * Validate bundled catalog matches authoritative workbook facts (325 rows, 5 manufacturers).
 * @param {DwhrProduct[]} products
 */
/**
 * Reject placeholder 0% efficiencies on bundled catalog rows covered by regression spot checks.
 * Full import still requires DWHR_Efficiency_Data_Entry(3).xlsx (see catalog/source/README.md).
 * @param {DwhrProduct[]} products
 * @param {[string, string, number][]} regressionPairs
 */
export function validateBundledDwhrRegressionEfficiencies(products, regressionPairs) {
  validateDwhrProductCatalog(products);
  const ecodrainRows = products.filter((p) => p.manufacturer === "Ecodrain");
  if (ecodrainRows.length !== DWHR_EXPECTED_MANUFACTURER_COUNTS.Ecodrain) {
    throw new Error(
      `Ecodrain catalog must contain ${DWHR_EXPECTED_MANUFACTURER_COUNTS.Ecodrain} products, got ${ecodrainRows.length}`,
    );
  }
  for (const row of ecodrainRows) {
    if (Number(row.efficiencyAt9_5LMin) === 0) {
      throw new Error(
        `Ecodrain placeholder efficiency 0 for ${row.model} — apply full catalog (npm run apply:dwhr-regression-efficiencies), not regression-only patches`,
      );
    }
  }
  const powerPipeRows = products.filter((p) => p.manufacturer === "Power-Pipe");
  if (powerPipeRows.length !== DWHR_EXPECTED_MANUFACTURER_COUNTS["Power-Pipe"]) {
    throw new Error(
      `Power-Pipe catalog must contain ${DWHR_EXPECTED_MANUFACTURER_COUNTS["Power-Pipe"]} products, got ${powerPipeRows.length}`,
    );
  }
  for (const row of powerPipeRows) {
    if (Number(row.efficiencyAt9_5LMin) === 0) {
      throw new Error(
        `Power-Pipe placeholder efficiency 0 for ${row.model} — apply full catalog (npm run apply:dwhr-regression-efficiencies)`,
      );
    }
  }
  for (const [manufacturer, model, expected] of regressionPairs) {
    const row = getDwhrProduct(products, manufacturer, model);
    if (!row) {
      throw new Error(`Bundled DWHR catalog missing regression row: ${manufacturer} / ${model}`);
    }
    const eff = Number(row.efficiencyAt9_5LMin);
    if (eff === 0) {
      throw new Error(
        `Bundled DWHR catalog has placeholder efficiency 0 for ${manufacturer} / ${model} (expected ${expected}). Run npm run apply:dwhr-regression-efficiencies or import:dwhr-catalog.`,
      );
    }
    if (eff !== expected) {
      throw new Error(
        `Bundled DWHR catalog efficiency mismatch for ${manufacturer} / ${model}: expected ${expected}, got ${eff}`,
      );
    }
  }
}

export function validateDwhrCatalogWorkbookFacts(products) {
  validateDwhrProductCatalog(products);
  for (let i = 0; i < products.length; i += 1) {
    const { manufacturer, model, efficiencyAt9_5LMin } = products[i];
    if (Number(efficiencyAt9_5LMin) === 0) {
      throw new Error(`Row ${i + 1}: efficiency is missing (${manufacturer} / ${model})`);
    }
  }
  if (products.length !== DWHR_EXPECTED_TOTAL_PRODUCTS) {
    throw new Error(`DWHR catalog must contain ${DWHR_EXPECTED_TOTAL_PRODUCTS} products, got ${products.length}`);
  }
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of products) {
    counts[row.manufacturer] = (counts[row.manufacturer] || 0) + 1;
  }
  for (const [manufacturer, expected] of Object.entries(DWHR_EXPECTED_MANUFACTURER_COUNTS)) {
    const actual = counts[manufacturer] ?? 0;
    if (actual !== expected) {
      throw new Error(`Manufacturer count mismatch for ${manufacturer}: expected ${expected}, got ${actual}`);
    }
  }
}

/**
 * @param {DwhrProduct[]} products
 * @returns {string[]}
 */
export function getDWHRManufacturers(products) {
  const inCatalog = new Set(products.map((p) => p.manufacturer));
  return DWHR_MANUFACTURER_ORDER.filter((name) => inCatalog.has(name));
}

/**
 * @param {DwhrProduct[]} products
 * @param {string} manufacturer
 * @returns {string[]}
 */
export function getDWHRModels(products, manufacturer) {
  const mfg = String(manufacturer ?? "").trim();
  if (!mfg) return [];
  const models = [];
  for (const row of products) {
    if (row.manufacturer === mfg) models.push(row.model);
  }
  return models;
}

/**
 * @param {DwhrProduct[]} products
 * @param {string} manufacturer
 * @param {string} model
 * @returns {number | null}
 */
/**
 * @param {number | string | null | undefined} efficiencyAt9_5LMin
 * @returns {number | null}
 */
export function resolveDwhrCatalogEfficiency(efficiencyAt9_5LMin) {
  if (efficiencyAt9_5LMin === "" || efficiencyAt9_5LMin == null) return null;
  const n = Number(efficiencyAt9_5LMin);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export function getDWHREfficiency(products, manufacturer, model) {
  const row = getDwhrProduct(products, manufacturer, model);
  if (!row) return null;
  return resolveDwhrCatalogEfficiency(row.efficiencyAt9_5LMin);
}

/**
 * @param {DwhrProduct[]} products
 * @param {string} manufacturer
 * @param {string} model
 * @returns {DwhrProduct | null}
 */
export function getDwhrProduct(products, manufacturer, model) {
  const mfg = String(manufacturer ?? "").trim();
  const m = String(model ?? "").trim();
  if (!mfg || !m) return null;
  const row = products.find((p) => p.manufacturer === mfg && p.model === m);
  return row ?? null;
}

/**
 * @param {DwhrProduct[]} products
 * @returns {Record<string, string[]>}
 */
export function buildModelsByManufacturer(products) {
  /** @type {Record<string, string[]>} */
  const map = {};
  for (const row of products) {
    if (!map[row.manufacturer]) map[row.manufacturer] = [];
    map[row.manufacturer].push(row.model);
  }
  return map;
}
