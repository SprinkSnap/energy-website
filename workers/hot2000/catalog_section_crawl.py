"""
Section-scoped Phase 2 catalog crawl orchestration.

Opens baseline fixture, navigates to one HOT2000 section, crawls only that section,
writes section-specific evidence artifacts, and uploads compact batched progress.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

from catalog_auto_scan import ScanPaused, ScanStopped, _check_control, hydrate_scan_state
from catalog_coverage import write_coverage_reports
from catalog_models import RECORDER_VERSION
from catalog_progress_batcher import ProgressBatcher
from catalog_section_navigation import (
    capture_navigation_snapshot,
    navigate_to_section,
    write_navigation_diagnostics,
)
from catalog_ui_crawler import run_stateful_ui_crawl
from catalog_scan_state import ScanState
from hot2000_lifecycle import close_hot2000, detect_hot2000_version, open_h2k_fixture, wait_for_model_ready

ProgressFn = Callable[[str, str, str | None], None]
ControlCheckFn = Callable[[], str]
CheckpointFn = Callable[[str, dict[str, Any], dict[str, Any]], None] | None


def _section_raw_dir(job_dir: Path, scan_id: str) -> Path:
    return job_dir / "raw-desktop" / scan_id


def _write_section_evidence(
    raw_dir: Path,
    state: ScanState,
    *,
    section_id: str,
    section_label: str,
    worker_id: str,
    worker_build: str | None,
    job_id: str,
) -> dict[str, Any]:
    raw_dir.mkdir(parents=True, exist_ok=True)

    controls: list[dict[str, Any]] = []
    text_fields: list[dict[str, Any]] = []
    combos: list[dict[str, Any]] = []
    combo_options: list[dict[str, Any]] = []
    tabs: list[dict[str, Any]] = []
    dialogs: list[dict[str, Any]] = []
    inaccessible: list[dict[str, Any]] = list(state.inaccessible_records)

    for screen in state.screens.values():
        if screen.get("section") and screen.get("section") != section_id:
            continue
        tabs.append(
            {
                "title": screen.get("title"),
                "status": screen.get("status"),
                "controls": screen.get("controls"),
                "dropdowns": screen.get("dropdowns"),
                "options": screen.get("options"),
                "inaccessible": screen.get("inaccessible"),
            }
        )

    for record in state.state_records.values():
        for control in record.get("controls") or []:
            if isinstance(control, dict):
                controls.append(control)
                ctype = str(control.get("controlType") or control.get("control_type") or "")
                if ctype in {"Edit", "Document"}:
                    text_fields.append(control)
                if ctype in {"ComboBox", "List", "ListBox"}:
                    combos.append(control)
                    for option in control.get("options") or []:
                        combo_options.append(
                            {
                                "comboId": control.get("logicalControlId") or control.get("stableId"),
                                "comboLabel": control.get("label"),
                                **(option if isinstance(option, dict) else {"label": option}),
                            }
                        )

    dialog_dir = raw_dir / "dialogs"
    if dialog_dir.is_dir():
        for path in sorted(dialog_dir.glob("*.json")):
            try:
                dialogs.append(json.loads(path.read_text(encoding="utf-8")))
            except Exception:
                continue

    section_meta = {
        "sectionId": section_id,
        "sectionLabel": section_label,
        "scanId": state.scan_id,
        "lineageId": state.continuation_of or state.scan_id,
        "fixtureId": state.fixture,
        "hot2000Version": state.hot2000_version,
        "workerBuild": worker_build,
        "workerId": worker_id,
        "recorderVersion": RECORDER_VERSION,
        "status": state.status,
        "resultClassification": state.status,
        "capturedAt": state.updated_at,
    }

    files = {
        "section.json": section_meta,
        "controls.json": controls,
        "text-fields.json": text_fields,
        "combos.json": combos,
        "combo-options.json": combo_options,
        "dependencies.json": state.dependency_evidence[-500:],
        "tabs.json": tabs,
        "dialogs.json": dialogs,
        "inaccessible.json": inaccessible,
        "coverage.json": state.coverage_report,
    }
    for name, payload in files.items():
        (raw_dir / name).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    scan_report = {
        **section_meta,
        "jobId": job_id,
        "completionReason": state.completion_reason,
        "crawlCounters": state.crawl_counters,
        "totals": state.totals,
        "warnings": state.warnings,
    }
    (raw_dir / "scan-report.json").write_text(json.dumps(scan_report, indent=2) + "\n", encoding="utf-8")
    return scan_report


def run_section_crawl(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    control_check: ControlCheckFn,
    *,
    section_id: str,
    section_label: str,
    resume: bool = False,
    retry_gaps: bool = False,
    checkpoint: CheckpointFn = None,
    progress_with_pct: Callable[..., None] | None = None,
    continuation_payload: dict[str, Any] | None = None,
    worker_build: str | None = None,
    fixture_id: str = "baseline-general",
) -> tuple[str, dict[str, Any]]:
    batcher = ProgressBatcher(progress_interval_s=4.0, checkpoint_interval_s=30.0)
    fixture_file = f"{fixture_id}.h2k" if not fixture_id.endswith(".h2k") else fixture_id

    def batched_progress_with_pct(
        jid: str,
        stage: str,
        message: str | None,
        pct: int | None,
        meta: dict[str, Any] | None = None,
    ) -> None:
        if not progress_with_pct:
            batcher.maybe_progress(progress, jid, stage, message)
            return
        batcher.maybe_progress(progress_with_pct, jid, stage, message, pct, meta)

    def batched_checkpoint(jid: str, payload: dict[str, Any], meta: dict[str, Any]) -> None:
        if not checkpoint:
            return
        batcher.maybe_checkpoint(checkpoint, jid, json.dumps(payload), meta)

    state = hydrate_scan_state(job_dir, resume=resume, continuation_payload=continuation_payload)
    session = open_h2k_fixture(job_id, job_dir, fixture_file, progress)

    try:
        wait_for_model_ready(session, job_id, progress)
        if state is None:
            state = ScanState.new(
                hot2000_version=detect_hot2000_version(),
                fixture=fixture_file,
            )
            state.section_id = section_id
            state.section_label = section_label
        else:
            state.section_id = section_id
            state.section_label = section_label

        if continuation_payload:
            state.parent_job_id = continuation_payload.get("parentJobId") or state.parent_job_id
            state.continuation_of = continuation_payload.get("continuationOf") or state.continuation_of

        from catalog_recorder import _desktop_window

        desktop = _desktop_window()
        main_window = desktop.window(handle=session.main_hwnd)
        raw_dir = _section_raw_dir(job_dir, state.scan_id)

        state.crawl_started = False

        def emit_navigation_progress(message: str) -> None:
            state.live_execution_state = {
                "scanId": state.scan_id,
                "section": section_id,
                "sectionLabel": section_label,
                "action": message,
                "actionKind": "section_navigation",
                "phase": "navigation",
                "counters": {},
            }
            meta = {
                **state.build_progress_meta(worker_id),
                "sectionId": section_id,
                "sectionLabel": section_label,
                "section": section_id,
                "scanMode": "section",
                "currentAction": message,
                "crawlStarted": False,
                "completionPercentage": 0,
                "liveExecutionState": state.live_execution_state,
                "screensDiscovered": 0,
                "screensCaptured": 0,
                "statesDiscovered": 0,
                "statesCompleted": 0,
                "actionsDiscovered": 0,
                "actionsCompleted": 0,
                "actionsPending": 0,
                "textFieldsDiscovered": 0,
                "textFieldsVisited": 0,
                "tabsDiscovered": 0,
                "tabsVisited": 0,
                "combosDiscovered": 0,
                "combosOpened": 0,
                "comboOptionsDiscovered": 0,
                "comboOptionsTested": 0,
                "checkboxBranchesDiscovered": 0,
                "checkboxBranchesCompleted": 0,
                "radioChoicesDiscovered": 0,
                "radioChoicesCompleted": 0,
                "buttonsDiscovered": 0,
                "buttonsVisited": 0,
                "dialogsDiscovered": 0,
                "dialogsVisited": 0,
                "inaccessibleControls": 0,
                "elapsedSeconds": int(state.totals.get("elapsedSeconds", 0)),
            }
            batched_progress_with_pct(job_id, "scanning", message, 0, meta)

        pre_nav_snapshot = capture_navigation_snapshot(main_window)
        (raw_dir / "section-navigation-pre.json").write_text(
            json.dumps(pre_nav_snapshot, indent=2) + "\n",
            encoding="utf-8",
        )

        nav_outcome = navigate_to_section(
            main_window,
            section_id,
            progress=emit_navigation_progress,
        )
        if not nav_outcome.success:
            diagnostics = nav_outcome.diagnostics or pre_nav_snapshot
            diagnostics["navigationResult"] = nav_outcome.result
            diagnostics["failureReason"] = nav_outcome.message
            write_navigation_diagnostics(raw_dir, diagnostics)
            raise RuntimeError(
                f"Could not navigate to section {section_label}: {nav_outcome.message}"
            )

        progress(
            job_id,
            "scanning",
            f"Verified {section_label} ({nav_outcome.result}) — starting control discovery…",
        )
        state.crawl_started = True
        state.status = "running"
        state, _engine = run_stateful_ui_crawl(
            job_id,
            job_dir,
            worker_id,
            session,
            state,
            progress,
            lambda: _check_control(control_check()),
            checkpoint=batched_checkpoint,
            progress_with_pct=batched_progress_with_pct,
            target_section_id=section_id,
            target_section_label=section_label,
            scan_mode="section",
        )

        raw_dir = _section_raw_dir(job_dir, state.scan_id)
        state.save(raw_dir)
        try:
            repo_docs = Path(__file__).resolve().parents[2] / "h2k-web-editor" / "docs"
            report = write_coverage_reports(
                state,
                raw_dir,
                repo_docs,
                job_id=job_id,
                worker_id=worker_id,
                worker_build=worker_build,
            )
        except Exception:
            report = write_coverage_reports(
                state,
                raw_dir,
                job_dir / "docs",
                job_id=job_id,
                worker_id=worker_id,
                worker_build=worker_build,
            )
        state.coverage_report = report
        state.finalize_status()
        batcher.flush_all()

        progress(job_id, "closing", "Closing HOT2000…")
        close_hot2000(session, job_dir)
        progress(job_id, "extracting", f"Uploading {section_label} section evidence…")

        scan_report = _write_section_evidence(
            raw_dir,
            state,
            section_id=section_id,
            section_label=section_label,
            worker_id=worker_id,
            worker_build=worker_build,
            job_id=job_id,
        )

        payload = {
            "schemaVersion": "2.0.0",
            "scanMode": "section",
            "sectionId": section_id,
            "sectionLabel": section_label,
            "section": section_id,
            "scanId": state.scan_id,
            "lineageId": state.continuation_of or state.scan_id,
            "fixtureId": fixture_id,
            "hot2000Version": state.hot2000_version,
            "workerBuild": worker_build,
            "worker": worker_id,
            "recorderVersion": RECORDER_VERSION,
            "status": state.status,
            "coverage": report,
            "controls": scan_report.get("controls") if isinstance(scan_report.get("controls"), list) else [],
            "dependencyEvidence": state.dependency_evidence[-200:],
            "crawlCounters": state.crawl_counters,
            "totals": state.totals,
            "retryGaps": retry_gaps,
        }

        meta = {
            **state.build_progress_meta(worker_id),
            "sectionId": section_id,
            "sectionLabel": section_label,
            "section": section_id,
            "scanId": state.scan_id,
            "lineageId": state.continuation_of or state.scan_id,
            "fixtureId": fixture_id,
            "workerBuild": worker_build,
            "scanStatus": state.status,
            "resultClassification": state.status,
            "scanMode": "section",
        }
        return json.dumps(payload), meta

    except ScanStopped:
        batcher.flush_all()
        state.status = "stopped-partial"
        raw_dir = _section_raw_dir(job_dir, state.scan_id)
        state.save(raw_dir)
        close_hot2000(session, job_dir)
        return json.dumps(state.to_navigation_dict()), {
            "scanStatus": "stopped-partial",
            "sectionId": section_id,
            "sectionLabel": section_label,
            "section": section_id,
            "workerId": worker_id,
        }
    except ScanPaused:
        batcher.flush_all()
        state.status = "paused"
        raw_dir = _section_raw_dir(job_dir, state.scan_id)
        state.save(raw_dir)
        close_hot2000(session, job_dir)
        return json.dumps(state.to_navigation_dict()), {
            "scanStatus": "paused",
            "sectionId": section_id,
            "sectionLabel": section_label,
            "section": section_id,
            "workerId": worker_id,
        }
    except Exception:
        batcher.flush_all()
        close_hot2000(session, job_dir)
        raise
