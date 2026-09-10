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
  /H2kTemplateSerializer\.serializeModelUsingTemplate/.test(appJs),
  "buildXmlString must use template-based serializer",
);
assert(
  /runFullHouseReport/.test(jobsJs),
  "hot2000-jobs.js must expose Full House Report worker flow",
);
assert(
  !indexHtml.includes('id="generateSocBtn"'),
  "index.html must not expose Generate Net (GJ/a) button",
);
assert(
  indexHtml.includes('id="printSocPdfBtn"'),
  "index.html must expose Print to PDF button",
);
assert(
  /printSocPdfBtn/.test(syncReviewActions),
  "syncReviewActions must gate Print to PDF button",
);
assert(
  /canPrint=ok && !socReportPdfActive/.test(syncReviewActions),
  "Print to PDF must unlock after validation passes",
);
assert(
  !/generateSocBtn/.test(syncReviewActions),
  "syncReviewActions must not reference Generate Net button",
);
assert(
  /Hot2000Jobs\.runFullHouseReport/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must call Hot2000Jobs.runFullHouseReport",
);
assert(
  /serializeForExport/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must serialize the current model",
);

function canPrint(reviewValidationPassed, errors, socReportPdfActive) {
  const ok = !!reviewValidationPassed && !errors.length;
  return ok && !socReportPdfActive;
}

assert(canPrint(true, [], false), "validated model enables Print to PDF");
assert(!canPrint(false, [], false), "unvalidated model disables Print to PDF");
assert(!canPrint(true, ["err"], false), "validation errors disable Print to PDF");
assert(!canPrint(true, [], true), "Print to PDF disabled while printing");

console.log("generate-regression: all checks passed");
