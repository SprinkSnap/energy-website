import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { updateJobProgress } from "@/lib/hot2000/job-store";
import {
  HOT2000_JOB_STAGES,
  type Hot2000JobStage,
  toPublicJob,
} from "@/lib/hot2000/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function readStage(body: Record<string, unknown>): Hot2000JobStage | null {
  const raw =
    typeof body.stage === "string"
      ? body.stage
      : typeof body.status === "string"
        ? body.status
        : "";
  const normalized = raw.trim().toLowerCase() as Hot2000JobStage;
  return HOT2000_JOB_STAGES.includes(normalized) ? normalized : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertWorkerAuthorized(request);
    const { id } = await context.params;
    const body = await request.json();
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

    const stage = readStage(body);
    if (!stage || stage === "complete" || stage === "failed") {
      return NextResponse.json(
        { error: "Invalid progress stage." },
        { status: 400 },
      );
    }

    const hot2000Progress =
      typeof body.hot2000_progress === "number"
        ? body.hot2000_progress
        : typeof body.hot2000Progress === "number"
          ? body.hot2000Progress
          : typeof body.progress === "number" && stage === "calculating"
            ? body.progress
            : undefined;

    const message =
      typeof body.message === "string" ? body.message : undefined;

    const job = updateJobProgress(id, workerId.trim(), stage, {
      hot2000Progress,
      message,
    });
    const payload = toPublicJob(job);
    return NextResponse.json({
      ...payload,
      jobId: payload.job_id,
    });
  } catch (err) {
    if (err instanceof WorkerAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Could not update job.";
    const status = message.includes("not found") ? 404 : 400;
    console.error("[hot2000/worker/progress] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError(message) },
      { status },
    );
  }
}
