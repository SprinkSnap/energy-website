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
    _label_matches_aliases,
    _normalize_label,
    _parent_path_lower,
    detect_current_section,
    navigate_to_section,
)

SCOPE_MODE_ACTIVE_VISIBLE_SECTION = "active_visible_section"

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
        "statusbar",
        "titlebar",
    }
)

_SCOPE_CONTAINER_TYPES = frozenset({"Pane", "Group", "Custom", "Tab"})

_CHROME_CONTROL_TYPES = frozenset(
    {
        "TitleBar",
        "MenuBar",
        "ToolBar",
        "StatusBar",
        "Menu",
        "ScrollBar",
    }
)

_SECTION_CONTENT_TYPES = frozenset(
    {
        "Edit",
        "Document",
        "ComboBox",
        "ListBox",
        "List",
        "CheckBox",
        "RadioButton",
        "Button",
        "Text",
        "Label",
        "Hyperlink",
    }
)

_PLAUSIBLE_INTERACTIVE_TYPES = frozenset(
    {
        "Edit",
        "Document",
        "ComboBox",
        "ListBox",
        "List",
        "CheckBox",
        "RadioButton",
        "Button",
    }
)


class SectionScopeIsolationError(RuntimeError):
    """Raised when section crawl cannot proceed safely (not narrow-root isolation)."""


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


def _ancestor_chain(control, limit: int = 24) -> list[Any]:
    chain: list[Any] = []
    node = control
    for _ in range(limit):
        try:
            chain.append(node)
            parent = node.parent()
            if parent is None or parent == node:
                break
            node = parent
        except Exception:
            break
    return chain


def _path_has_nav_hint(control) -> bool:
    path = _parent_path_lower(control)
    return any(hint in path for hint in _NAV_CONTAINER_HINTS)


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
        return section_tab_siblings >= 2
    except Exception:
        return False


def is_application_chrome(control) -> bool:
    """True for application frame chrome (menus, toolbars, title/status bars)."""
    ctype = _control_type(control)
    if ctype in _CHROME_CONTROL_TYPES:
        return True
    if _path_has_nav_hint(control):
        label = _normalize_label(_control_name(control))
        if ctype in {"ComboBox", "Edit", "Button"} and label:
            toolbar_hints = ("version", "file", "help", "print", "save", "open", "calculate")
            if any(hint in label for hint in toolbar_hints):
                return True
        if ctype in {"Pane", "Group", "Custom"}:
            return False
        if ctype in _SECTION_CONTENT_TYPES:
            return _path_has_nav_hint(control) and ctype in {"ComboBox", "Edit", "Button", "Text", "Label"}
    for ancestor in _ancestor_chain(control)[1:]:
        ancestor_type = _control_type(ancestor)
        if ancestor_type in _CHROME_CONTROL_TYPES:
            return True
        path = _parent_path_lower(ancestor)
        if "toolbar" in path or "menubar" in path or "statusbar" in path:
            return True
    return False


def is_main_navigation_control(control) -> bool:
    """True for HOT2000 main section navigation and global navigation controls."""
    ctype = _control_type(control)
    if is_main_section_navigation_tab(control):
        return True
    if ctype == "MenuItem":
        return True
    if ctype == "TabItem":
        label = _control_name(control)
        for section in PHASE2_SECTIONS:
            if _label_matches_aliases(label, desktop_nav_alias_set(section["id"])):
                return True
    if ctype in {"TreeItem", "ListItem"} and _path_has_nav_hint(control):
        return True
    label = _normalize_label(_control_name(control))
    if label and _path_has_nav_hint(control):
        for section in PHASE2_SECTIONS:
            if _label_matches_aliases(label, desktop_nav_alias_set(section["id"])):
                return True
    return False


def _section_signature_labels(section_id: str) -> set[str]:
    signatures = SECTION_PAGE_SIGNATURES.get(section_id, {})
    targets = {_normalize_label(item) for item in signatures.get("strong", [])}
    targets.update(_normalize_label(item) for item in signatures.get("medium", []))
    return targets


def _matches_section_signature(control, section_id: str) -> bool:
    name = _normalize_label(_control_name(control))
    if not name:
        return False
    return name in _section_signature_labels(section_id)


def is_section_content_control(control, section_id: str) -> bool:
    """True when a visible control belongs to active section page content."""
    try:
        if not control.is_visible():
            return False
    except Exception:
        return False
    if is_application_chrome(control):
        return False
    if is_main_navigation_control(control):
        return False
    ctype = _control_type(control)
    if ctype == "TabItem":
        return False
    if ctype in _SECTION_CONTENT_TYPES:
        return True
    if ctype in _SCOPE_CONTAINER_TYPES and _matches_section_signature(control, section_id):
        return True
    if _matches_section_signature(control, section_id):
        return True
    return False


def count_main_section_nav_tabs_in_subtree(root) -> int:
    count = 0
    try:
        for desc in root.descendants():
            if is_main_section_navigation_tab(desc):
                count += 1
    except Exception:
        pass
    return count


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


def _descendant_count(root) -> int:
    try:
        return sum(1 for _ in root.descendants())
    except Exception:
        return 0


def _signature_controls_inside(root, signatures: list[Any]) -> int:
    return sum(1 for control in signatures if _is_descendant_of(control, root))


def is_valid_section_scope_root(root, signatures: list[Any]) -> bool:
    """A valid narrow scope root contains section fields and excludes main section navigation."""
    if root is None:
        return False
    if count_main_section_nav_tabs_in_subtree(root) >= 2:
        return False
    if _signature_controls_inside(root, signatures) < 1:
        return False
    return True


def _collect_scope_candidates(start, signatures: list[Any]) -> list[Any]:
    candidates: list[Any] = []
    queue: list[Any] = [start]
    seen: set[int] = set()
    while queue:
        node = queue.pop(0)
        node_id = id(node)
        if node_id in seen:
            continue
        seen.add(node_id)
        if is_valid_section_scope_root(node, signatures):
            candidates.append(node)
        try:
            for child in node.children():
                if _control_type(child) in _SCOPE_CONTAINER_TYPES:
                    queue.append(child)
        except Exception:
            continue
    return candidates


def try_identify_narrow_section_root(
    window,
    section_id: str,
) -> tuple[Any | None, dict[str, Any]]:
    """Attempt to locate a narrow UI subtree. Returns None when unavailable (non-fatal)."""
    section = get_section_by_id(section_id)
    section_label = section["label"] if section else section_id
    evidence: dict[str, Any] = {
        "sectionId": section_id,
        "sectionLabel": section_label,
        "method": "signature_narrow_container",
        "narrowRootFound": False,
    }
    signatures = _signature_controls_for_section(window, section_id)
    evidence["signatureControlCount"] = len(signatures)
    evidence["signatureControls"] = [_control_name(control) for control in signatures[:20]]
    if not signatures:
        evidence["narrowRootFailureReason"] = "no_signature_controls_for_narrow_root"
        return None, evidence

    lca = _lowest_common_ancestor(signatures)
    if lca is None:
        evidence["narrowRootFailureReason"] = "no_common_ancestor"
        return None, evidence

    candidates = _collect_scope_candidates(lca, signatures)
    if not candidates:
        evidence["narrowRootFailureReason"] = "no_valid_narrow_root"
        evidence["lcaStructuralPath"] = build_structural_path(lca)
        evidence["mainNavTabsInLca"] = count_main_section_nav_tabs_in_subtree(lca)
        return None, evidence

    root = min(candidates, key=_descendant_count)
    evidence["narrowRootFound"] = True
    evidence["structuralPath"] = build_structural_path(root)
    evidence["controlType"] = _control_type(root)
    evidence["mainNavTabsInRoot"] = count_main_section_nav_tabs_in_subtree(root)
    evidence["signatureControlsInRoot"] = _signature_controls_inside(root, signatures)
    evidence["candidateRootCount"] = len(candidates)
    return root, evidence


def identify_section_content_root(window, section_id: str) -> tuple[Any, dict[str, Any]]:
    """Locate a narrow UI subtree when one exists. Raises only when signatures are absent."""
    root, evidence = try_identify_narrow_section_root(window, section_id)
    section = get_section_by_id(section_id)
    section_label = section["label"] if section else section_id
    if not evidence.get("signatureControlCount"):
        evidence["failureReason"] = "no_signature_controls"
        raise SectionScopeIsolationError(
            f"Section content scope could not be isolated for {section_label}: "
            "no signature controls found."
        )
    if root is None:
        evidence["failureReason"] = evidence.get("narrowRootFailureReason") or "no_valid_narrow_root"
        raise SectionScopeIsolationError(
            f"Section content scope could not be isolated for {section_label}: "
            "candidate roots contain main section navigation or lack signature fields."
        )
    return root, evidence


def _nearest_useful_container(control) -> Any | None:
    node = control
    for _ in range(16):
        try:
            ctype = _control_type(node)
            if ctype in _SCOPE_CONTAINER_TYPES:
                if not is_application_chrome(node) and not is_main_navigation_control(node):
                    if count_main_section_nav_tabs_in_subtree(node) < 2:
                        return node
            parent = node.parent()
            if parent is None or parent == node:
                break
            node = parent
        except Exception:
            break
    return None


def discover_section_scope_roots(window, section_id: str) -> list[Any]:
    """Collect optional per-group containers for signature controls."""
    signatures = _signature_controls_for_section(window, section_id)
    roots: list[Any] = []
    seen: set[int] = set()
    for control in signatures:
        container = _nearest_useful_container(control)
        if container is None:
            continue
        node_id = id(container)
        if node_id in seen:
            continue
        seen.add(node_id)
        roots.append(container)
    return roots


def verify_section_active(window, section_id: str) -> tuple[bool, Any, str | None]:
    """Verify the requested section is the active HOT2000 page."""
    detection = detect_current_section(window)
    if detection.section_id == section_id:
        if detection.confidence in {"high", "medium"}:
            return True, detection, None
        if detection.method in {"selected_navigation", "selected_tab", "selected_navigation+page_signature"}:
            return True, detection, None
    if detection.section_id and detection.section_id != section_id:
        if detection.confidence == "high" and detection.method in {
            "selected_navigation",
            "selected_tab",
            "selected_navigation+page_signature",
        }:
            return (
                False,
                detection,
                f"foreign section {detection.section_id} is selected (expected {section_id})",
            )
    signatures = _signature_controls_for_section(window, section_id)
    if signatures:
        return True, detection, None
    section = get_section_by_id(section_id)
    section_label = section["label"] if section else section_id
    return False, detection, f"cannot verify {section_label} is active"


@dataclass
class SectionScopeDiagnostics:
    requested_section_id: str = ""
    current_section_detection: dict[str, Any] = field(default_factory=dict)
    narrow_root_found: bool = False
    narrow_root_failure_reason: str | None = None
    scope_mode: str = SCOPE_MODE_ACTIVE_VISIBLE_SECTION
    visible_controls_total: int = 0
    section_content_controls_accepted: int = 0
    controls_rejected_as_navigation: int = 0
    controls_rejected_as_chrome: int = 0
    accepted_control_types: dict[str, int] = field(default_factory=dict)
    accepted_control_labels: list[str] = field(default_factory=list)
    section_scope_root_paths: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "requestedSectionId": self.requested_section_id,
            "currentSectionDetection": self.current_section_detection,
            "narrowRootFound": self.narrow_root_found,
            "narrowRootFailureReason": self.narrow_root_failure_reason,
            "scopeMode": self.scope_mode,
            "visibleControlsTotal": self.visible_controls_total,
            "sectionContentControlsAccepted": self.section_content_controls_accepted,
            "controlsRejectedAsNavigation": self.controls_rejected_as_navigation,
            "controlsRejectedAsChrome": self.controls_rejected_as_chrome,
            "acceptedControlTypes": self.accepted_control_types,
            "acceptedControlLabels": self.accepted_control_labels[:40],
            "sectionScopeRoots": self.section_scope_root_paths,
        }


def _control_in_any_root(control, roots: list[Any]) -> bool:
    if not roots:
        return True
    return any(_is_descendant_of(control, root) for root in roots)


def iter_section_content_controls(
    window,
    *,
    section_id: str,
    lock: SectionScopeLock | None = None,
    scope_root: Any | None = None,
    scope_roots: list[Any] | None = None,
    diagnostics: SectionScopeDiagnostics | None = None,
) -> Iterable[Any]:
    """Yield visible section-content controls using active-visible filtering."""
    roots = list(scope_roots or [])
    if scope_root is not None and scope_root not in roots:
        roots.insert(0, scope_root)
    seen: set[int] = set()
    try:
        for desc in window.descendants():
            try:
                if not desc.is_visible():
                    continue
                if diagnostics is not None:
                    diagnostics.visible_controls_total += 1
                node_id = id(desc)
                if node_id in seen:
                    continue
                if roots and not _control_in_any_root(desc, roots):
                    if not is_section_content_control(desc, section_id):
                        continue
                if is_application_chrome(desc):
                    if diagnostics is not None:
                        diagnostics.controls_rejected_as_chrome += 1
                    if lock is not None:
                        lock.foreign_section_controls_ignored += 1
                    continue
                if is_main_navigation_control(desc):
                    if diagnostics is not None:
                        diagnostics.controls_rejected_as_navigation += 1
                    if lock is not None:
                        lock.foreign_section_controls_ignored += 1
                    continue
                if not is_section_content_control(desc, section_id):
                    continue
                seen.add(node_id)
                if diagnostics is not None:
                    diagnostics.section_content_controls_accepted += 1
                    ctype = _control_type(desc)
                    diagnostics.accepted_control_types[ctype] = (
                        diagnostics.accepted_control_types.get(ctype, 0) + 1
                    )
                    label = _control_name(desc)
                    if label and len(diagnostics.accepted_control_labels) < 40:
                        diagnostics.accepted_control_labels.append(label)
                yield desc
            except Exception:
                continue
    except Exception:
        pass


def iter_scoped_descendants(
    scope_root,
    window,
    *,
    lock: SectionScopeLock | None = None,
    section_id: str | None = None,
) -> Iterable[Any]:
    """Backward-compatible scoped iterator — prefers active-visible when no narrow root."""
    if scope_root is None:
        section = section_id or (lock.section_id if lock is not None else "")
        if section:
            yield from iter_section_content_controls(
                window,
                section_id=section,
                lock=lock,
            )
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
                if _control_type(desc) == "TabItem":
                    if lock is not None:
                        lock.foreign_section_controls_ignored += 1
                    continue
                yield desc
            except Exception:
                continue
    except Exception:
        pass


def list_section_internal_tabs(
    scope_root,
    window,
    *,
    section_id: str | None = None,
    lock: SectionScopeLock | None = None,
) -> list[Any]:
    """Section-internal TabItems only — never main HOT2000 section navigation."""
    tabs: list[Any] = []
    section = section_id or (lock.section_id if lock is not None else "")
    iterator = (
        iter_section_content_controls(window, section_id=section, lock=lock, scope_root=scope_root)
        if section
        else window.descendants()
    )
    for desc in iterator:
        if _control_type(desc) != "TabItem":
            continue
        if is_main_section_navigation_tab(desc):
            continue
        tabs.append(desc)
    return tabs


def _has_plausible_section_content(controls: Iterable[Any]) -> bool:
    for control in controls:
        if _control_type(control) in _PLAUSIBLE_INTERACTIVE_TYPES:
            return True
    return False


@dataclass
class SectionScopeLock:
    section_id: str
    section_label: str
    structural_path: str = ""
    scope_root_control_type: str = ""
    established_at: str = field(default_factory=_now_iso)
    scope_mode: str = SCOPE_MODE_ACTIVE_VISIBLE_SECTION
    selected_section_verification: dict[str, Any] = field(default_factory=dict)
    narrow_root_found: bool = False
    narrow_root_failure_reason: str | None = None
    section_scope_root_paths: list[str] = field(default_factory=list)
    foreign_section_controls_ignored: int = 0
    foreign_section_actions_blocked: int = 0
    section_boundary_violations: int = 0
    section_restorations: int = 0

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "lockedSectionId": self.section_id,
            "lockedSectionLabel": self.section_label,
            "scopeMode": self.scope_mode,
            "selectedSectionVerification": self.selected_section_verification,
            "narrowRootFound": self.narrow_root_found,
            "narrowRootFailureReason": self.narrow_root_failure_reason,
            "sectionScopeRoots": self.section_scope_root_paths,
            "sectionLockEstablishedAt": self.established_at,
            "foreignSectionControlsIgnored": self.foreign_section_controls_ignored,
            "foreignSectionActionsBlocked": self.foreign_section_actions_blocked,
            "sectionBoundaryViolations": self.section_boundary_violations,
            "sectionRestorations": self.section_restorations,
        }
        if self.structural_path or self.scope_root_control_type:
            payload["lockedSectionRoot"] = {
                "structuralPath": self.structural_path,
                "controlType": self.scope_root_control_type,
            }
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SectionScopeLock:
        root = data.get("lockedSectionRoot") or {}
        roots = data.get("sectionScopeRoots") or []
        if isinstance(roots, str):
            roots = [roots]
        return cls(
            section_id=str(data.get("lockedSectionId") or data.get("sectionId") or ""),
            section_label=str(data.get("lockedSectionLabel") or data.get("sectionLabel") or ""),
            structural_path=str(root.get("structuralPath") or data.get("structuralPath") or ""),
            scope_root_control_type=str(root.get("controlType") or ""),
            established_at=str(data.get("sectionLockEstablishedAt") or _now_iso()),
            scope_mode=str(data.get("scopeMode") or SCOPE_MODE_ACTIVE_VISIBLE_SECTION),
            selected_section_verification=dict(data.get("selectedSectionVerification") or {}),
            narrow_root_found=bool(data.get("narrowRootFound")),
            narrow_root_failure_reason=data.get("narrowRootFailureReason"),
            section_scope_root_paths=[str(item) for item in roots],
            foreign_section_controls_ignored=int(data.get("foreignSectionControlsIgnored") or 0),
            foreign_section_actions_blocked=int(data.get("foreignSectionActionsBlocked") or 0),
            section_boundary_violations=int(data.get("sectionBoundaryViolations") or 0),
            section_restorations=int(data.get("sectionRestorations") or 0),
        )


def establish_section_scope_lock(
    window,
    section_id: str,
    section_label: str,
) -> tuple[SectionScopeLock, Any | None, dict[str, Any]]:
    """Establish ACTIVE_SELECTED_SECTION_SCOPE — narrow root optional."""
    active_ok, detection, active_reason = verify_section_active(window, section_id)
    if not active_ok:
        raise SectionScopeIsolationError(
            f"Section {section_label} is not verified active: {active_reason}"
        )

    narrow_root, narrow_evidence = try_identify_narrow_section_root(window, section_id)
    multi_roots = discover_section_scope_roots(window, section_id)

    diagnostics = SectionScopeDiagnostics(
        requested_section_id=section_id,
        current_section_detection=detection.to_dict(),
        narrow_root_found=bool(narrow_root),
        narrow_root_failure_reason=narrow_evidence.get("narrowRootFailureReason"),
        scope_mode=SCOPE_MODE_ACTIVE_VISIBLE_SECTION,
    )
    diagnostics.section_scope_root_paths = [
        build_structural_path(root) for root in multi_roots[:20]
    ]

    accepted_controls = list(
        iter_section_content_controls(
            window,
            section_id=section_id,
            scope_root=narrow_root,
            scope_roots=multi_roots,
            diagnostics=diagnostics,
        )
    )
    if not _has_plausible_section_content(accepted_controls):
        raise SectionScopeIsolationError(
            f"Active visible section discovery found no plausible content controls for {section_label}."
        )

    lock = SectionScopeLock(
        section_id=section_id,
        section_label=section_label,
        structural_path=str(narrow_evidence.get("structuralPath") or ""),
        scope_root_control_type=str(narrow_evidence.get("controlType") or ""),
        scope_mode=SCOPE_MODE_ACTIVE_VISIBLE_SECTION,
        selected_section_verification=detection.to_dict(),
        narrow_root_found=bool(narrow_root),
        narrow_root_failure_reason=narrow_evidence.get("narrowRootFailureReason"),
        section_scope_root_paths=diagnostics.section_scope_root_paths,
    )

    evidence = {
        **narrow_evidence,
        **diagnostics.to_dict(),
        "scopeMode": SCOPE_MODE_ACTIVE_VISIBLE_SECTION,
        "multiRootCount": len(multi_roots),
    }
    return lock, narrow_root, evidence


def verify_locked_section(window, lock: SectionScopeLock) -> tuple[bool, str | None]:
    """Verify locked section — only fail on positive foreign section selection."""
    detection = detect_current_section(window)
    if detection.section_id and detection.section_id != lock.section_id:
        if detection.confidence == "high" and detection.method in {
            "selected_navigation",
            "selected_tab",
            "selected_navigation+page_signature",
        }:
            lock.section_boundary_violations += 1
            return (
                False,
                f"foreign section {detection.section_id} positively selected "
                f"(locked {lock.section_id})",
            )
    return True, None


def restore_locked_section(window, lock: SectionScopeLock) -> bool:
    outcome = navigate_to_section(window, lock.section_id)
    if outcome.success:
        lock.section_restorations += 1
        return True
    lock.section_boundary_violations += 1
    return False
