import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const filenameJs = readFileSync(join(root, "hot2000-export-filename.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const re = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`,
    "m",
  );
  const start = source.search(re);
  assert(start >= 0, `${name} not found`);
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Could not parse ${name}`);
}

eval(filenameJs);
const {
  restoreExportFilename,
  initializeExportFilename,
  inputH2kFilenameFromExportName,
  reportPdfFilenameFromExportName,
  DEFAULT_EXPORT_NAME,
} = globalThis.Hot2000ExportFilename;

function applyLoadDocName(name, { preserveExportName = false } = {}) {
  const filenameApi = globalThis.Hot2000ExportFilename;
  const fallback = "web-model.h2k";
  return preserveExportName
    ? (filenameApi?.restoreExportFilename?.(name, fallback) ?? (name || fallback))
    : (filenameApi?.initializeExportFilename?.(name, fallback) ?? (name || fallback));
}

function simulateBrowserRefresh(savedName) {
  return applyLoadDocName(savedName, { preserveExportName: true });
}

function refreshN(name, n) {
  let current = name;
  for (let i = 0; i < n; i += 1) {
    current = simulateBrowserRefresh(current);
  }
  return current;
}

function roundTripSessionName(name) {
  const saved = { exportName: name };
  return restoreExportFilename(saved.exportName);
}

// A. My-House.h2k refresh 10 times stays My-House.h2k
assert(refreshN("My-House.h2k", 10) === "My-House.h2k", "A: My-House.h2k survives 10 refreshes");
assert(refreshN("My-House.h2k", 1) === "My-House.h2k", "A: My-House.h2k survives 1 refresh");

// B. House-web.h2k refresh 10 times stays House-web.h2k (do not strip or re-append)
assert(refreshN("House-web.h2k", 10) === "House-web.h2k", "B: House-web.h2k survives 10 refreshes");
assert(
  refreshN("House-web-web-web.h2k", 10) === "House-web-web-web.h2k",
  "B: already-suffixed historical names are left unchanged",
);

// C. User-entered filename is restored exactly
assert(
  restoreExportFilename("123 Main Street.h2k") === "123 Main Street.h2k",
  "C: user-typed 123 Main Street.h2k is restored exactly",
);
assert(
  refreshN("123 Main Street.h2k", 10) === "123 Main Street.h2k",
  "C: user-typed name survives 10 refreshes",
);

// D. Imported Sample.h2k stays Sample.h2k through initialize + refresh
assert(applyLoadDocName("Sample.h2k") === "Sample.h2k", "D: loadDoc import Sample.h2k stays Sample.h2k");
assert(initializeExportFilename("Sample.h2k") === "Sample.h2k", "D: import Sample.h2k stays Sample.h2k");
assert(
  refreshN(initializeExportFilename("Sample.h2k"), 10) === "Sample.h2k",
  "D: imported Sample.h2k survives 10 refreshes",
);
assert(
  initializeExportFilename("My-House.h2k") === "My-House.h2k",
  "D: import My-House.h2k does not become My-House-web.h2k",
);

// E. New model / template default is stable
assert(DEFAULT_EXPORT_NAME === "web-model.h2k", "E: default export name is web-model.h2k");
assert(
  initializeExportFilename("web-model.h2k") === "web-model.h2k",
  "E: default web-model.h2k is not rewritten",
);
assert(refreshN("web-model.h2k", 10) === "web-model.h2k", "E: web-model.h2k survives 10 refreshes");
assert(
  refreshN("new-web-model.h2k", 10) === "new-web-model.h2k",
  "E: new-web-model.h2k survives 10 refreshes",
);

// F. Session restore is byte-for-byte / string-for-string and idempotent
for (const name of [
  "My-House.h2k",
  "House-web.h2k",
  "123 Main Street.h2k",
  "Sample.h2k",
  "web-model.h2k",
  "House-web-web-web.h2k",
  "  leading-space.h2k",
]) {
  assert(roundTripSessionName(name) === name, `F: session restore preserves ${JSON.stringify(name)}`);
  assert(
    restoreExportFilename(restoreExportFilename(name)) === restoreExportFilename(name),
    `F: restore(restore(${JSON.stringify(name)})) === restore(name)`,
  );
}
assert(restoreExportFilename(null) === "web-model.h2k", "F: missing saved name uses default once");
assert(restoreExportFilename("") === "web-model.h2k", "F: empty saved name uses default once");

// G. Full House Report and Export consume the unchanged #exportName value
assert(
  inputH2kFilenameFromExportName("My-House.h2k") === "My-House.h2k",
  "G: job input filename stays My-House.h2k",
);
assert(
  reportPdfFilenameFromExportName("My-House.h2k", "job-1") === "My-House.pdf",
  "G: PDF filename stays My-House.pdf",
);

const printSocFullHouseReportPdf = extractFunction(appJs, "printSocFullHouseReportPdf");
const exportH2K = extractFunction(appJs, "exportH2K");
assert(
  printSocFullHouseReportPdf.includes('$("#exportName")'),
  "G: Full House Report reads #exportName",
);
assert(
  !/\+\s*["']-web/.test(printSocFullHouseReportPdf),
  "G: Full House Report must not append -web to the export name",
);
assert(
  !/\+\s*["']-web/.test(exportH2K),
  "G: Export button must not append -web when preparing the filename",
);

// H. No startup/session-restore code contains automatic "-web" suffixing
const restoreSession = extractFunction(appJs, "restoreSession");
const bootEditor = extractFunction(appJs, "bootEditor");
const resetTemplate = extractFunction(appJs, "resetTemplate");
const startup = [restoreSession, bootEditor, resetTemplate, appJs].join("\n");

assert(restoreSession.includes("preserveExportName:true"), "H: restoreSession preserves the saved name");
assert(appJs.includes("preserveExportName"), "H: loadDoc can restore without rewriting");
assert(appJs.includes("restoreExportFilename"), "H: loadDoc uses restoreExportFilename on session restore");
assert(appJs.includes("initializeExportFilename"), "H: loadDoc initializes import/default names without -web");
assert(
  !/\+\s*["']-web/.test(startup),
  "H: startup/session-restore must not concatenate a -web suffix",
);
assert(
  !/replace\([^)]*\)\s*\+\s*["']-web\.h2k["']/.test(appJs),
  "H: app.js must not rewrite stems to stem-web.h2k",
);
assert(
  !/["']-web\.h2k["']/.test(filenameJs),
  "H: hot2000-export-filename.js must not auto-suffix -web.h2k",
);
assert(
  !/replace\([^)]*\)\s*\+\s*["']-web/.test(filenameJs),
  "H: filename helpers must not append -web",
);
assert(
  appJs.includes('$("#exportName")?.addEventListener("input"'),
  "H: typed Export filename is persisted on input so refresh restores it",
);

assert(
  indexHtml.includes("app.js?v=2026.09.11.3"),
  "index.html must cache-bust app.js after the refresh-filename fix",
);
assert(
  indexHtml.includes("hot2000-export-filename.js?v=2026.09.11.3"),
  "index.html must cache-bust hot2000-export-filename.js after the refresh-filename fix",
);
assert(
  /const APP_VERSION = "2026\.09\.11\.3"/.test(appJs),
  "app.js APP_VERSION must match the cache-busting query string",
);

console.log("export-name-session.test.mjs: all assertions passed");
