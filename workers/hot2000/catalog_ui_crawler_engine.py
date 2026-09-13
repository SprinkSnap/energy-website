"""
Pure logic for HOT2000 UI crawler queue, action planning, and termination.

Testable without pywinauto via MockUiSurface.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from catalog_ui_fingerprint import (
    ACTION_STATUSES,
    ControlSnapshot,
    StateFingerprint,
    build_action_key,
)


@dataclass
class PlannedAction:
    action_key: str
    state_digest: str
    control_id: str
    control_label: str
    control_type: str
    action_kind: str
    target_value: str = ""
    classification: str = "SAFE_NAVIGATION"
    status: str = "pending"
    restore_strategy: str | None = None
    parent_state_digest: str | None = None
    revealed_controls: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "actionKey": self.action_key,
            "stateDigest": self.state_digest,
            "controlId": self.control_id,
            "controlLabel": self.control_label,
            "controlType": self.control_type,
            "actionKind": self.action_kind,
            "targetValue": self.target_value,
            "classification": self.classification,
            "status": self.status,
            "restoreStrategy": self.restore_strategy,
            "parentStateDigest": self.parent_state_digest,
            "revealedControls": self.revealed_controls,
        }


@dataclass
class CrawlLimits:
    max_scan_minutes: int = 120
    max_states: int = 500
    max_actions: int = 5000
    max_action_retries: int = 2
    max_depth: int = 16


@dataclass
class CrawlCounters:
    states_discovered: int = 0
    states_completed: int = 0
    actions_discovered: int = 0
    actions_completed: int = 0
    actions_failed: int = 0
    actions_skipped: int = 0
    controls_discovered: int = 0
    controls_unique: int = 0
    tabs_total: int = 0
    tabs_visited: int = 0
    combos_total: int = 0
    combos_opened: int = 0
    combo_options_seen: int = 0
    checkboxes_total: int = 0
    checkbox_states_explored: int = 0
    radio_groups_total: int = 0
    radio_choices_explored: int = 0
    dialogs_total: int = 0
    dialogs_visited: int = 0
    scroll_regions_total: int = 0
    scroll_regions_completed: int = 0
    inaccessible_controls: int = 0
    blocked_destructive: int = 0

    def to_dict(self) -> dict[str, int]:
        return {k: getattr(self, k) for k in self.__dataclass_fields__}

    def progress_ratio(self) -> float:
        total = self.actions_discovered + self.states_discovered
        done = self.actions_completed + self.states_completed
        if total <= 0:
            return 0.0
        return min(1.0, done / total)


class UiSurface(Protocol):
    def fingerprint(self) -> StateFingerprint: ...
    def list_tabs(self) -> list[dict[str, Any]]: ...
    def list_combos(self) -> list[dict[str, Any]]: ...
    def list_checkboxes(self) -> list[dict[str, Any]]: ...
    def list_radio_groups(self) -> list[dict[str, Any]]: ...
    def list_buttons(self) -> list[dict[str, Any]]: ...
    def list_scroll_regions(self) -> list[dict[str, Any]]: ...
    def list_dialogs(self) -> list[dict[str, Any]]: ...
    def execute_action(self, action: PlannedAction) -> dict[str, Any]: ...
    def capture_controls(self) -> list[dict[str, Any]]: ...


SAFE_BUTTON_CLASSES = frozenset(
    {"SAFE_NAVIGATION", "SAFE_DIALOG_OPEN", "SAFE_UI_REVEAL", "SAFE_TAB", "SAFE_MENU"}
)
BLOCKED_BUTTON_CLASSES = frozenset(
    {"DESTRUCTIVE", "SAVE", "CALCULATE", "REPORT", "CLOSE", "UNKNOWN", "MUTATING"}
)


class CrawlEngine:
    def __init__(self, limits: CrawlLimits | None = None) -> None:
        self.limits = limits or CrawlLimits()
        self.counters = CrawlCounters()
        self.pending: list[PlannedAction] = []
        self.actions: dict[str, PlannedAction] = {}
        self.visited_states: dict[str, int] = {}
        self.state_records: dict[str, dict[str, Any]] = {}
        self.current_action: PlannedAction | None = None
        self.current_state_digest: str | None = None
        self.completion_reason: str | None = None
        self.warnings: list[str] = []
        self.started_monotonic: float = 0.0

    def is_action_seen(self, action_key: str) -> bool:
        existing = self.actions.get(action_key)
        return existing is not None and existing.status in {"completed", "skipped", "blocked"}

    def enqueue_action(self, action: PlannedAction) -> bool:
        if self.is_action_seen(action.action_key):
            return False
        if action.action_key in self.actions:
            return False
        self.actions[action.action_key] = action
        self.pending.append(action)
        self.counters.actions_discovered += 1
        return True

    def pop_next(self) -> PlannedAction | None:
        while self.pending:
            action = self.pending.pop(0)
            if action.status == "pending":
                return action
        return None

    def mark_action(self, action_key: str, status: str, **extra: Any) -> None:
        if status not in ACTION_STATUSES:
            status = "failed"
        action = self.actions.get(action_key)
        if not action:
            return
        action.status = status
        if status == "completed":
            self.counters.actions_completed += 1
        elif status == "failed":
            self.counters.actions_failed += 1
        elif status in {"skipped", "blocked"}:
            self.counters.actions_skipped += 1
        if extra.get("revealed_controls"):
            action.revealed_controls = list(extra["revealed_controls"])
        if extra.get("restore_strategy"):
            action.restore_strategy = extra["restore_strategy"]

    def record_state(self, fp: StateFingerprint, capture: dict[str, Any]) -> str:
        digest = fp.digest()
        key = fp.key()
        visits = self.visited_states.get(digest, 0) + 1
        self.visited_states[digest] = visits
        is_new = digest not in self.state_records
        if is_new:
            self.counters.states_discovered += 1
        self.state_records[digest] = {
            "stateKey": key,
            "stateDigest": digest,
            "fingerprint": capture,
            "visits": visits,
            "status": "completed",
        }
        self.counters.states_completed += 1
        self.current_state_digest = digest
        return digest

    def plan_actions_for_surface(
        self,
        surface: UiSurface,
        fp: StateFingerprint,
        *,
        base_digest: str | None = None,
    ) -> list[PlannedAction]:
        digest = fp.digest()
        base = base_digest or digest
        planned: list[PlannedAction] = []

        tabs = surface.list_tabs()
        self.counters.tabs_total = max(self.counters.tabs_total, len(tabs))
        for tab in tabs:
            label = tab.get("label") or tab.get("id") or "tab"
            cid = tab.get("id") or label
            action = PlannedAction(
                action_key=build_action_key(base, cid, "tab_select", label),
                state_digest=base,
                control_id=cid,
                control_label=label,
                control_type="TabItem",
                action_kind="tab_select",
                target_value=label,
                classification="SAFE_TAB",
            )
            if self.enqueue_action(action):
                planned.append(action)

        combos = surface.list_combos()
        self.counters.combos_total = max(self.counters.combos_total, len(combos))
        for combo in combos:
            cid = combo.get("id") or combo.get("label") or "combo"
            label = combo.get("label") or cid
            open_key = build_action_key(base, cid, "combo_open", "")
            if self.enqueue_action(
                PlannedAction(
                    action_key=open_key,
                    state_digest=base,
                    control_id=cid,
                    control_label=label,
                    control_type="ComboBox",
                    action_kind="combo_open",
                    classification="SAFE_UI_REVEAL",
                )
            ):
                planned.append(self.actions[open_key])
            for option in combo.get("options") or []:
                opt_label = str(option.get("label") or option.get("index"))
                self.counters.combo_options_seen += 1
                select_key = build_action_key(base, cid, "combo_select", opt_label)
                if self.enqueue_action(
                    PlannedAction(
                        action_key=select_key,
                        state_digest=base,
                        control_id=cid,
                        control_label=label,
                        control_type="ComboBox",
                        action_kind="combo_select",
                        target_value=opt_label,
                        classification="SAFE_UI_REVEAL",
                        parent_state_digest=base,
                    )
                ):
                    planned.append(self.actions[select_key])

        for checkbox in surface.list_checkboxes():
            cid = checkbox.get("id") or checkbox.get("label") or "checkbox"
            label = checkbox.get("label") or cid
            current = checkbox.get("checked", "unchecked")
            alt = "checked" if current != "checked" else "unchecked"
            self.counters.checkboxes_total += 1
            key = build_action_key(base, cid, "checkbox_toggle", alt)
            if self.enqueue_action(
                PlannedAction(
                    action_key=key,
                    state_digest=base,
                    control_id=cid,
                    control_label=label,
                    control_type="CheckBox",
                    action_kind="checkbox_toggle",
                    target_value=alt,
                    classification="SAFE_UI_REVEAL",
                    parent_state_digest=base,
                )
            ):
                planned.append(self.actions[key])

        for group in surface.list_radio_groups():
            gid = group.get("id") or "radio-group"
            choices = group.get("choices") or []
            selected = group.get("selected")
            self.counters.radio_groups_total += 1
            for choice in choices:
                clabel = choice.get("label") or choice.get("id")
                if clabel == selected:
                    continue
                cid = choice.get("id") or clabel
                key = build_action_key(base, f"{gid}:{cid}", "radio_select", clabel)
                if self.enqueue_action(
                    PlannedAction(
                        action_key=key,
                        state_digest=base,
                        control_id=cid,
                        control_label=clabel,
                        control_type="RadioButton",
                        action_kind="radio_select",
                        target_value=clabel,
                        classification="SAFE_UI_REVEAL",
                        parent_state_digest=base,
                    )
                ):
                    planned.append(self.actions[key])

        for button in surface.list_buttons():
            classification = button.get("classification", "UNKNOWN")
            if classification in BLOCKED_BUTTON_CLASSES:
                self.counters.blocked_destructive += 1
                continue
            if classification not in SAFE_BUTTON_CLASSES:
                continue
            cid = button.get("id") or button.get("label") or "button"
            label = button.get("label") or cid
            key = build_action_key(base, cid, "button_invoke", label)
            if self.enqueue_action(
                PlannedAction(
                    action_key=key,
                    state_digest=base,
                    control_id=cid,
                    control_label=label,
                    control_type="Button",
                    action_kind="button_invoke",
                    target_value=label,
                    classification=classification,
                    parent_state_digest=base,
                )
            ):
                planned.append(self.actions[key])

        scroll_regions = surface.list_scroll_regions()
        self.counters.scroll_regions_total = max(
            self.counters.scroll_regions_total, len(scroll_regions)
        )
        for region in scroll_regions:
            rid = region.get("id") or "scroll"
            key = build_action_key(base, rid, "scroll_down", "")
            if self.enqueue_action(
                PlannedAction(
                    action_key=key,
                    state_digest=base,
                    control_id=rid,
                    control_label=rid,
                    control_type="ScrollViewer",
                    action_kind="scroll_down",
                    classification="SAFE_NAVIGATION",
                )
            ):
                planned.append(self.actions[key])

        dialogs = surface.list_dialogs()
        self.counters.dialogs_total = max(self.counters.dialogs_total, len(dialogs))
        for dialog in dialogs:
            did = dialog.get("id") or dialog.get("title") or "dialog"
            key = build_action_key(base, did, "dialog_visit", did)
            if self.enqueue_action(
                PlannedAction(
                    action_key=key,
                    state_digest=base,
                    control_id=did,
                    control_label=dialog.get("title") or did,
                    control_type="Dialog",
                    action_kind="dialog_visit",
                    target_value=did,
                    classification="SAFE_DIALOG_OPEN",
                )
            ):
                planned.append(self.actions[key])

        controls = surface.capture_controls()
        self.counters.controls_discovered += len(controls)
        unique = {c.get("stableId") or c.get("id") for c in controls}
        self.counters.controls_unique = len(unique)
        return planned

    def should_terminate(self, elapsed_minutes: float) -> bool:
        if elapsed_minutes >= self.limits.max_scan_minutes:
            self.completion_reason = "max_scan_minutes"
            self.warnings.append(f"Hard limit reached: MAX_SCAN_MINUTES={self.limits.max_scan_minutes}")
            return True
        if self.counters.states_discovered >= self.limits.max_states:
            self.completion_reason = "max_states"
            self.warnings.append(f"Hard limit reached: MAX_STATES={self.limits.max_states}")
            return True
        if self.counters.actions_discovered >= self.limits.max_actions:
            self.completion_reason = "max_actions"
            self.warnings.append(f"Hard limit reached: MAX_ACTIONS={self.limits.max_actions}")
            return True
        return False

    def progress_percent(self) -> int:
        return int(round(self.counters.progress_ratio() * 100))

    def current_action_label(self) -> str | None:
        if not self.current_action:
            return None
        action = self.current_action
        kind = action.action_kind
        label = action.control_label
        if kind == "tab_select":
            return f"Selecting tab: {label}"
        if kind == "combo_open":
            return f"Opening combo: {label}"
        if kind == "combo_select":
            return f"Selecting combo option: {label} → {action.target_value}"
        if kind == "checkbox_toggle":
            return f"Toggling checkbox: {label} → {action.target_value}"
        if kind == "radio_select":
            return f"Selecting radio: {label}"
        if kind == "scroll_down":
            return f"Scrolling: {label}"
        if kind == "dialog_visit":
            return f"Visiting dialog: {label}"
        if kind == "button_invoke":
            return f"Invoking button: {label}"
        return f"{kind}: {label}"
