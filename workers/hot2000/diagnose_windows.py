"""
Print HOT2000 window diagnostics on the Windows worker PC.

Copy this file next to worker.py (e.g. C:\\HOT2000Worker\\) and run:
  python diagnose_windows.py
"""

from __future__ import annotations

import subprocess

try:
    import win32gui
    import win32process
except ImportError:
    raise SystemExit("Install pywin32 first: pip install pywin32")


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


def hot2000_process_ids() -> set[int]:
    pids: set[int] = set()
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


def describe_window(hwnd: int) -> str:
    try:
        _, wpid = win32process.GetWindowThreadProcessId(hwnd)
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        area = max(0, right - left) * max(0, bottom - top)
        return (
            f"hwnd={hwnd} pid={wpid} class={win32gui.GetClassName(hwnd)!r} "
            f"title={win32gui.GetWindowText(hwnd)!r} visible={win32gui.IsWindowVisible(hwnd)} "
            f"area={area}"
        )
    except Exception as exc:
        return f"hwnd={hwnd} <unreadable: {exc}>"


def main() -> None:
    pids = hot2000_process_ids()
    print(f"HOT2000 PIDs: {sorted(pids) if pids else 'none'}")
    seen: set[int] = set()
    for pid in sorted(pids):
        for hwnd in windows_for_pid(pid):
            if hwnd in seen:
                continue
            seen.add(hwnd)
            print(" ", describe_window(hwnd))
    if not seen:
        print("No windows found for HOT2000 processes. Is HOT2000 open?")


if __name__ == "__main__":
    main()
