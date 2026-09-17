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
import { isCatalogJobKind } from "../lib/hot2000/catalog-recorder";
import {
  assertValidJobInputXml,
  assertValidJobKind,
  assertValidSourceHash,
} from "../lib/hot2000/job-create-validation";
import {
  CatalogBlobWriteError,
  catalogBlobWriteFailureMessage,
  chunkUtf8String,
  deleteCatalogBlob,
  readCatalogBlob,
  shouldStoreCatalogBlobInline,
  type CatalogBlobRef,
  type CatalogBlobStorageAdapter,
  utf8ByteLength,
  writeCatalogBlob,
} from "../lib/hot2000/catalog-blob";
import { applyCaptureToRecorderState } from "../lib/hot2000/recorder-state-logic";
import {
  emptyRecorderState,
  type Hot2000RecorderState,
} from "../lib/hot2000/recorder-state";
import {
  HOT2000_JOB_KINDS,
  type CatalogCaptureMeta,
  type CatalogScanControl,
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
const RECORDER_STATE_KEY = "recorder-state";

class DurableCatalogBlobStorage implements CatalogBlobStorageAdapter {
  constructor(private readonly storage: DurableObjectStorage) {}

  async get(key: string): Promise<string | undefined> {
    const value = await this.storage.get<string>(key);
    return value ?? undefined;
  }

  async put(key: string, value: string): Promise<void> {
    await this.storage.put(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.storage.delete(key);
  }
}

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
          modelRevision?: number;
          editorRevision?: number;
          catalogAction?: string;
          catalogScanStateJson?: string;
          catalogScanStateRef?: CatalogBlobRef;
          parentJobId?: string;
          continuationOf?: string;
        };
        let inputXml: string;
        let sourceHash: string;
        let kind: Hot2000JobKind;
        try {
          inputXml = assertValidJobInputXml(body.inputXml);
          sourceHash = assertValidSourceHash(body.sourceHash);
          kind = assertValidJobKind(body.kind);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Invalid job create payload.";
          return errorResponse(message, 400);
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
          inputXml,
          sourceHash,
          kind,
          exportFilename || undefined,
          inputFilename || undefined,
          Number.isFinite(Number(body.modelRevision))
            ? Number(body.modelRevision)
            : undefined,
          Number.isFinite(Number(body.editorRevision))
            ? Number(body.editorRevision)
            : undefined,
          typeof body.catalogAction === "string"
            ? body.catalogAction.trim()
            : undefined,
          {
            catalogScanStateJson:
              typeof body.catalogScanStateJson === "string"
                ? body.catalogScanStateJson
                : undefined,
            catalogScanStateRef: body.catalogScanStateRef,
            parentJobId:
              typeof body.parentJobId === "string" ? body.parentJobId : undefined,
            continuationOf:
              typeof body.continuationOf === "string"
                ? body.continuationOf
                : undefined,
          },
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
          catalogCaptureMeta?: CatalogCaptureMeta;
          catalogScanStateJson?: string;
          catalog_capture_meta?: CatalogCaptureMeta;
          catalog_scan_state_json?: string;
        };
        if (!body.id || !body.workerId || !body.stage) {
          return errorResponse("id, workerId, and stage are required.", 400);
        }
        const job = await this.updateJobProgress(body.id, body.workerId, body.stage, {
          hot2000Progress: body.hot2000Progress,
          message: body.message,
          catalogCaptureMeta:
            body.catalogCaptureMeta ?? body.catalog_capture_meta,
          catalogScanStateJson:
            body.catalogScanStateJson ?? body.catalog_scan_state_json,
        });
        return jsonResponse({ job });
      }

      if (request.method === "POST" && path === "/checkpoint") {
        const body = (await request.json()) as {
          id?: string;
          workerId?: string;
          captureJson?: string;
          meta?: CatalogCaptureMeta;
        };
        if (!body.id || !body.workerId || !body.captureJson?.trim()) {
          return errorResponse("id, workerId, and captureJson are required.", 400);
        }
        const job = await this.getJob(body.id);
        if (!job) return errorResponse("Job not found.", 404);
        assertWorkerOwnsJob(job, body.workerId);
        const captureJson = body.captureJson.trim();
        const priorScanRef = job.catalogScanStateRef;
        let scanStateRef: CatalogBlobRef | undefined;
        if (shouldStoreCatalogBlobInline(utf8ByteLength(captureJson))) {
          job.catalogScanStateJson = captureJson;
          job.catalogScanStateRef = undefined;
        } else {
          try {
            scanStateRef = await this.storeCatalogBlobUtf8(captureJson, {
              artifactKind: "scan-state",
              jobId: body.id,
              lineageId: job.continuationOf ?? job.id,
            });
          } catch (err) {
            const byteLength = utf8ByteLength(captureJson);
            const chunkCount = chunkUtf8String(captureJson).length;
            console.error(
              "[hot2000-job-queue] checkpoint blob write failed",
              {
                artifactKind: "scan-state",
                jobId: body.id,
                byteLength,
                chunkCount,
                operation: "write",
              },
              err,
            );
            if (err instanceof CatalogBlobWriteError) {
              throw err;
            }
            throw new CatalogBlobWriteError(
              catalogBlobWriteFailureMessage(
                "scan-state",
                byteLength,
                chunkCount,
              ),
              {
                artifactKind: "scan-state",
                byteLength,
                chunkCount,
                operation: "write",
                cause: err,
              },
            );
          }
          job.catalogScanStateRef = scanStateRef;
          job.catalogScanStateJson = undefined;
        }
        if (body.meta) {
          job.catalogCaptureMeta = {
            ...(job.catalogCaptureMeta ?? {}),
            ...body.meta,
          };
        }
        job.updatedAt = nowIso();
        await this.saveJob(job);
        if (priorScanRef?.artifactId && priorScanRef.artifactId !== scanStateRef?.artifactId) {
          await this.deleteCatalogBlobRef(priorScanRef);
        }
        const state = await this.applyRecorderCapture(
          body.id,
          captureJson,
          body.meta ?? {},
          scanStateRef,
        );
        return jsonResponse({ job, recorderState: state });
      }

      if (request.method === "POST" && path === "/complete") {
        const body = (await request.json()) as {
          id?: string;
          workerId?: string;
          netGJa?: number;
          reportPdfBase64?: string;
          catalogCaptureJson?: string;
          catalogCaptureMeta?: CatalogCaptureMeta;
        };
        if (!body.id || !body.workerId) {
          return errorResponse("id and workerId are required.", 400);
        }
        const job = await this.completeJob(
          body.id,
          body.workerId,
          body.netGJa ?? 0,
          {
            reportPdfBase64: body.reportPdfBase64,
            catalogCaptureJson: body.catalogCaptureJson,
            catalogCaptureMeta: body.catalogCaptureMeta,
          },
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

      if (request.method === "GET" && path === "/scan-control") {
        const id = url.searchParams.get("id") ?? "";
        const workerId = url.searchParams.get("workerId") ?? "";
        if (!id || !workerId) {
          return errorResponse("id and workerId are required.", 400);
        }
        const control = await this.getCatalogScanControl(id, workerId);
        return jsonResponse({ control });
      }

      if (request.method === "POST" && path === "/scan-control") {
        const body = (await request.json()) as {
          id?: string;
          control?: CatalogScanControl;
        };
        if (!body.id || !body.control) {
          return errorResponse("id and control are required.", 400);
        }
        const job = await this.setCatalogScanControl(body.id, body.control);
        return jsonResponse({ job });
      }

      if (request.method === "GET" && path === "/catalog-blob") {
        const artifactId = url.searchParams.get("artifactId") ?? "";
        if (!artifactId) {
          return errorResponse("artifactId is required.", 400);
        }
        const content = await this.readCatalogBlobByArtifactId(artifactId);
        return new Response(content, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        });
      }

      if (request.method === "GET" && path === "/scan-state") {
        const id = url.searchParams.get("id") ?? "";
        const workerId = url.searchParams.get("workerId") ?? "";
        if (!id || !workerId) {
          return errorResponse("id and workerId are required.", 400);
        }
        const content = await this.resolveJobScanStateJson(id, workerId);
        if (!content) {
          return errorResponse("Scan state not found for this job.", 404);
        }
        return new Response(content, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        });
      }

      if (request.method === "GET" && path === "/catalog-capture") {
        const id = url.searchParams.get("id") ?? "";
        const workerId = url.searchParams.get("workerId") ?? "";
        if (!id || !workerId) {
          return errorResponse("id and workerId are required.", 400);
        }
        const content = await this.resolveJobCatalogCaptureJson(id, workerId);
        if (!content) {
          return errorResponse("Catalog capture not found for this job.", 404);
        }
        return new Response(content, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        });
      }

      if (request.method === "GET" && path === "/recorder-state") {
        return jsonResponse({ state: await this.getRecorderState() });
      }

      if (request.method === "POST" && path === "/recorder-state/apply-capture") {
        const body = (await request.json()) as {
          jobId?: string;
          captureJson?: string;
          meta?: CatalogCaptureMeta;
          navigationRef?: CatalogBlobRef;
        };
        if (!body.jobId?.trim() || !body.captureJson?.trim()) {
          return errorResponse("jobId and captureJson are required.", 400);
        }
        const state = await this.applyRecorderCapture(
          body.jobId.trim(),
          body.captureJson,
          body.meta ?? {},
          body.navigationRef,
        );
        return jsonResponse({ state });
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
    modelRevision?: number,
    editorRevision?: number,
    catalogAction?: string,
    continuation: {
      catalogScanStateJson?: string;
      catalogScanStateRef?: CatalogBlobRef;
      parentJobId?: string;
      continuationOf?: string;
    } = {},
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
    if (modelRevision != null && Number.isFinite(modelRevision)) {
      job.modelRevision = modelRevision;
    }
    if (editorRevision != null && Number.isFinite(editorRevision)) {
      job.editorRevision = editorRevision;
    }
    if (catalogAction?.trim()) {
      job.catalogAction = catalogAction.trim();
    }
    if (continuation.catalogScanStateRef) {
      job.catalogScanStateRef = continuation.catalogScanStateRef;
    }
    if (continuation.catalogScanStateJson?.trim()) {
      const scanStateJson = continuation.catalogScanStateJson.trim();
      if (shouldStoreCatalogBlobInline(utf8ByteLength(scanStateJson))) {
        job.catalogScanStateJson = scanStateJson;
      }
    }
    if (continuation.parentJobId?.trim()) {
      job.parentJobId = continuation.parentJobId.trim();
    }
    if (continuation.continuationOf?.trim()) {
      job.continuationOf = continuation.continuationOf.trim();
    }
    if (isCatalogJobKind(kind)) {
      job.message = "Waiting for catalog recorder worker…";
      job.catalogScanControl = "running";
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
    options: {
      hot2000Progress?: number;
      message?: string;
      catalogCaptureMeta?: CatalogCaptureMeta;
      catalogScanStateJson?: string;
    } = {},
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
    options: {
      reportPdfBase64?: string;
      catalogCaptureJson?: string;
      catalogCaptureMeta?: CatalogCaptureMeta;
    } = {},
  ): Promise<Hot2000JobRecord> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found.");
    if (!job.kind) job.kind = "calculate";
    if (isCatalogJobKind(job.kind) && options.catalogCaptureJson?.trim()) {
      const captureJson = options.catalogCaptureJson.trim();
      const priorCaptureRef = job.catalogCaptureRef;
      if (shouldStoreCatalogBlobInline(utf8ByteLength(captureJson))) {
        job.catalogCaptureJson = captureJson;
        job.catalogCaptureRef = undefined;
      } else {
        try {
          job.catalogCaptureRef = await this.storeCatalogBlobUtf8(captureJson, {
            artifactKind: "catalog-capture",
            jobId: id,
            lineageId: job.continuationOf ?? id,
          });
        } catch (err) {
          const byteLength = utf8ByteLength(captureJson);
          const chunkCount = chunkUtf8String(captureJson).length;
          console.error(
            "[hot2000-job-queue] complete blob write failed",
            {
              artifactKind: "catalog-capture",
              jobId: id,
              byteLength,
              chunkCount,
              operation: "write",
            },
            err,
          );
          if (err instanceof CatalogBlobWriteError) {
            throw err;
          }
          throw new CatalogBlobWriteError(
            catalogBlobWriteFailureMessage(
              "catalog-capture",
              byteLength,
              chunkCount,
            ),
            {
              artifactKind: "catalog-capture",
              byteLength,
              chunkCount,
              operation: "write",
              cause: err,
            },
          );
        }
        job.catalogCaptureJson = undefined;
      }
      if (
        priorCaptureRef?.artifactId &&
        priorCaptureRef.artifactId !== job.catalogCaptureRef?.artifactId
      ) {
        await this.deleteCatalogBlobRef(priorCaptureRef);
      }
    }
    applyJobComplete(job, workerId, netGJa, options);
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

  private async getCatalogScanControl(
    id: string,
    workerId: string,
  ): Promise<CatalogScanControl> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found.");
    assertWorkerOwnsJob(job, workerId);
    return job.catalogScanControl ?? "running";
  }

  private async setCatalogScanControl(
    id: string,
    control: CatalogScanControl,
  ): Promise<Hot2000JobRecord> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found.");
    if (!isCatalogJobKind(job.kind)) {
      throw new Error("Scan control is only available for catalog recorder jobs.");
    }
    job.catalogScanControl = control;
    job.updatedAt = nowIso();
    await this.saveJob(job);
    return job;
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

  private async getRecorderState(): Promise<Hot2000RecorderState> {
    const stored = await this.ctx.storage.get<Hot2000RecorderState>(
      RECORDER_STATE_KEY,
    );
    return stored ?? emptyRecorderState();
  }

  private async saveRecorderState(state: Hot2000RecorderState): Promise<void> {
    await this.ctx.storage.put(RECORDER_STATE_KEY, state);
  }

  private blobStorage(): CatalogBlobStorageAdapter {
    return new DurableCatalogBlobStorage(this.ctx.storage);
  }

  private async storeCatalogBlobUtf8(
    content: string,
    options: {
      artifactKind: CatalogBlobRef["artifactKind"];
      jobId?: string;
      lineageId?: string;
    },
  ): Promise<CatalogBlobRef> {
    return writeCatalogBlob(this.blobStorage(), content, options);
  }

  private async deleteCatalogBlobRef(
    ref: Pick<CatalogBlobRef, "artifactId" | "chunkCount">,
  ): Promise<void> {
    await deleteCatalogBlob(this.blobStorage(), ref);
  }

  private async readCatalogBlobByArtifactId(artifactId: string): Promise<string> {
    const manifestRaw = await this.ctx.storage.get<string>(
      `catalog-blob:${artifactId}:manifest`,
    );
    if (!manifestRaw) {
      throw new Error(`Catalog blob manifest missing for ${artifactId}.`);
    }
    const manifest = JSON.parse(manifestRaw) as CatalogBlobRef;
    return readCatalogBlob(this.blobStorage(), manifest);
  }

  private async resolveJobScanStateJson(
    id: string,
    workerId: string,
  ): Promise<string | null> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found.");
    assertWorkerOwnsJob(job, workerId);
    if (job.catalogScanStateJson?.trim()) {
      return job.catalogScanStateJson.trim();
    }
    if (job.catalogScanStateRef) {
      return readCatalogBlob(this.blobStorage(), job.catalogScanStateRef);
    }
    return null;
  }

  async resolveJobCatalogCaptureJson(
    id: string,
    workerId?: string,
  ): Promise<string | null> {
    const job = await this.getJob(id);
    if (!job) throw new Error("Job not found.");
    if (workerId) {
      assertWorkerOwnsJob(job, workerId);
    }
    if (job.catalogCaptureJson?.trim()) {
      return job.catalogCaptureJson.trim();
    }
    if (job.catalogCaptureRef) {
      return readCatalogBlob(this.blobStorage(), job.catalogCaptureRef);
    }
    return null;
  }

  private async applyRecorderCapture(
    jobId: string,
    captureJson: string,
    meta: CatalogCaptureMeta = {},
    navigationRef?: CatalogBlobRef,
  ): Promise<Hot2000RecorderState> {
    const current = await this.getRecorderState();
    const next = applyCaptureToRecorderState(
      current,
      captureJson,
      meta,
      jobId,
      navigationRef,
    );
    await this.saveRecorderState(next);
    return next;
  }
}
