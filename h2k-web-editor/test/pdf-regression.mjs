import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const jobsJs = readFileSync(join(root, "hot2000-jobs.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");

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
  "Print to PDF button must appear once (Full House Report step only)",
);
assert(
  indexHtml.includes('id="socReportPanel"'),
  "index.html must include Full House Report status panel",
);
assert(
  /printSocFullHouseReportPdf/.test(appJs),
  "app.js must implement printSocFullHouseReportPdf",
);
assert(
  /hasFreshWorkerSocResult/.test(syncReviewActions),
  "Print to PDF must unlock after fresh worker Net GJ/a",
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
  /full_house_report/.test(jobsJs),
  "hot2000-jobs.js must submit full_house_report jobs",
);

console.log("pdf-regression: all checks passed");
