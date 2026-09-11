import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const exportSource = readFileSync(join(root, "hot2000-export-filename.js"), "utf8");
eval(exportSource);
const { inputH2kFilenameFromExportName, reportPdfFilenameFromExportName } =
  globalThis.Hot2000ExportFilename;

assert(
  inputH2kFilenameFromExportName("My-House.h2k") === "My-House.h2k",
  "My-House.h2k stays My-House.h2k",
);
assert(
  inputH2kFilenameFromExportName("My-House") === "My-House.h2k",
  "My-House becomes My-House.h2k",
);
assert(
  inputH2kFilenameFromExportName("My-House.H2K") === "My-House.h2k",
  "My-House.H2K normalizes to My-House.h2k",
);
assert(
  inputH2kFilenameFromExportName("C:\\\\temp\\\\My-House.h2k") === "My-House.h2k",
  "path components are stripped to basename",
);
assert(
  inputH2kFilenameFromExportName("") === "input.h2k",
  "blank export falls back to input.h2k",
);
assert(
  reportPdfFilenameFromExportName("My-House.h2k", "job-1") === "My-House.pdf",
  "PDF naming still derives from export name",
);

const jobsSource = readFileSync(join(root, "hot2000-jobs.js"), "utf8");
assert(
  jobsSource.includes('form.append("input_filename"'),
  "hot2000-jobs.js must send input_filename for Full House Report jobs",
);
assert(
  jobsSource.includes("inputH2kFilenameFromExportName"),
  "hot2000-jobs.js must normalize input H2K filename",
);

const appSource = readFileSync(join(root, "app.js"), "utf8");
assert(
  appSource.includes('$("#exportName")'),
  "app.js must read #exportName at Generate Full House Report click time",
);
assert(
  appSource.includes("inputH2kFilenameFromExportName"),
  "app.js must normalize export name to input H2K filename",
);
assert(
  !/downloadReportPdf/.test(
    appSource.slice(
      appSource.indexOf("async function printSocFullHouseReportPdf"),
      appSource.indexOf("function pdfSafeText"),
    ),
  ),
  "printSocFullHouseReportPdf must not auto-download on completion",
);

console.log("input-filename.test.mjs: all assertions passed");
