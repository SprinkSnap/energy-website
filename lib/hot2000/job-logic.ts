import {
  JOB_LEASE_MS,
  WORKER_HEARTBEAT_TTL_MS,
} from "@/lib/hot2000/constants";
import {
  type Hot2000JobRecord,
  type Hot2000JobStage,
  computeJobProgress,
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
export function maybeRequeueOrphaned(
  job: Hot2000JobRecord,
  activeWorkerIds: ReadonlySet<string>,
): boolean {
  if (job.status !== "running" || !job.workerId) return false;
  if (activeWorkerIds.has(job.workerId)) return false;
  const lastActivityMs = Date.parse(job.updatedAt || job.claimedAt || "");
  if (
    Number.isFinite(lastActivityMs) &&
    Date.now() - lastActivityMs < WORKER_HEARTBEAT_TTL_MS
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
  options: { hot2000Progress?: number; message?: string } = {},
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
  job.leaseExpiresAt = new Date(Date.now() + JOB_LEASE_MS).toISOString();
  job.updatedAt = nowIso();
  return job;
}

export function applyJobComplete(
  job: Hot2000JobRecord,
  workerId: string,
  netGJa: number,
): Hot2000JobRecord {
  assertWorkerOwnsJob(job, workerId);

  const allowedStages: Hot2000JobStage[] = ["saving", "closing", "extracting"];
  if (!allowedStages.includes(job.stage)) {
    throw new Error(
      "Job cannot complete before calculated H2K is saved and parsed.",
    );
  }

  job.status = "complete";
  job.stage = "complete";
  job.progress = 100;
  job.message = STAGE_MESSAGES.complete;
  job.netGJa = netGJa;
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

  job.status = "failed";
  job.stage = "failed";
  job.progress = 0;
  job.message = STAGE_MESSAGES.failed;
  job.error = error;
  job.updatedAt = nowIso();
  job.leaseExpiresAt = undefined;
  return job;
}
