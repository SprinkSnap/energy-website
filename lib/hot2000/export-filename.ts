const WINDOWS_INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

function basenameOnly(raw: string): string {
  let name = raw.replace(/\\/g, "/");
  const slash = name.lastIndexOf("/");
  if (slash >= 0) {
    name = name.slice(slash + 1);
  }
  const colon = name.indexOf(":");
  if (colon >= 0 && colon < 4) {
    name = name.slice(colon + 1).replace(/^[/\\]+/, "");
  }
  return name;
}

/** Normalize Review Export filename to a Windows-safe H2K input basename. */
export function inputH2kFilenameFromExportName(
  exportName: string | null | undefined,
  fallback = "input.h2k",
): string {
  const raw = String(exportName ?? "").trim();
  if (!raw) return fallback;
  let stem = basenameOnly(raw);
  stem = stem.replace(WINDOWS_INVALID_FILENAME_CHARS, "-").replace(/\.+$/, "").trim();
  if (!stem) return fallback;
  const lower = stem.toLowerCase();
  for (const ext of [".h2k", ".xml", ".pdf"]) {
    if (lower.endsWith(ext)) {
      stem = stem.slice(0, -ext.length);
      break;
    }
  }
  stem = stem.replace(WINDOWS_INVALID_FILENAME_CHARS, "-").replace(/\.+$/, "").trim();
  if (!stem) return fallback;
  return `${stem}.h2k`;
}

/** Normalize Review Export filename to a bare Windows-safe PDF filename. */
export function reportPdfFilenameFromExportName(
  exportName: string | null | undefined,
  jobId: string,
): string {
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
