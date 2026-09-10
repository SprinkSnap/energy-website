import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HOT2000_QUEUE_DO_NAME } from "@/lib/hot2000/constants";
import type {
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
): Promise<Hot2000JobRecord> {
  const response = await queueFetch("/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputXml, sourceHash }),
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
  options: { hot2000Progress?: number; message?: string } = {},
): Promise<Hot2000JobRecord> {
  const response = await queueFetch("/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, workerId, stage, ...options }),
  });
  const data = await readJson<{ job: Hot2000JobRecord }>(response);
  return data.job;
}

export async function doCompleteJob(
  id: string,
  workerId: string,
  netGJa: number,
  calculatedXml?: string,
): Promise<Hot2000JobRecord> {
  const response = await queueFetch("/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, workerId, netGJa, calculatedXml }),
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
