import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const { applyJobFail } = await import("../../lib/hot2000/job-logic.ts");
const { jobFailureMessage, toPublicJob } = await import("../../lib/hot2000/types.ts");

function baseJob(kind) {
  return {
    id: "job-test",
    kind,
    status: "running",
    stage: "opening",
    progress: 40,
    message: "Opening H2K model…",
    sourceHash: "a".repeat(64),
    inputXml: "<HouseFile />",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    workerId: "worker-1",
  };
}

// Failed catalog job exposes actual error and preserves stage.
{
  const job = baseJob("catalog_capture");
  applyJobFail(job, "worker-1", "HOT2000 main window not found [worker 2026-09-11j]");
  assert.equal(job.status, "failed");
  assert.equal(job.failedFromStage, "opening");
  assert.equal(job.message, "Automatic catalog scan failed");
  assert.match(job.error, /main window not found/);
  assert.doesNotMatch(job.message, /Calculation failed/);

  const publicJob = toPublicJob(job);
  assert.equal(publicJob.error, job.error);
  assert.equal(publicJob.failed_from_stage, "opening");
  assert.equal(publicJob.worker_id, "worker-1");
}

// Calculate jobs still use calculation failure summary.
{
  const job = baseJob("calculate");
  applyJobFail(job, "worker-1", "SOC Net GJ/a not found");
  assert.equal(job.message, "Calculation failed");
  assert.equal(job.failedFromStage, "opening");
}

// Full house report failure summary.
{
  assert.equal(jobFailureMessage("full_house_report"), "Full House Report failed");
  assert.equal(jobFailureMessage("catalog_probe"), "Catalog probe failed");
}

// Recorder UI renders failure details.
{
  const client = read("components/admin/hot2000-recorder-client.tsx");
  assert.match(client, /Failure reason:/);
  assert.match(client, /currentJob\.error/);
  assert.match(client, /No detailed worker error was returned/);
  assert.match(client, /Failed during:/);
  assert.match(client, /Worker build:/);
  assert.match(client, /failed_from_stage/);
}

// Worker logs catalog failures with job metadata (without printing the token).
{
  const worker = read("workers/hot2000/worker.py");
  assert.match(worker, /CATALOG SCAN FAILED/);
  assert.match(worker, /JOB_PROGRESS_STAGES/);
  const catalogFailureBlock = worker.match(
    /if job_kind in CATALOG_JOB_KINDS:[\s\S]*?fail\(job_id/,
  )?.[0] ?? "";
  assert.doesNotMatch(catalogFailureBlock, /WORKER_TOKEN/);
  assert.doesNotMatch(catalogFailureBlock, /get_worker_token/);
}

// Sanitization still strips secrets and paths.
{
  const auth = read("lib/hot2000/auth.ts");
  assert.match(auth, /Bearer\\s\+\\S\+/);
  assert.match(auth, /\[path\]/);
}

console.log("catalog-recorder-failure-diagnostics.test.mjs passed");
