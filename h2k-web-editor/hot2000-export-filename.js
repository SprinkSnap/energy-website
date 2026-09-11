(function initHot2000ExportFilename(global) {
  const INVALID = /[<>:"/\\|?*]/g;

  const DEFAULT_EXPORT_NAME = "web-model.h2k";
  const NEW_MODEL_EXPORT_NAME = "new-web-model.h2k";

  function basenameOnly(raw) {
    let name = String(raw ?? "").replace(/\\/g, "/");
    const slash = name.lastIndexOf("/");
    if (slash >= 0) name = name.slice(slash + 1);
    const colon = name.indexOf(":");
    if (colon >= 0 && colon < 4) {
      name = name.slice(colon + 1).replace(/^[/\\]+/, "");
    }
    return name;
  }

  /**
   * Restore a previously saved Review Export filename with no transformation.
   * Refresh/session hydration must be idempotent and must never append "-web".
   */
  function restoreExportFilename(savedName, fallback = DEFAULT_EXPORT_NAME) {
    if (savedName == null) return fallback;
    const value = String(savedName);
    return value === "" ? fallback : value;
  }

  /**
   * Initialize Export filename from an import or a one-time default.
   * Never appends "-web". Converting .xml → .h2k is a one-time extension swap.
   */
  function initializeExportFilename(sourceName, fallback = DEFAULT_EXPORT_NAME) {
    const raw = String(sourceName ?? "").trim();
    if (!raw) return fallback;
    if (/\.xml$/i.test(raw)) return raw.replace(/\.xml$/i, ".h2k");
    return raw;
  }

  function inputH2kFilenameFromExportName(exportName, fallback = "input.h2k") {
    const raw = String(exportName ?? "").trim();
    if (!raw) return fallback;
    let stem = basenameOnly(raw).replace(INVALID, "-").replace(/\.+$/, "").trim();
    if (!stem) return fallback;
    const lower = stem.toLowerCase();
    for (const ext of [".h2k", ".xml", ".pdf"]) {
      if (lower.endsWith(ext)) {
        stem = stem.slice(0, -ext.length);
        break;
      }
    }
    stem = stem.replace(INVALID, "-").replace(/\.+$/, "").trim();
    if (!stem) return fallback;
    return `${stem}.h2k`;
  }

  function reportPdfFilenameFromExportName(exportName, jobId) {
    let raw = String(exportName ?? "").trim();
    if (raw) {
      raw = basenameOnly(raw);
      const lower = raw.toLowerCase();
      for (const ext of [".h2k", ".xml", ".pdf"]) {
        if (lower.endsWith(ext)) {
          raw = raw.slice(0, -ext.length);
          break;
        }
      }
      let cleaned = raw.replace(INVALID, "-").replace(/\.+$/, "").trim();
      if (cleaned) {
        return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
      }
    }
    const safeJob =
      String(jobId || "job")
        .replace(INVALID, "-")
        .replace(/\.+$/, "")
        .trim() || "job";
    return `HOT2000-Full-House-Report-${safeJob}.pdf`;
  }

  global.Hot2000ExportFilename = {
    DEFAULT_EXPORT_NAME,
    NEW_MODEL_EXPORT_NAME,
    restoreExportFilename,
    initializeExportFilename,
    inputH2kFilenameFromExportName,
    reportPdfFilenameFromExportName,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
