"""State and action fingerprinting for HOT2000 UI crawler."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any

from catalog_control_locator import TRANSIENT_CONTROL_TYPES


def _norm(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


@dataclass
class ControlSnapshot:
    control_type: str
    automation_id: str = ""
    class_name: str = ""
    name: str = ""
    label: str = ""
    value: str = ""
    checked: str = ""  # true|false|indeterminate|empty
    selected: str = ""
    enabled: bool = True
    visible: bool = True

    def identity(self) -> str:
        return (
            f"{self.control_type}|{self.automation_id}|{self.class_name}|"
            f"{_norm(self.name)}|{_norm(self.label)}"
        )


@dataclass
class StateFingerprint:
    process_id: int | None = None
    window_class: str = ""
    window_title: str = ""
    dialog_title: str = ""
    selected_tabs: list[str] = field(default_factory=list)
    controls: list[ControlSnapshot] = field(default_factory=list)
    modal_owner: str = ""
    hot2000_version: str | None = None

    def stable_controls(self) -> list[ControlSnapshot]:
        stable: list[ControlSnapshot] = []
        for ctrl in self.controls:
            if ctrl.control_type in TRANSIENT_CONTROL_TYPES:
                continue
            stable.append(ctrl)
        return stable

    def digest(self, *, include_values: bool = False) -> str:
        parts = [
            str(self.process_id or 0),
            _norm(self.window_class),
            _norm(self.window_title),
            _norm(self.dialog_title),
            "|".join(sorted(_norm(t) for t in self.selected_tabs)),
            _norm(self.modal_owner),
            self.hot2000_version or "unknown",
        ]
        for ctrl in sorted(self.stable_controls(), key=lambda c: c.identity()):
            if include_values:
                parts.append(
                    f"{ctrl.identity()}:{ctrl.value}:{ctrl.checked}:{ctrl.selected}:"
                    f"{int(ctrl.enabled)}:{int(ctrl.visible)}"
                )
            else:
                parts.append(
                    f"{ctrl.identity()}:{int(ctrl.enabled)}:{int(ctrl.visible)}"
                )
        return hashlib.sha256("::".join(parts).encode("utf-8")).hexdigest()

    def stable_digest(self) -> str:
        return self.digest(include_values=False)

    def key(self) -> str:
        version = self.hot2000_version or "unknown"
        slug_source = self.dialog_title or self.window_title or "screen"
        slug = re.sub(r"[^a-z0-9]+", "-", slug_source.strip().lower()).strip("-") or "screen"
        if self.selected_tabs:
            slug = f"{slug}-{'-'.join(self.selected_tabs[:3])}"
        return f"{version}::{slug}::{self.stable_digest()[:16]}"

    def screen_id(self) -> str:
        version = self.hot2000_version or "unknown"
        slug_source = self.dialog_title or self.window_title or "screen"
        slug = re.sub(r"[^a-z0-9]+", "-", slug_source.strip().lower()).strip("-") or "screen"
        if self.selected_tabs:
            slug = f"{slug}-{'-'.join(self.selected_tabs[:3])}"
        return f"{version}::{slug}"


def build_action_key(
    state_digest: str,
    control_identity: str,
    action_kind: str,
    target_value: str = "",
) -> str:
    raw = f"{state_digest}::{control_identity}::{action_kind}::{target_value}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


ACTION_STATUSES = frozenset(
    {"pending", "running", "completed", "failed", "skipped", "blocked", "retryable"}
)
