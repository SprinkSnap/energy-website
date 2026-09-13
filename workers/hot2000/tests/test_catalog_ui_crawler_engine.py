"""Tests for stateful HOT2000 UI crawler engine with mocked UI surface."""

from __future__ import annotations

import copy
import unittest

from catalog_ui_crawler_engine import CrawlEngine, CrawlLimits, PlannedAction
from catalog_ui_fingerprint import StateFingerprint


class MockUiSurface:
    """In-memory HOT2000-like UI for crawler integration tests."""

    def __init__(self) -> None:
        self.tabs = [
            {"id": "tab-a", "label": "Tab A", "selected": True},
            {"id": "tab-b", "label": "Tab B", "selected": False},
            {"id": "tab-c", "label": "Tab C", "selected": False},
        ]
        self.selected_tab = "Tab A"
        self.combo_value = "Option 1"
        self.checkbox_checked = False
        self.radio_value = "Choice 1"
        self.sub_tab_visible = False
        self.dialog_open = False
        self.visited: list[str] = []
        self._version = "11.13"

    def fingerprint(self) -> StateFingerprint:
        tabs = [self.selected_tab]
        if self.sub_tab_visible:
            tabs.append("Sub Tab")
        fp = StateFingerprint(
            window_title="HOT2000 Mock",
            selected_tabs=tabs,
            hot2000_version=self._version,
        )
        if self.checkbox_checked:
            from catalog_ui_fingerprint import ControlSnapshot

            fp.controls = [
                ControlSnapshot("Edit", name="Revealed Field 1"),
                ControlSnapshot("Edit", name="Revealed Field 2"),
            ]
        return fp

    def list_tabs(self) -> list[dict]:
        return copy.deepcopy(self.tabs)

    def list_combos(self, *, metadata_only: bool = True) -> list[dict]:
        if self.selected_tab != "Tab A":
            return []
        entry = {
            "id": "combo-region",
            "label": "Region",
            "current": self.combo_value,
        }
        if not metadata_only:
            entry["options"] = [
                {"label": "Option 1", "index": 0},
                {"label": "Option 2", "index": 1},
                {"label": "Option 3", "index": 2},
            ]
        return [entry]

    def list_checkboxes(self) -> list[dict]:
        if self.selected_tab != "Tab A":
            return []
        return [
            {
                "id": "checkbox-hrv",
                "label": "HRV Enabled",
                "checked": "checked" if self.checkbox_checked else "unchecked",
            }
        ]

    def list_radio_groups(self) -> list[dict]:
        if self.selected_tab != "Tab B":
            return []
        choices = [
            {"id": "radio-1", "label": "Choice 1"},
            {"id": "radio-2", "label": "Choice 2"},
            {"id": "radio-3", "label": "Choice 3"},
        ]
        return [{"id": "fuel-group", "choices": choices, "selected": self.radio_value}]

    def list_buttons(self) -> list[dict]:
        if self.selected_tab != "Tab C":
            return []
        return [{"id": "btn-open", "label": "Open Dialog", "classification": "SAFE_DIALOG_OPEN"}]

    def list_scroll_regions(self) -> list[dict]:
        return [{"id": "scroll-main"}]

    def list_dialogs(self) -> list[dict]:
        if self.dialog_open:
            return [{"id": "dialog-advanced", "title": "Advanced"}]
        return []

    def capture_controls(self) -> list[dict]:
        controls = [{"stableId": f"tab:{self.selected_tab}", "controlType": "TabItem"}]
        if self.checkbox_checked:
            controls.extend(
                [
                    {"stableId": "revealed-1", "controlType": "Edit"},
                    {"stableId": "revealed-2", "controlType": "Edit"},
                ]
            )
        if self.dialog_open:
            controls.append({"stableId": "dialog-combo", "controlType": "ComboBox"})
        return controls

    def execute_action(self, action: PlannedAction) -> dict:
        self.visited.append(action.action_kind)
        kind = action.action_kind
        if kind == "tab_select":
            self.selected_tab = action.target_value
            for tab in self.tabs:
                tab["selected"] = tab["label"] == self.selected_tab
            return {"status": "completed"}
        if kind == "combo_open":
            return {
                "status": "completed",
                "options": [
                    {"label": "Option 1", "index": 0},
                    {"label": "Option 2", "index": 1},
                    {"label": "Option 3", "index": 2},
                ],
            }
        if kind == "combo_select":
            self.combo_value = action.target_value
            return {"status": "completed", "restore": {"kind": "combo", "original": "Option 1"}}
        if kind == "checkbox_toggle":
            self.checkbox_checked = action.target_value == "checked"
            original = "unchecked"
            return {
                "status": "completed",
                "restore": {"kind": "checkbox", "original": original},
            }
        if kind == "radio_select":
            self.radio_value = action.target_value
            if action.target_value == "Choice 2":
                self.sub_tab_visible = True
            return {"status": "completed"}
        if kind == "button_invoke":
            self.dialog_open = True
            return {"status": "completed"}
        if kind == "dialog_visit":
            return {"status": "completed"}
        if kind == "scroll_down":
            return {"status": "completed", "revealed_controls": ["scroll+1"]}
        return {"status": "skipped"}


class CatalogUiCrawlerEngineTests(unittest.TestCase):
    def _run_mock_crawl(self, limits: CrawlLimits | None = None) -> tuple[CrawlEngine, MockUiSurface]:
        engine = CrawlEngine(limits or CrawlLimits(max_actions=200, max_states=50))
        surface = MockUiSurface()
        fp = surface.fingerprint()
        engine.record_state(fp, {"controls": surface.capture_controls()})
        engine.plan_actions_for_surface(surface, fp)

        while True:
            action = engine.pop_next()
            if not action:
                engine.completion_reason = "queue_drained"
                break
            if engine.should_terminate(0):
                break
            engine.current_action = action
            result = surface.execute_action(action)
            status = result.get("status", "failed")
            engine.mark_action(action.action_key, status)
            if status == "completed":
                if action.action_kind == "combo_open":
                    engine.counters.combos_opened += 1
                    engine._opened_combos.add(action.control_id)
                    engine.register_combo_options(
                        action.control_id,
                        result.get("options") or [],
                    )
                    engine.plan_combo_select_actions(
                        action.state_digest,
                        action.control_id,
                        action.control_label,
                        result.get("options") or [],
                        action.action_key,
                    )
                new_fp = surface.fingerprint()
                engine.record_state(new_fp, {"controls": surface.capture_controls()})
                engine.plan_actions_for_surface(surface, new_fp, base_digest=new_fp.digest())
                if result.get("restore", {}).get("kind") == "checkbox":
                    surface.checkbox_checked = False

        return engine, surface

    def test_visits_all_tabs_combos_checkbox_radio_dialog_and_terminates(self):
        engine, surface = self._run_mock_crawl()
        self.assertEqual(engine.completion_reason, "queue_drained")
        self.assertGreater(engine.counters.tabs_total, 0)
        self.assertGreater(engine.counters.combo_options_captured, 0)
        self.assertGreater(engine.counters.actions_completed, 0)
        self.assertIn("tab_select", surface.visited)
        self.assertIn("combo_select", surface.visited)
        self.assertIn("checkbox_toggle", surface.visited)
        self.assertIn("radio_select", surface.visited)
        self.assertIn("button_invoke", surface.visited)

    def test_action_deduplication(self):
        engine = CrawlEngine()
        surface = MockUiSurface()
        fp = surface.fingerprint()
        first = engine.plan_actions_for_surface(surface, fp)
        second = engine.plan_actions_for_surface(surface, fp)
        self.assertGreater(len(first), 0)
        self.assertEqual(len(second), 0)
        self.assertEqual(engine.counters.actions_discovered, len(first))

    def test_hard_limit_terminates(self):
        engine, _surface = self._run_mock_crawl(CrawlLimits(max_actions=3, max_states=10))
        self.assertIn(engine.completion_reason, {"queue_drained", "max_actions"})

    def test_progress_increases(self):
        engine, _surface = self._run_mock_crawl()
        self.assertGreater(engine.progress_percent(), 0)


if __name__ == "__main__":
    unittest.main()
