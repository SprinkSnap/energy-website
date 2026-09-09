import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { recordWorkerHeartbeat } from "@/lib/hot2000/job-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertWorkerAuthorized(request);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
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
    const buildId =
      typeof body.build_id === "string"
        ? body.build_id
        : typeof body.buildId === "string"
          ? body.buildId
          : undefined;

    await recordWorkerHeartbeat(workerId.trim(), buildId?.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkerAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[hot2000/worker/heartbeat] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError("Could not record worker heartbeat.") },
      { status: 500 },
    );
  }
}
