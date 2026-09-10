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
import threading
import time
import subprocess
from pathlib import Path

import requests

try:
    import win32con
    import win32gui
    import win32api
    import win32process
    import win32print
    import pywintypes
except ImportError:  # pragma: no cover - Windows only
    win32con = win32gui = win32api = win32process = win32print = None
    pywintypes = None

# Bump when deploying — included in logs and failure messages.
WORKER_BUILD_ID = "2026-09-10ze"

API_BASE = os.environ.get("HOT2000_API_BASE", "http://localhost:3000/api/hot2000").rstrip("/")
WORKER_ID = os.environ.get("HOT2000_WORKER_ID", "win-worker-01")
JOBS_ROOT = Path(os.environ.get("HOT2000_JOBS_ROOT", r"C:\HOT2000Worker\jobs"))


def get_worker_token() -> str:
    return os.environ.get("HOT2000_WORKER_TOKEN", "").strip()


def load_worker_env_file() -> None:
    """Load C:\\HOT2000Worker\\.env (KEY=VALUE lines) into os.environ."""
    env_path = JOBS_ROOT.parent / ".env"
    if not env_path.is_file():
        return
    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception as exc:
        print(f"WARNING: Could not read {env_path}: {exc}")


def sync_session_auth() -> str:
    token = get_worker_token()
    SESSION.headers["Authorization"] = f"Bearer {token}"
    return token


WORKER_TOKEN = get_worker_token()
STDLIBS_WINDOWCODES = "Windowcodes2025.cod"

_DEFAULT_HOT2000_EXE = r"C:\Program Files (x86)\HOT2000\HOT2000.exe"


def hot2000_exe_candidates() -> list[Path]:
    configured = os.environ.get("HOT2000_EXE", "").strip()
    names = ("HOT2000.exe", "Hot2000.exe")
    roots = [
        Path(r"C:\Program Files (x86)\HOT2000"),
        Path(r"C:\Program Files\HOT2000"),
        Path(r"C:\HOT2000 v11.13b13"),
        Path(r"C:\HOT2000 v11.13"),
        Path(r"C:\HOT2000"),
    ]
    candidates: list[Path] = []
    seen: set[str] = set()

    def add(path: Path) -> None:
        key = str(path).lower()
        if key not in seen:
            seen.add(key)
            candidates.append(path)

    if configured:
        add(Path(configured))
    add(Path(_DEFAULT_HOT2000_EXE))
    for root in roots:
        for name in names:
            add(root / name)
    return candidates


def resolve_hot2000_paths() -> tuple[Path, Path]:
    env_home = os.environ.get("HOT2000_HOME", "").strip()
    for candidate in hot2000_exe_candidates():
        if candidate.is_file():
            home = Path(env_home) if env_home else candidate.parent
            return candidate, home
    default_home = Path(env_home) if env_home else Path(_DEFAULT_HOT2000_EXE).parent
    return Path(os.environ.get("HOT2000_EXE", _DEFAULT_HOT2000_EXE)), default_home


HOT2000_EXE_PATH, HOT2000_HOME = resolve_hot2000_paths()
HOT2000_EXE = str(HOT2000_EXE_PATH)

CMD_OPEN = 57601
CMD_SAVE = 57603
CMD_SAVE_AS = 57604
CMD_CALCULATE = 29791
CMD_EXIT = 57665

# Confirm Save As (Windows common dialog) — No is the default button.
IDYES = 6
YES_BUTTON_LABELS = ("&Yes", "Yes", "&Replace", "Replace")
OVERWRITE_BODY_WORDS = (
    "already exists",
    "do you want to replace",
    "want to replace it",
    "replace it",
    "calculated.h2k",
)

# Standard Windows common dialog messages (Save/Open filename field).
CDM_SETCONTROLTEXT = 0x468  # WM_USER + 104
CDM_FILENAME_IDS = (0x0480, 0x0470, 1152)  # edt1, cmb13, alternate id

SESSION = requests.Session()
SESSION.headers.update({"Accept": "application/json"})
sync_session_auth()


def api_post(path: str, payload: dict | None = None):
    if not sync_session_auth():
        raise RuntimeError("HOT2000_WORKER_TOKEN is not set.")
    url = f"{API_BASE}{path}"
    resp = SESSION.post(url, json=payload or {}, timeout=120)
    if resp.status_code == 204:
        return None
    resp.raise_for_status()
    if not resp.content:
        return None
    return resp.json()


def api_get(path: str, headers: dict | None = None):
    if not sync_session_auth():
        raise RuntimeError("HOT2000_WORKER_TOKEN is not set.")
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


def complete(job_id: str, calculated_xml: str, report_pdf_base64: str | None = None):
    body = {
        "worker_id": WORKER_ID,
        "calculated_xml": calculated_xml,
    }
    if report_pdf_base64:
        body["report_pdf_base64"] = report_pdf_base64
    api_post(f"/worker/{job_id}/complete", body)


def verify_api_credentials() -> None:
    """Fail fast when the bearer token does not match the server secret."""
    try:
        api_post(
            "/worker/heartbeat",
            {"worker_id": WORKER_ID, "build_id": WORKER_BUILD_ID},
        )
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status == 401:
            raise SystemExit(
                "HOT2000_WORKER_TOKEN was rejected (401 Unauthorized).\n"
                f"  API: {API_BASE}\n"
                "  The token on this PC must exactly match the Cloudflare Worker secret "
                "HOT2000_WORKER_TOKEN.\n"
                "  Cloudflare: Workers → energy-website → Settings → Variables and Secrets\n"
                "  Windows:  $env:HOT2000_WORKER_TOKEN = '<same secret>'\n"
                "  Or copy worker-env.example.ps1 to worker-env.ps1, edit, then:\n"
                "            . .\\worker-env.ps1; python worker.py"
            ) from exc
        raise SystemExit(f"API connection failed (HTTP {status}): {exc}") from exc
    except Exception as exc:
        raise SystemExit(f"API connection failed: {exc}") from exc
    print(f"API auth OK — {API_BASE} (worker {WORKER_ID})")


def heartbeat() -> bool:
    try:
        api_post(
            "/worker/heartbeat",
            {"worker_id": WORKER_ID, "build_id": WORKER_BUILD_ID},
        )
        return True
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status == 401:
            return False
        print(f"Heartbeat failed: {exc}")
        return True
    except Exception as exc:
        print(f"Heartbeat failed: {exc}")
        return True


def claim_job() -> dict | None:
    data = api_post("/worker/claim", {"worker_id": WORKER_ID})
    if not data:
        return None
    job = data.get("job")
    return job or None


def safe_claim_job() -> dict | None:
    try:
        return claim_job()
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status == 401:
            raise
        print(f"Claim failed: {exc}")
        return None
    except Exception as exc:
        print(f"Claim failed: {exc}")
        return None


def exit_on_auth_failure(context: str) -> None:
    raise SystemExit(
        f"HOT2000_WORKER_TOKEN was rejected (401) during {context}.\n"
        f"  API: {API_BASE}\n"
        "  The token must exactly match Cloudflare secret HOT2000_WORKER_TOKEN.\n"
        "  If you just changed the Cloudflare secret, update this PC and restart.\n"
        "  Set in this shell before python worker.py:\n"
        '    $env:HOT2000_WORKER_TOKEN = "<same secret>"'
    )


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


def command_target_windows(hwnd: int) -> list[int]:
    """Candidate HWNDs for WM_COMMAND — main frame plus active popup/menu."""
    if not hwnd or not win32gui.IsWindow(hwnd):
        return []
    targets: list[int] = [hwnd]
    try:
        popup = win32gui.GetLastActivePopup(hwnd)
        if popup and popup != hwnd and win32gui.IsWindow(popup):
            targets.append(popup)
    except Exception:
        pass
    return targets


def post_wm_command(hwnd: int, command_id: int) -> None:
    """Deliver WM_COMMAND using PostMessage, then SendMessage fallbacks."""
    allow_set_foreground_window()
    last_error: Exception | None = None
    caller_tid = win32api.GetCurrentThreadId()

    for target in command_target_windows(hwnd):
        for deliver in (
            lambda h: win32gui.PostMessage(h, win32con.WM_COMMAND, command_id, 0),
            lambda h: win32gui.SendMessage(h, win32con.WM_COMMAND, command_id, 0),
        ):
            try:
                deliver(target)
                return
            except win32_errors() as exc:
                last_error = exc
                if getattr(exc, "winerror", None) != 5:
                    break

        try:
            target_tid = win32process.GetWindowThreadProcessId(target)[0]
            attached = win32process.AttachThreadInput(caller_tid, target_tid, True)
            try:
                win32gui.SendMessage(target, win32con.WM_COMMAND, command_id, 0)
                return
            finally:
                if attached:
                    win32process.AttachThreadInput(caller_tid, target_tid, False)
        except win32_errors() as exc:
            last_error = exc

    hint = (
        " Run the worker in the same Windows session as HOT2000 (not as a service). "
        "If HOT2000 is elevated (Run as administrator), run PowerShell as administrator too."
    )
    detail = f" ({last_error})" if last_error else ""
    raise RuntimeError(f"PostMessage WM_COMMAND {command_id} failed{detail}.{hint}")


def send_command(hwnd: int, command_id: int):
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")
    post_wm_command(hwnd, command_id)


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


def hot2000_process_alive(job_pids: int | set[int]) -> bool:
    """True while any HOT2000 job process still owns a top-level window."""
    if not win32gui:
        return True
    for pid in normalize_job_pids(job_pids):
        try:
            if windows_for_pid(pid):
                return True
        except Exception:
            continue
    return False


def hot2000_process_running(job_pids: int | set[int]) -> bool:
    """True while the HOT2000 OS process has not exited."""
    still_active = getattr(win32con, "STILL_ACTIVE", 259)
    if win32api and win32process:
        for pid in normalize_job_pids(job_pids):
            handle = None
            try:
                handle = win32api.OpenProcess(
                    win32con.PROCESS_QUERY_LIMITED_INFORMATION,
                    False,
                    pid,
                )
                if not handle:
                    continue
                if win32process.GetExitCodeProcess(handle) == still_active:
                    return True
            except Exception:
                continue
            finally:
                if handle:
                    try:
                        win32api.CloseHandle(handle)
                    except Exception:
                        pass
    return hot2000_process_alive(job_pids)


def pdf_output_ready(output_path: Path | None) -> bool:
    if output_path is None:
        return False
    try:
        if not output_path.is_file() or output_path.stat().st_size < 128:
            return False
        with output_path.open("rb") as handle:
            return handle.read(5).startswith(b"%PDF")
    except OSError:
        return False


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


def is_hot2000_main_candidate(title: str, class_name: str) -> bool:
    """True only for the MFC HOT2000 main frame — not Notepad or other apps."""
    cls = (class_name or "").strip()
    title_l = (title or "").strip().lower()
    if cls in ("#32770", "Notepad"):
        return False
    if " - notepad" in title_l or title_l.endswith("notepad"):
        return False
    if not cls.startswith("Afx:"):
        return False
    return "hot2000" in title_l or cls.lower().startswith("afx")


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
        if not is_hot2000_main_candidate(title, cls):
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
        else:
            score -= 200
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


def find_hot2000_main(
    allowed_pids: set[int] | None = None,
    preferred_pid: int | None = None,
) -> int | None:
    """Find HOT2000 main window (title may include the open file name)."""
    best_hwnd: int | None = None
    best_score = 0
    for hwnd in enumerate_top_level_windows():
        score = score_hot2000_main(hwnd, allowed_pids)
        if preferred_pid is not None:
            try:
                _, wpid = win32process.GetWindowThreadProcessId(hwnd)
                if wpid == preferred_pid:
                    score += 300
            except Exception:
                pass
        if score > best_score:
            best_score = score
            best_hwnd = hwnd
    if best_hwnd and best_score >= 80:
        return best_hwnd
    return None


def validate_hot2000_main(hwnd: int) -> None:
    """Ensure automation targets HOT2000 Desktop, not Notepad or another app."""
    try:
        cls = win32gui.GetClassName(hwnd)
        title = win32gui.GetWindowText(hwnd)
    except Exception as exc:
        raise RuntimeError(f"Could not read HOT2000 main window: {exc}") from exc
    if not is_hot2000_main_candidate(title, cls):
        raise RuntimeError(
            "Matched the wrong window for HOT2000 automation "
            f"(class={cls!r}, title={title!r}). "
            "Close Notepad or other windows with 'HOT2000' in the title and retry."
        )


def child_process_ids(parent_pid: int) -> set[int]:
    pids: set[int] = set()
    try:
        flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
        output = subprocess.check_output(
            [
                "wmic",
                "process",
                "where",
                f"ParentProcessId={parent_pid}",
                "get",
                "ProcessId",
                "/format:value",
            ],
            text=True,
            creationflags=flags,
        )
        for line in output.splitlines():
            if line.startswith("ProcessId="):
                try:
                    pids.add(int(line.split("=", 1)[1].strip()))
                except ValueError:
                    pass
    except Exception:
        pass
    return pids


def job_process_ids(proc: subprocess.Popen, main_hwnd: int | None = None) -> set[int]:
    """PIDs belonging to this worker job — not every HOT2000.exe on the PC."""
    pids = {proc.pid} | child_process_ids(proc.pid)
    if main_hwnd:
        try:
            _, wpid = win32process.GetWindowThreadProcessId(main_hwnd)
            pids.add(wpid)
        except Exception:
            pass
    return pids


def kill_stale_hot2000_processes(exclude_pids: set[int] | None = None) -> int:
    """Force-close orphaned HOT2000 instances left from failed jobs."""
    exclude = exclude_pids or set()
    killed = 0
    flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
    for pid in sorted(hot2000_process_ids()):
        if pid in exclude:
            continue
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                check=False,
                creationflags=flags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            killed += 1
        except Exception:
            pass
    if killed:
        time.sleep(2)
    return killed


def ensure_hot2000_visible(main_hwnd: int) -> None:
    try:
        win32gui.ShowWindow(main_hwnd, win32con.SW_RESTORE)
        win32gui.ShowWindow(main_hwnd, win32con.SW_SHOW)
    except Exception:
        pass


def wait_for_hot2000_main(seed_pid: int | None = None, timeout_s: int = 120) -> int | None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if seed_pid is not None:
            allowed = {seed_pid} | child_process_ids(seed_pid)
            hwnd = find_hot2000_main(allowed, preferred_pid=seed_pid)
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


def dialog_has_progress_bar(hwnd: int) -> bool:
    try:
        if win32gui.GetClassName(hwnd) != "#32770":
            return False
        return bool(find_child_by_class_recursive(hwnd, "msctls_progress32"))
    except Exception:
        return False


def normalize_job_pids(job_pids: int | set[int] | list[int] | tuple[int, ...]) -> set[int]:
    """Coerce a single PID or collection into a non-empty PID set."""
    if isinstance(job_pids, int):
        return {job_pids} if job_pids else set()
    return {int(pid) for pid in job_pids if pid}


def find_progress_window(pids: int | set[int]) -> int | None:
    pids = normalize_job_pids(pids)
    for pid in pids:
        for hwnd in windows_for_pid(pid):
            try:
                if not win32gui.IsWindowVisible(hwnd):
                    continue
                if win32gui.GetClassName(hwnd) != "#32770":
                    continue
                if win32gui.GetWindowText(hwnd) == "Progress" or dialog_has_progress_bar(hwnd):
                    return hwnd
            except Exception:
                pass
    for hwnd in enumerate_visible_dialogs():
        try:
            _, wpid = win32process.GetWindowThreadProcessId(hwnd)
            if wpid not in pids:
                continue
            if win32gui.GetWindowText(hwnd) == "Progress" or dialog_has_progress_bar(hwnd):
                return hwnd
        except Exception:
            pass
    return None


def calculation_results_visible(pids: int | set[int]) -> bool:
    for pid in normalize_job_pids(pids):
        if find_results_dialog(pid)[0]:
            return True
    return False


def find_calculation_blocking_error(pids: int | set[int]) -> str | None:
    """Return HOT2000 error text when calculate is blocked by a modal dialog."""
    pids = normalize_job_pids(pids)
    skip_titles = {
        "progress",
        "save as",
        "save house file as",
        "confirm save as",
    }
    for hwnd in enumerate_visible_dialogs():
        try:
            _, wpid = win32process.GetWindowThreadProcessId(hwnd)
            if wpid not in pids:
                continue
            title = (win32gui.GetWindowText(hwnd) or "").strip()
            title_l = title.lower()
            if title_l in skip_titles:
                continue
            if is_overwrite_confirm_dialog(hwnd):
                continue
            if find_results_dialog(wpid)[0] == hwnd:
                continue
            body = " ".join(dialog_static_texts(hwnd)).strip()
            if not body:
                body = dialog_visible_text(hwnd).strip()
            if not body:
                continue
            if title_l in ("hot2000", "error", "warning", "confirm", ""):
                return f"{title}: {body}" if title else body
            if any(word in body.lower() for word in ("error", "invalid", "not found", "cannot", "failed")):
                return f"{title}: {body}" if title else body
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


def as_dialog_hwnd(hwnd: int | object) -> int:
    """Coerce a Win32 HWND from pywinauto wrappers or raw integers."""
    if isinstance(hwnd, int):
        return hwnd
    handle = getattr(hwnd, "handle", None)
    if callable(handle):
        handle = handle()
    if isinstance(handle, int):
        return handle
    wrapper = getattr(hwnd, "wrapper_object", None)
    if callable(wrapper):
        try:
            return int(wrapper().handle)
        except Exception:
            pass
    raise TypeError(f"Expected Win32 HWND, got {type(hwnd).__name__}.")


def normalize_menu_label(text: str) -> str:
    return (text or "").replace("&", "").strip().lower()


def _get_menu_item_text_win32gui_struct(menu: int, index: int) -> str:
    try:
        import win32gui_struct
    except ImportError:
        return ""
    try:
        mii, _extras = win32gui_struct.EmptyMENUITEMINFO()
        win32gui.GetMenuItemInfo(menu, index, True, mii)
        unpacked = win32gui_struct.UnpackMENUITEMINFO(mii)
        text = unpacked[7] if len(unpacked) > 7 else ""
        return str(text or "").strip()
    except Exception:
        return ""


def _get_menu_item_text_ctypes(menu: int, index: int) -> str:
    if os.name != "nt":
        return ""
    try:
        get_menu_item_info = ctypes.windll.user32.GetMenuItemInfoW
    except Exception:
        return ""

    class MENUITEMINFOW(ctypes.Structure):
        _fields_ = [
            ("cbSize", ctypes.c_uint),
            ("fMask", ctypes.c_uint),
            ("fType", ctypes.c_uint),
            ("fState", ctypes.c_uint),
            ("wID", ctypes.c_uint),
            ("hSubMenu", ctypes.c_void_p),
            ("hbmpChecked", ctypes.c_void_p),
            ("hbmpUnchecked", ctypes.c_void_p),
            ("dwItemData", ctypes.c_void_p),
            ("dwTypeData", ctypes.c_wchar_p),
            ("cch", ctypes.c_uint),
            ("hbmpItem", ctypes.c_void_p),
        ]

    miim_string = getattr(win32con, "MIIM_STRING", 0x40)
    info = MENUITEMINFOW()
    info.cbSize = ctypes.sizeof(MENUITEMINFOW)
    info.fMask = miim_string
    info.dwTypeData = None
    info.cch = 0
    if not get_menu_item_info(menu, index, True, ctypes.byref(info)):
        return ""
    length = int(info.cch) + 1
    if length <= 1:
        return ""
    buf = ctypes.create_unicode_buffer(length)
    info.dwTypeData = ctypes.cast(buf, ctypes.c_wchar_p)
    info.cch = length
    if not get_menu_item_info(menu, index, True, ctypes.byref(info)):
        return ""
    return str(buf.value or "").strip()


def get_menu_item_text(menu: int, index: int) -> str:
    """Read a menu item label. GetMenuString is empty on many MFC menu bars."""
    if not menu or not win32gui:
        return ""
    for reader in (_get_menu_item_text_win32gui_struct, _get_menu_item_text_ctypes):
        text = reader(menu, index)
        if text:
            return text
    try:
        mf_byposition = getattr(win32con, "MF_BYPOSITION", 0x400)
        return str(win32gui.GetMenuString(menu, index, mf_byposition) or "").strip()
    except Exception:
        return ""


def menu_handles_for_window(hwnd: int) -> list[int]:
    """Return candidate HMENU handles for a HOT2000 frame window."""
    handles: list[int] = []
    seen: set[int] = set()
    candidates = [hwnd]
    if win32gui:
        try:
            parent = win32gui.GetParent(hwnd)
            if parent:
                candidates.append(parent)
        except Exception:
            pass
        try:
            ga_root = getattr(win32con, "GA_ROOT", 2)
            root = win32gui.GetAncestor(hwnd, ga_root)
            if root:
                candidates.append(root)
        except Exception:
            pass
    for candidate in candidates:
        try:
            menu = win32gui.GetMenu(candidate)
        except Exception:
            menu = 0
        if menu and menu not in seen:
            seen.add(menu)
            handles.append(menu)
    return handles


def menu_labels_match(actual: str, expected: str) -> bool:
    actual_n = normalize_menu_label(actual)
    expected_n = normalize_menu_label(expected)
    if not actual_n or not expected_n:
        return False
    if actual_n == expected_n:
        return True
    return expected_n in actual_n or actual_n in expected_n


def find_menu_item_by_label(menu: int, label: str) -> int | None:
    """Return menu item position for a visible label."""
    try:
        count = win32gui.GetMenuItemCount(menu)
    except Exception:
        return None
    for index in range(count):
        if menu_labels_match(get_menu_item_text(menu, index), label):
            return index
    return None


def list_menu_labels(menu: int) -> list[str]:
    labels: list[str] = []
    try:
        count = win32gui.GetMenuItemCount(menu)
    except Exception:
        return labels
    for index in range(count):
        labels.append(get_menu_item_text(menu, index))
    return labels


def _invoke_menu_path_on_handle(menu: int, hwnd: int, labels: tuple[str, ...] | list[str]) -> None:
    submenu = menu
    for depth, label in enumerate(labels):
        index = find_menu_item_by_label(submenu, label)
        if index is None:
            raise RuntimeError(
                f'HOT2000 menu item "{label}" not found. '
                f"Available: {list_menu_labels(submenu)!r}"
            )
        is_last = depth == len(labels) - 1
        if is_last:
            cmd_id = win32gui.GetMenuItemID(submenu, index)
            if cmd_id is None or cmd_id < 0:
                raise RuntimeError(f'HOT2000 menu item "{label}" has no command id.')
            post_wm_command(hwnd, cmd_id)
            return
        submenu = win32gui.GetSubMenu(submenu, index)
        if not submenu:
            raise RuntimeError(f'HOT2000 submenu for "{label}" was not found.')


def invoke_win32_menu_path(hwnd: int, labels: tuple[str, ...] | list[str]) -> None:
    """Open a nested HOT2000 menu path and fire the leaf WM_COMMAND."""
    if isinstance(labels, str) or not isinstance(labels, (tuple, list)):
        raise TypeError(
            f"invoke_win32_menu_path labels must be a sequence of strings, got {type(labels).__name__}."
        )
    hwnd = as_dialog_hwnd(hwnd)
    ensure_hot2000_visible(hwnd)
    menus = menu_handles_for_window(hwnd)
    if not menus:
        raise RuntimeError("HOT2000 menu bar was not found.")
    last_error: Exception | None = None
    for menu in menus:
        try:
            _invoke_menu_path_on_handle(menu, hwnd, labels)
            return
        except Exception as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise RuntimeError("HOT2000 menu bar was not found.")


def open_soc_full_house_report_pywinauto(main_hwnd: int) -> None:
    """Fallback menu navigation through pywinauto when Win32 menu text is unavailable."""
    try:
        from pywinauto import Application
    except ImportError:
        raise RuntimeError(
            "pywinauto is required for Full House Report menu fallback. Run: pip install pywinauto"
        )

    main_hwnd = as_dialog_hwnd(main_hwnd)
    app = Application(backend="win32").connect(handle=main_hwnd)
    win = app.window(handle=main_hwnd).wrapper_object()
    try:
        win.set_focus()
    except Exception:
        ensure_hot2000_visible(main_hwnd)
    menu_paths = (
        "Report->Full house report->House with standard operating conditions",
        "Report->Full House Report->House with standard operating conditions",
        "&Report->&Full house report->House with standard operating conditions",
    )
    last_error: Exception | None = None
    for path in menu_paths:
        try:
            win.menu_select(path)
            time.sleep(2)
            return
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"pywinauto could not open the Full House Report menu. {last_error}")


def click_dialog_button(dialog_hwnd: int | object, labels: tuple[str, ...] | str) -> bool:
    try:
        dialog_hwnd = as_dialog_hwnd(dialog_hwnd)
    except TypeError:
        return False
    if isinstance(labels, str):
        labels = (labels,)
    elif not isinstance(labels, (tuple, list)):
        return False
    for label in labels:
        btn = find_child_by_text_recursive(dialog_hwnd, label)
        if btn:
            win32_call("click_dialog_button", win32gui.SendMessage, btn, win32con.BM_CLICK, 0, 0)
            return True
        btn = find_child_button(dialog_hwnd, (label,))
        if btn:
            win32_call("click_dialog_button", win32gui.SendMessage, btn, win32con.BM_CLICK, 0, 0)
            return True
    return False


def normalize_caption(text: str) -> str:
    return (text or "").replace("&", "").strip().lower()


def find_child_button(dialog_hwnd: int, labels: tuple[str, ...]) -> int | None:
    wanted = {normalize_caption(label) for label in labels}
    found: int | None = None

    def callback(hwnd, _):
        nonlocal found
        if found is not None:
            return
        try:
            if normalize_caption(win32gui.GetWindowText(hwnd)) in wanted:
                found = hwnd
                return
            win32gui.EnumChildWindows(hwnd, callback, None)
        except Exception:
            pass

    win32gui.EnumChildWindows(dialog_hwnd, callback, None)
    return found


def dialog_visible_text(hwnd: int) -> str:
    parts: list[str] = []
    try:
        parts.append(win32gui.GetWindowText(hwnd) or "")
    except Exception:
        pass

    def callback(child, _):
        try:
            parts.append(win32gui.GetWindowText(child) or "")
            win32gui.EnumChildWindows(child, callback, None)
        except Exception:
            pass

    try:
        win32gui.EnumChildWindows(hwnd, callback, None)
    except Exception:
        pass
    return " ".join(parts)


def looks_like_overwrite_confirm(title: str, body: str = "") -> bool:
    """Match Windows Confirm Save As without requiring a live HWND."""
    title_l = (title or "").strip().lower()
    blob = f"{title_l} {body or ''}".lower()
    if title_l in ("save as", "save house file as", "progress"):
        return False
    if "confirm save as" in title_l:
        return True
    if "already exists" in blob and ("replace" in blob or "calculated.h2k" in blob):
        return True
    if any(word in title_l for word in ("replace", "overwrite")) and "already exists" in blob:
        return True
    return False


def is_overwrite_confirm_dialog(hwnd: int) -> bool:
    """True for Windows 'Confirm Save As' / replace-existing-file prompts."""
    try:
        if not win32gui.IsWindow(hwnd) or not win32gui.IsWindowVisible(hwnd):
            return False
        if win32gui.GetClassName(hwnd) != "#32770":
            return False
        title = win32gui.GetWindowText(hwnd) or ""
        return looks_like_overwrite_confirm(title, dialog_visible_text(hwnd))
    except Exception:
        return False


def enumerate_visible_dialogs() -> list[int]:
    """All visible top-level #32770 dialogs (Confirm Save As may not match HOT2000 PID)."""
    dialogs: list[int] = []
    for hwnd in enumerate_top_level_windows():
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            dialogs.append(hwnd)
        except Exception:
            pass
    return dialogs


def enumerate_all_dialog_hwnds() -> list[int]:
    """All visible #32770 surfaces, including nested and owned dialogs."""
    seen: set[int] = set()
    dialogs: list[int] = []
    gw_owner = getattr(win32con, "GW_OWNER", 4)

    def add(hwnd: int | None) -> None:
        if not hwnd or hwnd in seen:
            return
        try:
            if not win32gui.IsWindow(hwnd) or not win32gui.IsWindowVisible(hwnd):
                return
            if win32gui.GetClassName(hwnd) != "#32770":
                return
        except Exception:
            return
        seen.add(hwnd)
        dialogs.append(hwnd)

    def walk_children(parent: int) -> None:
        def child_cb(child: int, _) -> None:
            add(child)
            try:
                win32gui.EnumChildWindows(child, child_cb, None)
            except Exception:
                pass

        try:
            win32gui.EnumChildWindows(parent, child_cb, None)
        except Exception:
            pass

    for hwnd in enumerate_top_level_windows():
        add(hwnd)
        walk_children(hwnd)
        try:
            owner = win32gui.GetWindow(hwnd, gw_owner)
            add(owner)
            walk_children(owner)
        except Exception:
            pass

    for hwnd in enumerate_top_level_windows():
        try:
            if win32gui.GetWindow(hwnd, gw_owner):
                add(hwnd)
        except Exception:
            pass
    return dialogs


def enumerate_visible_window_titles() -> list[str]:
    titles: list[str] = []

    def callback(hwnd, _):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                return True
            title = (win32gui.GetWindowText(hwnd) or "").strip()
            if title:
                titles.append(f"{title!r} [{win32gui.GetClassName(hwnd)}]")
        except Exception:
            pass
        return True

    try:
        win32gui.EnumWindows(callback, None)
    except Exception:
        pass
    return titles


def candidate_dialog_hwnds(pid: int, save_dialog: int | None = None) -> list[int]:
    """Top-level, owned, child, and desktop-wide dialogs that may host Confirm Save As."""
    seen: set[int] = set()
    found: list[int] = []
    gw_owner = getattr(win32con, "GW_OWNER", 4)
    gw_popup = getattr(win32con, "GW_ENABLEDPOPUP", 6)

    def add(hwnd: int | None) -> None:
        if hwnd and hwnd not in seen:
            seen.add(hwnd)
            found.append(hwnd)

    for hwnd in enumerate_visible_dialogs():
        add(hwnd)

    for hwnd in windows_for_pid(pid):
        add(hwnd)

    if save_dialog:
        add(save_dialog)
        try:
            add(win32gui.GetWindow(save_dialog, gw_popup))
        except Exception:
            pass
        try:
            add(win32gui.GetLastActivePopup(save_dialog))
        except Exception:
            pass

        def child_cb(hwnd, _):
            try:
                if win32gui.GetClassName(hwnd) == "#32770":
                    add(hwnd)
                win32gui.EnumChildWindows(hwnd, child_cb, None)
            except Exception:
                pass

        try:
            win32gui.EnumChildWindows(save_dialog, child_cb, None)
        except Exception:
            pass

        for hwnd in enumerate_top_level_windows():
            try:
                if win32gui.GetWindow(hwnd, gw_owner) == save_dialog:
                    add(hwnd)
            except Exception:
                pass
    return found


def _overwrite_dialog_closed(dialog_hwnd: int) -> bool:
    try:
        return not win32gui.IsWindow(dialog_hwnd) or not win32gui.IsWindowVisible(dialog_hwnd)
    except Exception:
        return True


def force_overwrite_yes(dialog_hwnd: int) -> bool:
    """Force Yes on Confirm Save As. Do not send Enter — No is the default."""
    idyes = getattr(win32con, "IDYES", IDYES)

    try:
        win32gui.EndDialog(dialog_hwnd, idyes)
        if _overwrite_dialog_closed(dialog_hwnd):
            return True
    except Exception:
        pass

    try:
        btn = win32gui.GetDlgItem(dialog_hwnd, idyes)
        if btn:
            win32gui.SendMessage(dialog_hwnd, win32con.WM_COMMAND, idyes, btn)
            win32gui.SendMessage(btn, win32con.BM_CLICK, 0, 0)
            if _overwrite_dialog_closed(dialog_hwnd):
                return True
    except Exception:
        pass

    try:
        win32gui.SendMessage(dialog_hwnd, win32con.WM_COMMAND, idyes, 0)
        if _overwrite_dialog_closed(dialog_hwnd):
            return True
    except Exception:
        pass

    try:
        win32gui.PostMessage(dialog_hwnd, win32con.WM_COMMAND, idyes, 0)
    except Exception:
        pass

    btn = find_child_button(dialog_hwnd, YES_BUTTON_LABELS)
    if btn:
        try:
            win32gui.SendMessage(btn, win32con.BM_CLICK, 0, 0)
            if _overwrite_dialog_closed(dialog_hwnd):
                return True
        except Exception:
            pass
        try:
            win32gui.PostMessage(btn, win32con.BM_CLICK, 0, 0)
            if _overwrite_dialog_closed(dialog_hwnd):
                return True
        except Exception:
            pass

    if click_dialog_button(dialog_hwnd, YES_BUTTON_LABELS):
        return True

    # &Yes accelerator — never send VK_RETURN (No is the default button).
    try:
        win32gui.PostMessage(dialog_hwnd, win32con.WM_KEYDOWN, win32con.VK_MENU, 0)
        win32gui.PostMessage(dialog_hwnd, win32con.WM_KEYDOWN, ord("Y"), 0)
        win32gui.PostMessage(dialog_hwnd, win32con.WM_KEYUP, ord("Y"), 0)
        win32gui.PostMessage(dialog_hwnd, win32con.WM_KEYUP, win32con.VK_MENU, 0)
        if _overwrite_dialog_closed(dialog_hwnd):
            return True
    except Exception:
        pass

    return False


def confirm_overwrite_if_present(pid: int, save_dialog: int | None = None) -> bool:
    clicked = False
    for hwnd in candidate_dialog_hwnds(pid, save_dialog):
        if save_dialog is not None and hwnd == save_dialog:
            continue
        if not is_overwrite_confirm_dialog(hwnd):
            continue
        print("Confirm Save As: forcing Yes to overwrite calculated.h2k")
        if force_overwrite_yes(hwnd):
            clicked = True
    return clicked


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


def _deliver_calculate(main_hwnd: int) -> None:
    """Run Calculate on the HOT2000 UI thread (may block until calculation ends)."""
    allow_set_foreground_window()
    last_error: Exception | None = None
    for target in command_target_windows(main_hwnd):
        try:
            win32gui.SendMessage(target, win32con.WM_COMMAND, CMD_CALCULATE, 0)
            return
        except win32_errors() as exc:
            last_error = exc
    post_wm_command(main_hwnd, CMD_CALCULATE)


def start_calculate_async(main_hwnd: int) -> threading.Thread:
    """Start calculation in a background thread so the worker can poll Progress."""
    thread = threading.Thread(target=_deliver_calculate, args=(main_hwnd,), daemon=True)
    thread.start()
    return thread


def send_calculate(main_hwnd: int) -> threading.Thread:
    """Queue Calculate without blocking the poll loop (matches test_calculate_save_soc)."""
    ensure_hot2000_visible(main_hwnd)
    return start_calculate_async(main_hwnd)


def job_window_diagnostics(job_pids: int | set[int]) -> str:
    job_pids = normalize_job_pids(job_pids)
    lines = [f"Job PIDs: {sorted(job_pids)}"]
    seen: set[int] = set()
    for pid in sorted(job_pids):
        for hwnd in windows_for_pid(pid):
            if hwnd in seen:
                continue
            seen.add(hwnd)
            lines.append("  " + describe_window(hwnd))
    if not seen:
        lines.append("  (no windows for job PIDs)")
    return "\n".join(lines)


def wait_for_hot2000_progress(
    job_id: str,
    job_pids: int | set[int],
    job_dir: Path | None = None,
    main_hwnd: int | None = None,
    calc_thread: threading.Thread | None = None,
    timeout_s: int = 600,
) -> None:
    """Poll Progress/results while HOT2000 calculates (Calculate must not block this loop)."""
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")

    job_pids = normalize_job_pids(job_pids)
    if not job_pids:
        raise RuntimeError("HOT2000 job PIDs were not found.")

    start_deadline = time.time() + 90
    loop_start = time.time()
    progress_hwnd: int | None = None
    calculate_retries = 0
    while time.time() < start_deadline:
        for pid in job_pids:
            dismiss_blocking_dialogs(pid)
        for pid in job_pids:
            confirm_overwrite_if_present(pid)

        progress_hwnd = find_progress_window(job_pids)
        if progress_hwnd:
            break

        if calculation_results_visible(job_pids):
            for pid in job_pids:
                close_results_dialog(pid)
            return

        if calc_thread is not None and not calc_thread.is_alive() and not progress_hwnd:
            if calculation_results_visible(job_pids):
                for pid in job_pids:
                    close_results_dialog(pid)
                return
            time.sleep(1)
            if calculation_results_visible(job_pids):
                for pid in job_pids:
                    close_results_dialog(pid)
                return
            break

        blocked = find_calculation_blocking_error(job_pids)
        if blocked:
            raise RuntimeError(f"HOT2000 blocked calculation: {blocked}")

        elapsed = time.time() - loop_start
        if main_hwnd and calculate_retries < 2 and elapsed > 15 * (calculate_retries + 1):
            calculate_retries += 1
            calc_thread = send_calculate(main_hwnd)
            time.sleep(2)
            continue

        time.sleep(0.15)

    if not progress_hwnd:
        if calculation_results_visible(job_pids):
            for pid in job_pids:
                close_results_dialog(pid)
            return
        diag = job_window_diagnostics(job_pids)
        if main_hwnd:
            try:
                diag = (
                    f"Main HWND: {main_hwnd} "
                    f"class={win32gui.GetClassName(main_hwnd)!r} "
                    f"title={win32gui.GetWindowText(main_hwnd)!r}\n"
                    + diag
                )
            except Exception:
                pass
        if job_dir is not None:
            (job_dir / "calc-debug.txt").write_text(diag, encoding="utf-8")
        alive = calc_thread.is_alive() if calc_thread is not None else False
        raise RuntimeError(
            "HOT2000 Progress dialog did not appear. "
            f"Calculate thread still running: {alive}. "
            "Close Notepad or other windows with 'HOT2000' in the title. "
            "Check for a HOT2000 error popup on the worker PC. "
            f"Diagnostics:\n{diag}"
        )

    deadline = time.time() + timeout_s
    last_reported = -1
    results_closed = False
    while time.time() < deadline:
        if not results_closed:
            for pid in job_pids:
                if close_results_dialog(pid):
                    results_closed = True
                    time.sleep(0.5)
                    break

        progress_hwnd = find_progress_window(job_pids)
        if not progress_hwnd:
            for pid in job_pids:
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
                edit_hwnd = find_dialog_filename_edit(dialog_hwnd)
                if edit_hwnd and read_edit_text(edit_hwnd):
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
    # Never press Enter after Save: Confirm Save As defaults to No, so Enter cancels.
    del edit_hwnd
    if click_dialog_button(dialog_hwnd, ("&Save", "Save")):
        return
    try:
        ok = win32gui.GetDlgItem(dialog_hwnd, 1)
        if ok:
            win32_call("save_idok_click", win32gui.SendMessage, ok, win32con.BM_CLICK, 0, 0)
            return
    except Exception:
        pass
    win32_call("save_idok", win32gui.SendMessage, dialog_hwnd, win32con.WM_COMMAND, 1, 0)


def stdlibs_search_paths() -> list[Path]:
    paths = [
        HOT2000_HOME / "StdLibs" / STDLIBS_WINDOWCODES,
        Path(r"C:\HOT2000 v11.13b13\StdLibs") / STDLIBS_WINDOWCODES,
        Path(r"C:\HOT2000 v11.13\StdLibs") / STDLIBS_WINDOWCODES,
        Path(r"C:\Program Files (x86)\HOT2000\StdLibs") / STDLIBS_WINDOWCODES,
        Path(r"C:\Program Files\HOT2000\StdLibs") / STDLIBS_WINDOWCODES,
    ]
    seen: set[str] = set()
    unique: list[Path] = []
    for path in paths:
        key = str(path).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def find_existing_stdlibs_dir() -> Path | None:
    for path in stdlibs_search_paths():
        if path.is_file():
            return path.parent
    return None


def missing_stdlibs_message() -> str:
    checked = "\n".join(f"  - {path}" for path in stdlibs_search_paths())
    return (
        f"{STDLIBS_WINDOWCODES} was not found in HOT2000 StdLibs.\n"
        f"Checked:\n{checked}\n"
        "Fix on the worker PC:\n"
        "  1. Open HOT2000 Desktop manually → File → Preferences → Libraries\n"
        "     and point to the StdLibs folder beside your HOT2000.exe, or\n"
        "  2. Copy the full StdLibs folder from your HOT2000 install to\n"
        "     C:\\HOT2000 v11.13b13\\StdLibs\\ (create the folder if needed)."
    )


def verify_hot2000_install() -> None:
    if not HOT2000_EXE_PATH.is_file():
        checked = "\n".join(f"  - {path}" for path in hot2000_exe_candidates())
        raise SystemExit(
            "HOT2000.exe was not found.\n"
            f"Checked:\n{checked}\n"
            "Set HOT2000_EXE to your install path, for example:\n"
            '  $env:HOT2000_EXE = "C:\\HOT2000 v11.13b13\\HOT2000.exe"\n'
            '  $env:HOT2000_HOME = "C:\\HOT2000 v11.13b13"'
        )
    print(f"HOT2000 exe OK — {HOT2000_EXE}")
    if not HOT2000_HOME.is_dir():
        print(f"WARNING: HOT2000_HOME does not exist: {HOT2000_HOME}")
    stdlibs_dir = find_existing_stdlibs_dir()
    if stdlibs_dir:
        print(f"HOT2000 StdLibs OK — {stdlibs_dir}")
        return
    print(f"WARNING: {missing_stdlibs_message()}")


def dialog_static_texts(dialog_hwnd: int) -> list[str]:
    texts: list[str] = []

    def child_callback(child, _):
        try:
            text = win32gui.GetWindowText(child).strip()
            if text:
                texts.append(text)
        except Exception:
            pass

    win32gui.EnumChildWindows(dialog_hwnd, child_callback, None)
    return texts


def find_hot2000_startup_error(pid: int) -> str | None:
    """Return a user-facing error when HOT2000 shows a blocking startup dialog."""
    for hwnd in windows_for_pid(pid):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            title = win32gui.GetWindowText(hwnd)
            if title not in ("HOT2000", "Error", "Warning"):
                continue
            body = " ".join(dialog_static_texts(hwnd))
            if not body:
                continue
            body_l = body.lower()
            if "was not found" in body_l or "stdlibs" in body_l or "windowcodes" in body_l:
                return (
                    f"HOT2000 blocked startup: {body}\n\n{missing_stdlibs_message()}"
                )
        except Exception:
            pass
    return None


def dismiss_blocking_dialogs(pid: int) -> None:
    confirm_overwrite_if_present(pid)
    for hwnd in windows_for_pid(pid):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            if is_overwrite_confirm_dialog(hwnd):
                force_overwrite_yes(hwnd)
                continue
            title = win32gui.GetWindowText(hwnd).lower()
            if title in ("save as", "save house file as", "progress"):
                continue
            if any(word in title for word in ("save", "confirm", "overwrite", "replace", "yes", "warning")):
                click_dialog_button(hwnd, ("&Yes", "Yes", "OK", "&OK", "&Save", "Save"))
        except Exception:
            pass


def dismiss_exit_dialogs(pid: int) -> None:
    """Dismiss save-on-exit and other modals that block File > Exit."""
    for hwnd in windows_for_pid(pid):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            title = win32gui.GetWindowText(hwnd)
            title_l = title.lower()
            if title_l in ("save as", "save house file as", "progress"):
                continue
            body_l = " ".join(dialog_static_texts(hwnd)).lower()
            if "save" in body_l and any(
                word in body_l for word in ("change", "before closing", "before exit", "modified")
            ):
                # File already saved for the job — choose No on exit-save prompts.
                if click_dialog_button(hwnd, ("&No", "No", "N&o")):
                    continue
            if title_l in ("hot2000", "error", "warning", "confirm"):
                click_dialog_button(hwnd, ("OK", "&OK", "&No", "No", "&Yes", "Yes"))
        except Exception:
            pass


def close_hot2000_application(
    proc: subprocess.Popen,
    main_hwnd: int,
    hot2000_pid: int,
    timeout_s: int = 45,
) -> None:
    """Exit HOT2000 Desktop, dismissing blocking dialogs; force-kill if needed."""
    send_command(main_hwnd, CMD_EXIT)
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if proc.poll() is not None:
            return
        try:
            close_results_dialog(hot2000_pid)
        except Exception:
            pass
        dismiss_exit_dialogs(hot2000_pid)
        dismiss_blocking_dialogs(hot2000_pid)
        time.sleep(0.25)

    try:
        proc.terminate()
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except Exception:
            pass
        try:
            proc.wait(timeout=5)
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


def wait_for_save_dialog_close(save_dialog: int, pid: int, timeout_s: int = 45) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        confirm_overwrite_if_present(pid, save_dialog)
        if not win32gui.IsWindow(save_dialog):
            return
        if not win32gui.IsWindowVisible(save_dialog):
            return
        time.sleep(0.15)
    raise RuntimeError(
        "Save As dialog did not close. Confirm Save As may still be open; "
        "the worker could not click Yes to overwrite calculated.h2k."
    )


def adopt_calculated_candidate(candidate: Path, output_path: Path) -> None:
    """Use a saved H2K file as calculated.h2k."""
    if candidate.resolve() == output_path.resolve():
        return
    try:
        if output_path.exists():
            output_path.unlink()
        candidate.replace(output_path)
    except OSError:
        shutil.copy2(candidate, output_path)


def wait_for_calculated_output(
    output_path: Path,
    pid: int,
    job_dir: Path | None = None,
    timeout_s: int = 90,
) -> None:
    """Wait until calculated.h2k exists with fresh SOC, forcing overwrite Yes if needed."""
    before_mtime = output_path.stat().st_mtime if output_path.exists() else 0.0
    before_size = output_path.stat().st_size if output_path.exists() else 0
    deadline = time.time() + timeout_s

    while time.time() < deadline:
        confirm_overwrite_if_present(pid)

        if output_path.exists() and h2k_has_soc(output_path):
            return

        if output_path.exists():
            stat = output_path.stat()
            if (stat.st_mtime > before_mtime or stat.st_size != before_size) and h2k_has_soc(output_path):
                return

        for candidate in sorted(output_path.parent.glob("*.h2k")):
            if candidate.name.lower() == "input.h2k":
                continue
            if h2k_has_soc(candidate):
                adopt_calculated_candidate(candidate, output_path)
                return

        time.sleep(0.25)

    siblings = sorted(output_path.parent.glob("*.h2k"))
    hint = f" Files in job folder: {[p.name for p in siblings]}" if siblings else ""
    if job_dir is not None:
        debug_path = job_dir / "save-debug.txt"
        lines = [
            "Save As completed but calculated.h2k has no SOC results.",
            f"Target: {output_path}",
            hint,
            "",
            "Visible dialogs:",
        ]
        for hwnd in enumerate_visible_dialogs():
            try:
                lines.append(
                    f"  title={win32gui.GetWindowText(hwnd)!r} "
                    f"body={dialog_visible_text(hwnd)[:200]!r}"
                )
            except Exception:
                pass
        debug_path.write_text("\n".join(lines), encoding="utf-8")

    raise RuntimeError(
        "calculated.h2k was not saved with SOC results."
        f"{hint} Confirm Save As may still be open on the worker PC."
    )


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
    wait_for_save_dialog_close(save_dialog, pid)
    wait_for_calculated_output(output_path, pid, job_dir)


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


def wait_for_pdf_output(output_path: Path, timeout_s: int = 90) -> None:
    """Wait until HOT2000 writes a non-empty PDF from Print to PDF."""
    deadline = time.time() + timeout_s
    last_error: Exception | None = None
    while time.time() < deadline:
        if output_path.is_file():
            try:
                size = output_path.stat().st_size
                if size >= 128:
                    with output_path.open("rb") as handle:
                        if handle.read(5).startswith(b"%PDF"):
                            return
            except (PermissionError, OSError) as exc:
                last_error = exc
        time.sleep(0.25)
    detail = f" Last read error: {last_error}" if last_error else ""
    raise RuntimeError(f"Full House Report PDF was not saved.{detail}")


def open_soc_full_house_report(main_hwnd: int) -> None:
    """Report → Full house report → House with standard operating conditions."""
    main_hwnd = as_dialog_hwnd(main_hwnd)
    menu_variants = (
        ("Report", "Full house report", "House with standard operating conditions"),
        ("Report", "Full House Report", "House with standard operating conditions"),
        ("&Report", "Full house report", "House with standard operating conditions"),
    )
    last_error: Exception | None = None
    for labels in menu_variants:
        try:
            invoke_win32_menu_path(main_hwnd, labels)
            time.sleep(1)
            return
        except Exception as exc:
            last_error = exc
    try:
        open_soc_full_house_report_pywinauto(main_hwnd)
        time.sleep(1)
        return
    except Exception as exc:
        last_error = exc
    menus = menu_handles_for_window(main_hwnd)
    menu_debug = (
        f"Menu labels: {[list_menu_labels(menu) for menu in menus]!r}"
        if menus
        else "No HMENU handles found."
    )
    raise RuntimeError(
        "Could not open Report → Full house report → House with standard operating conditions. "
        f"{last_error} {menu_debug}"
    )


def is_valid_hwnd(hwnd: int | None) -> bool:
    try:
        return bool(hwnd) and bool(win32gui.IsWindow(hwnd))
    except Exception:
        return False


def focus_window(hwnd: int) -> None:
    """Bring a HOT2000/report window to the foreground for keyboard input."""
    hwnd = as_dialog_hwnd(hwnd)
    allow_set_foreground_window()
    ensure_hot2000_visible(hwnd)
    try:
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
    except Exception:
        pass
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass


def focus_modal_dialog(hwnd: int) -> None:
    """Focus a modal dialog without restoring or disturbing its owner window."""
    if not is_valid_hwnd(hwnd):
        return
    allow_set_foreground_window()
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass


def post_ctrl_p(hwnd: int) -> None:
    """Send Ctrl+P to a window without pywinauto keyboard hooks."""
    hwnd = as_dialog_hwnd(hwnd)
    focus_window(hwnd)
    try:
        win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_CONTROL, 0)
        win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, ord("P"), 0)
        win32gui.PostMessage(hwnd, win32con.WM_KEYUP, ord("P"), 0)
        win32gui.PostMessage(hwnd, win32con.WM_KEYUP, win32con.VK_CONTROL, 0)
    except Exception:
        win32gui.SendMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_CONTROL, 0)
        win32gui.SendMessage(hwnd, win32con.WM_KEYDOWN, ord("P"), 0)
        win32gui.SendMessage(hwnd, win32con.WM_KEYUP, ord("P"), 0)
        win32gui.SendMessage(hwnd, win32con.WM_KEYUP, win32con.VK_CONTROL, 0)


def focus_report_for_print(report_hwnd: int, main_hwnd: int) -> int:
    """Focus the report viewer when possible; otherwise fall back to HOT2000 main."""
    allow_set_foreground_window()
    for hwnd in (report_hwnd, main_hwnd):
        if not is_valid_hwnd(hwnd):
            continue
        try:
            win32gui.SetForegroundWindow(as_dialog_hwnd(hwnd))
            return as_dialog_hwnd(hwnd)
        except Exception:
            continue
    return as_dialog_hwnd(main_hwnd if is_valid_hwnd(main_hwnd) else report_hwnd)


def refresh_report_print_target(job_pids: int | set[int], main_hwnd: int) -> int:
    """Return a live HWND that can receive Print commands for the open report."""
    main_hwnd = as_dialog_hwnd(main_hwnd)
    report_hwnd = find_report_window(job_pids, main_hwnd)
    if report_hwnd and is_valid_hwnd(report_hwnd):
        return report_hwnd
    resolved = resolve_report_print_target(job_pids, main_hwnd)
    if is_valid_hwnd(resolved):
        return resolved
    return main_hwnd


def send_ctrl_p_to_window(hwnd: int) -> None:
    """Open Print using real keyboard input (required by HOT2000 report viewer)."""
    if is_valid_hwnd(hwnd):
        focus_modal_dialog(hwnd)
    time.sleep(0.5)
    try:
        from pywinauto.keyboard import send_keys

        send_keys("^p", pause=0.05)
        return
    except Exception:
        pass
    try:
        win32api.keybd_event(win32con.VK_CONTROL, 0, 0, 0)
        win32api.keybd_event(ord("P"), 0, 0, 0)
        win32api.keybd_event(ord("P"), 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(win32con.VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)
        return
    except Exception:
        pass
    post_ctrl_p(hwnd)


def is_hot2000_print_dialog(hwnd: int) -> bool:
    """True for the standard Windows Print dialog."""
    try:
        if not win32gui.IsWindowVisible(hwnd):
            return False
        if win32gui.GetClassName(hwnd) != "#32770":
            return False
        title = (win32gui.GetWindowText(hwnd) or "").strip().lower()
        if title not in ("print",) and not title.startswith("print "):
            return False
        if find_child_by_class_recursive(hwnd, "SHELLDLL_DefView"):
            return True
        if find_child_by_class_recursive(hwnd, "SysListView32"):
            return True
        if find_child_by_class_recursive(hwnd, "ListBox"):
            return True
        if find_child_button(hwnd, ("&Print", "Print")):
            return True
        return find_child_by_class_recursive(hwnd, "ComboBox")
    except Exception:
        return False


def find_visible_print_dialog() -> int | None:
    """Find the Windows Print dialog even when HOT2000 has already exited."""
    for hwnd in enumerate_all_dialog_hwnds():
        if is_hot2000_print_dialog(hwnd):
            return hwnd
    pywinauto_dialog = find_print_dialog_pywinauto()
    if pywinauto_dialog and is_hot2000_print_dialog(pywinauto_dialog):
        return pywinauto_dialog
    return None


def resolve_print_dialog_hwnd(dialog_hwnd: int | None) -> int | None:
    if dialog_hwnd and is_valid_hwnd(dialog_hwnd) and is_hot2000_print_dialog(dialog_hwnd):
        return dialog_hwnd
    return find_visible_print_dialog()


def find_print_dialog_pywinauto() -> int | None:
    """Find the Windows Print dialog by title using pywinauto."""
    try:
        from pywinauto import Desktop
    except ImportError:
        return None
    for backend in ("uia", "win32"):
        try:
            dialog = Desktop(backend=backend).window(title="Print", class_name="#32770")
            if dialog.exists(timeout=0.5):
                return int(dialog.handle)
        except Exception:
            continue
    return None


def find_hot2000_print_dialog(
    job_pids: int | set[int],
    owner_hwnd: int | None = None,
) -> int | None:
    """Find the standard Windows Print dialog (printer list + Print button)."""
    for hwnd in enumerate_visible_dialogs():
        if is_hot2000_print_dialog(hwnd):
            return hwnd
    pywinauto_dialog = find_print_dialog_pywinauto()
    if pywinauto_dialog and is_hot2000_print_dialog(pywinauto_dialog):
        return pywinauto_dialog
    gw_popup = getattr(win32con, "GW_ENABLEDPOPUP", 6)
    owners: list[int] = []
    if owner_hwnd and is_valid_hwnd(owner_hwnd):
        owners.append(as_dialog_hwnd(owner_hwnd))
    for pid in normalize_job_pids(job_pids):
        for hwnd in windows_for_pid(pid):
            if is_valid_hwnd(hwnd) and hwnd not in owners:
                owners.append(hwnd)
    for owner in owners:
        try:
            popup = win32gui.GetWindow(owner, gw_popup)
            if is_hot2000_print_dialog(popup):
                return popup
        except Exception:
            pass
    for pid in normalize_job_pids(job_pids):
        for hwnd in windows_for_pid(pid):
            if is_hot2000_print_dialog(hwnd):
                return hwnd
    return find_print_dialog_pywinauto()


def list_installed_printers() -> list[str]:
    """Return installed Windows printer names."""
    printers: list[str] = []
    if win32print:
        try:
            flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            for entry in win32print.EnumPrinters(flags):
                name = str(entry[2] or "").strip()
                if name:
                    printers.append(name)
        except Exception:
            pass
    if printers:
        return printers
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-Printer | Select-Object -ExpandProperty Name",
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        for line in (result.stdout or "").splitlines():
            cleaned = line.strip()
            if cleaned:
                printers.append(cleaned)
    except Exception:
        pass
    return printers


def find_installed_pdf_printer() -> str | None:
    for name in list_installed_printers():
        if printer_label_matches_pdf(name):
            return name
    return None


def get_windows_default_printer() -> str:
    if win32print:
        try:
            return str(win32print.GetDefaultPrinter() or "").strip()
        except Exception:
            pass
    return ""


def set_windows_default_printer(name: str) -> bool:
    target = str(name or "").strip()
    if not target:
        return False
    if win32print:
        try:
            win32print.SetDefaultPrinter(target)
            return get_windows_default_printer().lower() == target.lower()
        except Exception:
            pass
    try:
        subprocess.run(
            ["rundll32", "printui.dll,PrintUIEntry", "/y", "/n", target],
            timeout=20,
            check=False,
        )
        return get_windows_default_printer().lower() == target.lower()
    except Exception:
        return False


class _PdfDefaultPrinter:
    """Temporarily set Microsoft Print to PDF as the Windows default printer."""

    def __init__(self) -> None:
        self._previous = ""
        self.pdf_printer = ""

    def __enter__(self) -> str:
        self._previous = get_windows_default_printer()
        self.pdf_printer = find_installed_pdf_printer() or ""
        if self.pdf_printer:
            set_windows_default_printer(self.pdf_printer)
        return self.pdf_printer

    def __exit__(self, *_args) -> None:
        if self._previous and self.pdf_printer:
            set_windows_default_printer(self._previous)


def find_save_pdf_dialog_uia() -> int | None:
    try:
        from pywinauto import Desktop
    except ImportError:
        return None
    desktop = Desktop(backend="uia")
    for pattern in (
        {"title": "Save Print Output As"},
        {"title_re": r"Save Print Output As"},
        {"title": "Save As"},
        {"title_re": r"Save.*"},
    ):
        try:
            dialog = desktop.window(**pattern)
            if dialog.exists(timeout=0.5):
                return int(dialog.handle)
        except Exception:
            continue
    return None


def find_filename_save_dialog() -> int | None:
    """Find any visible Save dialog with a filename field (including print-to-PDF)."""
    uia_dialog = find_save_pdf_dialog_uia()
    if uia_dialog:
        return uia_dialog
    for hwnd in enumerate_all_dialog_hwnds():
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            title = (win32gui.GetWindowText(hwnd) or "").strip().lower()
            if title in ("print",) or title.startswith("print "):
                continue
            if not find_dialog_filename_edit(hwnd):
                continue
            body = dialog_visible_text(hwnd).lower()
            if (
                "save" in title
                or "file name" in body
                or "save as type" in body
                or "print output" in body
            ):
                return hwnd
        except Exception:
            continue
    return None


def find_save_pdf_dialog(job_pids: int | set[int]) -> int | None:
    """Find the Save Print Output As dialog without matching generic Save As."""
    uia_dialog = find_save_pdf_dialog_uia()
    if uia_dialog:
        return uia_dialog
    for hwnd in enumerate_all_dialog_hwnds():
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            title = (win32gui.GetWindowText(hwnd) or "").strip().lower()
            body = dialog_visible_text(hwnd).lower()
            if "save print output" in title or "print output as" in title:
                return hwnd
            if "print output" in title and "save" in title:
                return hwnd
            if "pdf" in title and "save" in title:
                return hwnd
            if title == "save as" and find_dialog_filename_edit(hwnd):
                if "print output" in body or ".pdf" in body or "file name" in body:
                    return hwnd
        except Exception:
            continue
    dialog = find_dialog_by_markers(job_pids, "save print output as", "save print output")
    if dialog:
        return dialog
    return find_filename_save_dialog()


def open_report_print_dialog(
    job_pids: int | set[int],
    report_hwnd: int,
    main_hwnd: int,
) -> bool:
    """Open the Windows Print dialog from the report viewer or HOT2000 main window."""
    report_hwnd = as_dialog_hwnd(report_hwnd)
    main_hwnd = as_dialog_hwnd(main_hwnd)
    if find_hot2000_print_dialog(job_pids):
        return True
    targets: list[int] = []
    for hwnd in (report_hwnd, main_hwnd):
        if is_valid_hwnd(hwnd) and hwnd not in targets:
            targets.append(hwnd)
    for hwnd in targets:
        focus_report_for_print(hwnd, main_hwnd)
        send_ctrl_p_to_window(hwnd)
        time.sleep(1.5)
        if find_hot2000_print_dialog(job_pids, owner_hwnd=hwnd):
            return True
    for hwnd in targets:
        for labels in (
            ("File", "Print"),
            ("&File", "&Print"),
            ("File", "&Print"),
        ):
            try:
                invoke_win32_menu_path(hwnd, labels)
                time.sleep(1.5)
                if find_hot2000_print_dialog(job_pids, owner_hwnd=hwnd):
                    return True
            except Exception:
                continue
    return bool(find_hot2000_print_dialog(job_pids))


def trigger_report_print(
    report_hwnd: int,
    job_pids: int | set[int] | None = None,
    main_hwnd: int | None = None,
) -> None:
    """Open the Windows Print dialog for the HOT2000 Full House Report viewer."""
    if job_pids is None:
        send_ctrl_p_to_window(report_hwnd)
        return
    open_report_print_dialog(
        job_pids,
        report_hwnd,
        main_hwnd if main_hwnd is not None else report_hwnd,
    )


SOC_DATA_SOURCE_LABELS = (
    "House with standard operating conditions",
    "House With Standard Operating Conditions",
    "House with Standard Operating Conditions",
    "standard operating conditions",
)

USE_DATA_FROM_DIALOG_MARKERS = ("use data from",)

PDF_PRINTER_LABELS = (
    "Microsoft Print to PDF",
    "Microsoft Print To PDF",
    "Print to PDF",
    "Microsoft Print to Pdf",
)

PRINT_DIALOG_MARKERS = ("print",)

SAVE_PDF_DIALOG_MARKERS = (
    "save print output as",
    "save print output",
    "save as",
)


def iter_combo_boxes(parent_hwnd: int):
    """Yield ComboBox and ComboBoxEx32 controls under a dialog."""
    seen: set[int] = set()
    parent_hwnd = as_dialog_hwnd(parent_hwnd)
    for combo_class in ("ComboBoxEx32", "ComboBox"):
        for combo_hwnd in find_child_by_class_recursive(parent_hwnd, combo_class):
            if combo_hwnd not in seen:
                seen.add(combo_hwnd)
                yield combo_hwnd


def iter_list_views(parent_hwnd: int):
    """Yield SysListView32 controls under a dialog (Windows Print dialog printer list)."""
    parent_hwnd = as_dialog_hwnd(parent_hwnd)
    seen: set[int] = set()
    for listview_hwnd in find_child_by_class_recursive(parent_hwnd, "SysListView32"):
        if listview_hwnd not in seen:
            seen.add(listview_hwnd)
            yield listview_hwnd


def iter_list_boxes(parent_hwnd: int):
    """Yield ListBox controls under a dialog (older Print dialog printer list)."""
    parent_hwnd = as_dialog_hwnd(parent_hwnd)
    seen: set[int] = set()
    for listbox_hwnd in find_child_by_class_recursive(parent_hwnd, "ListBox"):
        if listbox_hwnd not in seen:
            seen.add(listbox_hwnd)
            yield listbox_hwnd


class _LVITEMW(ctypes.Structure):
    _fields_ = [
        ("mask", ctypes.c_uint),
        ("iItem", ctypes.c_int),
        ("iSubItem", ctypes.c_int),
        ("state", ctypes.c_uint),
        ("stateMask", ctypes.c_uint),
        ("pszText", ctypes.c_void_p),
        ("cchTextMax", ctypes.c_int),
        ("iImage", ctypes.c_int),
        ("lParam", ctypes.c_void_p),
        ("iIndent", ctypes.c_int),
        ("iGroupId", ctypes.c_int),
        ("cColumns", ctypes.c_uint),
        ("puColumns", ctypes.c_void_p),
    ]


_LVM_GETITEMCOUNT = 0x1004
_LVM_GETITEMTEXTW = 0x1073
_LVM_GETNEXTITEM = 0x100C
_LVM_SETITEMSTATE = 0x102B
_LVM_ENSUREVISIBLE = 0x1013
_LVIF_TEXT = 0x0001
_LVIF_STATE = 0x0008
_LVNI_SELECTED = 0x0002
_LVIS_SELECTED = 0x0002
_LVIS_FOCUSED = 0x0001

_LB_GETCOUNT = 0x018B
_LB_GETTEXT = 0x0189
_LB_GETTEXTLEN = 0x018A
_LB_SETCURSEL = 0x0186
_LB_GETCURSEL = 0x0188


def get_listview_item_text(listview_hwnd: int, index: int) -> str:
    """Return one SysListView32 row label."""
    try:
        buf = ctypes.create_unicode_buffer(512)
        item = _LVITEMW()
        item.mask = _LVIF_TEXT
        item.iItem = index
        item.iSubItem = 0
        item.pszText = ctypes.addressof(buf)
        item.cchTextMax = len(buf)
        win32gui.SendMessage(
            listview_hwnd,
            _LVM_GETITEMTEXTW,
            index,
            ctypes.addressof(item),
        )
        return str(buf.value or "").strip()
    except Exception:
        return ""


def list_listview_items(listview_hwnd: int) -> list[str]:
    """Return visible SysListView32 row labels."""
    items: list[str] = []
    try:
        count = win32gui.SendMessage(listview_hwnd, _LVM_GETITEMCOUNT, 0, 0)
        for index in range(int(count)):
            text = get_listview_item_text(listview_hwnd, index)
            if text:
                items.append(text)
    except Exception:
        pass
    return items


def get_listview_selected_text(listview_hwnd: int) -> str:
    """Return the currently selected SysListView32 row label."""
    try:
        index = win32gui.SendMessage(
            listview_hwnd, _LVM_GETNEXTITEM, -1, _LVNI_SELECTED
        )
        if index < 0:
            return ""
        return get_listview_item_text(listview_hwnd, index)
    except Exception:
        return ""


def select_listview_index(listview_hwnd: int, index: int) -> bool:
    """Select and focus a SysListView32 row by index."""
    try:
        item = _LVITEMW()
        item.mask = _LVIF_STATE
        item.iItem = index
        item.stateMask = _LVIS_SELECTED | _LVIS_FOCUSED
        item.state = _LVIS_SELECTED | _LVIS_FOCUSED
        win32gui.SendMessage(
            listview_hwnd,
            _LVM_SETITEMSTATE,
            index,
            ctypes.addressof(item),
        )
        win32gui.SendMessage(listview_hwnd, _LVM_ENSUREVISIBLE, index, False)
        selected_index = win32gui.SendMessage(
            listview_hwnd, _LVM_GETNEXTITEM, -1, _LVNI_SELECTED
        )
        return selected_index == index
    except Exception:
        return False


def select_listview_text(listview_hwnd: int, text: str) -> bool:
    """Select a SysListView32 row by visible label."""
    target = normalize_menu_label(text)
    if not target:
        return False
    for index, item in enumerate(list_listview_items(listview_hwnd)):
        item_n = normalize_menu_label(item)
        if item_n == target or target in item_n or item_n in target:
            if select_listview_index(listview_hwnd, index):
                return True
    return False


def select_listview_any(listview_hwnd: int, labels: tuple[str, ...]) -> bool:
    for label in labels:
        if select_listview_text(listview_hwnd, label):
            return True
    return False


def list_listbox_items(listbox_hwnd: int) -> list[str]:
    """Return visible ListBox row labels."""
    items: list[str] = []
    try:
        count = win32gui.SendMessage(listbox_hwnd, _LB_GETCOUNT, 0, 0)
        for index in range(int(count)):
            length = win32gui.SendMessage(listbox_hwnd, _LB_GETTEXTLEN, index, 0)
            if length <= 0:
                continue
            buf = ctypes.create_unicode_buffer(int(length) + 1)
            win32gui.SendMessage(listbox_hwnd, _LB_GETTEXT, index, buf)
            text = str(buf.value or "").strip()
            if text:
                items.append(text)
    except Exception:
        pass
    return items


def get_listbox_selected_text(listbox_hwnd: int) -> str:
    try:
        index = win32gui.SendMessage(listbox_hwnd, _LB_GETCURSEL, 0, 0)
        if index < 0:
            return ""
        items = list_listbox_items(listbox_hwnd)
        if 0 <= index < len(items):
            return items[index]
    except Exception:
        pass
    return ""


def select_listbox_index(listbox_hwnd: int, index: int) -> bool:
    try:
        result = win32gui.SendMessage(listbox_hwnd, _LB_SETCURSEL, index, 0)
        return result != -1
    except Exception:
        return False


def select_listbox_text(listbox_hwnd: int, text: str) -> bool:
    target = normalize_menu_label(text)
    if not target:
        return False
    for index, item in enumerate(list_listbox_items(listbox_hwnd)):
        item_n = normalize_menu_label(item)
        if item_n == target or target in item_n or item_n in target:
            if select_listbox_index(listbox_hwnd, index):
                return True
    return False


def select_listbox_any(listbox_hwnd: int, labels: tuple[str, ...]) -> bool:
    for label in labels:
        if select_listbox_text(listbox_hwnd, label):
            return True
    return False


def printer_label_matches_pdf(label: str) -> bool:
    normalized = normalize_menu_label(label)
    return "print to pdf" in normalized or normalized.endswith(" pdf")


def list_print_dialog_printers(dialog_hwnd: int) -> list[str]:
    """Collect printer names from Print dialog list views and combo boxes."""
    dialog_hwnd = as_dialog_hwnd(dialog_hwnd)
    printers: list[str] = []
    seen: set[str] = set()
    for listview_hwnd in iter_list_views(dialog_hwnd):
        for item in list_listview_items(listview_hwnd):
            if item not in seen:
                seen.add(item)
                printers.append(item)
    for listbox_hwnd in iter_list_boxes(dialog_hwnd):
        for item in list_listbox_items(listbox_hwnd):
            if item not in seen:
                seen.add(item)
                printers.append(item)
    for combo_hwnd in iter_combo_boxes(dialog_hwnd):
        for item in list_combo_box_items(combo_hwnd):
            if item not in seen:
                seen.add(item)
                printers.append(item)
    pywinauto_printers = list_print_dialog_printers_pywinauto(dialog_hwnd)
    for item in pywinauto_printers:
        if item not in seen:
            seen.add(item)
            printers.append(item)
    return printers


def print_dialog_contains_pdf_printer(dialog_hwnd: int) -> bool:
    """True when the Print dialog visibly offers Microsoft Print to PDF."""
    dialog_hwnd = as_dialog_hwnd(dialog_hwnd)
    blob = normalize_menu_label(dialog_visible_text(dialog_hwnd))
    if "print to pdf" in blob:
        return True
    for name in list_print_dialog_printers(dialog_hwnd):
        if printer_label_matches_pdf(name):
            return True
    return False


def list_print_dialog_printers_pywinauto(dialog_hwnd: int) -> list[str]:
    try:
        from pywinauto import Desktop
    except ImportError:
        return []
    printers: list[str] = []
    try:
        dialog = Desktop(backend="win32").window(handle=dialog_hwnd)
        for ctrl in dialog.descendants():
            try:
                class_name = ctrl.class_name()
            except Exception:
                continue
            if class_name not in ("SysListView32", "ListBox"):
                continue
            try:
                texts = ctrl.item_texts()
            except Exception:
                texts = []
            for text in texts:
                cleaned = str(text or "").strip()
                if cleaned:
                    printers.append(cleaned)
    except Exception:
        pass
    return printers


def select_pdf_printer_pywinauto(dialog_hwnd: int) -> bool:
    try:
        from pywinauto import Desktop
    except ImportError:
        return False
    try:
        dialog = Desktop(backend="win32").window(handle=dialog_hwnd)
        dialog.set_focus()
        for ctrl in dialog.descendants():
            try:
                class_name = ctrl.class_name()
            except Exception:
                continue
            if class_name not in ("SysListView32", "ListBox"):
                continue
            try:
                texts = ctrl.item_texts()
            except Exception:
                texts = []
            for index, text in enumerate(texts):
                if printer_label_matches_pdf(str(text)):
                    try:
                        ctrl.select(index)
                    except Exception:
                        try:
                            ctrl.get_item(index).select()
                        except Exception:
                            continue
                    return True
    except Exception:
        return False
    return False


def print_dialog_debug(dialog_hwnd: int) -> str:
    """Describe Print dialog controls to diagnose printer enumeration."""
    if not is_valid_hwnd(dialog_hwnd):
        return f"Dialog hwnd={dialog_hwnd} is no longer valid."
    dialog_hwnd = as_dialog_hwnd(dialog_hwnd)
    lines = [f"Dialog: {describe_window(dialog_hwnd)}"]
    lines.append(f"Body: {dialog_visible_text(dialog_hwnd)[:240]!r}")
    lines.append(f"Printers: {list_print_dialog_printers(dialog_hwnd)!r}")
    for listview_hwnd in iter_list_views(dialog_hwnd):
        lines.append(
            f"  ListView {listview_hwnd}: {list_listview_items(listview_hwnd)!r}"
        )
    for listbox_hwnd in iter_list_boxes(dialog_hwnd):
        lines.append(
            f"  ListBox {listbox_hwnd}: {list_listbox_items(listbox_hwnd)!r}"
        )
    return "\n".join(lines)


def wait_for_save_pdf_dialog(
    job_pids: int | set[int],
    timeout_s: int = 20,
) -> int | None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        dialog = find_save_pdf_dialog(job_pids)
        if dialog:
            return dialog
        time.sleep(0.25)
    return None


def print_helper_32bit_path() -> Path:
    return Path(__file__).resolve().parent / "print_helper_32bit.py"


def report_print_helper_32bit_path() -> Path:
    return Path(__file__).resolve().parent / "report_print_helper_32bit.py"


def find_python32_executable() -> str | None:
    """Locate a 32-bit Python interpreter for HOT2000 UI automation."""
    configured = os.environ.get("HOT2000_PYTHON32", "").strip()
    if configured and Path(configured).is_file():
        return configured
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    candidates = [
        Path(r"C:\HOT2000Worker\python32\python.exe"),
        Path(local_app_data) / "Programs/Python/Python313-32/python.exe",
        Path(local_app_data) / "Programs/Python/Python312-32/python.exe",
        Path(local_app_data) / "Programs/Python/Python311-32/python.exe",
        Path(program_files_x86) / "Python313-32/python.exe",
        Path(program_files_x86) / "Python312-32/python.exe",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    try:
        result = subprocess.run(
            ["where.exe", "python"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        for line in (result.stdout or "").splitlines():
            path = line.strip()
            if path.lower().endswith("python.exe") and "32" in path.lower():
                return path
    except Exception:
        pass
    return None


def run_print_helper_32bit(output_path: Path) -> bool:
    """Run the legacy 32-bit helper when the Print dialog is already open."""
    python32 = find_python32_executable()
    helper = print_helper_32bit_path()
    if not python32 or not helper.is_file():
        return False
    try:
        result = subprocess.run(
            [python32, str(helper), str(output_path.resolve())],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if result.returncode == 0:
            return True
        if result.stderr:
            print(f"32-bit print helper failed: {result.stderr.strip()}")
    except Exception as exc:
        print(f"32-bit print helper error: {exc}")
    return pdf_output_ready(output_path)


def require_python32_for_report_print() -> str:
    """Return 32-bit Python path or raise with install instructions."""
    python32 = find_python32_executable()
    helper = report_print_helper_32bit_path()
    if python32 and helper.is_file():
        return python32
    raise RuntimeError(
        "Full House Report PDF printing requires 32-bit Python on the worker PC. "
        "The 64-bit worker cannot click HOT2000's Print dialog without crashing it. "
        "On the worker PC run:\n"
        "  cd C:\\HOT2000Worker\n"
        "  .\\install-python32.ps1\n"
        "  .\\start-worker.ps1\n"
        f"Python32 found: {python32!r}, helper: {helper}"
    )


def run_report_print_32bit(
    output_path: Path,
    report_hwnd: int,
    main_hwnd: int,
    job_dir: Path | None = None,
) -> None:
    """Print the open Full House Report using 32-bit Python only (Ctrl+P → PDF)."""
    python32 = require_python32_for_report_print()
    helper = report_print_helper_32bit_path()
    cmd = [
        python32,
        str(helper),
        str(output_path.resolve()),
        str(as_dialog_hwnd(report_hwnd)),
        str(as_dialog_hwnd(main_hwnd)),
    ]
    log_path = (job_dir / "print-helper-32bit.log") if job_dir else None
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=240,
            check=False,
        )
        if log_path is not None:
            log_path.write_text(
                f"command: {cmd!r}\n"
                f"returncode: {result.returncode}\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}\n",
                encoding="utf-8",
            )
        if result.returncode == 0 and pdf_output_ready(output_path):
            return
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(
            "32-bit HOT2000 print helper failed. "
            f"returncode={result.returncode}"
            + (f"\n{detail}" if detail else "")
            + (f"\nSee {log_path}" if log_path else "")
        )
    except subprocess.TimeoutExpired as exc:
        if log_path is not None:
            log_path.write_text(f"timeout after 240s\n{exc}", encoding="utf-8")
        if pdf_output_ready(output_path):
            return
        raise RuntimeError(
            "32-bit HOT2000 print helper timed out after 240s. "
            + (f"See {log_path}" if log_path else "")
        ) from exc


def automate_print_dialog_uia(
    output_path: Path,
    dialog_hwnd: int | None = None,
) -> bool:
    """Drive Print → Save Print Output As using UI Automation (single Print click)."""
    path_str = str(output_path.resolve())
    try:
        from pywinauto import Desktop
    except ImportError:
        return False
    try:
        desktop = Desktop(backend="uia")
        if dialog_hwnd and is_valid_hwnd(dialog_hwnd):
            print_dialog = desktop.window(handle=dialog_hwnd)
        else:
            print_dialog = desktop.window(title="Print")
        if not print_dialog.exists(timeout=2):
            return False
        print_dialog.set_focus()
        time.sleep(0.4)

        def invoke_print_button() -> None:
            for pattern in (
                {"title": "Print", "control_type": "Button"},
                {"title": "&Print", "control_type": "Button"},
            ):
                try:
                    print_dialog.child_window(**pattern).invoke()
                    return
                except Exception:
                    continue

        def wait_for_save_dialog(timeout_s: float = 45) -> object | None:
            deadline = time.time() + timeout_s
            while time.time() < deadline:
                for pattern in (
                    {"title": "Save Print Output As"},
                    {"title_re": r"Save Print Output As"},
                    {"title": "Save As"},
                ):
                    try:
                        candidate = desktop.window(**pattern)
                        if candidate.exists(timeout=0.5):
                            return candidate
                    except Exception:
                        continue
                if pdf_output_ready(output_path):
                    return "pdf"
                time.sleep(0.25)
            return None

        def complete_save_dialog(save_dialog: object) -> bool:
            if save_dialog == "pdf":
                return pdf_output_ready(output_path)
            save_dialog.set_focus()
            for edit in save_dialog.descendants(control_type="Edit"):
                try:
                    edit.set_value(path_str)
                    break
                except Exception:
                    continue
            for btn_pattern in (
                {"title": "Save", "control_type": "Button"},
                {"title": "&Save", "control_type": "Button"},
            ):
                try:
                    save_dialog.child_window(**btn_pattern).invoke()
                    break
                except Exception:
                    continue
            deadline = time.time() + 60
            while time.time() < deadline:
                if pdf_output_ready(output_path):
                    return True
                time.sleep(0.25)
            return False

        pdf_printer = find_installed_pdf_printer() or ""
        default_is_pdf = bool(
            pdf_printer
            and get_windows_default_printer().lower() == pdf_printer.lower()
        )
        if default_is_pdf:
            invoke_print_button()
            save_dialog = wait_for_save_dialog(timeout_s=45)
            if save_dialog:
                return complete_save_dialog(save_dialog)
            return False

        for item in print_dialog.descendants(control_type="ListItem"):
            try:
                text = item.window_text()
            except Exception:
                continue
            if "print to pdf" in str(text).lower():
                try:
                    item.select()
                except Exception:
                    try:
                        item.invoke()
                    except Exception:
                        continue
                break
        invoke_print_button()
        save_dialog = wait_for_save_dialog(timeout_s=45)
        if not save_dialog:
            return False
        return complete_save_dialog(save_dialog)
    except Exception:
        return False


def type_keyboard_text(text: str, delay_s: float = 0.05) -> None:
    """Type visible ASCII text using Win32 keyboard events."""
    for ch in text:
        try:
            if ch == " ":
                vk = win32con.VK_SPACE
            else:
                vk = ord(ch.upper())
            win32api.keybd_event(vk, 0, 0, 0)
            win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)
            time.sleep(delay_s)
        except Exception:
            pass


def focus_print_dialog_printer_list(dialog_hwnd: int) -> None:
    """Focus the printer FolderView/list inside the Windows Print dialog."""
    focus_modal_dialog(dialog_hwnd)
    time.sleep(0.25)
    for class_name in ("SHELLDLL_DefView", "SysListView32", "ListBox"):
        for hwnd in find_child_by_class_recursive(dialog_hwnd, class_name):
            try:
                win32gui.SetFocus(hwnd)
                left, top, right, bottom = win32gui.GetWindowRect(hwnd)
                x = (left + right) // 2
                y = (top + bottom) // 2
                win32api.SetCursorPos((x, y))
                time.sleep(0.1)
                win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
                win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
                return
            except Exception:
                continue


def click_pdf_printer_rows_mouse(dialog_hwnd: int) -> bool:
    """Click likely Microsoft Print to PDF rows in the printer FolderView."""
    for class_name in ("SHELLDLL_DefView", "SysListView32", "ListBox"):
        for hwnd in find_child_by_class_recursive(dialog_hwnd, class_name):
            try:
                left, top, right, bottom = win32gui.GetWindowRect(hwnd)
                height = max(bottom - top, 1)
                width = max(right - left, 1)
                x = left + width // 2
                for frac in (0.34, 0.44, 0.54, 0.24, 0.64):
                    y = top + int(height * frac)
                    win32api.SetCursorPos((x, y))
                    time.sleep(0.08)
                    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
                    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
                    time.sleep(0.12)
                return True
            except Exception:
                continue
    return False


def select_pdf_printer_via_keyboard(dialog_hwnd: int) -> None:
    """Use printer-list type-ahead to select Microsoft Print to PDF."""
    focus_print_dialog_printer_list(dialog_hwnd)
    time.sleep(0.35)
    type_keyboard_text("Microsoft", delay_s=0.06)
    time.sleep(0.25)
    type_keyboard_text(" Print to PDF", delay_s=0.05)
    time.sleep(0.35)


def activate_print_dialog_default_button(dialog_hwnd: int) -> bool:
    """Press Enter/Alt+P to activate the Print dialog default button."""
    if not is_valid_hwnd(dialog_hwnd):
        return False
    focus_modal_dialog(dialog_hwnd)
    time.sleep(0.2)
    try:
        win32api.keybd_event(win32con.VK_RETURN, 0, 0, 0)
        win32api.keybd_event(win32con.VK_RETURN, 0, win32con.KEYEVENTF_KEYUP, 0)
        return True
    except Exception:
        return False


def click_screen_point(x: int, y: int) -> bool:
    try:
        win32api.SetCursorPos((x, y))
        time.sleep(0.1)
        win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
        win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
        return True
    except Exception:
        return False


def click_print_dialog_button_mouse(dialog_hwnd: int) -> bool:
    """Physically click the Print button (works across 32/64-bit UI boundaries)."""
    if not is_valid_hwnd(dialog_hwnd):
        return False
    focus_modal_dialog(dialog_hwnd)
    button_hwnd = find_child_button(dialog_hwnd, ("&Print", "Print"))
    if not button_hwnd:
        try:
            button_hwnd = win32gui.GetDlgItem(dialog_hwnd, 1)
        except Exception:
            button_hwnd = None
    if button_hwnd and is_valid_hwnd(button_hwnd):
        try:
            left, top, right, bottom = win32gui.GetWindowRect(button_hwnd)
            if click_screen_point((left + right) // 2, (top + bottom) // 2):
                return True
        except Exception:
            pass
    try:
        left, top, right, bottom = win32gui.GetWindowRect(dialog_hwnd)
        for x_frac, y_frac in ((0.84, 0.92), (0.78, 0.90), (0.88, 0.94)):
            x = left + int((right - left) * x_frac)
            y = top + int((bottom - top) * y_frac)
            if click_screen_point(x, y):
                return True
    except Exception:
        pass
    return False


def send_print_dialog_keys(dialog_hwnd: int) -> None:
    """Select Microsoft Print to PDF and activate Print via keyboard."""
    select_pdf_printer_via_keyboard(dialog_hwnd)
    try:
        from pywinauto.keyboard import send_keys

        send_keys("%p", pause=0.05)
        return
    except Exception:
        pass
    try:
        win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
        win32api.keybd_event(ord("P"), 0, 0, 0)
        win32api.keybd_event(ord("P"), 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
    except Exception:
        pass


def click_print_dialog_idok(dialog_hwnd: int) -> bool:
    """Click the Print button via WM_COMMAND without disturbing child controls."""
    if not is_valid_hwnd(dialog_hwnd):
        return False
    focus_modal_dialog(dialog_hwnd)
    try:
        win32gui.SendMessage(dialog_hwnd, win32con.WM_COMMAND, 1, 0)
        return True
    except Exception:
        pass
    return click_print_dialog_button(dialog_hwnd)


def select_and_print_pdf_pywinauto(dialog_hwnd: int) -> bool:
    """Select Microsoft Print to PDF and click Print using pywinauto."""
    if not is_valid_hwnd(dialog_hwnd):
        return False
    for backend in ("uia", "win32"):
        try:
            from pywinauto import Desktop
        except ImportError:
            return False
        try:
            dialog = Desktop(backend=backend).window(handle=dialog_hwnd)
            dialog.set_focus()
            selected = False
            for pattern in (
                {"title_re": r".*Print to PDF.*", "control_type": "ListItem"},
                {"title_re": r".*Print to PDF.*"},
                {"best_match": "Microsoft Print to PDF"},
            ):
                try:
                    item = dialog.child_window(**pattern)
                    item.select()
                    selected = True
                    break
                except Exception:
                    continue
            if not selected:
                for ctrl in dialog.descendants():
                    try:
                        class_name = ctrl.class_name()
                    except Exception:
                        continue
                    if class_name not in ("SysListView32", "ListBox"):
                        continue
                    try:
                        texts = ctrl.item_texts()
                    except Exception:
                        texts = []
                    for index, text in enumerate(texts):
                        if printer_label_matches_pdf(str(text)):
                            try:
                                ctrl.select(index)
                            except Exception:
                                try:
                                    ctrl.get_item(index).select()
                                except Exception:
                                    continue
                            selected = True
                            break
                    if selected:
                        break
            for pattern in (
                {"title": "Print", "control_type": "Button"},
                {"title": "&Print", "control_type": "Button"},
                {"best_match": "Print"},
            ):
                try:
                    dialog.child_window(**pattern).click_input()
                    return True
                except Exception:
                    continue
        except Exception:
            continue
    return False


def wait_for_hot2000_print_dialog(
    job_pids: int | set[int],
    owner_hwnd: int | None = None,
    main_hwnd: int | None = None,
    timeout_s: int = 30,
) -> int | None:
    """Wait until the Windows Print dialog is visible."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        for owner in (owner_hwnd, main_hwnd):
            if owner and is_valid_hwnd(owner):
                dialog = find_hot2000_print_dialog(job_pids, owner_hwnd=owner)
                if dialog:
                    time.sleep(0.4)
                    return dialog
        dialog = find_hot2000_print_dialog(job_pids)
        if dialog:
            time.sleep(0.4)
            return dialog
        time.sleep(0.25)
    return None


def complete_orphan_print_to_pdf(
    print_dialog_hwnd: int | None,
    job_pids: int | set[int],
    output_path: Path,
    pdf_printer_name: str = "",
) -> bool:
    """Complete printing when HOT2000 exited but the Print dialog still exists."""
    if pdf_output_ready(output_path):
        return True
    if wait_for_save_pdf_dialog(job_pids, timeout_s=2):
        return True

    dialog_hwnd = resolve_print_dialog_hwnd(print_dialog_hwnd)
    if not dialog_hwnd:
        return False

    default_is_pdf = bool(
        pdf_printer_name
        and get_windows_default_printer().lower() == pdf_printer_name.lower()
    )

    if find_python32_executable():
        run_print_helper_32bit(output_path)
        if pdf_output_ready(output_path) or wait_for_save_pdf_dialog(job_pids, timeout_s=45):
            return True

    focus_modal_dialog(dialog_hwnd)
    time.sleep(0.3)
    if not wait_for_save_pdf_dialog(job_pids, timeout_s=1):
        if default_is_pdf:
            click_print_dialog_button_mouse(dialog_hwnd)
        else:
            select_pdf_printer_via_keyboard(dialog_hwnd)
            time.sleep(0.2)
            click_print_dialog_button_mouse(dialog_hwnd)

    if pdf_output_ready(output_path):
        return True
    return wait_for_save_pdf_dialog(job_pids, timeout_s=45) is not None


def try_complete_print_dialog(
    dialog_hwnd: int,
    job_pids: int | set[int],
    pdf_printer_name: str = "",
    output_path: Path | None = None,
    attempt: int = 1,
) -> bool:
    """Submit the Print dialog once per attempt; return True when save/PDF is ready."""
    if pdf_output_ready(output_path):
        return True
    if wait_for_save_pdf_dialog(job_pids, timeout_s=0):
        return True

    dialog_hwnd = resolve_print_dialog_hwnd(dialog_hwnd)
    if not dialog_hwnd:
        return False

    if not hot2000_process_running(job_pids):
        if output_path is not None:
            return complete_orphan_print_to_pdf(
                dialog_hwnd,
                job_pids,
                output_path,
                pdf_printer_name=pdf_printer_name,
            )
        return wait_for_save_pdf_dialog(job_pids, timeout_s=45) is not None

    default_is_pdf = bool(
        pdf_printer_name
        and get_windows_default_printer().lower() == pdf_printer_name.lower()
    )

    if attempt == 1:
        if find_python32_executable() and output_path:
            run_print_helper_32bit(output_path)
            return (
                pdf_output_ready(output_path)
                or wait_for_save_pdf_dialog(job_pids, timeout_s=45) is not None
            )
        focus_modal_dialog(dialog_hwnd)
        time.sleep(0.3)
        if click_print_dialog_button_mouse(dialog_hwnd):
            return (
                pdf_output_ready(output_path)
                or wait_for_save_pdf_dialog(job_pids, timeout_s=45) is not None
            )
        return False

    if attempt == 2:
        focus_modal_dialog(dialog_hwnd)
        time.sleep(0.3)
        if default_is_pdf:
            if click_print_dialog_button_mouse(dialog_hwnd):
                return wait_for_save_pdf_dialog(job_pids, timeout_s=45) is not None
            return False
        if select_and_print_pdf_pywinauto(dialog_hwnd):
            return wait_for_save_pdf_dialog(job_pids, timeout_s=45) is not None
        return False

    focus_modal_dialog(dialog_hwnd)
    time.sleep(0.3)
    if not default_is_pdf:
        select_pdf_printer_via_keyboard(dialog_hwnd)
        time.sleep(0.3)
    activate_print_dialog_default_button(dialog_hwnd)
    return wait_for_save_pdf_dialog(job_pids, timeout_s=45) is not None


def expand_combo_box(combo_hwnd: int) -> None:
    """Open a dropdown list so CB_GETLBTEXT can read all entries."""
    cb_showdropdown = getattr(win32con, "CB_SHOWDROPDOWN", 0x014F)
    try:
        win32gui.SendMessage(combo_hwnd, cb_showdropdown, True, 0)
        time.sleep(0.25)
    except Exception:
        pass


def get_combo_selection_text(combo_hwnd: int) -> str:
    cb_getcursel = getattr(win32con, "CB_GETCURSEL", 0x0147)
    cb_getlbtext = getattr(win32con, "CB_GETLBTEXT", 0x0148)
    cb_getlbtextlen = getattr(win32con, "CB_GETLBTEXTLEN", 0x0149)
    cb_err = getattr(win32con, "CB_ERR", -1)
    try:
        index = win32gui.SendMessage(combo_hwnd, cb_getcursel, 0, 0)
        if index == cb_err:
            return ""
        length = win32gui.SendMessage(combo_hwnd, cb_getlbtextlen, index, 0)
        if length <= 0:
            return ""
        buf = ctypes.create_unicode_buffer(int(length) + 1)
        win32gui.SendMessage(combo_hwnd, cb_getlbtext, index, buf)
        return str(buf.value or "").strip()
    except Exception:
        return ""


def is_soc_data_source_label(text: str) -> bool:
    """True only for SOC / standard operating conditions — not bare 'House'."""
    normalized = normalize_menu_label(text)
    if not normalized or normalized in {"house", "base house"}:
        return False
    return "standard operating" in normalized


def select_soc_data_source_combo(parent_hwnd: int) -> str:
    """Select House with standard operating conditions in Use Data From."""
    parent_hwnd = as_dialog_hwnd(parent_hwnd)
    cb_setcursel = getattr(win32con, "CB_SETCURSEL", 0x014E)
    cb_err = getattr(win32con, "CB_ERR", -1)
    for combo_hwnd in iter_combo_boxes(parent_hwnd):
        expand_combo_box(combo_hwnd)
        items = list_combo_box_items(combo_hwnd)
        best_index = -1
        best_label = ""
        for index, item in enumerate(items):
            if not is_soc_data_source_label(item):
                continue
            if len(item) > len(best_label):
                best_index = index
                best_label = item
        if best_index < 0:
            continue
        try:
            if win32gui.SendMessage(combo_hwnd, cb_setcursel, best_index, 0) == cb_err:
                continue
        except Exception:
            continue
        selected = get_combo_selection_text(combo_hwnd)
        if is_soc_data_source_label(selected):
            return selected
    return ""


def list_combo_box_items(combo_hwnd: int) -> list[str]:
    """Return visible ComboBox list entries."""
    cb_getcount = getattr(win32con, "CB_GETCOUNT", 0x0146)
    cb_getlbtext = getattr(win32con, "CB_GETLBTEXT", 0x0148)
    cb_getlbtextlen = getattr(win32con, "CB_GETLBTEXTLEN", 0x0149)
    items: list[str] = []
    try:
        count = win32gui.SendMessage(combo_hwnd, cb_getcount, 0, 0)
        for index in range(int(count)):
            length = win32gui.SendMessage(combo_hwnd, cb_getlbtextlen, index, 0)
            if length <= 0:
                continue
            buf = ctypes.create_unicode_buffer(int(length) + 1)
            win32gui.SendMessage(combo_hwnd, cb_getlbtext, index, buf)
            text = str(buf.value or "").strip()
            if text:
                items.append(text)
    except Exception:
        pass
    return items


def select_combo_box_text(parent_hwnd: int, text: str) -> bool:
    """Select a ComboBox entry by visible text."""
    parent_hwnd = as_dialog_hwnd(parent_hwnd)
    cb_selectstring = getattr(win32con, "CB_SELECTSTRING", 0x014D)
    cb_setcursel = getattr(win32con, "CB_SETCURSEL", 0x014E)
    cb_err = getattr(win32con, "CB_ERR", -1)
    for combo_hwnd in iter_combo_boxes(parent_hwnd):
        expand_combo_box(combo_hwnd)
        try:
            idx = win32gui.SendMessage(combo_hwnd, cb_selectstring, -1, text)
            if idx != cb_err:
                return True
            for index, item in enumerate(list_combo_box_items(combo_hwnd)):
                item_n = normalize_menu_label(item)
                text_n = normalize_menu_label(text)
                if item_n == text_n or text_n in item_n:
                    if win32gui.SendMessage(combo_hwnd, cb_setcursel, index, 0) != cb_err:
                        return True
        except Exception:
            continue
    return False


def select_combo_box_any(parent_hwnd: int, labels: tuple[str, ...]) -> bool:
    for label in labels:
        if select_combo_box_text(parent_hwnd, label):
            return True
    return False


def find_dialog_by_markers(
    job_pids: int | set[int],
    *markers: str,
    class_name: str = "#32770",
) -> int | None:
    """Find a visible dialog whose title or body contains any marker text."""
    needles = [marker.lower() for marker in markers if marker]
    if not needles:
        return None

    def matches(hwnd: int) -> bool:
        try:
            if not win32gui.IsWindowVisible(hwnd):
                return False
            if class_name and win32gui.GetClassName(hwnd) != class_name:
                return False
            title = (win32gui.GetWindowText(hwnd) or "").lower()
            body = dialog_visible_text(hwnd).lower()
            blob = f"{title} {body}"
            return any(needle in blob for needle in needles)
        except Exception:
            return False

    seen: set[int] = set()
    for pid in normalize_job_pids(job_pids):
        for hwnd in windows_for_pid(pid):
            if hwnd in seen:
                continue
            seen.add(hwnd)
            if matches(hwnd):
                return hwnd
    for hwnd in enumerate_visible_dialogs():
        if hwnd in seen:
            continue
        if matches(hwnd):
            return hwnd
    return None


def wait_for_dialog_by_markers(
    job_pids: int | set[int],
    markers: tuple[str, ...],
    timeout_s: int = 45,
) -> int | None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        dialog = find_dialog_by_markers(job_pids, *markers)
        if dialog:
            return dialog
        time.sleep(0.25)
    return None


def wait_for_use_data_from_dialog(job_pids: int | set[int], timeout_s: int = 30) -> int | None:
    return wait_for_dialog_by_markers(job_pids, USE_DATA_FROM_DIALOG_MARKERS, timeout_s=timeout_s)


def select_pdf_printer(dialog_hwnd: int) -> bool:
    """Select Microsoft Print to PDF in the Windows Print dialog."""
    dialog_hwnd = as_dialog_hwnd(dialog_hwnd)
    if not is_valid_hwnd(dialog_hwnd) or not win32gui.IsWindowVisible(dialog_hwnd):
        return False
    focus_modal_dialog(dialog_hwnd)
    time.sleep(0.35)
    if print_dialog_contains_pdf_printer(dialog_hwnd):
        for listview_hwnd in iter_list_views(dialog_hwnd):
            selected = get_listview_selected_text(listview_hwnd)
            if selected and printer_label_matches_pdf(selected):
                return True
        for listbox_hwnd in iter_list_boxes(dialog_hwnd):
            selected = get_listbox_selected_text(listbox_hwnd)
            if selected and printer_label_matches_pdf(selected):
                return True
    for listview_hwnd in iter_list_views(dialog_hwnd):
        if select_listview_any(listview_hwnd, PDF_PRINTER_LABELS):
            return True
        for item in list_listview_items(listview_hwnd):
            if printer_label_matches_pdf(item):
                if select_listview_text(listview_hwnd, item):
                    return True
    for listbox_hwnd in iter_list_boxes(dialog_hwnd):
        if select_listbox_any(listbox_hwnd, PDF_PRINTER_LABELS):
            return True
        for item in list_listbox_items(listbox_hwnd):
            if printer_label_matches_pdf(item):
                if select_listbox_text(listbox_hwnd, item):
                    return True
    for combo_hwnd in iter_combo_boxes(dialog_hwnd):
        for item in list_combo_box_items(combo_hwnd):
            if printer_label_matches_pdf(item):
                if select_combo_box_text(dialog_hwnd, item):
                    return True
    if select_pdf_printer_pywinauto(dialog_hwnd):
        return True
    blob = normalize_menu_label(dialog_visible_text(dialog_hwnd))
    if "print to pdf" in blob:
        return True
    for listview_hwnd in iter_list_views(dialog_hwnd):
        selected = get_listview_selected_text(listview_hwnd)
        if selected and printer_label_matches_pdf(selected):
            return True
    for listbox_hwnd in iter_list_boxes(dialog_hwnd):
        selected = get_listbox_selected_text(listbox_hwnd)
        if selected and printer_label_matches_pdf(selected):
            return True
    return False


def submit_print_dialog_to_pdf(
    job_id: str,
    job_pids: int | set[int],
    report_hwnd: int,
    main_hwnd: int,
    output_path: Path,
    job_dir: Path | None = None,
    pdf_printer_name: str = "",
) -> None:
    """Select Microsoft Print to PDF and click Print."""
    main_hwnd = as_dialog_hwnd(main_hwnd)
    last_diag = ""
    installed_printers = list_installed_printers()
    last_printers: list[str] = installed_printers[:]
    default_printer = get_windows_default_printer()
    print_dialog_hwnd: int | None = None
    for attempt in range(1, 4):
        if wait_for_save_pdf_dialog(job_pids, timeout_s=0):
            return
        if not hot2000_process_running(job_pids):
            orphan = resolve_print_dialog_hwnd(print_dialog_hwnd)
            if orphan and output_path and complete_orphan_print_to_pdf(
                orphan,
                job_pids,
                output_path,
                pdf_printer_name=pdf_printer_name,
            ):
                if pdf_output_ready(output_path):
                    return
                if wait_for_save_pdf_dialog(job_pids, timeout_s=3):
                    return
            if not resolve_print_dialog_hwnd(print_dialog_hwnd):
                raise RuntimeError(
                    "HOT2000 Desktop closed while printing and the Print dialog is gone. "
                    f"Python32: {find_python32_executable()!r}. "
                    "Run install-python32.ps1 on the worker PC, then set HOT2000_PYTHON32."
                )
        report_hwnd = refresh_report_print_target(job_pids, main_hwnd)
        print_dialog_hwnd = wait_for_hot2000_print_dialog(
            job_pids,
            owner_hwnd=report_hwnd,
            main_hwnd=main_hwnd,
            timeout_s=12,
        )
        if not print_dialog_hwnd:
            open_report_print_dialog(job_pids, report_hwnd, main_hwnd)
            print_dialog_hwnd = wait_for_hot2000_print_dialog(
                job_pids,
                owner_hwnd=report_hwnd,
                main_hwnd=main_hwnd,
                timeout_s=12,
            )
        if not print_dialog_hwnd:
            progress(
                job_id,
                "printing",
                f"Waiting for Print dialog… ({attempt}/3)",
            )
            time.sleep(0.75)
            continue
        last_diag = print_dialog_debug(print_dialog_hwnd)
        if job_dir is not None and attempt == 1:
            (job_dir / "print-dialog-before.txt").write_text(
                last_diag + f"\nInstalled printers: {installed_printers!r}\n"
                f"Default printer: {default_printer!r}\n"
                f"Target PDF printer: {pdf_printer_name!r}",
                encoding="utf-8",
            )
        if try_complete_print_dialog(
            print_dialog_hwnd,
            job_pids,
            pdf_printer_name=pdf_printer_name,
            output_path=output_path,
            attempt=attempt,
        ):
            if pdf_output_ready(output_path):
                return
            if wait_for_save_pdf_dialog(job_pids, timeout_s=3):
                return
        if not hot2000_process_running(job_pids):
            orphan = resolve_print_dialog_hwnd(print_dialog_hwnd)
            if orphan and output_path and complete_orphan_print_to_pdf(
                orphan,
                job_pids,
                output_path,
                pdf_printer_name=pdf_printer_name,
            ):
                if pdf_output_ready(output_path):
                    return
                if wait_for_save_pdf_dialog(job_pids, timeout_s=3):
                    return
            raise RuntimeError(
                "HOT2000 Desktop closed while the Print dialog was still open. "
                "Install 32-bit Python: run install-python32.ps1, set HOT2000_PYTHON32, "
                f"then restart the worker. Python32: {find_python32_executable()!r}"
            )
        progress(
            job_id,
            "printing",
            f"Retrying Print dialog… ({attempt}/3)",
        )
        if not find_hot2000_print_dialog(job_pids) and hot2000_process_running(job_pids):
            open_report_print_dialog(job_pids, report_hwnd, main_hwnd)
            time.sleep(1.0)
        time.sleep(0.75)
    if wait_for_save_pdf_dialog(job_pids, timeout_s=3):
        return
    if job_dir is not None and last_diag:
        debug_lines = [
            last_diag,
            f"Python32: {find_python32_executable()!r}",
            "Visible window titles:",
            *enumerate_visible_window_titles()[:50],
            "All #32770 dialogs:",
        ]
        for hwnd in enumerate_all_dialog_hwnds():
            try:
                debug_lines.append(
                    f"  {describe_window(hwnd)} body={dialog_visible_text(hwnd)[:120]!r}"
                )
            except Exception:
                pass
        (job_dir / "print-debug.txt").write_text("\n".join(debug_lines), encoding="utf-8")
    raise RuntimeError(
        "Could not print the Full House Report to PDF. "
        "The Print dialog opened, but Save Print Output As never appeared. "
        f"Installed printers: {last_printers!r}. "
        f"Default printer: {default_printer!r}. "
        f"Target PDF printer: {pdf_printer_name!r}"
        + (f"\nDiagnostics:\n{last_diag}" if last_diag else "")
        + f"\nPython32: {find_python32_executable()!r}"
        + "\nTip: set HOT2000_PYTHON32 to 32-bit python.exe, or install 32-bit Python for HOT2000."
    )


def click_print_dialog_button(dialog_hwnd: int) -> bool:
    if click_dialog_button(dialog_hwnd, ("&Print", "Print", "OK", "&OK")):
        return True
    try:
        print_id = win32gui.GetDlgItem(dialog_hwnd, 1)
        if print_id:
            win32gui.SendMessage(print_id, win32con.BM_CLICK, 0, 0)
            return True
    except Exception:
        pass
    return False


def save_print_output_dialog_pywinauto(save_dialog: int, output_path: Path) -> bool:
    """Fill File name and click Save in Save Print Output As via pywinauto."""
    path_str = str(output_path.resolve())
    try:
        from pywinauto import Desktop
    except ImportError:
        return False
    for backend in ("uia", "win32"):
        try:
            dialog = Desktop(backend=backend).window(handle=save_dialog)
            dialog.set_focus()
            for pattern in (
                {"title_re": r"File name:.*", "control_type": "Edit"},
                {"title_re": r".*File name.*", "control_type": "Edit"},
                {"class_name": "Edit", "found_index": 0},
            ):
                try:
                    dialog.child_window(**pattern).set_edit_text(path_str)
                    break
                except Exception:
                    continue
            for pattern in (
                {"title": "Save", "control_type": "Button"},
                {"title": "&Save", "control_type": "Button"},
                {"best_match": "Save"},
            ):
                try:
                    dialog.child_window(**pattern).click_input()
                    return True
                except Exception:
                    continue
        except Exception:
            continue
    return False


def save_print_output_dialog(
    job_pids: int | set[int],
    save_dialog: int,
    output_path: Path,
) -> None:
    path_str = str(output_path.resolve())
    set_dialog_filename(save_dialog, path_str)
    if save_print_output_dialog_pywinauto(save_dialog, output_path):
        pass
    else:
        activate_save_dialog(save_dialog, None)
    primary_pid = next(iter(normalize_job_pids(job_pids)), None)
    if primary_pid:
        confirm_overwrite_if_present(primary_pid, save_dialog)
    deadline = time.time() + 45
    while time.time() < deadline:
        if primary_pid:
            confirm_overwrite_if_present(primary_pid, save_dialog)
        if not win32gui.IsWindow(save_dialog) or not win32gui.IsWindowVisible(save_dialog):
            return
        time.sleep(0.25)
    raise RuntimeError("Save Print Output As dialog did not close after Save.")


def report_print_debug(
    job_pids: int | set[int],
    report_hwnd: int | None = None,
    main_hwnd: int | None = None,
) -> str:
    lines: list[str] = []
    if report_hwnd and is_valid_hwnd(report_hwnd):
        lines.append(f"Report HWND: {describe_window(report_hwnd)}")
    elif main_hwnd and is_valid_hwnd(main_hwnd):
        lines.append(f"Main HWND: {describe_window(main_hwnd)}")
    else:
        lines.append("Report/main HWND is no longer valid.")
    print_dialog = find_hot2000_print_dialog(job_pids)
    if print_dialog:
        lines.append(f"Print dialog: {describe_window(print_dialog)}")
    save_dialog = find_save_pdf_dialog(job_pids)
    if save_dialog:
        lines.append(f"Save dialog: {describe_window(save_dialog)}")
    lines.append("Visible dialogs:")
    seen: set[int] = set()
    for hwnd in enumerate_all_dialog_hwnds():
        if hwnd in seen:
            continue
        seen.add(hwnd)
        try:
            lines.append(
                f"  {describe_window(hwnd)} body={dialog_visible_text(hwnd)[:120]!r}"
            )
        except Exception:
            pass
    lines.append("Visible window titles:")
    lines.extend(f"  {title}" for title in enumerate_visible_window_titles()[:50])
    return "\n".join(lines)


def confirm_full_house_report_data_source(job_pids: int | set[int], timeout_s: int = 45) -> None:
    """Handle HOT2000 'Use Data From' before the Full House Report viewer opens."""
    dialog = wait_for_use_data_from_dialog(job_pids, timeout_s=timeout_s)
    if not dialog:
        return

    click_dialog_button(dialog, ("Base House", "&Base House"))
    selected = select_soc_data_source_combo(dialog)
    if not selected:
        combo_items: list[str] = []
        for combo_hwnd in iter_combo_boxes(dialog):
            expand_combo_box(combo_hwnd)
            combo_items.extend(list_combo_box_items(combo_hwnd))
        raise RuntimeError(
            "Could not select House with standard operating conditions in the "
            f"'Use Data From' dialog. Combo items: {combo_items!r}"
        )

    if not click_dialog_button(dialog, ("OK", "&OK")):
        raise RuntimeError("Could not click OK on the HOT2000 'Use Data From' dialog.")

    deadline = time.time() + 15
    while time.time() < deadline:
        if not win32gui.IsWindow(dialog) or not win32gui.IsWindowVisible(dialog):
            return
        time.sleep(0.2)
    raise RuntimeError("HOT2000 'Use Data From' dialog did not close after OK.")


def hot2000_window_surfaces(job_pids: int | set[int], main_hwnd: int) -> list[int]:
    """Top-level and nested HOT2000 surfaces (MDI report views are often child windows)."""
    main_hwnd = as_dialog_hwnd(main_hwnd)
    seen: set[int] = set()
    surfaces: list[int] = []

    def add(hwnd: int | None) -> None:
        if hwnd and hwnd not in seen:
            seen.add(hwnd)
            surfaces.append(hwnd)

    add(main_hwnd)
    for pid in normalize_job_pids(job_pids):
        for hwnd in windows_for_pid(pid):
            add(hwnd)

    def walk(parent: int) -> None:
        def callback(child: int, _) -> None:
            add(child)
            try:
                win32gui.EnumChildWindows(child, callback, None)
            except Exception:
                pass

        try:
            win32gui.EnumChildWindows(parent, callback, None)
        except Exception:
            pass

    walk(main_hwnd)
    for mdi_client in find_child_by_class_recursive(main_hwnd, "MDIClient"):
        walk(mdi_client)
    return surfaces


def has_mdi_client_ancestor(hwnd: int, main_hwnd: int) -> bool:
    """True when hwnd lives under HOT2000's MDIClient (typical report viewer host)."""
    try:
        current = hwnd
        while current and current != main_hwnd:
            parent = win32gui.GetParent(current)
            if not parent:
                break
            if win32gui.GetClassName(parent) == "MDIClient":
                return True
            current = parent
    except Exception:
        pass
    return False


def score_report_window(hwnd: int, main_hwnd: int) -> int:
    """Score a window for likelihood of hosting the Full House Report viewer."""
    try:
        if not win32gui.IsWindow(hwnd) or not win32gui.IsWindowVisible(hwnd):
            return 0
        if win32gui.GetClassName(hwnd) == "#32770":
            return 0
        title = (win32gui.GetWindowText(hwnd) or "").strip()
        title_l = title.lower()
        area = window_area(hwnd)
        cls = win32gui.GetClassName(hwnd)
        in_mdi = has_mdi_client_ancestor(hwnd, main_hwnd)

        score = 0
        if hwnd == main_hwnd:
            score += 25
        if in_mdi and cls.startswith("Afx:"):
            score += 55
            if (not title or title == "HOT2000") and area >= 60_000:
                score += 40
        if title and title != "HOT2000":
            score += 10
        if "full house" in title_l:
            score += 100
        if "report" in title_l:
            score += 80
        if "standard operating" in title_l or "operating conditions" in title_l:
            score += 140
        elif " soc" in title_l or title_l.endswith("soc"):
            score += 100
        elif "house" in title_l:
            score += 25
        if cls.startswith("Afx:"):
            score += 35
        if area >= 250_000:
            score += 45
        elif area >= 120_000:
            score += 30
        elif area >= 60_000:
            score += 15
        elif area < 8_000 and hwnd != main_hwnd:
            score -= 40
        if title_l in {"house", "house report"} and "standard operating" not in title_l:
            score -= 70
        return score
    except Exception:
        return 0


def find_report_window(job_pids: int | set[int], main_hwnd: int) -> int | None:
    """Find the HOT2000 Full House Report viewer window."""
    main_hwnd = as_dialog_hwnd(main_hwnd)
    candidates: list[tuple[int, int]] = []
    for hwnd in hot2000_window_surfaces(job_pids, main_hwnd):
        score = score_report_window(hwnd, main_hwnd)
        if score > 0:
            candidates.append((score, hwnd))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    best_score, best_hwnd = candidates[0]
    return best_hwnd if best_score >= 40 else None


def report_window_debug(job_pids: int | set[int], main_hwnd: int) -> str:
    """List scored HOT2000 surfaces to diagnose report detection."""
    main_hwnd = as_dialog_hwnd(main_hwnd)
    ranked: list[tuple[int, int]] = []
    for hwnd in hot2000_window_surfaces(job_pids, main_hwnd):
        ranked.append((score_report_window(hwnd, main_hwnd), hwnd))
    ranked.sort(reverse=True)
    lines = [f"Main HWND: {describe_window(main_hwnd)}"]
    for score, hwnd in ranked[:20]:
        lines.append(f"  score={score} {describe_window(hwnd)}")
    if not ranked:
        lines.append("  (no HOT2000 surfaces found)")
    return "\n".join(lines)


def resolve_report_print_target(job_pids: int | set[int], main_hwnd: int) -> int:
    """Return the best HWND to receive Ctrl+P for the open Full House Report."""
    main_hwnd = as_dialog_hwnd(main_hwnd)
    report_hwnd = find_report_window(job_pids, main_hwnd)
    if report_hwnd:
        return report_hwnd
    try:
        popup = win32gui.GetLastActivePopup(main_hwnd)
        if popup and popup != main_hwnd and win32gui.IsWindowVisible(popup):
            if score_report_window(popup, main_hwnd) >= 40:
                return popup
    except Exception:
        pass
    return main_hwnd


def wait_for_report_print_target(
    job_id: str,
    job_pids: int | set[int],
    main_hwnd: int,
    job_dir: Path | None = None,
    timeout_s: int = 120,
) -> int:
    """Wait until HOT2000 shows the Full House Report viewer (or a usable fallback)."""
    main_hwnd = as_dialog_hwnd(main_hwnd)
    deadline = time.time() + timeout_s
    attempt = 0
    while time.time() < deadline:
        if find_dialog_by_markers(job_pids, *USE_DATA_FROM_DIALOG_MARKERS):
            confirm_full_house_report_data_source(job_pids, timeout_s=10)
        report_hwnd = find_report_window(job_pids, main_hwnd)
        if report_hwnd:
            return report_hwnd
        attempt += 1
        if attempt % 8 == 0:
            progress(
                job_id,
                "printing",
                f"Waiting for Full House Report viewer… ({attempt // 2}s)",
            )
        time.sleep(0.5)
    if job_dir is not None:
        (job_dir / "report-debug.txt").write_text(
            report_window_debug(job_pids, main_hwnd),
            encoding="utf-8",
        )
    raise RuntimeError(
        "Full House Report window did not open in HOT2000 Desktop. "
        f"Diagnostics:\n{report_window_debug(job_pids, main_hwnd)}"
    )


def save_full_house_report_pdf(
    job_id: str,
    job_pids: int | set[int],
    output_path: Path,
    main_hwnd: int,
    job_dir: Path | None = None,
) -> None:
    """Print the open HOT2000 Full House Report to PDF."""
    job_pids = normalize_job_pids(job_pids)
    main_hwnd = as_dialog_hwnd(main_hwnd)
    try:
        if output_path.exists():
            output_path.unlink()
    except OSError:
        pass

    try:
        wait_for_report_print_target(
            job_id,
            job_pids,
            main_hwnd,
            job_dir=job_dir,
            timeout_s=120,
        )
    except RuntimeError:
        if not is_valid_hwnd(main_hwnd):
            if job_dir is not None:
                (job_dir / "report-debug.txt").write_text(
                    report_window_debug(job_pids, main_hwnd),
                    encoding="utf-8",
                )
            raise

    with _PdfDefaultPrinter() as pdf_printer_name:
        if not pdf_printer_name:
            raise RuntimeError(
                "Microsoft Print to PDF is not installed on this Windows worker PC."
            )
        report_hwnd = refresh_report_print_target(job_pids, main_hwnd)
        progress(
            job_id,
            "printing",
            f"Printing via 32-bit helper (default printer {pdf_printer_name!r})…",
        )
        run_report_print_32bit(
            output_path,
            report_hwnd,
            main_hwnd,
            job_dir=job_dir,
        )
        wait_for_pdf_output(output_path, timeout_s=120)


def run_hot2000_full_house_report(job_id: str, job_dir: Path) -> tuple[str, str]:
    """Open Full House Report (SOC) and print to PDF; return (input_xml, pdf_base64)."""
    import base64

    if not win32gui:
        raise RuntimeError(
            "pywin32 is not installed on this worker. Run: pip install pywin32"
        )

    allow_set_foreground_window()

    input_path = job_dir / "input.h2k"
    pdf_path = job_dir / "soc-full-house-report.pdf"
    try:
        if pdf_path.exists():
            pdf_path.unlink()
    except OSError:
        pass

    progress(job_id, "starting", f"Starting HOT2000 Desktop ({WORKER_BUILD_ID})…")
    popen_kwargs: dict = {}
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        popen_kwargs["startupinfo"] = startupinfo
    if HOT2000_HOME.is_dir():
        popen_kwargs["cwd"] = str(HOT2000_HOME)
    try:
        proc = subprocess.Popen([HOT2000_EXE, str(input_path)], **popen_kwargs)
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Could not start HOT2000 Desktop at {HOT2000_EXE}. "
            "Set HOT2000_EXE and HOT2000_HOME to your install folder."
        ) from exc

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

    validate_hot2000_main(main_hwnd)
    ensure_hot2000_visible(main_hwnd)
    job_pids = job_process_ids(proc, main_hwnd)
    primary_pid = next(iter(job_pids))

    time.sleep(1)
    startup_error = find_hot2000_startup_error(primary_pid)
    if startup_error:
        try:
            proc.terminate()
        except Exception:
            pass
        raise RuntimeError(startup_error)

    progress(job_id, "opening", "H2K model opened in HOT2000 Desktop…")
    time.sleep(2)
    for pid in job_pids:
        dismiss_blocking_dialogs(pid)

    progress(
        job_id,
        "reporting",
        "Report → Full house report → House with standard operating conditions…",
    )
    open_soc_full_house_report(main_hwnd)
    progress(job_id, "reporting", "Selecting House with standard operating conditions…")
    confirm_full_house_report_data_source(job_pids)
    time.sleep(2)

    progress(job_id, "printing", "Printing Full House Report to PDF…")
    save_full_house_report_pdf(job_id, job_pids, pdf_path, main_hwnd, job_dir)

    progress(job_id, "closing", "Closing HOT2000…")
    close_hot2000_application(proc, main_hwnd, primary_pid)

    progress(job_id, "extracting", "Reading Full House Report PDF…")
    input_xml = input_path.read_text(encoding="utf-8")
    pdf_base64 = base64.b64encode(pdf_path.read_bytes()).decode("ascii")
    return input_xml, pdf_base64


def run_hot2000(job_id: str, job_dir: Path) -> str:
    if not win32gui:
        raise RuntimeError(
            "pywin32 is not installed on this worker. Run: pip install pywin32"
        )

    allow_set_foreground_window()

    stale = kill_stale_hot2000_processes()
    if stale:
        print(f"Closed {stale} stale HOT2000 instance(s) before job {job_id}.")

    input_path = job_dir / "input.h2k"
    output_path = job_dir / "calculated.h2k"
    shutil.copy2(input_path, output_path)

    progress(job_id, "starting", f"Starting HOT2000 Desktop ({WORKER_BUILD_ID})…")
    popen_kwargs: dict = {}
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        popen_kwargs["startupinfo"] = startupinfo
    if HOT2000_HOME.is_dir():
        popen_kwargs["cwd"] = str(HOT2000_HOME)
    try:
        proc = subprocess.Popen([HOT2000_EXE, str(output_path)], **popen_kwargs)
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Could not start HOT2000 Desktop at {HOT2000_EXE}. "
            "Set HOT2000_EXE and HOT2000_HOME to your install folder."
        ) from exc

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

    validate_hot2000_main(main_hwnd)
    ensure_hot2000_visible(main_hwnd)
    job_pids = job_process_ids(proc, main_hwnd)
    primary_pid = next(iter(job_pids))

    time.sleep(1)
    startup_error = find_hot2000_startup_error(primary_pid)
    if startup_error:
        try:
            proc.terminate()
        except Exception:
            pass
        raise RuntimeError(startup_error)

    progress(job_id, "opening", "H2K model opened in HOT2000 Desktop…")
    time.sleep(3)
    for pid in job_pids:
        dismiss_blocking_dialogs(pid)

    progress(job_id, "calculating", "HOT2000 Desktop is calculating…")
    calc_thread = send_calculate(main_hwnd)
    wait_for_hot2000_progress(job_id, job_pids, job_dir, main_hwnd, calc_thread)

    progress(job_id, "saving", "Saving calculated H2K…")
    if not save_in_place(main_hwnd, output_path, primary_pid):
        send_command(main_hwnd, CMD_SAVE_AS)
        time.sleep(1)
        save_calculated_h2k(primary_pid, output_path, job_dir)
    elif not h2k_has_soc(output_path):
        raise RuntimeError("HOT2000 saved the file but SOC results are missing.")

    progress(job_id, "closing", "Closing HOT2000…")
    close_hot2000_application(proc, main_hwnd, primary_pid)

    progress(job_id, "extracting", "Reading SOC results…")
    if not h2k_has_soc(output_path):
        raise RuntimeError("HOT2000 closed but calculated.h2k is missing SOC results.")
    return output_path.read_text(encoding="utf-8")


def process_job(job: dict):
    job_id = job["job_id"]
    job_kind = str(job.get("kind") or "calculate").strip().lower()
    job_dir = JOBS_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        download_input(job, job_dir / "input.h2k")
        if job_kind == "full_house_report":
            calculated_xml, pdf_base64 = run_hot2000_full_house_report(job_id, job_dir)
            complete(job_id, calculated_xml, report_pdf_base64=pdf_base64)
        else:
            calculated_xml = run_hot2000(job_id, job_dir)
            complete(job_id, calculated_xml)
    except Exception as exc:  # noqa: BLE001
        fail(job_id, f"{exc} [worker {WORKER_BUILD_ID}]")


def main():
    load_worker_env_file()
    token = sync_session_auth()
    if not token:
        raise SystemExit(
            "HOT2000_WORKER_TOKEN is required.\n"
            "  Set it in the shell, worker-env.ps1, or C:\\HOT2000Worker\\.env"
        )
    print(f"HOT2000 worker {WORKER_BUILD_ID}")
    verify_api_credentials()
    verify_hot2000_install()
    JOBS_ROOT.mkdir(parents=True, exist_ok=True)
    auth_failures = 0
    while True:
        try:
            if not heartbeat():
                auth_failures += 1
                if auth_failures >= 2:
                    exit_on_auth_failure("heartbeat")
                time.sleep(3)
                continue
            auth_failures = 0
            job = safe_claim_job()
            if not job:
                time.sleep(3)
                continue
            process_job(job)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                exit_on_auth_failure("claim")
            print(f"Worker loop error: {exc}")
            time.sleep(5)
        except Exception as exc:
            print(f"Worker loop error: {exc}")
            time.sleep(5)


if __name__ == "__main__":
    main()
