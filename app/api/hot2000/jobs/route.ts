import { NextRequest, NextResponse } from "next/server";
import {
  createJob,
  getJob,
  hashH2kContent,
} from "@/lib/hot2000/job-store";
import { assertParseableH2k } from "@/lib/hot2000/xml";
import { HOT2000_JOB_KINDS, type Hot2000JobKind, toPublicJob } from "@/lib/hot2000/types";
import { sanitizePublicError } from "@/lib/hot2000/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
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
    const kind = (HOT2000_JOB_KINDS.includes(kindRaw as Hot2000JobKind)
      ? kindRaw
      : "calculate") as Hot2000JobKind;
    const exportFilenameRaw = String(form.get("export_filename") || "").trim();
    const exportFilename =
      kind === "full_house_report" && exportFilenameRaw ? exportFilenameRaw : undefined;
    const job = await createJob(xml, sourceHash, kind, exportFilename);

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
