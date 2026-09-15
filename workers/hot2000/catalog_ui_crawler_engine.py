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
from catalog_phase2_sections import is_foreign_section_navigation
from catalog_visitation_ledger import VisitationLedger, hash_prerequisite_signature


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
    logical_control_id: str = ""
    screen_id: str = ""
    prerequisite_signature: str = ""
    branch_path: list[dict[str, Any]] = field(default_factory=list)
    option_index: int | None = None
    option_count: int | None = None
    revisit_reason: str | None = None

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
            "logicalControlId": self.logical_control_id,
            "screenId": self.screen_id,
            "prerequisiteSignature": self.prerequisite_signature,
            "branchPath": self.branch_path,
            "optionIndex": self.option_index,
            "optionCount": self.option_count,
            "revisitReason": self.revisit_reason,
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
            logical_control_id=str(data.get("logicalControlId") or ""),
            screen_id=str(data.get("screenId") or ""),
            prerequisite_signature=str(data.get("prerequisiteSignature") or ""),
            branch_path=list(data.get("branchPath") or []),
            option_index=data.get("optionIndex"),
            option_count=data.get("optionCount"),
            revisit_reason=data.get("revisitReason"),
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
    combo_options_discovered: int = 0
    combo_options_tested: int = 0
    buttons_total: int = 0
    buttons_visited: int = 0
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
    text_fields_discovered: int = 0
    text_fields_visited: int = 0
    read_only_fields: int = 0
    text_field_visit_failures: int = 0

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
    def list_text_fields(self) -> list[dict[str, Any]]: ...
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
SECTION_CONTROL_PHASES = (
    "tab_select",
    "text_field_focus",
    "combo_open",
    "combo_select",
    "checkbox_toggle",
    "radio_select",
    "button_invoke",
    "scroll_down",
    "dialog_visit",
)


def _control_sort_key(item: dict[str, Any]) -> tuple[Any, ...]:
    locator = item.get("locator") or {}
    rect = locator.get("rectangle") or {}
    return (
        str(locator.get("tabBreadcrumb") or ""),
        rect.get("top", 0),
        rect.get("left", 0),
        int(locator.get("siblingOrdinal") or 0),
        str(item.get("logicalControlId") or item.get("label") or item.get("id") or ""),
    )


def _sorted_controls(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=_control_sort_key)


class CrawlEngine:
    def __init__(self, limits: CrawlLimits | None = None) -> None:
        self.limits = limits or CrawlLimits()
        self.counters = CrawlCounters()
        self.pending: list[PlannedAction] = []
        self.actions: dict[str, PlannedAction] = {}
        self.state_records: dict[str, dict[str, Any]] = {}
        self._unique_control_ids: set[str] = set()
        self._combo_options_seen: set[str] = set()
        self._opened_combos: set[tuple[str, str]] = set()
        self.ledger = VisitationLedger()
        self.branch_path: list[dict[str, Any]] = []
        self.current_action: PlannedAction | None = None
        self.current_state_digest: str | None = None
        self.completion_reason: str | None = None
        self.warnings: list[str] = []
        self.started_monotonic: float = 0.0
        self.radio_controls_absent: bool = False
        self.target_section_id: str | None = None
        self._active_combo_sweep: str | None = None
        self._combo_original_values: dict[str, str] = {}
        self._section_phase_index: int = 0
        self.blocked_foreign_section_navigation: list[dict[str, str]] = []

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
        opened = state_data.get("openedCombos") or state_data.get("opened_combos") or []
        self._opened_combos = {
            tuple(item.split("::", 1)) if isinstance(item, str) and "::" in item else (str(item), "")
            for item in opened
        }
        self._combo_options_seen = set(state_data.get("comboOptionsSeenKeys") or [])
        self.ledger.restore(state_data.get("visitationLedger"))
        self.branch_path = list(state_data.get("branchPath") or [])
        target = state_data.get("targetSectionId") or state_data.get("target_section_id")
        self.target_section_id = str(target).strip() if target else None
        self._active_combo_sweep = state_data.get("activeComboSweep") or state_data.get("active_combo_sweep")
        self._combo_original_values = dict(state_data.get("comboOriginalValues") or {})
        self._section_phase_index = int(state_data.get("sectionPhaseIndex") or 0)
        self.blocked_foreign_section_navigation = list(
            state_data.get("blockedForeignSectionNavigation") or []
        )

    def export_state(self) -> dict[str, Any]:
        return {
            "actions": {k: v.to_dict() for k, v in self.actions.items()},
            "stateRecords": self.state_records,
            "pending": [a.to_dict() for a in self.pending],
            "openedCombos": sorted(f"{screen}::{control}" for screen, control in self._opened_combos),
            "comboOptionsSeenKeys": sorted(self._combo_options_seen),
            "visitationLedger": self.ledger.export(),
            "branchPath": self.branch_path,
            "targetSectionId": self.target_section_id,
            "activeComboSweep": self._active_combo_sweep,
            "comboOriginalValues": self._combo_original_values,
            "sectionPhaseIndex": self._section_phase_index,
            "blockedForeignSectionNavigation": self.blocked_foreign_section_navigation[-100:],
        }

    def is_section_sequential_mode(self) -> bool:
        return bool(self.target_section_id)

    def begin_combo_sweep(self, logical_control_id: str, original_value: str) -> None:
        self._active_combo_sweep = logical_control_id
        self._combo_original_values[logical_control_id] = original_value
        self.ledger.mark_combo_original_value(
            logical_control_id,
            self.prerequisite_signature(),
            original_value,
        )

    def finish_combo_sweep(self, logical_control_id: str) -> None:
        self.ledger.mark_combo_restored(logical_control_id, self.prerequisite_signature())
        if self._active_combo_sweep == logical_control_id:
            self._active_combo_sweep = None

    def is_last_combo_select(self, action: PlannedAction) -> bool:
        logical_id = action.logical_control_id or action.control_id
        record = self.ledger._get(logical_id, action.prerequisite_signature or self.prerequisite_signature())
        if record.option_branches_total <= 0:
            return True
        pending = record.option_branches_total - len(record.options_completed)
        return pending <= 1

    def combos_completed_count(self) -> int:
        return self.ledger.count_completed_combos(self.prerequisite_signature())

    def _should_skip_section_navigation(self, label: str, action_kind: str) -> bool:
        if not self.target_section_id:
            return False
        if action_kind not in {"tab_select", "button_invoke"}:
            return False
        return is_foreign_section_navigation(label, self.target_section_id)

    def prerequisite_signature(self) -> str:
        return hash_prerequisite_signature(self.branch_path)

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

    def _defer_for_combo_sweep(self, action: PlannedAction) -> bool:
        if not self._active_combo_sweep:
            return False
        logical_id = action.logical_control_id or action.control_id
        if action.action_kind == "combo_select":
            return logical_id != self._active_combo_sweep
        if action.action_kind == "combo_open":
            return logical_id != self._active_combo_sweep
        if self.is_section_sequential_mode():
            return action.action_kind not in {"combo_select"}
        return False

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
            if action.action_kind == "combo_select":
                open_key = (action.screen_id, action.control_id)
                if open_key not in self._opened_combos:
                    deferred.append(action)
                    continue
            if self._defer_for_combo_sweep(action):
                deferred.append(action)
                continue
            if self.is_section_sequential_mode() and self._active_combo_sweep:
                if action.action_kind not in {"combo_select", "combo_open"}:
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
        self.counters.combo_options_discovered = len(self._combo_options_seen)
        return added

    def _make_action(
        self,
        *,
        base: str,
        screen_id: str,
        cid: str,
        label: str,
        control_type: str,
        action_kind: str,
        target_value: str = "",
        classification: str = "SAFE_UI_REVEAL",
        logical_control_id: str = "",
        depends_on_action_key: str | None = None,
        option_index: int | None = None,
        option_count: int | None = None,
        revisit_reason: str | None = None,
    ) -> PlannedAction | None:
        logical_id = logical_control_id or cid
        prereq = self.prerequisite_signature()
        allowed, _reason = self.ledger.should_plan_action(
            logical_control_id=logical_id,
            prerequisite_signature=prereq,
            action_kind=action_kind,
            target_value=target_value,
        )
        if not allowed:
            return None
        action = PlannedAction(
            action_key=build_action_key(base, logical_id, action_kind, target_value),
            state_digest=base,
            control_id=cid,
            control_label=label,
            control_type=control_type,
            action_kind=action_kind,
            target_value=target_value,
            classification=classification,
            parent_state_digest=base,
            logical_control_id=logical_id,
            screen_id=screen_id,
            prerequisite_signature=prereq,
            branch_path=list(self.branch_path),
            depends_on_action_key=depends_on_action_key,
            option_index=option_index,
            option_count=option_count,
            revisit_reason=revisit_reason,
        )
        if self.enqueue_action(action):
            self.ledger.mark_discovered(logical_id, prereq, action_kind=action_kind)
            return action
        return None

    def _plan_tabs(
        self,
        surface: UiSurface,
        base: str,
        screen: str,
    ) -> list[PlannedAction]:
        planned: list[PlannedAction] = []
        tabs = _sorted_controls(surface.list_tabs())
        self.counters.tabs_total = max(self.counters.tabs_total, len(tabs))
        for tab in tabs:
            if tab.get("selected"):
                continue
            label = tab.get("label") or tab.get("id") or "tab"
            if self._should_skip_section_navigation(label, "tab_select"):
                continue
            cid = tab.get("id") or label
            logical_id = str(tab.get("logicalControlId") or cid)
            action = self._make_action(
                base=base,
                screen_id=screen,
                cid=cid,
                label=label,
                control_type="TabItem",
                action_kind="tab_select",
                target_value=label,
                classification="SAFE_TAB",
                logical_control_id=logical_id,
            )
            if action:
                planned.append(action)
        return planned

    def _plan_text_fields(
        self,
        surface: UiSurface,
        base: str,
        screen: str,
    ) -> list[PlannedAction]:
        planned: list[PlannedAction] = []
        text_fields = _sorted_controls(surface.list_text_fields())
        self.counters.text_fields_discovered = max(
            self.counters.text_fields_discovered, len(text_fields)
        )
        for field in text_fields:
            cid = field.get("id") or field.get("label") or "text"
            label = field.get("label") or cid
            logical_id = str(field.get("logicalControlId") or cid)
            if field.get("readOnly"):
                self.counters.read_only_fields += 1
            action = self._make_action(
                base=base,
                screen_id=screen,
                cid=cid,
                label=label,
                control_type=str(field.get("controlType") or "Edit"),
                action_kind="text_field_focus",
                logical_control_id=logical_id,
            )
            if action:
                planned.append(action)
        return planned

    def _plan_combos(
        self,
        surface: UiSurface,
        base: str,
        screen: str,
        *,
        first_only: bool = False,
    ) -> list[PlannedAction]:
        planned: list[PlannedAction] = []
        combos = _sorted_controls(surface.list_combos(metadata_only=True))
        self.counters.combos_total = max(self.counters.combos_total, len(combos))
        prereq = self.prerequisite_signature()
        for combo in combos:
            cid = combo.get("id") or combo.get("label") or "combo"
            label = combo.get("label") or cid
            logical_id = str(combo.get("logicalControlId") or cid)
            if self.ledger.is_combo_sweep_complete(logical_id, prereq):
                continue
            action = self._make_action(
                base=base,
                screen_id=screen,
                cid=cid,
                label=label,
                control_type="ComboBox",
                action_kind="combo_open",
                logical_control_id=logical_id,
            )
            if action:
                planned.append(action)
                if first_only:
                    break
        return planned

    def _has_incomplete_section_combos(self, surface: UiSurface) -> bool:
        prereq = self.prerequisite_signature()
        for combo in _sorted_controls(surface.list_combos(metadata_only=True)):
            logical_id = str(combo.get("logicalControlId") or combo.get("id") or "")
            if logical_id and not self.ledger.is_combo_sweep_complete(logical_id, prereq):
                return True
        return False

    def plan_next_section_combo(
        self,
        surface: UiSurface,
        fp: StateFingerprint,
        *,
        base_digest: str | None = None,
        screen_id: str | None = None,
    ) -> list[PlannedAction]:
        if not self.is_section_sequential_mode() or self._active_combo_sweep:
            return []
        base = base_digest or fp.stable_digest()
        screen = screen_id or fp.screen_id()
        planned = self._plan_combos(surface, base, screen, first_only=True)
        if not planned and not self._has_incomplete_section_combos(surface):
            planned.extend(self._plan_checkboxes(surface, base, screen))
            planned.extend(self._plan_radio_groups(surface, base, screen))
            planned.extend(self._plan_buttons_scroll_dialogs(surface, base, screen))
        return planned

    def _plan_checkboxes(
        self,
        surface: UiSurface,
        base: str,
        screen: str,
    ) -> list[PlannedAction]:
        planned: list[PlannedAction] = []
        for checkbox in _sorted_controls(surface.list_checkboxes()):
            cid = checkbox.get("id") or checkbox.get("label") or "checkbox"
            label = checkbox.get("label") or cid
            logical_id = str(checkbox.get("logicalControlId") or cid)
            current = checkbox.get("checked", "unchecked")
            alt = "checked" if current != "checked" else "unchecked"
            self.counters.checkboxes_total += 1
            action = self._make_action(
                base=base,
                screen_id=screen,
                cid=cid,
                label=label,
                control_type="CheckBox",
                action_kind="checkbox_toggle",
                target_value=alt,
                logical_control_id=logical_id,
            )
            if action:
                planned.append(action)
        return planned

    def _plan_radio_groups(
        self,
        surface: UiSurface,
        base: str,
        screen: str,
    ) -> list[PlannedAction]:
        planned: list[PlannedAction] = []
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
            for choice in sorted(choices, key=lambda item: str(item.get("label") or item.get("id") or "")):
                clabel = choice.get("label") or choice.get("id")
                if clabel == selected:
                    continue
                cid = choice.get("id") or clabel
                logical_id = str(choice.get("logicalControlId") or f"{gid}:{cid}")
                action = self._make_action(
                    base=base,
                    screen_id=screen,
                    cid=cid,
                    label=clabel,
                    control_type="RadioButton",
                    action_kind="radio_select",
                    target_value=clabel,
                    logical_control_id=logical_id,
                )
                if action:
                    planned.append(action)
        return planned

    def _plan_buttons_scroll_dialogs(
        self,
        surface: UiSurface,
        base: str,
        screen: str,
    ) -> list[PlannedAction]:
        planned: list[PlannedAction] = []
        for button in surface.list_buttons():
            classification = button.get("classification", "UNKNOWN")
            if classification in BLOCKED_BUTTON_CLASSES:
                self.counters.blocked_destructive += 1
                continue
            if classification not in SAFE_BUTTON_CLASSES:
                continue
            cid = button.get("id") or button.get("label") or "button"
            label = button.get("label") or cid
            if self._should_skip_section_navigation(label, "button_invoke"):
                continue
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
                self.counters.buttons_total += 1
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
        return planned

    def plan_actions_for_surface(
        self,
        surface: UiSurface,
        fp: StateFingerprint,
        *,
        base_digest: str | None = None,
        screen_id: str | None = None,
    ) -> list[PlannedAction]:
        base = base_digest or fp.stable_digest()
        screen = screen_id or fp.screen_id()
        planned: list[PlannedAction] = []

        if self.is_section_sequential_mode():
            planned.extend(self._plan_tabs(surface, base, screen))
            planned.extend(self._plan_text_fields(surface, base, screen))
            if not self._active_combo_sweep:
                planned.extend(self._plan_combos(surface, base, screen, first_only=True))
            if not self._has_incomplete_section_combos(surface) and not self._active_combo_sweep:
                planned.extend(self._plan_checkboxes(surface, base, screen))
                planned.extend(self._plan_radio_groups(surface, base, screen))
                planned.extend(self._plan_buttons_scroll_dialogs(surface, base, screen))
        else:
            planned.extend(self._plan_tabs(surface, base, screen))
            planned.extend(self._plan_combos(surface, base, screen, first_only=False))
            planned.extend(self._plan_text_fields(surface, base, screen))
            planned.extend(self._plan_checkboxes(surface, base, screen))
            planned.extend(self._plan_radio_groups(surface, base, screen))
            planned.extend(self._plan_buttons_scroll_dialogs(surface, base, screen))

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
        *,
        screen_id: str,
        logical_control_id: str,
    ) -> list[PlannedAction]:
        planned: list[PlannedAction] = []
        self.ledger.mark_combo_enumerated(
            logical_control_id,
            self.prerequisite_signature(),
            options,
        )
        total = len(options)
        for index, option in enumerate(options, start=1):
            opt_label = str(option.get("label") or option.get("index"))
            action = self._make_action(
                base=base_digest,
                screen_id=screen_id,
                cid=combo_id,
                label=combo_label,
                control_type="ComboBox",
                action_kind="combo_select",
                target_value=opt_label,
                logical_control_id=logical_control_id,
                depends_on_action_key=open_action_key,
                option_index=index,
                option_count=total,
            )
            if action:
                planned.append(action)
        return planned

    def plan_newly_revealed_controls(
        self,
        surface: UiSurface,
        fp: StateFingerprint,
        *,
        base_digest: str | None = None,
        screen_id: str | None = None,
        revisit_reason: str = "newly_revealed",
    ) -> list[PlannedAction]:
        base = base_digest or fp.stable_digest()
        screen = screen_id or fp.screen_id()
        planned: list[PlannedAction] = []
        for combo in surface.list_combos(metadata_only=True):
            logical_id = str(combo.get("logicalControlId") or combo.get("id") or combo.get("label") or "")
            options = combo.get("options") or []
            if options and self.ledger.should_revisit_for_option_list_change(
                logical_id,
                self.prerequisite_signature(),
                options,
            ):
                action = self._make_action(
                    base=base,
                    screen_id=screen,
                    cid=str(combo.get("id") or logical_id),
                    label=str(combo.get("label") or logical_id),
                    control_type="ComboBox",
                    action_kind="combo_open",
                    logical_control_id=logical_id,
                    revisit_reason="option_list_changed",
                )
                if action:
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
            if action.option_index and action.option_count:
                return f"Testing dropdown option: {label} → {action.target_value} ({action.option_index}/{action.option_count})"
            return f"Selecting combo option: {label} → {action.target_value}"
        if kind == "text_field_focus":
            return f"Focusing text field: {label}"
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
