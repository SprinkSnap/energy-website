import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/hot2000/job-store";
import { toPublicJob } from "@/lib/hot2000/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const payload = toPublicJob(job);
  return NextResponse.json({
    ...payload,
    jobId: payload.job_id,
    netGJa: payload.net_gja,
  });
}
