/**
 * Template-based HOT2000 H2K serializer.
 * Always starts from template.h2k, patches editor-controlled subtrees, validates, serializes.
 */
(function initH2kSerializer(global) {
  const EDITOR_SUBTREE_XPATHS = [
    "/HouseFile/ProgramInformation",
    "/HouseFile/House",
    "/HouseFile/Codes",
    "/HouseFile/FuelCosts",
  ];

  const TEMPLATE_PRESERVED_XPATHS = [
    "/HouseFile/Version",
    "/HouseFile/Application",
  ];

  function parseTemplate(text, DOMParserImpl) {
    const Parser = DOMParserImpl || global.DOMParser;
    const doc = new Parser().parseFromString(text, "application/xml");
    const err = doc.getElementsByTagName?.("parsererror")?.[0]
      || (doc.querySelector ? doc.querySelector("parsererror") : null);
    if (err) throw new Error("Invalid template XML: " + (err.textContent || "").slice(0, 180));
    return doc;
  }

  function getXPath() {
    if (global.xpathSelect) return global.xpathSelect;
    return null;
  }

  function xp(doc, path, ctx) {
    const root = ctx || doc;
    if (typeof root.evaluate === "function") {
      return root.evaluate(path, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }
    const select = getXPath();
    if (select) return select(path, doc, true);
    throw new Error("XPath is not available in this environment");
  }

  function elementChildren(parent) {
    const out = [];
    for (let i = 0; i < parent.childNodes.length; i += 1) {
      if (parent.childNodes[i].nodeType === 1) out.push(parent.childNodes[i]);
    }
    return out;
  }

  function replaceChildByTag(parent, tagName, newChild) {
    const existing = elementChildren(parent).find((c) => c.tagName === tagName);
    if (existing) parent.replaceChild(newChild, existing);
    else parent.appendChild(newChild);
  }

  function importSubtree(targetDoc, sourceDoc, xpath) {
    const sourceNode = xp(sourceDoc, xpath);
    if (!sourceNode) return false;
    const parentPath = xpath.replace(/\/[^/]+$/, "");
    const tagName = xpath.split("/").pop();
    const parent = parentPath ? xp(targetDoc, parentPath) : targetDoc.documentElement;
    if (!parent) return false;
    const imported = targetDoc.importNode(sourceNode, true);
    replaceChildByTag(parent, tagName, imported);
    return true;
  }

  function directChild(parent, tag) {
    if (!parent) return null;
    for (let i = 0; i < parent.childNodes.length; i += 1) {
      const ch = parent.childNodes[i];
      if (ch.nodeType === 1 && ch.tagName === tag) return ch;
    }
    return null;
  }

  /**
   * Merge Program node: editor controls Options/Main; preserve calculated Results subtrees.
   */
  function patchProgram(targetDoc, editorDoc) {
    const editorProg = xp(editorDoc, "/HouseFile/Program");
    if (!editorProg) {
      const old = xp(targetDoc, "/HouseFile/Program");
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return;
    }
    const templateProg = xp(targetDoc, "/HouseFile/Program");
    const merged = targetDoc.importNode(editorProg, true);

    if (templateProg) {
      const templateResults = directChild(templateProg, "Results");
      const mergedResults = directChild(merged, "Results");
      if (templateResults && mergedResults) {
        ["Tsv", "RefHse"].forEach((tag) => {
          const editorResults = directChild(editorProg, "Results");
          const editorChild = directChild(editorResults, tag);
          const templateChild = directChild(templateResults, tag);
          const source = editorChild || templateChild;
          if (!source) return;
          const existing = directChild(mergedResults, tag);
          const imported = targetDoc.importNode(source, true);
          if (existing) mergedResults.replaceChild(imported, existing);
          else mergedResults.appendChild(imported);
        });
      }
    }

    const houseFile = targetDoc.documentElement;
    const allResults = xp(targetDoc, "/HouseFile/AllResults");
    const old = xp(targetDoc, "/HouseFile/Program");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (allResults && allResults.nextSibling) {
      houseFile.insertBefore(merged, allResults.nextSibling);
    } else if (allResults) {
      houseFile.appendChild(merged);
    } else {
      houseFile.appendChild(merged);
    }
  }

  function patchAllResults(targetDoc, editorDoc) {
    const editorResults = xp(editorDoc, "/HouseFile/AllResults");
    if (!editorResults) return;
    importSubtree(targetDoc, editorDoc, "/HouseFile/AllResults");
  }

  function applyHot2000ExportAttrs(doc) {
    const fc = doc.getElementsByTagName("FuelCosts")[0];
    if (fc) fc.removeAttribute("ratePeriod");
    const bl = doc.getElementsByTagName("BaseLoads")[0];
    if (bl) bl.removeAttribute("userSpecifiedUsage");
    const tags = ["ClothesWasher", "DishWasher", "ClothesDryer"];
    tags.forEach((tag) => {
      const nodes = doc.getElementsByTagName(tag);
      for (let i = 0; i < nodes.length; i += 1) nodes[i].removeAttribute("installed");
    });
  }

  function serializeH2k(doc, XMLSerializerImpl) {
    const Serializer = XMLSerializerImpl || global.XMLSerializer;
    return `<?xml version="1.0" encoding="UTF-8"?>\n`
      + new Serializer().serializeToString(doc.documentElement);
  }

  /**
   * Build export XML from fresh template + live editor document.
   * @param {Document} editorDoc - live in-memory editor xmlDoc
   * @param {string} templateXml - raw template.h2k text
   * @param {object} [options]
   * @param {boolean} [options.forHot2000=true]
   * @param {boolean} [options.validate=true]
   * @param {Function} [options.onDevWarning]
   */
  function buildH2kFromTemplate(editorDoc, templateXml, options = {}) {
    const {
      forHot2000 = true,
      validate = true,
      onDevWarning = (msg) => { if (global.console) console.warn("[H2K]", msg); },
      DOMParserImpl,
      XMLSerializerImpl,
    } = options;

    const doc = parseTemplate(templateXml, DOMParserImpl);

    EDITOR_SUBTREE_XPATHS.forEach((xpath) => {
      if (!importSubtree(doc, editorDoc, xpath)) {
        onDevWarning(`Editor subtree missing at ${xpath}; template value preserved.`);
      }
    });

    patchProgram(doc, editorDoc);
    patchAllResults(doc, editorDoc);

    const uiUnits = editorDoc.documentElement?.getAttribute("uiUnits");
    if (uiUnits) doc.documentElement.setAttribute("uiUnits", uiUnits);
    const lang = editorDoc.documentElement?.getAttribute("xml:lang");
    if (lang) doc.documentElement.setAttribute("xml:lang", lang);

    if (forHot2000) applyHot2000ExportAttrs(doc);

    if (validate && global.H2kValidator) {
      const result = global.H2kValidator.validateH2kDocument(doc, {
        requireProgram: !!xp(editorDoc, "/HouseFile/Program"),
      });
      if (!result.ok) {
        const msg = global.H2kValidator.formatValidationErrors(result.errors).join("; ");
        throw new Error("H2K validation failed: " + msg);
      }
      const xml = serializeH2k(doc, XMLSerializerImpl);
      const roundTrip = global.H2kValidator.validateSerializedH2k(xml, (t) => parseTemplate(t, DOMParserImpl));
      if (!roundTrip.ok) {
        const msg = global.H2kValidator.formatValidationErrors(roundTrip.errors).join("; ");
        throw new Error("H2K serialization validation failed: " + msg);
      }
      return xml;
    }

    return serializeH2k(doc, XMLSerializerImpl);
  }

  async function loadTemplateH2k(fetchTemplate) {
    if (typeof fetchTemplate === "function") return fetchTemplate();
    if (typeof fetch === "function") {
      const res = await fetch("template.h2k");
      if (!res.ok) throw new Error("Could not load template.h2k");
      return res.text();
    }
    throw new Error("No template loader available");
  }

  /**
   * Canonical serializer entry — used by Export, Generate Net GJ/a, and tests.
   */
  function serialize(editorDoc, templateXml, options) {
    return buildH2kFromTemplate(editorDoc, templateXml, options);
  }

  /** Development helper: write generated XML for manual diff against template.h2k */
  function debugWriteGenerated(xml, filename = "generated-input.h2k") {
    if (typeof global.document === "undefined") return null;
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = global.document.createElement("a");
    a.href = url;
    a.download = filename;
    global.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }

  global.H2KSerializer = {
    EDITOR_SUBTREE_XPATHS,
    TEMPLATE_PRESERVED_XPATHS,
    parseTemplate,
    buildH2kFromTemplate,
    serialize,
    serializeH2k,
    loadTemplateH2k,
    applyHot2000ExportAttrs,
    importSubtree,
    patchProgram,
    patchAllResults,
    debugWriteGenerated,
  };
})(typeof window !== "undefined" ? window : globalThis);
