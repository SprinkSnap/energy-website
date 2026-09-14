import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

function readAll(relPaths) {
  return relPaths.map(read).join("\n");
}

const recorderApiSources = readAll([
  "app/api/hot2000/catalog-recorder/status/route.ts",
  "app/api/hot2000/catalog-recorder/jobs/route.ts",
  "app/api/hot2000/catalog-recorder/raw/[jobId]/route.ts",
  "app/api/hot2000/catalog-recorder/jobs/[id]/route.ts",
  "app/api/hot2000/catalog-recorder/jobs/[id]/control/route.ts",
  "app/api/hot2000/worker/[id]/complete/route.ts",
  "lib/hot2000/runtime-recorder-store.ts",
  "lib/hot2000/recorder-state-logic.ts",
  "lib/hot2000/fixture-manifest.ts",
  "lib/hot2000/recorder-fixture.ts",
  "lib/hot2000/do-client.ts",
]);

// 8. No runtime fs in Cloudflare recorder dependency graph.
{
  assert.doesNotMatch(recorderApiSources, /from "node:fs\/promises"/);
  assert.doesNotMatch(recorderApiSources, /from "node:fs"/);
  assert.doesNotMatch(recorderApiSources, /import\("node:fs\/promises"\)/);
  assert.doesNotMatch(recorderApiSources, /raw-desktop-store/);
  assert.doesNotMatch(recorderApiSources, /probe-store/);
}

// Status route reads Durable Object recorder state, not local manifest files.
{
  const statusRoute = read("app/api/hot2000/catalog-recorder/status/route.ts");
  assert.match(statusRoute, /getRecorderState/);
  assert.match(statusRoute, /getQueueStatus/);
  assert.match(statusRoute, /getFixtureManifest/);
  assert.doesNotMatch(statusRoute, /readFile/);
  assert.doesNotMatch(statusRoute, /raw-desktop/);
}

// Complete route updates recorder state in DO after completeJob.
{
  const completeRoute = read("app/api/hot2000/worker/[id]/complete/route.ts");
  assert.match(completeRoute, /completeJob\(/);
  assert.match(completeRoute, /applyCaptureToRecorderState/);
  assert.doesNotMatch(completeRoute, /persistCatalogCapture/);
  assert.doesNotMatch(completeRoute, /persistProbeResults/);
}

// Raw GET hydrates catalog capture from inline JSON or chunked blob ref.
{
  const rawRoute = read("app/api/hot2000/catalog-recorder/raw/[jobId]/route.ts");
  assert.match(rawRoute, /resolveJobCatalogCapture/);
  assert.match(rawRoute, /getJob\(/);
}

// Raw POST updates recorder snapshot instead of writing repository files.
{
  const rawRoute = read("app/api/hot2000/catalog-recorder/raw/[jobId]/route.ts");
  assert.match(rawRoute, /applyCaptureToRecorderState/);
  assert.doesNotMatch(rawRoute, /persistCatalogCapture/);
}

// Durable Object exposes recorder-state endpoints.
{
  const doSource = read("workers/hot2000-job-queue.ts");
  assert.match(doSource, /\/recorder-state/);
  assert.match(doSource, /applyRecorderCapture/);
  assert.match(doSource, /RECORDER_STATE_KEY/);
}

// Static fixture manifest is bundled, not read at runtime.
{
  const fixtureManifest = read("lib/hot2000/fixture-manifest.ts");
  assert.match(fixtureManifest, /manifest\.json/);
  assert.doesNotMatch(fixtureManifest, /readFile/);
}

// Jobs route uses build-time generated fixture XML (not .h2k import).
{
  const jobsRoute = read("app/api/hot2000/catalog-recorder/jobs/route.ts");
  const recorderFixture = read("lib/hot2000/recorder-fixture.ts");
  assert.match(jobsRoute, /recorderFixtureXml/);
  assert.match(jobsRoute, /assertRecorderJobFixture/);
  assert.match(recorderFixture, /generated-recorder-fixture/);
  assert.doesNotMatch(jobsRoute, /readFile/);
  assert.doesNotMatch(recorderFixture, /from\s+["'].*\.h2k["']/);
}

// 10. Catalog recorder remains owner/employee only.
{
  const statusRoute = read("app/api/hot2000/catalog-recorder/status/route.ts");
  assert.match(statusRoute, /assertCatalogRecorderAuthorized/);
}

// 9. calculate / full_house_report completion path unchanged.
{
  const completeRoute = read("app/api/hot2000/worker/[id]/complete/route.ts");
  assert.match(completeRoute, /extractSocNetGJa/);
  assert.match(completeRoute, /full_house_report/);
  assert.match(completeRoute, /reportPdfBase64/);
}

// Recorder state logic: section capture, navigation, probe.
{
  const { applyCaptureToRecorderState } = await import(
    "../../lib/hot2000/recorder-state-logic.ts"
  );

  // 4. Fresh state when no prior capture.
  let state = applyCaptureToRecorderState(
    null,
    JSON.stringify({ section: "weather", controls: [{ id: "a" }, { id: "b" }] }),
    { section: "weather", workerId: "w1" },
    "job-section-1",
  );
  assert.equal(state.latestCaptureJobId, "job-section-1");
  assert.equal(state.sectionCaptureJobIds.weather, "job-section-1");
  assert.equal(state.rawManifest.sections.weather.controls, 2);

  // 5. Automatic scan updates navigation.
  state = applyCaptureToRecorderState(
    state,
    JSON.stringify({
      status: "complete",
      screens: { weather: { title: "Weather", status: "captured" } },
      totals: { screensCaptured: 1 },
    }),
    {},
    "job-nav-1",
  );
  assert.equal(state.latestNavigationJobId, "job-nav-1");
  assert.ok(state.navigationSummary?.screens?.weather);
  assert.equal(state.navigation, null);

  // 6. Probe updates mappings and conflicts.
  state = applyCaptureToRecorderState(
    state,
    JSON.stringify({
      probeVersion: "1.0.0",
      probeId: "probe-1",
      completed: [
        {
          controlId: "c1",
          mapping: { path: "/HouseFile/Weather/Region", confidence: "exact" },
        },
      ],
      conflicts: [{ controlId: "c2", reason: "ambiguous" }],
    }),
    { fixtureId: "baseline-weather" },
    "job-probe-1",
  );
  assert.equal(state.latestProbeJobId, "job-probe-1");
  assert.equal(state.probeMappings.weather.mappings.length, 1);
  assert.equal(state.probeConflicts.length, 1);

  // Coverage applied when supplied inline.
  state = applyCaptureToRecorderState(
    state,
    JSON.stringify({
      section: "general",
      controls: [],
      coverage: { summary: { completionPercentage: 42 } },
    }),
    { section: "general" },
    "job-cov-1",
  );
  assert.equal(state.coverage.completionPercentage, 42);
}

// Local filesystem store is isolated under h2k-web-editor/catalog (Node CLI only).
{
  const localStore = read("h2k-web-editor/catalog/local-file-store.mjs");
  assert.match(localStore, /persistCatalogCapture/);
  assert.match(localStore, /persistProbeResults/);
  assert.doesNotMatch(recorderApiSources, /local-file-store/);
}

console.log("catalog-recorder-runtime.test.mjs passed");
