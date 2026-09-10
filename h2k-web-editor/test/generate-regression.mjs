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
const generateSocNetGJa = extractFunction("generateSocNetGJa");
const printSocFullHouseReportPdf = extractFunction("printSocFullHouseReportPdf");

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
  /review-step-calc[\s\S]*id="generateSocBtn"/.test(indexHtml),
  "Generate Net button must live in the Review Net GJ/a step",
);
assert(
  /gen\.disabled=!ok\s*\|\|\s*socCalculationActive/.test(syncReviewActions),
  "Generate must disable on validation state or active calculation",
);
assert(
  !/hasSocResults\(\)/.test(syncReviewActions),
  "syncReviewActions must not gate Generate on hasSocResults()",
);
assert(
  /Hot2000Jobs\.runCalculation/.test(generateSocNetGJa),
  "generateSocNetGJa must call Hot2000Jobs.runCalculation",
);
assert(
  !/extractSocResults\(\)/.test(generateSocNetGJa),
  "generateSocNetGJa must not read imported SOC via extractSocResults()",
);
assert(
  /H2kTemplateSerializer\.serializeModelUsingTemplate/.test(appJs),
  "buildXmlString must use template-based serializer",
);
assert(
  /serializeForExport/.test(generateSocNetGJa),
  "generateSocNetGJa must serialize the current model",
);
assert(
  !/if\s*\(\s*hasSocResults\(\)/.test(generateSocNetGJa),
  "generateSocNetGJa must not branch on source SOC presence",
);
assert(
  /runCalculation/.test(jobsJs),
  "hot2000-jobs.js must expose worker calculation flow",
);
assert(
  /runFullHouseReport/.test(jobsJs),
  "hot2000-jobs.js must expose Full House Report worker flow",
);
assert(
  indexHtml.includes('id="printSocPdfBtn"'),
  "index.html must expose Full House Report button on Review",
);
assert(
  !indexHtml.split("</header>")[0].includes('id="printSocPdfBtn"'),
  "Full House Report button must not live in the top toolbar",
);
assert(
  /review-step-report[\s\S]*id="printSocPdfBtn"/.test(indexHtml),
  "Full House Report button must live in the Review Full House Report step",
);
assert(
  /printSocPdfBtn/.test(syncReviewActions),
  "syncReviewActions must gate Full House Report button",
);
assert(
  /SOC_REPORT_BUTTON_LABEL/.test(appJs),
  "app.js must define SOC_REPORT_BUTTON_LABEL for the Full House Report button",
);
assert(
  /canPrint=ok/.test(syncReviewActions),
  "Full House Report must unlock after validation passes",
);
assert(
  !/hasFreshWorkerSocResult/.test(syncReviewActions),
  "Full House Report must not require Generate Net first",
);
assert(
  /Hot2000Jobs\.runFullHouseReport/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must call Hot2000Jobs.runFullHouseReport",
);
assert(
  !/hasFreshWorkerSocResult/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must not require Generate Net first",
);

function canGenerate(reviewValidationPassed, errors, socCalculationActive, socReportPdfActive = false) {
  const ok = !!reviewValidationPassed && !errors.length;
  return ok && !socCalculationActive && !socReportPdfActive;
}

function canPrint(reviewValidationPassed, errors, socCalculationActive, socReportPdfActive) {
  const ok = !!reviewValidationPassed && !errors.length;
  return ok && !socCalculationActive && !socReportPdfActive;
}

assert(canGenerate(true, [], false), "validated model enables Generate");
assert(!canGenerate(false, [], false), "unvalidated model disables Generate");
assert(!canGenerate(true, ["err"], false), "validation errors disable Generate");
assert(!canGenerate(true, [], true), "active calculation disables Generate");
assert(!canPrint(false, [], false, false), "Full House Report disabled before validation");
assert(canPrint(true, [], false, false), "Full House Report enabled after validation");
assert(!canPrint(true, ["err"], false, false), "Full House Report disabled when validation has errors");
assert(!canPrint(true, [], true, false), "Full House Report disabled during calculation");
assert(!canPrint(true, [], false, true), "Full House Report disabled while generating");

console.log("generate-regression: all checks passed");
