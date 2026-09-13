import {
  JOB_LEASE_MS,
  WORKER_HEARTBEAT_TTL_MS,
} from "@/lib/hot2000/constants";
import { isCatalogJobKind } from "@/lib/hot2000/catalog-recorder";
import {
  type CatalogCaptureMeta,
  type Hot2000JobRecord,
  type Hot2000JobStage,
  computeJobProgress,
  jobFailureMessage,
  STAGE_MESSAGES,
} from "@/lib/hot2000/types";

export function nowIso(): string {
  return new Date().toISOString();
}

function requeueRunningJob(job: Hot2000JobRecord): void {
  job.status = "queued";
  job.stage = "queued";
  job.progress = computeJobProgress("queued");
  job.message = STAGE_MESSAGES.queued;
  job.workerId = undefined;
  job.claimedAt = undefined;
  job.leaseExpiresAt = undefined;
  job.hot2000Progress = undefined;
  job.updatedAt = nowIso();
}

export function maybeRequeueExpired(job: Hot2000JobRecord): boolean {
  if (job.status !== "running" || !job.leaseExpiresAt) return false;
  if (Date.parse(job.leaseExpiresAt) > Date.now()) return false;
  requeueRunningJob(job);
  return true;
}

/** Requeue when the assigned worker has no recent heartbeat (crashed or stopped). */
/** Stale-job grace while a worker is in a long-running UI stage without heartbeats. */
const STAGE_ACTIVITY_GRACE_MS: Partial<Record<Hot2000JobStage, number>> = {
  printing: 6 * 60 * 1000,
  calculating: 3 * 60 * 1000,
  reporting: 3 * 60 * 1000,
  scanning: 5 * 60 * 1000,
  capturing: 5 * 60 * 1000,
  enumerating: 5 * 60 * 1000,
};

export function maybeRequeueOrphaned(
  job: Hot2000JobRecord,
  activeWorkerIds: ReadonlySet<string>,
): boolean {
  if (job.status !== "running" || !job.workerId) return false;
  if (activeWorkerIds.has(job.workerId)) return false;
  const lastActivityMs = Date.parse(job.updatedAt || job.claimedAt || "");
  const graceMs =
    STAGE_ACTIVITY_GRACE_MS[job.stage] ?? WORKER_HEARTBEAT_TTL_MS;
  if (
    Number.isFinite(lastActivityMs) &&
    Date.now() - lastActivityMs < graceMs
  ) {
    // Allow claim → input download and workers without heartbeats while active.
    return false;
  }
  requeueRunningJob(job);
  return true;
}

export function assertWorkerOwnsJob(
  job: Hot2000JobRecord,
  workerId: string,
): void {
  if (job.workerId !== workerId) {
    throw new Error("Job is not assigned to this worker.");
  }
}

export function applyJobProgress(
  job: Hot2000JobRecord,
  workerId: string,
  stage: Hot2000JobStage,
  options: {
    hot2000Progress?: number;
    message?: string;
    catalogCaptureMeta?: CatalogCaptureMeta;
    catalogScanStateJson?: string;
  } = {},
): Hot2000JobRecord {
  if (
    job.status === "complete" ||
    job.status === "failed" ||
    job.status === "cancelled"
  ) {
    return job;
  }
  assertWorkerOwnsJob(job, workerId);

  job.stage = stage;
  job.status = stage === "failed" ? "failed" : "running";
  job.hot2000Progress = options.hot2000Progress;
  job.progress = computeJobProgress(stage, options.hot2000Progress);
  job.message = options.message?.trim() || STAGE_MESSAGES[stage] || job.message;
  if (options.catalogCaptureMeta) {
    job.catalogCaptureMeta = {
      ...(job.catalogCaptureMeta ?? {}),
      ...options.catalogCaptureMeta,
    };
  }
  if (options.catalogScanStateJson?.trim()) {
    job.catalogScanStateJson = options.catalogScanStateJson.trim();
  }
  job.leaseExpiresAt = new Date(Date.now() + JOB_LEASE_MS).toISOString();
  job.updatedAt = nowIso();
  return job;
}

export function applyJobComplete(
  job: Hot2000JobRecord,
  workerId: string,
  netGJa: number,
  options: {
    reportPdfBase64?: string;
    catalogCaptureJson?: string;
    catalogCaptureMeta?: CatalogCaptureMeta;
  } = {},
): Hot2000JobRecord {
  assertWorkerOwnsJob(job, workerId);

  if (isCatalogJobKind(job.kind)) {
    const allowedCatalogStages: Hot2000JobStage[] = [
      "opening",
      "scanning",
      "capturing",
      "enumerating",
      "closing",
      "extracting",
    ];
    if (!allowedCatalogStages.includes(job.stage)) {
      throw new Error(
        "Catalog capture job cannot complete before capture results are saved.",
      );
    }
    if (!options.catalogCaptureJson?.trim()) {
      throw new Error(
        "Catalog capture jobs must include catalog_capture_json from the worker.",
      );
    }
    const scanStatus = options.catalogCaptureMeta?.scanStatus?.trim();
    const resultClassification =
      options.catalogCaptureMeta?.resultClassification?.trim() || scanStatus;
    job.status = "complete";
    job.stage = "complete";
    job.progress = 100;
    if (resultClassification === "complete_with_gaps") {
      job.message = "Catalog scan complete with coverage gaps";
    } else if (resultClassification === "partial" || resultClassification === "stopped_partial") {
      job.message = "Catalog scan ended before full coverage";
    } else if (resultClassification === "paused") {
      job.message = "Catalog scan paused";
    } else {
      job.message = "Catalog scan complete";
    }
    job.catalogCaptureJson = options.catalogCaptureJson.trim();
    job.catalogScanControl = "stopped";
    if (options.catalogCaptureMeta) {
      job.catalogCaptureMeta = options.catalogCaptureMeta;
    }
    job.completedAt = nowIso();
    job.updatedAt = job.completedAt;
    job.leaseExpiresAt = undefined;
    job.hot2000Progress = 100;
    return job;
  }

  const allowedStages: Hot2000JobStage[] =
    job.kind === "full_house_report"
      ? ["opening", "reporting", "printing", "closing", "extracting"]
      : ["saving", "closing", "extracting"];
  if (!allowedStages.includes(job.stage)) {
    throw new Error(
      job.kind === "full_house_report"
        ? "Job cannot complete before the Full House Report PDF is saved."
        : "Job cannot complete before calculated H2K is saved and parsed.",
    );
  }

  if (job.kind === "full_house_report" && !options.reportPdfBase64?.trim()) {
    throw new Error(
      "Full house report jobs must include report_pdf_base64 from HOT2000 Desktop.",
    );
  }

  job.status = "complete";
  job.stage = "complete";
  job.progress = 100;
  job.message =
    job.kind === "full_house_report"
      ? "Full House Report PDF ready"
      : STAGE_MESSAGES.complete;
  job.netGJa = netGJa;
  if (options.reportPdfBase64?.trim()) {
    job.reportPdfBase64 = options.reportPdfBase64.trim();
  }
  job.completedAt = nowIso();
  job.updatedAt = job.completedAt;
  job.leaseExpiresAt = undefined;
  job.hot2000Progress = 100;
  return job;
}

export function applyJobFail(
  job: Hot2000JobRecord,
  workerId: string,
  error: string,
): Hot2000JobRecord {
  if (job.status === "complete") return job;
  if (job.workerId && job.workerId !== workerId) {
    throw new Error("Job is not assigned to this worker.");
  }

  if (job.stage !== "failed") {
    job.failedFromStage = job.stage;
  }
  job.status = "failed";
  job.stage = "failed";
  job.progress = 0;
  job.message = jobFailureMessage(job.kind);
  job.error = error;
  job.updatedAt = nowIso();
  job.leaseExpiresAt = undefined;
  return job;
}
