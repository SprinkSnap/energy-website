import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { checkpointCatalogJob, getJob } from "@/lib/hot2000/job-store";
import { toPublicJob, type CatalogCaptureMeta } from "@/lib/hot2000/types";

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

    const captureJson =
      typeof body.capture_json === "string"
        ? body.capture_json
        : typeof body.captureJson === "string"
          ? body.captureJson
          : "";
    if (!captureJson.trim()) {
      return NextResponse.json(
        { error: "capture_json is required." },
        { status: 400 },
      );
    }

    const meta = (body.catalog_capture_meta ??
      body.catalogCaptureMeta ??
      body.meta) as CatalogCaptureMeta | undefined;

    const existing = await getJob(id);
    if (!existing) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const job = await checkpointCatalogJob(
      id,
      workerId.trim(),
      captureJson.trim(),
      meta,
    );
    const payload = toPublicJob(job);
    return NextResponse.json({
      ...payload,
      jobId: payload.job_id,
    });
  } catch (err) {
    if (err instanceof WorkerAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Could not checkpoint.";
    const status = message.includes("not found") ? 404 : 400;
    console.error("[hot2000/worker/checkpoint] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError(message) },
      { status },
    );
  }
}
