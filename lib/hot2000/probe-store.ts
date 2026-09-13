import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CATALOG_ROOT = path.join(process.cwd(), "h2k-web-editor", "catalog");
const MAPPINGS_DIR = path.join(CATALOG_ROOT, "mappings");
const EVIDENCE_DIR = path.join(CATALOG_ROOT, "probe-evidence");
const FIXTURES_DIR = path.join(CATALOG_ROOT, "fixtures");

export type ProbeMappingEntry = {
  controlId: string;
  screenKey?: string;
  label?: string;
  fixtureId?: string;
  mapping?: {
    path?: string;
    type?: string;
    confidence?: string;
  };
  evidence?: Record<string, unknown>;
  status?: string;
  sideEffects?: Array<Record<string, unknown>>;
  timestamp?: string;
};

export type ProbeSummary = {
  probeVersion?: string;
  status?: string;
  fixtureId?: string;
  totals?: Record<string, number>;
  completed?: ProbeMappingEntry[];
  skipped?: Array<Record<string, unknown>>;
  conflicts?: Array<Record<string, unknown>>;
};

export async function ensureProbeDirs(): Promise<void> {
  await mkdir(MAPPINGS_DIR, { recursive: true });
  await mkdir(EVIDENCE_DIR, { recursive: true });
}

export async function readFixtureManifest(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path.join(FIXTURES_DIR, "manifest.json"), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function readProbeMappings(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  try {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(MAPPINGS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json") || file === "conflicts.json") continue;
      try {
        const raw = await readFile(path.join(MAPPINGS_DIR, file), "utf8");
        result[file.replace(/\.json$/, "")] = JSON.parse(raw);
      } catch {
        // skip invalid
      }
    }
  } catch {
    // empty
  }
  return result;
}

export async function readProbeConflicts(): Promise<unknown[] | null> {
  try {
    const raw = await readFile(path.join(MAPPINGS_DIR, "conflicts.json"), "utf8");
    const data = JSON.parse(raw) as { conflicts?: unknown[] } | unknown[];
    if (Array.isArray(data)) return data;
    return data.conflicts ?? [];
  } catch {
    return null;
  }
}

export async function persistProbeResults(
  probeJson: string,
  meta: {
    hot2000Version?: string;
    workerId?: string;
    fixtureId?: string;
  } = {},
): Promise<{ mappingsDir: string; evidenceDir: string }> {
  await ensureProbeDirs();
  const parsed = JSON.parse(probeJson) as ProbeSummary & {
    completed?: ProbeMappingEntry[];
    conflicts?: Array<Record<string, unknown>>;
  };

  if (Array.isArray(parsed.completed)) {
    const bySection: Record<string, ProbeMappingEntry[]> = {};
    for (const entry of parsed.completed) {
      const section = inferSectionFromPath(entry.mapping?.path) || "general";
      bySection[section] = bySection[section] || [];
      bySection[section].push({
        ...entry,
        timestamp: entry.timestamp || new Date().toISOString(),
        fixtureId: entry.fixtureId || meta.fixtureId,
      });
    }
    for (const [section, entries] of Object.entries(bySection)) {
      const file = sectionFileName(section);
      let existing: ProbeMappingEntry[] = [];
      try {
        const prior = JSON.parse(
          await readFile(path.join(MAPPINGS_DIR, file), "utf8"),
        ) as { mappings?: ProbeMappingEntry[] };
        existing = prior.mappings ?? [];
      } catch {
        // fresh
      }
      const merged = mergeMappings(existing, entries);
      await writeFile(
        path.join(MAPPINGS_DIR, file),
        `${JSON.stringify(
          {
            section,
            probeVersion: parsed.probeVersion || "1.0.0",
            hot2000Version: meta.hot2000Version,
            updatedAt: new Date().toISOString(),
            mappings: merged,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    }
  }

  if (Array.isArray(parsed.conflicts) && parsed.conflicts.length) {
    const prior = (await readProbeConflicts()) ?? [];
    await writeFile(
      path.join(MAPPINGS_DIR, "conflicts.json"),
      `${JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          conflicts: [...prior, ...parsed.conflicts],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  const summaryPath = path.join(MAPPINGS_DIR, "probe-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        ...parsed,
        persistedAt: new Date().toISOString(),
        worker: meta.workerId,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { mappingsDir: MAPPINGS_DIR, evidenceDir: EVIDENCE_DIR };
}

function sectionFileName(section: string): string {
  const map: Record<string, string> = {
    general: "general.json",
    weather: "weather.json",
    specifications: "specifications.json",
    ventilation: "ventilation.json",
    "heating-cooling": "heating-cooling.json",
    "domestic-hot-water": "domestic-hot-water.json",
    program: "program.json",
    "envelope-components": "envelope-components.json",
  };
  return map[section] || `${section}.json`;
}

function inferSectionFromPath(xpath?: string): string | null {
  if (!xpath) return null;
  if (xpath.includes("/Weather/")) return "weather";
  if (xpath.includes("/Ventilation/")) return "ventilation";
  if (xpath.includes("/HeatingCooling/")) return "heating-cooling";
  if (xpath.includes("/HotWater/")) return "domestic-hot-water";
  if (xpath.includes("/Components/")) return "envelope-components";
  if (xpath.includes("/ProgramInformation/")) return "general";
  return null;
}

function mergeMappings(
  existing: ProbeMappingEntry[],
  incoming: ProbeMappingEntry[],
): ProbeMappingEntry[] {
  const byId = new Map(existing.map((e) => [e.controlId, e]));
  for (const entry of incoming) {
    byId.set(entry.controlId, entry);
  }
  return Array.from(byId.values());
}
