import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const fuel = JSON.parse(readFileSync(join(root, "catalog/sections/fuel.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));

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

const renderFuel = extractFunction(appJs, "renderFuelTab");
assert(renderFuel.includes("H2kCatalog.renderSection"), "renderFuelTab delegates to catalog renderer");
assert(renderFuel.includes('getSection?.("fuel")'), "renderFuelTab checks catalog section");
assert(appJs.includes("fuelRatePeriodHTML"), "fuel rate period custom renderer");
assert(appJs.includes("fuelCostLibraryControlHTML"), "fuel library control renderer");
assert(appJs.includes("fuelProfileComboboxHTML"), "fuel profile combobox renderer");
assert(appJs.includes("fuelCopyAllMissingBtnHTML"), "fuel copy-all-missing button renderer");

const flatPaths = fuel.groups.flatMap((g) => g.fields).flatMap((f) => (f.path ? [f.path] : []));
for (const path of [
  "/HouseFile/FuelCosts/@includeCostCalculations",
  "/HouseFile/FuelCosts/@library",
  "/HouseFile/FuelCosts/Electricity/Fuel[1]/Label",
  "/HouseFile/FuelCosts/NaturalGas/Fuel[1]/Label",
  "/HouseFile/FuelCosts/Oil/Fuel[1]/Label",
  "/HouseFile/FuelCosts/Propane/Fuel[1]/Label",
  "/HouseFile/FuelCosts/Wood/Fuel[1]/Label",
]) {
  assert(flatPaths.includes(path), `fuel catalog must bind ${path}`);
}

assert(fuel.title === "House Fuel Cost", "fuel section title is House Fuel Cost");
assert(fuel.hot2000?.controlCount === 11, "fuel hot2000 controlCount is 11");
const hotLabels = fuel.hot2000.controls.map((c) => c.label);
for (const label of [
  "Fuel Cost Library",
  "Change",
  "Annual",
  "Monthly",
  "Include Cost Calculations",
  "Electricity",
  "Natural Gas",
  "Oil",
  "Propane",
  "Wood",
  "Copy All Missing to Fuel Cost Library",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const groupTitles = fuel.groups.map((g) => g.title);
for (const title of ["Fuel Cost Library", "Cost Calculation Settings", "Fuel Cost Selection", "Actions"]) {
  assert(groupTitles.includes(title), `fuel group ${title}`);
}

const labeledFields = fuel.groups.flatMap((g) => g.fields).filter((f) => f.label);
assert(labeledFields.length === 8, "fuel catalog has 8 labeled fields (library/change share one control)");

const profileFields = fuel.groups.flatMap((g) => g.fields).filter((f) => f.renderer === "fuel-profile-combobox");
assert(profileFields.length === 5, "five fuel profile comboboxes");
for (const field of profileFields) {
  assert(field.optionsStatus === "pending-manual", `${field.id} combobox options pending`);
}

assert(fuel.class === "fuel-section catalog-section", "fuel section responsive class");
assert(manifest.coverage.catalogDriven.includes("fuel"), "fuel listed as catalog-driven");
assert(stylesCss.includes(".fuel-section .fuel-library-control-row"), "fuel library control row responsive rules");
assert(stylesCss.includes(".fuel-section .fuel-selection-row"), "fuel selection row responsive rules");

console.log("catalog-fuel.test.mjs: all assertions passed");
