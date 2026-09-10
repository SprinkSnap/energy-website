import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const jobsJs = readFileSync(join(root, "hot2000-jobs.js"), "utf8");
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

const syncReviewActions = extractFunction("syncReviewActions");
const printSocFullHouseReportPdf = extractFunction("printSocFullHouseReportPdf");

assert(
  indexHtml.includes('id="printSocPdfBtn"'),
  "index.html must expose Print to PDF button",
);
assert(
  (indexHtml.match(/id="printSocPdfBtn"/g) || []).length === 1,
  "Print to PDF button must appear once (sticky top toolbar only)",
);
assert(
  /<div class="toolbar">[\s\S]*id="printSocPdfBtn"/.test(indexHtml),
  "Print to PDF button must live in the sticky top toolbar",
);
assert(
  indexHtml.includes('id="generateSocBtn"'),
  "index.html must expose Generate Net (GJ/a) button on Review",
);
assert(
  (indexHtml.match(/id="generateSocBtn"/g) || []).length === 1,
  "Generate Net button must appear once (Review step only)",
);
assert(
  !indexHtml.split("</header>")[0].includes('id="generateSocBtn"'),
  "Generate Net button must not live in the top toolbar",
);
assert(
  /No separate Calculate step/.test(indexHtml),
  "Review copy must describe report-only Print to PDF flow",
);
assert(
  /printSocFullHouseReportPdf/.test(appJs),
  "app.js must implement printSocFullHouseReportPdf",
);
assert(
  /canPrint=ok && !socReportPdfActive/.test(syncReviewActions),
  "Print to PDF must unlock after validation passes",
);
assert(
  !/hasFreshWorkerSocResult\(\)/.test(syncReviewActions),
  "Print to PDF must not require Generate Net first",
);
assert(
  !/hasFreshWorkerSocResult/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must not require Generate Net first",
);
assert(
  /Hot2000Jobs\.runFullHouseReport/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must call Hot2000Jobs.runFullHouseReport",
);
assert(
  /downloadPdfBase64/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must download worker PDF",
);
assert(
  /runFullHouseReport/.test(jobsJs),
  "hot2000-jobs.js must expose runFullHouseReport",
);
assert(
  !/CMD_CALCULATE/.test(
    workerPy.slice(
      workerPy.indexOf("def run_hot2000_full_house_report"),
      workerPy.indexOf("def run_hot2000("),
    ),
  ),
  "Full house report worker flow must not run Calculate",
);
assert(
  /open_soc_full_house_report/.test(
    workerPy.slice(
      workerPy.indexOf("def run_hot2000_full_house_report"),
      workerPy.indexOf("def run_hot2000("),
    ),
  ),
  "Full house report worker must open Report menu path",
);
assert(
  /save_full_house_report_pdf/.test(
    workerPy.slice(
      workerPy.indexOf("def run_hot2000_full_house_report"),
      workerPy.indexOf("def run_hot2000("),
    ),
  ),
  "Full house report worker must print report to PDF",
);

function canPrint(reviewValidationPassed, errors, socCalculationActive, socReportPdfActive) {
  const ok = !!reviewValidationPassed && !errors.length;
  return ok && !socCalculationActive && !socReportPdfActive;
}

assert(canPrint(true, [], false, false), "validated model enables Print to PDF");
assert(!canPrint(false, [], false, false), "unvalidated model disables Print to PDF");
assert(!canPrint(true, ["err"], false, false), "validation errors disable Print to PDF");
assert(!canPrint(true, [], true, false), "Print to PDF disabled during calculation");
assert(!canPrint(true, [], false, true), "Print to PDF disabled while printing");

console.log("pdf-regression: all checks passed");
