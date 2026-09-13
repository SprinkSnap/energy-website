"""
Shared HOT2000 Desktop launch/attach/open/close lifecycle.

Used by calculate jobs, Full House Report jobs, and catalog recorder jobs.
"""

from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Protocol


class ProgressFn(Protocol):
    def __call__(self, job_id: str, stage: str, message: str | None = None) -> None: ...


@dataclass
class Hot2000Session:
    job_id: str
    job_dir: Path
    h2k_path: Path
    proc: subprocess.Popen | None = None
    main_hwnd: int | None = None
    job_pids: set[int] = field(default_factory=set)
    primary_pid: int | None = None


def launch_hot2000(
    job_id: str,
    job_dir: Path,
    h2k_path: Path,
    progress: ProgressFn,
    *,
    kill_stale: bool = True,
) -> Hot2000Session:
    """Launch HOT2000.exe with an H2K file and attach to the main window."""
    import worker as w

    if not w.win32gui:
        raise RuntimeError(
            "pywin32 is not installed on this worker. Run: pip install pywin32"
        )

    w.allow_set_foreground_window()
    session = Hot2000Session(job_id=job_id, job_dir=job_dir, h2k_path=h2k_path)

    if kill_stale:
        stale = w.kill_stale_hot2000_processes()
        if stale:
            print(f"Closed {stale} stale HOT2000 instance(s) before job {job_id}.")

    progress(job_id, "starting", f"Starting HOT2000 Desktop ({w.WORKER_BUILD_ID})…")
    popen_kwargs: dict = {}
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        popen_kwargs["startupinfo"] = startupinfo
    if w.HOT2000_HOME.is_dir():
        popen_kwargs["cwd"] = str(w.HOT2000_HOME)

    try:
        session.proc = subprocess.Popen(
            [w.HOT2000_EXE, str(h2k_path)],
            **popen_kwargs,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Could not start HOT2000 Desktop at {w.HOT2000_EXE}. "
            "Set HOT2000_EXE and HOT2000_HOME to your install folder."
        ) from exc

    session.main_hwnd = w.wait_for_hot2000_main(session.proc.pid, timeout_s=120)
    if not session.main_hwnd:
        diag = w.hot2000_window_diagnostics(session.proc.pid)
        debug_path = job_dir / "window-debug.txt"
        debug_path.write_text(diag, encoding="utf-8")
        try:
            session.proc.terminate()
        except Exception:
            pass
        raise RuntimeError(
            "Could not find HOT2000 main window after 120s. "
            f"See {debug_path} on the worker PC. Diagnostics:\n{diag}"
        )

    w.validate_hot2000_main(session.main_hwnd)
    w.ensure_hot2000_visible(session.main_hwnd)
    session.job_pids = w.job_process_ids(session.proc, session.main_hwnd)
    session.primary_pid = next(iter(session.job_pids))
    return session


def wait_for_model_ready(
    session: Hot2000Session,
    job_id: str,
    progress: ProgressFn,
    *,
    settle_s: float = 3.0,
) -> None:
    """Wait for the opened H2K model to finish loading."""
    import worker as w

    time.sleep(1)
    startup_error = w.find_hot2000_startup_error(session.primary_pid)
    if startup_error:
        cleanup_hot2000(session)
        raise RuntimeError(startup_error)

    progress(job_id, "opening", "H2K model opened in HOT2000 Desktop…")
    time.sleep(settle_s)
    for pid in session.job_pids:
        w.dismiss_blocking_dialogs(pid)


def close_hot2000(session: Hot2000Session, job_dir: Path | None = None) -> None:
    """Close HOT2000 through the normal worker cleanup path."""
    import worker as w

    if not session.proc or not session.main_hwnd or not session.primary_pid:
        return
    w.close_hot2000_application(
        session.proc,
        session.main_hwnd,
        session.primary_pid,
        job_dir=job_dir,
    )


def cleanup_hot2000(session: Hot2000Session) -> None:
    """Best-effort cleanup when launch fails before a full session is ready."""
    if session.proc is None:
        return
    try:
        session.proc.terminate()
    except Exception:
        pass


def open_h2k_fixture(
    job_id: str,
    job_dir: Path,
    fixture_name: str,
    progress: ProgressFn,
) -> Hot2000Session:
    """Copy a recorder fixture into the job dir and launch HOT2000 with it."""
    import worker as w

    fixture_path = Path(__file__).resolve().parent / "fixtures" / fixture_name
    if not fixture_path.is_file():
        raise RuntimeError(f"Recorder fixture not found: {fixture_path}")

    target = job_dir / "recorder.h2k"
    import shutil

    shutil.copy2(fixture_path, target)
    return launch_hot2000(job_id, job_dir, target, progress)


def detect_hot2000_version() -> str | None:
    """Best-effort HOT2000 version from executable metadata or install folder."""
    import worker as w

    exe = Path(w.HOT2000_EXE)
    parent = exe.parent.name.lower()
    for token in ("11.13", "11.12", "11.11"):
        if token in parent or token in exe.name.lower():
            return token
    return None
