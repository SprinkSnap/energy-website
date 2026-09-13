"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogCaptureMeta } from "@/lib/hot2000/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type RecorderStatus = {
  recorder_enabled: boolean;
  worker_token_configured: boolean;
  workers_online: number;
  workers: Array<{
    worker_id: string;
    build_id?: string;
    last_seen: string;
  }>;
  queued_jobs: number;
  running_jobs: number;
  raw_manifest: Record<string, unknown> | null;
  navigation: NavigationState | null;
  coverage: CoverageState | null;
  raw_capture_version: string | null;
  generated_catalog_version: string;
  fixture_manifest?: { fixtures?: FixtureEntry[] } | null;
  probe_mappings?: Record<string, { mappings?: ProbeMappingEntry[] }>;
  probe_conflicts?: unknown[] | null;
};

type FixtureEntry = {
  id: string;
  file: string;
  hot2000Version?: string;
  sections?: string[];
  status?: string;
};

type ProbeMappingEntry = {
  controlId: string;
  label?: string;
  mapping?: { path?: string; confidence?: string };
  status?: string;
};

type NavigationState = {
  status?: string;
  control?: string;
  screens?: Record<string, ScreenNode>;
  pending?: unknown[];
  failed?: unknown[];
  blockedUnsafe?: unknown[];
  totals?: Record<string, number>;
  warnings?: string[];
};

type ScreenNode = {
  title?: string;
  status?: string;
  section?: string;
  reachability?: string;
  controls?: number;
  dropdowns?: number;
  options?: number;
  inaccessible?: number;
};

type CoverageState = {
  summary?: Record<string, number>;
  sections?: Record<string, Record<string, unknown>>;
};

type CatalogJob = {
  job_id: string;
  kind?: string;
  status: string;
  stage: string;
  progress: number;
  message?: string;
  error?: string;
  catalog_capture_meta?: CatalogCaptureMeta;
  catalog_scan_control?: string;
  has_catalog_capture?: boolean;
};

const POLL_MS = 1750;

function statusIcon(status?: string): string {
  switch (status) {
    case "captured":
    case "guided-captured":
    case "complete":
      return "✓";
    case "partial":
    case "paused":
      return "⚠";
    case "failed":
    case "inaccessible":
      return "✗";
    default:
      return "○";
  }
}

function NavigationTree({ screens }: { screens: Record<string, ScreenNode> }) {
  const grouped = useMemo(() => {
    const bySection: Record<string, ScreenNode[]> = {};
    for (const screen of Object.values(screens)) {
      const key = screen.section || screen.title || "unknown";
      bySection[key] = bySection[key] || [];
      bySection[key].push(screen);
    }
    return Object.entries(bySection).sort(([a], [b]) => a.localeCompare(b));
  }, [screens]);

  if (!grouped.length) {
    return <p className="text-sm text-muted-foreground">No screens discovered yet.</p>;
  }

  return (
    <ul className="space-y-1 text-sm font-mono">
      {grouped.map(([section, nodes]) => {
        const node = nodes[0];
        return (
          <li key={section} className="rounded-md bg-muted/30 px-2 py-1">
            {statusIcon(node.status)} {section}
            {node.status === "partial" ? " (partial)" : ""}
            {node.reachability === "guided" ? " (guided)" : ""}
          </li>
        );
      })}
    </ul>
  );
}

export function Hot2000RecorderClient() {
  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [currentJob, setCurrentJob] = useState<CatalogJob | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [rawPreview, setRawPreview] = useState<string>();
  const [coveragePreview, setCoveragePreview] = useState<string>();
  const [probePreview, setProbePreview] = useState<string>();
  const [selectedSection, setSelectedSection] = useState("weather");

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/hot2000/catalog-recorder/status");
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `Status request failed (${res.status})`);
    }
    return (await res.json()) as RecorderStatus;
  }, []);

  useEffect(() => {
    void loadStatus()
      .then(setStatus)
      .catch((err: Error) => setError(err.message));
  }, [loadStatus]);

  useEffect(() => {
    if (!currentJob || currentJob.status === "complete" || currentJob.status === "failed") {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const [jobRes] = await Promise.all([
          fetch(`/api/hot2000/catalog-recorder/jobs/${currentJob.job_id}`),
          loadStatus().then(setStatus).catch(() => undefined),
        ]);
        if (!jobRes.ok) return;
        const job = (await jobRes.json()) as CatalogJob;
        setCurrentJob(job);
        if (job.status === "complete" || job.status === "failed") {
          void loadStatus().then(setStatus).catch(() => undefined);
        }
      } catch {
        // keep polling
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [currentJob, loadStatus]);

  const submitAction = async (
    action: string,
    options: { section?: string; controlId?: string; fixtureId?: string } = {},
  ) => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/hot2000/catalog-recorder/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...options }),
      });
      const data = (await res.json()) as CatalogJob & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Job request failed (${res.status})`);
      }
      setCurrentJob(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit catalog job.");
    } finally {
      setBusy(false);
    }
  };

  const sendControl = async (action: "pause" | "resume" | "stop") => {
    if (!currentJob?.job_id) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(
        `/api/hot2000/catalog-recorder/jobs/${currentJob.job_id}/control`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const data = (await res.json()) as CatalogJob & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Control request failed (${res.status})`);
      }
      setCurrentJob(data);
      if (action === "resume") {
        await submitAction("resume_scan");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update scan control.");
    } finally {
      setBusy(false);
    }
  };

  const viewRawCapture = async () => {
    if (!currentJob?.job_id || !currentJob.has_catalog_capture) return;
    const res = await fetch(`/api/hot2000/catalog-recorder/raw/${currentJob.job_id}`);
    if (!res.ok) {
      setError("Could not load raw capture.");
      return;
    }
    setRawPreview(await res.text());
  };

  const viewCoverageReport = () => {
    const coverage = status?.coverage;
    if (!coverage) {
      setError("Coverage report is not available yet.");
      return;
    }
    setCoveragePreview(JSON.stringify(coverage, null, 2));
  };

  const exportRawCapture = () => {
    if (!currentJob?.job_id || !currentJob.has_catalog_capture) return;
    window.open(`/api/hot2000/catalog-recorder/raw/${currentJob.job_id}`, "_blank");
  };

  const meta: CatalogCaptureMeta | undefined = currentJob?.catalog_capture_meta;
  const navigation = status?.navigation;
  const coverage = status?.coverage;
  const workerOnline = (status?.workers_online ?? 0) > 0;
  const scanRunning =
    currentJob?.status === "running" &&
    currentJob.catalog_scan_control !== "paused" &&
    currentJob.catalog_scan_control !== "stopped";

  const probeRunning =
    currentJob?.kind === "catalog_probe" &&
    currentJob?.status === "running" &&
    currentJob.catalog_scan_control !== "paused" &&
    currentJob.catalog_scan_control !== "stopped";

  const probeMappings = status?.probe_mappings ?? {};
  const probeTotals = useMemo(() => {
    let mapped = 0;
    let exact = 0;
    let ambiguous = 0;
    for (const section of Object.values(probeMappings)) {
      const entries = section?.mappings ?? [];
      mapped += entries.length;
      exact += entries.filter((e) => e.mapping?.confidence === "exact").length;
      ambiguous += entries.filter((e) => e.mapping?.confidence === "ambiguous").length;
    }
    return { mapped, exact, ambiguous };
  }, [probeMappings]);

  const statItems = useMemo<[string, string | number][]>(
    () => [
      ["Screens discovered", navigation?.totals?.screensDiscovered ?? meta?.screensDiscovered ?? "—"],
      ["Screens captured", navigation?.totals?.screensCaptured ?? meta?.screensCaptured ?? "—"],
      ["Controls captured", navigation?.totals?.controlsCaptured ?? meta?.controlsDiscovered ?? "—"],
      ["Dropdown options", navigation?.totals?.optionsCaptured ?? meta?.dropdownOptions ?? "—"],
      ["Inaccessible controls", navigation?.totals?.inaccessibleControls ?? meta?.inaccessibleControls ?? "—"],
      ["Navigation failures", navigation?.totals?.navigationFailures ?? meta?.navigationFailures ?? "—"],
      ["Blocked unsafe actions", navigation?.totals?.blockedUnsafeActions ?? meta?.blockedUnsafeActions ?? "—"],
      ["Loops prevented", navigation?.totals?.loopsPrevented ?? meta?.loopsPrevented ?? "—"],
      ["Completion", coverage?.summary?.completionPercentage != null ? `${coverage.summary.completionPercentage}%` : "—"],
    ],
    [meta, navigation, coverage],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-charcoal sm:text-3xl">
          HOT2000 Catalog Recorder
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Phase 2 navigation scan and Phase 3 H2K probe mapping. Jobs reuse the existing
          Windows HOT2000 worker launch path used by Generate Net (GJ/a).
        </p>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-destructive" role="alert">{error}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Current scan</CardTitle>
            <CardDescription>Active catalog recorder job</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {currentJob ? (
              <>
                <p>Job: <code className="text-xs">{currentJob.job_id}</code></p>
                <p>HOT2000: {meta?.hot2000Version ?? "—"}</p>
                <p>Scan status: {navigation?.status ?? meta?.scanStatus ?? currentJob.status}</p>
                <p>Control: {currentJob.catalog_scan_control ?? navigation?.control ?? "running"}</p>
                <p>Stage: {currentJob.stage} ({currentJob.progress}%)</p>
                {currentJob.message ? <p>{currentJob.message}</p> : null}
                <p>Current screen: {meta?.section ?? meta?.screenKey ?? "—"}</p>
                <p>Window: {meta?.windowTitle ?? "—"}</p>
                <p>Warnings: {navigation?.warnings?.length ?? 0}</p>
              </>
            ) : (
              <p className="text-muted-foreground">No active capture job.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Worker status</CardTitle>
            <CardDescription>HOT2000 Windows worker queue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>Worker online</span>
              <Badge variant={workerOnline ? "default" : "outline"}>
                {workerOnline ? "Online" : "Offline"}
              </Badge>
            </div>
            <p>Workers online: {status?.workers_online ?? 0}</p>
            <p>Queued jobs: {status?.queued_jobs ?? 0}</p>
            <p>Running jobs: {status?.running_jobs ?? 0}</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Scan totals</CardTitle>
            <CardDescription>Navigation and capture summary</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              {statItems.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                  <dt>{label}</dt>
                  <dd className="font-medium">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Navigation tree</CardTitle>
            <CardDescription>
              Screens discovered ({navigation?.totals?.screensDiscovered ?? 0}) · pending{" "}
              {navigation?.pending?.length ?? 0} · failed {navigation?.failed?.length ?? 0}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NavigationTree screens={navigation?.screens ?? {}} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scan controls</CardTitle>
            <CardDescription>Automatic navigation and guided fallback</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button className="min-h-11 w-full" disabled={busy} onClick={() => void submitAction("start_full_scan")}>
              Start automatic full scan
            </Button>
            <Button className="min-h-11 w-full" variant="outline" disabled={busy} onClick={() => void submitAction("capture_screen")}>
              Capture current screen
            </Button>
            <Button className="min-h-11 w-full" variant="outline" disabled={!scanRunning || busy} onClick={() => void sendControl("pause")}>
              Pause scan
            </Button>
            <Button className="min-h-11 w-full" variant="outline" disabled={busy} onClick={() => void sendControl("resume")}>
              Resume scan
            </Button>
            <Button className="min-h-11 w-full" variant="outline" disabled={!currentJob?.job_id || busy} onClick={() => void sendControl("stop")}>
              Stop scan
            </Button>
            <Button className="min-h-11 w-full" variant="outline" disabled={busy} onClick={() => void submitAction("retry_inaccessible")}>
              Retry inaccessible controls
            </Button>
            <Button className="min-h-11 w-full" variant="outline" disabled={!navigation} onClick={() => viewCoverageReport()}>
              View coverage report
            </Button>
            <Button className="min-h-11 w-full" variant="outline" disabled={!currentJob?.has_catalog_capture} onClick={() => void viewRawCapture()}>
              View raw capture
            </Button>
            <Button className="min-h-11 w-full" variant="outline" disabled={!currentJob?.has_catalog_capture} onClick={() => exportRawCapture()}>
              Export raw capture
            </Button>
          </CardContent>
        </Card>
      </div>

      {coveragePreview ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Coverage report</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[24rem] overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
              {coveragePreview}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {rawPreview ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Raw capture preview</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[28rem] overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
              {rawPreview}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Probe summary</CardTitle>
            <CardDescription>Phase 3 H2K XML mapping evidence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Fixture in use: {meta?.fixtureId ?? "baseline-general"}</p>
            <p>Probe status: {meta?.probeStatus ?? (probeRunning ? "running" : "idle")}</p>
            <p>Controls mapped: {meta?.controlsMapped ?? probeTotals.mapped}</p>
            <p>Exact mappings: {meta?.exactMappings ?? probeTotals.exact}</p>
            <p>Ambiguous mappings: {meta?.ambiguousMappings ?? probeTotals.ambiguous}</p>
            <p>Skipped unsafe: {meta?.skippedUnsafe ?? "—"}</p>
            <p>Conflicts: {status?.probe_conflicts?.length ?? 0}</p>
            {currentJob?.kind === "catalog_probe" ? (
              <>
                <p>Current field: {meta?.currentProbeControl ?? meta?.section ?? "—"}</p>
                <p>Probe value: {meta?.currentProbeValue ?? "—"}</p>
                <p>Confidence: {meta?.probeConfidence ?? "—"}</p>
                <p>Stage: {currentJob.stage}</p>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Probe controls</CardTitle>
            <CardDescription>Experimental UI-to-XML mapping via HOT2000 saves</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Section filter
              <select
                className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm"
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
              >
                <option value="general">General</option>
                <option value="weather">Weather</option>
                <option value="specifications">Specifications</option>
                <option value="ventilation">Ventilation</option>
                <option value="heating-cooling">Heating/Cooling</option>
                <option value="domestic-hot-water">Domestic Hot Water</option>
                <option value="program">Program</option>
                <option value="envelope-components">Envelope components</option>
              </select>
            </label>
            <Button
              className="min-h-11 w-full"
              disabled={busy}
              onClick={() => void submitAction("run_probe")}
            >
              Start H2K probe
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={busy}
              onClick={() => void submitAction("probe_section", { section: selectedSection })}
            >
              Probe selected section
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={!probeRunning || busy}
              onClick={() => void sendControl("pause")}
            >
              Pause probe
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={busy}
              onClick={() => void sendControl("resume")}
            >
              Resume probe
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={!currentJob?.job_id || busy}
              onClick={() => void sendControl("stop")}
            >
              Stop probe
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={busy}
              onClick={() => void submitAction("retry_ambiguous")}
            >
              Retry ambiguous
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={busy}
              onClick={() => void submitAction("retry_failed")}
            >
              Retry failed
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={!Object.keys(probeMappings).length}
              onClick={() => setProbePreview(JSON.stringify(probeMappings, null, 2))}
            >
              View evidence
            </Button>
          </CardContent>
        </Card>
      </div>

      {probePreview ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Probe mappings</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[24rem] overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
              {probePreview}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
