import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertCatalogRecorderAuthorized,
  CatalogRecorderAuthError,
  CatalogRecorderDisabledError,
  CATALOG_RECORDER_JOB_KINDS,
  mapActionToJobKind,
  type CatalogRecorderJobKind,
} from "@/lib/hot2000/catalog-recorder";
import { getWorkerToken, sanitizePublicError } from "@/lib/hot2000/auth";
import { createJob, hashH2kContent } from "@/lib/hot2000/job-store";
import { toPublicJob } from "@/lib/hot2000/types";

export const runtime = "nodejs";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "workers",
  "hot2000",
  "fixtures",
  "baseline-general.h2k",
);

async function recorderFixtureXml(): Promise<string> {
  try {
    return await readFile(FIXTURE_PATH, "utf8");
  } catch {
    const fallback = path.join(process.cwd(), "h2k-web-editor", "template.h2k");
    return readFile(fallback, "utf8");
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertCatalogRecorderAuthorized();

    if (!getWorkerToken()) {
      return NextResponse.json(
        {
          error:
            "HOT2000 worker is not configured because HOT2000_WORKER_TOKEN is missing.",
          code: "HOT2000_WORKER_TOKEN_MISSING",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      action?: string;
      kind?: string;
      section?: string;
      controlId?: string;
      fixtureId?: string;
      retry?: string;
    };
    const action = String(body.action || "").trim();
    const kindRaw = String(body.kind || mapActionToJobKind(action) || "").trim();

    if (!kindRaw || !CATALOG_RECORDER_JOB_KINDS.includes(kindRaw as CatalogRecorderJobKind)) {
      return NextResponse.json(
        {
          error:
            "Invalid catalog recorder action. Use start_scan, capture_screen, resume_scan, or run_probe.",
        },
        { status: 400 },
      );
    }

    const kind = kindRaw as CatalogRecorderJobKind;
    const xml = await recorderFixtureXml();
    const sourceHash = hashH2kContent(xml);

    let catalogAction = action || kind;
    if (kind === "catalog_probe") {
      const probeOptions: Record<string, string | undefined> = {};
      if (body.section) probeOptions.sectionFilter = String(body.section);
      if (body.controlId) probeOptions.controlId = String(body.controlId);
      if (body.fixtureId) probeOptions.fixtureId = String(body.fixtureId);
      if (action === "retry_ambiguous") probeOptions.retry = "ambiguous";
      if (action === "retry_failed") probeOptions.retry = "failed";
      if (action === "probe_section" && body.section) {
        probeOptions.sectionFilter = String(body.section);
      }
      catalogAction = `probe:${JSON.stringify(probeOptions)}`;
    }

    const job = await createJob(
      xml,
      sourceHash,
      kind,
      undefined,
      undefined,
      undefined,
      undefined,
      catalogAction,
    );

    const payload = toPublicJob(job);
    return NextResponse.json(
      {
        ...payload,
        jobId: payload.job_id,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof CatalogRecorderDisabledError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof CatalogRecorderAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error ? err.message : "Could not create catalog recorder job.";
    console.error("[catalog-recorder/jobs] POST failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError(message) },
      { status: 400 },
    );
  }
}
