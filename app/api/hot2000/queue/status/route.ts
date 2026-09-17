import { NextResponse } from "next/server";
import { getWorkerToken, sanitizePublicError } from "@/lib/hot2000/auth";
import { getQueueStatus } from "@/lib/hot2000/job-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getQueueStatus();
    const workerTokenConfigured = Boolean(getWorkerToken());
    return NextResponse.json({
      worker_token_configured: workerTokenConfigured,
      workerTokenConfigured,
      workers_online: status.workersOnline,
      workersOnline: status.workersOnline,
      workers: status.workers.map((worker) => ({
        worker_id: worker.workerId,
        workerId: worker.workerId,
        build_id: worker.buildId,
        buildId: worker.buildId,
        last_seen: worker.lastSeen,
        lastSeen: worker.lastSeen,
      })),
      queued_jobs: status.queuedJobs,
      queuedJobs: status.queuedJobs,
      running_jobs: status.runningJobs,
      runningJobs: status.runningJobs,
    });
  } catch (err) {
    console.error("[hot2000/queue/status] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError("Could not read queue status.") },
      { status: 500 },
    );
  }
}
