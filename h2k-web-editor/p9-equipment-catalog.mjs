import {
  P9_LEGACY_LIBRARY_RECORD_ID_ALIASES,
  P9_LIBRARY_RECORD_DATA_BY_ID,
} from "./p9-library-record-data.mjs";

/**
 * CSA P.9-11 P9 equipment library — ordered manufacturers and stable record IDs.
 * Performance fields are attached per record when authoritative data exists.
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

/** Manufacturer → model display strings in authoritative HOT2000 order. */
const P9_MANUFACTURER_MODEL_LISTS = {
  Rinnai: ["CAH050E", "CAH050E"],
  "Redzone Products Inc.": [
    "13-06-M0381-2F",
    "17-05-17RZ001",
    "13-06-M0381-2B",
    "13-06-M0381-2C",
    "13-06-M0381-2A",
    "13-06-M0381-1C",
    "13-06-M0381-2E",
    "15-06-M0153-1",
    "17-05-17RZ002",
    "13-06-M0381-1E",
    "13-06-M0381-1A",
    "17-05-17RZ003",
    "13-06-M0381-2D",
    "15-06-M0181",
    "15-06-M0153-2",
    "13-06-M0381-1D",
    "13-06-M0381-1B",
    "17-05-07-RZ007",
    "13-06-M0381-1F",
  ],
  "Airmax Technologies": [
    "13-06-M0426-6",
    "GLOWC140-MAXAIR50E",
    "15-06-M0082RV1",
    "15-06-M0016-2",
    "13-06-M0426-2A",
    "GLOWC95-MAXAIR70E",
    "17-06-M0248-1",
    "GLOWC95-MAXAIR100E",
    "GLOWC140-MAXAIR70E",
    "12-06-M0043-2",
    "GLOWC95-MAXAIR50E",
    "15-06-M0155",
    "13-06-M0426-7",
    "15-06-M0016-3RV1",
  ],
  "Ecosmart Air": [
    "RK50LVS/R2K24",
    "ES90LVP/RU160IN",
    "RK90LVS/R2K34",
    "RK90HVP/R2K34",
    "RK50HVP/R2K24",
    "ES90LVP/RU199IN",
  ],
  "Navien America": ["15-06-M0121", "13-06-M0424-1RV1", "13-06-M0424-2RV1"],
  Aspen: ["AFLM-000+WC4S8"],
  "iFLOW HVAC": [
    "IFH-1436P0/NPE-180A",
    "IFL-1670P0/NPE-180A",
    "IFLH-160000/RU199IN",
    "IFH-1420P0/NPE-180A",
    "IFL-1435P0/NPE-180A",
    "IFLH-180000/RU199IN",
    "IFL-1425P0/NPE-180A",
    "IFH-1660P0/NPE-240A",
    "IFLH-180000/RU160IN",
    "IFL-1690P0/NPE-240A",
  ],
  "Energy Saving Products": [
    "21-06-E0044-1-REV01",
    "18-06-M0032-3",
    "14-06-M0314-1B",
    "18-06-M0032-4",
    "15-06-M0084-1",
    "15-06-M0084-4",
    "15-06-M0084-3",
    "18-06-M0032-2",
    "14-06-M0314-1A",
    "15-06-M0166-1",
    "14-06-M0314-2C",
    "14-06-M0314-1C",
    "15-06-M0166-3",
    "14-06-M0314-2D",
    "21-06-E0044-3-REV01",
    "21-06-E0044-2-REV01",
    "15-06-M0084-2",
    "18-06-M0032-1",
    "21-06-E0044-4",
    "14-06-M0314-1D",
  ],
  "NY Thermal Inc.": ["GF200"],
  "Hydromax Inc": ["CAH050E", "HYDROMAXVHXS504X"],
  "Rheem Canada Ltd.": ["14-06-M0150-4", "14-06-M0150-1", "14-06-M0150-3", "14-06-M0150-2"],
  Enerzone: ["13-06-M0381-3A", "13-06-M0381-3B"],
  "Tempco Sheetmetal": ["14-06-M0290", "14-06-M0265"],
};

/** Explicit stable IDs for duplicate Rinnai CAH050E entries. */
const P9_EXPLICIT_RECORD_IDS = {
  "Rinnai|CAH050E|0": "rinnai-cah050e-01",
  "Rinnai|CAH050E|1": "rinnai-cah050e-02",
};

function slugPart(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildP9LibraryRecords() {
  /** @type {Array<{ id: string, manufacturer: string, model: string, thermalPerformanceFactor?: number, annualElectricity?: number, spaceHeatingCapacity?: number, spaceHeatingEfficiency?: number, waterHeatingPerformanceFactor?: number, burnerInput?: number, recoveryEfficiency?: number, testData?: object }>} */
  const records = [];
  const duplicateIndex = new Map();
  for (const manufacturer of P9_LIBRARY_MANUFACTURERS) {
    const models = P9_MANUFACTURER_MODEL_LISTS[manufacturer] || [];
    models.forEach((model) => {
      const key = `${manufacturer}|${model}`;
      const idx = duplicateIndex.get(key) ?? 0;
      duplicateIndex.set(key, idx + 1);
      const explicitKey = `${manufacturer}|${model}|${idx}`;
      const id =
        P9_EXPLICIT_RECORD_IDS[explicitKey] ||
        `${slugPart(manufacturer)}-${slugPart(model)}-${idx + 1}`;
      const base = { id, manufacturer, model };
      const extra = P9_LIBRARY_RECORD_DATA_BY_ID[id];
      records.push(extra ? { ...base, ...extra } : base);
    });
  }
  return records;
}

function normalizeP9RecordId(id) {
  const key = String(id || "").trim();
  if (!key) return "";
  return P9_LEGACY_LIBRARY_RECORD_ID_ALIASES[key] || key;
}

export const P9_LIBRARY_RECORDS = buildP9LibraryRecords();

/** @type {Map<string, typeof P9_LIBRARY_RECORDS[0]>} */
const P9_RECORD_BY_ID = new Map(P9_LIBRARY_RECORDS.map((row) => [row.id, row]));

/** @type {Map<string, typeof P9_LIBRARY_RECORDS[0][]>} */
const P9_RECORDS_BY_MANUFACTURER = new Map();
for (const row of P9_LIBRARY_RECORDS) {
  const list = P9_RECORDS_BY_MANUFACTURER.get(row.manufacturer) || [];
  list.push(row);
  P9_RECORDS_BY_MANUFACTURER.set(row.manufacturer, list);
}

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
 * @param {string} _manufacturer
 * @param {string} storedModel
 */
export function normalizeP9Model(_manufacturer, storedModel) {
  return String(storedModel || "").trim();
}

/**
 * @param {string} id
 */
export function getP9RecordById(id) {
  const key = normalizeP9RecordId(id);
  return key ? P9_RECORD_BY_ID.get(key) ?? null : null;
}

/**
 * @param {string} manufacturer
 */
export function getP9RecordsForManufacturer(manufacturer) {
  const mfg = normalizeP9Manufacturer(manufacturer);
  if (!mfg) return [];
  return [...(P9_RECORDS_BY_MANUFACTURER.get(mfg) || [])];
}

/**
 * @param {{ manufacturer?: string, model?: string, libraryRecordId?: string }} query
 */
export function resolveP9LibraryRecord(query = {}) {
  const libraryRecordId = normalizeP9RecordId(query.libraryRecordId);
  if (libraryRecordId) {
    const byId = getP9RecordById(libraryRecordId);
    if (byId) return byId;
  }
  const mfg = normalizeP9Manufacturer(query.manufacturer);
  const model = String(query.model || "").trim();
  if (!mfg || !model) return null;
  const matches = getP9RecordsForManufacturer(mfg).filter((row) => row.model === model);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return matchP9LibraryRecordBySavedPerformance(matches, query.savedPerformance);
  }
  return null;
}

/**
 * @param {typeof P9_LIBRARY_RECORDS} matches
 * @param {{ thermalPerformanceFactor?: string|number, annualElectricity?: string|number, spaceHeatingCapacity?: string|number, spaceHeatingEfficiency?: string|number, waterHeatingPerformanceFactor?: string|number, burnerInput?: string|number, recoveryEfficiency?: string|number }|undefined} saved
 */
export function matchP9LibraryRecordBySavedPerformance(matches, saved) {
  if (!Array.isArray(matches) || matches.length <= 1 || !saved) return null;
  const sig = (row) =>
    [
      row.thermalPerformanceFactor,
      row.annualElectricity,
      row.spaceHeatingCapacity,
      row.spaceHeatingEfficiency,
      row.waterHeatingPerformanceFactor,
      row.burnerInput,
      row.recoveryEfficiency,
    ].map((v) => String(v ?? "")).join("|");
  const savedSig = [
    saved.thermalPerformanceFactor,
    saved.annualElectricity,
    saved.spaceHeatingCapacity,
    saved.spaceHeatingEfficiency,
    saved.waterHeatingPerformanceFactor,
    saved.burnerInput,
    saved.recoveryEfficiency,
  ]
    .map((v) => String(v ?? ""))
    .join("|");
  const hit = matches.find((row) => sig(row) === savedSig);
  return hit ?? null;
}

/** @deprecated Use getP9RecordById / resolveP9LibraryRecord */
export function getP9LibraryEntry(manufacturer, model) {
  return resolveP9LibraryRecord({ manufacturer, model });
}

/** @deprecated Derived view for legacy callers */
export const P9_EQUIPMENT_LIBRARY = Object.fromEntries(
  P9_LIBRARY_MANUFACTURERS.map((mfg) => {
    const rows = getP9RecordsForManufacturer(mfg);
    const map = {};
    rows.forEach((row) => {
      map[row.model] = row;
    });
    return [mfg, map];
  }),
);

globalThis.P9EquipmentCatalog = {
  P9_LIBRARY_MANUFACTURERS,
  P9_LIBRARY_RECORDS,
  P9_MANUFACTURER_MODEL_LISTS,
  normalizeP9Manufacturer,
  normalizeP9Model,
  getP9RecordById,
  getP9RecordsForManufacturer,
  resolveP9LibraryRecord,
  matchP9LibraryRecordBySavedPerformance,
  normalizeP9RecordId,
  getP9LibraryEntry,
  P9_EQUIPMENT_LIBRARY,
  P9_LIBRARY_RECORD_DATA_BY_ID,
};
