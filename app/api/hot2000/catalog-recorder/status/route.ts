import { NextResponse } from "next/server";
import {
  assertCatalogRecorderAuthorized,
  CatalogRecorderAuthError,
  CatalogRecorderDisabledError,
  isCatalogRecorderEnabled,
} from "@/lib/hot2000/catalog-recorder";
import { getWorkerToken, sanitizePublicError } from "@/lib/hot2000/auth";
import { getFixtureManifest } from "@/lib/hot2000/fixture-manifest";
import { getQueueStatus } from "@/lib/hot2000/job-store";
import { GENERATED_CATALOG_VERSION } from "@/lib/hot2000/recorder-state";
import { getRecorderState } from "@/lib/hot2000/runtime-recorder-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    await assertCatalogRecorderAuthorized();
    const [status, recorder] = await Promise.all([
      getQueueStatus(),
      getRecorderState(),
    ]);
    const fixtureManifest = getFixtureManifest();

    return NextResponse.json({
      recorder_enabled: isCatalogRecorderEnabled(),
      worker_token_configured: Boolean(getWorkerToken()),
      workers_online: status.workersOnline,
      workers: status.workers.map((worker) => ({
        worker_id: worker.workerId,
        build_id: worker.buildId,
        last_seen: worker.lastSeen,
      })),
      queued_jobs: status.queuedJobs,
      running_jobs: status.runningJobs,
      raw_manifest: recorder.rawManifest ?? null,
      navigation: recorder.navigationSummary ?? recorder.navigation ?? null,
      coverage: recorder.coverage ?? null,
      raw_capture_version: recorder.captureVersion ?? null,
      generated_catalog_version:
        recorder.generatedCatalogVersion ?? GENERATED_CATALOG_VERSION,
      fixture_manifest: fixtureManifest,
      probe_mappings: recorder.probeMappings ?? {},
      probe_conflicts: recorder.probeConflicts ?? null,
    });
  } catch (err) {
    if (err instanceof CatalogRecorderDisabledError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof CatalogRecorderAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[catalog-recorder/status] failed:", err);
    return NextResponse.json(
      { error: sanitizePublicError("Could not read recorder status.") },
      { status: 500 },
    );
  }
}
