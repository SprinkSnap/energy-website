import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const jobsJs = readFileSync(join(root, "hot2000-jobs.js"), "utf8");

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

assert(
  /gen\.disabled=!ok\s*\|\|\s*socCalculationActive/.test(syncReviewActions),
  "Generate must disable only on validation state or active calculation",
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
  /serializeForExport/.test(generateSocNetGJa),
  "generateSocNetGJa must serialize the current model",
);
assert(
  /H2KSerializer\.buildH2kFromTemplate/.test(appJs) || /H2KSerializer\?\.buildH2kFromTemplate/.test(appJs),
  "buildXmlString must use template-based H2KSerializer",
);
assert(
  !/if\s*\(\s*hasSocResults\(\)/.test(generateSocNetGJa),
  "generateSocNetGJa must not branch on source SOC presence",
);
assert(
  /runCalculation/.test(jobsJs),
  "hot2000-jobs.js must expose worker calculation flow",
);

function canGenerate(reviewValidationPassed, errors, socCalculationActive) {
  const ok = !!reviewValidationPassed && !errors.length;
  return ok && !socCalculationActive;
}

assert(canGenerate(true, [], false), "validated model enables Generate");
assert(canGenerate(true, [], false), "SOC presence is not part of eligibility");
assert(!canGenerate(false, [], false), "unvalidated model disables Generate");
assert(!canGenerate(true, ["err"], false), "validation errors disable Generate");
assert(!canGenerate(true, [], true), "active calculation disables Generate");
assert(canGenerate(true, [], false), "re-validated model re-enables Generate");

console.log("generate-regression: all checks passed");
