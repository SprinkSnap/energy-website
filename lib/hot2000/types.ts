export const HOT2000_JOB_STAGES = [
  "queued",
  "claimed",
  "starting",
  "opening",
  "calculating",
  "saving",
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
  status: Hot2000JobStatus;
  stage: Hot2000JobStage;
  progress: number;
  message: string;
  error?: string;
  sourceHash: string;
  inputXml: string;
  calculatedXml?: string;
  netGJa?: number;
  workerId?: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
  hot2000Progress?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
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
  status: Hot2000JobStatus;
  stage: Hot2000JobStage;
  progress: number;
  message?: string;
  error?: string;
  net_gja?: number;
  calculated_xml?: string;
};

export const STAGE_MESSAGES: Record<Hot2000JobStage, string> = {
  queued: "Waiting for an available HOT2000 worker…",
  claimed: "HOT2000 worker assigned…",
  starting: "Starting HOT2000 Desktop…",
  opening: "Opening H2K model…",
  calculating: "HOT2000 Desktop is calculating…",
  saving: "Saving calculated H2K…",
  closing: "Closing HOT2000…",
  extracting: "Reading SOC results…",
  complete: "Calculation complete",
  failed: "Calculation failed",
};

const STAGE_BASE_PROGRESS: Record<Hot2000JobStage, number> = {
  queued: 20,
  claimed: 30,
  starting: 35,
  opening: 40,
  calculating: 40,
  saving: 85,
  closing: 90,
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
    status: job.status,
    stage: job.stage,
    progress: job.progress,
  };
  if (job.message) payload.message = job.message;
  if (job.error) payload.error = job.error;
  if (job.netGJa != null) payload.net_gja = job.netGJa;
  if (job.stage === "complete" && job.calculatedXml) {
    payload.calculated_xml = job.calculatedXml;
  }
  return payload;
}
