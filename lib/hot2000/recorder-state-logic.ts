import {
  buildCoverageSummary,
  buildNavigationSummary,
  type CatalogBlobRef,
} from "./catalog-blob";
import {
  emptyRecorderState,
  type Hot2000RecorderState,
  type ProbeMappingEntry,
} from "./recorder-state";
import {
  emptySectionCoverage,
  getPhase2Section,
  type SectionCoverageStatus,
} from "./phase2-sections";
import type { CatalogCaptureMeta } from "./types";

type CaptureMeta = Pick<
  CatalogCaptureMeta,
  | "section"
  | "sectionId"
  | "sectionLabel"
  | "hot2000Version"
  | "workerId"
  | "capturedAt"
  | "fixtureId"
  | "resultClassification"
  | "scanStatus"
>;

function sectionFileName(section: string): string {
  const map: Record<string, string> = {
    general: "general",
    weather: "weather",
    specifications: "specifications",
    ventilation: "ventilation",
    "heating-cooling": "heating-cooling",
    "domestic-hot-water": "domestic-hot-water",
    program: "program",
    "envelope-components": "envelope-components",
  };
  return map[section] || section;
}

function inferSectionFromPath(xpath?: string): string | null {
  if (!xpath) return null;
  if (xpath.includes("/Weather/")) return "weather";
  if (xpath.includes("/Ventilation/")) return "ventilation";
  if (xpath.includes("/HeatingCooling/")) return "heating-cooling";
  if (xpath.includes("/HotWater/")) return "domestic-hot-water";
  if (xpath.includes("/Components/")) return "envelope-components";
  if (xpath.includes("/ProgramInformation/")) return "general";
  return null;
}

function mergeMappings(
  existing: ProbeMappingEntry[],
  incoming: ProbeMappingEntry[],
): ProbeMappingEntry[] {
  const byId = new Map(existing.map((entry) => [entry.controlId, entry]));
  for (const entry of incoming) {
    byId.set(entry.controlId, entry);
  }
  return Array.from(byId.values());
}

function applyProbeCapture(
  state: Hot2000RecorderState,
  parsed: Record<string, unknown>,
  meta: CaptureMeta,
  jobId: string,
  updatedAt: string,
): Hot2000RecorderState {
  const completed = Array.isArray(parsed.completed)
    ? (parsed.completed as ProbeMappingEntry[])
    : [];
  const probeMappings = { ...(state.probeMappings ?? {}) };

  if (completed.length) {
    const bySection: Record<string, ProbeMappingEntry[]> = {};
    for (const entry of completed) {
      const section = inferSectionFromPath(entry.mapping?.path) || "general";
      bySection[section] = bySection[section] || [];
      bySection[section].push({
        ...entry,
        timestamp: entry.timestamp || updatedAt,
        fixtureId: entry.fixtureId || meta.fixtureId,
      });
    }
    for (const [section, entries] of Object.entries(bySection)) {
      const key = sectionFileName(section);
      const prior = probeMappings[key]?.mappings ?? [];
      probeMappings[key] = {
        mappings: mergeMappings(prior, entries),
      };
    }
  }

  const incomingConflicts = Array.isArray(parsed.conflicts)
    ? parsed.conflicts
    : [];
  const probeConflicts = [
    ...(state.probeConflicts ?? []),
    ...incomingConflicts,
  ];

  return {
    ...state,
    updatedAt,
    latestCaptureJobId: jobId,
    latestProbeJobId: jobId,
    probeMappings,
    probeConflicts: probeConflicts.length ? probeConflicts : state.probeConflicts,
    captureVersion:
      typeof parsed.probeVersion === "string"
        ? parsed.probeVersion
        : state.captureVersion,
  };
}

function applyNavigationCapture(
  state: Hot2000RecorderState,
  parsed: Record<string, unknown>,
  jobId: string,
  updatedAt: string,
  navigationRef?: CatalogBlobRef,
): Hot2000RecorderState {
  const coverage =
    parsed.coverage && typeof parsed.coverage === "object"
      ? buildCoverageSummary(parsed.coverage as Record<string, unknown>)
      : state.coverage;
  return {
    ...state,
    updatedAt,
    latestCaptureJobId: jobId,
    latestNavigationJobId: jobId,
    navigation: null,
    navigationRef: navigationRef ?? state.navigationRef ?? null,
    navigationSummary: buildNavigationSummary(parsed),
    coverage,
    captureVersion:
      typeof parsed.recorderVersion === "string"
        ? parsed.recorderVersion
        : typeof parsed.captureVersion === "string"
          ? parsed.captureVersion
          : state.captureVersion,
  };
}

function resolveSectionCoverageStatus(
  meta: CaptureMeta,
  parsed: Record<string, unknown>,
): SectionCoverageStatus {
  const raw =
    meta.resultClassification ||
    meta.scanStatus ||
    (typeof parsed.status === "string" ? parsed.status : undefined) ||
    (typeof parsed.resultClassification === "string"
      ? parsed.resultClassification
      : undefined);
  switch (raw) {
    case "complete":
      return "complete";
    case "complete_with_gaps":
      return "complete_with_gaps";
    case "partial":
    case "stopped-partial":
    case "stopped_partial":
      return "partial";
    case "failed":
      return "failed";
    case "paused":
      return "paused";
    case "running":
      return "running";
    default:
      return "partial";
  }
}

function applySectionCapture(
  state: Hot2000RecorderState,
  parsed: Record<string, unknown>,
  meta: CaptureMeta,
  jobId: string,
  updatedAt: string,
): Hot2000RecorderState {
  const section =
    meta.sectionId ||
    meta.section ||
    (typeof parsed.sectionId === "string" ? parsed.sectionId : undefined) ||
    (typeof parsed.section === "string" ? parsed.section : "unknown");
  const sectionLabel =
    meta.sectionLabel ||
    (typeof parsed.sectionLabel === "string" ? parsed.sectionLabel : undefined) ||
    getPhase2Section(section)?.label ||
    section;
  const capturedAt = meta.capturedAt || updatedAt;
  const manifest: Record<string, unknown> = {
    ...(state.rawManifest ?? {
      captureVersion: "1.0.0",
      recorderVersion: "2026.09.14.1",
      sections: {},
    }),
    hot2000Version:
      meta.hot2000Version ||
      (typeof parsed.hot2000Version === "string" ? parsed.hot2000Version : null),
    lastCapturedAt: capturedAt,
    worker: meta.workerId || parsed.worker || null,
  };

  const sections =
    (manifest.sections as Record<string, unknown> | undefined) ?? {};
  sections[section] = {
    jobId,
    capturedAt,
    controls:
      Array.isArray(parsed.controls) ? parsed.controls.length : undefined,
  };
  manifest.sections = sections;
  manifest.lastCapturedAt = capturedAt;

  const sectionCaptureJobIds = {
    ...(state.sectionCaptureJobIds ?? {}),
    [section]: jobId,
  };

  const sectionCoverage = {
    ...emptySectionCoverage(),
    ...(state.sectionCoverage ?? {}),
  };
  const coverageStatus = resolveSectionCoverageStatus(meta, parsed);
  sectionCoverage[section] = {
    sectionId: section,
    sectionLabel,
    status: coverageStatus,
    jobId,
    updatedAt: capturedAt,
    resultClassification:
      meta.resultClassification ||
      (typeof parsed.resultClassification === "string"
        ? parsed.resultClassification
        : coverageStatus),
  };

  return {
    ...state,
    updatedAt,
    latestCaptureJobId: jobId,
    rawManifest: manifest,
    sectionCaptureJobIds,
    sectionCoverage,
    captureVersion:
      typeof manifest.captureVersion === "string"
        ? manifest.captureVersion
        : state.captureVersion ?? "1.0.0",
  };
}

/** Apply a completed catalog capture payload to recorder snapshot state (no filesystem). */
export function applyCaptureToRecorderState(
  current: Hot2000RecorderState | null | undefined,
  captureJson: string,
  meta: CaptureMeta = {},
  jobId: string,
  navigationRef?: CatalogBlobRef,
): Hot2000RecorderState {
  const state = current ? { ...current } : emptyRecorderState();
  const updatedAt = new Date().toISOString();
  const parsed = JSON.parse(captureJson) as Record<string, unknown>;

  if (parsed.coverage && typeof parsed.coverage === "object") {
    state.coverage = buildCoverageSummary(
      parsed.coverage as Record<string, unknown>,
    );
  }

  if (parsed.probeVersion || parsed.probeId) {
    return applyProbeCapture(state, parsed, meta, jobId, updatedAt);
  }

  if (parsed.screens) {
    return applyNavigationCapture(
      state,
      parsed,
      jobId,
      updatedAt,
      navigationRef,
    );
  }

  return applySectionCapture(state, parsed, meta, jobId, updatedAt);
}
