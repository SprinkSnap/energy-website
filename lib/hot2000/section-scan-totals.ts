import type { CatalogCaptureMeta } from "@/lib/hot2000/types";
import { getPhase2Section } from "@/lib/hot2000/phase2-sections";

type RatioTotals = {
  completed: number;
  discovered: number;
};

export type ScanTotalsView = {
  result: string;
  progressPct: number;
  crawlDidNotStart: boolean;
  failedDuring?: string;
  screens: RatioTotals;
  states: RatioTotals;
  actions: RatioTotals;
  textFields: RatioTotals;
  tabs: RatioTotals;
  combos: RatioTotals;
  dropdownOptions: RatioTotals;
  checkboxBranches: RatioTotals;
  radioChoices: RatioTotals;
  buttons: RatioTotals;
  dialogs: RatioTotals;
  inaccessibleControls: number;
  pendingActions: number;
  elapsedSeconds: number | null;
  source: "job_meta" | "section_state" | "global_fallback";
};

type NavigationLike = {
  totals?: Record<string, unknown>;
  crawlCounters?: Record<string, unknown>;
  progressPercent?: number;
  status?: string;
  resultClassification?: string;
  pending?: unknown[];
};

type CoverageLike = {
  navigation?: Record<string, unknown>;
  interactive?: Record<string, unknown>;
  screens?: Record<string, unknown>;
  gaps?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  resultClassification?: string;
};

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ratio(completed: unknown, discovered: unknown): RatioTotals {
  return {
    completed: num(completed),
    discovered: num(discovered),
  };
}

export function ratioLabel(totals: RatioTotals): string {
  return `${totals.completed} / ${totals.discovered}`;
}

export function formatElapsed(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "0:00";
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatResultClassification(value?: string): string {
  switch (value) {
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
    case "stopped_partial":
    case "stopped-partial":
      return "Stopped (partial)";
    default:
      return value || "—";
  }
}

export function isSectionCrawlJob(kind?: string): boolean {
  return kind === "catalog_capture_section";
}

function metaTotals(meta: CatalogCaptureMeta): ScanTotalsView {
  const counters = (meta.liveExecutionState?.counters as Record<string, unknown> | undefined) ?? {};
  const combosDiscovered =
    meta.combosDiscovered ??
    meta.comboBoxes ??
    counters.combos_total ??
    meta.combosOpened;
  const combosOpened = meta.combosOpened ?? counters.combos_opened;
  const comboOptionsDiscovered =
    meta.comboOptionsDiscovered ??
    meta.comboOptionsCaptured ??
    meta.comboOptionsSeen ??
    meta.dropdownOptions ??
    counters.combo_options_captured;
  const comboOptionsTested =
    meta.comboOptionsTested ??
    counters.combo_options_tested ??
    meta.comboOptionsCaptured;

  return {
    result: formatResultClassification(meta.resultClassification ?? meta.scanStatus),
    progressPct: num(meta.completionPercentage),
    crawlDidNotStart: meta.crawlStarted === false,
    failedDuring: meta.crawlStarted === false ? meta.currentAction : undefined,
    screens: ratio(meta.screensCaptured, meta.screensDiscovered),
    states: ratio(meta.statesCompleted, meta.statesDiscovered),
    actions: ratio(meta.actionsCompleted, meta.actionsDiscovered),
    textFields: ratio(meta.textFieldsVisited, meta.textFieldsDiscovered),
    tabs: ratio(meta.tabsVisited ?? counters.tabs_visited, meta.tabsDiscovered ?? counters.tabs_total),
    combos: ratio(combosOpened, combosDiscovered),
    dropdownOptions: ratio(comboOptionsTested, comboOptionsDiscovered),
    checkboxBranches: ratio(
      meta.checkboxBranchesCompleted ?? meta.checkboxBranchesExplored ?? counters.checkbox_states_explored,
      meta.checkboxBranchesDiscovered ?? counters.checkboxes_total,
    ),
    radioChoices: ratio(
      meta.radioChoicesCompleted ?? meta.radioChoicesExplored ?? counters.radio_choices_explored,
      meta.radioChoicesDiscovered ?? counters.radio_groups_discovered ?? counters.radio_groups_total,
    ),
    buttons: ratio(meta.buttonsVisited ?? counters.buttons_visited, meta.buttonsDiscovered ?? counters.buttons_total),
    dialogs: ratio(meta.dialogsVisited ?? counters.dialogs_visited, meta.dialogsDiscovered ?? counters.dialogs_total),
    inaccessibleControls: num(meta.inaccessibleControls),
    pendingActions: num(meta.actionsPending),
    elapsedSeconds: meta.elapsedSeconds ?? null,
    source: "job_meta",
  };
}

function globalTotals(
  navigation?: NavigationLike | null,
  coverage?: CoverageLike | null,
  meta?: CatalogCaptureMeta | null,
): ScanTotalsView {
  const crawl = navigation?.crawlCounters ?? {};
  const navTotals = coverage?.navigation ?? navigation?.totals ?? {};
  const interactive = coverage?.interactive ?? {};
  const screenTotals = coverage?.screens ?? {};

  return {
    result: formatResultClassification(
      meta?.resultClassification ??
        coverage?.resultClassification ??
        navigation?.resultClassification ??
        navigation?.status,
    ),
    progressPct: num(
      navigation?.progressPercent ??
        meta?.completionPercentage ??
        coverage?.summary?.completionPercentage,
    ),
    crawlDidNotStart: false,
    screens: ratio(
      screenTotals.complete ?? navTotals.screensCaptured ?? navigation?.totals?.screensCaptured,
      screenTotals.discovered ?? navTotals.screensDiscovered ?? navigation?.totals?.screensDiscovered,
    ),
    states: ratio(navTotals.statesCompleted ?? crawl.states_completed, navTotals.statesDiscovered ?? crawl.states_discovered),
    actions: ratio(navTotals.actionsCompleted ?? crawl.actions_completed, navTotals.actionsDiscovered ?? crawl.actions_discovered),
    textFields: ratio(meta?.textFieldsVisited, meta?.textFieldsDiscovered),
    tabs: ratio(
      interactive.tabsVisited ?? navTotals.tabsVisited ?? crawl.tabs_visited,
      interactive.tabsDiscovered ?? crawl.tabs_total,
    ),
    combos: ratio(
      interactive.combosOpened ?? navTotals.combosOpened ?? crawl.combos_opened,
      interactive.combosDiscovered ?? crawl.combos_total,
    ),
    dropdownOptions: ratio(
      interactive.comboOptionsCaptured ?? navTotals.comboOptionsCaptured ?? crawl.combo_options_captured ?? meta?.dropdownOptions,
      interactive.comboOptionsCaptured ?? navTotals.comboOptionsCaptured ?? crawl.combo_options_captured ?? meta?.dropdownOptions,
    ),
    checkboxBranches: ratio(navTotals.checkboxBranchesExplored ?? crawl.checkbox_states_explored, crawl.checkboxes_total),
    radioChoices: ratio(navTotals.radioChoicesExplored ?? crawl.radio_choices_explored, crawl.radio_groups_discovered ?? crawl.radio_groups_total),
    buttons: ratio(crawl.buttons_visited, crawl.buttons_total),
    dialogs: ratio(
      interactive.dialogsVisited ?? navTotals.dialogsVisited ?? crawl.dialogs_visited,
      interactive.dialogsDiscovered ?? crawl.dialogs_total,
    ),
    inaccessibleControls: num(
      coverage?.gaps?.inaccessibleControls ?? navTotals.inaccessibleControls ?? meta?.inaccessibleControls,
    ),
    pendingActions: num(navTotals.actionsPending ?? navigation?.pending?.length),
    elapsedSeconds: meta?.elapsedSeconds ?? null,
    source: "global_fallback",
  };
}

export function deriveScanTotals(params: {
  jobKind?: string;
  jobStatus?: string;
  jobStage?: string;
  meta?: CatalogCaptureMeta | null;
  navigation?: NavigationLike | null;
  coverage?: CoverageLike | null;
}): ScanTotalsView {
  const { jobKind, jobStatus, meta, navigation, coverage } = params;
  const sectionJob = isSectionCrawlJob(jobKind);
  const hasCurrentJobMeta = Boolean(meta && (sectionJob || meta.scanMode === "section"));

  if (sectionJob && meta) {
    return metaTotals(meta);
  }

  if (hasCurrentJobMeta && meta) {
    return metaTotals(meta);
  }

  if (meta && (jobStatus === "running" || jobStatus === "complete" || jobStatus === "failed")) {
    return metaTotals(meta);
  }

  return globalTotals(navigation, coverage, meta);
}

export function getScanTotalsPanelTitle(params: {
  jobKind?: string;
  meta?: CatalogCaptureMeta | null;
  hasCurrentJob?: boolean;
}): { title: string; description: string } {
  if (!params.hasCurrentJob) {
    return {
      title: "Scan totals",
      description: "No section crawl running",
    };
  }

  const sectionLabel =
    params.meta?.sectionLabel ??
    getPhase2Section(String(params.meta?.sectionId ?? params.meta?.section ?? ""))?.label;

  if (isSectionCrawlJob(params.jobKind) && sectionLabel) {
    return {
      title: `${sectionLabel} scan totals`,
      description: "Live section discovery and capture summary",
    };
  }

  return {
    title: "Scan totals",
    description: "Navigation and capture summary",
  };
}
