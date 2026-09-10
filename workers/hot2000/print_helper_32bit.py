"""32-bit helper for HOT2000 Print dialog automation (run with 32-bit Python)."""

from __future__ import annotations

import sys
import time
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: print_helper_32bit.py <output.pdf>", file=sys.stderr)
        return 2

    output_path = Path(sys.argv[1]).resolve()
    try:
        from pywinauto import Desktop
    except ImportError:
        print("pywinauto is required", file=sys.stderr)
        return 3

    desktop = Desktop(backend="win32")
    print_dialog = desktop.window(title="Print", class_name="#32770")
    print_dialog.wait("visible", timeout=45)
    print_dialog.set_focus()
    time.sleep(0.5)

    selected = False
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
                selected = True
                break
        if selected:
            break

    if not selected:
        try:
            from pywinauto.keyboard import send_keys

            send_keys("Microsoft", pause=0.05, with_spaces=True)
            time.sleep(0.3)
        except Exception:
            pass

    try:
        print_dialog.child_window(title="Print", class_name="Button").click()
    except Exception:
        try:
            print_dialog.Print.click()
        except Exception:
            print_dialog.type_keys("%p")

    save_dialog = None
    deadline = time.time() + 45
    while time.time() < deadline:
        for title in ("Save Print Output As", "Save As"):
            try:
                candidate = desktop.window(title=title, class_name="#32770")
                if candidate.exists(timeout=0.5):
                    save_dialog = candidate
                    break
            except Exception:
                continue
        if save_dialog:
            break
        time.sleep(0.25)

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

    deadline = time.time() + 60
    while time.time() < deadline:
        if output_path.is_file() and output_path.stat().st_size >= 128:
            with output_path.open("rb") as handle:
                if handle.read(5).startswith(b"%PDF"):
                    return 0
        time.sleep(0.25)

    print(f"PDF was not written to {output_path}", file=sys.stderr)
    return 5


if __name__ == "__main__":
    raise SystemExit(main())
