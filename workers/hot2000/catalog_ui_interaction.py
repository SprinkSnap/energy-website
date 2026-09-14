"""UI interaction helpers for HOT2000 catalog crawler (keyboard/UIA only in automatic scan)."""

from __future__ import annotations

import os
import time
from typing import Any

VISIBLE_INTERACTION_ENV = "HOT2000_RECORDER_VISIBLE_INTERACTION"
CURSOR_PAUSE_S = 0.15


def visible_interaction_enabled() -> bool:
    return os.environ.get(VISIBLE_INTERACTION_ENV, "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def automatic_scan_mode() -> bool:
    """Automatic full scan must never move the physical mouse pointer."""
    return not visible_interaction_enabled()


def move_cursor_to_control(control) -> None:
    if automatic_scan_mode():
        return
    try:
        rect = control.rectangle()
        x = int((rect.left + rect.right) / 2)
        y = int((rect.top + rect.bottom) / 2)
        import ctypes

        ctypes.windll.user32.SetCursorPos(x, y)
        time.sleep(CURSOR_PAUSE_S)
    except Exception:
        pass


def click_with_cursor(control) -> None:
    if automatic_scan_mode():
        raise RuntimeError("Physical mouse interaction is disabled during automatic scan.")
    move_cursor_to_control(control)
    control.click_input()


def _keyboard_activate(control) -> tuple[bool, str | None]:
    try:
        control.set_focus()
        control.type_keys("{ENTER}")
        return True, None
    except Exception as exc:
        return False, str(exc)


def _selection_item_select(control) -> tuple[bool, str | None]:
    try:
        control.select()
        return True, None
    except Exception:
        pass
    try:
        iface = control.iface_selection_item
        iface.Select()
        return True, None
    except Exception as exc:
        return False, str(exc)


def select_tab_item(tab) -> tuple[bool, str | None]:
    for strategy in ("selection_item", "select", "invoke"):
        try:
            if strategy == "selection_item":
                ok, err = _selection_item_select(tab)
                if ok:
                    return True, None
                if err:
                    last = err
            elif strategy == "select":
                tab.select()
            elif strategy == "invoke":
                tab.invoke()
            return True, None
        except Exception as exc:
            last = str(exc)
    if not automatic_scan_mode():
        try:
            click_with_cursor(tab)
            return True, None
        except Exception as exc:
            last = str(exc)
    return _keyboard_activate(tab)


def expand_combo(control) -> tuple[bool, str | None]:
    try:
        control.iface_expand_collapse.Expand()
        return True, None
    except Exception:
        pass
    try:
        control.expand()
        return True, None
    except Exception:
        pass
    if not automatic_scan_mode():
        try:
            click_with_cursor(control)
            return True, None
        except Exception:
            pass
    try:
        control.set_focus()
        control.type_keys("%{DOWN}")
        return True, None
    except Exception as exc:
        return False, str(exc)


def collapse_combo(control) -> None:
    for fn in (
        lambda: control.iface_expand_collapse.Collapse(),
        lambda: control.collapse(),
        lambda: control.type_keys("{ESC}"),
    ):
        try:
            fn()
            return
        except Exception:
            continue


def _select_list_item_keyboard(item) -> tuple[bool, str | None]:
    try:
        ok, err = _selection_item_select(item)
        if ok:
            return True, None
    except Exception:
        pass
    try:
        item.set_focus()
        item.type_keys("{ENTER}")
        return True, None
    except Exception as exc:
        return False, str(exc)


def select_combo_option(control, label: str, original: str | None) -> tuple[bool, str | None]:
    try:
        control.select(label)
        return True, None
    except Exception:
        pass
    try:
        items = control.descendants(control_type="ListItem")
        for item in items:
            if (item.window_text() or "").strip() == label:
                ok, err = _select_list_item_keyboard(item)
                if ok:
                    return True, None
                if not automatic_scan_mode():
                    click_with_cursor(item)
                    return True, None
                return False, err or f"keyboard select failed for option: {label}"
    except Exception as exc:
        return False, str(exc)
    try:
        control.set_focus()
        control.type_keys("{HOME}")
        for _ in range(256):
            current = (control.window_text() or "").strip()
            if current == label:
                control.type_keys("{ENTER}")
                return True, None
            control.type_keys("{DOWN}")
        return False, f"option not found via keyboard: {label}"
    except Exception as exc:
        return False, str(exc)


def restore_combo_value(control, original: str | None) -> str:
    if not original:
        collapse_combo(control)
        return "direct"
    try:
        control.select(original)
        collapse_combo(control)
        return "direct"
    except Exception:
        pass
    ok, _ = select_combo_option(control, original, None)
    if ok:
        collapse_combo(control)
        return "direct"
    collapse_combo(control)
    return "restoration_failed"


def focus_text_field(control) -> tuple[bool, str | None]:
    try:
        control.set_focus()
        return True, None
    except Exception as exc:
        return False, str(exc)


def read_toggle_state(control) -> str:
    try:
        state = control.get_toggle_state()
        if state == 1:
            return "checked"
        if state == 2:
            return "indeterminate"
        return "unchecked"
    except Exception:
        text = (control.window_text() or "").strip().lower()
        if text in {"true", "checked", "on", "yes"}:
            return "checked"
        return "unchecked"


def toggle_checkbox(control, target: str) -> tuple[bool, str | None]:
    current = read_toggle_state(control)
    if current == target:
        return True, None
    try:
        control.toggle()
        return True, None
    except Exception:
        pass
    if not automatic_scan_mode():
        try:
            click_with_cursor(control)
            return True, None
        except Exception:
            pass
    try:
        control.set_focus()
        control.type_keys(" ")
        return True, None
    except Exception as exc:
        return False, str(exc)


def select_radio(control) -> tuple[bool, str | None]:
    ok, err = _selection_item_select(control)
    if ok:
        return True, None
    if not automatic_scan_mode():
        try:
            click_with_cursor(control)
            return True, None
        except Exception:
            pass
    try:
        control.set_focus()
        control.type_keys(" ")
        return True, None
    except Exception as exc:
        return False, str(exc)


def scroll_container(container, *, max_steps: int = 24) -> tuple[int, bool]:
    """Scroll down; return (new_controls_seen, exhausted)."""
    seen: set[str] = set()

    def collect() -> int:
        count = 0
        try:
            for desc in container.descendants():
                if not desc.is_visible():
                    continue
                key = f"{desc.element_info.control_type}:{desc.window_text()}"
                if key not in seen:
                    seen.add(key)
                    count += 1
        except Exception:
            pass
        return count

    before = collect()
    exhausted = False
    try:
        scroll = container.iface_scroll
    except Exception:
        try:
            container.set_focus()
            container.type_keys("{PGDN}")
            added = collect() - before
            return max(0, added), added == 0
        except Exception:
            return 0, True

    last_percent = -1.0
    for _ in range(max_steps):
        try:
            scroll.Scroll(0, 3)
            time.sleep(0.12)
            added = collect() - before
            percent = float(scroll.CurrentVerticalScrollPercent)
            if percent == last_percent and added == 0:
                exhausted = True
                break
            last_percent = percent
            if percent >= 99.0:
                exhausted = True
                break
        except Exception:
            exhausted = True
            break

    try:
        scroll.SetScrollPercent(0, 0)
    except Exception:
        pass
    return max(0, len(seen) - before), exhausted


def invoke_button(control) -> tuple[bool, str | None]:
    try:
        control.invoke()
        return True, None
    except Exception:
        pass
    if not automatic_scan_mode():
        try:
            click_with_cursor(control)
            return True, None
        except Exception:
            pass
    return _keyboard_activate(control)
