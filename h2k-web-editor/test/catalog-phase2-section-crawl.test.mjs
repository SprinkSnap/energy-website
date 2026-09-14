import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const phase2Sections = read("lib/hot2000/phase2-sections.ts");
const expectedLabels = [
  "General",
  "Info",
  "Specifications",
  "Weather",
  "Fuel Cost",
  "Unit & Mode",
  "Window Tightness",
  "Code Summary",
  "Temperatures",
  "Base Loads",
  "Generation",
  "Natural Air Infiltration",
  "Ventilation",
  "Heating/Cooling System",
  "Domestic Hot Water",
  "Program",
];

for (const label of expectedLabels) {
  assert.match(phase2Sections, new RegExp(`label: "${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
}

const labelOrder = [...phase2Sections.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(labelOrder.slice(0, 16), expectedLabels);

const client = read("components/admin/hot2000-recorder-client.tsx");
assert.match(client, /Start section crawl/);
assert.match(client, /Crawl section/);
assert.match(client, /Section coverage/);
assert.match(client, /PHASE2_SECTIONS/);
assert.match(client, /POLL_ACTIVE_MS = 5000/);
assert.match(client, /POLL_IDLE_MS = 30000/);
assert.match(client, /capture_section/);
assert.match(client, /Show advanced full-program scan/);
assert.doesNotMatch(client, /Start automatic full scan\n/);

const catalogRecorder = read("lib/hot2000/catalog-recorder.ts");
assert.match(catalogRecorder, /catalog_capture_section/);
assert.match(catalogRecorder, /capture_section/);

const jobsRoute = read("app/api/hot2000/catalog-recorder/jobs/route.ts");
assert.match(jobsRoute, /assertPhase2SectionId/);
assert.match(jobsRoute, /capture_section:/);

const worker = read("workers/hot2000/worker.py");
assert.match(worker, /WORKER_BUILD_ID = "2026-09-14f"/);
assert.match(worker, /catalog_capture_section/);

const sectionCrawl = read("workers/hot2000/catalog_section_crawl.py");
assert.match(sectionCrawl, /run_section_crawl/);
assert.match(sectionCrawl, /ProgressBatcher/);
assert.match(sectionCrawl, /section\.json/);
assert.match(sectionCrawl, /dependencies\.json/);

const sectionNav = read("workers/hot2000/catalog_section_navigation.py");
assert.match(sectionNav, /navigate_to_section/);
assert.match(sectionNav, /detect_current_section/);
assert.match(sectionNav, /capture_navigation_snapshot/);
assert.match(sectionNav, /desktop_nav_alias_set/);
assert.doesNotMatch(sectionNav, /click_input/);

const engine = read("workers/hot2000/catalog_ui_crawler_engine.py");
assert.match(engine, /target_section_id/);
assert.match(engine, /is_foreign_section_navigation/);

const crawler = read("workers/hot2000/catalog_ui_crawler.py");
assert.match(crawler, /target_section_id/);
assert.match(crawler, /scan_mode/);

const batcher = read("workers/hot2000/catalog_progress_batcher.py");
assert.match(batcher, /ProgressBatcher/);

const recorderState = read("lib/hot2000/recorder-state.ts");
assert.match(recorderState, /sectionCoverage/);

const statusRoute = read("app/api/hot2000/catalog-recorder/status/route.ts");
assert.match(statusRoute, /section_coverage/);

console.log("catalog-phase2-section-crawl.test.mjs passed");
