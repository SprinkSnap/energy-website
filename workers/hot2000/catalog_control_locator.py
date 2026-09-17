"""Stable logical control identity for HOT2000 Phase 2 UI crawler."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

TRANSIENT_CONTROL_TYPES = frozenset(
    {"ListItem", "Thumb", "ScrollBar", "ToolTip", "ToolBar", "TitleBar", "MenuBar"}
)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").strip().lower()).strip("-") or "unknown"


def build_structural_path(control, max_depth: int = 10) -> str:
    parts: list[str] = []
    node = control
    for _ in range(max_depth):
        try:
            ei = node.element_info
            ctype = str(ei.control_type or "Control")
            aid = str(ei.automation_id or "").strip()
            label = (node.window_text() or ei.name or "").strip()[:48]
            segment = ctype
            if aid:
                segment += f"[{aid}]"
            elif label:
                segment += f"({label})"
            parts.append(segment)
            parent = node.parent()
            if parent is None or parent == node:
                break
            node = parent
        except Exception:
            break
    return " > ".join(reversed(parts))


def infer_nearby_label(control) -> str:
    try:
        text = (control.window_text() or control.element_info.name or "").strip()
        if text:
            return text
        parent = control.parent()
        if parent is not None:
            for sibling in parent.children():
                try:
                    if sibling == control:
                        continue
                    stype = str(sibling.element_info.control_type)
                    if stype in {"Text", "Static", "Label"}:
                        label = (sibling.window_text() or sibling.element_info.name or "").strip()
                        if label:
                            return label
                except Exception:
                    continue
    except Exception:
        pass
    return ""


def sibling_ordinal(control, control_type: str) -> int:
    try:
        parent = control.parent()
        if parent is None:
            return 0
        ordinal = 0
        for child in parent.children():
            try:
                if str(child.element_info.control_type) != control_type:
                    continue
                if not child.is_visible():
                    continue
                if child == control:
                    return ordinal
                ordinal += 1
            except Exception:
                continue
    except Exception:
        pass
    return 0


@dataclass
class ControlLocator:
    logical_control_id: str
    window_title: str = ""
    section: str = ""
    tab_breadcrumb: list[str] = field(default_factory=list)
    control_type: str = ""
    automation_id: str = ""
    class_name: str = ""
    structural_path: str = ""
    sibling_ordinal: int = 0
    field_label: str = ""
    runtime_id: str = ""
    rectangle: dict[str, int] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "logicalControlId": self.logical_control_id,
            "windowTitle": self.window_title,
            "section": self.section,
            "tabBreadcrumb": self.tab_breadcrumb,
            "controlType": self.control_type,
            "automationId": self.automation_id,
            "className": self.class_name,
            "structuralPath": self.structural_path,
            "siblingOrdinal": self.sibling_ordinal,
            "fieldLabel": self.field_label,
            "runtimeId": self.runtime_id,
            "rectangle": self.rectangle,
        }


def build_control_locator(
    control,
    *,
    window_title: str,
    section: str,
    tab_breadcrumb: list[str],
) -> ControlLocator:
    ctype = str(control.element_info.control_type or "Control")
    automation_id = str(control.element_info.automation_id or "").strip()
    class_name = str(control.element_info.class_name or "").strip()
    field_label = infer_nearby_label(control)
    structural_path = build_structural_path(control)
    ordinal = sibling_ordinal(control, ctype)
    runtime_id = ""
    try:
        runtime_id = str(control.element_info.runtime_id or "")
    except Exception:
        pass

    breadcrumb_slug = " > ".join(_slug(part) for part in tab_breadcrumb if part)
    label_slug = _slug(field_label) or _slug(control.window_text() or "") or f"{ctype.lower()}-{ordinal}"
    if automation_id:
        identity_tail = f"{ctype}[{automation_id}]"
    else:
        identity_tail = f"{ctype}[{ordinal}]"

    logical_parts = [_slug(section)]
    if breadcrumb_slug:
        logical_parts.append(breadcrumb_slug)
    logical_parts.append(f"{label_slug}::{identity_tail}")
    logical_control_id = " > ".join(part for part in logical_parts if part)

    rect = None
    try:
        r = control.rectangle()
        rect = {"left": r.left, "top": r.top, "right": r.right, "bottom": r.bottom}
    except Exception:
        pass

    return ControlLocator(
        logical_control_id=logical_control_id,
        window_title=window_title,
        section=section,
        tab_breadcrumb=list(tab_breadcrumb),
        control_type=ctype,
        automation_id=automation_id,
        class_name=class_name,
        structural_path=structural_path,
        sibling_ordinal=ordinal,
        field_label=field_label,
        runtime_id=runtime_id,
        rectangle=rect,
    )


def build_screen_id(
    *,
    window_title: str,
    section: str,
    tab_breadcrumb: list[str],
    dialog_title: str = "",
) -> str:
    parts = [_slug(window_title), _slug(section)]
    if tab_breadcrumb:
        parts.append(" > ".join(_slug(t) for t in tab_breadcrumb))
    if dialog_title:
        parts.append(f"dialog:{_slug(dialog_title)}")
    return "::".join(part for part in parts if part)
