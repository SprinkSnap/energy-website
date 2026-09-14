"""Navigate HOT2000 Desktop to a specific Phase 2 section without physical mouse movement."""

from __future__ import annotations

import re
from typing import Any

from catalog_navigation import wait_for_ui_stability
from catalog_phase2_sections import PHASE2_SECTIONS, get_section_by_id, section_nav_label_set
from catalog_ui_interaction import automatic_scan_mode, invoke_button, select_tab_item

_NAV_CONTROL_TYPES = frozenset({"TreeItem", "ListItem", "TabItem", "Button", "Hyperlink"})


def _normalize_label(label: str) -> str:
    text = re.sub(r"&", "", label or "").strip().lower()
    return re.sub(r"\s+", " ", text)


def _label_matches_section(label: str, nav_labels: set[str]) -> bool:
    normalized = _normalize_label(label)
    if not normalized:
        return False
    if normalized in nav_labels:
        return True
    for candidate in nav_labels:
        if candidate and (candidate in normalized or normalized in candidate):
            return True
    return False


def _activate_navigation_control(control, control_type: str) -> tuple[bool, str | None]:
    if control_type == "TabItem":
        return select_tab_item(control)
    if control_type in {"TreeItem", "ListItem", "Hyperlink"}:
        try:
            control.select()
            return True, None
        except Exception:
            pass
        try:
            control.iface_selection_item.Select()
            return True, None
        except Exception as exc:
            if automatic_scan_mode():
                try:
                    control.set_focus()
                    control.type_keys("{ENTER}")
                    return True, None
                except Exception as inner:
                    return False, str(inner)
            return False, str(exc)
    if control_type == "Button":
        return invoke_button(control)
    return False, f"unsupported navigation control type: {control_type}"


def _find_navigation_control(window, nav_labels: set[str]) -> tuple[Any | None, str | None]:
    best: tuple[Any, str, int] | None = None
    try:
        descendants = list(window.descendants())
    except Exception:
        return None, "could not enumerate window descendants"

    for desc in descendants:
        try:
            if not desc.is_visible() or not desc.is_enabled():
                continue
            ctype = str(desc.element_info.control_type)
            if ctype not in _NAV_CONTROL_TYPES:
                continue
            label = (desc.window_text() or desc.element_info.name or "").strip()
            if not _label_matches_section(label, nav_labels):
                continue
            priority = {
                "TabItem": 0,
                "TreeItem": 1,
                "ListItem": 2,
                "Button": 3,
                "Hyperlink": 4,
            }.get(ctype, 9)
            if best is None or priority < best[2]:
                best = (desc, ctype, priority)
        except Exception:
            continue

    if best is None:
        return None, f"navigation control not found for labels: {sorted(nav_labels)}"
    return best[0], best[1]


def navigate_to_section(window, section_id: str) -> tuple[bool, str | None]:
    """Select the requested HOT2000 main section using UIA/keyboard only."""
    section = get_section_by_id(section_id)
    if not section:
        return False, f"unknown section id: {section_id}"

    nav_labels = section_nav_label_set(section_id)
    control, ctype = _find_navigation_control(window, nav_labels)
    if control is None:
        return False, ctype or "navigation control not found"

    ok, err = _activate_navigation_control(control, ctype or "")
    if not ok:
        return False, err or "navigation activation failed"

    wait_for_ui_stability(window)
    return True, None


def current_section_id(window) -> str | None:
    """Best-effort detection of the active HOT2000 section from selected navigation controls."""
    try:
        for desc in window.descendants():
            ctype = str(desc.element_info.control_type)
            if ctype not in {"TabItem", "TreeItem", "ListItem"}:
                continue
            try:
                if hasattr(desc, "is_selected") and desc.is_selected():
                    label = (desc.window_text() or desc.element_info.name or "").strip()
                    normalized = _normalize_label(label)
                    for section in PHASE2_SECTIONS:
                        if normalized in section_nav_label_set(section["id"]):
                            return section["id"]
            except Exception:
                continue
    except Exception:
        return None
    return None
