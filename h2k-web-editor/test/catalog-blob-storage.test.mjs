import assert from "node:assert/strict";
import {
  CATALOG_BLOB_CHUNK_BYTES,
  CATALOG_BLOB_INLINE_MAX_BYTES,
  MemoryCatalogBlobStorage,
  catalogBlobChunkKey,
  chunkUtf8String,
  deleteCatalogBlob,
  readCatalogBlob,
  shouldStoreCatalogBlobInline,
  utf8ByteLength,
  writeCatalogBlob,
} from "../../lib/hot2000/catalog-blob.ts";
import { applyJobProgress } from "../../lib/hot2000/job-logic.ts";
import { applyCaptureToRecorderState } from "../../lib/hot2000/recorder-state-logic.ts";

function makeLargeJson(targetBytes) {
  const payload = { items: [] };
  while (utf8ByteLength(JSON.stringify(payload)) < targetBytes) {
    payload.items.push({
      id: `item-${payload.items.length}`,
      label: "HOT2000 desktop option label",
      options: Array.from({ length: 20 }, (_, index) => ({
        index,
        label: `Option ${index}`,
      })),
    });
  }
  return JSON.stringify(payload);
}

{
  const storage = new MemoryCatalogBlobStorage();
  const content = makeLargeJson(2 * 1024 * 1024 + 64);
  assert.ok(utf8ByteLength(content) > 2 * 1024 * 1024);
  assert.equal(shouldStoreCatalogBlobInline(utf8ByteLength(content)), false);

  const ref = await writeCatalogBlob(storage, content, {
    artifactKind: "scan-state",
    jobId: "job-large-1",
    lineageId: "scan-1",
  });
  assert.ok(ref.chunkCount > 1);
  assert.equal(ref.byteLength, utf8ByteLength(content));

  const roundTrip = await readCatalogBlob(storage, ref);
  assert.equal(roundTrip, content);
}

{
  const storage = new MemoryCatalogBlobStorage();
  const first = await writeCatalogBlob(storage, makeLargeJson(700_000), {
    artifactKind: "scan-state",
    jobId: "job-1",
  });
  const second = await writeCatalogBlob(storage, makeLargeJson(900_000), {
    artifactKind: "scan-state",
    jobId: "job-1",
  });
  await deleteCatalogBlob(storage, first);
  const latest = await readCatalogBlob(storage, second);
  assert.ok(latest.length > 0);
  await assert.rejects(() => readCatalogBlob(storage, first));
}

{
  const storage = new MemoryCatalogBlobStorage();
  const content = makeLargeJson(600_000);
  const ref = await writeCatalogBlob(storage, content, {
    artifactKind: "catalog-capture",
    jobId: "job-2",
  });
  const tampered = { ...ref, sha256: "0".repeat(64) };
  await assert.rejects(() => readCatalogBlob(storage, tampered), /sha256 mismatch/);
}

{
  const chunks = chunkUtf8String("abcdefgh", 3);
  assert.equal(chunks.join(""), "abcdefgh");
  assert.ok(chunks.length >= 2);
  assert.ok(
    chunks.every((chunk) => utf8ByteLength(chunk) <= CATALOG_BLOB_CHUNK_BYTES),
  );
}

{
  const navigationJson = makeLargeJson(2_500_000);
  const parsed = JSON.parse(navigationJson);
  parsed.screens = { weather: { title: "Weather", status: "captured" } };
  parsed.coverage = { summary: { completionPercentage: 55 } };
  const state = applyCaptureToRecorderState(
    null,
    JSON.stringify(parsed),
    {},
    "job-nav-large",
    {
      schemaVersion: "1.0.0",
      artifactId: "artifact-nav",
      artifactKind: "navigation",
      chunkCount: 5,
      byteLength: utf8ByteLength(navigationJson),
      sha256: "abc",
      createdAt: new Date().toISOString(),
    },
  );
  assert.equal(state.latestNavigationJobId, "job-nav-large");
  assert.equal(state.navigation, null);
  assert.ok(state.navigationSummary?.screens?.weather);
  assert.equal(state.navigationRef?.artifactId, "artifact-nav");
  const serialized = JSON.stringify(state);
  assert.ok(utf8ByteLength(serialized) < CATALOG_BLOB_INLINE_MAX_BYTES);
}

{
  const storage = new MemoryCatalogBlobStorage();
  const committed = await writeCatalogBlob(storage, makeLargeJson(650_000), {
    artifactKind: "scan-state",
    jobId: "job-interrupted",
    artifactId: "artifact-interrupted",
  });
  const partialId = "artifact-partial";
  const partialChunks = chunkUtf8String(makeLargeJson(700_000));
  for (let index = 0; index < partialChunks.length; index += 1) {
    await storage.put(catalogBlobChunkKey(partialId, index), partialChunks[index]);
  }
  await assert.rejects(
    () =>
      readCatalogBlob(storage, {
        ...committed,
        artifactId: partialId,
        chunkCount: partialChunks.length,
      }),
    /manifest missing|chunk count mismatch/,
  );
  const stillValid = await readCatalogBlob(storage, committed);
  assert.ok(stillValid.length > 0);
}

{
  const largeScanState = makeLargeJson(2_200_000);
  const job = applyJobProgress(
    {
      id: "job-compact",
      kind: "catalog_capture",
      status: "running",
      stage: "scanning",
      progress: 45,
      message: "Scanning",
      sourceHash: "abc",
      inputXml: "<HouseFile/>",
      workerId: "worker-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    "worker-1",
    "scanning",
    { catalogScanStateJson: largeScanState },
  );
  assert.equal(job.catalogScanStateJson, undefined);
  assert.ok(utf8ByteLength(JSON.stringify(job)) < CATALOG_BLOB_INLINE_MAX_BYTES);
}

{
  const doSource = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../../workers/hot2000-job-queue.ts", import.meta.url), "utf8"),
  );
  assert.match(doSource, /catalogScanStateRef/);
  assert.match(doSource, /catalogCaptureRef/);
  assert.match(doSource, /writeCatalogBlob/);
  assert.doesNotMatch(doSource, /job\.catalogScanStateJson = body\.captureJson/);
}

console.log("catalog-blob-storage.test.mjs passed");
