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
const generateSocPdfReport = extractFunction("generateSocPdfReport");

assert(
  indexHtml.includes('id="printSocPdfBtn"'),
  "index.html must expose Print to PDF button",
);
assert(
  /Print to PDF/.test(indexHtml),
  "Print to PDF label must appear in Review UI",
);
assert(
  /printSocPdfBtn/.test(appJs),
  "app.js must wire Print to PDF button",
);
assert(
  /pdf\.disabled=!ok\s*\|\|\s*socCalculationActive/.test(syncReviewActions),
  "Print to PDF must disable on validation state or active calculation",
);
assert(
  /Hot2000Jobs\.runCalculation/.test(generateSocPdfReport),
  "generateSocPdfReport must call Hot2000Jobs.runCalculation",
);
assert(
  /purpose:\s*"pdf"/.test(generateSocPdfReport),
  "generateSocPdfReport must request pdf purpose",
);
assert(
  /mergeCalculatedResultsFromXml/.test(generateSocPdfReport),
  "generateSocPdfReport must merge calculated AllResults before PDF build",
);
assert(
  /buildSocPdfBlob/.test(generateSocPdfReport),
  "generateSocPdfReport must build SOC house report PDF",
);
assert(
  /PDF_STAGE_LABELS/.test(jobsJs),
  "hot2000-jobs.js must define PDF-specific stage labels",
);
assert(
  /calculatedXml/.test(jobsJs),
  "hot2000-jobs.js must return calculatedXml from completed jobs",
);

function canPrint(reviewValidationPassed, errors, socCalculationActive) {
  const ok = !!reviewValidationPassed && !errors.length;
  return ok && !socCalculationActive;
}

assert(canPrint(true, [], false), "validated model enables Print to PDF");
assert(!canPrint(false, [], false), "unvalidated model disables Print to PDF");
assert(!canPrint(true, ["err"], false), "validation errors disable Print to PDF");
assert(!canPrint(true, [], true), "active calculation disables Print to PDF");

console.log("pdf-regression: all checks passed");
