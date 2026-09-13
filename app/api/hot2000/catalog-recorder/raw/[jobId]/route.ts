import { NextRequest, NextResponse } from "next/server";
import {
  assertCatalogRecorderAuthorized,
  CatalogRecorderAuthError,
  CatalogRecorderDisabledError,
} from "@/lib/hot2000/catalog-recorder";
import { sanitizePublicError } from "@/lib/hot2000/auth";
import { getJob } from "@/lib/hot2000/job-store";
import { applyCaptureToRecorderState } from "@/lib/hot2000/runtime-recorder-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await assertCatalogRecorderAuthorized();
    const { jobId } = await context.params;
    const job = await getJob(jobId);
    if (!job?.catalogCaptureJson) {
      return NextResponse.json(
        { error: "Catalog capture not found for this job." },
        { status: 404 },
      );
    }

    return new NextResponse(job.catalogCaptureJson, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="catalog-capture-${jobId}.json"`,
      },
    });
  } catch (err) {
    if (err instanceof CatalogRecorderDisabledError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof CatalogRecorderAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[catalog-recorder/raw/[jobId]] GET failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError("Could not download catalog capture.") },
      { status: 500 },
    );
  }
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    await assertCatalogRecorderAuthorized();
    const { jobId } = await context.params;
    const job = await getJob(jobId);
    if (!job?.catalogCaptureJson) {
      return NextResponse.json(
        { error: "Catalog capture not found for this job." },
        { status: 404 },
      );
    }

    const state = await applyCaptureToRecorderState(
      job.catalogCaptureJson,
      jobId,
      {
        section: job.catalogCaptureMeta?.section,
        hot2000Version: job.catalogCaptureMeta?.hot2000Version,
        workerId: job.catalogCaptureMeta?.workerId,
        capturedAt: job.catalogCaptureMeta?.capturedAt,
        fixtureId: job.catalogCaptureMeta?.fixtureId,
      },
    );

    return NextResponse.json({
      ok: true,
      message:
        "Capture is persisted in Cloudflare job storage. Recorder snapshot updated from stored job capture.",
      job_id: jobId,
      latest_capture_job_id: state.latestCaptureJobId,
      updated_at: state.updatedAt,
    });
  } catch (err) {
    if (err instanceof CatalogRecorderDisabledError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof CatalogRecorderAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[catalog-recorder/raw/[jobId]] POST failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError("Could not update recorder state.") },
      { status: 500 },
    );
  }
}
