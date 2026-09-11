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
    printing: "Exporting Full House Report to PDF…",
    closing: "Closing HOT2000…",
    extracting: "Preparing PDF download…",
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

  function reportPdfFilenameFromExportName(exportName, jobId) {
    if (globalThis.Hot2000ExportFilename?.reportPdfFilenameFromExportName) {
      return globalThis.Hot2000ExportFilename.reportPdfFilenameFromExportName(
        exportName,
        jobId,
      );
    }
    const INVALID = /[<>:"/\\|?*]/g;
    let raw = String(exportName ?? "").trim();
    if (raw) {
      raw = raw.replace(/\\/g, "/");
      const slash = raw.lastIndexOf("/");
      if (slash >= 0) raw = raw.slice(slash + 1);
      const lower = raw.toLowerCase();
      for (const ext of [".h2k", ".xml", ".pdf"]) {
        if (lower.endsWith(ext)) {
          raw = raw.slice(0, -ext.length);
          break;
        }
      }
      let cleaned = raw.replace(INVALID, "-").replace(/\.+$/, "").trim();
      if (cleaned) {
        return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
      }
    }
    const safeJob =
      String(jobId || "job")
        .replace(INVALID, "-")
        .replace(/\.+$/, "")
        .trim() || "job";
    return `HOT2000-Full-House-Report-${safeJob}.pdf`;
  }

  function inputH2kFilenameFromExportName(exportName, fallback = "input.h2k") {
    if (globalThis.Hot2000ExportFilename?.inputH2kFilenameFromExportName) {
      return globalThis.Hot2000ExportFilename.inputH2kFilenameFromExportName(
        exportName,
        fallback,
      );
    }
    let raw = String(exportName ?? "").trim();
    if (!raw) return fallback;
    raw = raw.replace(/\\/g, "/");
    const slash = raw.lastIndexOf("/");
    if (slash >= 0) raw = raw.slice(slash + 1);
    const lower = raw.toLowerCase();
    for (const ext of [".h2k", ".xml", ".pdf"]) {
      if (lower.endsWith(ext)) {
        raw = raw.slice(0, -ext.length);
        break;
      }
    }
    let cleaned = raw.replace(/[<>:"/\\|?*]/g, "-").replace(/\.+$/, "").trim();
    if (!cleaned) return fallback;
    return cleaned.toLowerCase().endsWith(".h2k") ? cleaned : `${cleaned}.h2k`;
  }

  async function submitJob(
    xmlString,
    filename,
    kind = "calculate",
    exportFilename,
    inputFilename,
  ) {
    const form = new FormData();
    const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" });
    const multipartName =
      kind === "full_house_report"
        ? inputFilename || filename || "input.h2k"
        : filename || "web-model.h2k";
    form.append("file", blob, multipartName);
    if (kind && kind !== "calculate") form.append("kind", kind);
    if (kind === "full_house_report") {
      if (exportFilename) {
        form.append("export_filename", String(exportFilename));
      }
      form.append("input_filename", String(inputFilename || multipartName));
    }
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
      const queued = Math.max(0, Number(queueStatus.queuedJobs) || 0);
      if (queued > 1) {
        return `HOT2000 worker is busy on another job (${queued - 1} ahead of yours in queue). Waiting…`;
      }
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
      reportPdfReady: Boolean(
        pick(data, "report_pdf_ready", "reportPdfReady") ||
          pick(data, "report_pdf_base64", "reportPdfBase64"),
      ),
      exportFilename: pick(data, "export_filename", "exportFilename"),
      reportPdfFilename: pick(data, "report_pdf_filename", "reportPdfFilename"),
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
    const getExportFilename = options.getExportFilename || getFilename;
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
    const exportFilenameValue = isReport ? getExportFilename() : undefined;
    const inputFilenameValue = isReport
      ? inputH2kFilenameFromExportName(exportFilenameValue || getFilename())
      : undefined;
    const created = await submitJob(
      xml,
      isReport ? inputFilenameValue : getFilename(),
      kind,
      exportFilenameValue,
      inputFilenameValue,
    );

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
          message: isReport ? "Downloading Full House Report PDF…" : STAGE_LABELS.complete,
          status: "complete",
          jobId: latest.jobId,
        });
        const result = { sourceHash, jobId: latest.jobId };
        if (isReport) {
          const pdf = latest.reportPdfBase64;
          const pdfReady = latest.reportPdfReady || (pdf && String(pdf).trim());
          if (!pdfReady) {
            throw new Error("Full House Report finished without a PDF.");
          }
          if (pdf && String(pdf).trim()) {
            result.reportPdfBase64 = String(pdf);
          } else {
            result.reportPdfJobId = latest.jobId;
          }
          result.reportPdfFilename =
            latest.reportPdfFilename ||
            reportPdfFilenameFromExportName(
              latest.exportFilename || getExportFilename(),
              latest.jobId,
            );
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
    return downloadPdfBlob(new Blob([bytes], { type: "application/pdf" }), filename);
  }

  function downloadPdfBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "soc-full-house-report.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return filename || "soc-full-house-report.pdf";
  }

  async function fetchReportPdfBlob(jobId) {
    const res = await fetchWithRetry(
      `${API_BASE}/jobs/${encodeURIComponent(jobId)}/report.pdf`,
      { headers: { Accept: "application/pdf" } },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error || data.message || `PDF download failed (${res.status})`,
      );
    }
    const blob = await res.blob();
    if (!blob || blob.size < 128) {
      throw new Error("Downloaded Full House Report PDF is empty or invalid.");
    }
    return blob;
  }

  async function downloadReportPdf(jobId, filename) {
    const blob = await fetchReportPdfBlob(jobId);
    return downloadPdfBlob(blob, filename);
  }

  async function openReportPdf(jobId) {
    const blob = await fetchReportPdfBlob(jobId);
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      URL.revokeObjectURL(url);
      throw new Error("Pop-up blocked. Allow pop-ups or use Download PDF.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return url;
  }

  function openPdfBlob(blob) {
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      URL.revokeObjectURL(url);
      throw new Error("Pop-up blocked. Allow pop-ups or use Download PDF.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return url;
  }

  global.Hot2000Jobs = {
    API_BASE,
    POLL_MS,
    TIMEOUT_MS,
    STAGE_LABELS,
    sha256Hex,
    inputH2kFilenameFromExportName,
    reportPdfFilenameFromExportName,
    submitJob,
    fetchJob,
    fetchQueueStatus,
    runCalculation,
    runFullHouseReport,
    downloadPdfBase64,
    downloadReportPdf,
    downloadPdfBlob,
    openReportPdf,
    openPdfBlob,
    stageLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
