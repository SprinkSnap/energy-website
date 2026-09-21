import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const fuelCatalog = JSON.parse(readFileSync(join(root, "catalog/sections/fuel.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "catalog/manifest.json"), "utf8"));

const FUEL_COST_LIBRARY_DEFAULT = "C:\\HOT2000 v11.13b13\\StdLibs\\fuellib.flc";
const FUEL_COST_DEFAULTS = {
  Electricity: "Ottawa97",
  NaturalGas: "Ottawa08",
  Oil: "Ottawa08",
  Propane: "Ottawa08",
  Wood: "Sth Ont",
};
const FUEL_COST_PROFILE_OPTIONS = {
  Electricity: ["Ottawa08", "ManHyd08", "ManHyd05", "WpgHyd97", "Ottawa97"],
  NaturalGas: ["Ottawa08", "MHGas08", "MHGas05", "WpgGas98", "Pembroke", "Toronto", "Ottawa97"],
  Oil: ["Ottawa08", "Ottawa97"],
  Propane: ["Ottawa08", "Ottawa97"],
  Wood: ["Sth Ont"],
};

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

function getXml(doc, path) {
  const [elemPath, attr] = path.split("/@");
  const parts = elemPath.replace(/^\/HouseFile\/?/, "").split("/").filter(Boolean);
  let cur = doc.documentElement;
  for (const part of parts) {
    const m = part.match(/^([A-Za-z0-9]+)(?:\[(\d+)\])?$/);
    const matches = [...cur.childNodes].filter((n) => n.nodeType === 1 && n.tagName === m[1]);
    cur = matches[(Number(m[2]) || 1) - 1] || null;
    if (!cur) return "";
  }
  if (path.includes("/@")) return cur.getAttribute(attr) ?? "";
  return cur.textContent ?? "";
}

function setXml(doc, path, value) {
  const [elemPath, attr] = path.split("/@");
  const parts = elemPath.replace(/^\/HouseFile\/?/, "").split("/").filter(Boolean);
  let cur = doc.documentElement;
  for (const part of parts) {
    const m = part.match(/^([A-Za-z0-9]+)(?:\[(\d+)\])?$/);
    const tag = m[1];
    const idx = Number(m[2]) || 1;
    let matches = [...cur.childNodes].filter((n) => n.nodeType === 1 && n.tagName === tag);
    while (matches.length < idx) {
      cur.appendChild(doc.createElement(tag));
      matches = [...cur.childNodes].filter((n) => n.nodeType === 1 && n.tagName === tag);
    }
    cur = matches[idx - 1];
  }
  if (path.includes("/@")) cur.setAttribute(attr, String(value));
  else cur.textContent = String(value);
}

function fillPathIfEmpty(getPath, setPath, path, value) {
  if (String(getPath(path) ?? "").trim() !== "") return;
  setPath(path, value);
}

function ensureFuelCostLibraryDefault(getPath, setPath) {
  const path = "/HouseFile/FuelCosts/@library";
  const cur = String(getPath(path) ?? "").trim();
  if (!cur || cur === "fuelLib.flc") {
    setPath(path, FUEL_COST_LIBRARY_DEFAULT);
  }
}

function ensureFuelCostDefaults(doc) {
  const getPath = (path) => getXml(doc, path);
  const setPath = (path, value) => setXml(doc, path, value);
  fillPathIfEmpty(getPath, setPath, "/HouseFile/FuelCosts/@includeCostCalculations", "true");
  ensureFuelCostLibraryDefault(getPath, setPath);
  fillPathIfEmpty(getPath, setPath, "/HouseFile/FuelCosts/@ratePeriod", "Annual");
  for (const [tag, label] of Object.entries(FUEL_COST_DEFAULTS)) {
    fillPathIfEmpty(getPath, setPath, `/HouseFile/FuelCosts/${tag}/Fuel[1]/Label`, label);
  }
}

function getFuelRatePeriod(doc) {
  const cur = String(getXml(doc, "/HouseFile/FuelCosts/@ratePeriod") || "").trim();
  if (!cur) return "Annual";
  return cur === "Annual" ? "Annual" : "Monthly";
}

function fuelProfileComboboxOptions(field, currentValue) {
  const tag = field.fuelTag || "";
  const options = FUEL_COST_PROFILE_OPTIONS[tag] || [];
  const list = [...options];
  const val = String(currentValue || "").trim();
  if (val && !list.includes(val)) list.unshift(val);
  return list;
}

function parseMinimalFuelDoc(attrs = {}, labels = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<HouseFile><FuelCosts></FuelCosts></HouseFile>`,
    "application/xml",
  );
  const fuelCosts = doc.documentElement.firstChild;
  for (const [key, value] of Object.entries(attrs)) {
    fuelCosts.setAttribute(key, value);
  }
  for (const [tag, label] of Object.entries(labels)) {
    const fuelType = doc.createElement(tag);
    const fuel = doc.createElement("Fuel");
    fuel.setAttribute("id", "1");
    const labelEl = doc.createElement("Label");
    labelEl.textContent = label;
    fuel.appendChild(labelEl);
    fuelType.appendChild(fuel);
    fuelCosts.appendChild(fuelType);
  }
  return doc;
}

// Static source checks
assert(
  appJs.includes("FUEL_COST_LIBRARY_DEFAULT") &&
    appJs.includes("HOT2000 v11.13b13") &&
    appJs.includes("StdLibs") &&
    appJs.includes("fuellib.flc"),
  "app.js defines HOT2000 fuel cost library default path",
);
assert(appJs.includes('fillPathIfEmpty("/HouseFile/FuelCosts/@ratePeriod", "Annual")'), "Annual is the default rate period");
assert(appJs.includes("FUEL_COST_PROFILE_OPTIONS"), "app.js defines fuel profile option lists");
assert(appJs.includes("fuelProfileOptionsFor"), "fuel profile combobox reads catalog/fallback options");

const ensureFuel = extractFunction(appJs, "ensureFuelCostDefaults");
assert(ensureFuel.includes("ensureFuelCostLibraryDefault"), "ensureFuelCostDefaults applies library default helper");

const ratePeriodHtml = extractFunction(appJs, "fuelRatePeriodHTML");
assert(ratePeriodHtml.includes('value="Annual"'), "Annual radio option exists");
assert(ratePeriodHtml.includes('value="Monthly"'), "Monthly radio option exists");
assert(ratePeriodHtml.includes('name="fuelRatePeriod"'), "Annual/Monthly radios are mutually exclusive");

for (const [tag, options] of Object.entries(FUEL_COST_PROFILE_OPTIONS)) {
  for (const option of options) {
    assert(appJs.includes(`"${option}"`), `app.js includes ${tag} profile option ${option}`);
  }
}

for (const pack of [
  "fuel-cost-profiles-electricity",
  "fuel-cost-profiles-natural-gas",
  "fuel-cost-profiles-oil",
  "fuel-cost-profiles-propane",
  "fuel-cost-profiles-wood",
]) {
  assert(manifest.optionPacks.includes(pack), `${pack} listed in manifest option packs`);
  const optionsFile = JSON.parse(readFileSync(join(root, `catalog/options/${pack}.json`), "utf8"));
  assert(optionsFile.format === "plain-list", `${pack} is plain-list format`);
}

const profileFields = fuelCatalog.groups
  .flatMap((g) => g.fields)
  .filter((f) => f.renderer === "fuel-profile-combobox");
assert(profileFields.length === 5, "five fuel profile combobox fields");
for (const field of profileFields) {
  assert(field.optionsRef, `${field.id} references catalog fuel profile options`);
  assert(!field.optionsStatus, `${field.id} no longer pending manual options`);
}

// Default state for a new/default house
const freshDoc = parseMinimalFuelDoc();
ensureFuelCostDefaults(freshDoc);
assert(
  getXml(freshDoc, "/HouseFile/FuelCosts/@library") === FUEL_COST_LIBRARY_DEFAULT,
  "default fuel cost library path is HOT2000 StdLibs path",
);
assert(getFuelRatePeriod(freshDoc) === "Annual", "Annual is selected by default");
assert(getXml(freshDoc, "/HouseFile/FuelCosts/@ratePeriod") === "Annual", "Annual stored as default rate period");
assert(
  getXml(freshDoc, "/HouseFile/FuelCosts/@includeCostCalculations") === "true",
  "Include Cost Calculations is checked by default",
);
for (const [tag, label] of Object.entries(FUEL_COST_DEFAULTS)) {
  assert(
    getXml(freshDoc, `/HouseFile/FuelCosts/${tag}/Fuel[1]/Label`) === label,
    `${tag} defaults to ${label}`,
  );
}

// Template legacy library path upgrades to HOT2000 default
const templateDoc = parseMinimalFuelDoc({ library: "fuelLib.flc" });
ensureFuelCostDefaults(templateDoc);
assert(
  getXml(templateDoc, "/HouseFile/FuelCosts/@library") === FUEL_COST_LIBRARY_DEFAULT,
  "template legacy fuelLib.flc upgrades to HOT2000 default library path",
);

// Existing saved values override defaults when reloading
const savedDoc = parseMinimalFuelDoc(
  {
    library: "D:\\CustomLibs\\myfuellib.flc",
    ratePeriod: "Monthly",
    includeCostCalculations: "false",
  },
  {
    Electricity: "ManHyd08",
    NaturalGas: "Toronto",
    Oil: "Ottawa97",
    Propane: "Ottawa97",
    Wood: "Sth Ont",
  },
);
ensureFuelCostDefaults(savedDoc);
assert(
  getXml(savedDoc, "/HouseFile/FuelCosts/@library") === "D:\\CustomLibs\\myfuellib.flc",
  "saved custom fuel cost library path is preserved",
);
assert(getFuelRatePeriod(savedDoc) === "Monthly", "saved Monthly rate period is preserved");
assert(
  getXml(savedDoc, "/HouseFile/FuelCosts/@includeCostCalculations") === "false",
  "saved include-cost setting is preserved",
);
assert(
  getXml(savedDoc, "/HouseFile/FuelCosts/Electricity/Fuel[1]/Label") === "ManHyd08",
  "saved electricity profile overrides default",
);
assert(
  getXml(savedDoc, "/HouseFile/FuelCosts/NaturalGas/Fuel[1]/Label") === "Toronto",
  "saved natural gas profile overrides default",
);

// Dropdown option lists and defaults
assert(
  fuelProfileComboboxOptions({ fuelTag: "Electricity" }, "Ottawa97").join(",") ===
    FUEL_COST_PROFILE_OPTIONS.Electricity.join(","),
  "Electricity dropdown contains required options and selects Ottawa97",
);
assert(
  fuelProfileComboboxOptions({ fuelTag: "NaturalGas" }, "Ottawa08").join(",") ===
    FUEL_COST_PROFILE_OPTIONS.NaturalGas.join(","),
  "Natural Gas dropdown contains required options and selects Ottawa08",
);
assert(
  fuelProfileComboboxOptions({ fuelTag: "Oil" }, "Ottawa08").join(",") ===
    FUEL_COST_PROFILE_OPTIONS.Oil.join(","),
  "Oil dropdown contains required options and selects Ottawa08",
);
assert(
  fuelProfileComboboxOptions({ fuelTag: "Propane" }, "Ottawa08").join(",") ===
    FUEL_COST_PROFILE_OPTIONS.Propane.join(","),
  "Propane dropdown contains required options and selects Ottawa08",
);
assert(
  fuelProfileComboboxOptions({ fuelTag: "Wood" }, "Sth Ont").join(",") ===
    FUEL_COST_PROFILE_OPTIONS.Wood.join(","),
  "Wood dropdown contains Sth Ont and selects Sth Ont",
);

// Changing a dropdown persists the selected value
const changedDoc = parseMinimalFuelDoc({}, { Electricity: "Ottawa97" });
setXml(changedDoc, "/HouseFile/FuelCosts/Electricity/Fuel[1]/Label", "WpgHyd97");
assert(
  getXml(changedDoc, "/HouseFile/FuelCosts/Electricity/Fuel[1]/Label") === "WpgHyd97",
  "changing electricity dropdown persists selected value",
);

// Navigation/re-render does not reset selections
ensureFuelCostDefaults(changedDoc);
assert(
  getXml(changedDoc, "/HouseFile/FuelCosts/Electricity/Fuel[1]/Label") === "WpgHyd97",
  "re-render defaults hook does not reset saved electricity profile",
);
setXml(changedDoc, "/HouseFile/FuelCosts/@library", "E:\\Alt\\fuellib.flc");
ensureFuelCostDefaults(changedDoc);
assert(
  getXml(changedDoc, "/HouseFile/FuelCosts/@library") === "E:\\Alt\\fuellib.flc",
  "re-render defaults hook does not reset user-selected library path",
);

// Monthly is not selected by default on a fresh house
assert(getFuelRatePeriod(freshDoc) !== "Monthly" || getXml(freshDoc, "/HouseFile/FuelCosts/@ratePeriod") === "Annual", "Monthly is not selected by default");

console.log("fuel-cost-defaults.test.mjs: all assertions passed");
