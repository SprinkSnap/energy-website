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
export function getDWHREfficiency(products, manufacturer, model) {
  const mfg = String(manufacturer ?? "").trim();
  const m = String(model ?? "").trim();
  if (!mfg || !m) return null;
  const row = products.find((p) => p.manufacturer === mfg && p.model === m);
  return row ? Number(row.efficiencyAt9_5LMin) : null;
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
