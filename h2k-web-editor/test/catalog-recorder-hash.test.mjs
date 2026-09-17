import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const { hashH2kContent } = await import("../../lib/hot2000/job-store.ts");
const { recorderFixtureXml } = await import("../../lib/hot2000/recorder-fixture.ts");
const { mapActionToJobKind, CATALOG_RECORDER_JOB_KINDS } = await import(
  "../../lib/hot2000/catalog-recorder.ts"
);
const {
  assertValidJobInputXml,
  assertValidSourceHash,
  assertValidJobKind,
} = await import("../../lib/hot2000/job-create-validation.ts");

// 1–3. hashH2kContent async Web Crypto SHA-256.
{
  const xml = '<?xml version="1.0"?><HouseFile></HouseFile>';
  const hash = await hashH2kContent(xml);
  assert.equal(typeof hash, "string");
  assert.match(hash, /^[a-f0-9]{64}$/);

  await assert.rejects(
    () => hashH2kContent(undefined),
    /Cannot hash empty H2K content/,
  );
  await assert.rejects(
    () => hashH2kContent(""),
    /Cannot hash empty H2K content/,
  );
}

// 4. Recorder fixture hashes successfully.
{
  const xml = recorderFixtureXml();
  const hash = await hashH2kContent(xml);
  assert.match(hash, /^[a-f0-9]{64}$/);
}

// 5–7. Catalog recorder and normal job kinds map correctly.
{
  assert.equal(mapActionToJobKind("start_scan"), "catalog_capture");
  assert.equal(mapActionToJobKind("capture_screen"), "catalog_capture_screen");
  assert.equal(mapActionToJobKind("run_probe"), "catalog_probe");
  assert.ok(CATALOG_RECORDER_JOB_KINDS.includes("catalog_capture"));
  assert.ok(assertValidJobKind("calculate") === "calculate");
  assert.ok(assertValidJobKind("full_house_report") === "full_house_report");
}

// 8–9. Job create validation rejects missing/invalid fields.
{
  assert.throws(
    () => assertValidJobInputXml(undefined),
    /inputXml must be a non-empty string/,
  );
  assert.throws(
    () => assertValidJobInputXml("   "),
    /inputXml must be a non-empty string/,
  );
  assert.throws(
    () => assertValidSourceHash(undefined),
    /sourceHash must be a 64-character SHA-256 hex string/,
  );
  assert.throws(
    () => assertValidSourceHash("abc"),
    /sourceHash must be a 64-character SHA-256 hex string/,
  );
}

// 10. Runtime path uses Web Crypto, not node:crypto.
{
  const jobStore = read("lib/hot2000/job-store.ts");
  assert.doesNotMatch(jobStore, /from "node:crypto"/);
  assert.doesNotMatch(jobStore, /createHash/);
  assert.match(jobStore, /crypto\.subtle\.digest/);
  assert.match(jobStore, /export async function hashH2kContent/);

  const catalogJobsRoute = read("app/api/hot2000/catalog-recorder/jobs/route.ts");
  assert.match(catalogJobsRoute, /await hashH2kContent/);
  assert.match(catalogJobsRoute, /stage = "hash-fixture"/);
  assert.match(catalogJobsRoute, /CATALOG_RECORDER_CREATE_FAILED/);

  const normalJobsRoute = read("app/api/hot2000/jobs/route.ts");
  assert.match(normalJobsRoute, /await hashH2kContent/);

  const doClient = read("lib/hot2000/do-client.ts");
  assert.match(doClient, /assertValidJobInputXml/);
  assert.match(doClient, /assertValidSourceHash/);

  const doSource = read("workers/hot2000-job-queue.ts");
  assert.match(doSource, /assertValidJobInputXml/);
  assert.match(doSource, /assertValidSourceHash/);
}

console.log("catalog-recorder-hash.test.mjs passed");
