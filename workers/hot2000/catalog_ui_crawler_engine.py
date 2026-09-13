"""
Pure logic for HOT2000 UI crawler queue, action planning, and termination.

Testable without pywinauto via MockUiSurface.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from catalog_scan_accounting import (
    build_accounting_summary,
    progress_percent_from_accounting,
    verify_accounting_invariant,
)
from catalog_ui_fingerprint import (
    ACTION_STATUSES,
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
    depends_on_action_key: str | None = None
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
            "dependsOnActionKey": self.depends_on_action_key,
            "revealedControls": self.revealed_controls,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PlannedAction:
        return cls(
            action_key=data.get("actionKey", ""),
            state_digest=data.get("stateDigest", ""),
            control_id=data.get("controlId", ""),
            control_label=data.get("controlLabel", ""),
            control_type=data.get("controlType", ""),
            action_kind=data.get("actionKind", ""),
            target_value=data.get("targetValue", ""),
            classification=data.get("classification", "SAFE_NAVIGATION"),
            status=data.get("status", "pending"),
            restore_strategy=data.get("restoreStrategy"),
            parent_state_digest=data.get("parentStateDigest"),
            depends_on_action_key=data.get("dependsOnActionKey"),
            revealed_controls=list(data.get("revealedControls") or []),
        )


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
    states_failed: int = 0
    states_skipped: int = 0
    states_pending: int = 0
    actions_discovered: int = 0
    actions_completed: int = 0
    actions_failed: int = 0
    actions_skipped: int = 0
    actions_pending: int = 0
    controls_unique: int = 0
    tabs_total: int = 0
    tabs_visited: int = 0
    combos_total: int = 0
    combos_opened: int = 0
    combo_options_captured: int = 0
    checkboxes_total: int = 0
    checkbox_states_explored: int = 0
    radio_groups_total: int = 0
    radio_groups_discovered: int = 0
    radio_choices_explored: int = 0
    dialogs_total: int = 0
    dialogs_visited: int = 0
    scroll_regions_total: int = 0
    scroll_regions_completed: int = 0
    inaccessible_controls: int = 0
    blocked_destructive: int = 0

    def to_dict(self) -> dict[str, int]:
        return {k: getattr(self, k) for k in self.__dataclass_fields__}

    def sync_from_records(
        self,
        actions: dict[str, PlannedAction],
        states: dict[str, dict[str, Any]],
    ) -> None:
        action_summary = build_accounting_summary(
            {k: {"status": v.status} for k, v in actions.items()},
            kind="actions",
        )
        state_summary = build_accounting_summary(states, kind="states")
        for key, value in {**action_summary, **state_summary}.items():
            snake = "".join(
                ["_" + c.lower() if c.isupper() else c for c in key]
            ).lstrip("_")
            if hasattr(self, snake):
                setattr(self, snake, int(value))


class UiSurface(Protocol):
    def fingerprint(self) -> StateFingerprint: ...
    def list_tabs(self) -> list[dict[str, Any]]: ...
    def list_combos(self, *, metadata_only: bool = True) -> list[dict[str, Any]]: ...
    def list_checkboxes(self) -> list[dict[str, Any]]: ...
    def list_radio_groups(self) -> list[dict[str, Any]]: ...
    def list_buttons(self) -> list[dict[str, Any]]: ...
    def list_scroll_regions(self) -> list[dict[str, Any]]: ...
    def list_dialogs(self) -> list[dict[str, Any]]: ...
    def execute_action(self, action: PlannedAction) -> dict[str, Any]: ...
    def capture_controls(self) -> list[dict[str, Any]]: ...
    def enumerate_combo(self, control_id: str) -> dict[str, Any]: ...


SAFE_BUTTON_CLASSES = frozenset(
    {"SAFE_NAVIGATION", "SAFE_DIALOG_OPEN", "SAFE_UI_REVEAL", "SAFE_TAB", "SAFE_MENU"}
)
BLOCKED_BUTTON_CLASSES = frozenset(
    {"DESTRUCTIVE", "SAVE", "CALCULATE", "REPORT", "CLOSE", "UNKNOWN", "MUTATING"}
)
TERMINAL_ACTION_STATUSES = frozenset({"completed", "failed", "skipped", "blocked"})


class CrawlEngine:
    def __init__(self, limits: CrawlLimits | None = None) -> None:
        self.limits = limits or CrawlLimits()
        self.counters = CrawlCounters()
        self.pending: list[PlannedAction] = []
        self.actions: dict[str, PlannedAction] = {}
        self.state_records: dict[str, dict[str, Any]] = {}
        self._unique_control_ids: set[str] = set()
        self._combo_options_seen: set[str] = set()
        self._opened_combos: set[str] = set()
        self.current_action: PlannedAction | None = None
        self.current_state_digest: str | None = None
        self.completion_reason: str | None = None
        self.warnings: list[str] = []
        self.started_monotonic: float = 0.0
        self.radio_controls_absent: bool = False

    def restore_from_state(self, state_data: dict[str, Any]) -> None:
        actions_raw = state_data.get("actions") or {}
        self.actions = {
            k: PlannedAction.from_dict(v) if isinstance(v, dict) else v
            for k, v in actions_raw.items()
        }
        self.state_records = dict(state_data.get("stateRecords") or state_data.get("state_records") or {})
        pending_raw = state_data.get("pending") or []
        self.pending = [
            PlannedAction.from_dict(item) if isinstance(item, dict) else item
            for item in pending_raw
            if isinstance(item, dict)
        ]
        counters = state_data.get("crawlCounters") or state_data.get("crawl_counters") or {}
        for key, value in counters.items():
            if hasattr(self.counters, key):
                setattr(self.counters, key, int(value))
        self._opened_combos = set(state_data.get("openedCombos") or state_data.get("opened_combos") or [])
        self._combo_options_seen = set(state_data.get("comboOptionsSeenKeys") or [])

    def export_state(self) -> dict[str, Any]:
        return {
            "actions": {k: v.to_dict() for k, v in self.actions.items()},
            "stateRecords": self.state_records,
            "pending": [a.to_dict() for a in self.pending],
            "openedCombos": sorted(self._opened_combos),
            "comboOptionsSeenKeys": sorted(self._combo_options_seen),
        }

    def is_action_terminal(self, action_key: str) -> bool:
        action = self.actions.get(action_key)
        return action is not None and action.status in TERMINAL_ACTION_STATUSES

    def enqueue_action(self, action: PlannedAction) -> bool:
        if action.action_key in self.actions:
            return False
        self.actions[action.action_key] = action
        self.pending.append(action)
        self.counters.sync_from_records(self.actions, self.state_records)
        return True

    def pop_next(self) -> PlannedAction | None:
        deferred: list[PlannedAction] = []
        while self.pending:
            action = self.pending.pop(0)
            if action.status != "pending":
                continue
            dep = action.depends_on_action_key
            if dep and not self.is_action_terminal(dep):
                deferred.append(action)
                continue
            if action.action_kind == "combo_select" and action.control_id not in self._opened_combos:
                deferred.append(action)
                continue
            self.pending.extend(deferred)
            return action
        self.pending.extend(deferred)
        return None

    def mark_action(self, action_key: str, status: str, **extra: Any) -> None:
        if status not in ACTION_STATUSES:
            status = "failed"
        action = self.actions.get(action_key)
        if not action:
            return
        if action.status in TERMINAL_ACTION_STATUSES and status == action.status:
            if extra.get("restore_strategy"):
                action.restore_strategy = extra["restore_strategy"]
            return
        action.status = status
        if extra.get("revealed_controls"):
            action.revealed_controls = list(extra["revealed_controls"])
        if extra.get("restore_strategy"):
            action.restore_strategy = extra["restore_strategy"]
        self.counters.sync_from_records(self.actions, self.state_records)

    def record_state(self, fp: StateFingerprint, capture: dict[str, Any]) -> str:
        digest = fp.digest()
        key = fp.key()
        is_new = digest not in self.state_records
        record = self.state_records.get(digest, {})
        visits = int(record.get("visits", 0)) + 1
        if is_new:
            record["status"] = "pending"
            self.counters.states_discovered += 1
        record.update(
            {
                "stateKey": key,
                "stateDigest": digest,
                "fingerprint": capture,
                "visits": visits,
                "status": "completed",
            }
        )
        self.state_records[digest] = record
        if is_new:
            self.counters.states_completed += 1
        self.current_state_digest = digest
        for ctrl in capture.get("controls") or []:
            sid = ctrl.get("stableId") or ctrl.get("id")
            if sid:
                self._unique_control_ids.add(str(sid))
        self.counters.controls_unique = len(self._unique_control_ids)
        self.counters.sync_from_records(self.actions, self.state_records)
        return digest

    def register_combo_options(self, combo_id: str, options: list[dict[str, Any]]) -> int:
        added = 0
        for opt in options:
            label = str(opt.get("label") or opt.get("index"))
            key = f"{combo_id}::{label}"
            if key not in self._combo_options_seen:
                self._combo_options_seen.add(key)
                added += 1
        self.counters.combo_options_captured = len(self._combo_options_seen)
        return added

    def plan_actions_for_surface(
        self,
        surface: UiSurface,
        fp: StateFingerprint,
        *,
        base_digest: str | None = None,
    ) -> list[PlannedAction]:
        base = base_digest or fp.digest()
        planned: list[PlannedAction] = []

        tabs = surface.list_tabs()
        self.counters.tabs_total = max(self.counters.tabs_total, len(tabs))
        for tab in tabs:
            if tab.get("selected"):
                continue
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

        combos = surface.list_combos(metadata_only=True)
        self.counters.combos_total = max(self.counters.combos_total, len(combos))
        for combo in combos:
            cid = combo.get("id") or combo.get("label") or "combo"
            label = combo.get("label") or cid
            open_key = build_action_key(base, cid, "combo_open", "")
            open_action = PlannedAction(
                action_key=open_key,
                state_digest=base,
                control_id=cid,
                control_label=label,
                control_type="ComboBox",
                action_kind="combo_open",
                classification="SAFE_UI_REVEAL",
            )
            if self.enqueue_action(open_action):
                planned.append(open_action)

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

        radio_groups = surface.list_radio_groups()
        if not radio_groups:
            self.radio_controls_absent = True
        else:
            self.radio_controls_absent = False
            self.counters.radio_groups_discovered = len(radio_groups)
        for group in radio_groups:
            gid = group.get("id") or "radio-group"
            choices = group.get("choices") or []
            selected = group.get("selected")
            self.counters.radio_groups_total = max(self.counters.radio_groups_total, 1)
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
        for ctrl in controls:
            sid = ctrl.get("stableId") or ctrl.get("id")
            if sid:
                self._unique_control_ids.add(str(sid))
        self.counters.controls_unique = len(self._unique_control_ids)
        self.counters.sync_from_records(self.actions, self.state_records)
        return planned

    def plan_combo_select_actions(
        self,
        base_digest: str,
        combo_id: str,
        combo_label: str,
        options: list[dict[str, Any]],
        open_action_key: str,
    ) -> list[PlannedAction]:
        planned: list[PlannedAction] = []
        for option in options:
            opt_label = str(option.get("label") or option.get("index"))
            select_key = build_action_key(base_digest, combo_id, "combo_select", opt_label)
            action = PlannedAction(
                action_key=select_key,
                state_digest=base_digest,
                control_id=combo_id,
                control_label=combo_label,
                control_type="ComboBox",
                action_kind="combo_select",
                target_value=opt_label,
                classification="SAFE_UI_REVEAL",
                parent_state_digest=base_digest,
                depends_on_action_key=open_action_key,
            )
            if self.enqueue_action(action):
                planned.append(action)
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
        return progress_percent_from_accounting(
            {k: {"status": v.status} for k, v in self.actions.items()},
            self.state_records,
        )

    def accounting_invariants_ok(self) -> bool:
        action_summary = build_accounting_summary(
            {k: {"status": v.status} for k, v in self.actions.items()},
            kind="actions",
        )
        state_summary = build_accounting_summary(self.state_records, kind="states")
        return verify_accounting_invariant(action_summary, "actions") and verify_accounting_invariant(
            state_summary, "states"
        )

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
