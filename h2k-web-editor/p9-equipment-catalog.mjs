/**
 * CSA P.9-11 P9 equipment library — authoritative manufacturer list and catalog records.
 * Model rows are added only from authoritative sources; manufacturers without catalog data remain {}.
 */
export const P9_LIBRARY_MANUFACTURERS = [
  "Rinnai",
  "Redzone Products Inc.",
  "Airmax Technologies",
  "Ecosmart Air",
  "Navien America",
  "Aspen",
  "iFLOW HVAC",
  "Energy Saving Products",
  "NY Thermal Inc.",
  "Hydromax Inc",
  "Rheem Canada Ltd.",
  "Enerzone",
  "Tempco Sheetmetal",
];

/** @type {Record<string, string>} */
const P9_LEGACY_MANUFACTURER_ALIASES = {
  Navien: "Navien America",
  "NY Thermal Incorporated (NTI)": "NY Thermal Inc.",
};

export const P9_EQUIPMENT_LIBRARY = {
  Rinnai: {},
  "Redzone Products Inc.": {},
  "Airmax Technologies": {},
  "Ecosmart Air": {},
  "Navien America": {
    "NCB-240/130H": {
      thermalPerformanceFactor: 0.92,
      annualElectricity: 1450,
      spaceHeatingCapacity: 24000,
      spaceHeatingEfficiency: 91,
      waterHeatingPerformanceFactor: 0.85,
      burnerInput: 38000,
      recoveryEfficiency: 82,
      testData: {
        energySource: "2",
        controlsPower: 12,
        circulationPower: 95,
        dailyUse: 0.07,
      },
    },
  },
  Aspen: {},
  "iFLOW HVAC": {},
  "Energy Saving Products": {},
  "NY Thermal Inc.": {
    "Matrix™ M100V": {
      thermalPerformanceFactor: 0.86,
      annualElectricity: 1692.7,
      spaceHeatingCapacity: 27900,
      spaceHeatingEfficiency: 89,
      waterHeatingPerformanceFactor: 0.81,
      burnerInput: 43950,
      recoveryEfficiency: 79,
      testData: {
        energySource: "2",
        netEfficiency: { loadPerformance15: 88, loadPerformance40: 90, loadPerformance100: 84 },
        electricalUse: { loadPerformance15: 126, loadPerformance40: 266, loadPerformance100: 421 },
        blowerPower: { loadPerformance15: 113, loadPerformance40: 253, loadPerformance100: 408 },
        controlsPower: 13,
        circulationPower: 103,
        dailyUse: 0.08,
        standbyLossWithFan: 0,
        standbyLossWithoutFan: 0,
        oneHourRatingHotWater: 905,
        oneHourRatingConcurrent: 908,
      },
    },
  },
  "Hydromax Inc": {},
  "Rheem Canada Ltd.": {},
  Enerzone: {},
  "Tempco Sheetmetal": {},
};

P9_LIBRARY_MANUFACTURERS.forEach((name) => {
  if (!Object.prototype.hasOwnProperty.call(P9_EQUIPMENT_LIBRARY, name)) {
    P9_EQUIPMENT_LIBRARY[name] = {};
  }
});

/**
 * @param {string} stored
 * @returns {string}
 */
export function normalizeP9Manufacturer(stored) {
  const trimmed = String(stored || "").trim();
  if (!trimmed) return "";
  if (P9_LIBRARY_MANUFACTURERS.includes(trimmed)) return trimmed;
  return P9_LEGACY_MANUFACTURER_ALIASES[trimmed] || trimmed;
}

/**
 * @param {string} manufacturer
 * @param {string} storedModel
 * @returns {string}
 */
export function normalizeP9Model(manufacturer, storedModel) {
  return String(storedModel || "").trim();
}

/**
 * @param {string} manufacturer
 * @param {string} model
 */
export function getP9LibraryEntry(manufacturer, model) {
  const mfg = normalizeP9Manufacturer(manufacturer);
  const modelId = normalizeP9Model(mfg, model);
  if (!mfg || !modelId) return null;
  return P9_EQUIPMENT_LIBRARY[mfg]?.[modelId] ?? null;
}

globalThis.P9EquipmentCatalog = {
  P9_LIBRARY_MANUFACTURERS,
  P9_EQUIPMENT_LIBRARY,
  normalizeP9Manufacturer,
  normalizeP9Model,
  getP9LibraryEntry,
};
