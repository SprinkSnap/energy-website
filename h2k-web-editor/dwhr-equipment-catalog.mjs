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

/** Generic DWHR models (HOT2000 DWHR dialog). */
export const GENERIC_MODEL_IDS = [
  "1-Low Efficiency",
  "2-Medium Efficiency",
  "3-High Efficiency",
];

/** Watercycles Energy Recovery Inc. models (HOT2000 DWHR dialog). */
export const WATERCYCLES_MODEL_IDS = [
  "WX-3036",
  "WX-3042",
  "WX-3048",
  "WX-3060",
  "WX-3072",
  "WX-4040",
  "WX-4048",
  "WX-4060",
];

/**
 * @param {string} prefix
 * @param {number} start
 * @param {number} end
 * @param {number} step
 * @returns {string[]}
 */
export function generateDwhrSeries(prefix, start, end, step) {
  const out = [];
  for (let n = start; n <= end; n += step) out.push(`${prefix}-${n}`);
  return out;
}

/** @returns {string[]} */
export function thermoDrainModelIds() {
  const td = [];
  for (let n = 336; n <= 372; n += 2) td.push(`TD${n}B`);
  td.push("TD442B", "TD460B", "TD472B");
  const tdh = [];
  for (let n = 3320; n <= 3620; n += 5) tdh.push(`TDH${n}B`);
  return td.concat(tdh);
}

/** Ecodrain models (HOT2000 DWHR dialog). */
export const ECODRAIN_MODEL_IDS = [
  "V1000-3-36",
  "V1000-3-48",
  "V1000-3-60",
  "V1000-3-72",
  "V1000-4-36",
  "V1000-4-48",
  "V1000-4-60",
  "V1000-4-72",
  "VT-1000-3-32",
  "VT-1000-3-36",
  "VT-1000-3-54",
  "VT-1000-3-72",
  "VT-1000-4-32",
  "VT-1000-4-54",
  "VT-1000-4-72",
];

/** @returns {string[]} */
export function powerPipeModelIds() {
  return [
    ...generateDwhrSeries("C3", 30, 120, 3),
    ...generateDwhrSeries("C4", 30, 120, 3),
    ...generateDwhrSeries("R2", 24, 120, 2),
    ...generateDwhrSeries("R3", 20, 120, 2),
    ...generateDwhrSeries("R4", 24, 120, 2),
    "X2-24",
    "X2-36",
    "X2-60",
    "X2-72",
    "X2-96",
  ];
}

/** @type {Record<string, string[]>} */
export const DWHR_MODELS_BY_MANUFACTURER = {
  ThermoDrain: thermoDrainModelIds(),
  Ecodrain: [...ECODRAIN_MODEL_IDS],
  "Power-Pipe": powerPipeModelIds(),
  Generic: [...GENERIC_MODEL_IDS],
  "Watercycles Energy Recovery Inc.": [...WATERCYCLES_MODEL_IDS],
};

/** Verified effectiveness data only — do not infer from model names. */
const DWHR_MODEL_EFFECTIVENESS = {
  ThermoDrain: {
    TDH3550B: { effectivenessAt95: 54.4, effectivenessAt95Horizontal: 46.2 },
  },
  "Power-Pipe": {
    "R3-60": { effectivenessAt95: 56.7, effectivenessAt95Horizontal: 48.2 },
  },
  Generic: {
    "1-Low Efficiency": { effectivenessAt95: 41.5, effectivenessAt95Horizontal: 35.3 },
    "2-Medium Efficiency": { effectivenessAt95: 54.2, effectivenessAt95Horizontal: 46.1 },
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
  return DWHR_MODELS_BY_MANUFACTURER[key] ? [...DWHR_MODELS_BY_MANUFACTURER[key]] : [];
}

globalThis.DwhrEquipmentCatalog = {
  DWHR_MANUFACTURERS,
  DWHR_MODELS_BY_MANUFACTURER,
  DWHR_EQUIPMENT_LIBRARY,
  DWHR_MANUFACTURER_ALIASES,
  DWHR_MODEL_ALIASES,
  ECODRAIN_MODEL_IDS,
  GENERIC_MODEL_IDS,
  WATERCYCLES_MODEL_IDS,
  normalizeDwhrManufacturer,
  normalizeDwhrModel,
  dwhrModelsForManufacturer,
  thermoDrainModelIds,
  powerPipeModelIds,
  generateDwhrSeries,
};
