"""Data models for HOT2000 H2K probe (Phase 3)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

PROBE_VERSION = "1.0.0"


@dataclass
class ProbeItem:
    control_id: str
    screen_key: str
    section: str
    fixture_id: str
    control_type: str
    label: str | None = None
    probe_class: str = "MANUAL_REVIEW"
    original_value: str | None = None
    probe_value: str | None = None
    option_index: int | None = None
    option_label: str | None = None
    prerequisites: list[dict[str, Any]] = field(default_factory=list)
    status: str = "pending"
    attempts: int = 0
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MappingEvidence:
    baseline_value: str | None = None
    probe_ui_value: str | None = None
    probe_stored_value: str | None = None
    baseline_hash: str | None = None
    result_hash: str | None = None
    diff_file: str | None = None
    raw_diff: dict[str, Any] | None = None
    filtered_diff: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class FieldMapping:
    control_id: str
    screen_key: str
    label: str | None
    fixture_id: str
    hot2000_version: str | None
    mapping: dict[str, Any]
    evidence: MappingEvidence
    status: str = "mapped"
    side_effects: list[dict[str, Any]] = field(default_factory=list)
    program_mode: str | None = None
    probe_version: str = PROBE_VERSION

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["evidence"] = self.evidence.to_dict()
        return data


@dataclass
class ProbeQueueState:
    probe_id: str
    hot2000_version: str | None = None
    fixture_id: str = "baseline-general"
    section_filter: str | None = None
    control_filter: str | None = None
    status: str = "pending"
    current_item_id: str | None = None
    items: list[ProbeItem] = field(default_factory=list)
    completed: list[FieldMapping] = field(default_factory=list)
    skipped: list[dict[str, Any]] = field(default_factory=list)
    conflicts: list[dict[str, Any]] = field(default_factory=list)
    totals: dict[str, int] = field(default_factory=dict)

    def update_totals(self) -> None:
        pending = sum(1 for i in self.items if i.status == "pending")
        mapped = len(self.completed)
        self.totals = {
            "eligible": sum(1 for i in self.items if i.probe_class.startswith("SAFE_")),
            "pending": pending,
            "mapped": mapped,
            "skipped": len(self.skipped),
            "ambiguous": sum(
                1 for m in self.completed if m.mapping.get("confidence") == "ambiguous"
            ),
            "exact": sum(
                1 for m in self.completed if m.mapping.get("confidence") == "exact"
            ),
            "high": sum(
                1 for m in self.completed if m.mapping.get("confidence") == "high"
            ),
            "medium": sum(
                1 for m in self.completed if m.mapping.get("confidence") == "medium"
            ),
            "failed": sum(1 for i in self.items if i.status == "failed"),
            "noChange": sum(1 for i in self.items if i.status == "no-change"),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "probeId": self.probe_id,
            "hot2000Version": self.hot2000_version,
            "fixtureId": self.fixture_id,
            "sectionFilter": self.section_filter,
            "controlFilter": self.control_filter,
            "currentItemId": self.current_item_id,
            "status": self.status,
            "items": [i.to_dict() for i in self.items],
            "completed": [m.to_dict() for m in self.completed],
            "skipped": self.skipped,
            "conflicts": self.conflicts,
            "totals": self.totals,
        }
