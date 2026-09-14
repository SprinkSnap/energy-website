"""Deterministic control visitation ledger for Phase 2 exhaustive crawler."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


REVISIT_REASONS = frozenset(
    {
        "newly_revealed",
        "option_list_changed",
        "enabled_changed",
        "prerequisite_changed",
        "retry_inaccessible",
    }
)


def hash_option_list(options: list[dict[str, Any]]) -> str:
    labels = [str(opt.get("label") or opt.get("index") or "") for opt in options]
    payload = json.dumps(labels, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def hash_prerequisite_signature(branch_path: list[dict[str, Any]]) -> str:
    payload = json.dumps(branch_path, separators=(",", ":"), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


@dataclass
class ControlVisitationRecord:
    logical_control_id: str
    prerequisite_signature: str = ""
    discovered: bool = False
    focused: bool = False
    options_enumerated: bool = False
    option_list_hash: str = ""
    option_branches_total: int = 0
    option_branches_completed: int = 0
    option_branches_failed: int = 0
    options_completed: set[str] = field(default_factory=set)
    dependency_states_observed: set[str] = field(default_factory=set)
    restored: bool = False
    completed: bool = False
    revisit_reason: str | None = None
    last_action_kind: str | None = None

    def ledger_key(self) -> str:
        return f"{self.logical_control_id}::{self.prerequisite_signature}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "logicalControlId": self.logical_control_id,
            "prerequisiteSignature": self.prerequisite_signature,
            "discovered": self.discovered,
            "focused": self.focused,
            "optionsEnumerated": self.options_enumerated,
            "optionListHash": self.option_list_hash,
            "optionBranchesTotal": self.option_branches_total,
            "optionBranchesCompleted": self.option_branches_completed,
            "optionBranchesFailed": self.option_branches_failed,
            "optionsCompleted": sorted(self.options_completed),
            "dependencyStatesObserved": sorted(self.dependency_states_observed),
            "restored": self.restored,
            "completed": self.completed,
            "revisitReason": self.revisit_reason,
            "lastActionKind": self.last_action_kind,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ControlVisitationRecord:
        return cls(
            logical_control_id=str(data.get("logicalControlId") or ""),
            prerequisite_signature=str(data.get("prerequisiteSignature") or ""),
            discovered=bool(data.get("discovered")),
            focused=bool(data.get("focused")),
            options_enumerated=bool(data.get("optionsEnumerated")),
            option_list_hash=str(data.get("optionListHash") or ""),
            option_branches_total=int(data.get("optionBranchesTotal") or 0),
            option_branches_completed=int(data.get("optionBranchesCompleted") or 0),
            option_branches_failed=int(data.get("optionBranchesFailed") or 0),
            options_completed=set(data.get("optionsCompleted") or []),
            dependency_states_observed=set(data.get("dependencyStatesObserved") or []),
            restored=bool(data.get("restored")),
            completed=bool(data.get("completed")),
            revisit_reason=data.get("revisitReason"),
            last_action_kind=data.get("lastActionKind"),
        )


class VisitationLedger:
    def __init__(self) -> None:
        self.records: dict[str, ControlVisitationRecord] = {}
        self.suppressed_actions: list[dict[str, str]] = []

    def restore(self, data: dict[str, Any] | None) -> None:
        if not data:
            return
        for key, raw in (data.get("records") or {}).items():
            if isinstance(raw, dict):
                self.records[key] = ControlVisitationRecord.from_dict(raw)
        self.suppressed_actions = list(data.get("suppressedActions") or [])

    def export(self) -> dict[str, Any]:
        return {
            "records": {k: v.to_dict() for k, v in self.records.items()},
            "suppressedActions": self.suppressed_actions[-250:],
        }

    def _get(
        self,
        logical_control_id: str,
        prerequisite_signature: str,
    ) -> ControlVisitationRecord:
        key = f"{logical_control_id}::{prerequisite_signature}"
        record = self.records.get(key)
        if record is None:
            record = ControlVisitationRecord(
                logical_control_id=logical_control_id,
                prerequisite_signature=prerequisite_signature,
            )
            self.records[key] = record
        return record

    def should_plan_action(
        self,
        *,
        logical_control_id: str,
        prerequisite_signature: str,
        action_kind: str,
        target_value: str = "",
    ) -> tuple[bool, str | None]:
        record = self._get(logical_control_id, prerequisite_signature)
        if action_kind == "combo_open":
            if record.options_enumerated and record.completed:
                self._suppress("already completed", logical_control_id, action_kind)
                return False, "already completed"
            return True, None
        if action_kind == "combo_select":
            if target_value in record.options_completed:
                self._suppress("option already tested", logical_control_id, action_kind)
                return False, "option already tested"
            return True, None
        if action_kind == "text_field_focus":
            if record.focused:
                self._suppress("text field already visited", logical_control_id, action_kind)
                return False, "text field already visited"
            return True, None
        if action_kind in {"checkbox_toggle", "radio_select"}:
            if record.completed:
                self._suppress("branch already completed", logical_control_id, action_kind)
                return False, "branch already completed"
            return True, None
        if action_kind == "tab_select":
            if record.completed:
                self._suppress("tab already completed", logical_control_id, action_kind)
                return False, "tab already completed"
            return True, None
        if record.completed and action_kind not in {"scroll_down", "dialog_visit", "button_invoke"}:
            self._suppress("already completed", logical_control_id, action_kind)
            return False, "already completed"
        return True, None

    def mark_discovered(
        self,
        logical_control_id: str,
        prerequisite_signature: str,
        *,
        action_kind: str,
    ) -> None:
        record = self._get(logical_control_id, prerequisite_signature)
        record.discovered = True
        record.last_action_kind = action_kind

    def mark_combo_enumerated(
        self,
        logical_control_id: str,
        prerequisite_signature: str,
        options: list[dict[str, Any]],
    ) -> None:
        record = self._get(logical_control_id, prerequisite_signature)
        record.options_enumerated = True
        record.option_list_hash = hash_option_list(options)
        record.option_branches_total = len(options)

    def mark_option_completed(
        self,
        logical_control_id: str,
        prerequisite_signature: str,
        option_label: str,
        *,
        failed: bool = False,
    ) -> None:
        record = self._get(logical_control_id, prerequisite_signature)
        record.options_completed.add(option_label)
        if failed:
            record.option_branches_failed += 1
        else:
            record.option_branches_completed += 1
        if (
            record.option_branches_total > 0
            and len(record.options_completed) >= record.option_branches_total
        ):
            record.completed = True

    def mark_focused(self, logical_control_id: str, prerequisite_signature: str) -> None:
        record = self._get(logical_control_id, prerequisite_signature)
        record.focused = True
        record.completed = True

    def mark_completed(
        self,
        logical_control_id: str,
        prerequisite_signature: str,
        *,
        action_kind: str,
        restored: bool = False,
    ) -> None:
        record = self._get(logical_control_id, prerequisite_signature)
        record.completed = True
        record.restored = restored or record.restored
        record.last_action_kind = action_kind

    def should_revisit_for_option_list_change(
        self,
        logical_control_id: str,
        prerequisite_signature: str,
        options: list[dict[str, Any]],
    ) -> bool:
        record = self._get(logical_control_id, prerequisite_signature)
        new_hash = hash_option_list(options)
        if not record.option_list_hash:
            return True
        if new_hash != record.option_list_hash:
            record.revisit_reason = "option_list_changed"
            record.options_enumerated = False
            record.completed = False
            record.option_list_hash = new_hash
            return True
        return False

    def _suppress(self, reason: str, logical_control_id: str, action_kind: str) -> None:
        self.suppressed_actions.append(
            {
                "reason": reason,
                "logicalControlId": logical_control_id,
                "actionKind": action_kind,
            }
        )
