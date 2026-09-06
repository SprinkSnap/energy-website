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
    """SOC Net GJ/a from Results[@houseCode=SOC]/Annual/Consumption/@total."""
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


def complete(job_id: str, calculated_xml: str):
    api_post(
        f"/worker/{job_id}/complete",
        {
            "worker_id": WORKER_ID,
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


def read_progress_percent(progress_hwnd: int) -> int | None:
    if not win32gui:
        return None
    percent: int | None = None

    def callback(hwnd, _):
        nonlocal percent
        cls = win32gui.GetClassName(hwnd)
        if cls == "msctls_progress32":
            try:
                pos = win32gui.SendMessage(hwnd, win32con.PBM_GETPOS, 0, 0)
                if isinstance(pos, int):
                    percent = max(0, min(100, pos))
            except Exception:
                pass

    win32gui.EnumChildWindows(progress_hwnd, callback, None)
    return percent


def wait_for_hot2000_progress(job_id: str, timeout_s: int = 600) -> None:
    """Poll the HOT2000 Progress dialog until it closes; report real progress to API."""
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")
    deadline = time.time() + timeout_s
    last_reported = -1
    while time.time() < deadline:
        progress_hwnd = win32gui.FindWindow("#32770", "Progress")
        if not progress_hwnd:
            return
        pct = read_progress_percent(progress_hwnd)
        if pct is not None and pct != last_reported:
            progress(job_id, "calculating", hot2000_progress=pct)
            last_reported = pct
        time.sleep(0.5)
    raise RuntimeError("HOT2000 calculation timed out waiting for Progress dialog.")


def save_calculated_h2k(output_path: Path) -> None:
    """Save As via WM_COMMAND 57604 and file-name field (Alt+N, type path, Save)."""
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")
    save_dialog = win32gui.FindWindow("#32770", "Save As")
    if not save_dialog:
        raise RuntimeError("Save As dialog not found.")
    win32api.PostMessage(save_dialog, win32con.WM_KEYDOWN, win32con.VK_MENU, 0)
    win32api.PostMessage(save_dialog, win32con.WM_KEYDOWN, ord("N"), 0)
    time.sleep(0.2)
    for ch in str(output_path):
        win32api.PostMessage(save_dialog, win32con.WM_CHAR, ord(ch), 0)
    save_btn = find_child_by_text(save_dialog, "Save")
    if not save_btn:
        raise RuntimeError("Save button not found in Save As dialog.")
    click_ok(save_btn)
    time.sleep(1)


def run_hot2000(job_id: str, job_dir: Path) -> str:
    input_path = job_dir / "input.h2k"
    output_path = job_dir / "calculated.h2k"

    progress(job_id, "starting", "Starting HOT2000 Desktop…")
    proc = subprocess.Popen([HOT2000_EXE, str(input_path)])

    time.sleep(8)
    main_hwnd = win32gui.FindWindow(None, "HOT2000") if win32gui else None
    if not main_hwnd:
        raise RuntimeError("Could not find HOT2000 main window.")

    progress(job_id, "opening", "Opening H2K model…")
    send_command(main_hwnd, CMD_OPEN)

    progress(job_id, "calculating", "HOT2000 Desktop is calculating…")
    send_command(main_hwnd, CMD_CALCULATE)
    wait_for_hot2000_progress(job_id)

    results_ok = find_child_by_text(main_hwnd, "OK")
    if results_ok:
        click_ok(results_ok)
        time.sleep(1)

    progress(job_id, "saving", "Saving calculated H2K…")
    send_command(main_hwnd, CMD_SAVE_AS)
    time.sleep(1)
    save_calculated_h2k(output_path)

    progress(job_id, "closing", "Closing HOT2000…")
    send_command(main_hwnd, CMD_EXIT)
    proc.wait(timeout=300)

    if not output_path.exists():
        raise RuntimeError("calculated.h2k was not saved.")

    progress(job_id, "extracting", "Reading SOC results…")
    return output_path.read_text(encoding="utf-8")


def process_job(job: dict):
    job_id = job["job_id"]
    job_dir = JOBS_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        download_input(job, job_dir / "input.h2k")
        calculated_xml = run_hot2000(job_id, job_dir)
        complete(job_id, calculated_xml)
    except Exception as exc:  # noqa: BLE001
        fail(job_id, str(exc))


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
