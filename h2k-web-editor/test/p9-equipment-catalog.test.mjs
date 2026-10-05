import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = readFileSync(join(root, "p9-equipment-catalog.mjs"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");

const EXPECTED = [
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(indexHtml.includes("p9-equipment-catalog.mjs"), "index loads P9 catalog module");
for (const name of EXPECTED) {
  assert(catalog.includes(JSON.stringify(name)), `catalog lists ${name}`);
}
const orderBlock = catalog.slice(
  catalog.indexOf("export const P9_LIBRARY_MANUFACTURERS"),
  catalog.indexOf("];", catalog.indexOf("P9_LIBRARY_MANUFACTURERS")) + 2,
);
for (let i = 0; i < EXPECTED.length; i++) {
  const next = EXPECTED[i + 1];
  const pos = orderBlock.indexOf(JSON.stringify(EXPECTED[i]));
  const nextPos = next ? orderBlock.indexOf(JSON.stringify(next)) : -1;
  assert(pos >= 0, `order contains ${EXPECTED[i]}`);
  if (next) assert(nextPos > pos, `order: ${EXPECTED[i]} before ${next}`);
}
assert(catalog.includes("Navien America"), "Navien America catalog key");
assert(catalog.includes("NY Thermal Inc."), "NY Thermal Inc. catalog key");
assert(!catalog.includes('"NY Thermal Incorporated (NTI)": {'), "legacy NTI not a catalog manufacturer key");
assert(catalog.includes("NY Thermal Incorporated (NTI)"), "legacy NTI alias for load migration");

console.log("p9-equipment-catalog.test.mjs: OK");
