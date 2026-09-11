const WINDOWS_INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

/** Normalize Review Export filename to a bare Windows-safe PDF filename. */
export function reportPdfFilenameFromExportName(
  exportName: string | null | undefined,
  jobId: string,
): string {
  let raw = String(exportName ?? "").trim();
  if (raw) {
    raw = raw.replace(/\\/g, "/");
    const slash = raw.lastIndexOf("/");
    if (slash >= 0) {
      raw = raw.slice(slash + 1);
    }
    const lower = raw.toLowerCase();
    for (const ext of [".h2k", ".xml", ".pdf"]) {
      if (lower.endsWith(ext)) {
        raw = raw.slice(0, -ext.length);
        break;
      }
    }
    let cleaned = raw.replace(WINDOWS_INVALID_FILENAME_CHARS, "-").replace(/\.+$/, "").trim();
    if (cleaned) {
      return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
    }
  }
  const safeJob = String(jobId || "job")
    .replace(WINDOWS_INVALID_FILENAME_CHARS, "-")
    .replace(/\.+$/, "")
    .trim() || "job";
  return `HOT2000-Full-House-Report-${safeJob}.pdf`;
}
