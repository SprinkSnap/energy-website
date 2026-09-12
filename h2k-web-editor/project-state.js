/**
 * Persistent project save state: revision tracking, dirty flag, recovery metadata.
 */
(function initH2kProjectState(global) {
  const SESSION_META_KEY = "h2k-web-editor-project-meta-v1";
  let revision = 0;
  let savedRevision = 0;
  let lastSavedAt = null;
  let modelRevision = 0;
  let pendingRecovery = null;

  function readMeta() {
    try {
      const raw = sessionStorage.getItem(SESSION_META_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_err) {
      return null;
    }
  }

  function writeMeta(extra = {}) {
    try {
      sessionStorage.setItem(
        SESSION_META_KEY,
        JSON.stringify({
          revision,
          savedRevision,
          lastSavedAt,
          modelRevision,
          lastExportRevision,
          ...extra,
        }),
      );
    } catch (_err) {
      /* quota */
    }
  }

  function loadFromSession(data) {
    revision = Number(data.revision) || 0;
    savedRevision = Number(data.savedRevision ?? data.revision) || revision;
    modelRevision = Number(data.modelRevision ?? data.revision) || revision;
    lastSavedAt = data.lastSavedAt || null;
    lastExportRevision = Number(data.lastExportRevision) || 0;
    writeMeta();
  }

  function markExported() {
    lastExportRevision = revision;
    updateSaveStatusUI();
    writeMeta();
  }

  let lastExportRevision = 0;

  function isDirty() {
    return revision !== savedRevision || revision !== lastExportRevision;
  }

  function markEdited() {
    revision += 1;
    modelRevision = revision;
    updateSaveStatusUI();
    writeMeta();
  }

  function markSaved() {
    savedRevision = revision;
    lastSavedAt = new Date().toISOString();
    updateSaveStatusUI();
    writeMeta();
  }

  function markRecoveredFromSession() {
    pendingRecovery = {
      revision,
      savedRevision,
      recoveredAt: new Date().toISOString(),
    };
    updateSaveStatusUI();
  }

  function clearMeta() {
    revision = 0;
    savedRevision = 0;
    lastSavedAt = null;
    modelRevision = 0;
    pendingRecovery = null;
    try {
      sessionStorage.removeItem(SESSION_META_KEY);
    } catch (_err) {
      /* ignore */
    }
    updateSaveStatusUI();
  }

  function updateSaveStatusUI() {
    const el = document.getElementById("projectSaveStatus");
    if (!el) return;
    el.classList.remove("is-dirty", "is-saved", "is-recovered");
    if (pendingRecovery) {
      el.textContent = "Recovered unsaved edits";
      el.classList.add("is-recovered");
      return;
    }
    if (isDirty()) {
      el.textContent = revision !== savedRevision ? "Saving…" : "Unsaved export";
      el.classList.add("is-dirty");
      return;
    }
    el.textContent = lastSavedAt
      ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "Saved";
    el.classList.add("is-saved");
  }

  function attachEditTracking(root) {
    if (!root) return;
    root.addEventListener(
      "change",
      () => {
        markEdited();
      },
      true,
    );
    root.addEventListener(
      "input",
      (e) => {
        if (e.target?.matches?.("input[type=text], input[type=number], textarea")) markEdited();
      },
      true,
    );
  }

  function snapshotMetaForJob() {
    return {
      modelRevision,
      revision,
      savedRevision,
      capturedAt: new Date().toISOString(),
    };
  }

  function detectConflict(importedRevision) {
    if (!Number.isFinite(Number(importedRevision))) return null;
    if (isDirty() && Number(importedRevision) < modelRevision) {
      return {
        type: "local-ahead",
        message: "You have unsaved local edits newer than the imported file revision.",
      };
    }
    return null;
  }

  global.H2kProjectState = {
    restoreMeta,
    loadFromSession,
    clearMeta,
    markEdited,
    markSaved,
    markExported,
    markRecoveredFromSession,
    isDirty,
    updateSaveStatusUI,
    attachEditTracking,
    snapshotMetaForJob,
    detectConflict,
    get revision() {
      return revision;
    },
    get modelRevision() {
      return modelRevision;
    },
    get lastExportRevision() {
      return lastExportRevision;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
