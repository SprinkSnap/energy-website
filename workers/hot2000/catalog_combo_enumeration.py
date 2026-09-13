"""Robust ComboBox enumeration for HOT2000 Desktop 11.13."""

from __future__ import annotations

import time
from typing import Any

from catalog_models import DropdownOption
from catalog_recorder import _read_value, _safe_str


def _combo_metadata(control, ctype: str) -> dict[str, Any]:
    return {
        "automationId": _safe_str(getattr(control.element_info, "automation_id", None)),
        "className": _safe_str(getattr(control.element_info, "class_name", None)),
        "controlType": ctype,
        "hwnd": getattr(control, "handle", None),
        "currentValue": _read_value(control, ctype),
        "enabled": bool(control.is_enabled()) if hasattr(control, "is_enabled") else None,
        "visible": bool(control.is_visible()) if hasattr(control, "is_visible") else None,
    }


def enumerate_combo_options(
    control,
    ctype: str,
    *,
    expand: bool = True,
) -> tuple[list[DropdownOption], list[str], str]:
    """
    Enumerate combo options without changing final selection.

    Returns (options, warnings, comboEnumerationStatus).
    Status: success | partial | inaccessible | unsupported
    """
    warnings: list[str] = []
    options: list[DropdownOption] = []
    original = _read_value(control, ctype)
    status = "unsupported"

    # Strategy B: UIA selection pattern without opening
    try:
        items = control.descendants(control_type="ListItem")
        if items:
            for idx, item in enumerate(items):
                label = _safe_str(item.window_text()) or _safe_str(item.element_info.name) or ""
                selected = False
                try:
                    selected = bool(item.is_selected())
                except Exception:
                    selected = original is not None and label == original
                options.append(
                    DropdownOption(
                        index=idx,
                        label=label,
                        selected=selected,
                        native_value=_safe_str(getattr(item.element_info, "name", None)),
                        automation_id=_safe_str(getattr(item.element_info, "automation_id", None)),
                    )
                )
            if options:
                status = "success"
                return options, warnings, status
    except Exception as exc:
        warnings.append(f"UIA ListItem enumeration failed: {exc}")

    if not expand:
        return options, warnings, "inaccessible" if not options else "partial"

    # Strategy C: expand and read popup list
    expanded = False
    for opener in (
        lambda: control.iface_expand_collapse.Expand(),
        lambda: control.expand(),
        lambda: control.click_input(),
        lambda: (control.set_focus(), control.type_keys("%{DOWN}")),
    ):
        try:
            opener()
            expanded = True
            time.sleep(0.25)
            break
        except Exception as exc:
            warnings.append(f"Combo expand attempt failed: {exc}")

    if expanded:
        try:
            items = control.descendants(control_type="ListItem")
            if not items:
                items = control.descendants(control_type="List")
            for idx, item in enumerate(items):
                label = _safe_str(item.window_text()) or _safe_str(item.element_info.name) or ""
                if not label:
                    continue
                options.append(
                    DropdownOption(
                        index=idx,
                        label=label,
                        selected=original is not None and label == original,
                        native_value=_safe_str(getattr(item.element_info, "name", None)),
                        automation_id=_safe_str(getattr(item.element_info, "automation_id", None)),
                    )
                )
            status = "success" if options else "partial"
        except Exception as exc:
            warnings.append(f"Expanded combo enumeration failed: {exc}")
            status = "inaccessible"

    # Restore original selection
    if original:
        for restorer in (
            lambda: control.select(original),
            lambda: control.set_text(original),
        ):
            try:
                restorer()
                break
            except Exception:
                continue
    try:
        control.collapse()
    except Exception:
        try:
            control.type_keys("{ESC}")
        except Exception:
            pass

    if not options and status == "unsupported":
        status = "inaccessible"
    elif options and status == "unsupported":
        status = "partial"
    return options, warnings, status
