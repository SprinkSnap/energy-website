import { NextRequest, NextResponse } from "next/server";
import {
  assertCatalogRecorderAuthorized,
  CatalogRecorderAuthError,
  CatalogRecorderDisabledError,
  CATALOG_SCAN_CONTROL_ACTIONS,
  isCatalogJobKind,
  type CatalogScanControlAction,
} from "@/lib/hot2000/catalog-recorder";
import { sanitizePublicError } from "@/lib/hot2000/auth";
import { getJob, setCatalogScanControl } from "@/lib/hot2000/job-store";
import type { CatalogScanControl } from "@/lib/hot2000/types";
import { toPublicJob } from "@/lib/hot2000/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function mapControlAction(action: string): CatalogScanControl | null {
  switch (action) {
    case "pause":
    case "pause_scan":
      return "paused";
    case "resume":
    case "resume_scan":
      return "running";
    case "stop":
    case "stop_scan":
      return "stopped";
    default:
      return null;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await assertCatalogRecorderAuthorized();
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string };
    const action = String(body.action || "").trim();
    if (!CATALOG_SCAN_CONTROL_ACTIONS.includes(action as CatalogScanControlAction) && !["pause_scan", "stop_scan", "resume_scan"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid scan control action. Use pause, resume, or stop." },
        { status: 400 },
      );
    }
    const control = mapControlAction(action);
    if (!control) {
      return NextResponse.json({ error: "Invalid scan control action." }, { status: 400 });
    }
    const existing = await getJob(id);
    if (!existing) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    if (!isCatalogJobKind(existing.kind)) {
      return NextResponse.json(
        { error: "Scan control is only available for catalog recorder jobs." },
        { status: 400 },
      );
    }
    const job = await setCatalogScanControl(id, control);
    const payload = toPublicJob(job);
    return NextResponse.json({
      ...payload,
      jobId: payload.job_id,
      catalog_scan_control: job.catalogScanControl,
    });
  } catch (err) {
    if (err instanceof CatalogRecorderDisabledError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof CatalogRecorderAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[catalog-recorder/jobs/[id]/control] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError("Could not update scan control.") },
      { status: 500 },
    );
  }
}
