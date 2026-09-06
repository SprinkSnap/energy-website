import { randomBytes, createHash } from "node:crypto";
import {
  type Hot2000JobRecord,
  type Hot2000JobStage,
  computeJobProgress,
  STAGE_MESSAGES,
} from "@/lib/hot2000/types";

const JOB_LEASE_MS = 20 * 60 * 1000;
const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_JOBS = 500;

type GlobalStore = {
  jobs: Map<string, Hot2000JobRecord>;
  claimLock: boolean;
};

function getStore(): GlobalStore {
  const key = "__hot2000JobStore";
  const g = globalThis as typeof globalThis & { [key: string]: GlobalStore };
  if (!g[key]) {
    g[key] = { jobs: new Map(), claimLock: false };
  }
  return g[key];
}

function nowIso(): string {
  return new Date().toISOString();
}

function newJobId(): string {
  return randomBytes(12).toString("hex");
}

function pruneOldJobs(store: GlobalStore): void {
  const cutoff = Date.now() - JOB_RETENTION_MS;
  for (const [id, job] of store.jobs) {
    const updated = Date.parse(job.updatedAt);
    if (updated < cutoff) store.jobs.delete(id);
  }
  if (store.jobs.size <= MAX_JOBS) return;
  const sorted = [...store.jobs.entries()].sort(
    (a, b) => Date.parse(a[1].createdAt) - Date.parse(b[1].createdAt),
  );
  while (store.jobs.size > MAX_JOBS && sorted.length) {
    const [id] = sorted.shift()!;
    store.jobs.delete(id);
  }
}

export function hashH2kContent(xml: string): string {
  return createHash("sha256").update(xml, "utf8").digest("hex");
}

export function createJob(inputXml: string, sourceHash: string): Hot2000JobRecord {
  const store = getStore();
  pruneOldJobs(store);
  const id = newJobId();
  const ts = nowIso();
  const job: Hot2000JobRecord = {
    id,
    status: "queued",
    stage: "queued",
    progress: computeJobProgress("queued"),
    message: STAGE_MESSAGES.queued,
    sourceHash,
    inputXml,
    createdAt: ts,
    updatedAt: ts,
  };
  store.jobs.set(id, job);
  return job;
}

export function getJob(id: string): Hot2000JobRecord | null {
  const store = getStore();
  const job = store.jobs.get(id);
  if (!job) return null;
  maybeRequeueExpired(job);
  return store.jobs.get(id) ?? null;
}

function maybeRequeueExpired(job: Hot2000JobRecord): void {
  if (job.status !== "running" || !job.leaseExpiresAt) return;
  if (Date.parse(job.leaseExpiresAt) > Date.now()) return;
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

export function claimNextJob(workerId: string): Hot2000JobRecord | null {
  const store = getStore();
  if (store.claimLock) return null;
  store.claimLock = true;
  try {
    for (const job of store.jobs.values()) {
      maybeRequeueExpired(job);
    }
    const candidate = [...store.jobs.values()]
      .filter((j) => j.status === "queued")
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
    if (!candidate) return null;

    const ts = nowIso();
    candidate.status = "running";
    candidate.stage = "claimed";
    candidate.progress = computeJobProgress("claimed");
    candidate.message = STAGE_MESSAGES.claimed;
    candidate.workerId = workerId;
    candidate.claimedAt = ts;
    candidate.leaseExpiresAt = new Date(Date.now() + JOB_LEASE_MS).toISOString();
    candidate.updatedAt = ts;
    return candidate;
  } finally {
    store.claimLock = false;
  }
}

function assertWorkerOwnsJob(job: Hot2000JobRecord, workerId: string): void {
  if (job.workerId !== workerId) {
    throw new Error("Job is not assigned to this worker.");
  }
}

export function updateJobProgress(
  id: string,
  workerId: string,
  stage: Hot2000JobStage,
  options: { hot2000Progress?: number; message?: string } = {},
): Hot2000JobRecord {
  const job = getJob(id);
  if (!job) throw new Error("Job not found.");
  if (job.status === "complete" || job.status === "failed" || job.status === "cancelled") {
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

export function completeJob(
  id: string,
  workerId: string,
  netGJa: number,
): Hot2000JobRecord {
  const job = getJob(id);
  if (!job) throw new Error("Job not found.");
  assertWorkerOwnsJob(job, workerId);

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

export function failJob(
  id: string,
  workerId: string,
  error: string,
): Hot2000JobRecord {
  const job = getJob(id);
  if (!job) throw new Error("Job not found.");
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

export function getJobInputXml(id: string, workerId: string): string {
  const job = getJob(id);
  if (!job) throw new Error("Job not found.");
  assertWorkerOwnsJob(job, workerId);
  return job.inputXml;
}
