import { DurableObject } from "cloudflare:workers";
import {
  JOB_LEASE_MS,
  JOB_RETENTION_MS,
  MAX_JOBS,
  WORKER_HEARTBEAT_TTL_MS,
} from "../lib/hot2000/constants";
import {
  applyJobComplete,
  applyJobFail,
  applyJobProgress,
  assertWorkerOwnsJob,
  maybeRequeueExpired,
  maybeRequeueOrphaned,
  nowIso,
} from "../lib/hot2000/job-logic";
import {
  HOT2000_JOB_KINDS,
  type Hot2000JobKind,
  type Hot2000JobRecord,
  type Hot2000JobStage,
  type Hot2000QueueStatus,
  type Hot2000WorkerHeartbeat,
  computeJobProgress,
  STAGE_MESSAGES,
} from "../lib/hot2000/types";

const JOB_KEY_PREFIX = "job:";
const WORKER_KEY_PREFIX = "worker-hb:";

function jobKey(id: string): string {
  return `${JOB_KEY_PREFIX}${id}`;
}

function newJobId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

/** Authoritative persistent HOT2000 job queue (single global instance). */
export class Hot2000JobQueue extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "POST" && path === "/create") {
        const body = (await request.json()) as {
          inputXml?: string;
          sourceHash?: string;
          kind?: Hot2000JobKind;
          exportFilename?: string;
          inputFilename?: string;
        };
        if (!body.inputXml || !body.sourceHash) {
          return errorResponse("inputXml and sourceHash are required.", 400);
        }
        const kind = body.kind ?? "calculate";
        if (!HOT2000_JOB_KINDS.includes(kind)) {
          return errorResponse("Invalid job kind.", 400);
        }
        const exportFilename =
          typeof body.exportFilename === "string"
            ? body.exportFilename.trim()
            : "";
        const inputFilename =
          typeof body.inputFilename === "string"
            ? body.inputFilename.trim()
            : "";
        const job = await this.createJob(
          body.inputXml,
          body.sourceHash,
          kind,
          exportFilename || undefined,
          inputFilename || undefined,
        );
        return jsonResponse({ job }, 201);
      }

      if (request.method === "GET" && path === "/job") {
        const id = url.searchParams.get("id") ?? "";
        if (!id) return errorResponse("id is required.", 400);
        const job = await this.getJob(id);
        if (!job) return errorResponse("Job not found.", 404);
        return jsonResponse({ job });
      }

      if (request.method === "POST" && path === "/claim") {
        const body = (await request.json()) as { workerId?: string };
        if (!body.workerId?.trim()) {
          return errorResponse("workerId is required.", 400);
        }
        const job = await this.claimNextJob(body.workerId.trim());
        if (!job) return new Response(null, { status: 204 });
        return jsonResponse({ job });
      }

      if (request.method === "POST" && path === "/progress") {
        const body = (await request.json()) as {
          id?: string;
          workerId?: string;
          stage?: Hot2000JobStage;
          hot2000Progress?: number;
          message?: string;
        };
        if (!body.id || !body.workerId || !body.stage) {
          return errorResponse("id, workerId, and stage are required.", 400);
        }
        const job = await this.updateJobProgress(body.id, body.workerId, body.stage, {
          hot2000Progress: body.hot2000Progress,
          message: body.message,
        });
        return jsonResponse({ job });
      }

      if (request.method === "POST" && path === "/complete") {
        const body = (await request.json()) as {
          id?: string;
          workerId?: string;
          netGJa?: number;
          reportPdfBase64?: string;
        };
        if (!body.id || !body.workerId || body.netGJa == null) {
          return errorResponse("id, workerId, and netGJa are required.", 400);
        }
        const job = await this.completeJob(
          body.id,
          body.workerId,
          body.netGJa,
          body.reportPdfBase64,
        );
        return jsonResponse({ job });
      }

      if (request.method === "POST" && path === "/fail") {
        const body = (await request.json()) as {
          id?: string;
          workerId?: string;
          error?: string;
        };
        if (!body.id || !body.workerId) {
          return errorResponse("id and workerId are required.", 400);
        }
        const job = await this.failJob(
          body.id,
          body.workerId,
          body.error ?? "HOT2000 calculation failed.",
        );
        return jsonResponse({ job });
      }

      if (request.method === "POST" && path === "/heartbeat") {
        const body = (await request.json()) as {
          workerId?: string;
          buildId?: string;
        };
        if (!body.workerId?.trim()) {
          return errorResponse("workerId is required.", 400);
        }
        await this.recordHeartbeat(body.workerId.trim(), body.buildId?.trim());
        return jsonResponse({ ok: true });
      }

      if (request.method === "GET" && path === "/status") {
        return jsonResponse({ status: await this.getQueueStatus() });
      }

      if (request.method === "GET" && path === "/input") {
        const id = url.searchParams.get("id") ?? "";
        const workerId = url.searchParams.get("workerId") ?? "";
        if (!id || !workerId) {
          return errorResponse("id and workerId are required.", 400);
        }
        const xml = await this.getJobInputXml(id, workerId);
        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
          },
        });
      }

      return errorResponse("Not found.", 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error.";
      const status = message.includes("not found")
        ? 404
        : message.includes("not assigned")
          ? 403
          : message.includes("cannot complete")
            ? 400
            : 500;
      return errorResponse(message, status);
    }
  }

  private async listJobs(): Promise<Hot2000JobRecord[]> {
    const listed = await this.ctx.storage.list<Hot2000JobRecord>({
      prefix: JOB_KEY_PREFIX,
    });
    return [...listed.values()];
  }

  private async saveJob(job: Hot2000JobRecord): Promise<void> {
    await this.ctx.storage.put(jobKey(job.id), job);
  }

  private async deleteJob(id: string): Promise<void> {
    await this.ctx.storage.delete(jobKey(id));
  }

  private async pruneOldJobs(): Promise<void> {
    const jobs = await this.listJobs();
    const cutoff = Date.now() - JOB_RETENTION_MS;
    for (const job of jobs) {
      if (Date.parse(job.updatedAt) < cutoff) {
        await this.deleteJob(job.id);
      }
    }
    const remaining = await this.listJobs();
    if (remaining.length <= MAX_JOBS) return;
    const sorted = [...remaining].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
    while (sorted.length > MAX_JOBS) {
      const oldest = sorted.shift();
      if (oldest) await this.deleteJob(oldest.id);
    }
  }

  private async requeueStaleJobs(): Promise<void> {
    const workers = await this.listWorkerHeartbeats();
    const activeWorkerIds = new Set(workers.map((worker) => worker.workerId));
    const jobs = await this.listJobs();
    for (const job of jobs) {
      const requeued =
        maybeRequeueOrphaned(job, activeWorkerIds) || maybeRequeueExpired(job);
      if (requeued) {
        await this.saveJob(job);
      }
    }
  }

  private async createJob(
    inputXml: string,
    sourceHash: string,
    kind: Hot2000JobKind = "calculate",
    exportFilename?: string,
    inputFilename?: string,
  ): Promise<Hot2000JobRecord> {
    await this.pruneOldJobs();
    const id = newJobId();
    const ts = nowIso();
    const job: Hot2000JobRecord = {
      id,
      kind,
      status: "queued",
      stage: "queued",
      progress: computeJobProgress("queued"),
      message: STAGE_MESSAGES.queued,
      sourceHash,
      inputXml,
      createdAt: ts,
      updatedAt: ts,
    };
    if (exportFilename?.trim()) {
      job.exportFilename = exportFilename.trim();
    }
    if (inputFilename?.trim()) {
      job.inputFilename = inputFilename.trim();
    }
    await this.saveJob(job);
    return job;
  }

  private async getJob(id: string): Promise<Hot2000JobRecord | null> {
    await this.requeueStaleJobs();
    const job = await this.ctx.storage.get<Hot2000JobRecord>(jobKey(id));
    if (!job) return null;
    if (maybeRequeueExpired(job)) {
      await this.saveJob(job);
    }
    return job;
  }

  private async claimNextJob(workerId: string): Promise<Hot2000JobRecord | null> {
    await this.requeueStaleJobs();
    const jobs = await this.listJobs();
    const candidate = jobs
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
    await this.saveJob(candidate);
    return candidate;
  }

  private async updateJobProgress(
    id: string,
    workerId: string,
    stage: Hot2000JobStage,
    options: { hot2000Progress?: number; message?: string } = {},
  ): Promise<Hot2000JobRecord> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found.");
    applyJobProgress(job, workerId, stage, options);
    await this.saveJob(job);
    return job;
  }

  private async completeJob(
    id: string,
    workerId: string,
    netGJa: number,
    reportPdfBase64?: string,
  ): Promise<Hot2000JobRecord> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found.");
    if (!job.kind) job.kind = "calculate";
    applyJobComplete(job, workerId, netGJa, { reportPdfBase64 });
    await this.saveJob(job);
    return job;
  }

  private async failJob(
    id: string,
    workerId: string,
    error: string,
  ): Promise<Hot2000JobRecord> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found.");
    applyJobFail(job, workerId, error);
    await this.saveJob(job);
    return job;
  }

  private async getJobInputXml(id: string, workerId: string): Promise<string> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found.");
    assertWorkerOwnsJob(job, workerId);
    return job.inputXml;
  }

  private workerKey(workerId: string): string {
    return `${WORKER_KEY_PREFIX}${workerId}`;
  }

  private async recordHeartbeat(
    workerId: string,
    buildId?: string,
  ): Promise<void> {
    const heartbeat: Hot2000WorkerHeartbeat = {
      workerId,
      buildId: buildId || undefined,
      lastSeen: nowIso(),
    };
    await this.ctx.storage.put(this.workerKey(workerId), heartbeat);
  }

  private async listWorkerHeartbeats(): Promise<Hot2000WorkerHeartbeat[]> {
    const listed = await this.ctx.storage.list<Hot2000WorkerHeartbeat>({
      prefix: WORKER_KEY_PREFIX,
    });
    const cutoff = Date.now() - WORKER_HEARTBEAT_TTL_MS;
    const active: Hot2000WorkerHeartbeat[] = [];
    for (const [key, heartbeat] of listed.entries()) {
      if (Date.parse(heartbeat.lastSeen) < cutoff) {
        await this.ctx.storage.delete(key);
        continue;
      }
      active.push(heartbeat);
    }
    return active;
  }

  private async getQueueStatus(): Promise<Hot2000QueueStatus> {
    await this.requeueStaleJobs();
    const jobs = await this.listJobs();
    const workers = await this.listWorkerHeartbeats();
    return {
      workersOnline: workers.length,
      workers,
      queuedJobs: jobs.filter((job) => job.status === "queued").length,
      runningJobs: jobs.filter((job) => job.status === "running").length,
    };
  }
}
