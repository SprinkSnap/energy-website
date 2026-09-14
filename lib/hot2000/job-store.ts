import type { CatalogBlobRef } from "@/lib/hot2000/catalog-blob";
import {
  doCheckpointCatalogJob,
  doClaimNextJob,
  doCompleteJob,
  doCreateJob,
  doFailJob,
  doGetJob,
  doGetCatalogScanControl,
  doGetJobInputXml,
  doGetQueueStatus,
  doReadCatalogBlob,
  doSetCatalogScanControl,
  doRecordWorkerHeartbeat,
  doUpdateJobProgress,
} from "@/lib/hot2000/do-client";
import { SHA256_HEX_RE } from "@/lib/hot2000/job-create-validation";
import type {
  CatalogCaptureMeta,
  CatalogScanControl,
  Hot2000JobKind,
  Hot2000JobRecord,
  Hot2000JobStage,
  Hot2000QueueStatus,
} from "@/lib/hot2000/types";

export async function hashH2kContent(xml: string): Promise<string> {
  if (typeof xml !== "string" || !xml.length) {
    throw new Error("Cannot hash empty H2K content.");
  }

  const bytes = new TextEncoder().encode(xml);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (!SHA256_HEX_RE.test(hash)) {
    throw new Error("H2K content hash is not a valid SHA-256 hex string.");
  }

  return hash;
}

export async function createJob(
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
  return doCreateJob(
    inputXml,
    sourceHash,
    kind,
    exportFilename,
    inputFilename,
    modelRevision,
    editorRevision,
    catalogAction,
    options,
  );
}

export async function getJob(id: string): Promise<Hot2000JobRecord | null> {
  return doGetJob(id);
}

export async function claimNextJob(
  workerId: string,
): Promise<Hot2000JobRecord | null> {
  return doClaimNextJob(workerId);
}

export async function checkpointCatalogJob(
  id: string,
  workerId: string,
  captureJson: string,
  meta?: CatalogCaptureMeta,
): Promise<Hot2000JobRecord> {
  return doCheckpointCatalogJob(id, workerId, captureJson, meta);
}

export async function updateJobProgress(
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
  return doUpdateJobProgress(id, workerId, stage, options);
}

export async function completeJob(
  id: string,
  workerId: string,
  netGJa: number,
  options: {
    reportPdfBase64?: string;
    catalogCaptureJson?: string;
    catalogCaptureMeta?: CatalogCaptureMeta;
  } = {},
): Promise<Hot2000JobRecord> {
  return doCompleteJob(id, workerId, netGJa, options);
}

export async function failJob(
  id: string,
  workerId: string,
  error: string,
): Promise<Hot2000JobRecord> {
  return doFailJob(id, workerId, error);
}

export async function getCatalogScanControl(
  id: string,
  workerId: string,
): Promise<CatalogScanControl> {
  return doGetCatalogScanControl(id, workerId);
}

export async function setCatalogScanControl(
  id: string,
  control: CatalogScanControl,
): Promise<Hot2000JobRecord> {
  return doSetCatalogScanControl(id, control);
}

export async function getJobInputXml(
  id: string,
  workerId: string,
): Promise<string> {
  return doGetJobInputXml(id, workerId);
}

export async function recordWorkerHeartbeat(
  workerId: string,
  buildId?: string,
): Promise<void> {
  return doRecordWorkerHeartbeat(workerId, buildId);
}

export async function getQueueStatus(): Promise<Hot2000QueueStatus> {
  return doGetQueueStatus();
}

export async function resolveJobCatalogCapture(
  job: Hot2000JobRecord,
): Promise<string | null> {
  if (job.catalogCaptureJson?.trim()) {
    return job.catalogCaptureJson.trim();
  }
  if (job.catalogCaptureRef) {
    return doReadCatalogBlob(job.catalogCaptureRef.artifactId);
  }
  return null;
}

export async function resolveJobScanState(
  job: Hot2000JobRecord,
  _workerId: string,
): Promise<string | null> {
  if (job.catalogScanStateJson?.trim()) {
    return job.catalogScanStateJson.trim();
  }
  if (job.catalogScanStateRef) {
    return doReadCatalogBlob(job.catalogScanStateRef.artifactId);
  }
  return null;
}
