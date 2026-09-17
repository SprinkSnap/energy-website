import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkerAuthorized,
  sanitizePublicError,
  WorkerAuthError,
} from "@/lib/hot2000/auth";
import { getCatalogScanControl } from "@/lib/hot2000/job-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    assertWorkerAuthorized(request);
    const { id } = await context.params;
    const workerId =
      request.headers.get("x-worker-id")?.trim() ||
      request.nextUrl.searchParams.get("workerId")?.trim() ||
      "";
    if (!workerId) {
      return NextResponse.json({ error: "workerId is required." }, { status: 400 });
    }
    const control = await getCatalogScanControl(id, workerId);
    return NextResponse.json({ control });
  } catch (err) {
    if (err instanceof WorkerAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Could not read scan control.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: sanitizePublicError(message) }, { status });
  }
}
