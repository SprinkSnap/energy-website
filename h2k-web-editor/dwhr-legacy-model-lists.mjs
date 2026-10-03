/**
 * Legacy HOT2000 model lists (pre-Excel catalog). Used only to bootstrap bundled
 * DWHR_PRODUCTS when the generated catalog is empty. Replace via npm run import:dwhr-catalog.
 */

export function generateDwhrSeries(prefix, start, end, step) {
  const out = [];
  for (let n = start; n <= end; n += step) out.push(`${prefix}-${n}`);
  return out;
}

export function thermoDrainModelIds() {
  const td = [];
  for (let n = 336; n <= 372; n += 2) td.push(`TD${n}B`);
  td.push("TD442B", "TD460B", "TD472B");
  const tdh = [];
  for (let n = 3320; n <= 3620; n += 5) tdh.push(`TDH${n}B`);
  return td.concat(tdh);
}

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

export const GENERIC_MODEL_IDS = [
  "1-Low Efficiency",
  "2-Medium Efficiency",
  "3-High Efficiency",
];

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

/** Previously verified effectiveness (vertical @ 9.5 L/min) — bootstrap only until Excel import. */
export const LEGACY_VERIFIED_EFFICIENCY = {
  ThermoDrain: { TD336B: 32.9, TDH3550B: 54.4 },
  "Power-Pipe": { "R3-60": 56.7 },
  Generic: {
    "1-Low Efficiency": 41.5,
    "2-Medium Efficiency": 54.2,
  },
};

export const LEGACY_MODELS_BY_MANUFACTURER = {
  ThermoDrain: thermoDrainModelIds(),
  Ecodrain: [...ECODRAIN_MODEL_IDS],
  "Power-Pipe": powerPipeModelIds(),
  Generic: [...GENERIC_MODEL_IDS],
  "Watercycles Energy Recovery Inc.": [...WATERCYCLES_MODEL_IDS],
};

/** @returns {{ manufacturer: string, model: string, efficiencyAt9_5LMin: number }[]} */
export function buildLegacyDwhrProducts() {
  /** @type {{ manufacturer: string, model: string, efficiencyAt9_5LMin: number }[]} */
  const products = [];
  for (const [manufacturer, models] of Object.entries(LEGACY_MODELS_BY_MANUFACTURER)) {
    for (const model of models) {
      const eff = LEGACY_VERIFIED_EFFICIENCY[manufacturer]?.[model] ?? 0;
      products.push({ manufacturer, model, efficiencyAt9_5LMin: eff });
    }
  }
  return products;
}
