(function initHot2000ExportFilename(global) {
  const INVALID = /[<>:"/\\|?*]/g;

  function reportPdfFilenameFromExportName(exportName, jobId) {
    let raw = String(exportName ?? "").trim();
    if (raw) {
      raw = raw.replace(/\\/g, "/");
      const slash = raw.lastIndexOf("/");
      if (slash >= 0) raw = raw.slice(slash + 1);
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
    reportPdfFilenameFromExportName,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
