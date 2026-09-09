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
    import win32process
except ImportError:  # pragma: no cover - Windows only
    win32con = win32gui = win32api = win32process = None

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
    win32gui.PostMessage(hwnd, win32con.WM_COMMAND, command_id, 0)


def safe_set_foreground(hwnd: int) -> None:
    """Best-effort focus; never raises (Windows blocks background focus)."""
    if not win32gui:
        return
    try:
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass


def windows_for_pid(pid: int) -> list[int]:
    results: list[int] = []

    def callback(hwnd, _):
        try:
            _, window_pid = win32process.GetWindowThreadProcessId(hwnd)
            if window_pid == pid:
                results.append(hwnd)
        except Exception:
            pass

    win32gui.EnumWindows(callback, None)
    return results


def _parse_tasklist_pids(output: str, image_filter: str | None = None) -> set[int]:
    pids: set[int] = set()
    needle = (image_filter or "").lower()
    for line in output.splitlines():
        if needle and needle not in line.lower():
            continue
        parts = [part.strip().strip('"') for part in line.split('","')]
        if len(parts) >= 2:
            try:
                pids.add(int(parts[1]))
            except ValueError:
                pass
    return pids


def hot2000_process_ids(*extra_pids: int) -> set[int]:
    """All running HOT2000 process IDs (launcher may spawn a child)."""
    pids: set[int] = {pid for pid in extra_pids if pid}
    try:
        flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
        exact = subprocess.check_output(
            ["tasklist", "/FI", "IMAGENAME eq HOT2000.exe", "/FO", "CSV", "/NH"],
            text=True,
            creationflags=flags,
        )
        pids |= _parse_tasklist_pids(exact, "hot2000.exe")
        if not pids:
            all_tasks = subprocess.check_output(
                ["tasklist", "/FO", "CSV", "/NH"],
                text=True,
                creationflags=flags,
            )
            pids |= _parse_tasklist_pids(all_tasks, "hot2000")
    except Exception:
        pass
    return pids


def window_area(hwnd: int) -> int:
    try:
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        return max(0, right - left) * max(0, bottom - top)
    except Exception:
        return 0


def describe_window(hwnd: int) -> str:
    try:
        _, wpid = win32process.GetWindowThreadProcessId(hwnd)
        visible = win32gui.IsWindowVisible(hwnd)
        return (
            f"hwnd={hwnd} pid={wpid} class={win32gui.GetClassName(hwnd)!r} "
            f"title={win32gui.GetWindowText(hwnd)!r} visible={visible} "
            f"area={window_area(hwnd)}"
        )
    except Exception as exc:
        return f"hwnd={hwnd} <unreadable: {exc}>"


def enumerate_top_level_windows() -> list[int]:
    windows: list[int] = []

    def callback(hwnd, _):
        try:
            if win32gui.GetParent(hwnd):
                return
            windows.append(hwnd)
        except Exception:
            pass

    win32gui.EnumWindows(callback, None)
    return windows


def score_hot2000_main(hwnd: int, allowed_pids: set[int] | None) -> int:
    """Higher score = more likely the HOT2000 main frame."""
    try:
        if not win32gui.IsWindow(hwnd) or win32gui.GetParent(hwnd):
            return 0
        _, wpid = win32process.GetWindowThreadProcessId(hwnd)
        if allowed_pids is not None and wpid not in allowed_pids:
            return 0

        cls = win32gui.GetClassName(hwnd)
        title = win32gui.GetWindowText(hwnd)
        if cls == "#32770":
            return 0

        title_l = title.lower()
        score = 0
        if "hot2000" in title_l:
            score += 120
        if title_l.startswith("hot2000"):
            score += 40
        if cls.startswith("Afx:"):
            score += 80
        elif cls.startswith("Afx"):
            score += 60
        if "hot2000" in cls.lower():
            score += 70
        if title:
            score += 10
        if win32gui.IsWindowVisible(hwnd):
            score += 25
        area = window_area(hwnd)
        if area >= 200_000:
            score += 40
        elif area >= 50_000:
            score += 20
        elif area >= 10_000:
            score += 10

        if score == 0:
            return 0
        if allowed_pids is not None and wpid in allowed_pids and cls.startswith("Afx"):
            score += 30
        return score
    except Exception:
        return 0


def find_hot2000_main(allowed_pids: set[int] | None = None) -> int | None:
    """Find HOT2000 main window (title may include the open file name)."""
    best_hwnd: int | None = None
    best_score = 0
    for hwnd in enumerate_top_level_windows():
        score = score_hot2000_main(hwnd, allowed_pids)
        if score > best_score:
            best_score = score
            best_hwnd = hwnd
    if best_hwnd and best_score >= 80:
        return best_hwnd
    return None


def wait_for_hot2000_main(seed_pid: int | None = None, timeout_s: int = 120) -> int | None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        pids = hot2000_process_ids(*( [seed_pid] if seed_pid else [] ))
        hwnd = find_hot2000_main(pids or None)
        if hwnd:
            safe_set_foreground(hwnd)
            return hwnd
        hwnd = find_hot2000_main(None)
        if hwnd:
            safe_set_foreground(hwnd)
            return hwnd
        time.sleep(0.25)
    return None


def hot2000_window_diagnostics(seed_pid: int | None = None) -> str:
    pids = hot2000_process_ids(*( [seed_pid] if seed_pid else [] ))
    lines = [f"HOT2000 PIDs: {sorted(pids) if pids else 'none'}"]
    seen: set[int] = set()
    for pid in sorted(pids):
        for hwnd in windows_for_pid(pid):
            if hwnd in seen:
                continue
            seen.add(hwnd)
            lines.append("  " + describe_window(hwnd))
    if not seen:
        lines.append("No top-level windows for HOT2000 PIDs; listing scored candidates:")
        ranked = sorted(
            ((score_hot2000_main(hwnd, None), hwnd) for hwnd in enumerate_top_level_windows()),
            reverse=True,
        )
        for score, hwnd in ranked[:12]:
            if score <= 0:
                break
            lines.append(f"  score={score} {describe_window(hwnd)}")
    return "\n".join(lines)


def find_visible_window(pid: int, title: str | None = None, class_name: str | None = None) -> int | None:
    for hwnd in windows_for_pid(pid):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if title is not None and win32gui.GetWindowText(hwnd) != title:
                continue
            if class_name is not None and win32gui.GetClassName(hwnd) != class_name:
                continue
            return hwnd
        except Exception:
            pass
    return None


def find_results_dialog(pid: int) -> tuple[int | None, int | None]:
    """Find the EnerGuide Rating System Results modal dialog."""
    for hwnd in windows_for_pid(pid):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            if win32gui.GetWindowText(hwnd) == "Progress":
                continue

            found_results_label = False
            ok_button: int | None = None

            def child_callback(child, _):
                nonlocal found_results_label, ok_button
                try:
                    text = win32gui.GetWindowText(child)
                    if text == "EnerGuide Rating System Results":
                        found_results_label = True
                    if (
                        text == "OK"
                        and win32gui.IsWindowVisible(child)
                        and win32gui.IsWindowEnabled(child)
                    ):
                        ok_button = child
                except Exception:
                    pass

            win32gui.EnumChildWindows(hwnd, child_callback, None)
            if found_results_label and ok_button:
                return hwnd, ok_button
        except Exception:
            pass
    return None, None


def close_results_dialog(pid: int) -> bool:
    dialog_hwnd, ok_hwnd = find_results_dialog(pid)
    if not dialog_hwnd or not ok_hwnd:
        return False
    win32gui.SendMessage(ok_hwnd, win32con.BM_CLICK, 0, 0)
    deadline = time.time() + 10
    while time.time() < deadline:
        if not win32gui.IsWindow(dialog_hwnd) or not win32gui.IsWindowVisible(dialog_hwnd):
            return True
        time.sleep(0.1)
    raise RuntimeError("EnerGuide results dialog did not close.")


def wait_for_save_as_dialog(pid: int, timeout_s: int = 30) -> int | None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        for hwnd in windows_for_pid(pid):
            try:
                if not win32gui.IsWindowVisible(hwnd):
                    continue
                if win32gui.GetClassName(hwnd) != "#32770":
                    continue
                title = win32gui.GetWindowText(hwnd)
                if title in ("Save As", "Save House File As"):
                    return hwnd
            except Exception:
                pass
        time.sleep(0.1)
    return None


def dismiss_confirm_overwrite(pid: int) -> None:
    confirm = find_visible_window(pid, title="Confirm Save As", class_name="#32770")
    if not confirm:
        confirm = find_visible_window(pid, title="Confirm", class_name="#32770")
    if not confirm:
        return
    yes_btn = find_child_by_text(confirm, "&Yes")
    if not yes_btn:
        yes_btn = find_child_by_text(confirm, "Yes")
    if yes_btn:
        click_ok(yes_btn)


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


def wait_for_hot2000_progress(job_id: str, pid: int, timeout_s: int = 600) -> None:
    """Poll the HOT2000 Progress dialog until it closes; report real progress to API."""
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")

    start_deadline = time.time() + 30
    progress_hwnd: int | None = None
    while time.time() < start_deadline:
        progress_hwnd = find_visible_window(pid, title="Progress", class_name="#32770")
        if progress_hwnd:
            break
        time.sleep(0.1)

    if not progress_hwnd:
        raise RuntimeError("HOT2000 Progress dialog did not appear.")

    deadline = time.time() + timeout_s
    last_reported = -1
    results_closed = False
    while time.time() < deadline:
        if not results_closed:
            if close_results_dialog(pid):
                results_closed = True
                time.sleep(0.5)

        progress_hwnd = find_visible_window(pid, title="Progress", class_name="#32770")
        if not progress_hwnd:
            close_results_dialog(pid)
            return

        pct = read_progress_percent(progress_hwnd)
        if pct is not None and pct != last_reported:
            progress(job_id, "calculating", hot2000_progress=pct)
            last_reported = pct
        time.sleep(0.2)

    raise RuntimeError("HOT2000 calculation timed out waiting for Progress dialog.")


def find_dialog_filename_edit(dialog_hwnd: int) -> int | None:
    """File name field in a standard Windows Save/Open dialog."""
    edits: list[int] = []

    def callback(hwnd, _):
        try:
            if win32gui.GetClassName(hwnd) == "Edit" and win32gui.IsWindowEnabled(hwnd):
                edits.append(hwnd)
        except Exception:
            pass

    win32gui.EnumChildWindows(dialog_hwnd, callback, None)
    return edits[-1] if edits else None


def set_dialog_filename(dialog_hwnd: int, path: str) -> None:
    """Set Save/Open dialog path without requiring foreground focus."""
    edit_hwnd = find_dialog_filename_edit(dialog_hwnd)
    if edit_hwnd:
        win32gui.SendMessage(edit_hwnd, win32con.WM_SETTEXT, 0, path)
        return
    # Fallback: Alt+N then type characters (no SetForegroundWindow).
    win32api.PostMessage(dialog_hwnd, win32con.WM_KEYDOWN, win32con.VK_MENU, 0)
    win32api.PostMessage(dialog_hwnd, win32con.WM_KEYDOWN, ord("N"), 0)
    win32api.PostMessage(dialog_hwnd, win32con.WM_KEYUP, ord("N"), 0)
    win32api.PostMessage(dialog_hwnd, win32con.WM_KEYUP, win32con.VK_MENU, 0)
    time.sleep(0.2)
    for ch in path:
        win32api.PostMessage(dialog_hwnd, win32con.WM_CHAR, ord(ch), 0)


def save_calculated_h2k(pid: int, output_path: Path) -> None:
    """Save As via WM_COMMAND 57604 and file-name field."""
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")
    save_dialog = wait_for_save_as_dialog(pid)
    if not save_dialog:
        raise RuntimeError("Save As dialog not found.")
    set_dialog_filename(save_dialog, str(output_path))
    time.sleep(0.3)
    save_btn = find_child_by_text(save_dialog, "&Save")
    if not save_btn:
        save_btn = find_child_by_text(save_dialog, "Save")
    if not save_btn:
        raise RuntimeError("Save button not found in Save As dialog.")
    win32gui.SendMessage(save_btn, win32con.BM_CLICK, 0, 0)
    time.sleep(0.5)
    dismiss_confirm_overwrite(pid)
    deadline = time.time() + 30
    while time.time() < deadline:
        if not win32gui.IsWindow(save_dialog) or not win32gui.IsWindowVisible(save_dialog):
            return
        time.sleep(0.25)
    raise RuntimeError("Save As dialog did not close.")


def wait_for_output_file(output_path: Path, timeout_s: int = 20) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if output_path.exists() and output_path.stat().st_size > 0:
            return
        time.sleep(0.25)
    raise RuntimeError("calculated.h2k was not saved.")


def run_hot2000(job_id: str, job_dir: Path) -> str:
    if not win32gui:
        raise RuntimeError(
            "pywin32 is not installed on this worker. Run: pip install pywin32"
        )

    input_path = job_dir / "input.h2k"
    output_path = job_dir / "calculated.h2k"

    progress(job_id, "starting", "Starting HOT2000 Desktop…")
    popen_kwargs: dict = {}
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        popen_kwargs["startupinfo"] = startupinfo
    proc = subprocess.Popen([HOT2000_EXE, str(input_path)], **popen_kwargs)

    main_hwnd = wait_for_hot2000_main(proc.pid, timeout_s=120)
    if not main_hwnd:
        diag = hot2000_window_diagnostics(proc.pid)
        debug_path = job_dir / "window-debug.txt"
        debug_path.write_text(diag, encoding="utf-8")
        try:
            proc.terminate()
        except Exception:
            pass
        raise RuntimeError(
            "Could not find HOT2000 main window after 120s. "
            f"See {debug_path} on the worker PC. Diagnostics:\n{diag}"
        )

    _, hot2000_pid = win32process.GetWindowThreadProcessId(main_hwnd)

    progress(job_id, "opening", "H2K model opened in HOT2000 Desktop…")
    time.sleep(2)

    progress(job_id, "calculating", "HOT2000 Desktop is calculating…")
    send_command(main_hwnd, CMD_CALCULATE)
    wait_for_hot2000_progress(job_id, hot2000_pid)

    progress(job_id, "saving", "Saving calculated H2K…")
    send_command(main_hwnd, CMD_SAVE_AS)
    save_calculated_h2k(hot2000_pid, output_path)
    wait_for_output_file(output_path)

    progress(job_id, "closing", "Closing HOT2000…")
    send_command(main_hwnd, CMD_EXIT)
    try:
        proc.wait(timeout=300)
    except subprocess.TimeoutExpired:
        proc.terminate()

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
