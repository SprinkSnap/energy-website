import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { getJob, resolveJobScanState } from "@/lib/hot2000/job-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    assertWorkerAuthorized(request);
    const { id } = await context.params;
    const workerId = request.nextUrl.searchParams.get("workerId")?.trim() ?? "";
    if (!workerId) {
      return NextResponse.json(
        { error: "workerId is required." },
        { status: 400 },
      );
    }

    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const captureJson = await resolveJobScanState(job, workerId);
    if (!captureJson) {
      return NextResponse.json(
        { error: "Scan state not found for this job." },
        { status: 404 },
      );
    }

    return new NextResponse(captureJson, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (err) {
    if (err instanceof WorkerAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Could not read scan state.";
    const status = message.includes("not found") ? 404 : 400;
    console.error("[hot2000/worker/scan-state] GET failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError(message) },
      { status },
    );
  }
}
