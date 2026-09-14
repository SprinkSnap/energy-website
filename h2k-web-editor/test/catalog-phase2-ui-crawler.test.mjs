import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

// Core crawler modules exist.
for (const file of [
  "workers/hot2000/catalog_ui_crawler_engine.py",
  "workers/hot2000/catalog_ui_crawler.py",
  "workers/hot2000/catalog_ui_fingerprint.py",
  "workers/hot2000/catalog_ui_interaction.py",
  "workers/hot2000/tests/test_catalog_ui_crawler_engine.py",
]) {
  assert.ok(read(file).length > 0, `${file} should exist`);
}

const worker = read("workers/hot2000/worker.py");
assert.match(worker, /WORKER_BUILD_ID = "2026-09-14g"/);
assert.match(read("workers/hot2000/catalog_ui_interaction.py"), /automatic_scan_mode/);
assert.doesNotMatch(read("workers/hot2000/catalog_combo_enumeration.py"), /click_input/);
assert.match(read("workers/hot2000/catalog_control_locator.py"), /logical_control_id/);
assert.match(read("workers/hot2000/catalog_visitation_ledger.py"), /VisitationLedger/);
assert.match(worker, /def checkpoint_catalog/);
assert.match(worker, /def catalog_progress/);

const autoScan = read("workers/hot2000/catalog_auto_scan.py");
assert.match(autoScan, /run_stateful_ui_crawl/);

const client = read("components/admin/hot2000-recorder-client.tsx");
assert.match(client, /Current action:/);
assert.match(client, /HOT2000 PID:/);
assert.match(client, /crawlCounters/);
assert.match(client, /Normalize capture/);
assert.match(client, /Last screen:/);
assert.match(client, /sourceJobId/);

const accounting = read("workers/hot2000/catalog_scan_accounting.py");
assert.match(accounting, /classify_scan_result/);
assert.match(accounting, /verify_accounting_invariant/);

const normalizer = read("h2k-web-editor/catalog/normalize-desktop-capture.mjs");
assert.match(normalizer, /no-guessed-xml-paths/);

const checkpointRoute = read("app/api/hot2000/worker/[id]/checkpoint/route.ts");
assert.match(checkpointRoute, /checkpointCatalogJob/);

const engine = read("workers/hot2000/catalog_ui_crawler_engine.py");
assert.match(engine, /combo_select/);
assert.match(engine, /checkbox_toggle/);

const crawler = read("workers/hot2000/catalog_ui_crawler.py");
assert.match(crawler, /queue_drained/);
assert.match(crawler, /run_stateful_ui_crawl/);

const interaction = read("workers/hot2000/catalog_ui_interaction.py");
assert.match(interaction, /HOT2000_RECORDER_VISIBLE_INTERACTION/);

console.log("catalog-phase2-ui-crawler.test.mjs passed");
