/** Chunked UTF-8 JSON artifact storage helpers for HOT2000 catalog recorder DO blobs. */

export const CATALOG_BLOB_SCHEMA_VERSION = "1.0.0";
export const CATALOG_BLOB_CHUNK_BYTES = 512 * 1024;
export const CATALOG_BLOB_INLINE_MAX_BYTES = 256 * 1024;

export type CatalogBlobArtifactKind =
  | "scan-state"
  | "catalog-capture"
  | "navigation";

export type CatalogBlobRef = {
  schemaVersion: string;
  artifactId: string;
  artifactKind: CatalogBlobArtifactKind;
  chunkCount: number;
  byteLength: number;
  sha256: string;
  createdAt: string;
  jobId?: string;
  lineageId?: string;
};

export type CatalogBlobManifest = {
  schemaVersion: string;
  artifactId: string;
  artifactKind: CatalogBlobArtifactKind;
  chunkCount: number;
  byteLength: number;
  sha256: string;
  createdAt: string;
  jobId?: string;
  lineageId?: string;
};

export type CatalogBlobStorageAdapter = {
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export function shouldStoreCatalogBlobInline(byteLength: number): boolean {
  return byteLength <= CATALOG_BLOB_INLINE_MAX_BYTES;
}

export function catalogBlobManifestKey(artifactId: string): string {
  return `catalog-blob:${artifactId}:manifest`;
}

export function catalogBlobChunkKey(artifactId: string, index: number): string {
  return `catalog-blob:${artifactId}:chunk:${String(index).padStart(6, "0")}`;
}

export function chunkUtf8String(
  text: string,
  chunkBytes = CATALOG_BLOB_CHUNK_BYTES,
): string[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const chunks: string[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let offset = 0; offset < bytes.length; ) {
    let end = Math.min(offset + chunkBytes, bytes.length);
    while (end > offset && end < bytes.length) {
      try {
        decoder.decode(bytes.subarray(offset, end), { stream: true });
        break;
      } catch {
        end -= 1;
      }
    }
    chunks.push(decoder.decode(bytes.subarray(offset, end), { stream: false }));
    offset = end;
  }
  return chunks.length ? chunks : [""];
}

export async function sha256HexUtf8(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function newArtifactId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildNavigationSummary(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const screens = parsed.screens;
  const compactScreens: Record<string, unknown> = {};
  if (screens && typeof screens === "object") {
    for (const [key, screen] of Object.entries(
      screens as Record<string, unknown>,
    )) {
      if (!screen || typeof screen !== "object") continue;
      const entry = screen as Record<string, unknown>;
      compactScreens[key] = {
        title: entry.title,
        status: entry.status,
        section: entry.section,
        reachability: entry.reachability,
        controls: entry.controls,
        dropdowns: entry.dropdowns,
        options: entry.options,
        inaccessible: entry.inaccessible,
      };
    }
  }
  return {
    scanId: parsed.scanId,
    status: parsed.status,
    control: parsed.control,
    progressPercent: parsed.progressPercent,
    completionReason: parsed.completionReason,
    totals: parsed.totals,
    crawlCounters: parsed.crawlCounters,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.slice(0, 20)
      : undefined,
    screens: compactScreens,
    lastScreen: parsed.lastScreen,
    lastWindow: parsed.lastWindow,
    lastAction: parsed.lastAction,
  };
}

export function buildCoverageSummary(
  coverage: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!coverage || typeof coverage !== "object") return null;
  const summary =
    coverage.summary && typeof coverage.summary === "object"
      ? (coverage.summary as Record<string, unknown>)
      : {};
  return {
    resultClassification: coverage.resultClassification ?? summary.resultClassification,
    completionPercentage: summary.completionPercentage,
    screens: coverage.screens,
    navigation: coverage.navigation,
    interactive: coverage.interactive,
    gaps: coverage.gaps,
    schemaVersion: coverage.schemaVersion,
    scannerVersion: coverage.scannerVersion,
  };
}

export async function writeCatalogBlob(
  storage: CatalogBlobStorageAdapter,
  content: string,
  options: {
    artifactKind: CatalogBlobArtifactKind;
    jobId?: string;
    lineageId?: string;
    artifactId?: string;
  },
): Promise<CatalogBlobRef> {
  const byteLength = utf8ByteLength(content);
  const sha256 = await sha256HexUtf8(content);
  const chunks = chunkUtf8String(content);
  const artifactId = options.artifactId ?? newArtifactId();
  const createdAt = new Date().toISOString();

  for (let index = 0; index < chunks.length; index += 1) {
    await storage.put(catalogBlobChunkKey(artifactId, index), chunks[index]);
  }

  const manifest: CatalogBlobManifest = {
    schemaVersion: CATALOG_BLOB_SCHEMA_VERSION,
    artifactId,
    artifactKind: options.artifactKind,
    chunkCount: chunks.length,
    byteLength,
    sha256,
    createdAt,
    jobId: options.jobId,
    lineageId: options.lineageId,
  };
  await storage.put(
    catalogBlobManifestKey(artifactId),
    JSON.stringify(manifest),
  );

  return {
    schemaVersion: CATALOG_BLOB_SCHEMA_VERSION,
    artifactId,
    artifactKind: options.artifactKind,
    chunkCount: chunks.length,
    byteLength,
    sha256,
    createdAt,
    jobId: options.jobId,
    lineageId: options.lineageId,
  };
}

export async function readCatalogBlob(
  storage: CatalogBlobStorageAdapter,
  ref: CatalogBlobRef,
): Promise<string> {
  const manifestRaw = await storage.get(catalogBlobManifestKey(ref.artifactId));
  if (!manifestRaw) {
    throw new Error(`Catalog blob manifest missing for ${ref.artifactId}.`);
  }
  const manifest = JSON.parse(manifestRaw) as CatalogBlobManifest;
  if (manifest.chunkCount !== ref.chunkCount) {
    throw new Error(
      `Catalog blob chunk count mismatch for ${ref.artifactId}.`,
    );
  }
  if (manifest.byteLength !== ref.byteLength) {
    throw new Error(
      `Catalog blob byte length mismatch for ${ref.artifactId}.`,
    );
  }
  if (manifest.sha256 !== ref.sha256) {
    throw new Error(`Catalog blob sha256 mismatch for ${ref.artifactId}.`);
  }

  const parts: string[] = [];
  for (let index = 0; index < manifest.chunkCount; index += 1) {
    const chunk = await storage.get(catalogBlobChunkKey(ref.artifactId, index));
    if (chunk == null) {
      throw new Error(
        `Catalog blob chunk ${index} missing for ${ref.artifactId}.`,
      );
    }
    parts.push(chunk);
  }
  const content = parts.join("");
  const sha256 = await sha256HexUtf8(content);
  if (sha256 !== ref.sha256) {
    throw new Error(`Catalog blob reassembly sha256 mismatch for ${ref.artifactId}.`);
  }
  return content;
}

export class CatalogBlobWriteError extends Error {
  readonly artifactKind: CatalogBlobArtifactKind;
  readonly byteLength: number;
  readonly chunkCount: number;
  readonly operation: string;
  readonly cause: unknown;

  constructor(
    message: string,
    details: {
      artifactKind: CatalogBlobArtifactKind;
      byteLength: number;
      chunkCount: number;
      operation: string;
      cause: unknown;
    },
  ) {
    super(message);
    this.name = "CatalogBlobWriteError";
    this.artifactKind = details.artifactKind;
    this.byteLength = details.byteLength;
    this.chunkCount = details.chunkCount;
    this.operation = details.operation;
    this.cause = details.cause;
  }
}

export function catalogBlobWriteFailureMessage(
  artifactKind: CatalogBlobArtifactKind,
  byteLength: number,
  chunkCount: number,
): string {
  return `Failed to store ${artifactKind} artifact (${byteLength} bytes, ${chunkCount} chunks).`;
}

export async function deleteCatalogBlob(
  storage: CatalogBlobStorageAdapter,
  ref: Pick<CatalogBlobRef, "artifactId" | "chunkCount">,
): Promise<void> {
  for (let index = 0; index < ref.chunkCount; index += 1) {
    await storage.delete(catalogBlobChunkKey(ref.artifactId, index));
  }
  await storage.delete(catalogBlobManifestKey(ref.artifactId));
}

export class MemoryCatalogBlobStorage implements CatalogBlobStorageAdapter {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}
