"""Probe fixture management with baseline immutability."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "h2k-web-editor" / "catalog" / "fixtures"
WORKER_FIXTURES = Path(__file__).resolve().parent / "fixtures"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_fixture_manifest() -> dict[str, Any]:
    manifest_path = FIXTURES_DIR / "manifest.json"
    if manifest_path.is_file():
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    return {"fixtures": []}


def resolve_fixture_path(fixture_id: str) -> Path:
    manifest = load_fixture_manifest()
    for entry in manifest.get("fixtures", []):
        if entry.get("id") == fixture_id:
            candidate = FIXTURES_DIR / str(entry.get("file"))
            if candidate.is_file():
                return candidate
    worker_candidate = WORKER_FIXTURES / f"{fixture_id}.h2k"
    if worker_candidate.is_file():
        return worker_candidate
    fallback = FIXTURES_DIR / "baseline-general.h2k"
    if fallback.is_file():
        return fallback
    raise FileNotFoundError(f"Fixture not found: {fixture_id}")


def verify_fixture_unchanged(fixture_id: str) -> bool:
    manifest = load_fixture_manifest()
    for entry in manifest.get("fixtures", []):
        if entry.get("id") == fixture_id:
            path = FIXTURES_DIR / str(entry.get("file"))
            if not path.is_file():
                return False
            expected = entry.get("sha256")
            if expected:
                return sha256_file(path) == expected
            return True
    return False


def create_probe_workspace(job_dir: Path, fixture_id: str) -> dict[str, Path]:
    """Create isolated probe workspace from master fixture copy."""
    source = resolve_fixture_path(fixture_id)
    workspace = job_dir / "probe-work"
    workspace.mkdir(parents=True, exist_ok=True)
    baseline = workspace / "baseline.h2k"
    working = workspace / "working.h2k"
    shutil.copy2(source, baseline)
    shutil.copy2(source, working)
    master_hash = sha256_file(source)
    baseline_hash = sha256_file(baseline)
    if baseline_hash != master_hash:
        raise RuntimeError("Baseline copy hash mismatch — fixture immutability violated.")
    return {
        "workspace": workspace,
        "baseline": baseline,
        "working": working,
        "master_hash": master_hash,
    }
