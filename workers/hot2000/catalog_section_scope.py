"""Hard UI scope lock for Phase 2 section-scoped crawls."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable

from catalog_control_locator import build_structural_path
from catalog_phase2_sections import PHASE2_SECTIONS, desktop_nav_alias_set, get_section_by_id
from catalog_section_navigation import (
    SECTION_PAGE_SIGNATURES,
    _control_name,
    _control_type,
    _is_selected,
    _label_matches_aliases,
    _normalize_label,
    _parent_path_lower,
    detect_current_section,
    navigate_to_section,
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

_SCOPE_CONTAINER_TYPES = frozenset({"Pane", "Group", "Custom", "Tab", "Window"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_descendant_of(control, ancestor) -> bool:
    if control is None or ancestor is None:
        return False
    node = control
    for _ in range(32):
        try:
            if node == ancestor:
                return True
            parent = node.parent()
            if parent is None or parent == node:
                break
            node = parent
        except Exception:
            break
    return False


def is_main_section_navigation_tab(control) -> bool:
    """True when a TabItem belongs to HOT2000 main section navigation (General, Info, …)."""
    if _control_type(control) != "TabItem":
        return False
    label = _control_name(control)
    if not label:
        return False
    matches_phase2 = False
    for section in PHASE2_SECTIONS:
        if _label_matches_aliases(label, desktop_nav_alias_set(section["id"])):
            matches_phase2 = True
            break
    if not matches_phase2:
        return False
    path = _parent_path_lower(control)
    if any(hint in path for hint in _NAV_CONTAINER_HINTS):
        return True
    try:
        parent = control.parent()
        if parent is None:
            return False
        section_tab_siblings = 0
        for child in parent.children():
            if _control_type(child) != "TabItem":
                continue
            child_label = _control_name(child)
            for section in PHASE2_SECTIONS:
                if _label_matches_aliases(child_label, desktop_nav_alias_set(section["id"])):
                    section_tab_siblings += 1
                    break
        return section_tab_siblings >= 3
    except Exception:
        return False


def _signature_controls_for_section(window, section_id: str) -> list[Any]:
    signatures = SECTION_PAGE_SIGNATURES.get(section_id, {})
    targets = {_normalize_label(item) for item in signatures.get("strong", [])}
    targets.update(_normalize_label(item) for item in signatures.get("medium", []))
    if not targets:
        return []
    found: list[Any] = []
    try:
        for desc in window.descendants():
            if not desc.is_visible():
                continue
            if is_main_section_navigation_tab(desc):
                continue
            name = _normalize_label(_control_name(desc))
            if name and name in targets:
                found.append(desc)
    except Exception:
        pass
    return found


def _lowest_common_ancestor(controls: list[Any]) -> Any | None:
    if not controls:
        return None
    if len(controls) == 1:
        node = controls[0]
        for _ in range(16):
            try:
                ctype = _control_type(node)
                if ctype in _SCOPE_CONTAINER_TYPES:
                    return node
                parent = node.parent()
                if parent is None or parent == node:
                    break
                node = parent
            except Exception:
                break
        return controls[0]
    chains: list[list[Any]] = []
    for control in controls:
        chain: list[Any] = []
        node = control
        for _ in range(24):
            try:
                chain.append(node)
                parent = node.parent()
                if parent is None or parent == node:
                    break
                node = parent
            except Exception:
                break
        chains.append(list(reversed(chain)))
    if not chains:
        return None
    common: Any | None = None
    limit = min(len(chain) for chain in chains)
    for index in range(limit):
        candidate = chains[0][index]
        if all(chain[index] == candidate for chain in chains[1:]):
            common = candidate
        else:
            break
    return common


def identify_section_content_root(window, section_id: str) -> tuple[Any | None, dict[str, Any]]:
    """Locate the UI subtree that owns section-specific content fields."""
    evidence: dict[str, Any] = {"sectionId": section_id, "method": "signature_ancestor"}
    signatures = _signature_controls_for_section(window, section_id)
    evidence["signatureControlCount"] = len(signatures)
    if signatures:
        root = _lowest_common_ancestor(signatures)
        if root is not None:
            evidence["structuralPath"] = build_structural_path(root)
            evidence["controlType"] = _control_type(root)
            return root, evidence
    section = get_section_by_id(section_id)
    if section:
        try:
            for desc in window.descendants(control_type="TabItem"):
                if not _is_selected(desc):
                    continue
                label = _control_name(desc)
                if _label_matches_aliases(label, desktop_nav_alias_set(section_id)):
                    parent = desc.parent()
                    if parent is not None:
                        evidence["method"] = "selected_section_tab_parent"
                        evidence["selectedTab"] = label
                        evidence["structuralPath"] = build_structural_path(parent)
                        return parent, evidence
        except Exception:
            pass
    evidence["method"] = "window_fallback"
    return window, evidence


@dataclass
class SectionScopeLock:
    section_id: str
    section_label: str
    structural_path: str = ""
    scope_root_control_type: str = ""
    established_at: str = field(default_factory=_now_iso)
    foreign_section_controls_ignored: int = 0
    foreign_section_actions_blocked: int = 0
    section_boundary_violations: int = 0
    section_restorations: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "lockedSectionId": self.section_id,
            "lockedSectionLabel": self.section_label,
            "lockedSectionRoot": {
                "structuralPath": self.structural_path,
                "controlType": self.scope_root_control_type,
            },
            "sectionLockEstablishedAt": self.established_at,
            "foreignSectionControlsIgnored": self.foreign_section_controls_ignored,
            "foreignSectionActionsBlocked": self.foreign_section_actions_blocked,
            "sectionBoundaryViolations": self.section_boundary_violations,
            "sectionRestorations": self.section_restorations,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SectionScopeLock:
        root = data.get("lockedSectionRoot") or {}
        return cls(
            section_id=str(data.get("lockedSectionId") or data.get("sectionId") or ""),
            section_label=str(data.get("lockedSectionLabel") or data.get("sectionLabel") or ""),
            structural_path=str(root.get("structuralPath") or data.get("structuralPath") or ""),
            scope_root_control_type=str(root.get("controlType") or ""),
            established_at=str(data.get("sectionLockEstablishedAt") or _now_iso()),
            foreign_section_controls_ignored=int(data.get("foreignSectionControlsIgnored") or 0),
            foreign_section_actions_blocked=int(data.get("foreignSectionActionsBlocked") or 0),
            section_boundary_violations=int(data.get("sectionBoundaryViolations") or 0),
            section_restorations=int(data.get("sectionRestorations") or 0),
        )


def establish_section_scope_lock(
    window,
    section_id: str,
    section_label: str,
) -> tuple[SectionScopeLock, Any, dict[str, Any]]:
    root, evidence = identify_section_content_root(window, section_id)
    lock = SectionScopeLock(
        section_id=section_id,
        section_label=section_label,
        structural_path=str(evidence.get("structuralPath") or ""),
        scope_root_control_type=str(evidence.get("controlType") or ""),
    )
    return lock, root, evidence


def iter_scoped_descendants(
    scope_root,
    window,
    *,
    lock: SectionScopeLock | None = None,
) -> Iterable[Any]:
    """Yield visible descendants inside the locked section content subtree."""
    if scope_root is None:
        return
    try:
        for desc in scope_root.descendants():
            try:
                if not desc.is_visible():
                    continue
                if is_main_section_navigation_tab(desc):
                    if lock is not None:
                        lock.foreign_section_controls_ignored += 1
                    continue
                yield desc
            except Exception:
                continue
    except Exception:
        pass


def list_section_internal_tabs(scope_root, window) -> list[Any]:
    """Return TabItem controls inside the section content root (not main section nav)."""
    tabs: list[Any] = []
    for desc in iter_scoped_descendants(scope_root, window):
        if _control_type(desc) != "TabItem":
            continue
        if is_main_section_navigation_tab(desc):
            continue
        tabs.append(desc)
    return tabs


def verify_locked_section(window, lock: SectionScopeLock) -> tuple[bool, str | None]:
    detection = detect_current_section(window)
    if detection.section_id != lock.section_id:
        lock.section_boundary_violations += 1
        return False, f"current section {detection.section_id} != locked {lock.section_id}"
    if detection.confidence not in {"high", "medium"}:
        lock.section_boundary_violations += 1
        return False, f"low confidence section detection ({detection.confidence})"
    return True, None


def restore_locked_section(window, lock: SectionScopeLock) -> bool:
    outcome = navigate_to_section(window, lock.section_id)
    if outcome.success:
        lock.section_restorations += 1
        return True
    lock.section_boundary_violations += 1
    return False
