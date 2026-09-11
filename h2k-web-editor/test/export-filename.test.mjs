import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browserSource = readFileSync(join(root, "hot2000-export-filename.js"), "utf8");
eval(browserSource);
const {
  inputH2kFilenameFromExportName,
  reportPdfFilenameFromExportName,
} = globalThis.Hot2000ExportFilename;

assert(
  reportPdfFilenameFromExportName("Smith-House.h2k", "job-1") === "Smith-House.pdf",
  "Smith-House.h2k -> Smith-House.pdf",
);
assert(
  reportPdfFilenameFromExportName("House.H2K", "job-1") === "House.pdf",
  "House.H2K -> House.pdf",
);
assert(
  reportPdfFilenameFromExportName("House.pdf", "job-1") === "House.pdf",
  "House.pdf stays House.pdf",
);
assert(
  reportPdfFilenameFromExportName("C:\\\\temp\\\\House.h2k", "job-1") === "House.pdf",
  "path-containing input reduced to basename",
);
assert(
  reportPdfFilenameFromExportName("123 Main Street.H2K", "job-1") === "123 Main Street.pdf",
  "spaces preserved in stem",
);
assert(
  reportPdfFilenameFromExportName("", "abc123") === "HOT2000-Full-House-Report-abc123.pdf",
  "blank export uses job-id fallback",
);
assert(
  reportPdfFilenameFromExportName("bad/name.h2k", "job-1") === "name.pdf",
  "path-containing input reduced to basename",
);
assert(
  inputH2kFilenameFromExportName("My-House.h2k") === "My-House.h2k",
  "input filename keeps My-House.h2k",
);
assert(
  inputH2kFilenameFromExportName("123 Main Street.H2K") === "123 Main Street.h2k",
  "input filename preserves spaces in stem",
);

const { restoreExportFilename, initializeExportFilename } = globalThis.Hot2000ExportFilename;
assert(restoreExportFilename("My-House.h2k") === "My-House.h2k", "restore keeps My-House.h2k");
assert(initializeExportFilename("My-House.h2k") === "My-House.h2k", "import keeps My-House.h2k");
assert(initializeExportFilename("House-web.h2k") === "House-web.h2k", "import does not re-suffix -web");

console.log("export-filename.test.mjs: all assertions passed");
