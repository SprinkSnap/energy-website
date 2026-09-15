import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const general = JSON.parse(readFileSync(join(root, "catalog/sections/general.json"), "utf8"));

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

const renderGeneral = extractFunction(appJs, "renderGeneralTab");
assert(renderGeneral.includes("H2kCatalog.renderSection"), "renderGeneralTab delegates to catalog");
assert(renderGeneral.includes('getSection?.("general")'), "renderGeneralTab checks catalog section");

const paths = general.groups.flatMap((g) => g.fields).flatMap((f) => (f.path ? [f.path] : []));
for (const path of [
  "/HouseFile/ProgramInformation/File/Identification",
  "/HouseFile/ProgramInformation/File/Ownership",
  "/HouseFile/ProgramInformation/Client/Name/First",
  "/HouseFile/ProgramInformation/Client/StreetAddress/Province",
]) {
  assert(paths.includes(path), `general catalog binds ${path}`);
}

const ownership = general.groups
  .flatMap((g) => g.fields)
  .find((f) => f.id === "ownership");
assert(ownership?.optionsRef === "ownership", "ownership uses catalog optionsRef");

const fields = general.groups.flatMap((g) => g.fields);
assert(fields.length === 32, "general catalog lists 32 HOT2000 controls");
assert(general.groups.length === 6, "general has six logical groups");
assert(general.class === "general-section", "general section has responsive class");

for (const path of [
  "/HouseFile/ProgramInformation/Client/MailingAddress/Name",
  "/HouseFile/ProgramInformation/Client/MailingAddress/Street",
  "/HouseFile/ProgramInformation/Client/MailingAddress/Province",
]) {
  assert(paths.includes(path), `general catalog binds ${path}`);
}

const sameAsAbove = fields.find((f) => f.id === "same-as-above");
assert(sameAsAbove?.renderer === "general-same-as-above-btn", "Same As Above uses custom renderer");

console.log("catalog-general.test.mjs: all assertions passed");
