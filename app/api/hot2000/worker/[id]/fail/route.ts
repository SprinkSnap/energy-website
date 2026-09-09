import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { failJob } from "@/lib/hot2000/job-store";
import { toPublicJob } from "@/lib/hot2000/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertWorkerAuthorized(request);
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
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

    const errorMessage =
      typeof body.error === "string" && body.error.trim()
        ? body.error.trim()
        : "HOT2000 calculation failed.";

    const job = await failJob(id, workerId.trim(), sanitizePublicError(errorMessage));
    const payload = toPublicJob(job);
    return NextResponse.json({
      ...payload,
      jobId: payload.job_id,
    });
  } catch (err) {
    if (err instanceof WorkerAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Could not fail job.";
    const status = message.includes("not found") ? 404 : 400;
    console.error("[hot2000/worker/fail] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError(message) },
      { status },
    );
  }
}
