"""
Semantic XML diff for HOT2000 H2K files.

Uses ElementTree — not regex — for reliable structure comparison.
"""

from __future__ import annotations

import hashlib
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any


# Paths known to change on save without reflecting UI control probes.
IGNORED_GENERATED_PATHS = frozenset(
    {
        "/HouseFile/AllResults",
        "/HouseFile/Application/Version",
    }
)

IGNORED_PATH_PATTERNS = (
    re.compile(r"^/HouseFile/AllResults"),
    re.compile(r"@evaluationDate$"),
    re.compile(r"@lastSaved"),
    re.compile(r"@savedAt"),
)


PROBE_VERSION = "1.0.0"


@dataclass
class XmlChange:
    path: str
    change_type: str  # attribute-changed, text-changed, element-added, element-removed
    before: str | None = None
    after: str | None = None
    attribute: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "changeType": self.change_type,
            "before": self.before,
            "after": self.after,
            "attribute": self.attribute,
        }


@dataclass
class XmlDiffResult:
    raw_changes: list[XmlChange] = field(default_factory=list)
    filtered_changes: list[XmlChange] = field(default_factory=list)
    ignored_generated_changes: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "rawChanges": len(self.raw_changes),
            "ignoredGeneratedChanges": self.ignored_generated_changes,
            "candidateChanges": len(self.filtered_changes),
            "changes": [c.to_dict() for c in self.filtered_changes],
            "raw": [c.to_dict() for c in self.raw_changes],
        }


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _node_path(elem: ET.Element, parent_path: str, index_map: dict[str, int]) -> str:
    name = _local_name(elem.tag)
    elem_id = elem.attrib.get("id")
    if elem_id:
        return f"{parent_path}/{name}[@id='{elem_id}']"
    siblings = index_map.get(f"{parent_path}/{name}", 0)
    index_map[f"{parent_path}/{name}"] = siblings + 1
    if siblings:
        return f"{parent_path}/{name}[{siblings}]"
    return f"{parent_path}/{name}"


def _flatten_xml(xml_text: str) -> dict[str, dict[str, Any]]:
    root = ET.fromstring(xml_text)
    flat: dict[str, dict[str, Any]] = {}

    def walk(elem: ET.Element, parent: str, index_map: dict[str, int]) -> None:
        path = _node_path(elem, parent, index_map)
        text = (elem.text or "").strip()
        attrs = dict(elem.attrib)
        flat[path] = {"text": text, "attrs": attrs}
        child_index: dict[str, int] = {}
        for child in list(elem):
            walk(child, path, child_index)

    walk(root, "", {})
    return flat


def _is_ignored_path(path: str) -> bool:
    for prefix in IGNORED_GENERATED_PATHS:
        if path.startswith(prefix):
            return True
    for pattern in IGNORED_PATH_PATTERNS:
        if pattern.search(path):
            return True
    return False


def diff_h2k_xml(before_xml: str, after_xml: str) -> XmlDiffResult:
    before = _flatten_xml(before_xml)
    after = _flatten_xml(after_xml)
    result = XmlDiffResult()
    all_paths = sorted(set(before) | set(after))

    for path in all_paths:
        b = before.get(path)
        a = after.get(path)
        if b is None and a is not None:
            change = XmlChange(path=path, change_type="element-added", after=str(a))
            result.raw_changes.append(change)
        elif a is None and b is not None:
            change = XmlChange(path=path, change_type="element-removed", before=str(b))
            result.raw_changes.append(change)
        elif b and a:
            for attr, val in a["attrs"].items():
                old = b["attrs"].get(attr)
                if old != val:
                    result.raw_changes.append(
                        XmlChange(
                            path=f"{path}/@{attr}",
                            change_type="attribute-changed",
                            attribute=attr,
                            before=old,
                            after=val,
                        )
                    )
            if b["text"] != a["text"] and (b["text"] or a["text"]):
                result.raw_changes.append(
                    XmlChange(
                        path=path,
                        change_type="text-changed",
                        before=b["text"],
                        after=a["text"],
                    )
                )

    for change in result.raw_changes:
        if _is_ignored_path(change.path):
            result.ignored_generated_changes += 1
        else:
            result.filtered_changes.append(change)

    return result


def assess_mapping_confidence(changes: list[XmlChange]) -> str:
    if not changes:
        return "none"
    if len(changes) == 1:
        return "exact"
    attr_changes = [c for c in changes if c.change_type == "attribute-changed"]
    if len(attr_changes) == 1 and len(changes) <= 3:
        return "high"
    if len(changes) <= 3:
        return "medium"
    return "ambiguous"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
