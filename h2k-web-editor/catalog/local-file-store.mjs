/**
 * Node-only filesystem persistence for catalog recorder artifacts.
 * Used by local CLI / CI workflows — never import from Next.js API routes.
 */
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_ROOT = path.join(__dirname);
const RAW_DESKTOP_ROOT = path.join(CATALOG_ROOT, "raw-desktop");
const MAPPINGS_DIR = path.join(CATALOG_ROOT, "mappings");
const EVIDENCE_DIR = path.join(CATALOG_ROOT, "probe-evidence");

export function rawDesktopRoot() {
  return RAW_DESKTOP_ROOT;
}

export async function ensureRawDesktopDir() {
  await mkdir(RAW_DESKTOP_ROOT, { recursive: true });
  await mkdir(path.join(RAW_DESKTOP_ROOT, "dialogs"), { recursive: true });
  return RAW_DESKTOP_ROOT;
}

export async function persistCatalogCapture(captureJson, meta = {}) {
  await ensureRawDesktopDir();
  const parsed = JSON.parse(captureJson);
  const section =
    meta.section ||
    (typeof parsed.section === "string" ? parsed.section : "unknown");
  const capturedAt = meta.capturedAt || new Date().toISOString();

  const manifestPath = path.join(RAW_DESKTOP_ROOT, "manifest.json");
  let manifest = {
    captureVersion: "1.0.0",
    recorderVersion: "2026.09.12.1",
    hot2000Version: meta.hot2000Version || parsed.hot2000Version || null,
    lastCapturedAt: capturedAt,
    worker: meta.workerId || parsed.worker || null,
    sections: {},
  };
  try {
    const existing = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest = { ...existing, ...manifest };
  } catch {
    // fresh manifest
  }

  const sections = manifest.sections ?? {};
  sections[section] = {
    file: section === "windows" ? "windows.json" : `${section}.json`,
    capturedAt,
    controls:
      Array.isArray(parsed.controls) ? parsed.controls.length : undefined,
  };
  manifest.sections = sections;
  manifest.lastCapturedAt = capturedAt;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const sectionFile =
    section === "windows" ? "windows.json" : `${section}.json`;
  const sectionPath = path.join(RAW_DESKTOP_ROOT, sectionFile);
  await writeFile(sectionPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  if (
    Array.isArray(parsed.inaccessibleControls) &&
    parsed.inaccessibleControls.length
  ) {
    const inaccessiblePath = path.join(
      RAW_DESKTOP_ROOT,
      "inaccessible-controls.json",
    );
    let inaccessible = [];
    try {
      const existing = JSON.parse(await readFile(inaccessiblePath, "utf8"));
      inaccessible = Array.isArray(existing) ? existing : [];
    } catch {
      // fresh
    }
    inaccessible.push(...parsed.inaccessibleControls);
    await writeFile(
      inaccessiblePath,
      `${JSON.stringify(inaccessible, null, 2)}\n`,
      "utf8",
    );
  }

  return { manifestPath, sectionPath };
}

export async function ensureProbeDirs() {
  await mkdir(MAPPINGS_DIR, { recursive: true });
  await mkdir(EVIDENCE_DIR, { recursive: true });
}

function sectionFileName(section) {
  const map = {
    general: "general.json",
    weather: "weather.json",
    specifications: "specifications.json",
    ventilation: "ventilation.json",
    "heating-cooling": "heating-cooling.json",
    "domestic-hot-water": "domestic-hot-water.json",
    program: "program.json",
    "envelope-components": "envelope-components.json",
  };
  return map[section] || `${section}.json`;
}

function inferSectionFromPath(xpath) {
  if (!xpath) return null;
  if (xpath.includes("/Weather/")) return "weather";
  if (xpath.includes("/Ventilation/")) return "ventilation";
  if (xpath.includes("/HeatingCooling/")) return "heating-cooling";
  if (xpath.includes("/HotWater/")) return "domestic-hot-water";
  if (xpath.includes("/Components/")) return "envelope-components";
  if (xpath.includes("/ProgramInformation/")) return "general";
  return null;
}

function mergeMappings(existing, incoming) {
  const byId = new Map(existing.map((entry) => [entry.controlId, entry]));
  for (const entry of incoming) {
    byId.set(entry.controlId, entry);
  }
  return Array.from(byId.values());
}

export async function readProbeConflicts() {
  try {
    const raw = await readFile(path.join(MAPPINGS_DIR, "conflicts.json"), "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    return data.conflicts ?? [];
  } catch {
    return null;
  }
}

export async function persistProbeResults(probeJson, meta = {}) {
  await ensureProbeDirs();
  const parsed = JSON.parse(probeJson);

  if (Array.isArray(parsed.completed)) {
    const bySection = {};
    for (const entry of parsed.completed) {
      const section = inferSectionFromPath(entry.mapping?.path) || "general";
      bySection[section] = bySection[section] || [];
      bySection[section].push({
        ...entry,
        timestamp: entry.timestamp || new Date().toISOString(),
        fixtureId: entry.fixtureId || meta.fixtureId,
      });
    }
    for (const [section, entries] of Object.entries(bySection)) {
      const file = sectionFileName(section);
      let existing = [];
      try {
        const prior = JSON.parse(
          await readFile(path.join(MAPPINGS_DIR, file), "utf8"),
        );
        existing = prior.mappings ?? [];
      } catch {
        // fresh
      }
      const merged = mergeMappings(existing, entries);
      await writeFile(
        path.join(MAPPINGS_DIR, file),
        `${JSON.stringify(
          {
            section,
            probeVersion: parsed.probeVersion || "1.0.0",
            hot2000Version: meta.hot2000Version,
            updatedAt: new Date().toISOString(),
            mappings: merged,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    }
  }

  if (Array.isArray(parsed.conflicts) && parsed.conflicts.length) {
    const prior = (await readProbeConflicts()) ?? [];
    await writeFile(
      path.join(MAPPINGS_DIR, "conflicts.json"),
      `${JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          conflicts: [...prior, ...parsed.conflicts],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  const summaryPath = path.join(MAPPINGS_DIR, "probe-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        ...parsed,
        persistedAt: new Date().toISOString(),
        worker: meta.workerId,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { mappingsDir: MAPPINGS_DIR, evidenceDir: EVIDENCE_DIR };
}
