/**
 * HOT2000 calculation job client — submits the current edited H2K to the
 * backend queue and polls for worker-calculated Net GJ/a.
 */
(function initHot2000Jobs(global) {
  const API_BASE = "/api/hot2000";
  const POLL_MS = 1750;
  const TIMEOUT_MS = 15 * 60 * 1000;
  const QUEUE_STATUS_REFRESH_MS = 10 * 1000;

  const STAGE_LABELS = {
    preparing: "Preparing model…",
    queued: "Waiting for an available HOT2000 worker…",
    claimed: "HOT2000 worker assigned…",
    starting: "Starting HOT2000 Desktop…",
    opening: "Opening H2K model…",
    calculating: "HOT2000 Desktop is calculating…",
    saving: "Saving calculated H2K…",
    reporting: "Opening Full house report…",
    printing: "Saving Full House Report PDF…",
    closing: "Closing HOT2000…",
    extracting: "Reading SOC results…",
    complete: "Calculation complete",
    failed: "Calculation failed",
  };

  function pick(obj, snake, camel) {
    if (obj == null) return undefined;
    if (obj[snake] != null) return obj[snake];
    if (obj[camel] != null) return obj[camel];
    return undefined;
  }

  function stageLabel(stage, message) {
    if (message && String(message).trim()) return String(message).trim();
    const key = String(stage || "").toLowerCase();
    return STAGE_LABELS[key] || "Calculating Net GJ/a…";
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function fetchWithRetry(url, options, retries = 3) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await fetch(url, options);
        return res;
      } catch (err) {
        lastError = err;
        if (attempt >= retries) break;
        await wait(500 * (attempt + 1));
      }
    }
    throw lastError || new Error("Network request failed.");
  }

  async function submitJob(xmlString, filename, kind = "calculate") {
    const form = new FormData();
    const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" });
    form.append("file", blob, filename || "web-model.h2k");
    if (kind && kind !== "calculate") form.append("kind", kind);
    const res = await fetchWithRetry(`${API_BASE}/jobs`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `Job creation failed (${res.status})`);
    }
    const jobId = pick(data, "job_id", "jobId");
    if (!jobId) throw new Error("Job creation did not return a job id.");
    return {
      jobId,
      status: data.status || "queued",
      stage: data.stage || "queued",
      progress: Number(data.progress) || 20,
      message: data.message || STAGE_LABELS.queued,
    };
  }

  async function fetchQueueStatus() {
    const res = await fetchWithRetry(`${API_BASE}/queue/status`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `Queue status failed (${res.status})`);
    }
    return {
      workersOnline: Number(pick(data, "workers_online", "workersOnline")) || 0,
      queuedJobs: Number(pick(data, "queued_jobs", "queuedJobs")) || 0,
      runningJobs: Number(pick(data, "running_jobs", "runningJobs")) || 0,
      workers: Array.isArray(data.workers) ? data.workers : [],
    };
  }

  function queuedWaitMessage(queueStatus) {
    if (!queueStatus) {
      return "No HOT2000 worker has checked in yet. On the Windows PC, run: cd C:\\HOT2000Worker && python worker.py";
    }
    if (queueStatus.workersOnline <= 0) {
      return "No HOT2000 worker is online. On the Windows PC, run: cd C:\\HOT2000Worker && python worker.py";
    }
    if (queueStatus.runningJobs > 0) {
      return "HOT2000 worker is busy on another calculation. Your job is queued…";
    }
    return "HOT2000 worker is online but has not claimed this job yet. Retrying…";
  }

  async function fetchJob(jobId) {
    const res = await fetchWithRetry(`${API_BASE}/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `Job status failed (${res.status})`);
    }
    return {
      jobId: pick(data, "job_id", "jobId") || jobId,
      status: data.status || "queued",
      stage: data.stage || "queued",
      progress: Number(data.progress) || 0,
      message: data.message || "",
      error: data.error || "",
      netGJa: pick(data, "net_gja", "netGJa"),
      reportPdfBase64: pick(data, "report_pdf_base64", "reportPdfBase64"),
      kind: data.kind || "calculate",
    };
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Run a full calculation job.
   * @param {object} options
   * @param {() => string} options.serializeModel
   * @param {() => string} [options.getFilename]
   * @param {(update: object) => void} [options.onProgress]
   * @returns {Promise<{netGJa:number, sourceHash:string, jobId:string}>}
   */
  async function runJob(options, kind = "calculate") {
    const serializeModel = options.serializeModel;
    const getFilename = options.getFilename || (() => "web-model.h2k");
    const onProgress = options.onProgress || (() => {});
    const startedAt = Date.now();
    const isReport = kind === "full_house_report";
    let peakProgress = 10;

    onProgress({
      stage: "preparing",
      progress: 10,
      message: isReport ? "Preparing Full House Report…" : STAGE_LABELS.preparing,
      status: "running",
    });

    const xml = serializeModel();
    const sourceHash = await sha256Hex(xml);
    const created = await submitJob(xml, getFilename(), kind);

    let latest = created;
    let queueStatusCache = null;
    let queueStatusFetchedAt = 0;
    if (String(created.stage || "").toLowerCase() === "queued") {
      try {
        queueStatusCache = await fetchQueueStatus();
        queueStatusFetchedAt = Date.now();
      } catch (_err) {
        queueStatusCache = null;
      }
    }

    async function resolveQueuedMessage(stage, fallbackMessage) {
      if (String(stage || "").toLowerCase() !== "queued") {
        return fallbackMessage;
      }
      const now = Date.now();
      if (
        !queueStatusCache ||
        now - queueStatusFetchedAt >= QUEUE_STATUS_REFRESH_MS
      ) {
        try {
          queueStatusCache = await fetchQueueStatus();
          queueStatusFetchedAt = now;
        } catch (_err) {
          return queuedWaitMessage(null);
        }
      }
      return queuedWaitMessage(queueStatusCache);
    }

    function emitProgress(update) {
      peakProgress = Math.max(peakProgress, Number(update.progress) || 0);
      onProgress({ ...update, progress: peakProgress });
    }

    emitProgress({
      stage: latest.stage,
      progress: latest.progress,
      message: queueStatusCache
        ? queuedWaitMessage(queueStatusCache)
        : stageLabel(latest.stage, latest.message),
      status: latest.status,
      jobId: latest.jobId,
    });

    while (true) {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        throw new Error("Calculation timed out. Please try again.");
      }

      await wait(POLL_MS);
      latest = await fetchJob(created.jobId);
      const status = String(latest.status || "").toLowerCase();
      const stage = String(latest.stage || "").toLowerCase();
      let message = await resolveQueuedMessage(
        stage,
        stageLabel(stage, latest.message),
      );

      emitProgress({
        stage,
        progress: latest.progress,
        message,
        status,
        jobId: latest.jobId,
      });

      if (status === "complete" || stage === "complete") {
        emitProgress({
          stage: "complete",
          progress: 100,
          message: isReport ? "Full House Report PDF ready" : STAGE_LABELS.complete,
          status: "complete",
          jobId: latest.jobId,
        });
        const result = { sourceHash, jobId: latest.jobId };
        if (isReport) {
          const pdf = latest.reportPdfBase64;
          if (!pdf || !String(pdf).trim()) {
            throw new Error("Full House Report finished without a PDF.");
          }
          result.reportPdfBase64 = String(pdf);
          const net = Number(latest.netGJa);
          if (Number.isFinite(net)) result.netGJa = net;
          return result;
        }
        const net = Number(latest.netGJa);
        if (!Number.isFinite(net)) {
          throw new Error("Calculation finished without a Net GJ/a result.");
        }
        result.netGJa = net;
        return result;
      }

      if (status === "failed" || stage === "failed") {
        throw new Error(
          latest.error ||
            latest.message ||
            (isReport ? "HOT2000 Full House Report failed." : "HOT2000 calculation failed."),
        );
      }

      if (status === "cancelled") {
        throw new Error(isReport ? "Full House Report was cancelled." : "Calculation was cancelled.");
      }
    }
  }

  async function runCalculation(options) {
    return runJob(options, "calculate");
  }

  async function runFullHouseReport(options) {
    return runJob(options, "full_house_report");
  }

  function downloadPdfBase64(base64, filename) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "soc-full-house-report.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  global.Hot2000Jobs = {
    API_BASE,
    POLL_MS,
    TIMEOUT_MS,
    STAGE_LABELS,
    sha256Hex,
    submitJob,
    fetchJob,
    fetchQueueStatus,
    runCalculation,
    runFullHouseReport,
    downloadPdfBase64,
    stageLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
