"""HOT2000 H2K probe — Phase 3 placeholder."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

ProgressFn = Callable[[str, str, str | None], None]


def run_catalog_probe(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
) -> tuple[str, dict[str, Any]]:
    progress(job_id, "opening", "H2K probe is not implemented in Phase 1.")
    payload = {
        "probeVersion": "0.0.0",
        "status": "unsupported",
        "message": "catalog_probe will be implemented in Phase 3.",
        "worker": worker_id,
    }
    meta = {
        "section": "probe",
        "controlsDiscovered": 0,
        "workerId": worker_id,
    }
    out = job_dir / "probe-result.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return json.dumps(payload), meta
