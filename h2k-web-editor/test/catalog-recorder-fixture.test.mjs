import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const {
  recorderFixtureXml,
  assertRecorderJobFixture,
} = await import("../../lib/hot2000/recorder-fixture.ts");
const { hashH2kContent } = await import("../../lib/hot2000/job-store.ts");
const { mapActionToJobKind, CATALOG_RECORDER_JOB_KINDS } = await import(
  "../../lib/hot2000/catalog-recorder.ts"
);

// 1–3. Fixture is a non-empty valid H2K XML string.
{
  const xml = recorderFixtureXml();
  assert.equal(typeof xml, "string");
  assert.ok(xml.length > 0);
  assert.match(xml, /<?xml/);
  assert.match(xml, /<HouseFile[\s>]/);
}

// 4. hashH2kContent rejects undefined.
{
  await assert.rejects(
    () => hashH2kContent(undefined),
    /Cannot hash empty H2K content/,
  );
  await assert.rejects(
    () => hashH2kContent(""),
    /Cannot hash empty H2K content/,
  );
}

// 5–7. Catalog recorder actions map to supported job kinds.
{
  assert.equal(mapActionToJobKind("start_scan"), "catalog_capture");
  assert.equal(mapActionToJobKind("capture_screen"), "catalog_capture_screen");
  assert.equal(mapActionToJobKind("run_probe"), "catalog_probe");
  for (const kind of [
    "catalog_capture",
    "catalog_capture_screen",
    "catalog_probe",
  ]) {
    assert.ok(CATALOG_RECORDER_JOB_KINDS.includes(kind));
  }
}

// Fixture + hash validation used before createJob().
{
  const xml = recorderFixtureXml();
  const sourceHash = await hashH2kContent(xml);
  assert.match(sourceHash, /^[a-f0-9]{64}$/);
  assertRecorderJobFixture(xml, sourceHash);
  assert.throws(
    () => assertRecorderJobFixture(xml, "not-a-hash"),
    /Invalid H2K source hash/,
  );
}

// 8. No server-side .h2k raw import in recorder fixture module.
{
  const recorderFixture = read("lib/hot2000/recorder-fixture.ts");
  assert.match(recorderFixture, /generated-recorder-fixture/);
  assert.doesNotMatch(recorderFixture, /from\s+["'].*\.h2k["']/);
  const generated = read("lib/hot2000/generated-recorder-fixture.ts");
  assert.match(generated, /RECORDER_FIXTURE_XML/);
  assert.match(generated, /<HouseFile/);
}

// 9. Jobs route does not import .h2k or use readFile.
{
  const jobsRoute = read("app/api/hot2000/catalog-recorder/jobs/route.ts");
  assert.match(jobsRoute, /recorderFixtureXml/);
  assert.match(jobsRoute, /assertRecorderJobFixture/);
  assert.doesNotMatch(jobsRoute, /\.h2k/);
  assert.doesNotMatch(jobsRoute, /readFile/);
  assert.doesNotMatch(jobsRoute, /from "node:fs/);
}

// Generator script validates source fixture.
{
  const generator = read("scripts/generate-recorder-fixture.mjs");
  assert.match(generator, /baseline-general\.h2k/);
  assert.match(generator, /JSON\.stringify\(xml\)/);
}

console.log("catalog-recorder-fixture.test.mjs passed");
