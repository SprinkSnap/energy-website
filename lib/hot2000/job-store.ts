import { createHash } from "node:crypto";
import {
  doClaimNextJob,
  doCompleteJob,
  doCreateJob,
  doFailJob,
  doGetJob,
  doGetJobInputXml,
  doGetQueueStatus,
  doRecordWorkerHeartbeat,
  doUpdateJobProgress,
} from "@/lib/hot2000/do-client";
import type {
  Hot2000JobRecord,
  Hot2000JobStage,
  Hot2000QueueStatus,
} from "@/lib/hot2000/types";

export function hashH2kContent(xml: string): string {
  return createHash("sha256").update(xml, "utf8").digest("hex");
}

export async function createJob(
  inputXml: string,
  sourceHash: string,
): Promise<Hot2000JobRecord> {
  return doCreateJob(inputXml, sourceHash);
}

export async function getJob(id: string): Promise<Hot2000JobRecord | null> {
  return doGetJob(id);
}

export async function claimNextJob(
  workerId: string,
): Promise<Hot2000JobRecord | null> {
  return doClaimNextJob(workerId);
}

export async function updateJobProgress(
  id: string,
  workerId: string,
  stage: Hot2000JobStage,
  options: { hot2000Progress?: number; message?: string } = {},
): Promise<Hot2000JobRecord> {
  return doUpdateJobProgress(id, workerId, stage, options);
}

export async function completeJob(
  id: string,
  workerId: string,
  netGJa: number,
): Promise<Hot2000JobRecord> {
  return doCompleteJob(id, workerId, netGJa);
}

export async function failJob(
  id: string,
  workerId: string,
  error: string,
): Promise<Hot2000JobRecord> {
  return doFailJob(id, workerId, error);
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
