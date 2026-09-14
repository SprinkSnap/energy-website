"""Tests for HOT2000 Phase 2 section navigation and detection."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from catalog_section_navigation import (
    NavigationOutcome,
    capture_navigation_snapshot,
    detect_current_section,
    navigate_to_section,
)
from catalog_ui_interaction import automatic_scan_mode, click_with_cursor


class _ElementInfo:
    def __init__(
        self,
        *,
        control_type: str,
        automation_id: str = "",
        class_name: str = "",
        name: str = "",
    ) -> None:
        self.control_type = control_type
        self.automation_id = automation_id
        self.class_name = class_name
        self.name = name
        self.runtime_id = automation_id or name


class _Parent:
    def __init__(self, children: list["_Control"] | None = None) -> None:
        self._children = children or []

    def children(self):
        return self._children

    def parent(self):
        return None


class _Control:
    def __init__(
        self,
        *,
        label: str,
        control_type: str = "Text",
        automation_id: str = "",
        class_name: str = "",
        selected: bool = False,
        visible: bool = True,
        enabled: bool = True,
        parent: _Parent | None = None,
    ) -> None:
        self.element_info = _ElementInfo(
            control_type=control_type,
            automation_id=automation_id,
            class_name=class_name,
            name=label,
        )
        self._label = label
        self._selected = selected
        self._visible = visible
        self._enabled = enabled
        self._parent = parent or _Parent([self])

    def window_text(self):
        return self._label

    def parent(self):
        return self._parent

    def is_visible(self):
        return self._visible

    def is_enabled(self):
        return self._enabled

    def is_selected(self):
        return self._selected

    def rectangle(self):
        class _Rect:
            left = 0
            top = 0
            right = 10
            bottom = 10

        return _Rect()

    def select(self):
        self._selected = True

    def set_focus(self):
        return None

    def type_keys(self, _keys: str):
        return None


class _Window:
    def __init__(self, title: str, controls: list[_Control]) -> None:
        self._title = title
        self._controls = controls

    def window_text(self):
        return self._title

    def descendants(self):
        return list(self._controls)


class SectionNavigationTests(unittest.TestCase):
    def test_general_already_active_without_general_nav_control(self):
        window = _Window(
            "HOT2000 - Baseline",
            [
                _Control(label="Ownership", control_type="ComboBox"),
                _Control(label="Client First Name", control_type="Edit"),
                _Control(label="Street Address", control_type="Edit"),
            ],
        )
        outcome = navigate_to_section(window, "general")
        self.assertTrue(outcome.success)
        self.assertEqual(outcome.result, "already_active")

    def test_general_tabitem_activation_and_verification(self):
        general_tab = _Control(label="General", control_type="TabItem", selected=False)
        ownership = _Control(label="Ownership", control_type="ComboBox")
        window = _Window("HOT2000", [general_tab, ownership])

        def fake_detect(win):
            if general_tab.is_selected():
                from catalog_section_navigation import SectionDetection

                return SectionDetection(
                    section_id="general",
                    confidence="high",
                    score=10,
                    method="selected_navigation",
                    evidence=["selected:General"],
                )
            from catalog_section_navigation import SectionDetection

            return SectionDetection(section_id="weather", confidence="high", score=8, method="selected_navigation")

        with patch("catalog_section_navigation.detect_current_section", side_effect=fake_detect):
            with patch("catalog_section_navigation.wait_for_ui_stability"):
                outcome = navigate_to_section(window, "general")
        self.assertTrue(outcome.success)
        self.assertEqual(outcome.result, "activated")
        self.assertTrue(general_tab.is_selected())

    def test_desktop_alias_navigates_successfully(self):
        house_tab = _Control(label="House", control_type="TabItem")
        window = _Window("HOT2000", [house_tab, _Control(label="Ownership", control_type="ComboBox")])

        with patch("catalog_section_navigation.detect_current_section") as detect:
            detect.side_effect = [
                detect.return_value if False else __import__("catalog_section_navigation").SectionDetection(
                    "weather", "high", 8, "selected_navigation"
                ),
                __import__("catalog_section_navigation").SectionDetection(
                    "general", "high", 10, "selected_navigation", ["selected:House"]
                ),
            ]
            with patch("catalog_section_navigation.wait_for_ui_stability"):
                outcome = navigate_to_section(window, "general")
        self.assertTrue(outcome.success)

    def test_prefers_navigation_candidate_over_content_general_label(self):
        field = _Control(label="General", control_type="Edit")
        tab = _Control(label="General", control_type="TabItem")
        window = _Window("HOT2000", [field, tab, _Control(label="Ownership", control_type="ComboBox")])

        candidates = __import__("catalog_section_navigation")._find_navigation_candidates(window, "general")
        self.assertTrue(candidates)
        self.assertEqual(candidates[0][1], "TabItem")

    def test_unsupported_page_fails_with_diagnostics(self):
        window = _Window("HOT2000", [_Control(label="Unknown Panel", control_type="Pane")])
        outcome = navigate_to_section(window, "weather")
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.result, "failed")
        self.assertIsNotNone(outcome.diagnostics)
        self.assertIn("candidateControls", outcome.diagnostics or {})

    def test_activation_unverified_does_not_succeed(self):
        tab = _Control(label="General", control_type="TabItem")
        window = _Window("HOT2000", [tab])
        calls = {"count": 0}

        def fake_detect(_win):
            calls["count"] += 1
            if calls["count"] <= 2:
                return __import__("catalog_section_navigation").SectionDetection(
                    None, "none", 0, "unknown"
                )
            return __import__("catalog_section_navigation").SectionDetection(
                "weather", "high", 8, "selected_navigation"
            )

        with patch("catalog_section_navigation.detect_current_section", side_effect=fake_detect):
            with patch("catalog_section_navigation.wait_for_ui_stability"):
                outcome = navigate_to_section(window, "general")
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.result, "activation_unverified")

    def test_automatic_scan_disables_physical_mouse(self):
        with patch.dict("os.environ", {"HOT2000_RECORDER_VISIBLE_INTERACTION": ""}, clear=False):
            self.assertTrue(automatic_scan_mode())
        with patch.dict("os.environ", {"HOT2000_RECORDER_VISIBLE_INTERACTION": ""}, clear=False):
            with self.assertRaises(RuntimeError):
                click_with_cursor(_Control(label="General", control_type="Button"))

    def test_capture_navigation_snapshot_includes_candidates(self):
        window = _Window(
            "HOT2000",
            [
                _Control(label="General", control_type="TabItem", selected=True),
                _Control(label="Ownership", control_type="ComboBox"),
            ],
        )
        snapshot = capture_navigation_snapshot(window)
        self.assertEqual(snapshot["windowTitle"], "HOT2000")
        self.assertTrue(snapshot["candidateControls"])
        self.assertEqual(snapshot["currentSectionDetection"]["sectionId"], "general")


if __name__ == "__main__":
    unittest.main()
