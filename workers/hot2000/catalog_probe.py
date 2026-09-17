"""HOT2000 H2K probe — Phase 3 experimental UI-to-XML mapping."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from catalog_probe_engine import run_probe_queue

ProgressFn = Callable[[str, str, str | None], None]
ControlCheckFn = Callable[[], str]


def run_catalog_probe(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    *,
    control_check: ControlCheckFn | None = None,
    job: dict | None = None,
) -> tuple[str, dict[str, Any]]:
    check = control_check or (lambda: "running")
    capture_json, meta = run_probe_queue(
        job_id,
        job_dir,
        worker_id,
        progress,
        check,
        job=job,
    )
    out = job_dir / "probe-result.json"
    out.write_text(capture_json if isinstance(capture_json, str) else json.dumps(capture_json, indent=2) + "\n", encoding="utf-8")
    return capture_json, meta
