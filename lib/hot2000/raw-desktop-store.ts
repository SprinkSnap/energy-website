import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RAW_DESKTOP_ROOT = path.join(
  process.cwd(),
  "h2k-web-editor",
  "catalog",
  "raw-desktop",
);

export function rawDesktopRoot(): string {
  return RAW_DESKTOP_ROOT;
}

export async function ensureRawDesktopDir(): Promise<string> {
  await mkdir(RAW_DESKTOP_ROOT, { recursive: true });
  await mkdir(path.join(RAW_DESKTOP_ROOT, "dialogs"), { recursive: true });
  return RAW_DESKTOP_ROOT;
}

export async function persistCatalogCapture(
  captureJson: string,
  meta: {
    section?: string;
    hot2000Version?: string;
    workerId?: string;
    capturedAt?: string;
  } = {},
): Promise<{ manifestPath: string; sectionPath?: string }> {
  await ensureRawDesktopDir();
  const parsed = JSON.parse(captureJson) as Record<string, unknown>;
  const section =
    meta.section ||
    (typeof parsed.section === "string" ? parsed.section : "unknown");
  const capturedAt = meta.capturedAt || new Date().toISOString();

  const manifestPath = path.join(RAW_DESKTOP_ROOT, "manifest.json");
  let manifest: Record<string, unknown> = {
    captureVersion: "1.0.0",
    recorderVersion: "2026.09.12.1",
    hot2000Version: meta.hot2000Version || parsed.hot2000Version || null,
    lastCapturedAt: capturedAt,
    worker: meta.workerId || parsed.worker || null,
    sections: {},
  };
  try {
    const existing = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    manifest = { ...existing, ...manifest };
  } catch {
    // fresh manifest
  }

  const sections =
    (manifest.sections as Record<string, unknown> | undefined) ?? {};
  sections[section] = {
    file: section === "windows" ? "windows.json" : `${section}.json`,
    capturedAt,
    controls:
      Array.isArray(parsed.controls) ? parsed.controls.length : undefined,
  };
  manifest.sections = sections;
  manifest.lastCapturedAt = capturedAt;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const sectionFile =
    section === "windows" ? "windows.json" : `${section}.json`;
  const sectionPath = path.join(RAW_DESKTOP_ROOT, sectionFile);
  await writeFile(sectionPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  if (Array.isArray(parsed.inaccessibleControls) && parsed.inaccessibleControls.length) {
    const inaccessiblePath = path.join(RAW_DESKTOP_ROOT, "inaccessible-controls.json");
    let inaccessible: unknown[] = [];
    try {
      const existing = JSON.parse(await readFile(inaccessiblePath, "utf8")) as unknown[];
      inaccessible = Array.isArray(existing) ? existing : [];
    } catch {
      // fresh
    }
    inaccessible.push(...parsed.inaccessibleControls);
    await writeFile(
      inaccessiblePath,
      `${JSON.stringify(inaccessible, null, 2)}\n`,
      "utf8",
    );
  }

  return { manifestPath, sectionPath };
}
