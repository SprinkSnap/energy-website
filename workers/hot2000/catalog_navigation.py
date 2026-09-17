"""
Safe navigation engine for HOT2000 Desktop catalog scanning.

Classifies controls, fingerprints screens, stabilizes UI, and performs safe navigation.
"""

from __future__ import annotations

import hashlib
import re
import time
from dataclasses import dataclass, field
from typing import Any

# Safety limits
MAX_NAV_DEPTH = 12
MAX_VISITS_PER_SCREEN = 3
MAX_ACTION_RETRIES = 2
MAX_DIALOG_DEPTH = 6
UI_STABILIZE_TIMEOUT_S = 5.0
UI_STABILIZE_LONG_TIMEOUT_S = 15.0
UI_STABILIZE_POLL_S = 0.15
UI_STABILIZE_STABLE_POLLS = 3

SAFE_CLASSIFICATIONS = frozenset(
    {
        "SAFE_NAVIGATION",
        "SAFE_DIALOG_OPEN",
        "SAFE_UI_REVEAL",
        "SAFE_TAB",
        "SAFE_MENU",
    }
)

BLOCKED_CLASSIFICATIONS = frozenset(
    {
        "MUTATING",
        "MUTATING_REVERSIBLE",
        "DESTRUCTIVE",
        "SAVE",
        "CALCULATE",
        "REPORT",
        "CLOSE",
        "UNKNOWN",
    }
)

DESTRUCTIVE_WORDS = frozenset(
    {
        "delete",
        "remove",
        "reset",
        "clear",
        "calculate",
        "save",
        "save as",
        "apply",
        "import",
        "export",
        "new file",
        "new",
        "open",
        "close file",
        "exit",
        "quit",
        "add component",
        "remove component",
        "replace",
        "copy",
        "paste",
        "run simulation",
        "print",
        "ok",
    }
)

MUTATING_WORDS = frozenset(
    {
        "add",
        "insert",
        "create",
        "edit",
        "modify",
        "update",
        "submit",
    }
)

SAFE_NAV_CONTROL_TYPES = frozenset(
    {
        "TabItem",
        "TreeItem",
        "ListItem",
        "Hyperlink",
        "MenuItem",
    }
)

SAFE_BUTTON_WORDS = frozenset(
    {
        "next",
        "back",
        "previous",
        "details",
        "properties",
        "view",
        "show",
        "open",
        "house",
        "systems",
        "program",
        "general",
        "weather",
        "specifications",
        "fuel",
        "codes",
        "temperatures",
        "ventilation",
        "heating",
        "cooling",
        "domestic hot water",
        "envelope",
        "components",
        "base loads",
        "generation",
        "tightness",
        "infiltration",
    }
)

SAFE_MENU_PREFIXES = frozenset(
    {
        "house",
        "systems",
        "program",
        "view",
        "window",
        "component",
        "envelope",
    }
)

BLOCKED_MENU_WORDS = frozenset(
    {
        "new",
        "open",
        "save",
        "save as",
        "print",
        "exit",
        "calculate",
        "import",
        "export",
        "delete",
    }
)

SKIP_CAPTURE_TYPES = frozenset(
    {"Pane", "Window", "TitleBar", "MenuBar", "ToolBar", "Text", "Label"}
)


def _safe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalized_label(control) -> str:
    try:
        info = control.element_info
        return (
            _safe_str(control.window_text())
            or _safe_str(info.name)
            or _safe_str(info.automation_id)
            or ""
        ).strip()
    except Exception:
        return ""


@dataclass
class NavigationTarget:
    label: str
    control_type: str
    classification: str
    confidence: str
    automation_id: str | None = None
    class_name: str | None = None
    control_ref: Any = None
    parent_path: list[str] = field(default_factory=list)
    depth: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "controlType": self.control_type,
            "classification": self.classification,
            "confidence": self.confidence,
            "automationId": self.automation_id,
            "className": self.class_name,
            "parentPath": self.parent_path,
            "depth": self.depth,
        }


def classify_button(control) -> str:
    """Explicit button categories for crawler safety."""
    classification, confidence = classify_action(control, context="button")
    label = _normalized_label(control).lower()
    combined = f"{label} {getattr(control.element_info, 'automation_id', '') or ''}".lower()

    if any(word in combined for word in ("delete", "remove", "reset", "clear")):
        return "DESTRUCTIVE"
    if any(word in combined for word in ("save", "apply")):
        return "SAVE"
    if "calculate" in combined:
        return "CALCULATE"
    if "print" in combined or "report" in combined:
        return "REPORT"
    if any(word in combined for word in ("exit", "quit", "close")):
        return "CLOSE"
    if any(word in combined for word in ("add", "insert", "create")):
        return "MUTATING_REVERSIBLE"
    if classification == "SAFE_DIALOG_OPEN":
        return "SAFE_DIALOG_OPEN"
    if classification in {"SAFE_NAVIGATION", "SAFE_TAB", "SAFE_MENU"}:
        return "SAFE_NAVIGATION"
    if any(word in combined for word in ("advanced", "details", "more", "properties", "view")):
        return "SAFE_UI_REVEAL"
    if classification == "MUTATING":
        return "MUTATING_REVERSIBLE"
    return "UNKNOWN"


def classify_action(
    control,
    *,
    context: str = "main",
) -> tuple[str, str]:
    """Return (classification, confidence)."""
    try:
        ctype = str(control.element_info.control_type)
    except Exception:
        return "UNKNOWN", "low"

    label = _normalized_label(control).lower()
    automation_id = _safe_str(getattr(control.element_info, "automation_id", None)) or ""
    combined = f"{label} {automation_id.lower()}".strip()

    for word in DESTRUCTIVE_WORDS:
        if word in combined:
            if word in {"open", "new"} and any(
                safe in combined for safe in ("details", "properties", "view")
            ):
                continue
            return "DESTRUCTIVE", "high"

    for word in MUTATING_WORDS:
        if word in combined:
            return "MUTATING", "medium"

    if ctype == "TabItem":
        return "SAFE_TAB", "high"

    if ctype in {"TreeItem", "ListItem"}:
        return "SAFE_NAVIGATION", "high"

    if ctype == "MenuItem":
        if any(word in combined for word in BLOCKED_MENU_WORDS):
            return "DESTRUCTIVE", "high"
        if any(combined.startswith(prefix) for prefix in SAFE_MENU_PREFIXES):
            return "SAFE_MENU", "medium"
        return "UNKNOWN", "low"

    if ctype == "Button" or ctype == "SplitButton":
        if any(word in combined for word in SAFE_BUTTON_WORDS):
            if any(word in combined for word in ("delete", "remove", "save", "calculate")):
                return "DESTRUCTIVE", "high"
            if any(word in combined for word in ("details", "properties", "view", "open")):
                return "SAFE_DIALOG_OPEN", "medium"
            return "SAFE_NAVIGATION", "medium"
        if label in {"...", "…"}:
            return "SAFE_DIALOG_OPEN", "low"
        return "UNKNOWN", "low"

    if ctype == "Hyperlink":
        return "SAFE_NAVIGATION", "medium"

    if ctype in SAFE_NAV_CONTROL_TYPES:
        return "SAFE_NAVIGATION", "medium"

    if context == "dialog" and ctype in {"Button"} and label in {"cancel", "close", "&cancel", "&close"}:
        return "SAFE_NAVIGATION", "high"

    return "UNKNOWN", "low"


def is_safe_to_invoke(
    classification: str,
    confidence: str,
    *,
    allow_medium: bool = False,
) -> bool:
    if classification not in SAFE_CLASSIFICATIONS:
        return False
    if confidence == "high":
        return True
    if confidence == "medium" and allow_medium:
        return True
    return False


def compute_screen_key(
    *,
    hot2000_version: str | None,
    window_title: str,
    dialog_title: str | None = None,
    selected_tabs: list[str] | None = None,
    parent_hierarchy: list[str] | None = None,
    key_labels: list[str] | None = None,
) -> str:
    """Deterministic screen fingerprint without HWND."""
    version = hot2000_version or "unknown"
    parts = [
        version,
        (window_title or "").strip().lower(),
        (dialog_title or "").strip().lower(),
        "|".join(sorted((selected_tabs or []))),
        ">".join((parent_hierarchy or [])[:8]),
        "|".join(sorted((key_labels or [])[:12])),
    ]
    digest = hashlib.sha256("::".join(parts).encode("utf-8")).hexdigest()[:16]
    slug_source = dialog_title or window_title or "screen"
    slug = re.sub(r"[^a-z0-9]+", "-", slug_source.strip().lower()).strip("-") or "screen"
    if selected_tabs:
        slug = f"{slug}-{'-'.join(selected_tabs[:2])}"
    return f"{version}::{slug}::{digest}"


def _visible_control_count(window) -> int:
    try:
        return sum(
            1
            for desc in window.descendants()
            if desc.is_visible()
            and str(desc.element_info.control_type) not in SKIP_CAPTURE_TYPES
        )
    except Exception:
        return 0


def _window_count(desktop, pid: int | None) -> int:
    try:
        return sum(
            1
            for win in desktop.windows()
            if win.is_visible() and (pid is None or win.process_id() == pid)
        )
    except Exception:
        return 0


def wait_for_ui_stability(
    window,
    *,
    timeout_s: float = UI_STABILIZE_TIMEOUT_S,
    poll_s: float = UI_STABILIZE_POLL_S,
    stable_polls_required: int = UI_STABILIZE_STABLE_POLLS,
) -> bool:
    """Wait until UI is stable: control count, window count, and geometry."""
    deadline = time.time() + timeout_s
    last_count = -1
    last_windows = -1
    stable_polls = 0
    pid = None
    try:
        pid = window.process_id()
    except Exception:
        pass
    desktop = None
    try:
        from catalog_recorder import _desktop_window

        desktop = _desktop_window()
    except Exception:
        desktop = None

    while time.time() < deadline:
        count = _visible_control_count(window)
        win_count = _window_count(desktop, pid) if desktop else last_windows
        if count == last_count and win_count == last_windows and count > 0:
            stable_polls += 1
            if stable_polls >= stable_polls_required:
                return True
        else:
            stable_polls = 0
            last_count = count
            last_windows = win_count
        time.sleep(poll_s)
    return stable_polls >= max(2, stable_polls_required - 1)


def discover_navigation_targets(
    window,
    *,
    depth: int = 0,
    allow_medium: bool = False,
) -> list[NavigationTarget]:
    targets: list[NavigationTarget] = []
    seen: set[str] = set()
    try:
        descendants = list(window.descendants())
    except Exception:
        return targets

    for desc in descendants:
        try:
            if not desc.is_visible() or not desc.is_enabled():
                continue
            ctype = str(desc.element_info.control_type)
            if ctype in SKIP_CAPTURE_TYPES:
                continue
            label = _normalized_label(desc)
            if not label and ctype not in {"TabItem", "TreeItem", "ListItem"}:
                continue
            classification, confidence = classify_action(desc)
            if not is_safe_to_invoke(classification, confidence, allow_medium=allow_medium):
                continue
            key = f"{ctype}:{label}:{getattr(desc.element_info, 'automation_id', '')}"
            if key in seen:
                continue
            seen.add(key)
            targets.append(
                NavigationTarget(
                    label=label or ctype,
                    control_type=ctype,
                    classification=classification,
                    confidence=confidence,
                    automation_id=_safe_str(desc.element_info.automation_id),
                    class_name=_safe_str(desc.element_info.class_name),
                    control_ref=desc,
                    depth=depth,
                )
            )
        except Exception:
            continue
    return targets


def safe_invoke(target: NavigationTarget) -> tuple[bool, str | None]:
    """Invoke a navigation target. Returns (success, error)."""
    control = target.control_ref
    if control is None:
        return False, "missing control reference"
    try:
        if target.control_type == "TabItem":
            control.select()
        elif target.control_type in {"TreeItem", "ListItem", "Hyperlink"}:
            control.click_input()
        elif target.control_type == "MenuItem":
            control.invoke()
        else:
            control.click_input()
        return True, None
    except Exception as exc:
        return False, str(exc)


def list_dialog_windows(desktop, parent_pid: int | None = None) -> list[Any]:
    dialogs: list[Any] = []
    try:
        for win in desktop.windows():
            try:
                if not win.is_visible():
                    continue
                class_name = win.element_info.class_name
                if class_name == "#32770" or "dialog" in (win.window_text() or "").lower():
                    if parent_pid is None or win.process_id() == parent_pid:
                        dialogs.append(win)
            except Exception:
                continue
    except Exception:
        pass
    return dialogs


def safe_close_dialog(dialog) -> tuple[bool, str]:
    """Close dialog preferring Cancel/Close/Escape."""
    for label in ("&Cancel", "Cancel", "&Close", "Close"):
        try:
            btn = dialog.child_window(title=label, control_type="Button")
            if btn.exists(timeout=0.2) and btn.is_enabled():
                btn.click_input()
                return True, f"button:{label}"
        except Exception:
            continue
    try:
        dialog.type_keys("{ESC}")
        return True, "escape"
    except Exception:
        return False, "manual-review"


def get_selected_tab_labels(window) -> list[str]:
    labels: list[str] = []
    try:
        for tab in window.descendants(control_type="TabItem"):
            try:
                if tab.is_selected():
                    labels.append(_normalized_label(tab) or "tab")
            except Exception:
                continue
    except Exception:
        pass
    return labels


def scroll_container_controls(container) -> list[Any]:
    """Scroll a container and return newly revealed controls (best effort)."""
    revealed: list[Any] = []
    seen_ids: set[str] = set()

    def collect_visible() -> None:
        try:
            for desc in container.descendants():
                if not desc.is_visible():
                    continue
                ctype = str(desc.element_info.control_type)
                if ctype in SKIP_CAPTURE_TYPES:
                    continue
                key = f"{ctype}:{_normalized_label(desc)}:{getattr(desc.element_info, 'automation_id', '')}"
                if key in seen_ids:
                    continue
                seen_ids.add(key)
                revealed.append(desc)
        except Exception:
            pass

    collect_visible()
    try:
        scroll = container.iface_scroll
    except Exception:
        return revealed

    for _ in range(20):
        try:
            scroll.Scroll(0, 3)
            time.sleep(0.1)
            before = len(seen_ids)
            collect_visible()
            if len(seen_ids) == before:
                break
        except Exception:
            break

    try:
        scroll.SetScrollPercent(0, 0)
    except Exception:
        pass
    return revealed
