import { createHash } from "node:crypto";

const XML_NS = "http://www.w3.org/XML/1998/namespace";

function elementChildren(parent) {
  if (!parent) return [];
  return [...parent.childNodes].filter((n) => n.nodeType === 1);
}

function textChildren(parent) {
  if (!parent) return [];
  return [...parent.childNodes].filter((n) => n.nodeType === 3);
}

function normalizeText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function elementKey(node) {
  const id = node.getAttribute?.("id");
  if (id) return `${node.tagName}[@id='${id}']`;
  const parent = node.parentNode;
  if (!parent || parent.nodeType !== 1) return node.tagName;
  const sameTag = elementChildren(parent).filter((n) => n.tagName === node.tagName);
  const index = sameTag.indexOf(node) + 1;
  return `${node.tagName}[${index}]`;
}

export function elementPath(node, stopAt = "HouseFile") {
  const parts = [];
  let cur = node;
  while (cur && cur.nodeType === 1) {
    parts.unshift(elementKey(cur));
    if (cur.tagName === stopAt) break;
    cur = cur.parentNode;
  }
  return "/" + parts.join("/");
}

function walkElements(node, map, prefix = "") {
  if (!node || node.nodeType !== 1) return;
  const path = prefix || elementPath(node);
  map.set(path, node);
  for (const child of elementChildren(node)) {
    walkElements(child, map, elementPath(child));
  }
}

function collectAttributes(node) {
  const attrs = {};
  if (!node?.attributes) return attrs;
  for (let i = 0; i < node.attributes.length; i += 1) {
    const attr = node.attributes[i];
    const key = attr.namespaceURI === XML_NS ? `xml:${attr.localName}` : attr.name;
    attrs[key] = attr.value;
  }
  return attrs;
}

function directTextContent(node) {
  return normalizeText(
    textChildren(node).map((n) => n.textContent).join(""),
  );
}

function childElementSignature(parent) {
  return elementChildren(parent).map((c) => elementKey(c)).join(",");
}

function serializeSubtreeNormalized(node) {
  if (!node) return "";
  if (node.nodeType === 1) {
    const attrs = collectAttributes(node);
    const attrStr = Object.keys(attrs)
      .sort()
      .map((k) => `${k}=${attrs[k]}`)
      .join("|");
    const text = directTextContent(node);
    const kids = elementChildren(node)
      .map((c) => serializeSubtreeNormalized(c))
      .join("");
    return `<${node.tagName}${attrStr ? " " + attrStr : ""}>${text}${kids}</${node.tagName}>`;
  }
  return "";
}

export function subtreeHash(doc, xpathParts) {
  let cur = doc.documentElement;
  for (const part of xpathParts) {
    const m = part.match(/^([A-Za-z0-9]+)(?:\[(\d+)\])?$/);
    if (!m) return null;
    const tag = m[1];
    const idx = m[2] ? Number(m[2]) : 1;
    const matches = elementChildren(cur).filter((n) => n.tagName === tag);
    cur = matches[idx - 1];
    if (!cur) return null;
  }
  const normalized = serializeSubtreeNormalized(cur);
  return createHash("sha256").update(normalized).digest("hex");
}

const SUBTREE_PATHS = {
  Version: ["Version"],
  Application: ["Application"],
  ProgramInformation: ["ProgramInformation"],
  House: ["House"],
  Codes: ["Codes"],
  FuelCosts: ["FuelCosts"],
  AllResults: ["AllResults"],
  Program: ["Program"],
};

export function computeSubtreeHashes(doc) {
  const hashes = {};
  for (const [name, parts] of Object.entries(SUBTREE_PATHS)) {
    hashes[name] = subtreeHash(doc, parts);
  }
  return hashes;
}

function collectIds(doc) {
  const ids = new Map();
  const all = doc.getElementsByTagName?.("*") || [];
  for (let i = 0; i < all.length; i += 1) {
    const node = all[i];
    const id = node.getAttribute?.("id");
    if (!id) continue;
    const path = elementPath(node);
    if (!ids.has(id)) ids.set(id, []);
    ids.get(id).push(path);
  }
  return ids;
}

function collectReferences(doc) {
  const refs = [];
  const all = doc.getElementsByTagName?.("*") || [];
  for (let i = 0; i < all.length; i += 1) {
    const node = all[i];
    for (let j = 0; j < node.attributes.length; j += 1) {
      const attr = node.attributes[j];
      if (attr.name === "idref" || attr.name === "idRef" || attr.name.endsWith("Ref")) {
        refs.push({
          path: elementPath(node),
          attribute: attr.name,
          value: attr.value,
        });
      }
    }
  }
  return refs;
}

export function analyzeIdsAndReferences(originalDoc, generatedDoc) {
  const origIds = collectIds(originalDoc);
  const genIds = collectIds(generatedDoc);
  const duplicateIds = [];
  const changedIds = [];
  const missingIds = [];
  const addedIds = [];

  for (const [id, paths] of genIds.entries()) {
    if (paths.length > 1) {
      duplicateIds.push({ id, paths });
    }
  }
  for (const [id, paths] of origIds.entries()) {
    if (!genIds.has(id)) {
      missingIds.push({ id, originalPaths: paths });
    } else if (paths.join("|") !== genIds.get(id).join("|")) {
      changedIds.push({
        id,
        before: paths,
        after: genIds.get(id),
      });
    }
  }
  for (const [id, paths] of genIds.entries()) {
    if (!origIds.has(id)) addedIds.push({ id, paths });
  }

  const origRefs = collectReferences(originalDoc);
  const genRefs = collectReferences(generatedDoc);
  const referenceChanges = [];
  const brokenReferences = [];

  const origIdSet = new Set(origIds.keys());
  const genIdSet = new Set(genIds.keys());

  for (const ref of genRefs) {
    const orig = origRefs.find(
      (r) => r.path === ref.path && r.attribute === ref.attribute,
    );
    if (!orig) {
      referenceChanges.push({
        path: ref.path,
        attribute: ref.attribute,
        before: null,
        after: ref.value,
      });
    } else if (orig.value !== ref.value) {
      referenceChanges.push({
        path: ref.path,
        attribute: ref.attribute,
        before: orig.value,
        after: ref.value,
      });
    }
    if (ref.attribute === "idref" && !genIdSet.has(ref.value)) {
      brokenReferences.push({
        path: ref.path,
        attribute: ref.attribute,
        target: ref.value,
        reason: "target id missing in generated document",
      });
    }
  }

  for (const ref of origRefs) {
    if (ref.attribute === "idref" && origIdSet.has(ref.value) && !genIdSet.has(ref.value)) {
      brokenReferences.push({
        path: ref.path,
        attribute: ref.attribute,
        target: ref.value,
        reason: "target id existed in original but missing in generated",
      });
    }
  }

  return {
    duplicateIds,
    missingIds,
    addedIds,
    changedIds,
    referenceChanges,
    brokenReferences,
  };
}

function declarationInfo(text) {
  const decl = String(text).match(/^<\?xml[^?]*\?>/);
  const hasBom = text.charCodeAt(0) === 0xfeff;
  return {
    declaration: decl ? decl[0] : null,
    hasBom,
    encoding: decl?.[0]?.match(/encoding=["']([^"']+)["']/i)?.[1] ?? null,
    startsWithXmlDecl: decl != null,
  };
}

function namespaceReport(doc) {
  const root = doc.documentElement;
  if (!root) return [];
  const changes = [];
  const xmlns = root.getAttribute("xmlns");
  const lang = root.getAttributeNS?.(XML_NS, "lang") ?? root.getAttribute("xml:lang");
  changes.push({
    path: "/HouseFile",
    xmlns,
    xmlLang: lang,
  });
  return changes;
}

export function compareXmlDocuments(originalDoc, generatedDoc, options = {}) {
  const originalMap = new Map();
  const generatedMap = new Map();
  walkElements(originalDoc.documentElement, originalMap);
  walkElements(generatedDoc.documentElement, generatedMap);

  const attributesChanged = [];
  const textChanged = [];
  const nodesAdded = [];
  const nodesRemoved = [];
  const nodesMovedOrReordered = [];
  const namespaceChanges = [];
  const idChanges = [];
  const referenceChanges = [];

  for (const [path, origNode] of originalMap.entries()) {
    const genNode = generatedMap.get(path);
    if (!genNode) {
      nodesRemoved.push({
        path,
        summary: summarizeElement(origNode),
      });
      continue;
    }

    const origAttrs = collectAttributes(origNode);
    const genAttrs = collectAttributes(genNode);
    for (const key of new Set([...Object.keys(origAttrs), ...Object.keys(genAttrs)])) {
      if (origAttrs[key] !== genAttrs[key]) {
        const entry = {
          path,
          attribute: key,
          before: origAttrs[key] ?? null,
          after: genAttrs[key] ?? null,
        };
        attributesChanged.push(entry);
        if (key === "id") idChanges.push(entry);
        if (key === "idref" || key.endsWith("Ref")) referenceChanges.push(entry);
      }
    }

    const origText = directTextContent(origNode);
    const genText = directTextContent(genNode);
    if (origText !== genText) {
      textChanged.push({
        path,
        before: origText,
        after: genText,
      });
    }

    if (childElementSignature(origNode) !== childElementSignature(genNode)) {
      nodesMovedOrReordered.push({
        path,
        before: childElementSignature(origNode),
        after: childElementSignature(genNode),
      });
    }
  }

  for (const path of generatedMap.keys()) {
    if (!originalMap.has(path)) {
      nodesAdded.push({
        path,
        summary: summarizeElement(generatedMap.get(path)),
      });
    }
  }

  const idAnalysis = analyzeIdsAndReferences(originalDoc, generatedDoc);

  return {
    attributesChanged,
    textChanged,
    nodesAdded,
    nodesRemoved,
    nodesMovedOrReordered,
    namespaceChanges,
    idChanges: [...idChanges, ...idAnalysis.changedIds.map((c) => ({
      path: c.id,
      attribute: "id",
      before: c.before.join("; "),
      after: c.after.join("; "),
    }))],
    referenceChanges: [...referenceChanges, ...idAnalysis.referenceChanges],
    duplicateIds: idAnalysis.duplicateIds,
    missingIds: idAnalysis.missingIds,
    brokenReferences: idAnalysis.brokenReferences,
  };
}

function summarizeElement(node) {
  const attrs = collectAttributes(node);
  const attrPart = Object.entries(attrs)
    .map(([k, v]) => `@${k}=${JSON.stringify(v)}`)
    .join(" ");
  const text = directTextContent(node);
  return `<${node.tagName}${attrPart ? " " + attrPart : ""}>${text}`;
}

export function rawTextDiff(originalText, generatedText) {
  const origLines = String(originalText).replace(/\r\n/g, "\n").split("\n");
  const genLines = String(generatedText).replace(/\r\n/g, "\n").split("\n");
  const max = Math.max(origLines.length, genLines.length);
  const changedLines = [];
  for (let i = 0; i < max; i += 1) {
    const before = origLines[i] ?? null;
    const after = genLines[i] ?? null;
    if (before !== after) {
      changedLines.push({
        line: i + 1,
        before,
        after,
      });
    }
  }
  return {
    originalLineCount: origLines.length,
    generatedLineCount: genLines.length,
    changedLineCount: changedLines.length,
    changedLines: changedLines.slice(0, 500),
    truncated: changedLines.length > 500,
  };
}

export function compareXmlStrings(originalText, generatedText, parseFn) {
  const originalDoc = parseFn(originalText);
  const generatedDoc = parseFn(generatedText);
  const structural = compareXmlDocuments(originalDoc, generatedDoc);
  const textual = rawTextDiff(originalText, generatedText);
  const encoding = {
    original: declarationInfo(originalText),
    generated: declarationInfo(generatedText),
    rootNamespaces: {
      original: namespaceReport(originalDoc),
      generated: namespaceReport(generatedDoc),
    },
  };
  const subtreeHashes = {
    original: computeSubtreeHashes(originalDoc),
    generated: computeSubtreeHashes(generatedDoc),
    differ: Object.entries(computeSubtreeHashes(originalDoc))
      .filter(([key, hash]) => computeSubtreeHashes(generatedDoc)[key] !== hash)
      .map(([key]) => key),
  };
  return { structural, textual, encoding, subtreeHashes };
}

export function serializeDocRoot(doc, XMLSerializerImpl) {
  const serialized = new XMLSerializerImpl().serializeToString(doc.documentElement);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
}
