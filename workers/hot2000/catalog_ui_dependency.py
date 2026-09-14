"""Before/after UI dependency deltas for Phase 2 dropdown branches."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def _control_key(ctrl: dict[str, Any]) -> str:
    return str(
        ctrl.get("logicalControlId")
        or ctrl.get("stableId")
        or ctrl.get("id")
        or ctrl.get("label")
        or ctrl.get("name")
        or ""
    )


def snapshot_controls(controls: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    snapshot: dict[str, dict[str, Any]] = {}
    for ctrl in controls:
        key = _control_key(ctrl)
        if not key:
            continue
        snapshot[key] = {
            "logicalControlId": ctrl.get("logicalControlId") or key,
            "label": ctrl.get("label") or ctrl.get("name"),
            "controlType": ctrl.get("controlType"),
            "value": ctrl.get("value"),
            "enabled": ctrl.get("enabled"),
            "visible": ctrl.get("visible"),
            "readOnly": ctrl.get("readOnly"),
            "options": ctrl.get("options"),
        }
    return snapshot


def compute_dependency_delta(
    before: dict[str, dict[str, Any]],
    after: dict[str, dict[str, Any]],
    *,
    source_control_id: str,
    source_label: str,
    selected_option_label: str,
    selected_option_ui_index: int | None,
) -> dict[str, Any]:
    before_keys = set(before)
    after_keys = set(after)

    controls_added = sorted(after_keys - before_keys)
    controls_removed = sorted(before_keys - after_keys)
    controls_shown = []
    controls_hidden = []
    controls_enabled = []
    controls_disabled = []
    controls_read_only_changed = []
    values_changed = []
    labels_changed = []
    combo_option_lists_changed = []

    for key in before_keys & after_keys:
        b = before[key]
        a = after[key]
        if bool(b.get("visible")) is False and bool(a.get("visible")) is True:
            controls_shown.append(key)
        if bool(b.get("visible")) is True and bool(a.get("visible")) is False:
            controls_hidden.append(key)
        if bool(b.get("enabled")) is False and bool(a.get("enabled")) is True:
            controls_enabled.append(key)
        if bool(b.get("enabled")) is True and bool(a.get("enabled")) is False:
            controls_disabled.append(key)
        if b.get("readOnly") != a.get("readOnly"):
            controls_read_only_changed.append(
                {"controlId": key, "before": b.get("readOnly"), "after": a.get("readOnly")}
            )
        if b.get("value") != a.get("value"):
            values_changed.append(
                {"controlId": key, "before": b.get("value"), "after": a.get("value")}
            )
        if b.get("label") != a.get("label"):
            labels_changed.append(
                {"controlId": key, "before": b.get("label"), "after": a.get("label")}
            )
        b_opts = b.get("options") or []
        a_opts = a.get("options") or []
        if b_opts != a_opts:
            combo_option_lists_changed.append(
                {
                    "affectedControlId": key,
                    "beforeOptions": b_opts,
                    "afterOptions": a_opts,
                }
            )

    return {
        "sourceControlId": source_control_id,
        "sourceLabel": source_label,
        "selectedOptionLabel": selected_option_label,
        "selectedOptionUiIndex": selected_option_ui_index,
        "controlsAdded": controls_added,
        "controlsRemoved": controls_removed,
        "controlsShown": controls_shown,
        "controlsHidden": controls_hidden,
        "controlsEnabled": controls_enabled,
        "controlsDisabled": controls_disabled,
        "controlsReadOnlyChanged": controls_read_only_changed,
        "valuesChanged": values_changed,
        "labelsChanged": labels_changed,
        "comboOptionListsChanged": combo_option_lists_changed,
        "tabsAdded": [],
        "tabsRemoved": [],
        "dialogsOpened": [],
        "groupsChanged": [],
    }


def option_list_hash(options: list[dict[str, Any]]) -> str:
    labels = [str(opt.get("label") or opt.get("index") or "") for opt in options]
    payload = json.dumps(labels, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
