"""32-bit helper: manual Full House Report → PDF flow for HOT2000.

Run with 32-bit Python only. The 64-bit worker must not open or click the Print
dialog — that crashes 32-bit HOT2000.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

if struct.calcsize("P") * 8 != 32:
    raise RuntimeError("report_print_helper_32bit.py must run under 32-bit Python")

_HELPER_DIR = Path(__file__).resolve().parent
if str(_HELPER_DIR) not in sys.path:
    sys.path.insert(0, str(_HELPER_DIR))

from print_dialog_win32 import (
    Hot2000ExitedAfterPrintError,
    PrintStepLogger,
    automate_open_print_dialog_to_pdf,
    export_full_house_report_pdf_manual,
    find_print_dialog,
    pdf_ready,
    require_pywin32,
)


def _python_arch_bits() -> int:
    return struct.calcsize("P") * 8


def _write_helper_logs(
    log_path: Path | None,
    report_hwnd: int | None,
    main_hwnd: int | None,
) -> PrintStepLogger | None:
    if log_path is None:
        return None
    log_path.parent.mkdir(parents=True, exist_ok=True)
    helper_log = log_path.parent / "print-helper-32bit.log"
    helper_log.write_text(
        "\n".join(
            [
                f"Python executable: {sys.executable}",
                f"Python architecture: {_python_arch_bits()}-bit",
                f"HOT2000 main HWND: {main_hwnd}",
                f"report HWND: {report_hwnd}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    logger = PrintStepLogger(log_path)
    logger.step("0_arch", f"python={sys.executable} arch={_python_arch_bits()}")
    if main_hwnd is not None:
        logger.step("1_main", f"hwnd={main_hwnd}")
    if report_hwnd is not None:
        logger.step("1_report", f"hwnd={report_hwnd}")
    return logger


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "Usage: report_print_helper_32bit.py <output.pdf> "
            "[report_hwnd] [main_hwnd] [log_path]",
            file=sys.stderr,
        )
        return 2

    output_path = Path(sys.argv[1]).resolve()
    report_hwnd = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
    main_hwnd = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else None
    log_path: Path | None = None
    if len(sys.argv) > 4 and sys.argv[4].strip():
        log_path = Path(sys.argv[4]).resolve()
    targets_path = log_path.parent / "print-targets.txt" if log_path else None

    logger = _write_helper_logs(log_path, report_hwnd, main_hwnd)

    try:
        require_pywin32()
    except ImportError:
        print(
            "Windows UI automation is unavailable in 32-bit Python.",
            file=sys.stderr,
        )
        return 3

    try:
        existing_dialog = find_print_dialog(timeout_s=1.5)
        if existing_dialog:
            automate_open_print_dialog_to_pdf(output_path, existing_dialog)
        else:
            export_full_house_report_pdf_manual(
                output_path,
                report_hwnd,
                main_hwnd,
                log_path=log_path,
                targets_path=targets_path,
            )
    except Hot2000ExitedAfterPrintError as exc:
        if logger:
            logger.step("CRASH", str(exc).splitlines()[0])
        print(str(exc), file=sys.stderr)
        return 6
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        message = str(exc).lower()
        if "save print output" in message or "save as" in message:
            return 4
        if "exited immediately" in message:
            return 6
        if pdf_ready(output_path):
            return 0
        return 5

    if pdf_ready(output_path):
        if logger:
            logger.step(
                "8_pdf_verified",
                f"path={output_path} bytes={output_path.stat().st_size}",
            )
        return 0
    print(f"PDF was not written to {output_path}", file=sys.stderr)
    return 5


if __name__ == "__main__":
    raise SystemExit(main())
