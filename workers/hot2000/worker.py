"""
HOT2000 Windows worker — claims jobs, calculates in HOT2000 Desktop, returns SOC Net GJ/a.

This is a scaffold: production deployments should harden UI automation, logging,
and error handling for your specific HOT2000 build.
"""

from __future__ import annotations

import ctypes
import os
import re
import shutil
import time
import subprocess
from pathlib import Path

import requests

try:
    import win32con
    import win32gui
    import win32api
    import win32process
    import pywintypes
except ImportError:  # pragma: no cover - Windows only
    win32con = win32gui = win32api = win32process = None
    pywintypes = None

# Bump when deploying — included in logs and failure messages.
WORKER_BUILD_ID = "2026-09-09d"

API_BASE = os.environ.get("HOT2000_API_BASE", "http://localhost:3000/api/hot2000").rstrip("/")
WORKER_ID = os.environ.get("HOT2000_WORKER_ID", "win-worker-01")
WORKER_TOKEN = os.environ.get("HOT2000_WORKER_TOKEN", "")
JOBS_ROOT = Path(os.environ.get("HOT2000_JOBS_ROOT", r"C:\HOT2000Worker\jobs"))
HOT2000_EXE = os.environ.get(
    "HOT2000_EXE",
    r"C:\Program Files (x86)\HOT2000\HOT2000.exe",
)

CMD_OPEN = 57601
CMD_SAVE = 57603
CMD_SAVE_AS = 57604
CMD_CALCULATE = 29791
CMD_EXIT = 57665

# Standard Windows common dialog messages (Save/Open filename field).
CDM_SETCONTROLTEXT = 0x468  # WM_USER + 104
CDM_FILENAME_IDS = (0x0480, 0x0470, 1152)  # edt1, cmb13, alternate id

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


def allow_set_foreground_window() -> None:
    """Let this process set foreground when Windows permits it."""
    if os.name != "nt":
        return
    try:
        ctypes.windll.user32.AllowSetForegroundWindow(ctypes.c_uint(0xFFFFFFFF))
    except Exception:
        pass


def win32_errors() -> tuple:
    errors: list[type[BaseException]] = [Exception]
    if pywintypes is not None:
        errors.append(pywintypes.error)
    return tuple(errors)


def win32_call(label: str, fn, *args, default=None):
    """Call a pywin32 function; never raise foreground/UI errors."""
    try:
        return fn(*args)
    except win32_errors() as exc:
        if "SetForegroundWindow" in str(exc):
            return default
        raise RuntimeError(f"{label} failed: {exc}") from exc


def send_command(hwnd: int, command_id: int):
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")
    win32gui.PostMessage(hwnd, win32con.WM_COMMAND, command_id, 0)


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
            return hwnd
        hwnd = find_hot2000_main(None)
        if hwnd:
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
    win32_call("close_results", win32gui.SendMessage, ok_hwnd, win32con.BM_CLICK, 0, 0)
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


def click_dialog_button(dialog_hwnd: int, labels: tuple[str, ...]) -> bool:
    for label in labels:
        btn = find_child_by_text_recursive(dialog_hwnd, label)
        if btn:
            win32_call("click_dialog_button", win32gui.SendMessage, btn, win32con.BM_CLICK, 0, 0)
            return True
    return False


def wait_for_confirm_overwrite(pid: int, timeout_s: int = 20) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        for hwnd in windows_for_pid(pid):
            try:
                if not win32gui.IsWindowVisible(hwnd):
                    continue
                if win32gui.GetClassName(hwnd) != "#32770":
                    continue
                title = win32gui.GetWindowText(hwnd).lower()
                if not any(word in title for word in ("confirm", "replace", "overwrite", "exist")):
                    continue
                if click_dialog_button(hwnd, ("&Yes", "Yes", "&Replace", "Replace", "OK")):
                    time.sleep(0.5)
                    return
            except Exception:
                pass
        time.sleep(0.25)


def find_child_by_text(parent: int, text: str) -> int | None:
    matches: list[int] = []

    def callback(hwnd, _):
        if win32gui.GetWindowText(hwnd) == text:
            matches.append(hwnd)

    win32gui.EnumChildWindows(parent, callback, None)
    return matches[0] if matches else None


def find_child_by_text_recursive(parent: int, text: str) -> int | None:
    found: int | None = None

    def callback(hwnd, _):
        nonlocal found
        if found is not None:
            return
        try:
            if win32gui.GetWindowText(hwnd) == text:
                found = hwnd
                return
            win32gui.EnumChildWindows(hwnd, callback, None)
        except Exception:
            pass

    win32gui.EnumChildWindows(parent, callback, None)
    return found


def find_child_by_class_recursive(parent: int, class_name: str) -> list[int]:
    matches: list[int] = []

    def callback(hwnd, _):
        try:
            if win32gui.GetClassName(hwnd) == class_name:
                matches.append(hwnd)
            win32gui.EnumChildWindows(hwnd, callback, None)
        except Exception:
            pass

    win32gui.EnumChildWindows(parent, callback, None)
    return matches


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


def h2k_has_soc(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
        return bool(re.search(r'houseCode\s*=\s*["\']SOC["\']', text, re.IGNORECASE))
    except Exception:
        return False


def read_edit_text(edit_hwnd: int) -> str:
    try:
        length = win32gui.SendMessage(edit_hwnd, win32con.WM_GETTEXTLENGTH, 0, 0)
        if length <= 0:
            return win32gui.GetWindowText(edit_hwnd).strip()
        buf = ctypes.create_unicode_buffer(length + 1)
        win32gui.SendMessage(edit_hwnd, win32con.WM_GETTEXT, length + 1, buf)
        return buf.value.strip()
    except Exception:
        return ""


def describe_dialog_controls(dialog_hwnd: int) -> str:
    lines: list[str] = []

    def callback(hwnd, _):
        try:
            lines.append(
                f"  hwnd={hwnd} class={win32gui.GetClassName(hwnd)!r} "
                f"text={win32gui.GetWindowText(hwnd)!r} enabled={win32gui.IsWindowEnabled(hwnd)}"
            )
            win32gui.EnumChildWindows(hwnd, callback, None)
        except Exception:
            pass

    win32gui.EnumChildWindows(dialog_hwnd, callback, None)
    return "\n".join(lines)


def find_dialog_filename_edit(dialog_hwnd: int) -> int | None:
    """File name field in a standard Windows Save/Open dialog (nested ComboBox > Edit)."""
    combo_edits: list[int] = []
    for combo_class in ("ComboBoxEx32", "ComboBox"):
        for combo in find_child_by_class_recursive(dialog_hwnd, combo_class):
            combo_edits.extend(find_child_by_class_recursive(combo, "Edit"))
    enabled_combo_edits = [hwnd for hwnd in combo_edits if win32gui.IsWindowEnabled(hwnd)]
    if enabled_combo_edits:
        return max(enabled_combo_edits, key=window_area)

    edits = [
        hwnd
        for hwnd in find_child_by_class_recursive(dialog_hwnd, "Edit")
        if win32gui.IsWindowEnabled(hwnd)
    ]
    if not edits:
        return None
    return max(edits, key=window_area)


def set_edit_text(edit_hwnd: int, path: str) -> bool:
    try:
        win32gui.SendMessage(edit_hwnd, win32con.EM_SETSEL, 0, -1)
        if win32gui.SendMessage(edit_hwnd, win32con.EM_REPLACESEL, 1, path):
            return bool(read_edit_text(edit_hwnd))
    except Exception:
        pass
    try:
        if win32gui.SendMessage(edit_hwnd, win32con.WM_SETTEXT, 0, path):
            return bool(read_edit_text(edit_hwnd))
    except Exception:
        pass
    try:
        win32gui.SendMessage(edit_hwnd, win32con.EM_SETSEL, 0, -1)
        for ch in path:
            win32gui.PostMessage(edit_hwnd, win32con.WM_CHAR, ord(ch), 0)
        time.sleep(0.2)
        return bool(read_edit_text(edit_hwnd))
    except Exception:
        return False


def set_dialog_filename_pywinauto(dialog_hwnd: int, path: str) -> bool:
    try:
        from pywinauto import Desktop
    except ImportError:
        return False
    try:
        dialog = Desktop(backend="win32").window(handle=dialog_hwnd)
        for kwargs in (
            {"best_match": "File &name:Edit"},
            {"class_name": "Edit", "found_index": -1},
        ):
            try:
                field = dialog.child_window(**kwargs)
                field.set_edit_text(path)
                if read_edit_text(field.handle):
                    return True
            except Exception:
                continue
    except Exception:
        return False
    return False


def set_dialog_filename(dialog_hwnd: int, path: str) -> int:
    """Set Save/Open dialog path without requiring foreground focus."""
    candidates = [path, path.replace("/", "\\"), os.path.basename(path)]

    for control_id in CDM_FILENAME_IDS:
        for candidate in candidates:
            try:
                win32gui.SendMessage(dialog_hwnd, CDM_SETCONTROLTEXT, control_id, candidate)
            except Exception:
                pass

    edit_hwnd = find_dialog_filename_edit(dialog_hwnd)
    if edit_hwnd:
        for candidate in candidates:
            if set_edit_text(edit_hwnd, candidate):
                return edit_hwnd

    if set_dialog_filename_pywinauto(dialog_hwnd, path):
        edit_hwnd = find_dialog_filename_edit(dialog_hwnd)
        if edit_hwnd and read_edit_text(edit_hwnd):
            return edit_hwnd

    if edit_hwnd:
        # Some dialogs accept the path even when WM_GETTEXT stays empty.
        set_edit_text(edit_hwnd, path)
        return edit_hwnd

    raise RuntimeError("File name field not found in Save As dialog.")


def activate_save_dialog(dialog_hwnd: int, edit_hwnd: int | None) -> None:
    if click_dialog_button(dialog_hwnd, ("&Save", "Save")):
        return
    # IDOK = 1 for many common dialogs.
    win32_call("save_idok", win32gui.SendMessage, dialog_hwnd, win32con.WM_COMMAND, 1, 0)
    if edit_hwnd:
        win32_call(
            "save_enter_down",
            win32api.PostMessage,
            edit_hwnd,
            win32con.WM_KEYDOWN,
            win32con.VK_RETURN,
            0,
        )
        win32_call(
            "save_enter_up",
            win32api.PostMessage,
            edit_hwnd,
            win32con.WM_KEYUP,
            win32con.VK_RETURN,
            0,
        )


def dismiss_blocking_dialogs(pid: int) -> None:
    for hwnd in windows_for_pid(pid):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            title = win32gui.GetWindowText(hwnd).lower()
            if title in ("save as", "save house file as", "progress"):
                continue
            if any(word in title for word in ("save", "confirm", "overwrite", "replace", "yes", "warning")):
                click_dialog_button(hwnd, ("&Yes", "Yes", "OK", "&OK", "&Save", "Save"))
        except Exception:
            pass


def save_in_place(main_hwnd: int, output_path: Path, pid: int) -> bool:
    """Save the open house file without opening Save As (File > Save)."""
    before = output_path.stat()
    send_command(main_hwnd, CMD_SAVE)
    deadline = time.time() + 30
    while time.time() < deadline:
        dismiss_blocking_dialogs(pid)
        if h2k_has_soc(output_path):
            return True
        try:
            stat = output_path.stat()
            if stat.st_mtime > before.st_mtime or stat.st_size != before.st_size:
                if h2k_has_soc(output_path):
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def wait_for_save_dialog_close(save_dialog: int, timeout_s: int = 45) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if not win32gui.IsWindow(save_dialog):
            return
        if not win32gui.IsWindowVisible(save_dialog):
            return
        time.sleep(0.25)
    raise RuntimeError("Save As dialog did not close.")


def save_calculated_h2k(pid: int, output_path: Path, job_dir: Path | None = None) -> None:
    """Save As via WM_COMMAND 57604 and file-name field."""
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")
    path_str = str(output_path.resolve())
    save_dialog = wait_for_save_as_dialog(pid, timeout_s=45)
    if not save_dialog:
        raise RuntimeError("Save As dialog not found.")

    try:
        edit_hwnd = set_dialog_filename(save_dialog, path_str)
    except RuntimeError as exc:
        if job_dir is not None:
            debug_path = job_dir / "save-debug.txt"
            debug_path.write_text(
                f"{exc}\nDialog controls:\n{describe_dialog_controls(save_dialog)}",
                encoding="utf-8",
            )
        raise

    time.sleep(0.3)
    activate_save_dialog(save_dialog, edit_hwnd)

    wait_for_confirm_overwrite(pid)
    wait_for_save_dialog_close(save_dialog)


def wait_for_file_update(
    output_path: Path,
    previous_mtime: float,
    previous_size: int,
    timeout_s: int = 60,
) -> None:
    deadline = time.time() + timeout_s
    last_error: Exception | None = None
    while time.time() < deadline:
        if output_path.exists():
            stat = output_path.stat()
            if stat.st_mtime > previous_mtime or stat.st_size != previous_size:
                try:
                    with output_path.open("rb") as handle:
                        handle.read(1)
                    return
                except (PermissionError, OSError) as exc:
                    last_error = exc
        time.sleep(0.25)

    siblings = sorted(output_path.parent.glob("*.h2k"))
    hint = f" Files in job folder: {[p.name for p in siblings]}" if siblings else ""
    detail = f" Last read error: {last_error}" if last_error else ""
    raise RuntimeError(f"calculated.h2k was not updated after save.{hint}{detail}")


def wait_for_output_file(output_path: Path, timeout_s: int = 60) -> None:
    if not output_path.exists():
        raise RuntimeError("calculated.h2k was not saved.")
    stat = output_path.stat()
    wait_for_file_update(output_path, stat.st_mtime - 1, stat.st_size, timeout_s=timeout_s)


def run_hot2000(job_id: str, job_dir: Path) -> str:
    if not win32gui:
        raise RuntimeError(
            "pywin32 is not installed on this worker. Run: pip install pywin32"
        )

    allow_set_foreground_window()

    input_path = job_dir / "input.h2k"
    output_path = job_dir / "calculated.h2k"
    shutil.copy2(input_path, output_path)

    progress(job_id, "starting", f"Starting HOT2000 Desktop ({WORKER_BUILD_ID})…")
    popen_kwargs: dict = {}
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        popen_kwargs["startupinfo"] = startupinfo
    proc = subprocess.Popen([HOT2000_EXE, str(output_path)], **popen_kwargs)

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
    if not save_in_place(main_hwnd, output_path, hot2000_pid):
        send_command(main_hwnd, CMD_SAVE_AS)
        time.sleep(1)
        save_calculated_h2k(hot2000_pid, output_path, job_dir)
        wait_for_output_file(output_path)
    elif not h2k_has_soc(output_path):
        raise RuntimeError("HOT2000 saved the file but SOC results are missing.")

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
        fail(job_id, f"{exc} [worker {WORKER_BUILD_ID}]")


def main():
    if not WORKER_TOKEN:
        raise SystemExit("HOT2000_WORKER_TOKEN is required.")
    print(f"HOT2000 worker {WORKER_BUILD_ID}")
    JOBS_ROOT.mkdir(parents=True, exist_ok=True)
    while True:
        job = claim_job()
        if not job:
            time.sleep(3)
            continue
        process_job(job)


if __name__ == "__main__":
    main()
