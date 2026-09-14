import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const {
  deriveScanTotals,
  getScanTotalsPanelTitle,
  isSectionCrawlJob,
  ratioLabel,
} = await import("../../lib/hot2000/section-scan-totals.ts");

const client = read("components/admin/hot2000-recorder-client.tsx");

assert.match(client, /deriveScanTotals/);
assert.match(client, /getScanTotalsPanelTitle/);
assert.match(client, /POLL_ACTIVE_MS = 5000/);
assert.match(client, /POLL_IDLE_MS = 30000/);
assert.match(client, /Section progress/);
assert.match(client, /Dropdown options \(tested \/ discovered\)/);
assert.match(client, /Crawl did not start/);

assert.equal(isSectionCrawlJob("catalog_capture_section"), true);
assert.equal(isSectionCrawlJob("catalog_capture"), false);

// Section crawl meta takes precedence over stale global navigation totals.
{
  const totals = deriveScanTotals({
    jobKind: "catalog_capture_section",
    jobStatus: "running",
    meta: {
      sectionId: "general",
      sectionLabel: "General",
      scanMode: "section",
      crawlStarted: true,
      completionPercentage: 37,
      textFieldsVisited: 3,
      textFieldsDiscovered: 14,
      combosOpened: 1,
      combosDiscovered: 5,
      comboOptionsTested: 2,
      comboOptionsDiscovered: 4,
      tabsVisited: 1,
      tabsDiscovered: 3,
      checkboxBranchesCompleted: 1,
      checkboxBranchesDiscovered: 4,
      radioChoicesCompleted: 2,
      radioChoicesDiscovered: 6,
      buttonsVisited: 0,
      buttonsDiscovered: 2,
      dialogsVisited: 0,
      dialogsDiscovered: 0,
      actionsCompleted: 8,
      actionsDiscovered: 22,
      inaccessibleControls: 0,
      actionsPending: 14,
      elapsedSeconds: 95,
      currentControl: "Ownership",
      currentOption: "Rental",
      optionIndex: 2,
      optionCount: 4,
    },
    navigation: {
      totals: {
        screensCaptured: 99,
        screensDiscovered: 120,
        combosOpened: 50,
      },
      crawlCounters: {
        combos_total: 40,
        combo_options_captured: 200,
      },
    },
    coverage: {
      interactive: {
        combosDiscovered: 40,
        comboOptionsCaptured: 200,
      },
    },
  });

  assert.equal(totals.source, "job_meta");
  assert.equal(totals.progressPct, 37);
  assert.equal(ratioLabel(totals.textFields), "3 / 14");
  assert.equal(ratioLabel(totals.combos), "1 / 5");
  assert.equal(ratioLabel(totals.dropdownOptions), "2 / 4");
  assert.equal(totals.pendingActions, 14);
}

// Ownership option progress updates tested dropdown totals.
{
  const before = deriveScanTotals({
    jobKind: "catalog_capture_section",
    jobStatus: "running",
    meta: {
      sectionId: "general",
      crawlStarted: true,
      comboOptionsTested: 1,
      comboOptionsDiscovered: 4,
      currentControl: "Ownership",
      optionIndex: 1,
      optionCount: 4,
    },
  });
  const after = deriveScanTotals({
    jobKind: "catalog_capture_section",
    jobStatus: "running",
    meta: {
      sectionId: "general",
      crawlStarted: true,
      comboOptionsTested: 2,
      comboOptionsDiscovered: 4,
      currentControl: "Ownership",
      optionIndex: 2,
      optionCount: 4,
    },
  });
  assert.equal(ratioLabel(before.dropdownOptions), "1 / 4");
  assert.equal(ratioLabel(after.dropdownOptions), "2 / 4");
}

// Region option progress updates totals independently.
{
  const totals = deriveScanTotals({
    jobKind: "catalog_capture_section",
    jobStatus: "running",
    meta: {
      sectionId: "weather",
      sectionLabel: "Weather",
      crawlStarted: true,
      comboOptionsTested: 7,
      comboOptionsDiscovered: 13,
      currentControl: "Region",
      optionIndex: 7,
      optionCount: 13,
    },
  });
  assert.equal(ratioLabel(totals.dropdownOptions), "7 / 13");
}

// Failed before crawl shows zero counts instead of stale totals.
{
  const totals = deriveScanTotals({
    jobKind: "catalog_capture_section",
    jobStatus: "failed",
    jobStage: "scanning",
    meta: {
      sectionId: "general",
      sectionLabel: "General",
      crawlStarted: false,
      completionPercentage: 0,
      screensCaptured: 0,
      screensDiscovered: 0,
      statesCompleted: 0,
      statesDiscovered: 0,
      actionsCompleted: 0,
      actionsDiscovered: 0,
      textFieldsVisited: 0,
      textFieldsDiscovered: 0,
      combosOpened: 0,
      combosDiscovered: 0,
      comboOptionsTested: 0,
      comboOptionsDiscovered: 0,
      resultClassification: "failed",
    },
    navigation: {
      totals: { screensCaptured: 88, screensDiscovered: 100 },
    },
  });
  assert.equal(totals.crawlDidNotStart, true);
  assert.equal(ratioLabel(totals.screens), "0 / 0");
  assert.equal(ratioLabel(totals.actions), "0 / 0");
  assert.equal(totals.progressPct, 0);
}

// Completed section retains final totals from current job meta.
{
  const totals = deriveScanTotals({
    jobKind: "catalog_capture_section",
    jobStatus: "complete",
    meta: {
      sectionId: "general",
      crawlStarted: true,
      completionPercentage: 100,
      textFieldsVisited: 14,
      textFieldsDiscovered: 14,
      comboOptionsTested: 41,
      comboOptionsDiscovered: 41,
      resultClassification: "complete",
    },
    navigation: {
      totals: { screensCaptured: 1, screensDiscovered: 20 },
    },
  });
  assert.equal(ratioLabel(totals.textFields), "14 / 14");
  assert.equal(ratioLabel(totals.dropdownOptions), "41 / 41");
  assert.equal(totals.progressPct, 100);
}

// Legacy full scan still uses global fallback when no section meta.
{
  const totals = deriveScanTotals({
    jobKind: "catalog_capture",
    jobStatus: "running",
    navigation: {
      totals: { screensCaptured: 4, screensDiscovered: 10, actionsCompleted: 5, actionsDiscovered: 20 },
      crawlCounters: { combos_opened: 2, combos_total: 6 },
    },
  });
  assert.equal(totals.source, "global_fallback");
  assert.equal(ratioLabel(totals.screens), "4 / 10");
}

// Panel title reflects selected section.
{
  const panel = getScanTotalsPanelTitle({
    jobKind: "catalog_capture_section",
    hasCurrentJob: true,
    meta: { sectionLabel: "General" },
  });
  assert.equal(panel.title, "General scan totals");
  assert.match(panel.description, /Live section discovery/);
}

console.log("section-scan-totals.test.mjs passed");
