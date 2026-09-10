"""32-bit helper: Ctrl+P through PDF save for HOT2000 Full House Report.

Run with 32-bit Python only. The 64-bit worker must not open or click the Print
dialog — that crashes 32-bit HOT2000.
"""

from __future__ import annotations

import sys
from pathlib import Path

_HELPER_DIR = Path(__file__).resolve().parent
if str(_HELPER_DIR) not in sys.path:
    sys.path.insert(0, str(_HELPER_DIR))

from print_dialog_win32 import (
    automate_open_print_dialog_to_pdf,
    automate_report_print_to_pdf,
    find_print_dialog,
    pdf_ready,
    require_pywin32,
)


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "Usage: report_print_helper_32bit.py <output.pdf> [report_hwnd] [main_hwnd] [print_dialog_hwnd]",
            file=sys.stderr,
        )
        return 2

    output_path = Path(sys.argv[1]).resolve()
    report_hwnd = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
    main_hwnd = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else None
    print_dialog_hwnd = (
        int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else None
    )

    try:
        require_pywin32()
    except ImportError:
        print(
            "Windows UI automation is unavailable in 32-bit Python.",
            file=sys.stderr,
        )
        return 3

    try:
        if print_dialog_hwnd and print_dialog_hwnd > 0:
            automate_open_print_dialog_to_pdf(output_path, print_dialog_hwnd)
        else:
            existing_dialog = find_print_dialog(timeout_s=2)
            if existing_dialog:
                automate_open_print_dialog_to_pdf(output_path, existing_dialog)
            else:
                automate_report_print_to_pdf(output_path, report_hwnd, main_hwnd)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        message = str(exc).lower()
        if "save print output" in message or "save as" in message:
            return 4
        if pdf_ready(output_path):
            return 0
        return 5

    if pdf_ready(output_path):
        return 0
    print(f"PDF was not written to {output_path}", file=sys.stderr)
    return 5


if __name__ == "__main__":
    raise SystemExit(main())
