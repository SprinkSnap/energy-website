"""
HOT2000 Desktop catalog recorder — Windows UI Automation capture.

Uses the shared HOT2000 lifecycle from hot2000_lifecycle.py.
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from catalog_models import (
    CAPTURE_VERSION,
    RECORDER_VERSION,
    CapturedControl,
    DropdownOption,
    SectionCapture,
)
from hot2000_lifecycle import (
    Hot2000Session,
    close_hot2000,
    detect_hot2000_version,
    open_h2k_fixture,
    wait_for_model_ready,
)

ProgressFn = Callable[[str, str, str | None], None]

COMBO_TYPES = frozenset({"ComboBox", "List", "ListBox"})
TEXT_TYPES = frozenset({"Edit", "Document"})
CHECK_TYPES = frozenset({"CheckBox"})
RADIO_TYPES = frozenset({"RadioButton"})
STATIC_TYPES = frozenset({"Text", "Label"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _rect_dict(control) -> dict[str, int] | None:
    try:
        rect = control.rectangle()
        return {
            "left": int(rect.left),
            "top": int(rect.top),
            "right": int(rect.right),
            "bottom": int(rect.bottom),
        }
    except Exception:
        return None


def _control_patterns(control) -> list[str]:
    patterns: list[str] = []
    for name in (
        "Value",
        "Selection",
        "Toggle",
        "ExpandCollapse",
        "Invoke",
        "RangeValue",
        "Text",
    ):
        try:
            iface = control.iface_patterns.get_pattern(name)  # type: ignore[attr-defined]
            if iface:
                patterns.append(name)
        except Exception:
            pass
    return patterns


def _infer_section_from_title(title: str) -> str:
    normalized = title.strip().lower()
    mapping = {
        "general": "general",
        "weather": "weather",
        "specifications": "specifications",
        "tightness": "tightness",
        "fuel": "fuel",
        "codes": "codes",
        "temperatures": "temperatures",
        "base loads": "base-loads",
        "generation": "generation",
        "natural air infiltration": "natural-air-infiltration",
        "ventilation": "ventilation",
        "heating": "heating-cooling",
        "cooling": "heating-cooling",
        "domestic hot water": "domestic-hot-water",
        "program": "program",
        "envelope": "envelope-components",
    }
    for key, section in mapping.items():
        if key in normalized:
            return section
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return slug or "unknown"


def _collect_labels(descendants) -> list[tuple[Any, str, dict[str, int] | None]]:
    labels: list[tuple[Any, str, dict[str, int] | None]] = []
    for desc in descendants:
        try:
            ctype = desc.element_info.control_type
            if ctype not in STATIC_TYPES:
                continue
            name = _safe_str(desc.window_text()) or _safe_str(desc.element_info.name)
            if not name:
                continue
            labels.append((desc, name, _rect_dict(desc)))
        except Exception:
            continue
    return labels


def _associate_label(
    control,
    labels: list[tuple[Any, str, dict[str, int] | None]],
) -> tuple[str | None, str | None]:
    rect = _rect_dict(control)
    if not rect:
        return None, None
    best_name = None
    best_score = -1
    for _label_ctrl, name, label_rect in labels:
        if not label_rect:
            continue
        # Prefer labels to the left or above the control.
        left_of = label_rect["right"] <= rect["left"] + 8
        above = label_rect["bottom"] <= rect["top"] + 8
        if not (left_of or above):
            continue
        vertical_overlap = min(rect["bottom"], label_rect["bottom"]) - max(
            rect["top"], label_rect["top"]
        )
        horizontal_gap = rect["left"] - label_rect["right"] if left_of else 9999
        vertical_gap = rect["top"] - label_rect["bottom"] if above else 9999
        score = 0
        if left_of and vertical_overlap > 0:
            score += 100 - min(horizontal_gap, 100)
        if above:
            score += 80 - min(vertical_gap, 80)
        if score > best_score:
            best_score = score
            best_name = name
    if best_name and best_score >= 20:
        confidence = "high" if best_score >= 60 else "medium"
        return best_name, confidence
    return None, None


def _read_value(control, ctype: str) -> str | None:
    try:
        if ctype in COMBO_TYPES:
            return _safe_str(control.window_text())
        if ctype in CHECK_TYPES or ctype in RADIO_TYPES:
            try:
                return "true" if control.get_toggle_state() == 1 else "false"
            except Exception:
                return _safe_str(control.window_text())
        return _safe_str(control.get_value()) or _safe_str(control.window_text())
    except Exception:
        return _safe_str(control.window_text())


def _enumerate_combo_options(control, ctype: str) -> tuple[list[DropdownOption], list[str]]:
    warnings: list[str] = []
    options: list[DropdownOption] = []
    original = _read_value(control)

    try:
        control.expand()
        time.sleep(0.2)
    except Exception:
        pass

    try:
        items = control.descendants(control_type="ListItem")
        if not items:
            items = control.descendants(control_type="List")
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
    except Exception as exc:
        warnings.append(f"Could not enumerate dropdown options: {exc}")

    if original:
        try:
            control.select(original)
        except Exception:
            try:
                control.collapse()
            except Exception:
                pass
    else:
        try:
            control.collapse()
        except Exception:
            pass

    return options, warnings


def _capture_control(
    control,
    index: int,
    labels: list[tuple[Any, str, dict[str, int] | None]],
    section: str,
    window_title: str,
) -> CapturedControl | dict[str, Any]:
    try:
        info = control.element_info
        ctype = str(info.control_type)
        name = _safe_str(control.window_text()) or _safe_str(info.name)
        automation_id = _safe_str(info.automation_id)
        class_name = _safe_str(info.class_name)
        label, label_confidence = _associate_label(control, labels)
        value = _read_value(control, ctype)
        patterns = _control_patterns(control)
        stable_id = automation_id or f"{ctype}:{class_name}:{name}:{index}"

        captured = CapturedControl(
            stable_id=stable_id,
            control_type=ctype,
            uia_control_type=ctype,
            automation_id=automation_id,
            hwnd=getattr(control, "handle", None),
            class_name=class_name,
            name=name,
            label=label,
            label_confidence=label_confidence,
            value=value,
            enabled=bool(control.is_enabled()) if hasattr(control, "is_enabled") else None,
            disabled=not control.is_enabled() if hasattr(control, "is_enabled") else None,
            visible=bool(control.is_visible()) if hasattr(control, "is_visible") else None,
            focusable=bool(control.is_keyboard_focusable())
            if hasattr(control, "is_keyboard_focusable")
            else None,
            rectangle=_rect_dict(control),
            patterns=patterns,
            section=section,
            order=index,
        )

        if ctype in CHECK_TYPES:
            try:
                captured.checked = control.get_toggle_state() == 1
            except Exception:
                pass
        if ctype in RADIO_TYPES:
            try:
                captured.selected = control.get_toggle_state() == 1
            except Exception:
                pass
        if ctype in COMBO_TYPES:
            options, warnings = _enumerate_combo_options(control, ctype)
            captured.options = options
            captured.warnings.extend(warnings)

        return captured
    except Exception as exc:
        return {
            "stableId": f"inaccessible:{index}",
            "controlType": "unknown",
            "verification": "inaccessible",
            "error": str(exc),
            "section": section,
            "windowTitle": window_title,
        }


def _desktop_window():
    from pywinauto import Desktop

    return Desktop(backend="uia")


def capture_current_window(
    session: Hot2000Session,
    worker_id: str,
    *,
    section_hint: str | None = None,
) -> SectionCapture:
    """Capture all accessible controls on the current HOT2000 window."""
    if not session.main_hwnd:
        raise RuntimeError("HOT2000 session has no main window.")

    desktop = _desktop_window()
    window = desktop.window(handle=session.main_hwnd)
    window_title = window.window_text()
    section = section_hint or _infer_section_from_title(window_title)

    capture = SectionCapture(
        capture_version=CAPTURE_VERSION,
        recorder_version=RECORDER_VERSION,
        hot2000_version=detect_hot2000_version(),
        captured_at=_now_iso(),
        worker=worker_id,
        section=section,
        window_title=window_title,
    )

    descendants = list(window.descendants())
    labels = _collect_labels(descendants)
    order = 0
    for desc in descendants:
        try:
            ctype = desc.element_info.control_type
            if ctype in STATIC_TYPES:
                continue
            if ctype in {"Pane", "Window", "TitleBar", "MenuBar", "ToolBar"}:
                continue
            if not desc.is_visible():
                continue
            result = _capture_control(desc, order, labels, section, window_title)
            order += 1
            if isinstance(result, CapturedControl):
                capture.controls.append(result)
            else:
                capture.inaccessible_controls.append(result)
        except Exception as exc:
            capture.inaccessible_controls.append(
                {
                    "stableId": f"inaccessible:{order}",
                    "verification": "inaccessible",
                    "error": str(exc),
                    "section": section,
                }
            )
            order += 1

    return capture


def _save_incremental(job_dir: Path, capture: SectionCapture) -> Path:
    raw_dir = job_dir / "raw-desktop"
    raw_dir.mkdir(parents=True, exist_ok=True)
    section_file = raw_dir / f"{capture.section}.json"
    section_file.write_text(
        json.dumps(capture.to_dict(), indent=2) + "\n",
        encoding="utf-8",
    )
    manifest_path = raw_dir / "manifest.json"
    manifest: dict[str, Any] = {
        "captureVersion": CAPTURE_VERSION,
        "recorderVersion": RECORDER_VERSION,
        "hot2000Version": capture.hot2000_version,
        "lastCapturedAt": capture.captured_at,
        "worker": capture.worker,
        "sections": {},
    }
    if manifest_path.is_file():
        try:
            manifest.update(json.loads(manifest_path.read_text(encoding="utf-8")))
        except Exception:
            pass
    sections = manifest.setdefault("sections", {})
    if isinstance(sections, dict):
        sections[capture.section] = {
            "file": section_file.name,
            "capturedAt": capture.captured_at,
            "controls": len(capture.controls),
        }
    manifest["lastCapturedAt"] = capture.captured_at
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return section_file


def _summarize_capture(capture: SectionCapture) -> dict[str, Any]:
    text_fields = sum(1 for c in capture.controls if c.control_type in TEXT_TYPES)
    numeric_fields = sum(
        1
        for c in capture.controls
        if c.control_type in TEXT_TYPES and c.value and re.match(r"^-?\d", c.value)
    )
    checkboxes = sum(1 for c in capture.controls if c.control_type in CHECK_TYPES)
    radio_buttons = sum(1 for c in capture.controls if c.control_type in RADIO_TYPES)
    combo_boxes = sum(1 for c in capture.controls if c.control_type in COMBO_TYPES)
    dropdown_options = sum(len(c.options) for c in capture.controls)
    return {
        "section": capture.section,
        "windowTitle": capture.window_title,
        "windowsDiscovered": 1,
        "controlsDiscovered": len(capture.controls),
        "textFields": text_fields,
        "numericFields": numeric_fields,
        "checkboxes": checkboxes,
        "radioButtons": radio_buttons,
        "comboBoxes": combo_boxes,
        "dropdownOptions": dropdown_options,
        "inaccessibleControls": len(capture.inaccessible_controls),
        "ambiguousControls": 0,
        "capturedAt": capture.captured_at,
        "hot2000Version": capture.hot2000_version,
        "workerId": capture.worker,
    }


def _default_control_check() -> str:
    return "running"


def run_catalog_capture(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    *,
    mode: str = "catalog_capture",
    control_check: Callable[[], str] | None = None,
) -> tuple[str, dict[str, Any]]:
    """Launch HOT2000 and run automatic full scan (Phase 2)."""
    from catalog_auto_scan import run_automatic_full_scan

    check = control_check or _default_control_check
    return run_automatic_full_scan(
        job_id,
        job_dir,
        worker_id,
        progress,
        check,
        resume=mode == "catalog_resume",
        allow_medium_confidence=True,
    )


def run_catalog_capture_screen(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    *,
    control_check: Callable[[], str] | None = None,
) -> tuple[str, dict[str, Any]]:
    """Guided capture of the current HOT2000 screen merged into scan state."""
    from catalog_auto_scan import run_guided_capture_merge

    check = control_check or _default_control_check
    return run_guided_capture_merge(job_id, job_dir, worker_id, progress, check)


def run_catalog_retry_inaccessible(
    job_id: str,
    job_dir: Path,
    worker_id: str,
    progress: ProgressFn,
    *,
    control_check: Callable[[], str] | None = None,
) -> tuple[str, dict[str, Any]]:
    from catalog_auto_scan import retry_inaccessible_controls

    check = control_check or _default_control_check
    return retry_inaccessible_controls(job_id, job_dir, worker_id, progress, check)
