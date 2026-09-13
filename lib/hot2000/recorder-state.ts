/** Persistent catalog recorder snapshot stored in HOT2000_JOB_QUEUE (not full capture JSON). */

export type ProbeMappingEntry = {
  controlId: string;
  screenKey?: string;
  label?: string;
  fixtureId?: string;
  mapping?: {
    path?: string;
    type?: string;
    confidence?: string;
  };
  evidence?: Record<string, unknown>;
  status?: string;
  sideEffects?: Array<Record<string, unknown>>;
  timestamp?: string;
};

export type Hot2000RecorderState = {
  updatedAt: string;
  latestCaptureJobId?: string;
  latestNavigationJobId?: string;
  latestProbeJobId?: string;
  /** Section key → job id for section captures (full JSON lives on the job record). */
  sectionCaptureJobIds?: Record<string, string>;
  rawManifest?: Record<string, unknown> | null;
  navigation?: Record<string, unknown> | null;
  coverage?: Record<string, unknown> | null;
  probeMappings?: Record<string, { mappings?: ProbeMappingEntry[] }>;
  probeConflicts?: unknown[] | null;
  captureVersion?: string | null;
  generatedCatalogVersion?: string;
};

export const GENERATED_CATALOG_VERSION = "2.0.0";

export function emptyRecorderState(): Hot2000RecorderState {
  return {
    updatedAt: new Date(0).toISOString(),
    rawManifest: null,
    navigation: null,
    coverage: null,
    probeMappings: {},
    probeConflicts: null,
    captureVersion: null,
    generatedCatalogVersion: GENERATED_CATALOG_VERSION,
    sectionCaptureJobIds: {},
  };
}
