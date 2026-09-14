import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HOT2000_QUEUE_DO_NAME } from "@/lib/hot2000/constants";
import {
  assertValidJobInputXml,
  assertValidJobKind,
  assertValidSourceHash,
} from "@/lib/hot2000/job-create-validation";
import type { CatalogBlobRef } from "@/lib/hot2000/catalog-blob";
import type { Hot2000RecorderState } from "@/lib/hot2000/recorder-state";
import type {
  CatalogCaptureMeta,
  CatalogScanControl,
  Hot2000JobKind,
  Hot2000JobRecord,
  Hot2000JobStage,
  Hot2000QueueStatus,
} from "@/lib/hot2000/types";

const DO_ORIGIN = "https://hot2000-job-queue.internal";

type QueueBinding = DurableObjectNamespace;

async function getQueueNamespace(): Promise<QueueBinding> {
  const { env } = await getCloudflareContext({ async: true });
  const ns = env.HOT2000_JOB_QUEUE;
  if (!ns) {
    throw new Error(
      "HOT2000_JOB_QUEUE Durable Object binding is not configured.",
    );
  }
  return ns;
}

async function getQueueStub() {
  const ns = await getQueueNamespace();
  const id = ns.idFromName(HOT2000_QUEUE_DO_NAME);
  return ns.get(id);
}

async function queueFetch(path: string, init?: RequestInit): Promise<Response> {
  const stub = await getQueueStub();
  return stub.fetch(`${DO_ORIGIN}${path}`, init);
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Queue request failed (${response.status}).`);
  }
  return data;
}

export async function doCreateJob(
  inputXml: string,
  sourceHash: string,
  kind: Hot2000JobKind = "calculate",
  exportFilename?: string,
  inputFilename?: string,
  modelRevision?: number,
  editorRevision?: number,
  catalogAction?: string,
  options: {
    catalogScanStateJson?: string;
    catalogScanStateRef?: CatalogBlobRef;
    parentJobId?: string;
    continuationOf?: string;
  } = {},
): Promise<Hot2000JobRecord> {
  const validatedInputXml = assertValidJobInputXml(inputXml);
  const validatedSourceHash = assertValidSourceHash(sourceHash);
  const validatedKind = assertValidJobKind(kind);

  const payload: Record<string, unknown> = {
    inputXml: validatedInputXml,
    sourceHash: validatedSourceHash,
    kind: validatedKind,
  };

  if (typeof exportFilename === "string" && exportFilename.trim()) {
    payload.exportFilename = exportFilename.trim();
  }
  if (typeof inputFilename === "string" && inputFilename.trim()) {
    payload.inputFilename = inputFilename.trim();
  }
  if (modelRevision != null && Number.isFinite(modelRevision)) {
    payload.modelRevision = modelRevision;
  }
  if (editorRevision != null && Number.isFinite(editorRevision)) {
    payload.editorRevision = editorRevision;
  }
  if (typeof catalogAction === "string" && catalogAction.trim()) {
    payload.catalogAction = catalogAction.trim();
  }
  if (options.catalogScanStateJson?.trim()) {
    payload.catalogScanStateJson = options.catalogScanStateJson.trim();
  }
  if (options.catalogScanStateRef) {
    payload.catalogScanStateRef = options.catalogScanStateRef;
  }
  if (options.parentJobId?.trim()) {
    payload.parentJobId = options.parentJobId.trim();
  }
  if (options.continuationOf?.trim()) {
    payload.continuationOf = options.continuationOf.trim();
  }

  const response = await queueFetch("/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ job: Hot2000JobRecord }>(response);
  return data.job;
}

export async function doGetJob(id: string): Promise<Hot2000JobRecord | null> {
  const response = await queueFetch(`/job?id=${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  const data = await readJson<{ job: Hot2000JobRecord }>(response);
  return data.job;
}

export async function doClaimNextJob(
  workerId: string,
): Promise<Hot2000JobRecord | null> {
  const response = await queueFetch("/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId }),
  });
  if (response.status === 204) return null;
  const data = await readJson<{ job: Hot2000JobRecord }>(response);
  return data.job;
}

export async function doUpdateJobProgress(
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
  const response = await queueFetch("/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, workerId, stage, ...options }),
  });
  const data = await readJson<{ job: Hot2000JobRecord }>(response);
  return data.job;
}

export async function doCheckpointCatalogJob(
  id: string,
  workerId: string,
  captureJson: string,
  meta?: CatalogCaptureMeta,
): Promise<Hot2000JobRecord> {
  const response = await queueFetch("/checkpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, workerId, captureJson, meta }),
  });
  const data = await readJson<{ job: Hot2000JobRecord }>(response);
  return data.job;
}

export async function doCompleteJob(
  id: string,
  workerId: string,
  netGJa: number,
  options: {
    reportPdfBase64?: string;
    catalogCaptureJson?: string;
    catalogCaptureMeta?: CatalogCaptureMeta;
  } = {},
): Promise<Hot2000JobRecord> {
  const response = await queueFetch("/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      workerId,
      netGJa,
      reportPdfBase64: options.reportPdfBase64,
      catalogCaptureJson: options.catalogCaptureJson,
      catalogCaptureMeta: options.catalogCaptureMeta,
    }),
  });
  const data = await readJson<{ job: Hot2000JobRecord }>(response);
  return data.job;
}

export async function doFailJob(
  id: string,
  workerId: string,
  error: string,
): Promise<Hot2000JobRecord> {
  const response = await queueFetch("/fail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, workerId, error }),
  });
  const data = await readJson<{ job: Hot2000JobRecord }>(response);
  return data.job;
}

export async function doRecordWorkerHeartbeat(
  workerId: string,
  buildId?: string,
): Promise<void> {
  const response = await queueFetch("/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId, buildId }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Heartbeat failed (${response.status}).`);
  }
}

export async function doGetQueueStatus(): Promise<Hot2000QueueStatus> {
  const response = await queueFetch("/status");
  const data = await readJson<{ status: Hot2000QueueStatus }>(response);
  return data.status;
}

export async function doGetCatalogScanControl(
  id: string,
  workerId: string,
): Promise<CatalogScanControl> {
  const response = await queueFetch(
    `/scan-control?id=${encodeURIComponent(id)}&workerId=${encodeURIComponent(workerId)}`,
  );
  const data = await readJson<{ control: CatalogScanControl }>(response);
  return data.control;
}

export async function doSetCatalogScanControl(
  id: string,
  control: CatalogScanControl,
): Promise<Hot2000JobRecord> {
  const response = await queueFetch("/scan-control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, control }),
  });
  const data = await readJson<{ job: Hot2000JobRecord }>(response);
  return data.job;
}

export async function doGetJobInputXml(
  id: string,
  workerId: string,
): Promise<string> {
  const response = await queueFetch(
    `/input?id=${encodeURIComponent(id)}&workerId=${encodeURIComponent(workerId)}`,
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Input not available (${response.status}).`);
  }
  return response.text();
}

export async function doGetRecorderState(): Promise<Hot2000RecorderState> {
  const response = await queueFetch("/recorder-state");
  const data = await readJson<{ state: Hot2000RecorderState }>(response);
  return data.state;
}

export async function doApplyRecorderCapture(
  jobId: string,
  captureJson: string,
  meta: Pick<
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
  > = {},
  navigationRef?: CatalogBlobRef,
): Promise<Hot2000RecorderState> {
  const response = await queueFetch("/recorder-state/apply-capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, captureJson, meta, navigationRef }),
  });
  const data = await readJson<{ state: Hot2000RecorderState }>(response);
  return data.state;
}

export async function doReadCatalogBlob(artifactId: string): Promise<string> {
  const response = await queueFetch(
    `/catalog-blob?artifactId=${encodeURIComponent(artifactId)}`,
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Catalog blob read failed (${response.status}).`);
  }
  return response.text();
}

export async function doResolveJobScanState(
  id: string,
  workerId: string,
): Promise<string | null> {
  const response = await queueFetch(
    `/scan-state?id=${encodeURIComponent(id)}&workerId=${encodeURIComponent(workerId)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Scan state read failed (${response.status}).`);
  }
  return response.text();
}

export async function doResolveJobCatalogCapture(
  id: string,
  workerId?: string,
): Promise<string | null> {
  const workerQuery = workerId
    ? `&workerId=${encodeURIComponent(workerId)}`
    : "";
  const response = await queueFetch(
    `/catalog-capture?id=${encodeURIComponent(id)}${workerQuery}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      data.error || `Catalog capture read failed (${response.status}).`,
    );
  }
  return response.text();
}
