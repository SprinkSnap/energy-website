"""UI Automation helpers for HOT2000 H2K probe value changes."""

from __future__ import annotations

import time
from typing import Any

from catalog_probe_eligibility import choose_probe_value
from catalog_recorder import COMBO_TYPES, TEXT_TYPES, CHECK_TYPES, RADIO_TYPES, _read_value


def find_control_by_stable_id(window, stable_id: str):
    """Locate a captured control on the current HOT2000 window."""
    for idx, desc in enumerate(window.descendants()):
        try:
            info = desc.element_info
            automation_id = str(info.automation_id or "").strip()
            ctype = str(info.control_type)
            name = str(desc.window_text() or info.name or "").strip()
            class_name = str(info.class_name or "")
            candidate = automation_id or f"{ctype}:{class_name}:{name}:{idx}"
            if candidate == stable_id or automation_id == stable_id:
                return desc, ctype
        except Exception:
            continue
    return None, None


def read_current_value(control, ctype: str) -> str | None:
    return _read_value(control, ctype)


def apply_probe_value(
    control,
    ctype: str,
    probe_class: str,
    *,
    probe_value: str | None = None,
    option_index: int | None = None,
    option_label: str | None = None,
) -> str:
    """Apply a probe value to a control. Returns the UI value after change."""
    if probe_class == "SAFE_CODED_SELECT" and ctype in COMBO_TYPES:
        if option_index is not None:
            try:
                control.select(option_index)
            except Exception:
                if option_label:
                    control.select(option_label)
        elif option_label:
            control.select(option_label)
        time.sleep(0.3)
        return read_current_value(control, ctype) or option_label or ""

    if probe_class == "SAFE_CHECKBOX" and ctype in CHECK_TYPES:
        try:
            state = control.get_toggle_state()
            control.toggle()
            time.sleep(0.2)
            return "true" if state != 1 else "false"
        except Exception:
            control.click_input()
            time.sleep(0.2)
            return read_current_value(control, ctype) or "toggled"

    if probe_class == "SAFE_RADIO" and ctype in RADIO_TYPES:
        control.click_input()
        time.sleep(0.2)
        return read_current_value(control, ctype) or "selected"

    value = probe_value or choose_probe_value(probe_class, read_current_value(control, ctype))
    if not value:
        raise ValueError(f"No probe value for class {probe_class}")

    if ctype in TEXT_TYPES:
        control.set_focus()
        try:
            control.set_edit_text(value)
        except Exception:
            control.type_keys("^a{BACKSPACE}" + value, with_spaces=True)
        time.sleep(0.2)
        return read_current_value(control, ctype) or value

    raise ValueError(f"Unsupported control type {ctype} for probe class {probe_class}")


def capture_validation_dialog(worker_module, pid: int) -> dict[str, Any] | None:
    """Capture validation/error dialog text if present."""
    try:
        from catalog_navigation import list_dialog_windows
        from catalog_recorder import _desktop_window

        desktop = _desktop_window()
        for dialog in list_dialog_windows(desktop, parent_pid=pid):
            title = str(dialog.window_text() or "")
            if not title:
                continue
            lowered = title.lower()
            if any(word in lowered for word in ("error", "warning", "sorry", "invalid")):
                return {"title": title, "hwnd": getattr(dialog, "handle", None)}
    except Exception:
        pass
    return None
