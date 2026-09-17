"""Navigate HOT2000 Desktop to a Phase 2 section without physical mouse movement."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

from catalog_control_locator import build_structural_path
from catalog_navigation import get_selected_tab_labels, wait_for_ui_stability
from catalog_phase2_sections import (
    PHASE2_SECTIONS,
    desktop_nav_alias_set,
    get_section_by_id,
)
from catalog_recorder import _infer_section_from_title
from catalog_ui_interaction import automatic_scan_mode, invoke_button, select_tab_item

_NAV_CONTROL_TYPES = frozenset(
    {
        "MenuItem",
        "TreeItem",
        "ListItem",
        "TabItem",
        "Button",
        "Hyperlink",
        "RadioButton",
    }
)

_CONTENT_CONTROL_TYPES = frozenset(
    {
        "Edit",
        "Document",
        "ComboBox",
        "List",
        "ListBox",
        "Text",
        "Label",
        "CheckBox",
    }
)

_NAV_CONTAINER_HINTS = frozenset(
    {
        "tree",
        "tab",
        "toolbar",
        "menubar",
        "navigation",
        "sidebar",
        "outline",
        "navigator",
    }
)

# Conservative visible-page signatures (UI evidence only, not XML mapping).
SECTION_PAGE_SIGNATURES: dict[str, dict[str, list[str]]] = {
    "general": {
        "strong": ["Ownership", "Client First Name", "Street Address", "Mailing Address"],
        "medium": ["Identification", "Evaluation", "City", "Province", "Postal Code"],
    },
    "weather": {
        "strong": ["Region", "Location", "Heating Degree Days"],
        "medium": ["Weather", "Degree Days", "Design Temperature"],
    },
    "info": {
        "strong": ["Builder", "Evaluator", "House Name"],
        "medium": ["Info", "Comments"],
    },
    "specifications": {
        "strong": ["Specifications", "Ceiling Height"],
        "medium": ["Foundation", "Exposed Floor"],
    },
}


def _normalize_label(label: str) -> str:
    text = re.sub(r"&", "", label or "").strip().lower()
    return re.sub(r"\s+", " ", text)


def _control_name(control) -> str:
    try:
        return (control.window_text() or control.element_info.name or "").strip()
    except Exception:
        return ""


def _control_type(control) -> str:
    try:
        return str(control.element_info.control_type)
    except Exception:
        return ""


def _is_selected(control) -> bool:
    try:
        if hasattr(control, "is_selected") and control.is_selected():
            return True
    except Exception:
        pass
    try:
        return bool(control.iface_selection_item.CurrentIsSelected)
    except Exception:
        return False


def _has_invoke_pattern(control) -> bool:
    try:
        return control.iface_invoke is not None
    except Exception:
        return False


def _has_selection_item_pattern(control) -> bool:
    try:
        return control.iface_selection_item is not None
    except Exception:
        return False


def _parent_path_lower(control) -> str:
    try:
        return build_structural_path(control).lower()
    except Exception:
        return ""


def _is_probable_navigation_control(control) -> bool:
    ctype = _control_type(control)
    if ctype in _CONTENT_CONTROL_TYPES:
        return False
    if ctype in _NAV_CONTROL_TYPES:
        return True
    path = _parent_path_lower(control)
    if any(hint in path for hint in _NAV_CONTAINER_HINTS):
        return True
    if _has_invoke_pattern(control) or _has_selection_item_pattern(control):
        return True
    return False


def _label_matches_aliases(label: str, aliases: set[str]) -> bool:
    normalized = _normalize_label(label)
    if not normalized:
        return False
    if normalized in aliases:
        return True
    for candidate in aliases:
        if candidate and (candidate in normalized or normalized in candidate):
            return True
    return False


def _collect_visible_labels(window) -> set[str]:
    labels: set[str] = set()
    try:
        for desc in window.descendants():
            try:
                if not desc.is_visible():
                    continue
                name = _control_name(desc)
                if name:
                    labels.add(_normalize_label(name))
                ctype = _control_type(desc)
                if ctype in {"ComboBox", "Edit", "Document", "List", "ListBox"}:
                    value = _control_name(desc)
                    if value:
                        labels.add(_normalize_label(value))
            except Exception:
                continue
    except Exception:
        pass
    return labels


def _score_page_signature(section_id: str, visible_labels: set[str]) -> tuple[int, list[str]]:
    signatures = SECTION_PAGE_SIGNATURES.get(section_id, {})
    score = 0
    evidence: list[str] = []
    for label in signatures.get("strong", []):
        if _normalize_label(label) in visible_labels:
            score += 3
            evidence.append(f"strong:{label}")
    for label in signatures.get("medium", []):
        if _normalize_label(label) in visible_labels:
            score += 1
            evidence.append(f"medium:{label}")
    return score, evidence


@dataclass
class SectionDetection:
    section_id: str | None
    confidence: str
    score: int
    method: str
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sectionId": self.section_id,
            "confidence": self.confidence,
            "score": self.score,
            "method": self.method,
            "evidence": self.evidence,
        }


@dataclass
class NavigationOutcome:
    success: bool
    result: str
    message: str | None = None
    detection: SectionDetection | None = None
    diagnostics: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "navigationResult": self.result,
            "message": self.message,
            "currentSectionDetection": self.detection.to_dict() if self.detection else None,
        }


def _detection_from_selected_nav(window) -> SectionDetection | None:
    best: tuple[str, str, int] | None = None
    try:
        for desc in window.descendants():
            ctype = _control_type(desc)
            if ctype not in {"TabItem", "TreeItem", "ListItem", "MenuItem", "RadioButton"}:
                continue
            if not _is_selected(desc):
                continue
            label = _control_name(desc)
            normalized = _normalize_label(label)
            for section in PHASE2_SECTIONS:
                aliases = desktop_nav_alias_set(section["id"])
                if _label_matches_aliases(label, aliases):
                    priority = {"TabItem": 0, "TreeItem": 1, "ListItem": 2, "MenuItem": 3}.get(ctype, 9)
                    if best is None or priority < best[2]:
                        best = (section["id"], label, priority)
    except Exception:
        return None
    if best is None:
        return None
    return SectionDetection(
        section_id=best[0],
        confidence="high",
        score=10,
        method="selected_navigation",
        evidence=[f"selected:{best[1]}"],
    )


def _detection_from_tabs(window) -> SectionDetection | None:
    tabs = get_selected_tab_labels(window)
    if not tabs:
        return None
    for tab in tabs:
        normalized = _normalize_label(tab)
        for section in PHASE2_SECTIONS:
            if normalized in desktop_nav_alias_set(section["id"]):
                return SectionDetection(
                    section_id=section["id"],
                    confidence="high",
                    score=8,
                    method="selected_tab",
                    evidence=[f"tab:{tab}"],
                )
    return None


def _detection_from_title(window) -> SectionDetection | None:
    try:
        title = window.window_text() or ""
    except Exception:
        return None
    inferred = _infer_section_from_title(title)
    if inferred in {"unknown", "envelope-components"}:
        return None
    return SectionDetection(
        section_id=inferred,
        confidence="low",
        score=1,
        method="window_title",
        evidence=[f"title:{title}"],
    )


def detect_current_section(window) -> SectionDetection:
    """Detect the active HOT2000 section using layered UI evidence."""
    selected = _detection_from_selected_nav(window)
    if selected and selected.confidence == "high":
        return selected

    tabs = _detection_from_tabs(window)
    if tabs and tabs.confidence == "high":
        return tabs

    visible_labels = _collect_visible_labels(window)
    best_page: SectionDetection | None = None
    for section in PHASE2_SECTIONS:
        score, evidence = _score_page_signature(section["id"], visible_labels)
        if score <= 0:
            continue
        confidence = "high" if score >= 3 and any(item.startswith("strong:") for item in evidence) else "medium"
        candidate = SectionDetection(
            section_id=section["id"],
            confidence=confidence,
            score=score,
            method="page_signature",
            evidence=evidence,
        )
        if best_page is None or candidate.score > best_page.score:
            best_page = candidate

    if best_page and best_page.confidence in {"high", "medium"} and best_page.score >= 3:
        if selected and selected.section_id == best_page.section_id:
            best_page.evidence.extend(selected.evidence)
            best_page.method = "selected_navigation+page_signature"
            best_page.confidence = "high"
        return best_page

    if selected:
        return selected
    if tabs:
        return tabs

    title = _detection_from_title(window)
    if title and best_page and best_page.section_id == title.section_id:
        best_page.evidence.extend(title.evidence)
        best_page.score += title.score
        if best_page.score >= 3:
            best_page.confidence = "medium"
            return best_page

    if best_page and best_page.score >= 3:
        return best_page
    if title:
        return title
    if best_page:
        return best_page

    return SectionDetection(section_id=None, confidence="none", score=0, method="unknown", evidence=[])


def _serialize_candidate(control) -> dict[str, Any]:
    return {
        "controlType": _control_type(control),
        "name": _control_name(control),
        "automationId": str(getattr(control.element_info, "automation_id", "") or ""),
        "className": str(getattr(control.element_info, "class_name", "") or ""),
        "selected": _is_selected(control),
        "enabled": bool(control.is_enabled()) if hasattr(control, "is_enabled") else None,
        "visible": bool(control.is_visible()) if hasattr(control, "is_visible") else None,
        "structuralPath": build_structural_path(control),
        "probableNavigation": _is_probable_navigation_control(control),
        "hasInvokePattern": _has_invoke_pattern(control),
        "hasSelectionItemPattern": _has_selection_item_pattern(control),
    }


def capture_navigation_snapshot(window) -> dict[str, Any]:
    """Capture lightweight navigation diagnostics before attempting section activation."""
    try:
        window_title = window.window_text() or ""
    except Exception:
        window_title = ""

    selected_tabs = get_selected_tab_labels(window)
    current_detection = detect_current_section(window)
    candidates: list[dict[str, Any]] = []
    selected_items: list[dict[str, Any]] = []

    try:
        for desc in window.descendants():
            try:
                if not desc.is_visible():
                    continue
                ctype = _control_type(desc)
                if ctype in {"TabItem", "TreeItem", "ListItem", "MenuItem"} and _is_selected(desc):
                    selected_items.append(_serialize_candidate(desc))
                if ctype in _NAV_CONTROL_TYPES or _is_probable_navigation_control(desc):
                    candidates.append(_serialize_candidate(desc))
            except Exception:
                continue
    except Exception:
        pass

    return {
        "windowTitle": window_title,
        "selectedTabs": selected_tabs,
        "currentSectionDetection": current_detection.to_dict(),
        "selectedNavigationItems": selected_items,
        "candidateControls": candidates[:200],
    }


def _candidate_score(control, aliases: set[str]) -> int:
    label = _control_name(control)
    if not _label_matches_aliases(label, aliases):
        return -1
    ctype = _control_type(control)
    if ctype in _CONTENT_CONTROL_TYPES:
        return -100
    if not _is_probable_navigation_control(control):
        return -50
    score = {
        "TabItem": 100,
        "TreeItem": 95,
        "ListItem": 90,
        "MenuItem": 85,
        "RadioButton": 70,
        "Button": 60,
        "Hyperlink": 55,
    }.get(ctype, 40)
    path = _parent_path_lower(control)
    if any(hint in path for hint in _NAV_CONTAINER_HINTS):
        score += 15
    if _is_selected(control):
        score += 25
    if _has_selection_item_pattern(control):
        score += 5
    if _has_invoke_pattern(control):
        score += 3
    return score


def _find_navigation_candidates(window, section_id: str) -> list[tuple[Any, str, int]]:
    aliases = desktop_nav_alias_set(section_id)
    matches: list[tuple[Any, str, int]] = []
    try:
        for desc in window.descendants():
            try:
                if not desc.is_visible() or not desc.is_enabled():
                    continue
                score = _candidate_score(desc, aliases)
                if score < 0:
                    continue
                matches.append((desc, _control_type(desc), score))
            except Exception:
                continue
    except Exception:
        return []
    matches.sort(key=lambda item: item[2], reverse=True)
    return matches


def _activate_navigation_control(control, control_type: str) -> tuple[bool, str, str]:
    label = _control_name(control)
    if control_type == "TabItem":
        ok, err = select_tab_item(control)
        return ok, err or "", label
    if control_type in {"TreeItem", "ListItem", "MenuItem", "Hyperlink", "RadioButton"}:
        try:
            control.select()
            return True, "", label
        except Exception:
            pass
        try:
            control.iface_selection_item.Select()
            return True, "", label
        except Exception:
            pass
        if control_type == "MenuItem":
            try:
                control.invoke()
                return True, "", label
            except Exception as exc:
                if automatic_scan_mode():
                    try:
                        control.set_focus()
                        control.type_keys("{ENTER}")
                        return True, "", label
                    except Exception as inner:
                        return False, str(inner), label
                return False, str(exc), label
        if automatic_scan_mode():
            try:
                control.set_focus()
                control.type_keys("{ENTER}")
                return True, "", label
            except Exception as inner:
                return False, str(inner), label
        return False, "selection failed", label
    if control_type == "Button":
        ok, err = invoke_button(control)
        return ok, err or "", label
    if _has_invoke_pattern(control):
        try:
            control.invoke()
            return True, "", label
        except Exception as exc:
            return False, str(exc), label
    return False, f"unsupported navigation control type: {control_type}", label


def _is_on_target_section(detection: SectionDetection, section_id: str) -> bool:
    if detection.section_id != section_id:
        return False
    if detection.confidence == "high":
        return True
    if detection.confidence == "medium" and detection.score >= 3:
        return True
    return False


def navigate_to_section(
    window,
    section_id: str,
    *,
    progress: Callable[[str], None] | None = None,
) -> NavigationOutcome:
    """Navigate to a section or confirm it is already active."""
    section = get_section_by_id(section_id)
    if not section:
        return NavigationOutcome(False, "failed", f"unknown section id: {section_id}")

    section_label = section["label"]
    aliases = sorted(desktop_nav_alias_set(section_id))
    snapshot = capture_navigation_snapshot(window)
    diagnostics: dict[str, Any] = {
        "requestedSectionId": section_id,
        "requestedSectionLabel": section_label,
        "attemptedAliases": aliases,
        **snapshot,
        "activationAttempts": [],
    }

    if progress:
        progress(f"{section_label}: Detecting current HOT2000 section…")

    current = detect_current_section(window)
    diagnostics["currentSectionDetection"] = current.to_dict()

    if _is_on_target_section(current, section_id):
        if progress:
            progress(f"{section_label}: Already on selected section — beginning control discovery…")
        return NavigationOutcome(
            True,
            "already_active",
            "section already active",
            detection=current,
            diagnostics=diagnostics,
        )

    if progress:
        progress(f"{section_label}: Searching HOT2000 navigation…")

    candidates = _find_navigation_candidates(window, section_id)
    diagnostics["candidateControls"] = [
        _serialize_candidate(control) for control, _, score in candidates[:40]
    ]
    diagnostics["candidateScores"] = [
        {"name": _control_name(control), "controlType": ctype, "score": score}
        for control, ctype, score in candidates[:40]
    ]

    if not candidates:
        diagnostics["failureReason"] = "navigation control not found"
        return NavigationOutcome(
            False,
            "failed",
            f"navigation control not found for aliases: {aliases}",
            detection=current,
            diagnostics=diagnostics,
        )

    last_unverified: NavigationOutcome | None = None
    for control, ctype, score in candidates:
        label = _control_name(control)
        if _is_selected(control) and _label_matches_aliases(label, desktop_nav_alias_set(section_id)):
            wait_for_ui_stability(window)
            verified = detect_current_section(window)
            if _is_on_target_section(verified, section_id):
                if progress:
                    progress(f"{section_label}: Already on selected section — beginning control discovery…")
                return NavigationOutcome(
                    True,
                    "already_active",
                    "selected navigation control already active",
                    detection=verified,
                    diagnostics=diagnostics,
                )

        if progress:
            progress(f"{section_label}: Activating navigation control: {label}")

        ok, err, activated_label = _activate_navigation_control(control, ctype)
        diagnostics["activationAttempts"].append(
            {
                "controlType": ctype,
                "name": activated_label,
                "score": score,
                "success": ok,
                "error": err or None,
            }
        )
        if not ok:
            continue

        wait_for_ui_stability(window)
        verified = detect_current_section(window)
        if _is_on_target_section(verified, section_id):
            if progress:
                progress(f"{section_label}: Section verified — beginning control discovery…")
            return NavigationOutcome(
                True,
                "activated",
                f"activated navigation control: {activated_label}",
                detection=verified,
                diagnostics=diagnostics,
            )

        last_unverified = NavigationOutcome(
            False,
            "activation_unverified",
            f"activation of '{activated_label}' did not verify section {section_label}",
            detection=verified,
            diagnostics=diagnostics,
        )

    if last_unverified:
        diagnostics["failureReason"] = "activation_unverified"
        return last_unverified

    diagnostics["failureReason"] = "navigation activation failed"
    return NavigationOutcome(
        False,
        "failed",
        f"could not activate navigation for section {section_label}",
        detection=current,
        diagnostics=diagnostics,
    )


def write_navigation_diagnostics(raw_dir, diagnostics: dict[str, Any]) -> Path:
    from pathlib import Path

    path = Path(raw_dir) / "section-navigation-diagnostics.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json_dumps(diagnostics), encoding="utf-8")
    return path


def json_dumps(payload: dict[str, Any]) -> str:
    import json

    return json.dumps(payload, indent=2) + "\n"


# Backward-compatible helper used by older tests.
def current_section_id(window) -> str | None:
    return detect_current_section(window).section_id
