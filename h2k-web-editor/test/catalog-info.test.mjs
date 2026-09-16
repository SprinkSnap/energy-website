import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const info = JSON.parse(readFileSync(join(root, "catalog/sections/info.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, "m");
  const match = re.exec(source);
  assert(match, `${name} not found`);
  const start = match.index;
  let depth = 0;
  let started = false;
  for (let i = start + match[0].length - 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse ${name}`);
}

const renderInfo = extractFunction(appJs, "renderInfoTab");
assert(renderInfo.includes("H2kCatalog.renderSection"), "renderInfoTab delegates to catalog");
assert(renderInfo.includes('getSection?.("info")'), "renderInfoTab checks catalog section");

assert(info.migration.status === "catalog-driven", "info is catalog-driven");
assert(info.class === "info-section catalog-section", "info section has responsive class");
assert(info.title === "House Info", "info section title is House Info");
assert(info.hot2000.controlCount === 5, "info inventory has 5 HOT2000 controls");
assert(info.groups.length === 2, "info has two logical groups");

const fields = info.groups.flatMap((g) => g.fields);
assert(fields.length === 3, "info catalog has 3 rendered field entries");

const table = fields.find((f) => f.id === "info-records-table");
assert(table?.renderer === "info-records-table", "records table uses custom renderer");
assert(table.columns?.map((c) => c.label).join("|") === "ID|Value", "table columns match inventory");

const addBtn = fields.find((f) => f.id === "info-add");
const deleteBtn = fields.find((f) => f.id === "info-delete");
assert(addBtn?.label === "Add", "Add button label exact");
assert(deleteBtn?.label === "Delete", "Delete button label exact");

assert(appJs.includes("infoRecordsTableHTML"), "info records table renderer exists");
assert(appJs.includes('name="infoRecordSelect"'), "row selection radios exist");
assert(appJs.includes("infoAddBtnHTML"), "Add button renderer exists");
assert(appJs.includes("infoDeleteBtnHTML"), "Delete button renderer exists");

console.log("catalog-info.test.mjs: all assertions passed");
