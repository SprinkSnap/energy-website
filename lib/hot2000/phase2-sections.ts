/** Canonical Phase 2 HOT2000 section list (stable ids + user-facing labels). */

export type Phase2Section = {
  id: string;
  label: string;
};

export const PHASE2_SECTIONS: readonly Phase2Section[] = [
  { id: "general", label: "General" },
  { id: "info", label: "Info" },
  { id: "specifications", label: "Specifications" },
  { id: "weather", label: "Weather" },
  { id: "fuel-cost", label: "Fuel Cost" },
  { id: "unit-mode", label: "Unit & Mode" },
  { id: "window-tightness", label: "Window Tightness" },
  { id: "code-summary", label: "Code Summary" },
  { id: "temperatures", label: "Temperatures" },
  { id: "base-loads", label: "Base Loads" },
  { id: "generation", label: "Generation" },
  { id: "natural-air-infiltration", label: "Natural Air Infiltration" },
  { id: "ventilation", label: "Ventilation" },
  { id: "heating-cooling-system", label: "Heating/Cooling System" },
  { id: "domestic-hot-water", label: "Domestic Hot Water" },
  { id: "program", label: "Program" },
] as const;

export type Phase2SectionId = (typeof PHASE2_SECTIONS)[number]["id"];

export const PHASE2_SECTION_IDS = PHASE2_SECTIONS.map((section) => section.id);

export function getPhase2Section(sectionId: string): Phase2Section | undefined {
  return PHASE2_SECTIONS.find((section) => section.id === sectionId);
}

export function assertPhase2SectionId(sectionId: string): Phase2Section {
  const section = getPhase2Section(sectionId);
  if (!section) {
    throw new Error(
      `Invalid sectionId "${sectionId}". Expected one of: ${PHASE2_SECTION_IDS.join(", ")}.`,
    );
  }
  return section;
}

export type SectionCoverageStatus =
  | "not_scanned"
  | "running"
  | "complete"
  | "complete_with_gaps"
  | "partial"
  | "failed"
  | "paused";

export type SectionCoverageEntry = {
  sectionId: string;
  sectionLabel: string;
  status: SectionCoverageStatus;
  jobId?: string;
  updatedAt?: string;
  resultClassification?: string;
};

export function emptySectionCoverage(): Record<string, SectionCoverageEntry> {
  const coverage: Record<string, SectionCoverageEntry> = {};
  for (const section of PHASE2_SECTIONS) {
    coverage[section.id] = {
      sectionId: section.id,
      sectionLabel: section.label,
      status: "not_scanned",
    };
  }
  return coverage;
}

export function formatSectionCoverageStatus(status?: string): string {
  switch (status) {
    case "not_scanned":
      return "Not scanned";
    case "running":
      return "Running";
    case "complete":
      return "Complete";
    case "complete_with_gaps":
      return "Complete with gaps";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    default:
      return status || "Not scanned";
  }
}
