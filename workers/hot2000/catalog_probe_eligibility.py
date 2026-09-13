"""Probe eligibility classification for captured HOT2000 controls."""

from __future__ import annotations

from typing import Any

SAFE_PROBE_CLASSES = frozenset(
    {
        "SAFE_TEXT",
        "SAFE_NUMBER",
        "SAFE_CHECKBOX",
        "SAFE_RADIO",
        "SAFE_SELECT",
        "SAFE_CODED_SELECT",
    }
)

SKIP_CLASSES = frozenset(
    {
        "NAVIGATION_ONLY",
        "DESTRUCTIVE",
        "COMPUTED_READONLY",
        "UNSUPPORTED",
        "MANUAL_REVIEW",
        "CONDITIONAL",
    }
)

COMBO_TYPES = frozenset({"ComboBox", "List", "ListBox"})
TEXT_TYPES = frozenset({"Edit", "Document"})
CHECK_TYPES = frozenset({"CheckBox"})
RADIO_TYPES = frozenset({"RadioButton"})
SKIP_CONTROL_TYPES = frozenset(
    {"Button", "SplitButton", "MenuItem", "TabItem", "TreeItem", "Hyperlink", "ToolBar"}
)


def classify_probe_eligibility(control: dict[str, Any]) -> tuple[str, str]:
    """Return (probe_class, reason)."""
    ctype = str(control.get("controlType") or control.get("control_type") or "")
    label = str(control.get("label") or control.get("name") or "").lower()
    readonly = control.get("readonly") or control.get("readOnly")
    disabled = control.get("disabled")
    verification = str(control.get("verification") or "")

    if verification in {"inaccessible", "unsupported", "manual-review"}:
        return "UNSUPPORTED", f"verification={verification}"

    if ctype in SKIP_CONTROL_TYPES:
        return "NAVIGATION_ONLY", f"control_type={ctype}"

    if readonly or control.get("readonly") is True:
        return "COMPUTED_READONLY", "readonly control"

    if disabled:
        return "CONDITIONAL", "disabled — may require prerequisite state"

    destructive_words = ("delete", "remove", "calculate", "save", "import", "export", "add")
    if any(word in label for word in destructive_words):
        return "DESTRUCTIVE", f"label suggests destructive action: {label}"

    if ctype in CHECK_TYPES:
        return "SAFE_CHECKBOX", "checkbox toggle probe"
    if ctype in RADIO_TYPES:
        return "SAFE_RADIO", "radio selection probe"
    if ctype in COMBO_TYPES:
        return "SAFE_CODED_SELECT", "dropdown option probe"
    if ctype in TEXT_TYPES:
        value = str(control.get("value") or "")
        if value.replace(".", "", 1).isdigit():
            return "SAFE_NUMBER", "numeric edit probe"
        return "SAFE_TEXT", "text edit probe"

    return "MANUAL_REVIEW", f"unclassified control type {ctype}"


def is_probe_eligible(probe_class: str) -> bool:
    return probe_class in SAFE_PROBE_CLASSES


def choose_probe_value(probe_class: str, original: str | None) -> str | None:
    if probe_class == "SAFE_TEXT":
        return "H2K_PROBE_7F3A"
    if probe_class == "SAFE_NUMBER":
        try:
            base = float(original or "20")
            return str(base + 1.25)
        except ValueError:
            return "21.25"
    if probe_class == "SAFE_CHECKBOX":
        return "toggle"
    return None
