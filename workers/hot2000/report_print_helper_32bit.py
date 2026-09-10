"""32-bit helper: Ctrl+P through PDF save for HOT2000 Full House Report.

Run with 32-bit Python only. The 64-bit worker must not open or click the Print
dialog — that crashes 32-bit HOT2000.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path


def pdf_ready(output_path: Path) -> bool:
    try:
        if not output_path.is_file() or output_path.stat().st_size < 128:
            return False
        with output_path.open("rb") as handle:
            return handle.read(5).startswith(b"%PDF")
    except OSError:
        return False


def default_printer_is_pdf() -> bool:
    try:
        import win32print
    except ImportError:
        return False
    try:
        default = str(win32print.GetDefaultPrinter() or "").strip().lower()
        return "print to pdf" in default or default.endswith(" pdf")
    except Exception:
        return False


def find_report_target(desktop: object, report_hwnd: int | None, main_hwnd: int | None) -> object:
    if report_hwnd:
        target = desktop.window(handle=report_hwnd)
        target.wait("exists", timeout=15)
        return target
    if main_hwnd:
        main = desktop.window(handle=main_hwnd)
        main.wait("exists", timeout=15)
        for child in main.descendants():
            try:
                class_name = child.class_name()
            except Exception:
                continue
            if not class_name.startswith("Afx:"):
                continue
            try:
                title = (child.window_text() or "").strip().lower()
            except Exception:
                title = ""
            if "full house" in title or title == "":
                return child
        return main
    hot2000 = desktop.window(title_re=r".*HOT2000.*")
    hot2000.wait("visible", timeout=30)
    return hot2000


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "Usage: report_print_helper_32bit.py <output.pdf> [report_hwnd] [main_hwnd]",
            file=sys.stderr,
        )
        return 2

    output_path = Path(sys.argv[1]).resolve()
    report_hwnd = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
    main_hwnd = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else None

    try:
        from pywinauto import Desktop
    except ImportError:
        print("pywinauto is required", file=sys.stderr)
        return 3

    desktop = Desktop(backend="win32")
    target = find_report_target(desktop, report_hwnd, main_hwnd)
    target.set_focus()
    time.sleep(0.6)

    try:
        from pywinauto.keyboard import send_keys

        send_keys("^p", pause=0.05)
    except Exception:
        target.type_keys("^p")

    print_dialog = desktop.window(title="Print", class_name="#32770")
    print_dialog.wait("visible", timeout=45)
    print_dialog.set_focus()
    time.sleep(0.6)

    def click_print_button() -> None:
        try:
            print_dialog.child_window(title="Print", class_name="Button").click()
            return
        except Exception:
            pass
        try:
            print_dialog.Print.click()
        except Exception:
            print_dialog.type_keys("%p")

    def wait_for_save_dialog(timeout_s: float = 45) -> object | None:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            if pdf_ready(output_path):
                return "pdf"
            for title in ("Save Print Output As", "Save As"):
                try:
                    candidate = desktop.window(title=title, class_name="#32770")
                    if candidate.exists(timeout=0.5):
                        return candidate
                except Exception:
                    continue
            time.sleep(0.25)
        return None

    def select_pdf_printer() -> bool:
        for ctrl in print_dialog.descendants():
            try:
                class_name = ctrl.class_name()
            except Exception:
                continue
            if class_name not in ("SysListView32", "ListBox", "SHELLDLL_DefView"):
                continue
            try:
                texts = ctrl.item_texts()
            except Exception:
                texts = []
            for index, text in enumerate(texts):
                if "print to pdf" in str(text).lower():
                    try:
                        ctrl.select(index)
                    except Exception:
                        try:
                            ctrl.get_item(index).select()
                        except Exception:
                            continue
                    return True
        try:
            from pywinauto.keyboard import send_keys

            send_keys("Microsoft", pause=0.05, with_spaces=True)
            time.sleep(0.2)
            send_keys(" Print to PDF", pause=0.05, with_spaces=True)
            time.sleep(0.3)
        except Exception:
            pass
        return False

    save_dialog = None
    if default_printer_is_pdf():
        click_print_button()
        save_dialog = wait_for_save_dialog(timeout_s=20)

    if not save_dialog:
        select_pdf_printer()
        time.sleep(0.3)
        click_print_button()
        save_dialog = wait_for_save_dialog(timeout_s=45)

    if save_dialog == "pdf" or pdf_ready(output_path):
        return 0

    if not save_dialog:
        print("Save Print Output As dialog did not open", file=sys.stderr)
        return 4

    save_dialog.set_focus()
    path_str = str(output_path)
    for kwargs in (
        {"class_name": "Edit", "found_index": 0},
        {"title_re": r".*File name.*", "class_name": "Edit"},
    ):
        try:
            save_dialog.child_window(**kwargs).set_edit_text(path_str)
            break
        except Exception:
            continue

    for kwargs in (
        {"title": "Save", "class_name": "Button"},
        {"title": "&Save", "class_name": "Button"},
    ):
        try:
            save_dialog.child_window(**kwargs).click()
            break
        except Exception:
            continue

    deadline = time.time() + 90
    while time.time() < deadline:
        if pdf_ready(output_path):
            return 0
        time.sleep(0.25)

    print(f"PDF was not written to {output_path}", file=sys.stderr)
    return 5


if __name__ == "__main__":
    raise SystemExit(main())
