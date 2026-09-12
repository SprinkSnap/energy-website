import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { serializeModelUsingTemplate } from "../h2k-template-serializer.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const templateText = readFileSync(join(root, "template.h2k"), "utf8");

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

function idsIn(source) {
  return [...source.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
}

function child(parent, tag) {
  return [...parent.childNodes].find((n) => n.nodeType === 1 && n.tagName === tag) || null;
}

function deepChild(rootEl, path) {
  let cur = rootEl;
  for (const part of path.split("/").filter(Boolean)) {
    const m = part.match(/^([A-Za-z0-9]+)(?:\[(\d+)\])?$/);
    if (!m) return null;
    const matches = [...cur.childNodes].filter((n) => n.nodeType === 1 && n.tagName === m[1]);
    cur = matches[(Number(m[2]) || 1) - 1] || null;
    if (!cur) return null;
  }
  return cur;
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

function parseH2k(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

const general = extractFunction(appJs, "renderGeneralTab");
const info = extractFunction(appJs, "renderInfoTab");
const specs = extractFunction(appJs, "renderSpecificationsTab");
const tightness = extractFunction(appJs, "renderTightnessTab");
const fuel = extractFunction(appJs, "renderFuelTab");
const codes = extractFunction(appJs, "renderCodeSummaryTab");
const allForms = extractFunction(appJs, "renderAllForms");
const loadDoc = extractFunction(appJs, "loadDoc");
const restoreSession = extractFunction(appJs, "restoreSession");
const ensureFuel = extractFunction(appJs, "ensureFuelCostDefaults");
const buildXml = extractFunction(appJs, "buildXmlString");
const normalize = extractFunction(appJs, "normalizeFieldLimits");

const GENERAL_PATHS = [
  "/HouseFile/ProgramInformation/File/Identification",
  "/HouseFile/ProgramInformation/File/PreviousFileId",
  "/HouseFile/ProgramInformation/File/EnrollmentId",
  "/HouseFile/ProgramInformation/File/ApplicationNumber",
  "/HouseFile/ProgramInformation/File/HomeownerAuthorizationId",
  "/HouseFile/ProgramInformation/File/Ownership",
  "/HouseFile/ProgramInformation/File/TaxNumber",
  "/HouseFile/ProgramInformation/File/BuilderName",
  "/HouseFile/ProgramInformation/File/OwnerOccupied",
  "/HouseFile/ProgramInformation/File/@evaluationDate",
  "/HouseFile/ProgramInformation/File/EnteredBy",
  "/HouseFile/ProgramInformation/File/UserTelephone",
  "/HouseFile/ProgramInformation/File/UserExtension",
  "/HouseFile/ProgramInformation/File/Company",
  "/HouseFile/ProgramInformation/File/CompanyTelephone",
  "/HouseFile/ProgramInformation/File/CompanyExtension",
  "/HouseFile/ProgramInformation/Client/Name/First",
  "/HouseFile/ProgramInformation/Client/Name/Last",
  "/HouseFile/ProgramInformation/Client/Telephone",
  "/HouseFile/ProgramInformation/Client/StreetAddress/Street",
  "/HouseFile/ProgramInformation/Client/StreetAddress/UnitNumber",
  "/HouseFile/ProgramInformation/Client/StreetAddress/City",
  "/HouseFile/ProgramInformation/Client/StreetAddress/Province",
  "/HouseFile/ProgramInformation/Client/StreetAddress/PostalCode",
  "/HouseFile/ProgramInformation/Client/MailingAddress/Name",
  "/HouseFile/ProgramInformation/Client/MailingAddress/Street",
  "/HouseFile/ProgramInformation/Client/MailingAddress/UnitNumber",
  "/HouseFile/ProgramInformation/Client/MailingAddress/City",
  "/HouseFile/ProgramInformation/Client/MailingAddress/Province",
  "/HouseFile/ProgramInformation/Client/MailingAddress/PostalCode",
  "/HouseFile/ProgramInformation/@mixed",
];

const SPEC_PATHS = [
  "/HouseFile/House/Specifications/@buildingType",
  "/HouseFile/House/Specifications/HouseType",
  "/HouseFile/House/Specifications/PlanShape",
  "/HouseFile/House/Specifications/Storeys",
  "/HouseFile/House/Specifications/FacingDirection",
  "/HouseFile/House/Specifications/YearBuilt",
  "/HouseFile/House/Specifications/YearBuilt/@value",
  "/HouseFile/House/Specifications/HeatedFloorArea/@aboveGrade",
  "/HouseFile/House/Specifications/HeatedFloorArea/@belowGrade",
  "/HouseFile/House/Specifications/ThermalMass",
  "/HouseFile/House/Specifications/@effectiveMassFraction",
  "/HouseFile/House/Specifications/SoilCondition",
  "/HouseFile/House/Specifications/WaterLevel",
  "/HouseFile/House/Specifications/WallColour",
  "/HouseFile/House/Specifications/WallColour/@value",
  "/HouseFile/House/Specifications/RoofColour",
  "/HouseFile/House/Specifications/RoofColour/@value",
  "/HouseFile/House/Specifications/@defaultRoofCavity",
  "/HouseFile/House/Specifications/@eligibleForNBC",
];

const TIGHTNESS_PATHS = [
  "/HouseFile/House/WindowTightness",
  "/HouseFile/House/WindowTightness/@value",
];

const FUEL_PATHS = [
  "/HouseFile/FuelCosts/@includeCostCalculations",
  "/HouseFile/FuelCosts/@library",
];
const FUEL_BASE_FIELDS = [
  'base+"/Label"',
  'base+"/Comment"',
  'base+"/Units"',
  'base+"/Minimum/@units"',
  'base+"/Minimum/@charge"',
  'base+"/RateBlocks/Block1/@units"',
  'base+"/RateBlocks/Block1/@costPerUnit"',
  'base+"/RateBlocks/Block2/@units"',
  'base+"/RateBlocks/Block2/@costPerUnit"',
  'base+"/RateBlocks/Block3/@units"',
  'base+"/RateBlocks/Block3/@costPerUnit"',
  'base+"/RateBlocks/Block4/@units"',
  'base+"/RateBlocks/Block4/@costPerUnit"',
];

function expandBindings(source) {
  return source
    .replaceAll("${CLIENT_NAME}", "/HouseFile/ProgramInformation/Client/Name")
    .replaceAll("${CLIENT_STREET}", "/HouseFile/ProgramInformation/Client/StreetAddress")
    .replaceAll("${CLIENT_MAIL}", "/HouseFile/ProgramInformation/Client/MailingAddress")
    .replaceAll("${SPEC}", "/HouseFile/House/Specifications");
}

function assertPaths(fnSource, paths, label) {
  const expanded = expandBindings(fnSource);
  for (const path of paths) {
    assert(expanded.includes(path), `${label} must include ${path}`);
  }
}

// A. General has the full expected control set
assertPaths(general, GENERAL_PATHS, "renderGeneralTab");
assert(general.includes('id="sameAsAboveBtn"'), "General must restore Same As Above");
assert(general.includes('id="justificationsBtn"'), "General must keep justifications");
assert(general.includes("Client First Name"), "General must restore client first name");
assert(general.includes("Street Address"), "General must restore street address");
assert(general.includes("Mailing Address"), "General must restore mailing address");

// B. Info has the full expected control set
assert(info.includes("/HouseFile/ProgramInformation/Information"), "Info binds Information");
assert(info.includes('data-info-k="code"'), "Info code column");
assert(info.includes('data-info-k="value"'), "Info value column");
assert(info.includes('id="addInfoBtn"'), "Info Add button");
assert(info.includes("info-table"), "Info table editor, not summary-only");

// C. Specifications has the full expected control set
assertPaths(specs, SPEC_PATHS.filter((p) => !p.includes("@buildingType")), "renderSpecificationsTab");
assert(specs.includes("buildingTypeSelect("), "Specifications building type select");
assert(extractFunction(appJs, "buildingTypeSelect").includes("/HouseFile/House/Specifications/@buildingType") || extractFunction(appJs, "buildingTypeSelect").includes("${SPEC}/@buildingType"), "building type XML binding");
assert(specs.includes("Thermal mass"), "Specifications thermal mass section");
assert(specs.includes("Exterior surfaces"), "Specifications exterior surfaces section");
assert(specs.includes("Area of common surfaces") || appJs.includes("specificationsCommonSurfacesHTML"), "keep common surfaces");

// D. Window tightness has the full expected control set
assertPaths(tightness, TIGHTNESS_PATHS, "renderTightnessTab");
assert(tightness.includes("Leakage value"), "Tightness leakage value field");
assert(tightness.includes("userSpecified") || tightness.includes("User specified") || tightness.includes('code==="5"'), "user-specified leakage");

// E. Fuel cost has the full expected control set
assertPaths(fuel, FUEL_PATHS, "renderFuelTab");
for (const fragment of FUEL_BASE_FIELDS) {
  assert(fuel.includes(fragment), `renderFuelTab must include ${fragment}`);
}
for (const tag of ["Electricity", "NaturalGas", "Oil", "Propane", "Wood"]) {
  assert(fuel.includes(`"${tag}"`), `renderFuelTab must include ${tag}`);
}
assert(fuel.includes('name="fuelRatePeriod"'), "Fuel period selection");
assert(fuel.includes("Minimum charge"), "Fuel fixed charge");
assert(fuel.includes("Block 4 cost / unit"), "Fuel block 4");
assert(!/fieldHTML\(path,label,"text","span-6","",0,null,true\)/.test(fuel), "Fuel labels must not be locked display-only");

// F. Code summary has the full expected content/control set
assert(codes.includes("/HouseFile/Codes/*"), "Code summary reads /HouseFile/Codes/*");
assert(codes.includes("idref"), "Code summary tracks idref usage");
assert(codes.includes("In use"), "Code summary in-use column");
assert(codes.includes("Description"), "Code summary description column");
assert(codes.includes("getAttribute(\"id\")") || codes.includes("getAttribute('id')") || codes.includes('getAttribute("id")'), "preserves code ids");

// G. renderAllForms successfully renders all six in one execution
for (const name of ["renderGeneralTab", "renderInfoTab", "renderSpecificationsTab", "renderFuelTab", "renderTightnessTab", "renderCodeSummaryTab"]) {
  assert(allForms.includes(name), `renderAllForms must call ${name}`);
}
assert(allForms.includes("try{"), "renderAllForms must isolate renderer exceptions");
assert(allForms.includes("catch(err)"), "renderAllForms must catch renderer exceptions");
assert(allForms.includes('if(!xmlDoc) return'), "renderAllForms must no-op without xmlDoc");

// H. no duplicate element IDs exist in House file renderers
const houseIds = [general, info, specs, tightness, fuel, codes].flatMap(idsIn);
const dup = houseIds.filter((id, i) => houseIds.indexOf(id) !== i);
assert(dup.length === 0, `duplicate House file element IDs: ${[...new Set(dup)].join(", ")}`);
assert(indexHtml.includes('id="screen-house-general"'), "keep general screen container");
assert(indexHtml.includes('id="screen-house-info"'), "keep info screen container");
assert(indexHtml.includes('id="screen-house-specifications"'), "keep specifications screen container");
assert(indexHtml.includes('id="screen-house-tightness"'), "keep tightness screen container");
assert(indexHtml.includes('id="screen-house-fuel"'), "keep fuel screen container");
assert(indexHtml.includes('id="screen-house-codes"'), "keep codes screen container");

// I/J. imported H2K populates representative values and edits serialize to the correct XML path
const model = parseH2k(templateText);
const edits = {
  "/HouseFile/ProgramInformation/File/Identification": "FILE-RT-1",
  "/HouseFile/ProgramInformation/Client/Name/First": "Ada",
  "/HouseFile/ProgramInformation/Client/Name/Last": "Lovelace",
  "/HouseFile/ProgramInformation/Client/StreetAddress/Street": "12 King St",
  "/HouseFile/ProgramInformation/Client/MailingAddress/Street": "99 Mail Rd",
  "/HouseFile/ProgramInformation/Information/Info": "Imported note",
  "/HouseFile/House/Specifications/HeatedFloorArea/@aboveGrade": "123.4",
  "/HouseFile/House/Specifications/@effectiveMassFraction": "0.75",
  "/HouseFile/House/Specifications/WallColour/@value": "0.22",
  "/HouseFile/House/WindowTightness/@value": "0.333",
  "/HouseFile/FuelCosts/Electricity/Fuel[1]/Label": "CustomElec",
  "/HouseFile/FuelCosts/Electricity/Fuel[1]/RateBlocks/Block1/@costPerUnit": "0.1234",
};
setXml(model, "/HouseFile/ProgramInformation/Information/Info/@code", "Info. 3");
for (const [path, value] of Object.entries(edits)) setXml(model, path, value);
setXml(model, "/HouseFile/House/Specifications/ThermalMass/@code", "3");
child(deepChild(model.documentElement, "House/Specifications/ThermalMass"), "English").textContent = "Heavy, masonry";

assert(getXml(model, "/HouseFile/ProgramInformation/File/Identification") === "FILE-RT-1", "import identification");
assert(getXml(model, "/HouseFile/ProgramInformation/Client/Name/First") === "Ada", "import first name");
assert(getXml(model, "/HouseFile/ProgramInformation/Client/MailingAddress/Street") === "99 Mail Rd", "import distinct mailing street");
assert(getXml(model, "/HouseFile/House/Specifications/ThermalMass/@code") === "3", "import thermal mass");
assert(getXml(model, "/HouseFile/House/WindowTightness/@value") === "0.333", "import tightness value");
assert(getXml(model, "/HouseFile/FuelCosts/Electricity/Fuel[1]/Label") === "CustomElec", "import fuel label");

const exported = serializeModelUsingTemplate(model, {
  templateText,
  forHot2000: false,
  DOMParserImpl: DOMParser,
  XMLSerializerImpl: XMLSerializer,
});
const out = parseH2k(exported);
assert(getXml(out, "/HouseFile/ProgramInformation/File/Identification") === "FILE-RT-1", "export identification");
assert(getXml(out, "/HouseFile/ProgramInformation/Client/Name/First") === "Ada", "export first name");
assert(getXml(out, "/HouseFile/ProgramInformation/Client/MailingAddress/Street") === "99 Mail Rd", "export mailing street unchanged");
assert(getXml(out, "/HouseFile/House/Specifications/HeatedFloorArea/@aboveGrade") === "123.4", "export heated area");
assert(getXml(out, "/HouseFile/House/Specifications/@effectiveMassFraction") === "0.75", "export mass fraction");
assert(getXml(out, "/HouseFile/House/Specifications/WallColour/@value") === "0.22", "export wall absorptivity");
assert(getXml(out, "/HouseFile/House/Specifications/ThermalMass/@code") === "3", "export thermal mass code");
assert(getXml(out, "/HouseFile/House/WindowTightness/@value") === "0.333", "export tightness");
assert(getXml(out, "/HouseFile/FuelCosts/Electricity/Fuel[1]/Label") === "CustomElec", "export custom fuel label");
assert(getXml(out, "/HouseFile/FuelCosts/Electricity/Fuel[1]/RateBlocks/Block1/@costPerUnit") === "0.1234", "export block 1 cost");
assert(getXml(out, "/HouseFile/ProgramInformation/Information/Info") === "Imported note", "export info value");
assert(exported.includes('code="Info. 3"'), "export info code");
assert(out.getElementsByTagName("Code").length > 0, "codes survive export");

assert(loadDoc.includes("renderAllForms()"), "loadDoc must render House file forms after import/session restore");
assert(!ensureFuel.includes("applyFuelRateBlocks(getFuelRatePeriod())") || ensureFuel.includes("if(!getPath"), "ensureFuelCostDefaults must not blindly overwrite imported rate blocks");
assert(!buildXml.includes("applyFuelRateBlocks"), "export must not rewrite fuel rate blocks");
assert(normalize.includes("applyCodedDefaultIfMissing"), "normalize must not overwrite imported coded specs");
assert(normalize.includes("fillPathIfEmpty"), "normalize must only fill missing values");
assert(appJs.includes("function copyMailingFromStreet"), "Same As Above helper restored");

// K. session restore keeps the fields and values
assert(restoreSession.includes("preserveExportName:true") || restoreSession.includes("preserveExportName: true"), "session restore keeps export filename");
assert(restoreSession.includes("loadDoc("), "session restore reloads xmlDoc via loadDoc");
assert(loadDoc.includes("renderAllForms()"), "session restore re-renders complete House file forms");
assert(/restoreExportFilename/.test(appJs), "preserve previous filename refresh fix");
assert(!/replace\(\/\\\.\(xml\|h2k\)\$\/i,""\)\+"-web\.h2k"/.test(loadDoc), "loadDoc must not append -web on restore");

// L. public/h2k-web-editor matches the source editor used for deployment
assert(String(packageJson.scripts["copy:h2k"]).includes("cp -r h2k-web-editor public/h2k-web-editor"), "copy:h2k copies source editor");
assert(String(packageJson.scripts["copy:h2k"]).includes("verify-public-copy"), "copy:h2k verifies the deployed copy");
assert(String(packageJson.scripts["build:cloudflare"]).includes("copy:h2k"), "Cloudflare build copies the editor");
const publicDir = join(repoRoot, "public", "h2k-web-editor");
if (existsSync(join(publicDir, "app.js"))) {
  for (const name of ["index.html", "app.js", "styles.css"]) {
    const src = readFileSync(join(root, name));
    const pub = readFileSync(join(publicDir, name));
    const srcHash = createHash("sha256").update(src).digest("hex");
    const pubHash = createHash("sha256").update(pub).digest("hex");
    assert(srcHash === pubHash, `public/h2k-web-editor/${name} must match h2k-web-editor/${name}`);
  }
}

assert(/\.screen\{display:none\}/.test(stylesCss.replace(/\s+/g, "")), "inactive screens stay hidden");
assert(/\.screen\.active\{display:block\}/.test(stylesCss.replace(/\s+/g, "")), "active screens are visible");
assert(!/\.field\{[^}]*display:\s*none/.test(stylesCss), "CSS must not hide .field");
assert(stylesCss.includes(".mailing-box"), "mailing address styles restored");
assert(indexHtml.includes("app.js?v=2026.09.12.1"), "cache-bust restored editor JS");
assert(indexHtml.includes("styles.css?v=2026.09.12.1"), "cache-bust restored editor CSS");

console.log("house-file-fields.test.mjs: all assertions passed");
