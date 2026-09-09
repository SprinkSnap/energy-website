import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

import {
  compareTemplateDiagnostics,
  loadH2kTemplateSync,
  parseH2kXml,
  patchEditorValuesIntoTemplate,
  serializeModelUsingTemplate,
  validateSerializedH2k,
} from "../h2k-template-serializer.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = join(root, "template.h2k");
const templateText = readFileSync(templatePath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function evaluateFirst(doc, xpath) {
  // xmldom supports evaluate in newer versions; use manual path for tests
  if (xpath === "/HouseFile/House") return doc.getElementsByTagName("House")[0] || null;
  if (xpath === "/HouseFile/ProgramInformation/Weather/Location/English") {
    const locs = doc.getElementsByTagName("Location");
    for (let i = 0; i < locs.length; i += 1) {
      const en = locs[i].getElementsByTagName("English")[0];
      if (en) return en;
    }
  }
  if (xpath === "/HouseFile/House/Specifications/Area/@value") {
    const specs = doc.getElementsByTagName("Specifications")[0];
    return specs || null;
  }
  return null;
}

function buildRepresentativeModel() {
  const modelDoc = loadH2kTemplateSync(templateText, DOMParser);
  const weather = modelDoc.getElementsByTagName("Weather")[0];
  const location = weather.getElementsByTagName("Location")[0];
  const english = location.getElementsByTagName("English")[0];
  english.textContent = "OTTAWA INTL";

  const specs = modelDoc.getElementsByTagName("Specifications")[0];
  specs.setAttribute("buildingType", "Single Detached");
  specs.setAttribute("heatedFloorArea", "2200");

  const area = specs.getElementsByTagName("Area")[0] || modelDoc.createElement("Area");
  area.setAttribute("value", "2200");
  if (!area.parentNode) specs.appendChild(area);

  modelDoc.documentElement.setAttribute("uiUnits", "Metric");
  return modelDoc;
}

function requiredSectionsExist(doc) {
  for (const tag of ["Version", "Application", "ProgramInformation", "House", "FuelCosts"]) {
    const nodes = doc.getElementsByTagName(tag);
    assert(nodes.length > 0, `Missing ${tag}`);
  }
}

// A. template loads and parses
const templateDoc = loadH2kTemplateSync(templateText, DOMParser);
assert(templateDoc.documentElement.tagName === "HouseFile", "template root must be HouseFile");

// B/C/D/E. representative model serializes through template
const modelDoc = buildRepresentativeModel();
const generatedXml = serializeModelUsingTemplate(modelDoc, {
  templateText,
  forHot2000: false,
  DOMParserImpl: DOMParser,
  XMLSerializerImpl: XMLSerializer,
});
const generatedDoc = parseH2kXml(generatedXml, DOMParser);

// F. required sections
requiredSectionsExist(generatedDoc);

// G. edited values updated
const genSpecs = generatedDoc.getElementsByTagName("Specifications")[0];
assert(genSpecs.getAttribute("heatedFloorArea") === "2200", "heatedFloorArea should be patched");
assert(generatedDoc.documentElement.getAttribute("uiUnits") === "Metric", "uiUnits should be patched");

// H. unrelated template nodes preserved
const version = generatedDoc.getElementsByTagName("Version")[0];
assert(version.getAttribute("major") === "1", "Version major preserved from template");
const app = generatedDoc.getElementsByTagName("Application")[0];
assert(app.getElementsByTagName("Name")[0].textContent === "HOT2000", "Application preserved");

// I. no parser errors / validation passes
const validation = validateSerializedH2k(generatedXml, DOMParser);
assert(validation.ok, `validation failed: ${validation.errors.join("; ")}`);

// J. saveable .h2k shape
assert(generatedXml.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"), "XML declaration present");
assert(!generatedXml.includes("[object Object]"), "no object coercions");
assert(generatedXml.includes("<HouseFile"), "HouseFile present");

// HOT2000 export preserves AllResults structure (Desktop rejects files without it)
const hotXml = serializeModelUsingTemplate(modelDoc, {
  templateText,
  forHot2000: true,
  DOMParserImpl: DOMParser,
  XMLSerializerImpl: XMLSerializer,
});
assert(hotXml.includes("<AllResults"), "AllResults preserved for HOT2000 input");

const untouchedModel = loadH2kTemplateSync(templateText, DOMParser);
const untouchedHotXml = serializeModelUsingTemplate(untouchedModel, {
  templateText,
  forHot2000: true,
  DOMParserImpl: DOMParser,
  XMLSerializerImpl: XMLSerializer,
});
const hotDiagnostics = compareTemplateDiagnostics(templateText, untouchedHotXml, DOMParser);
const hotStructuralRemovals = hotDiagnostics.removed.filter(
  (path) => !path.startsWith("HouseFile/AllResults"),
);
assert(
  hotStructuralRemovals.length === 0,
  `unexpected HOT2000 export removals: ${hotStructuralRemovals.slice(0, 5).join(", ")}`,
);

// Round-trip preservation: unedited template-only sections remain
const roundTripXml = serializeModelUsingTemplate(untouchedModel, {
  templateText,
  forHot2000: false,
  DOMParserImpl: DOMParser,
  XMLSerializerImpl: XMLSerializer,
});
const diagnostics = compareTemplateDiagnostics(templateText, roundTripXml, DOMParser);
const structuralRemovals = diagnostics.removed.filter(
  (path) => !path.startsWith("HouseFile/AllResults"),
);
assert(
  structuralRemovals.length === 0,
  `unexpected removed paths on round-trip: ${structuralRemovals.slice(0, 5).join(", ")}`,
);

// Patch helper sanity
const patched = loadH2kTemplateSync(templateText, DOMParser);
patchEditorValuesIntoTemplate(patched, modelDoc);
assert(
  patched.getElementsByTagName("Specifications")[0].getAttribute("heatedFloorArea") === "2200",
  "patchEditorValuesIntoTemplate updates Specifications",
);

console.log("template-serializer: all checks passed");
