/**
 * Template-based H2K serialization for the HOT2000 web editor.
 *
 * generatedH2k = deepClone(template.h2k)
 *   → patchEditorValues(generatedH2k, currentModel)
 *   → HOT2000 Desktop compatibility attrs (preserve AllResults structure)
 *   → validate
 *   → serialize
 */

const XML_NS = "http://www.w3.org/XML/1998/namespace";

/** HouseFile child elements owned by the web editor (patched from the live model). */
export const EDITOR_OWNED_HOUSEFILE_CHILDREN = [
  "ProgramInformation",
  "House",
  "Codes",
  "FuelCosts",
  "Program",
];

/** HouseFile child elements preserved from template.h2k (never taken from the model). */
export const PRESERVED_TEMPLATE_CHILDREN = ["Version", "Application"];

/** Major House sections the editor patches (via the whole House subtree). */
export const PATCHED_HOUSE_SECTIONS = [
  "Labels",
  "Specifications",
  "WindowTightness",
  "Temperatures",
  "BaseLoads",
  "Generation",
  "NaturalAirInfiltration",
  "Ventilation",
  "HeatingCooling",
  "Components",
];

let cachedTemplateText = null;
let templateLoadPromise = null;

function elementChildren(parent) {
  if (!parent) return [];
  if (parent.children) return [...parent.children];
  return [...parent.childNodes].filter((node) => node.nodeType === 1);
}

function directChild(parent, tag) {
  if (!parent) return null;
  return elementChildren(parent).find((node) => node.tagName === tag) || null;
}

function evaluateFirst(doc, xpath) {
  if (typeof doc.evaluate === "function" && typeof XPathResult !== "undefined") {
    return doc.evaluate(
      xpath,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
  }

  const root = doc.documentElement;
  if (xpath === "/HouseFile/AllResults") return directChild(root, "AllResults");
  if (xpath === "/HouseFile/FuelCosts") return directChild(root, "FuelCosts");
  if (xpath === "/HouseFile/House") return directChild(root, "House");
  if (xpath === "/HouseFile/House/BaseLoads") return directChild(directChild(root, "House"), "BaseLoads");
  if (xpath === "/HouseFile/Program/Results") {
    return directChild(directChild(root, "Program"), "Results");
  }
  if (xpath.startsWith("/HouseFile/House/") && xpath.includes("/@")) {
    const attr = xpath.split("/@").pop();
    const parts = xpath.replace(/^\/HouseFile\//, "").split("/").slice(0, -1);
    let cur = root;
    for (const part of parts) {
      cur = directChild(cur, part);
      if (!cur) return null;
    }
    return cur;
  }
  if (xpath === "//ClothesWasher | //DishWasher | //ClothesDryer") {
    return doc.getElementsByTagName("ClothesWasher")[0]
      || doc.getElementsByTagName("DishWasher")[0]
      || doc.getElementsByTagName("ClothesDryer")[0]
      || null;
  }
  return null;
}

function evaluateAll(doc, xpath) {
  if (typeof doc.evaluate === "function" && typeof XPathResult !== "undefined") {
    const snap = doc.evaluate(
      xpath,
      doc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );
    return Array.from({ length: snap.snapshotLength }, (_, i) => snap.snapshotItem(i));
  }
  if (xpath === "//ClothesWasher | //DishWasher | //ClothesDryer") {
    return ["ClothesWasher", "DishWasher", "ClothesDryer"].flatMap((tag) =>
      [...doc.getElementsByTagName(tag)],
    );
  }
  const one = evaluateFirst(doc, xpath);
  return one ? [one] : [];
}

function cloneDocument(doc) {
  const clone = doc.cloneNode(true);
  return clone.ownerDocument || clone;
}

function resolveDOMParser(DOMParserImpl) {
  const Parser = DOMParserImpl || globalThis.DOMParser;
  if (!Parser) throw new Error("DOMParser is not available");
  return Parser;
}

function resolveXMLSerializer(XMLSerializerImpl) {
  const Serializer = XMLSerializerImpl || globalThis.XMLSerializer;
  if (!Serializer) throw new Error("XMLSerializer is not available");
  return Serializer;
}

export function parseH2kXml(text, DOMParserImpl) {
  const doc = new (resolveDOMParser(DOMParserImpl))().parseFromString(String(text), "application/xml");
  const err =
    doc.getElementsByTagName?.("parsererror")?.[0] ||
    (typeof doc.querySelector === "function" ? doc.querySelector("parsererror") : null);
  if (err) {
    throw new Error(`Invalid XML: ${String(err.textContent || "parser error").slice(0, 240)}`);
  }
  return doc;
}

export function readTemplateFromFilesystem(readTextSync, templatePath) {
  return readTextSync(templatePath, "utf8");
}

export async function fetchTemplateText(fetchImpl, url) {
  const res = await fetchImpl(url, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Could not load template.h2k (${res.status})`);
  }
  return res.text();
}

/**
 * Load canonical template.h2k text.
 * @param {object} [options]
 * @param {() => string} [options.fallbackText] embedded fallback (e.g. TEMPLATE_B64 decode)
 * @param {string} [options.url="./template.h2k"]
 * @param {(path:string)=>string} [options.readFileSync] Node filesystem loader
 * @param {string} [options.templatePath]
 */
export async function loadH2kTemplateText(options = {}) {
  if (cachedTemplateText) return cachedTemplateText;

  const readFileSync = options.readFileSync;
  if (readFileSync && options.templatePath) {
    cachedTemplateText = readTemplateFromFilesystem(readFileSync, options.templatePath);
    return cachedTemplateText;
  }

  if (templateLoadPromise) return templateLoadPromise;

  templateLoadPromise = (async () => {
    const url = options.url || "./template.h2k";
    try {
      cachedTemplateText = await fetchTemplateText(fetch.bind(globalThis), url);
      return cachedTemplateText;
    } catch (err) {
      if (typeof options.fallbackText === "function") {
        cachedTemplateText = options.fallbackText();
        return cachedTemplateText;
      }
      throw err;
    }
  })();

  return templateLoadPromise;
}

export function setCachedTemplateText(text) {
  cachedTemplateText = String(text);
  templateLoadPromise = Promise.resolve(cachedTemplateText);
}

export function getCachedTemplateText() {
  return cachedTemplateText;
}

/**
 * Parse template.h2k into a DOM Document (clone source — callers should clone again before patching).
 */
export async function loadH2kTemplate(options = {}) {
  const text = cachedTemplateText || (await loadH2kTemplateText(options));
  return parseH2kXml(text, options.DOMParserImpl);
}

export function loadH2kTemplateSync(text, DOMParserImpl) {
  return parseH2kXml(text, DOMParserImpl);
}

function copyHouseFileAttributes(modelRoot, templateRoot) {
  for (const attr of ["uiUnits"]) {
    const value = modelRoot.getAttribute(attr);
    if (value != null && value !== "") {
      templateRoot.setAttribute(attr, value);
    }
  }
  const lang = modelRoot.getAttributeNS(XML_NS, "lang");
  if (lang) {
    templateRoot.setAttributeNS(XML_NS, "xml:lang", lang);
  }
}

function removeNode(node) {
  if (!node || !node.parentNode) return;
  if (typeof node.remove === "function") {
    node.remove();
    return;
  }
  node.parentNode.removeChild(node);
}

function replaceNode(existing, replacement) {
  if (!existing || !existing.parentNode) return;
  if (typeof existing.replaceWith === "function") {
    existing.replaceWith(replacement);
    return;
  }
  existing.parentNode.replaceChild(replacement, existing);
}

function replaceDirectChild(templateDoc, templateRoot, tag, modelNode) {
  const existing = directChild(templateRoot, tag);
  const imported = templateDoc.importNode(modelNode, true);
  if (existing) {
    replaceNode(existing, imported);
    return;
  }
  const allResults = directChild(templateRoot, "AllResults");
  if (allResults) {
    templateRoot.insertBefore(imported, allResults);
  } else {
    templateRoot.appendChild(imported);
  }
}

/**
 * Patch editor-controlled values from modelDoc into a cloned template document.
 */
export function patchEditorValuesIntoTemplate(templateDoc, modelDoc) {
  const templateRoot = templateDoc.documentElement;
  const modelRoot = modelDoc.documentElement;
  if (!templateRoot || templateRoot.tagName !== "HouseFile") {
    throw new Error("Template root must be HouseFile");
  }
  if (!modelRoot || modelRoot.tagName !== "HouseFile") {
    throw new Error("Model root must be HouseFile");
  }

  copyHouseFileAttributes(modelRoot, templateRoot);

  for (const tag of EDITOR_OWNED_HOUSEFILE_CHILDREN) {
    const modelNode = directChild(modelRoot, tag);
    const templateNode = directChild(templateRoot, tag);
    if (modelNode) {
      replaceDirectChild(templateDoc, templateRoot, tag, modelNode);
    } else if (templateNode && tag === "Program") {
      removeNode(templateNode);
    }
  }

  return templateDoc;
}

/**
 * When persisting a non-HOT2000 export (session storage), keep imported calculation
 * results from the live model instead of template defaults.
 */
export function patchImportedResultsFromModel(templateDoc, modelDoc) {
  const templateRoot = templateDoc.documentElement;
  const modelRoot = modelDoc.documentElement;
  const modelAllResults = directChild(modelRoot, "AllResults");
  if (modelAllResults) {
    replaceDirectChild(templateDoc, templateRoot, "AllResults", modelAllResults);
  }
  return templateDoc;
}

/**
 * Remove stale HOT2000 calculation output so worker results are never reused.
 */
export function stripCalculationResults(doc) {
  removeNode(evaluateFirst(doc, "/HouseFile/AllResults"));

  const programResults = evaluateFirst(doc, "/HouseFile/Program/Results");
  if (programResults) {
    elementChildren(programResults)
      .filter((node) => node.tagName === "Tsv")
      .forEach((node) => removeNode(node));
  }
}

export function applyHot2000DesktopCompatibility(doc) {
  const fuelCosts = evaluateFirst(doc, "/HouseFile/FuelCosts");
  if (fuelCosts) fuelCosts.removeAttribute("ratePeriod");

  const baseLoads = evaluateFirst(doc, "/HouseFile/House/BaseLoads");
  if (baseLoads) baseLoads.removeAttribute("userSpecifiedUsage");

  const applianceNodes = evaluateAll(
    doc,
    "//ClothesWasher | //DishWasher | //ClothesDryer",
  );
  applianceNodes.forEach((node) => node?.removeAttribute("installed"));
}

function getAttributeAtPath(doc, parts, attr) {
  let cur = doc.documentElement;
  for (const part of parts) {
    cur = directChild(cur, part);
    if (!cur) return null;
  }
  return cur?.getAttribute(attr);
}

function collectNumericIssues(doc, errors, limit = 40) {
  const numericPaths = [
    [["House", "Specifications", "Area"], "value"],
    [["House", "NaturalAirInfiltration", "Specifications", "BlowerTest"], "airChangeRate"],
    [["House", "Components", "HotWater", "Primary", "EnergyFactor"], "value"],
  ];
  for (const [parts, attr] of numericPaths) {
    const raw = getAttributeAtPath(doc, parts, attr);
    if (raw == null || String(raw).trim() === "") continue;
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      errors.push(`Non-finite numeric value at House/${parts.join("/")}/@${attr}: ${raw}`);
      if (errors.length >= limit) break;
    }
  }
}

export function validateSerializedH2k(xmlString, DOMParserImpl) {
  const errors = [];
  const text = String(xmlString ?? "");

  if (!text.trim()) errors.push("Serialized XML is empty");
  if ((text.match(/<\?xml/g) || []).length > 1) errors.push("Duplicate XML declaration");
  if (/\[object Object\]/.test(text)) errors.push('Serialized XML contains "[object Object]"');
  if (/\bundefined\b/.test(text)) errors.push('Serialized XML contains "undefined"');
  if (/\bnull\b/.test(text) && /<[^>]*>\s*null\s*<\/[^>]+>/.test(text)) {
    errors.push('Serialized XML contains literal "null" text content');
  }

  let doc;
  try {
    doc = parseH2kXml(text, DOMParserImpl);
  } catch (err) {
    errors.push(String(err.message || err));
    return { ok: false, errors };
  }

  const root = doc.documentElement;
  if (!root || root.tagName !== "HouseFile") errors.push("Root element must be HouseFile");
  if (!evaluateFirst(doc, "/HouseFile/House")) errors.push("Missing /HouseFile/House");

  for (const tag of ["Version", "Application", "ProgramInformation", "House"]) {
    if (!directChild(root, tag)) errors.push(`Missing required section: ${tag}`);
  }

  for (const tag of PRESERVED_TEMPLATE_CHILDREN) {
    if (!directChild(root, tag)) errors.push(`Missing preserved template section: ${tag}`);
  }

  collectNumericIssues(doc, errors);
  return { ok: errors.length === 0, errors };
}

export function serializeDocument(doc, XMLSerializerImpl) {
  const serialized = new (resolveXMLSerializer(XMLSerializerImpl))().serializeToString(doc.documentElement);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
}

/**
 * Canonical H2K generation path: clone template.h2k, patch model values, validate, serialize.
 * @param {Document} modelDoc current in-memory editor XML
 * @param {object} [options]
 * @param {boolean} [options.forHot2000=true] strip stale results + Desktop-incompatible attrs
 * @param {string} [options.templateText] optional preloaded template text
 * @param {boolean} [options.skipValidation=false]
 */
export function serializeModelUsingTemplate(modelDoc, options = {}) {
  if (!modelDoc) throw new Error("No model document to serialize");

  const forHot2000 = options.forHot2000 !== false;
  const templateText = options.templateText || cachedTemplateText;
  if (!templateText) {
    throw new Error("H2K template is not loaded yet");
  }

  const templateBase = loadH2kTemplateSync(templateText, options.DOMParserImpl);
  const outputDoc = cloneDocument(templateBase);
  patchEditorValuesIntoTemplate(outputDoc, modelDoc);

  if (forHot2000) {
    // Preserve template AllResults / Program Tsv structure — HOT2000 Desktop rejects
    // files missing AllResults. Fresh SOC policy is enforced in the app/worker, not by
    // deleting calculation nodes from the exported input file.
    applyHot2000DesktopCompatibility(outputDoc);
  } else {
    patchImportedResultsFromModel(outputDoc, modelDoc);
  }

  const xml = serializeDocument(outputDoc, options.XMLSerializerImpl);
  if (!options.skipValidation) {
    const validation = validateSerializedH2k(xml, options.DOMParserImpl);
    if (!validation.ok) {
      throw new Error(`H2K validation failed: ${validation.errors.join("; ")}`);
    }
  }
  return xml;
}

function nodePath(node) {
  const parts = [];
  let cur = node;
  while (cur && cur.nodeType === 1) {
    const siblings = cur.parentNode
      ? elementChildren(cur.parentNode).filter((n) => n.tagName === cur.tagName)
      : [cur];
    const index = siblings.indexOf(cur) + 1;
    parts.unshift(`${cur.tagName}[${index}]`);
    cur = cur.parentNode;
    if (cur && cur.tagName === "HouseFile") {
      parts.unshift("HouseFile");
      break;
    }
  }
  return parts.join("/");
}

function walkElements(node, map, prefix = "") {
  if (!node || node.nodeType !== 1) return;
  const path = prefix || nodePath(node);
  map.set(path, node);
  for (const child of elementChildren(node)) {
    walkElements(child, map, nodePath(child));
  }
}

function summarizeNode(node) {
  if (!node) return "";
  if (node.nodeType !== 1) return String(node.textContent ?? "");
  const attrs = [...node.attributes]
    .map((attr) => `@${attr.name}=${JSON.stringify(attr.value)}`)
    .join(" ");
  const text = [...node.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join("")
    .trim();
  return `<${node.tagName}${attrs ? " " + attrs : ""}>${text}`;
}

/**
 * Development-only structural diff between template and generated H2K.
 */
export function compareTemplateDiagnostics(templateText, generatedXml, DOMParserImpl) {
  const templateDoc = loadH2kTemplateSync(templateText, DOMParserImpl);
  const generatedDoc = parseH2kXml(generatedXml, DOMParserImpl);

  const templateMap = new Map();
  const generatedMap = new Map();
  walkElements(templateDoc.documentElement, templateMap);
  walkElements(generatedDoc.documentElement, generatedMap);

  const changed = [];
  const added = [];
  const removed = [];

  for (const [path, node] of templateMap.entries()) {
    if (!generatedMap.has(path)) {
      removed.push(path);
      continue;
    }
    if (summarizeNode(node) !== summarizeNode(generatedMap.get(path))) {
      changed.push(path);
    }
  }
  for (const path of generatedMap.keys()) {
    if (!templateMap.has(path)) added.push(path);
  }

  return { changed, added, removed };
}

export async function ensureTemplateLoaded(options = {}) {
  await loadH2kTemplateText(options);
}
