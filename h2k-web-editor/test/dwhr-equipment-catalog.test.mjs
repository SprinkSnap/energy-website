import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workbook = join(root, "catalog/source/DWHR_Efficiency_Data_Entry(2).xlsx");

if (existsSync(workbook)) {
  const imp = spawnSync(process.execPath, [join(root, "scripts/import-dwhr-model-catalog.mjs")], {
    cwd: join(root, ".."),
    encoding: "utf8",
  });
  if (imp.status !== 0) {
    console.error(imp.stdout || imp.stderr);
    throw new Error("import:dwhr-catalog failed");
  }
}

const {
  DWHR_PRODUCTS,
  DWHR_MANUFACTURERS,
  dwhrEfficiencyForProduct: getDWHREfficiency,
  normalizeDwhrModel,
} = await import("../dwhr-equipment-catalog.mjs");

assert(DWHR_PRODUCTS.length > 0, "bundled DWHR catalog must not be empty");
assert.equal(DWHR_MANUFACTURERS.length, 5, "five manufacturers in catalog");
assert.deepEqual(DWHR_MANUFACTURERS, [
  "ThermoDrain",
  "Ecodrain",
  "Power-Pipe",
  "Generic",
  "Watercycles Energy Recovery Inc.",
]);

const manufacturers = new Set(DWHR_PRODUCTS.map((p) => p.manufacturer));
assert.equal(manufacturers.size, 5, "unique manufacturer count");

const keys = new Set();
for (const row of DWHR_PRODUCTS) {
  const key = `${row.manufacturer}\0${row.model}`;
  assert(!keys.has(key), `duplicate ${row.manufacturer} / ${row.model}`);
  keys.add(key);
  assert(Number.isFinite(row.efficiencyAt9_5LMin), `efficiency numeric for ${row.model}`);
  assert(row.efficiencyAt9_5LMin >= 0 && row.efficiencyAt9_5LMin <= 100, `efficiency range for ${row.model}`);
  assert.equal(
    getDWHREfficiency(row.manufacturer, row.model),
    row.efficiencyAt9_5LMin,
    `lookup ${row.manufacturer} ${row.model}`,
  );
}

assert(DWHR_PRODUCTS.some((p) => p.manufacturer === "ThermoDrain" && p.model === "TD336B"), "ThermoDrain TD336B");
assert.equal(normalizeDwhrModel("Power-Pipe", "POWER-Pipe R3-60"), "R3-60");
const r360 = getDWHREfficiency("Power-Pipe", "R3-60");
assert(r360 != null && r360 > 0, "Power-Pipe R3-60 efficiency from catalog");

const td336Eff = getDWHREfficiency("ThermoDrain", "TD336B");
assert.equal(td336Eff, 32.9, "ThermoDrain TD336B efficiency from bundled catalog");

console.log(
  `dwhr-equipment-catalog.test.mjs: OK (${DWHR_PRODUCTS.length} rows, ${manufacturers.size} manufacturers)`,
);
