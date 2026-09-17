"""Scan accounting invariants and terminal result classification."""

from __future__ import annotations

from typing import Any

TERMINAL_SCAN_STATUSES = frozenset(
    {
        "complete",
        "complete_with_gaps",
        "partial",
        "failed",
        "paused",
        "stopped_partial",
        "completed_with_limits",
    }
)


def accounting_bucket(status: str) -> str:
    if status in {"completed", "running"}:
        return "completed"
    if status in {"failed", "blocked"}:
        return "failed"
    if status in {"skipped"}:
        return "skipped"
    if status in {"pending", "retryable"}:
        return "pending"
    return "completed"


def build_accounting_summary(
    items: dict[str, dict[str, Any]],
    *,
    kind: str,
) -> dict[str, int]:
    discovered = len(items)
    completed = sum(1 for i in items.values() if accounting_bucket(i.get("status", "pending")) == "completed")
    failed = sum(1 for i in items.values() if accounting_bucket(i.get("status", "pending")) == "failed")
    skipped = sum(1 for i in items.values() if accounting_bucket(i.get("status", "pending")) == "skipped")
    pending = sum(1 for i in items.values() if accounting_bucket(i.get("status", "pending")) == "pending")
    return {
        f"{kind}Discovered": discovered,
        f"{kind}Completed": completed,
        f"{kind}Failed": failed,
        f"{kind}Skipped": skipped,
        f"{kind}Pending": pending,
    }


def verify_accounting_invariant(summary: dict[str, int], kind: str) -> bool:
    discovered = summary.get(f"{kind}Discovered", 0)
    total = (
        summary.get(f"{kind}Completed", 0)
        + summary.get(f"{kind}Failed", 0)
        + summary.get(f"{kind}Skipped", 0)
        + summary.get(f"{kind}Pending", 0)
    )
    return total == discovered


def progress_percent_from_accounting(
    actions: dict[str, dict[str, Any]],
    states: dict[str, dict[str, Any]],
) -> int:
    action_summary = build_accounting_summary(actions, kind="actions")
    state_summary = build_accounting_summary(states, kind="states")
    discovered = action_summary["actionsDiscovered"] + state_summary["statesDiscovered"]
    done = action_summary["actionsCompleted"] + state_summary["statesCompleted"]
    if discovered <= 0:
        return 0
    return int(round(min(1.0, done / discovered) * 100))


def classify_scan_result(state: Any) -> str:
    """Classify terminal scan result from ScanState-like object."""
    screens = getattr(state, "screens", {}) or {}
    inaccessible = getattr(state, "inaccessible_records", None) or []
    failed_actions = [
        a
        for a in (getattr(state, "actions", {}) or {}).values()
        if a.get("status") == "failed"
    ]
    partial_screens = [
        s for s in screens.values() if s.get("status") in {"partial", "guided-captured"}
    ]
    completion_reason = getattr(state, "completion_reason", None) or ""
    raw_status = getattr(state, "status", "")

    if raw_status in {"paused"}:
        return "paused"
    if raw_status in {"stopped-partial", "stopped_partial"}:
        return "stopped_partial"
    if raw_status == "failed":
        return "failed"
    if completion_reason and completion_reason not in {"queue_drained", None, ""}:
        if raw_status == "completed_with_limits":
            return "partial"
        return "partial"

    has_gaps = bool(partial_screens) or bool(inaccessible) or bool(failed_actions)
    if has_gaps:
        return "complete_with_gaps"
    return "complete"
