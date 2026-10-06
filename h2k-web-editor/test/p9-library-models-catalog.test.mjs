import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await import(pathToFileURL(join(root, "p9-equipment-catalog.mjs")).href);

const catalog = globalThis.P9EquipmentCatalog;
const { P9_MANUFACTURER_MODEL_LISTS, P9_LIBRARY_RECORDS, getP9RecordsForManufacturer } = catalog;

const EXPECTED = {
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const appJs = readFileSync(join(root, "app.js"), "utf8");
assert(appJs.includes("function heatingP9ApplyLibraryRecord"), "record-based apply");
assert(appJs.includes("@libraryRecordId"), "stable record id persistence");

for (const [mfg, models] of Object.entries(EXPECTED)) {
  const rows = getP9RecordsForManufacturer(mfg);
  assert(rows.length === models.length, `${mfg} count ${rows.length} vs ${models.length}`);
  const labels = rows.map((r) => r.model);
  assert(JSON.stringify(labels) === JSON.stringify(models), `${mfg} model order`);
  assert(rows.every((r) => r.id && r.manufacturer === mfg), `${mfg} stable ids`);
}

const rinnai = getP9RecordsForManufacturer("Rinnai");
assert(rinnai.length === 2, "two Rinnai records");
assert(rinnai[0].id === "rinnai-cah050e-01" && rinnai[1].id === "rinnai-cah050e-02", "distinct Rinnai CAH050E ids");
assert(rinnai[0].model === "CAH050E" && rinnai[1].model === "CAH050E", "duplicate display names preserved");

const total = Object.values(EXPECTED).reduce((n, list) => n + list.length, 0);
assert(P9_LIBRARY_RECORDS.length === total, `total records ${total}`);

assert(
  P9_MANUFACTURER_MODEL_LISTS["iFLOW HVAC"].includes("IFH-1436P0/NPE-180A"),
  "iFLOW P0 preserved",
);

console.log("p9-library-models-catalog.test.mjs: OK");
