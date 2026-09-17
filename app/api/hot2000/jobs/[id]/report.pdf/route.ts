import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/hot2000/job-store";
import { reportPdfFilenameFromExportName } from "@/lib/hot2000/export-filename";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  const pdfBase64 = job.reportPdfBase64?.trim();
  if (!pdfBase64) {
    return NextResponse.json(
      { error: "Full House Report PDF is not ready." },
      { status: 404 },
    );
  }

  const filename = reportPdfFilenameFromExportName(job.exportFilename, job.id);
  const bytes = Buffer.from(pdfBase64, "base64");
  if (bytes.length < 128) {
    return NextResponse.json(
      { error: "Stored Full House Report PDF is invalid." },
      { status: 500 },
    );
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
