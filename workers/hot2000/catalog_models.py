"""Data models for HOT2000 Desktop catalog capture."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

RECORDER_VERSION = "2026.09.12.1"
CAPTURE_VERSION = "1.0.0"


@dataclass
class DropdownOption:
    index: int
    label: str
    selected: bool = False
    native_value: str | None = None
    automation_id: str | None = None
    verification: str = "captured"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CapturedControl:
    stable_id: str
    control_type: str
    uia_control_type: str | None = None
    automation_id: str | None = None
    hwnd: int | None = None
    class_name: str | None = None
    name: str | None = None
    label: str | None = None
    label_confidence: str | None = None
    value: str | None = None
    enabled: bool | None = None
    disabled: bool | None = None
    readonly: bool | None = None
    visible: bool | None = None
    focusable: bool | None = None
    focused: bool | None = None
    help_text: str | None = None
    rectangle: dict[str, int] | None = None
    checked: bool | None = None
    selected: bool | None = None
    patterns: list[str] = field(default_factory=list)
    options: list[DropdownOption] = field(default_factory=list)
    parent_hierarchy: list[str] = field(default_factory=list)
    section: str | None = None
    tab: str | None = None
    panel: str | None = None
    order: int | None = None
    verification: str = "captured"
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["options"] = [opt.to_dict() for opt in self.options]
        return data


@dataclass
class SectionCapture:
    capture_version: str = CAPTURE_VERSION
    recorder_version: str = RECORDER_VERSION
    hot2000_version: str | None = None
    captured_at: str = ""
    worker: str = ""
    section: str = "unknown"
    window_title: str = ""
    dialog_title: str | None = None
    controls: list[CapturedControl] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    inaccessible_controls: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "captureVersion": self.capture_version,
            "recorderVersion": self.recorder_version,
            "hot2000Version": self.hot2000_version,
            "capturedAt": self.captured_at,
            "worker": self.worker,
            "section": self.section,
            "windowTitle": self.window_title,
            "dialogTitle": self.dialog_title,
            "controls": [c.to_dict() for c in self.controls],
            "warnings": self.warnings,
            "inaccessibleControls": self.inaccessible_controls,
        }
