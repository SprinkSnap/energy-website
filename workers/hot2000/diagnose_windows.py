"""
Print HOT2000 window diagnostics on the Windows worker PC.

Usage (while HOT2000 is open, or right after a failed job):
  python diagnose_windows.py
"""

from __future__ import annotations

from worker import hot2000_process_ids, hot2000_window_diagnostics


def main() -> None:
    print(hot2000_window_diagnostics())


if __name__ == "__main__":
    main()
