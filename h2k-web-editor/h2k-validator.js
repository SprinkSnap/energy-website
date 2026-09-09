/**
 * HOT2000 H2K document validator — runs before export and worker submission.
 */
(function initH2kValidator(global) {
  class H2kValidationError extends Error {
    constructor(message, xpath = "", property = "") {
      super(message);
      this.name = "H2kValidationError";
      this.xpath = xpath;
      this.property = property;
    }
  }

  function xp(doc, path) {
    if (typeof doc.evaluate === "function") {
      return doc.evaluate(path, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }
    if (global.xpathSelect) return global.xpathSelect(path, doc, true);
    throw new Error("XPath is not available in this environment");
  }

  function xpa(doc, path) {
    if (typeof doc.evaluate === "function") {
      const r = doc.evaluate(path, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const a = [];
      for (let i = 0; i < r.snapshotLength; i += 1) a.push(r.snapshotItem(i));
      return a;
    }
    if (global.xpathSelectAll) return global.xpathSelectAll(path, doc);
    throw new Error("XPath is not available in this environment");
  }

  function assertFiniteAttr(node, attr, xpath, errors) {
    if (!node || !node.hasAttribute(attr)) return;
    const raw = node.getAttribute(attr);
    if (raw === "" || raw == null) return;
    const bad = ["NaN", "Infinity", "-Infinity", "undefined", "[object Object]", "null"];
    if (bad.includes(raw)) {
      errors.push(new H2kValidationError(`Invalid attribute @${attr}="${raw}"`, xpath, attr));
      return;
    }
    // HOT2000 @value is often a string label or code — only reject obvious JS garbage.
    if (attr === "value" && /[A-Za-z{]/.test(raw)) return;
    const n = Number(raw);
    if (raw !== "" && !Number.isNaN(n) && !Number.isFinite(n)) {
      errors.push(new H2kValidationError(`Non-finite numeric attribute @${attr}="${raw}"`, xpath, attr));
    }
  }

  function validateIdsAndReferences(doc, errors) {
    const ids = xpa(doc, "/HouseFile/House/Components//*[@id]").map((n) => n.getAttribute("id"));
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) {
      errors.push(new H2kValidationError(
        `Duplicate component IDs: ${[...new Set(dup)].join(", ")}`,
        "//*[@id]",
        "id",
      ));
    }
    ids.forEach((id) => {
      if (!String(id || "").trim()) {
        errors.push(new H2kValidationError("Empty required id attribute", "//*[@id]", "id"));
      }
    });
    xpa(doc, "//*[@idref]").forEach((n) => {
      const ref = n.getAttribute("idref");
      if (!xp(doc, `//*[@id='${ref}']`)) {
        errors.push(new H2kValidationError(
          `Dangling idref="${ref}" on <${n.tagName}>`,
          `//${n.tagName}[@idref='${ref}']`,
          "idref",
        ));
      }
    });
  }

  function validateRequiredStructure(doc, errors) {
    const required = [
      "/HouseFile",
      "/HouseFile/Version",
      "/HouseFile/Application",
      "/HouseFile/ProgramInformation",
      "/HouseFile/House",
      "/HouseFile/House/Specifications",
      "/HouseFile/House/Components",
    ];
    required.forEach((path) => {
      if (!xp(doc, path)) {
        errors.push(new H2kValidationError(`Missing required element ${path}`, path));
      }
    });
    const root = doc.documentElement;
    if (!root || root.tagName !== "HouseFile") {
      errors.push(new H2kValidationError("Root element must be HouseFile", "/"));
    }
    if (doc.getElementsByTagName("HouseFile").length !== 1) {
      errors.push(new H2kValidationError("Exactly one HouseFile root is required", "/"));
    }
  }

  function validateH2kDocument(doc, { requireProgram = false } = {}) {
    const errors = [];
    if (!doc) {
      errors.push(new H2kValidationError("Document is null"));
      return { ok: false, errors };
    }
    const parserError = doc.getElementsByTagName?.("parsererror")?.[0]
      || (doc.querySelector ? doc.querySelector("parsererror") : null);
    if (parserError) {
      errors.push(new H2kValidationError(
        "XML parse error: " + parserError.textContent.slice(0, 200),
        "/",
      ));
      return { ok: false, errors };
    }

    validateRequiredStructure(doc, errors);
    validateIdsAndReferences(doc, errors);

    if (requireProgram && !xp(doc, "/HouseFile/Program")) {
      errors.push(new H2kValidationError("Missing /HouseFile/Program", "/HouseFile/Program"));
    }

    xpa(doc, "//*[@value]").forEach((n) => {
      const tag = n.tagName || "";
      if (tag === "Code" || n.parentNode?.tagName === "Tsv") return;
      assertFiniteAttr(n, "value", `//${tag}[@value]`, errors);
    });

    xpa(doc, "//@airChangeRate").forEach(() => {});
    xpa(doc, "//*[@airChangeRate]").forEach((n) => {
      assertFiniteAttr(n, "airChangeRate", `//${n.tagName}[@airChangeRate]`, errors);
    });

    const xmlText = doc.documentElement?.toString?.() || doc.documentElement?.outerHTML || "";
    if (xmlText.includes("&lt;HouseFile") || xmlText.includes("&lt;?xml")) {
      errors.push(new H2kValidationError("HTML-escaped XML detected in document", "/"));
    }

    return { ok: errors.length === 0, errors };
  }

  function validateSerializedH2k(xmlString, parseXML) {
    const declCount = (xmlString.match(/<\?xml/g) || []).length;
    if (declCount !== 1) {
      return {
        ok: false,
        errors: [new H2kValidationError(`XML declaration must occur exactly once (found ${declCount})`)],
      };
    }
    const doc = parseXML(xmlString);
    const result = validateH2kDocument(doc);
    if (!result.ok) return result;
    const roundTrip = parseXML(xmlString);
    const rtErr = roundTrip.getElementsByTagName?.("parsererror")?.[0]
      || (roundTrip.querySelector ? roundTrip.querySelector("parsererror") : null);
    if (rtErr) {
      result.errors.push(new H2kValidationError("Serialized output cannot be parsed again"));
      result.ok = false;
    }
    return result;
  }

  function formatValidationErrors(errors) {
    return errors.map((e) => {
      const parts = [e.message];
      if (e.xpath) parts.push(`XPath: ${e.xpath}`);
      if (e.property) parts.push(`Property: ${e.property}`);
      return parts.join(" — ");
    });
  }

  global.H2kValidator = {
    H2kValidationError,
    validateH2kDocument,
    validateIdsAndReferences,
    validateSerializedH2k,
    formatValidationErrors,
  };
})(typeof window !== "undefined" ? window : globalThis);
