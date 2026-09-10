import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { completeJob, getJob } from "@/lib/hot2000/job-store";
import { extractSocNetGJa } from "@/lib/hot2000/xml";
import { toPublicJob } from "@/lib/hot2000/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertWorkerAuthorized(request);
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const existingJob = await getJob(id);
    const jobKind = existingJob?.kind ?? "calculate";
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

    const calculatedXml =
      typeof body.calculated_xml === "string"
        ? body.calculated_xml
        : typeof body.calculatedXml === "string"
          ? body.calculatedXml
          : "";

    if (!calculatedXml.trim()) {
      return NextResponse.json(
        {
          error:
            jobKind === "full_house_report"
              ? "input_xml is required for Full House Report jobs."
              : "calculated_xml is required. Net GJ/a must be parsed from the saved calculated H2K.",
        },
        { status: 400 },
      );
    }

    const extracted = extractSocNetGJa(calculatedXml);
    const reportPdfBase64 =
      typeof body.report_pdf_base64 === "string"
        ? body.report_pdf_base64
        : typeof body.reportPdfBase64 === "string"
          ? body.reportPdfBase64
          : undefined;

    if (jobKind === "full_house_report") {
      if (!reportPdfBase64?.trim()) {
        return NextResponse.json(
          {
            error:
              "report_pdf_base64 is required for Full House Report jobs.",
          },
          { status: 400 },
        );
      }
    } else if (extracted == null || !Number.isFinite(extracted)) {
      return NextResponse.json(
        {
          error:
            "SOC Net GJ/a not found in calculated_xml at Results[@houseCode=SOC]/Annual/Consumption/@total.",
        },
        { status: 400 },
      );
    }

    const netGJa =
      extracted != null && Number.isFinite(extracted) ? extracted : 0;

    const job = await completeJob(
      id,
      workerId.trim(),
      netGJa,
      reportPdfBase64,
    );
    const payload = toPublicJob(job);
    return NextResponse.json({
      ...payload,
      jobId: payload.job_id,
      netGJa: payload.net_gja,
    });
  } catch (err) {
    if (err instanceof WorkerAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Could not complete job.";
    const status = message.includes("not found") ? 404 : 400;
    console.error("[hot2000/worker/complete] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError(message) },
      { status },
    );
  }
}
