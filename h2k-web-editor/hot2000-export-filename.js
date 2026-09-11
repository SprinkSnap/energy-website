(function initHot2000ExportFilename(global) {
  const INVALID = /[<>:"/\\|?*]/g;

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
    inputH2kFilenameFromExportName,
    reportPdfFilenameFromExportName,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
