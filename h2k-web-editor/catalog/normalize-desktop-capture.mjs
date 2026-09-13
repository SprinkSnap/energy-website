#!/usr/bin/env node
/**
 * Normalize immutable raw HOT2000 desktop capture into catalog/capture/hot2000-11.13/.
 *
 * Phase 2 does not invent H2K XML paths — unmapped fields keep xmlPath: null.
 *
 * Usage:
 *   node catalog/normalize-desktop-capture.mjs <raw-desktop-dir>
 *   node catalog/normalize-desktop-capture.mjs --stdin   # read JSON from stdin
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const NORMALIZER_VERSION = "2026.09.14.1";
const SCHEMA_VERSION = "2.0.0";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultCaptureRoot = join(root, "catalog", "capture", "hot2000-11.13");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function slugify(value) {
  return String(value || "control")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "control";
}

function mapControlType(controlType) {
  const t = String(controlType || "").toLowerCase();
  if (t.includes("combo") || t.includes("list")) return "select";
  if (t.includes("checkbox")) return "checkbox";
  if (t.includes("radio")) return "radio";
  if (t.includes("edit") || t.includes("document")) return "text";
  if (t.includes("text") || t.includes("label")) return "readonly";
  return "text";
}

function controlToField(control, order, screenRef) {
  const stableId = control.stableId || control.stable_id || `control-${order}`;
  const label = control.label || control.name || stableId;
  const field = {
    id: slugify(stableId),
    label,
    xmlPath: null,
    mappingStatus: "unmapped",
    control: mapControlType(control.controlType || control.control_type),
    order,
    colSpan: 12,
    captureRef: `${screenRef}/${stableId}`,
    evidence: [
      {
        type: "desktop-capture",
        controlId: stableId,
        automationId: control.automationId || control.automation_id || null,
      },
    ],
  };
  if (control.disabled || control.enabled === false) field.disabled = true;
  if (control.readonly) field.readonly = true;
  if (control.value) field.observedValue = control.value;
  const options = control.options || [];
  if (options.length) {
    field.optionLabels = options.map((opt, index) => ({
      index: opt.index ?? index,
      label: opt.label || String(opt.index ?? index),
      order: index,
      selected: Boolean(opt.selected),
    }));
    field.comboEnumerationStatus =
      control.comboEnumerationStatus || control.enumerationStatus || "captured";
  }
  return field;
}

function screenCaptureToNormalized(screenData, screenKey) {
  const section =
    screenData.section ||
    slugify(screenData.windowTitle || screenData.desktopScreen || screenKey);
  const desktopScreen =
    screenData.windowTitle || screenData.desktopScreen || screenKey;
  const fields = [];
  let order = 1;
  for (const control of screenData.controls || []) {
    fields.push(controlToField(control, order, `screens/${section}`));
    order += 1;
  }
  return {
    sectionId: section,
    desktopScreen,
    captureRef: `raw-desktop/screens/${screenKey}`,
    mappingStatus: "unmapped",
    fields,
    inaccessibleControls: screenData.inaccessibleControls || [],
    metadata: {
      capturedAt: screenData.capturedAt || null,
      recorderVersion: screenData.recorderVersion || null,
      hot2000Version: screenData.hot2000Version || null,
    },
  };
}

/**
 * Normalize raw desktop capture payload (navigation + screen files) to capture format.
 */
export function normalizeRawDesktopCapture(raw) {
  const hot2000Version =
    raw.hot2000Version || raw.manifest?.hot2000Version || "11.13";
  const scanId = raw.scanId || raw.navigation?.scanId || null;
  const screens = [];
  const screenEntries = raw.screens || raw.screenFiles || [];

  if (Array.isArray(screenEntries)) {
    for (const entry of screenEntries) {
      if (typeof entry === "string") continue;
      if (entry.sectionId || entry.fields) {
        screens.push(entry);
        continue;
      }
      const key = entry.key || entry.screenKey || entry.section || "screen";
      screens.push(screenCaptureToNormalized(entry, key));
    }
  } else if (screenEntries && typeof screenEntries === "object") {
    for (const [key, value] of Object.entries(screenEntries)) {
      if (value.controls) {
        screens.push(screenCaptureToNormalized(value, key));
      }
    }
  }

  const manifest = {
    hot2000Version,
    schemaVersion: SCHEMA_VERSION,
    normalizerVersion: NORMALIZER_VERSION,
    scanId,
    capturedAt: raw.capturedAt || raw.lastCapturedAt || raw.navigation?.updatedAt || null,
    capturedBy: raw.worker || raw.navigation?.recorderVersion || null,
    notes:
      "Normalized from raw desktop evidence. Fields remain unmapped until Phase 3 differential probing.",
    screensDir: "screens",
    mappingPolicy: "no-guessed-xml-paths",
    options: [],
    coverage: raw.coverage || raw.coverageReport || null,
  };

  return { manifest, screens };
}

function loadRawDesktopDir(rawDir) {
  const manifestPath = join(rawDir, "manifest.json");
  const navigationPath = join(rawDir, "navigation.json");
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : {};
  const navigation = existsSync(navigationPath) ? readJson(navigationPath) : {};
  const coveragePath = join(rawDir, "coverage-report.json");
  const coverage = existsSync(coveragePath) ? readJson(coveragePath) : null;

  const screenFiles = [];
  const screensDir = join(rawDir, "screens");
  if (existsSync(screensDir)) {
    for (const file of readdirSync(screensDir).filter((f) => f.endsWith(".json"))) {
      const data = readJson(join(screensDir, file));
      screenFiles.push({ key: file.replace(/\.json$/, ""), ...data });
    }
  } else {
    for (const file of readdirSync(rawDir).filter(
      (f) => f.endsWith(".json") && !["manifest.json", "navigation.json", "scan-state.json", "coverage.json", "coverage-report.json"].includes(f),
    )) {
      const data = readJson(join(rawDir, file));
      if (data.controls) {
        screenFiles.push({ key: file.replace(/\.json$/, ""), ...data });
      }
    }
  }

  return normalizeRawDesktopCapture({
    ...manifest,
    navigation,
    coverage,
    screenFiles,
    scanId: navigation.scanId || manifest.scanId,
    hot2000Version: manifest.hot2000Version || navigation.hot2000Version,
  });
}

function writeNormalizedCapture(outputRoot, normalized) {
  const screenDir = join(outputRoot, "screens");
  mkdirSync(screenDir, { recursive: true });
  writeJson(join(outputRoot, "manifest.json"), normalized.manifest);
  for (const screen of normalized.screens) {
    const fileName = `${screen.sectionId}.json`;
    writeJson(join(screenDir, fileName), screen);
  }
  return { manifestPath: join(outputRoot, "manifest.json"), screenCount: normalized.screens.length };
}

function main() {
  const args = process.argv.slice(2);
  let normalized;
  let outputRoot = defaultCaptureRoot;

  if (args.includes("--stdin")) {
    const raw = JSON.parse(readFileSync(0, "utf8"));
    normalized = normalizeRawDesktopCapture(raw);
  } else {
    const rawDir = args[0];
    if (!rawDir) {
      console.error("Usage: node normalize-desktop-capture.mjs <raw-desktop-dir>");
      process.exit(1);
    }
    normalized = loadRawDesktopDir(rawDir);
    const outIdx = args.indexOf("--out");
    if (outIdx >= 0 && args[outIdx + 1]) {
      outputRoot = args[outIdx + 1];
    }
  }

  const result = writeNormalizedCapture(outputRoot, normalized);
  console.log(
    `normalize-desktop-capture: wrote ${result.screenCount} screen(s) to ${outputRoot}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
