import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const workerPy = readFileSync(
  join(root, "..", "workers", "hot2000", "worker.py"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(name) {
  const re = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`,
    "m",
  );
  const start = appJs.search(re);
  assert(start >= 0, `${name} not found`);
  let depth = 0;
  let started = false;
  for (let i = start; i < appJs.length; i += 1) {
    const ch = appJs[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) {
        return appJs.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Could not parse ${name}`);
}

const printSocFullHouseReportPdf = extractFunction("printSocFullHouseReportPdf");
const downloadStoredReportPdf = extractFunction("downloadStoredReportPdf");
const openStoredReportPdf = extractFunction("openStoredReportPdf");

assert(
  !/downloadReportPdf/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must not auto-call downloadReportPdf",
);
assert(
  !/downloadPdfBase64/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must not auto-call downloadPdfBase64",
);
assert(
  !/downloadPdfBlob/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must not auto-call downloadPdfBlob",
);
assert(
  /lastReportPdf\s*=\s*null/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must clear lastReportPdf before submitting a new job",
);
assert(
  /lastReportPdf\s*=\s*\{/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must store PDF metadata on success",
);
assert(
  !/autoDownloaded/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must not use autoDownloaded",
);
assert(
  !/autoDownloaded/.test(appJs),
  "app.js must not reference autoDownloaded for Full House Report",
);
assert(
  /renderSocReportSuccessPanel/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must render success panel without auto-download",
);
assert(
  /downloadReportPdf|downloadPdfBase64/.test(downloadStoredReportPdf),
  "downloadStoredReportPdf must download only on user click",
);
assert(
  !/downloadReportPdf|downloadPdfBase64|downloadPdfBlob/.test(openStoredReportPdf),
  "openStoredReportPdf must open without downloading",
);
assert(
  /openReportPdf|openPdfBlob/.test(openStoredReportPdf),
  "openStoredReportPdf must open stored PDF on user click",
);
assert(
  !/auto-saved to your Downloads/i.test(indexHtml),
  "index.html must not mention automatic Downloads save",
);
assert(
  !/auto-saved to Downloads/i.test(appJs),
  "app.js must not mention automatic Downloads save",
);
assert(
  /Use Download PDF or Open PDF/.test(appJs),
  "success copy must direct users to Download/Open PDF buttons",
);
assert(
  indexHtml.includes("app.js?v=2026.09.11.3"),
  "index.html must cache-bust app.js for the no-auto-download release",
);
assert(
  /cleanup_downloads_staging_pdf/.test(workerPy),
  "worker must remove temporary Downloads staging PDF after job copy",
);
assert(
  /finalize_full_house_report_pdf_copy/.test(workerPy),
  "worker must copy staging PDF before cleanup",
);

const saveFullHouseReportPdf = workerPy.slice(
  workerPy.indexOf("def save_full_house_report_pdf"),
  workerPy.indexOf("def run_hot2000_full_house_report"),
);
assert(
  /finalize_full_house_report_pdf_copy/.test(saveFullHouseReportPdf),
  "save_full_house_report_pdf must finalize copy before returning",
);

console.log("report-pdf-download-regression.mjs: all checks passed");
