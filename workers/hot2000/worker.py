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
WORKER_BUILD_ID = "2026-09-10e"

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
OVERWRITE_TITLE_WORDS = ("confirm save as", "confirm", "replace", "overwrite")
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


def complete(job_id: str, calculated_xml: str):
    api_post(
        f"/worker/{job_id}/complete",
        {
            "worker_id": WORKER_ID,
            "calculated_xml": calculated_xml,
        },
    )


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


def save_as_target_path(output_path: Path) -> Path:
    """Use a fresh filename so Save As does not raise Confirm Save As."""
    target = output_path.parent / f"{output_path.stem}-worker-save.h2k"
    try:
        if target.exists():
            target.unlink()
    except OSError:
        pass
    return target


def finalize_save_as_output(save_target: Path, output_path: Path) -> None:
    """Move Save As output onto calculated.h2k."""
    if save_target.resolve() == output_path.resolve():
        return
    if not save_target.exists():
        if output_path.exists() and h2k_has_soc(output_path):
            return
        raise RuntimeError(
            f"Save As did not create {save_target.name} or {output_path.name}."
        )
    try:
        if output_path.exists():
            output_path.unlink()
        save_target.replace(output_path)
    except OSError as exc:
        shutil.copy2(save_target, output_path)
        try:
            save_target.unlink()
        except OSError:
            pass
        if not output_path.exists():
            raise RuntimeError(f"Could not move Save As output onto {output_path.name}: {exc}") from exc


def save_calculated_h2k(pid: int, output_path: Path, job_dir: Path | None = None) -> None:
    """Save As via WM_COMMAND 57604 and file-name field."""
    if not win32gui:
        raise RuntimeError("pywin32 is required on Windows.")
    save_target = save_as_target_path(output_path)
    path_str = str(save_target.resolve())
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
    for _ in range(10):
        confirm_overwrite_if_present(pid, save_dialog)
        time.sleep(0.1)
    wait_for_save_dialog_close(save_dialog, pid)
    finalize_save_as_output(save_target, output_path)


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

    _, hot2000_pid = win32process.GetWindowThreadProcessId(main_hwnd)

    time.sleep(1)
    startup_error = find_hot2000_startup_error(hot2000_pid)
    if startup_error:
        try:
            proc.terminate()
        except Exception:
            pass
        raise RuntimeError(startup_error)

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
    close_hot2000_application(proc, main_hwnd, hot2000_pid)

    progress(job_id, "extracting", "Reading SOC results…")
    if not h2k_has_soc(output_path):
        raise RuntimeError("HOT2000 closed but calculated.h2k is missing SOC results.")
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
