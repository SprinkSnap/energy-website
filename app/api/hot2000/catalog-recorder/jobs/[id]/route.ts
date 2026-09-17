import { NextRequest, NextResponse } from "next/server";
import {
  assertCatalogRecorderAuthorized,
  CatalogRecorderAuthError,
  CatalogRecorderDisabledError,
} from "@/lib/hot2000/catalog-recorder";
import { sanitizePublicError } from "@/lib/hot2000/auth";
import { getJob } from "@/lib/hot2000/job-store";
import { toPublicJob } from "@/lib/hot2000/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await assertCatalogRecorderAuthorized();
    const { id } = await context.params;
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const payload = toPublicJob(job);
    return NextResponse.json({
      ...payload,
      jobId: payload.job_id,
      catalog_capture_meta: job.catalogCaptureMeta ?? payload.catalog_capture_meta,
      has_catalog_capture: Boolean(job.catalogCaptureJson || job.catalogCaptureRef),
    });
  } catch (err) {
    if (err instanceof CatalogRecorderDisabledError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof CatalogRecorderAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[catalog-recorder/jobs/[id]] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError("Could not read catalog recorder job.") },
      { status: 500 },
    );
  }
}
