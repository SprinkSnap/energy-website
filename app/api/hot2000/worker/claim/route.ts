import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { claimNextJob } from "@/lib/hot2000/job-store";
import { toPublicJob } from "@/lib/hot2000/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertWorkerAuthorized(request);
    const body = await request.json().catch(() => ({}));
    const workerId =
      typeof body.worker_id === "string"
        ? body.worker_id
        : typeof body.workerId === "string"
          ? body.workerId
          : "";
    if (!workerId.trim()) {
      return NextResponse.json(
        { error: "worker_id is required." },
        { status: 400 },
      );
    }

    const job = claimNextJob(workerId.trim());
    if (!job) {
      return NextResponse.json({ job: null }, { status: 204 });
    }

    const publicJob = toPublicJob(job);
    return NextResponse.json({
      job: {
        ...publicJob,
        jobId: publicJob.job_id,
        source_hash: job.sourceHash,
        sourceHash: job.sourceHash,
        input_url: `/api/hot2000/worker/${job.id}/input`,
      },
    });
  } catch (err) {
    if (err instanceof WorkerAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[hot2000/worker/claim] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError("Could not claim job.") },
      { status: 500 },
    );
  }
}
