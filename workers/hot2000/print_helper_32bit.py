"""32-bit helper for HOT2000 Print dialog automation (run with 32-bit Python)."""

from __future__ import annotations

import sys
from pathlib import Path

_HELPER_DIR = Path(__file__).resolve().parent
if str(_HELPER_DIR) not in sys.path:
    sys.path.insert(0, str(_HELPER_DIR))

from print_dialog_win32 import (
    automate_open_print_dialog_to_pdf,
    pdf_ready,
    require_pywin32,
)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: print_helper_32bit.py <output.pdf>", file=sys.stderr)
        return 2

    output_path = Path(sys.argv[1]).resolve()

    try:
        require_pywin32()
    except ImportError:
        print(
            "pywin32 is required. On the worker PC run: .\\install-python32.ps1",
            file=sys.stderr,
        )
        return 3

    try:
        automate_open_print_dialog_to_pdf(output_path)
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
