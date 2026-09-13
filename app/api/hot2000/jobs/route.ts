import { NextRequest, NextResponse } from "next/server";
import {
  createJob,
  getJob,
  hashH2kContent,
} from "@/lib/hot2000/job-store";
import { assertParseableH2k } from "@/lib/hot2000/xml";
import { inputH2kFilenameFromExportName } from "@/lib/hot2000/export-filename";
import { isCatalogRecorderJobKind } from "@/lib/hot2000/catalog-recorder";
import {
  HOT2000_NORMAL_JOB_KINDS,
  type Hot2000NormalJobKind,
  toPublicJob,
} from "@/lib/hot2000/types";
import { getWorkerToken, sanitizePublicError } from "@/lib/hot2000/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const workerTokenConfigured = Boolean(getWorkerToken());
    if (!workerTokenConfigured) {
      return NextResponse.json(
        {
          error:
            "HOT2000 is not configured because HOT2000_WORKER_TOKEN is missing or empty.",
          code: "HOT2000_WORKER_TOKEN_MISSING",
        },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file field." },
        { status: 400 },
      );
    }
    if (!file.name.toLowerCase().endsWith(".h2k") && file.type !== "application/xml" && file.type !== "text/xml") {
      const nameOk = file.name.toLowerCase().endsWith(".h2k");
      if (!nameOk) {
        return NextResponse.json(
          { error: "File must be a .h2k XML house file." },
          { status: 400 },
        );
      }
    }

    const xml = await file.text();
    assertParseableH2k(xml);
    const sourceHash = hashH2kContent(xml);
    const kindRaw = String(form.get("kind") || "calculate").trim().toLowerCase();
    if (isCatalogRecorderJobKind(kindRaw)) {
      return NextResponse.json(
        { error: "Catalog recorder jobs are not accepted on this endpoint." },
        { status: 403 },
      );
    }
    const kind: Hot2000NormalJobKind = HOT2000_NORMAL_JOB_KINDS.includes(
      kindRaw as Hot2000NormalJobKind,
    )
      ? (kindRaw as Hot2000NormalJobKind)
      : "calculate";
    const exportFilenameRaw = String(form.get("export_filename") || "").trim();
    const inputFilenameRaw = String(form.get("input_filename") || "").trim();
    const exportFilename =
      kind === "full_house_report" && exportFilenameRaw ? exportFilenameRaw : undefined;
    const inputFilename =
      kind === "full_house_report"
        ? inputH2kFilenameFromExportName(
            inputFilenameRaw || exportFilenameRaw || file.name,
          )
        : undefined;
    const modelRevisionRaw = String(form.get("model_revision") || "").trim();
    const editorRevisionRaw = String(form.get("editor_revision") || "").trim();
    const modelRevision = modelRevisionRaw ? Number(modelRevisionRaw) : undefined;
    const editorRevision = editorRevisionRaw ? Number(editorRevisionRaw) : undefined;
    const job = await createJob(
      xml,
      sourceHash,
      kind,
      exportFilename,
      inputFilename,
      Number.isFinite(modelRevision) ? modelRevision : undefined,
      Number.isFinite(editorRevision) ? editorRevision : undefined,
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
    const message =
      err instanceof Error ? err.message : "Could not create calculation job.";
    console.error("[hot2000/jobs] POST failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError(message) },
      { status: 400 },
    );
  }
}
