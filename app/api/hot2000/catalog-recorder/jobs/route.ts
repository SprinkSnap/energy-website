import { NextRequest, NextResponse } from "next/server";
import {
  assertCatalogRecorderAuthorized,
  CatalogRecorderAuthError,
  CatalogRecorderDisabledError,
  CATALOG_RECORDER_JOB_KINDS,
  mapActionToJobKind,
  type CatalogRecorderJobKind,
} from "@/lib/hot2000/catalog-recorder";
import { getWorkerToken, sanitizePublicError } from "@/lib/hot2000/auth";
import type { CatalogBlobRef } from "@/lib/hot2000/catalog-blob";
import { assertValidCatalogAction } from "@/lib/hot2000/job-create-validation";
import { createJob, getJob, hashH2kContent } from "@/lib/hot2000/job-store";
import {
  assertRecorderJobFixture,
  recorderFixtureXml,
} from "@/lib/hot2000/recorder-fixture";
import { assertPhase2SectionId } from "@/lib/hot2000/phase2-sections";
import { toPublicJob } from "@/lib/hot2000/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let stage = "authorize";

  try {
    stage = "authorize";
    await assertCatalogRecorderAuthorized();

    stage = "check-worker-token";
    if (!getWorkerToken()) {
      return NextResponse.json(
        {
          error:
            "HOT2000 worker is not configured because HOT2000_WORKER_TOKEN is missing.",
          code: "HOT2000_WORKER_TOKEN_MISSING",
          stage,
        },
        { status: 503 },
      );
    }

    stage = "parse-request";
    const body = (await request.json()) as {
      action?: string;
      kind?: string;
      section?: string;
      sectionId?: string;
      sectionLabel?: string;
      controlId?: string;
      fixtureId?: string;
      retry?: string;
      sourceJobId?: string;
    };
    const action = String(body.action || "").trim();
    const kindRaw = String(body.kind || mapActionToJobKind(action) || "").trim();

    stage = "validate-action";
    if (!kindRaw || !CATALOG_RECORDER_JOB_KINDS.includes(kindRaw as CatalogRecorderJobKind)) {
      return NextResponse.json(
        {
          error:
            "Invalid catalog recorder action. Use start_scan, capture_screen, resume_scan, or run_probe.",
          code: "CATALOG_RECORDER_CREATE_FAILED",
          stage,
        },
        { status: 400 },
      );
    }

    const kind = kindRaw as CatalogRecorderJobKind;

    stage = "load-fixture";
    const xml = recorderFixtureXml();
    if (typeof xml !== "string" || !xml.trim()) {
      throw new Error("Bundled HOT2000 recorder fixture is unavailable.");
    }

    stage = "hash-fixture";
    const sourceHash = await hashH2kContent(xml);

    stage = "validate-fixture";
    assertRecorderJobFixture(xml, sourceHash);
    if (typeof xml !== "string" || xml.length === 0) {
      throw new Error("Bundled HOT2000 recorder fixture is unavailable.");
    }
    if (
      typeof sourceHash !== "string" ||
      sourceHash.length !== 64 ||
      !/^[a-f0-9]{64}$/.test(sourceHash)
    ) {
      throw new Error("Invalid H2K source hash.");
    }

    stage = "prepare-catalog-action";
    let catalogAction = action || kind;
    if (kind === "catalog_capture_section") {
      const sectionId = String(body.sectionId || body.section || "").trim();
      const section = assertPhase2SectionId(sectionId);
      const sectionOptions: Record<string, string | boolean | undefined> = {
        sectionId: section.id,
        sectionLabel: String(body.sectionLabel || section.label),
      };
      if (body.fixtureId) sectionOptions.fixtureId = String(body.fixtureId);
      if (action === "retry_section_gaps") sectionOptions.retryGaps = true;
      catalogAction = `capture_section:${JSON.stringify(sectionOptions)}`;
    }
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
    catalogAction = assertValidCatalogAction(catalogAction, kind);

    stage = "create-job";
    const sourceJobId = String(body.sourceJobId || "").trim();
    let continuationOptions: {
      catalogScanStateJson?: string;
      catalogScanStateRef?: CatalogBlobRef;
      parentJobId?: string;
      continuationOf?: string;
    } = {};
    if (sourceJobId) {
      const sourceJob = await getJob(sourceJobId);
      if (!sourceJob) {
        return NextResponse.json(
          { error: "Source scan job not found.", code: "SOURCE_JOB_NOT_FOUND", stage },
          { status: 400 },
        );
      }
      continuationOptions = {
        catalogScanStateJson: sourceJob.catalogScanStateJson,
        catalogScanStateRef: sourceJob.catalogScanStateRef,
        parentJobId: sourceJobId,
        continuationOf: sourceJob.catalogCaptureMeta?.scanId ?? sourceJob.continuationOf,
      };
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
      continuationOptions,
    );

    stage = "serialize-response";
    const payload = toPublicJob(job);
    return NextResponse.json(
      {
        ...payload,
        jobId: payload.job_id,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[catalog-recorder/jobs] POST failed", {
      stage,
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    if (err instanceof CatalogRecorderDisabledError) {
      return NextResponse.json(
        { error: err.message, stage },
        { status: 404 },
      );
    }
    if (err instanceof CatalogRecorderAuthError) {
      return NextResponse.json(
        { error: err.message, stage },
        { status: err.status },
      );
    }
    const message =
      err instanceof Error ? err.message : "Could not create catalog recorder job.";
    return NextResponse.json(
      {
        error: sanitizePublicError(message),
        code: "CATALOG_RECORDER_CREATE_FAILED",
        stage,
      },
      { status: 400 },
    );
  }
}
