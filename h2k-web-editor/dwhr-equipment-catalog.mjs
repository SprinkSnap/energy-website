/**
 * HOT2000 Drain Water Heat Recovery equipment catalog (manufacturers, models, effectiveness).
 * Effectiveness values are only populated where previously verified in project data.
 */

/** @typedef {{ effectivenessAt95?: number, effectivenessAt95Horizontal?: number }} DwhrModelSpec */

/** Fixed manufacturer list (HOT2000 DWHR dialog order). */
export const DWHR_MANUFACTURERS = [
  "ThermoDrain",
  "Ecodrain",
  "Power-Pipe",
  "Generic",
  "Watercycles Energy Recovery Inc.",
];

/** Map legacy stored manufacturer names to current catalog labels. */
export const DWHR_MANUFACTURER_ALIASES = {
  "RenewABILITY Energy Solutions": "Power-Pipe",
};

/** @returns {string[]} */
export function thermoDrainModelIds() {
  const td = [];
  for (let n = 336; n <= 372; n += 2) td.push(`TD${n}B`);
  td.push("TD442B", "TD460B", "TD472B");
  const tdh = [];
  for (let n = 3320; n <= 3620; n += 5) tdh.push(`TDH${n}B`);
  return td.concat(tdh);
}

/** @type {Record<string, string[]>} */
export const DWHR_MODELS_BY_MANUFACTURER = {
  ThermoDrain: thermoDrainModelIds(),
  Ecodrain: [],
  "Power-Pipe": ["POWER-Pipe R3-60"],
  Generic: ["Low Efficiency", "Medium Efficiency"],
  "Watercycles Energy Recovery Inc.": [],
};

/** Verified effectiveness data only — do not infer from model names. */
const DWHR_MODEL_EFFECTIVENESS = {
  ThermoDrain: {
    TDH3550B: { effectivenessAt95: 54.4, effectivenessAt95Horizontal: 46.2 },
  },
  "Power-Pipe": {
    "POWER-Pipe R3-60": { effectivenessAt95: 56.7, effectivenessAt95Horizontal: 48.2 },
  },
  Generic: {
    "Low Efficiency": { effectivenessAt95: 41.5, effectivenessAt95Horizontal: 35.3 },
    "Medium Efficiency": { effectivenessAt95: 54.2, effectivenessAt95Horizontal: 46.1 },
  },
};

/** @returns {Record<string, Record<string, DwhrModelSpec>>} */
export function buildDwhrEquipmentLibrary() {
  /** @type {Record<string, Record<string, DwhrModelSpec>>} */
  const library = {};
  for (const manufacturer of DWHR_MANUFACTURERS) {
    library[manufacturer] = {};
    for (const model of DWHR_MODELS_BY_MANUFACTURER[manufacturer] || []) {
      library[manufacturer][model] = DWHR_MODEL_EFFECTIVENESS[manufacturer]?.[model] ?? {};
    }
  }
  return library;
}

export const DWHR_EQUIPMENT_LIBRARY = buildDwhrEquipmentLibrary();

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
 * @returns {string[]}
 */
export function dwhrModelsForManufacturer(manufacturer) {
  const key = normalizeDwhrManufacturer(manufacturer);
  return DWHR_MODELS_BY_MANUFACTURER[key] ? [...DWHR_MODELS_BY_MANUFACTURER[key]] : [];
}

globalThis.DwhrEquipmentCatalog = {
  DWHR_MANUFACTURERS,
  DWHR_MODELS_BY_MANUFACTURER,
  DWHR_EQUIPMENT_LIBRARY,
  DWHR_MANUFACTURER_ALIASES,
  normalizeDwhrManufacturer,
  dwhrModelsForManufacturer,
  thermoDrainModelIds,
};
