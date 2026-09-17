import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const temperatures = JSON.parse(readFileSync(join(root, "catalog/sections/temperatures.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));
const allowableRise = JSON.parse(readFileSync(join(root, "catalog/options/allowable-rise.json"), "utf8"));
const capture = JSON.parse(
  readFileSync(join(root, "catalog/capture/hot2000-11.13/screens/temperatures.json"), "utf8"),
);

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

const renderSetpoints = extractFunction(appJs, "renderSetpoints");
assert(renderSetpoints.includes("H2kCatalog.renderSection"), "renderSetpoints delegates to catalog");
assert(renderSetpoints.includes('getSection?.("temperatures")'), "renderSetpoints checks catalog section");
assert(renderSetpoints.includes("afterSystemBind(t)"), "renderSetpoints binds systems XML after catalog render");

assert(temperatures.migration.status === "catalog-driven", "temperatures is catalog-driven");
assert(temperatures.verification.status === "unverified", "temperatures remains unverified");
assert(temperatures.hot2000?.controlCount === 13, "temperatures hot2000 controlCount is 13");

const fields = temperatures.groups.flatMap((g) => g.fields);
assert(fields.length === 13, "temperatures catalog has 13 fields");

const hotLabels = temperatures.hot2000.controls.map((c) => c.label);
for (const label of [
  "Daytime Heating Set Point",
  "Nighttime Heating Set Point",
  "Cooling Set Point",
  "Nighttime Setback Duration",
  "Allowable Rise",
  "Separate Thermostat",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const riseField = fields.find((f) => f.id === "allowable-rise");
assert(riseField?.optionsRef === "allowable-rise", "allowable rise uses option pack");
for (const code of ["1", "2", "3"]) {
  assert(allowableRise.options[code]?.en, `allowable-rise option ${code} has label`);
}

const crawlHeated = fields.find((f) => f.id === "crawl-heated");
const crawlSetpoint = fields.find((f) => f.id === "crawl-heating-setpoint");
assert(crawlHeated?.readOnly === true, "crawl heated is read-only");
assert(crawlSetpoint?.readOnly === true, "crawl heating set point is read-only");

const groupTitles = temperatures.groups.map((g) => g.title);
for (const title of ["Main floors", "Basement", "Sizing Indoor Design Temperatures", "Crawl space"]) {
  assert(groupTitles.includes(title), `group title includes ${title}`);
}

const paths = new Set(fields.flatMap((f) => (f.path ? [f.path] : [])));
for (const capField of capture.fields) {
  if (capField.xmlPath) assert(paths.has(capField.xmlPath), `catalog maps ${capField.xmlPath}`);
}

assert(temperatures.class === "temperatures-section catalog-section", "temperatures responsive class");
assert(stylesCss.includes(".temperatures-section .temperatures-pair-row"), "temperatures section CSS");
assert(manifest.coverage.catalogDriven.includes("temperatures"), "temperatures listed as catalog-driven");
assert(manifest.optionPacks.includes("allowable-rise"), "allowable-rise in manifest option packs");

console.log("catalog-temperatures.test.mjs: all assertions passed");
