import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { completeJob } from "@/lib/hot2000/job-store";
import { extractSocNetGJa } from "@/lib/hot2000/xml";
import { toPublicJob } from "@/lib/hot2000/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertWorkerAuthorized(request);
    const { id } = await context.params;
    const body = await request.json();
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

    let netGJa =
      typeof body.net_gja === "number"
        ? body.net_gja
        : typeof body.netGJa === "number"
          ? body.netGJa
          : null;

    const calculatedXml =
      typeof body.calculated_xml === "string"
        ? body.calculated_xml
        : typeof body.calculatedXml === "string"
          ? body.calculatedXml
          : "";

    if (netGJa == null && calculatedXml) {
      netGJa = extractSocNetGJa(calculatedXml);
    }

    if (netGJa == null || !Number.isFinite(netGJa)) {
      return NextResponse.json(
        {
          error:
            "Missing Net GJ/a result. Provide net_gja or calculated_xml with SOC results.",
        },
        { status: 400 },
      );
    }

    const job = completeJob(id, workerId.trim(), netGJa);
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
