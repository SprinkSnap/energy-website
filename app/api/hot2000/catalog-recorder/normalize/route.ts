import { NextRequest, NextResponse } from "next/server";
import {
  assertCatalogRecorderAuthorized,
  CatalogRecorderAuthError,
  CatalogRecorderDisabledError,
} from "@/lib/hot2000/catalog-recorder";
import { sanitizePublicError } from "@/lib/hot2000/auth";
import { getJob, resolveJobCatalogCapture } from "@/lib/hot2000/job-store";

export const runtime = "nodejs";

type NormalizeModule = {
  normalizeRawDesktopCapture: (raw: Record<string, unknown>) => {
    manifest: Record<string, unknown>;
    screens: Record<string, unknown>[];
  };
};

async function loadNormalizer(): Promise<NormalizeModule> {
  const mod = await import(
    "../../../../../h2k-web-editor/catalog/normalize-desktop-capture.mjs"
  );
  return mod as NormalizeModule;
}

export async function POST(request: NextRequest) {
  try {
    await assertCatalogRecorderAuthorized();
    const body = (await request.json()) as { jobId?: string };
    const jobId = String(body.jobId || "").trim();
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    const captureJson = await resolveJobCatalogCapture(job);
    if (!captureJson) {
      return NextResponse.json(
        { error: "Catalog capture not found for this job." },
        { status: 404 },
      );
    }

    const parsed = JSON.parse(captureJson) as Record<string, unknown>;
    const { normalizeRawDesktopCapture } = await loadNormalizer();
    const normalized = normalizeRawDesktopCapture({
      ...parsed,
      navigation: parsed,
      coverage: parsed.coverage ?? job.catalogCaptureMeta,
      scanId: parsed.scanId ?? job.catalogCaptureMeta?.scanId,
      hot2000Version: parsed.hot2000Version ?? job.catalogCaptureMeta?.hot2000Version,
    });

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      manifest: normalized.manifest,
      screens: normalized.screens,
      screen_count: normalized.screens.length,
      mapping_policy: "no-guessed-xml-paths",
    });
  } catch (err) {
    if (err instanceof CatalogRecorderDisabledError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof CatalogRecorderAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[catalog-recorder/normalize] POST failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError("Could not normalize catalog capture.") },
      { status: 500 },
    );
  }
}
