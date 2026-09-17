import { reportPdfFilenameFromExportName } from "@/lib/hot2000/export-filename";
import { CATALOG_RECORDER_JOB_KINDS } from "@/lib/hot2000/catalog-recorder";
import type { CatalogBlobRef } from "@/lib/hot2000/catalog-blob";

export const HOT2000_NORMAL_JOB_KINDS = ["calculate", "full_house_report"] as const;

export type Hot2000NormalJobKind = (typeof HOT2000_NORMAL_JOB_KINDS)[number];

export const HOT2000_JOB_KINDS = [
  ...HOT2000_NORMAL_JOB_KINDS,
  ...CATALOG_RECORDER_JOB_KINDS,
] as const;

export type Hot2000JobKind = (typeof HOT2000_JOB_KINDS)[number];

export const HOT2000_JOB_STAGES = [
  "queued",
  "claimed",
  "starting",
  "opening",
  "scanning",
  "capturing",
  "enumerating",
  "probing",
  "diffing",
  "calculating",
  "saving",
  "reporting",
  "printing",
  "closing",
  "extracting",
  "complete",
  "failed",
] as const;

export type Hot2000JobStage = (typeof HOT2000_JOB_STAGES)[number];

export type Hot2000JobStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "cancelled";

export type Hot2000JobRecord = {
  id: string;
  kind: Hot2000JobKind;
  status: Hot2000JobStatus;
  stage: Hot2000JobStage;
  progress: number;
  message: string;
  error?: string;
  modelRevision?: number;
  editorRevision?: number;
  sourceHash: string;
  inputXml: string;
  exportFilename?: string;
  inputFilename?: string;
  netGJa?: number;
  reportPdfBase64?: string;
  catalogCaptureJson?: string;
  catalogCaptureRef?: CatalogBlobRef;
  catalogCaptureMeta?: CatalogCaptureMeta;
  catalogScanControl?: CatalogScanControl;
  catalogScanStateJson?: string;
  catalogScanStateRef?: CatalogBlobRef;
  catalogAction?: string;
  parentJobId?: string;
  continuationOf?: string;
  workerId?: string;
  failedFromStage?: Hot2000JobStage;
  claimedAt?: string;
  leaseExpiresAt?: string;
  hot2000Progress?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type CatalogScanControl = "running" | "paused" | "stopped";

export type CatalogCaptureMeta = {
  captureVersion?: string;
  recorderVersion?: string;
  hot2000Version?: string;
  workerId?: string;
  windowTitle?: string;
  section?: string;
  sectionId?: string;
  sectionLabel?: string;
  scanMode?: string;
  lineageId?: string;
  workerBuild?: string;
  windowsDiscovered?: number;
  controlsDiscovered?: number;
  textFields?: number;
  numericFields?: number;
  checkboxes?: number;
  radioButtons?: number;
  comboBoxes?: number;
  dropdownOptions?: number;
  inaccessibleControls?: number;
  ambiguousControls?: number;
  capturedAt?: string;
  warnings?: string[];
  scanId?: string;
  scanStatus?: string;
  resultClassification?: string;
  lastScreen?: string;
  lastWindow?: string;
  lastAction?: string;
  screenKey?: string;
  screensDiscovered?: number;
  screensCaptured?: number;
  screensPartial?: number;
  navigationFailures?: number;
  blockedUnsafeActions?: number;
  loopsPrevented?: number;
  completionPercentage?: number;
  currentAction?: string;
  hot2000Pid?: number;
  statesDiscovered?: number;
  statesCompleted?: number;
  actionsDiscovered?: number;
  actionsCompleted?: number;
  actionsPending?: number;
  tabsVisited?: number;
  combosOpened?: number;
  comboOptionsSeen?: number;
  comboOptionsCaptured?: number;
  checkboxBranchesExplored?: number;
  radioChoicesExplored?: number;
  dialogsVisited?: number;
  scrollRegionsCompleted?: number;
  elapsedSeconds?: number;
  probeStatus?: string;
  fixtureId?: string;
  controlsMapped?: number;
  exactMappings?: number;
  highMappings?: number;
  mediumMappings?: number;
  ambiguousMappings?: number;
  skippedUnsafe?: number;
  dropdownOptionsMapped?: number;
  currentProbeControl?: string;
  currentProbeValue?: string;
  probeConfidence?: string;
  liveExecutionState?: Record<string, unknown>;
  liveEventFeed?: Array<Record<string, unknown>>;
  tabBreadcrumb?: string[];
  currentControl?: string;
  currentOption?: string;
  optionIndex?: number;
  optionCount?: number;
  branchDisplay?: string;
  textFieldsDiscovered?: number;
  textFieldsVisited?: number;
  tabsDiscovered?: number;
  combosDiscovered?: number;
  comboOptionsDiscovered?: number;
  comboOptionsTested?: number;
  checkboxBranchesDiscovered?: number;
  checkboxBranchesCompleted?: number;
  radioChoicesDiscovered?: number;
  radioChoicesCompleted?: number;
  buttonsDiscovered?: number;
  buttonsVisited?: number;
  dialogsDiscovered?: number;
  crawlStarted?: boolean;
  lastUiChangeAt?: string;
};

export type Hot2000WorkerHeartbeat = {
  workerId: string;
  buildId?: string;
  lastSeen: string;
};

export type Hot2000QueueStatus = {
  workersOnline: number;
  workers: Hot2000WorkerHeartbeat[];
  queuedJobs: number;
  runningJobs: number;
};

export type Hot2000JobPublic = {
  job_id: string;
  kind?: Hot2000JobKind;
  status: Hot2000JobStatus;
  stage: Hot2000JobStage;
  progress: number;
  message?: string;
  error?: string;
  export_filename?: string;
  input_filename?: string;
  report_pdf_filename?: string;
  net_gja?: number;
  report_pdf_base64?: string;
  report_pdf_ready?: boolean;
  model_revision?: number;
  editor_revision?: number;
  catalog_capture_meta?: CatalogCaptureMeta;
  catalog_scan_control?: CatalogScanControl;
  catalog_action?: string;
  worker_id?: string;
  failed_from_stage?: Hot2000JobStage;
};

export function jobFailureMessage(kind: Hot2000JobKind = "calculate"): string {
  switch (kind) {
    case "catalog_capture":
      return "Automatic catalog scan failed";
    case "catalog_capture_section":
      return "Section catalog crawl failed";
    case "catalog_capture_screen":
      return "Screen capture failed";
    case "catalog_resume":
      return "Catalog scan resume failed";
    case "catalog_probe":
      return "Catalog probe failed";
    case "catalog_retry_inaccessible":
      return "Catalog retry failed";
    case "full_house_report":
      return "Full House Report failed";
    case "calculate":
    default:
      return "Calculation failed";
  }
}

export const STAGE_MESSAGES: Record<Hot2000JobStage, string> = {
  queued: "Waiting for an available HOT2000 worker…",
  claimed: "HOT2000 worker assigned…",
  starting: "Starting HOT2000 Desktop…",
  opening: "Opening H2K model…",
  scanning: "Scanning HOT2000 Desktop UI…",
  capturing: "Capturing controls…",
  enumerating: "Enumerating dropdown options…",
  probing: "Probing HOT2000 control mapping…",
  diffing: "Comparing H2K XML changes…",
  calculating: "HOT2000 Desktop is calculating…",
  saving: "Saving calculated H2K…",
  reporting: "Opening Full house report…",
  printing: "Exporting Full House Report to PDF…",
  closing: "Closing HOT2000…",
  extracting: "Preparing PDF download…",
  complete: "Calculation complete",
  failed: "Calculation failed",
};

const STAGE_BASE_PROGRESS: Record<Hot2000JobStage, number> = {
  queued: 20,
  claimed: 30,
  starting: 35,
  opening: 40,
  scanning: 45,
  capturing: 55,
  enumerating: 65,
  probing: 55,
  diffing: 70,
  calculating: 40,
  saving: 80,
  reporting: 85,
  printing: 90,
  closing: 92,
  extracting: 95,
  complete: 100,
  failed: 0,
};

/** Map backend stage (+ optional HOT2000 0–100 progress) to overall 0–100 progress. */
export function computeJobProgress(
  stage: Hot2000JobStage,
  hot2000Progress?: number,
): number {
  if (stage === "complete") return 100;
  if (stage === "failed") return 0;
  if (stage === "calculating" && hot2000Progress != null) {
    const clamped = Math.max(0, Math.min(100, hot2000Progress));
    return Math.round(40 + clamped * 0.4);
  }
  return STAGE_BASE_PROGRESS[stage] ?? 0;
}

export function toPublicJob(job: Hot2000JobRecord): Hot2000JobPublic {
  const payload: Hot2000JobPublic = {
    job_id: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
  };
  if (job.message) payload.message = job.message;
  if (job.error) payload.error = job.error;
  if (job.exportFilename?.trim()) {
    payload.export_filename = job.exportFilename.trim();
  }
  if (job.inputFilename?.trim()) {
    payload.input_filename = job.inputFilename.trim();
  }
  if (job.netGJa != null) payload.net_gja = job.netGJa;
  if (job.modelRevision != null) payload.model_revision = job.modelRevision;
  if (job.editorRevision != null) payload.editor_revision = job.editorRevision;
  if (job.catalogCaptureMeta) {
    payload.catalog_capture_meta = job.catalogCaptureMeta;
  }
  if (job.catalogAction) payload.catalog_action = job.catalogAction;
  if (job.catalogScanControl) payload.catalog_scan_control = job.catalogScanControl;
  if (job.workerId) payload.worker_id = job.workerId;
  if (job.failedFromStage) payload.failed_from_stage = job.failedFromStage;
  if (job.reportPdfBase64?.trim()) {
    payload.report_pdf_ready = true;
    payload.report_pdf_filename = reportPdfFilenameFromExportName(
      job.exportFilename,
      job.id,
    );
    // Omit multi-megabyte base64 from poll JSON; clients download via /report.pdf.
  }
  return payload;
}
