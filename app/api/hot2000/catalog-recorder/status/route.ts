import { NextResponse } from "next/server";
import {
  assertCatalogRecorderAuthorized,
  CatalogRecorderAuthError,
  CatalogRecorderDisabledError,
  isCatalogRecorderEnabled,
} from "@/lib/hot2000/catalog-recorder";
import { getWorkerToken, sanitizePublicError } from "@/lib/hot2000/auth";
import { getQueueStatus } from "@/lib/hot2000/job-store";
import { readRawCoverage, readRawNavigation } from "@/lib/hot2000/raw-desktop-store";
import {
  readFixtureManifest,
  readProbeConflicts,
  readProbeMappings,
} from "@/lib/hot2000/probe-store";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

async function readRawManifest(): Promise<Record<string, unknown> | null> {
  try {
    const manifestPath = path.join(
      process.cwd(),
      "h2k-web-editor",
      "catalog",
      "raw-desktop",
      "manifest.json",
    );
    const raw = await readFile(manifestPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    await assertCatalogRecorderAuthorized();
    const status = await getQueueStatus();
    const rawManifest = await readRawManifest();
    const navigation = await readRawNavigation();
    const coverage = await readRawCoverage();
    const fixtureManifest = await readFixtureManifest();
    const probeMappings = await readProbeMappings();
    const probeConflicts = await readProbeConflicts();

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
      raw_manifest: rawManifest,
      navigation,
      coverage,
      raw_capture_version: rawManifest?.captureVersion ?? null,
      generated_catalog_version: "2.0.0",
      fixture_manifest: fixtureManifest,
      probe_mappings: probeMappings,
      probe_conflicts: probeConflicts,
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
