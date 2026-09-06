import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { getJobInputXml } from "@/lib/hot2000/job-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    assertWorkerAuthorized(request);
    const { id } = await context.params;
    const workerId =
      request.headers.get("x-worker-id") ??
      request.nextUrl.searchParams.get("worker_id") ??
      "";
    if (!workerId.trim()) {
      return NextResponse.json(
        { error: "x-worker-id header is required." },
        { status: 400 },
      );
    }

    const xml = getJobInputXml(id, workerId.trim());
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="input.h2k"`,
      },
    });
  } catch (err) {
    if (err instanceof WorkerAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Input not available.";
    const status = message.includes("not found") ? 404 : 403;
    console.error("[hot2000/worker/input] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError(message) },
      { status },
    );
  }
}
