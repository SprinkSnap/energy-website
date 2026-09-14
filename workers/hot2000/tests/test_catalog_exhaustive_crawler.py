"""Regression tests for Phase 2 exhaustive deterministic crawler."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from catalog_control_locator import build_control_locator, build_screen_id
from catalog_ui_crawler_engine import CrawlEngine, CrawlLimits, PlannedAction
from catalog_ui_fingerprint import ControlSnapshot, StateFingerprint
from catalog_ui_interaction import automatic_scan_mode, click_with_cursor
from catalog_visitation_ledger import VisitationLedger, hash_option_list


class _FakeElementInfo:
    def __init__(
        self,
        *,
        control_type: str = "ComboBox",
        automation_id: str = "",
        class_name: str = "ComboBox",
        name: str = "Region",
        runtime_id: str = "1",
    ) -> None:
        self.control_type = control_type
        self.automation_id = automation_id
        self.class_name = class_name
        self.name = name
        self.runtime_id = runtime_id


class _FakeParent:
    def __init__(self, children: list["_FakeControl"]) -> None:
        self._children = children

    def children(self):
        return self._children

    def parent(self):
        return None


class _FakeControl:
    def __init__(
        self,
        *,
        label: str,
        automation_id: str = "",
        control_type: str = "ComboBox",
        ordinal: int = 0,
        siblings: list["_FakeControl"] | None = None,
    ) -> None:
        self.element_info = _FakeElementInfo(
            control_type=control_type,
            automation_id=automation_id,
            name=label,
        )
        self._label = label
        self._ordinal = ordinal
        self._parent = _FakeParent(siblings or [self])

    def window_text(self):
        return self._label

    def parent(self):
        return self._parent

    def is_visible(self):
        return True

    def is_enabled(self):
        return True

    def rectangle(self):
        class _Rect:
            left = 0
            top = 0
            right = 10
            bottom = 10

        return _Rect()


class ExhaustiveCrawlerTests(unittest.TestCase):
    def test_distinct_region_controls_with_blank_automation_id(self):
        region_a = _FakeControl(label="Region", automation_id="", ordinal=0)
        region_b = _FakeControl(label="Region", automation_id="", ordinal=1)
        region_a._parent = _FakeParent([region_a, region_b])
        region_b._parent = region_a._parent

        locator_a = build_control_locator(
            region_a,
            window_title="HOT2000",
            section="general",
            tab_breadcrumb=["Identification"],
        )
        locator_b = build_control_locator(
            region_b,
            window_title="HOT2000",
            section="weather",
            tab_breadcrumb=["Location"],
        )
        self.assertNotEqual(locator_a.logical_control_id, locator_b.logical_control_id)

    def test_ownership_swept_once_under_same_prerequisite(self):
        ledger = VisitationLedger()
        allowed, _ = ledger.should_plan_action(
            logical_control_id="general > identification > ownership",
            prerequisite_signature="root",
            action_kind="combo_open",
        )
        self.assertTrue(allowed)
        ledger.mark_combo_enumerated(
            "general > identification > ownership",
            "root",
            [{"label": "Owned"}, {"label": "Rented"}],
        )
        ledger.mark_option_completed("general > identification > ownership", "root", "Owned")
        ledger.mark_option_completed("general > identification > ownership", "root", "Rented")
        allowed, reason = ledger.should_plan_action(
            logical_control_id="general > identification > ownership",
            prerequisite_signature="root",
            action_kind="combo_open",
        )
        self.assertFalse(allowed)
        self.assertEqual(reason, "already completed")

    def test_region_not_reopened_for_unrelated_state_change(self):
        ledger = VisitationLedger()
        ledger.mark_combo_enumerated(
            "weather > location > region",
            "root",
            [{"label": "Ontario"}, {"label": "Quebec"}],
        )
        ledger.mark_option_completed("weather > location > region", "root", "Ontario")
        ledger.mark_option_completed("weather > location > region", "root", "Quebec")
        allowed, _ = ledger.should_plan_action(
            logical_control_id="weather > location > region",
            prerequisite_signature="root",
            action_kind="combo_open",
        )
        self.assertFalse(allowed)

    def test_region_revisited_when_option_list_changes(self):
        ledger = VisitationLedger()
        ledger.mark_combo_enumerated(
            "weather > location > region",
            "root",
            [{"label": "Ontario"}],
        )
        changed = ledger.should_revisit_for_option_list_change(
            "weather > location > region",
            "root",
            [{"label": "Ontario"}, {"label": "Quebec"}],
        )
        self.assertTrue(changed)
        allowed, _ = ledger.should_plan_action(
            logical_control_id="weather > location > region",
            prerequisite_signature="root",
            action_kind="combo_open",
        )
        self.assertTrue(allowed)

    def test_combo_option_hash_stable(self):
        first = hash_option_list([{"label": "A"}, {"label": "B"}])
        second = hash_option_list([{"label": "A"}, {"label": "B"}])
        third = hash_option_list([{"label": "A"}, {"label": "C"}])
        self.assertEqual(first, second)
        self.assertNotEqual(first, third)

    def test_automatic_scan_mode_blocks_physical_click(self):
        with patch.dict("os.environ", {"HOT2000_RECORDER_VISIBLE_INTERACTION": ""}, clear=False):
            self.assertTrue(automatic_scan_mode())

            class _Control:
                def click_input(self):
                    raise AssertionError("click_input should not be called")

            with self.assertRaises(RuntimeError):
                click_with_cursor(_Control())

    def test_stable_fingerprint_ignores_transient_list_items(self):
        fp = StateFingerprint(
            window_title="HOT2000",
            selected_tabs=["General"],
            controls=[
                ControlSnapshot("ComboBox", label="Region", value="ONTARIO"),
                ControlSnapshot("ListItem", label="ONTARIO"),
                ControlSnapshot("ListItem", label="QUEBEC"),
            ],
        )
        with_items = fp.digest(include_values=False)
        without_items = StateFingerprint(
            window_title="HOT2000",
            selected_tabs=["General"],
            controls=[ControlSnapshot("ComboBox", label="Region", value="ONTARIO")],
        ).digest(include_values=False)
        self.assertEqual(with_items, without_items)

    def test_engine_plans_every_combo_option(self):
        engine = CrawlEngine(CrawlLimits(max_actions=500))
        options = [{"label": f"Option {index}", "index": index} for index in range(100)]
        engine.plan_combo_select_actions(
            "screen-digest",
            "combo-region",
            "Region",
            options,
            "open-key",
            screen_id="general::tab",
            logical_control_id="general > region",
        )
        select_actions = [
            action
            for action in engine.actions.values()
            if action.action_kind == "combo_select"
        ]
        self.assertEqual(len(select_actions), 100)

    def test_pause_resume_preserves_ledger(self):
        engine = CrawlEngine()
        engine.ledger.mark_combo_enumerated(
            "general > ownership",
            engine.prerequisite_signature(),
            [{"label": "Owned"}, {"label": "Rented"}],
        )
        engine.ledger.mark_option_completed(
            "general > ownership",
            engine.prerequisite_signature(),
            "Owned",
        )
        exported = engine.export_state()
        resumed = CrawlEngine()
        resumed.restore_from_state(exported)
        allowed, _ = resumed.ledger.should_plan_action(
            logical_control_id="general > ownership",
            prerequisite_signature=resumed.prerequisite_signature(),
            action_kind="combo_select",
            target_value="Owned",
        )
        self.assertFalse(allowed)
        allowed, _ = resumed.ledger.should_plan_action(
            logical_control_id="general > ownership",
            prerequisite_signature=resumed.prerequisite_signature(),
            action_kind="combo_select",
            target_value="Rented",
        )
        self.assertTrue(allowed)


if __name__ == "__main__":
    unittest.main()
