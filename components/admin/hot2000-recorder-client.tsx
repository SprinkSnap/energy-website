"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  raw_capture_version: string | null;
  generated_catalog_version: string;
};

type CatalogJob = {
  job_id: string;
  status: string;
  stage: string;
  progress: number;
  message?: string;
  error?: string;
  catalog_capture_meta?: Record<string, unknown>;
  has_catalog_capture?: boolean;
};

const POLL_MS = 1750;

export function Hot2000RecorderClient() {
  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [currentJob, setCurrentJob] = useState<CatalogJob | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [rawPreview, setRawPreview] = useState<string>();

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
        const res = await fetch(`/api/hot2000/catalog-recorder/jobs/${currentJob.job_id}`);
        if (!res.ok) return;
        const job = (await res.json()) as CatalogJob;
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

  const submitAction = async (action: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/hot2000/catalog-recorder/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
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

  const viewRawCapture = async () => {
    if (!currentJob?.job_id || !currentJob.has_catalog_capture) return;
    const res = await fetch(`/api/hot2000/catalog-recorder/raw/${currentJob.job_id}`);
    if (!res.ok) {
      setError("Could not load raw capture.");
      return;
    }
    setRawPreview(await res.text());
  };

  const exportRawCapture = async () => {
    if (!currentJob?.job_id || !currentJob.has_catalog_capture) return;
    window.open(`/api/hot2000/catalog-recorder/raw/${currentJob.job_id}`, "_blank");
  };

  const meta = currentJob?.catalog_capture_meta ?? {};
  const workerOnline = (status?.workers_online ?? 0) > 0;

  const statItems = useMemo(
    () => [
      ["Windows discovered", meta.windowsDiscovered ?? "—"],
      ["Controls discovered", meta.controlsDiscovered ?? "—"],
      ["Text fields", meta.textFields ?? "—"],
      ["Numeric fields", meta.numericFields ?? "—"],
      ["Checkboxes", meta.checkboxes ?? "—"],
      ["Radio buttons", meta.radioButtons ?? "—"],
      ["ComboBox/ListBox", meta.comboBoxes ?? "—"],
      ["Dropdown options", meta.dropdownOptions ?? "—"],
      ["Inaccessible controls", meta.inaccessibleControls ?? "—"],
      ["Ambiguous controls", meta.ambiguousControls ?? "—"],
    ],
    [meta],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-charcoal sm:text-3xl">
          HOT2000 Catalog Recorder
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Developer-only Desktop capture pipeline. Jobs are sent to the existing Windows HOT2000
          worker using the same launch path as Generate Net (GJ/a).
        </p>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-destructive" role="alert">{error}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Worker status</CardTitle>
            <CardDescription>HOT2000 Windows worker queue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>Recorder enabled</span>
              <Badge variant={status?.recorder_enabled ? "default" : "outline"}>
                {status?.recorder_enabled ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Worker online</span>
              <Badge variant={workerOnline ? "default" : "outline"}>
                {workerOnline ? "Online" : "Offline"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Worker token configured</span>
              <Badge variant={status?.worker_token_configured ? "default" : "outline"}>
                {status?.worker_token_configured ? "Yes" : "No"}
              </Badge>
            </div>
            <p>Workers online: {status?.workers_online ?? 0}</p>
            <p>Queued jobs: {status?.queued_jobs ?? 0}</p>
            <p>Running jobs: {status?.running_jobs ?? 0}</p>
            {status?.workers?.[0] ? (
              <p className="text-muted-foreground">
                Worker: {status.workers[0].worker_id}
                {status.workers[0].build_id ? ` (${status.workers[0].build_id})` : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capture status</CardTitle>
            <CardDescription>Current catalog recorder job</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {currentJob ? (
              <>
                <p>Job: <code className="text-xs">{currentJob.job_id}</code></p>
                <p>Status: {currentJob.status} / {currentJob.stage}</p>
                <p>Progress: {currentJob.progress}%</p>
                {currentJob.message ? <p>{currentJob.message}</p> : null}
                {currentJob.error ? (
                  <p className="text-destructive">{currentJob.error}</p>
                ) : null}
                <p>Section: {String(meta.section ?? "—")}</p>
                <p>Window: {String(meta.windowTitle ?? "—")}</p>
                <p>Last capture: {String(meta.capturedAt ?? status?.raw_manifest?.lastCapturedAt ?? "—")}</p>
              </>
            ) : (
              <p className="text-muted-foreground">No active capture job.</p>
            )}
            <p>Raw catalog version: {status?.raw_capture_version ?? "—"}</p>
            <p>Generated catalog version: {status?.generated_catalog_version ?? "—"}</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Discovery counts</CardTitle>
            <CardDescription>Latest completed capture metadata</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
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

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Developer controls</CardTitle>
          <CardDescription>
            The browser submits jobs; the Windows worker launches HOT2000.exe through the shared
            lifecycle used by Generate Net (GJ/a).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Button
              className="min-h-11 w-full"
              disabled={busy}
              onClick={() => void submitAction("start_scan")}
            >
              Launch HOT2000 / Start scan
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={busy}
              onClick={() => void submitAction("start_scan")}
            >
              Start automatic full scan
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={busy}
              onClick={() => void submitAction("capture_screen")}
            >
              Capture current screen
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={busy}
              onClick={() => void submitAction("resume_scan")}
            >
              Resume scan
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled
              title="Stop scan will be wired in Phase 2"
            >
              Stop scan
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled
              title="Retry inaccessible controls will be wired in Phase 2"
            >
              Retry inaccessible controls
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={busy}
              onClick={() => void submitAction("run_probe")}
            >
              Run H2K probe
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled
              title="Generate catalog will be implemented in Phase 4"
            >
              Generate catalog
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={!currentJob?.has_catalog_capture}
              onClick={() => void viewRawCapture()}
            >
              View raw capture
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled={!currentJob?.has_catalog_capture}
              onClick={() => void exportRawCapture()}
            >
              Export/download raw capture
            </Button>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              disabled
              title="Coverage report will be implemented in Phase 2"
            >
              View coverage report
            </Button>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
