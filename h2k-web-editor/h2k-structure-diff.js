/**
 * Development diagnostic: compare HOT2000 XML structure between template and generated docs.
 */
(function initH2kStructureDiff(global) {
  function nodeXPath(node) {
    if (!node || node.nodeType !== 1) return "";
    const parts = [];
    let cur = node;
    while (cur && cur.nodeType === 1) {
      const tag = cur.tagName;
      const parent = cur.parentNode;
      if (!parent || parent.nodeType !== 1) {
        parts.unshift(`/${tag}`);
        break;
      }
      const siblings = [...parent.children].filter((c) => c.tagName === tag);
      const idx = siblings.indexOf(cur) + 1;
      parts.unshift(`${tag}[${idx}]`);
      cur = parent;
    }
    return "/" + parts.join("/");
  }

  function serializeNodeSignature(node) {
    if (!node || node.nodeType !== 1) return "";
    const attrs = [...node.attributes]
      .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
      .sort()
      .join(" ");
    const text = (node.childNodes.length === 1 && node.firstChild?.nodeType === 3)
      ? node.textContent.trim()
      : "";
    const childTags = [...node.children].map((c) => c.tagName).join(",");
    return `<${node.tagName}${attrs ? " " + attrs : ""}>${text ? "#" + text : ""}{${childTags}}`;
  }

  function walkTree(node, map, prefix = "") {
    if (!node || node.nodeType !== 1) return;
    const path = prefix ? `${prefix}/${node.tagName}` : `/${node.tagName}`;
    const key = path + "::" + serializeNodeSignature(node);
    map.set(key, { path, node, signature: serializeNodeSignature(node) });
    [...node.children].forEach((child, i) => {
      walkTree(child, map, `${path}[${i + 1}]`);
    });
  }

  function compareH2kStructure(templateDoc, generatedDoc) {
    const templateMap = new Map();
    const generatedMap = new Map();
    walkTree(templateDoc?.documentElement, templateMap);
    walkTree(generatedDoc?.documentElement, generatedMap);

    const changed = [];
    const added = [];
    const removed = [];

    for (const [key, tEntry] of templateMap) {
      const gEntry = generatedMap.get(key);
      if (!gEntry) {
        removed.push({ xpath: tEntry.path, reason: "missing in generated", signature: tEntry.signature });
        continue;
      }
      if (tEntry.signature !== gEntry.signature) {
        changed.push({
          xpath: tEntry.path,
          oldValue: tEntry.signature,
          newValue: gEntry.signature,
          editorProperty: null,
        });
      }
    }

    for (const [key, gEntry] of generatedMap) {
      if (!templateMap.has(key)) {
        added.push({ xpath: gEntry.path, reason: "not in template", signature: gEntry.signature });
      }
    }

    return { changed, added, removed };
  }

  function formatStructureDiffReport(diff) {
    const lines = [];
    lines.push("CHANGED:");
    diff.changed.slice(0, 50).forEach((c) => {
      lines.push(`  ${c.xpath}`);
      lines.push(`    old: ${c.oldValue}`);
      lines.push(`    new: ${c.newValue}`);
    });
    if (diff.changed.length > 50) lines.push(`  ... and ${diff.changed.length - 50} more`);
    lines.push("ADDED:");
    diff.added.slice(0, 30).forEach((a) => lines.push(`  ${a.xpath} — ${a.reason}`));
    if (diff.added.length > 30) lines.push(`  ... and ${diff.added.length - 30} more`);
    lines.push("REMOVED:");
    diff.removed.slice(0, 30).forEach((r) => lines.push(`  ${r.xpath} — ${r.reason}`));
    if (diff.removed.length > 30) lines.push(`  ... and ${diff.removed.length - 30} more`);
    return lines.join("\n");
  }

  global.H2kStructureDiff = {
    nodeXPath,
    compareH2kStructure,
    formatStructureDiffReport,
  };
})(typeof window !== "undefined" ? window : globalThis);
