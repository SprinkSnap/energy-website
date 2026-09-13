import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

// Public jobs route must reject catalog recorder kinds.
{
  const jobsRoute = read("app/api/hot2000/jobs/route.ts");
  assert.match(jobsRoute, /isCatalogRecorderJobKind/);
  assert.match(jobsRoute, /Catalog recorder jobs are not accepted/);
}

// Catalog recorder API must enforce authorization helper.
{
  const catalogJobsRoute = read("app/api/hot2000/catalog-recorder/jobs/route.ts");
  assert.match(catalogJobsRoute, /assertCatalogRecorderAuthorized/);
}

// Admin page must be feature-flag gated and not linked from public editor.
{
  const recorderPage = read("app/admin/hot2000-recorder/page.tsx");
  assert.match(recorderPage, /isCatalogRecorderEnabled/);
  const editorIndex = read("h2k-web-editor/index.html");
  assert.doesNotMatch(editorIndex, /hot2000-recorder/i);
  const editorApp = read("h2k-web-editor/app.js");
  assert.doesNotMatch(editorApp, /hot2000-recorder/i);
}

// Worker must route catalog jobs separately and reuse shared lifecycle.
{
  const worker = read("workers/hot2000/worker.py");
  assert.match(worker, /CATALOG_JOB_KINDS/);
  assert.match(worker, /process_catalog_job/);
  assert.match(worker, /from hot2000_lifecycle import/);
  const lifecycle = read("workers/hot2000/hot2000_lifecycle.py");
  assert.match(lifecycle, /def launch_hot2000/);
  assert.match(lifecycle, /def close_hot2000/);
}

// Catalog recorder module must enumerate ComboBox options.
{
  const recorder = read("workers/hot2000/catalog_recorder.py");
  assert.match(recorder, /_enumerate_combo_options/);
  assert.match(recorder, /inaccessible_controls/);
}

// Phase 2 navigation engine and scan state.
{
  const navigation = read("workers/hot2000/catalog_navigation.py");
  assert.match(navigation, /SAFE_CLASSIFICATIONS/);
  assert.match(navigation, /compute_screen_key/);
  assert.match(navigation, /discover_navigation_targets/);
  const autoScan = read("workers/hot2000/catalog_auto_scan.py");
  assert.match(autoScan, /run_automatic_full_scan/);
  assert.match(autoScan, /ScanStopped/);
  const controlRoute = read("app/api/hot2000/catalog-recorder/jobs/[id]/control/route.ts");
  assert.match(controlRoute, /setCatalogScanControl/);
}

// Phase 3 probe engine and XML diff.
{
  const probe = read("workers/hot2000/catalog_probe.py");
  assert.match(probe, /run_probe_queue/);
  const engine = read("workers/hot2000/catalog_probe_engine.py");
  assert.match(engine, /diff_h2k_xml/);
  assert.match(engine, /create_probe_workspace/);
  const xmlDiff = read("workers/hot2000/catalog_xml_diff.py");
  assert.match(xmlDiff, /IGNORED_GENERATED_PATHS/);
  const probeStore = read("lib/hot2000/probe-store.ts");
  assert.match(probeStore, /persistProbeResults/);
  const manifest = read("h2k-web-editor/catalog/fixtures/manifest.json");
  assert.match(manifest, /baseline-general/);
  assert.match(manifest, /sha256/);
}

console.log("catalog-recorder-auth.test.mjs passed");
