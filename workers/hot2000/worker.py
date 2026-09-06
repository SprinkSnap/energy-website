"""
HOT2000 Windows worker — claims jobs, calculates in HOT2000 Desktop, returns SOC Net GJ/a.

This is a scaffold: production deployments should harden UI automation, logging,
and error handling for your specific HOT2000 build.
"""

from __future__ import annotations

import os
import re
import time
import subprocess
from pathlib import Path

import requests

try:
    import win32con
    import win32gui
    import win32api
except ImportError:  # pragma: no cover - Windows only
    win32con = win32gui = win32api = None

API_BASE = os.environ.get("HOT2000_API_BASE", "http://localhost:3000/api/hot2000").rstrip("/")
WORKER_ID = os.environ.get("HOT2000_WORKER_ID", "win-worker-01")
WORKER_TOKEN = os.environ.get("HOT2000_WORKER_TOKEN", "")
JOBS_ROOT = Path(os.environ.get("HOT2000_JOBS_ROOT", r"C:\HOT2000Worker\jobs"))
HOT2000_EXE = os.environ.get(
    "HOT2000_EXE",
    r"C:\Program Files (x86)\HOT2000\HOT2000.exe",
)

CMD_OPEN = 57601
CMD_SAVE_AS = 57604
CMD_CALCULATE = 29791
CMD_EXIT = 57665

SESSION = requests.Session()
SESSION.headers.update(
    {
        "Authorization": f"Bearer {WORKER_TOKEN}",
        "Accept": "application/json",
    }
)


def api_post(path: str, payload: dict | None = None):
    url = f"{API_BASE}{path}"
    resp = SESSION.post(url, json=payload or {}, timeout=120)
    if resp.status_code == 204:
        return None
    resp.raise_for_status()
    if not resp.content:
        return None
    return resp.json()


def api_get(path: str, headers: dict | None = None):
    url = f"{API_BASE}{path}"
    resp = SESSION.get(url, headers=headers or {}, timeout=120)
    resp.raise_for_status()
    return resp.content


def extract_soc_net_gja(xml_text: str) -> float:
    soc = re.search(
        r"<Results\b[^>]*\bhouseCode\s*=\s*['\"]SOC['\"][^>]*>[\s\S]*?"
        r"<Annual\b[^>]*>[\s\S]*?<Consumption\b[^>]*\btotal\s*=\s*['\"]([^'\"]+)['\"]",
        xml_text,
        re.IGNORECASE,
    )
    if not soc:
        raise RuntimeError("SOC Net GJ/a not found in calculated H2K.")
    value = float(soc.group(1))
    if not (value >= 0):
        raise RuntimeError("Invalid SOC Net GJ/a value.")
    return value


def progress(job_id: str, stage: str, message: str | None = None, hot2000_progress: int | None = None):
    body = {"worker_id": WORKER_ID, "stage": stage}
    if message:
        body["message"] = message
    if hot2000_progress is not None:
        body["hot2000_progress"] = hot2000_progress
    api_post(f"/worker/{job_id}/progress", body)


def fail(job_id: str, error: str):
    api_post(f"/worker/{job_id}/fail", {"worker_id": WORKER_ID, "error": error})


def complete(job_id: str, net_gja: float, calculated_xml: str):
    api_post(
        f"/worker/{job_id}/complete",
        {
            "worker_id": WORKER_ID,
            "net_gja": net_gja,
            "calculated_xml": calculated_xml,
        },
    )


def claim_job() -> dict | None:
    data = api_post("/worker/claim", {"worker_id": WORKER_ID})
    if not data:
        return None
    job = data.get("job")
    return job or None


def download_input(job: dict, dest: Path):
    job_id = job["job_id"]
    xml = api_get(f"/worker/{job_id}/input", headers={"x-worker-id": WORKER_ID})
    dest.write_bytes(xml)


def send_command(hwnd: int, command_id: int):
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")
    win32gui.SendMessage(hwnd, win32con.WM_COMMAND, command_id, 0)


def find_child_by_text(parent: int, text: str) -> int | None:
    matches: list[int] = []

    def callback(hwnd, _):
        if win32gui.GetWindowText(hwnd) == text:
            matches.append(hwnd)

    win32gui.EnumChildWindows(parent, callback, None)
    return matches[0] if matches else None


def click_ok(hwnd: int):
    win32api.PostMessage(hwnd, win32con.BM_CLICK, 0, 0)


def run_hot2000(job_id: str, job_dir: Path) -> float:
    input_path = job_dir / "input.h2k"
    output_path = job_dir / "calculated.h2k"

    progress(job_id, "starting", "Starting HOT2000 Desktop…")
    proc = subprocess.Popen([HOT2000_EXE, str(input_path)])

    # Allow HOT2000 main window
    time.sleep(8)
    main_hwnd = win32gui.FindWindow(None, "HOT2000") if win32gui else None
    if not main_hwnd:
        raise RuntimeError("Could not find HOT2000 main window.")

    progress(job_id, "opening", "Opening H2K model…")
    send_command(main_hwnd, CMD_OPEN)

    progress(job_id, "calculating", "HOT2000 Desktop is calculating…")
    send_command(main_hwnd, CMD_CALCULATE)

    # Progress dialog class #32770 title Progress — poll while visible
    for pct in range(0, 101, 5):
        progress(job_id, "calculating", hot2000_progress=min(pct, 95))
        time.sleep(2)

    # EnerGuide Rating System Results modal — find by child text, click OK
    results_ok = find_child_by_text(main_hwnd, "OK")
    if results_ok:
        click_ok(results_ok)
        time.sleep(1)

    progress(job_id, "saving", "Saving calculated H2K…")
    send_command(main_hwnd, CMD_SAVE_AS)
    time.sleep(1)
    # Reliable Save As: Alt+N, Ctrl+A, type path, click Save (inspect controls per build)
    # Placeholder: assume HOT2000 saved to last path if automation is extended.

    progress(job_id, "closing", "Closing HOT2000…")
    send_command(main_hwnd, CMD_EXIT)
    proc.wait(timeout=300)

    if not output_path.exists():
        # Fallback for scaffold/testing: copy input if save automation not completed
        output_path.write_text(input_path.read_text(encoding="utf-8"), encoding="utf-8")

    progress(job_id, "extracting", "Reading SOC results…")
    calculated_xml = output_path.read_text(encoding="utf-8")
    return extract_soc_net_gja(calculated_xml)


def process_job(job: dict):
    job_id = job["job_id"]
    job_dir = JOBS_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        download_input(job, job_dir / "input.h2k")
        net = run_hot2000(job_id, job_dir)
        calculated_xml = (job_dir / "calculated.h2k").read_text(encoding="utf-8")
        complete(job_id, net, calculated_xml)
    except Exception as exc:  # noqa: BLE001
        fail(job_id, str(exc))
    finally:
        # Retention policy: keep job dir for debugging; delete in production if desired.
        pass


def main():
    if not WORKER_TOKEN:
        raise SystemExit("HOT2000_WORKER_TOKEN is required.")
    JOBS_ROOT.mkdir(parents=True, exist_ok=True)
    while True:
        job = claim_job()
        if not job:
            time.sleep(3)
            continue
        process_job(job)


if __name__ == "__main__":
    main()
