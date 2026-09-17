/**
 * Node regression tests for template-based H2K serialization.
 * Run: node h2k-web-editor/test/h2k-serializer.test.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import xpath from "xpath";

const select = xpath.useNamespaces({});
globalThis.xpathSelect = (path, doc, single) => select(path, doc, single);
globalThis.xpathSelectAll = (path, doc) => select(path, doc);
function xp(doc, path) {
  return select(path, doc, true);
}
function xpa(doc, path) {
  return select(path, doc);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templateXml = readFileSync(join(root, "template.h2k"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadModule(path) {
  const code = readFileSync(path, "utf8");
  // Modules attach to globalThis via IIFE tail.
  eval(code);
}

loadModule(join(root, "h2k-units.js"));
loadModule(join(root, "h2k-validator.js"));
loadModule(join(root, "h2k-structure-diff.js"));
loadModule(join(root, "h2k-serializer.js"));

const { H2kUnits, H2kValidator, H2kStructureDiff, H2KSerializer } = globalThis;

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) throw new Error(err.textContent);
  return doc;
}

// xp/xpa defined at top with xpath package

// --- Unit conversion tests ---
assert(H2kUnits.feetToMetres(3.280839895).toFixed(4) === "1.0000", "feetToMetres");
assert(H2kUnits.metresToFeet(1).toFixed(3) === "3.281", "metresToFeet");
assert(H2kUnits.squareFeetToSquareMetres(10.7639).toFixed(2) === "1.00", "sqft to m2");
assert(H2kUnits.rValueToRsi(1).toFixed(4) === "0.1761", "rValueToRsi");
assert(H2kUnits.cfmToLitresPerSecond(2.11888).toFixed(3) === "1.000", "cfm to L/s");
assert(H2kUnits.fahrenheitToCelsius(32) === 0, "fahrenheitToCelsius freezing");
assert(H2kUnits.toSI(10, "area", "imperial").toFixed(4) === "0.9290", "toSI area");

// --- Template parse ---
const templateDoc = parseXml(templateXml);
assert(templateDoc.documentElement.tagName === "HouseFile", "template root is HouseFile");
assert(xp(templateDoc, "/HouseFile/Version"), "template has Version");
assert(xp(templateDoc, "/HouseFile/Program/Results/Tsv"), "template has Program/Results/Tsv");

// --- Round-trip: template → editor clone → serialize preserves Tsv ---
const editorDoc = parseXml(templateXml);
const exported = H2KSerializer.buildH2kFromTemplate(editorDoc, templateXml, {
  forHot2000: true,
  validate: true,
  DOMParserImpl: DOMParser,
  XMLSerializerImpl: XMLSerializer,
});
const outDoc = parseXml(exported);
assert(xp(outDoc, "/HouseFile/Program/Results/Tsv"), "export preserves Program/Results/Tsv");
assert(
  xpa(outDoc, "/HouseFile/Program/Results/Tsv/*").length >= 400,
  "export preserves Tsv field count",
);
assert(xp(outDoc, "/HouseFile/Program/Results/RefHse"), "export preserves RefHse");
assert(xp(outDoc, "/HouseFile/Version"), "export preserves Version from template");

// --- CoolingSeason must not get English/French children ---
const start = xp(outDoc, "/HouseFile/House/HeatingCooling/CoolingSeason/Start");
assert(start && start.textContent.trim() === "January", "CoolingSeason/Start text preserved");
assert(!xp(outDoc, "/HouseFile/House/HeatingCooling/CoolingSeason/Start/English"), "CoolingSeason/Start has no English child");

// --- Field-level: yearBuilt change ---
const editor2 = parseXml(templateXml);
const yearNode = xp(editor2, "/HouseFile/House/Specifications/YearBuilt");
yearNode.setAttribute("value", "1999");
const exported2 = H2KSerializer.buildH2kFromTemplate(editor2, templateXml, {
  forHot2000: true,
  validate: true,
  DOMParserImpl: DOMParser,
  XMLSerializerImpl: XMLSerializer,
});
const out2 = parseXml(exported2);
assert(
  xp(out2, "/HouseFile/House/Specifications/YearBuilt")?.getAttribute("value") === "1999",
  "yearBuilt maps to YearBuilt/@value",
);

// --- ACH50 field ---
const editor3 = parseXml(templateXml);
const blower = xp(editor3, "/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest");
if (blower) {
  blower.setAttribute("airChangeRate", "2.5");
  const exported3 = H2KSerializer.buildH2kFromTemplate(editor3, templateXml, {
    forHot2000: true,
    validate: true,
    DOMParserImpl: DOMParser,
    XMLSerializerImpl: XMLSerializer,
  });
  const out3 = parseXml(exported3);
  assert(
    xp(out3, "/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest")?.getAttribute("airChangeRate") === "2.5",
    "ACH maps to BlowerTest/@airChangeRate",
  );
}

// --- Structure diff: unchanged template export should not remove major subtrees ---
const diff = H2kStructureDiff.compareH2kStructure(templateDoc, outDoc);
const removedMajor = diff.removed.filter((r) =>
  /\/(Tsv|RefHse|Version|Application)$/.test(r.xpath),
);
assert(removedMajor.length === 0, `no major template subtrees removed (${removedMajor.length})`);

// --- Validator rejects bad XML ---
const badDoc = parseXml("<HouseFile><House/></HouseFile>");
const badResult = H2kValidator.validateH2kDocument(badDoc);
assert(!badResult.ok, "validator catches incomplete document");

// --- Serialized output re-parses ---
const valResult = H2kValidator.validateSerializedH2k(exported, parseXml);
assert(valResult.ok, "serialized output validates");

// --- Program rebuild simulation (app.js fix): Tsv preserved after Program replace ---
function simulateProgramRebuild(doc) {
  const existing = xp(doc, "/HouseFile/Program");
  const results = existing?.getElementsByTagName("Results")[0];
  const tsv = results?.getElementsByTagName("Tsv")[0];
  const refHse = results?.getElementsByTagName("RefHse")[0];
  assert(tsv, "pre-rebuild Tsv exists");
  const newResults = doc.createElement("Results");
  const ers = doc.createElement("Ers");
  const el = doc.createElement("YearBuilt");
  el.setAttribute("value", "0");
  ers.appendChild(el);
  newResults.appendChild(ers);
  if (tsv) newResults.appendChild(tsv.cloneNode(true));
  if (refHse) newResults.appendChild(refHse.cloneNode(true));
  results.parentNode.replaceChild(newResults, results);
}
const editor4 = parseXml(templateXml);
simulateProgramRebuild(editor4);
assert(xp(editor4, "/HouseFile/Program/Results/Tsv"), "Program rebuild preserves Tsv");

console.log("h2k-serializer.test: all checks passed");
