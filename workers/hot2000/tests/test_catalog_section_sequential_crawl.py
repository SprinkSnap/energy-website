"""Regression tests for section-scoped sequential Phase 2 crawl behavior."""

from __future__ import annotations

import copy
import unittest

from catalog_ui_crawler_engine import CrawlEngine, CrawlLimits, PlannedAction
from catalog_ui_fingerprint import StateFingerprint
from catalog_visitation_ledger import VisitationLedger


class GeneralSectionMockSurface:
    """Mock General section with Ownership then Region comboboxes."""

    def __init__(self) -> None:
        self.ownership_value = "Owner occupied"
        self.region_value = "Ontario"
        self.ownership_options = [
            {"label": "Owner occupied", "index": 0},
            {"label": "Rental", "index": 1},
            {"label": "Other", "index": 2},
        ]
        self.region_options = [
            {"label": "Ontario", "index": 0},
            {"label": "Quebec", "index": 1},
        ]
        self.visited: list[str] = []
        self.restore_calls: list[tuple[str, str]] = []

    def fingerprint(self) -> StateFingerprint:
        return StateFingerprint(
            window_title="HOT2000",
            selected_tabs=["General"],
            hot2000_version="11.13",
        )

    def list_tabs(self) -> list[dict]:
        return [{"id": "tab-general", "label": "General", "selected": True, "logicalControlId": "general > general"}]

    def list_internal_tabs(self) -> list[dict]:
        return []

    def list_combos(self, *, metadata_only: bool = True) -> list[dict]:
        combos = [
            {
                "id": "combo-ownership",
                "label": "Ownership",
                "current": self.ownership_value,
                "logicalControlId": "general > identification > ownership",
                "locator": {"rectangle": {"top": 10, "left": 10}, "siblingOrdinal": 0},
            },
            {
                "id": "combo-region",
                "label": "Region",
                "current": self.region_value,
                "logicalControlId": "general > identification > region",
                "locator": {"rectangle": {"top": 20, "left": 10}, "siblingOrdinal": 1},
            },
        ]
        if not metadata_only:
            combos[0]["options"] = copy.deepcopy(self.ownership_options)
            combos[1]["options"] = copy.deepcopy(self.region_options)
        return combos

    def list_checkboxes(self) -> list[dict]:
        return []

    def list_radio_groups(self) -> list[dict]:
        return []

    def list_buttons(self) -> list[dict]:
        return []

    def list_scroll_regions(self) -> list[dict]:
        return []

    def list_dialogs(self) -> list[dict]:
        return []

    def list_text_fields(self) -> list[dict]:
        return [
            {
                "id": "text-client",
                "label": "Client First Name",
                "controlType": "Edit",
                "logicalControlId": "general > identification > client-first-name",
                "locator": {"rectangle": {"top": 0, "left": 0}, "siblingOrdinal": 0},
            }
        ]

    def capture_controls(self) -> list[dict]:
        return [{"stableId": "ownership", "controlType": "ComboBox"}]

    def execute_action(self, action: PlannedAction) -> dict:
        self.visited.append(f"{action.action_kind}:{action.control_label}:{action.target_value}")
        if action.action_kind == "combo_open":
            if action.control_label == "Ownership":
                return {
                    "status": "completed",
                    "options": copy.deepcopy(self.ownership_options),
                    "original_value": "Owner occupied",
                }
            if action.control_label == "Region":
                return {
                    "status": "completed",
                    "options": copy.deepcopy(self.region_options),
                    "original_value": "Ontario",
                }
            return {"status": "failed"}
        if action.action_kind == "combo_select":
            if action.control_label == "Ownership":
                self.ownership_value = action.target_value
            elif action.control_label == "Region":
                self.region_value = action.target_value
            return {"status": "completed", "selected_value": action.target_value}
        if action.action_kind == "text_field_focus":
            return {"status": "completed"}
        return {"status": "skipped"}

    def restore_combo(self, label: str, original: str) -> None:
        self.restore_calls.append((label, original))
        if label == "Ownership":
            self.ownership_value = original
        elif label == "Region":
            self.region_value = original


class SectionSequentialCrawlTests(unittest.TestCase):
    def _run_section_crawl(self) -> tuple[CrawlEngine, GeneralSectionMockSurface, list[str]]:
        engine = CrawlEngine(CrawlLimits(max_actions=500))
        engine.target_section_id = "general"
        surface = GeneralSectionMockSurface()
        fp = surface.fingerprint()
        engine.record_state(fp, {"controls": surface.capture_controls()})
        engine.plan_actions_for_surface(surface, fp, screen_id="general::tab")

        action_log: list[str] = []
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
            action_log.append(f"{action.action_kind}:{action.control_label}")
            if status != "completed":
                continue

            if action.action_kind == "combo_open":
                logical_id = action.logical_control_id or action.control_id
                original = str(result.get("original_value") or "")
                engine.begin_combo_sweep(logical_id, original)
                engine._opened_combos.add((action.screen_id or "screen", action.control_id))
                options = result.get("options") or []
                engine.register_combo_options(action.control_id, options)
                engine.plan_combo_select_actions(
                    action.state_digest,
                    action.control_id,
                    action.control_label,
                    options,
                    action.action_key,
                    screen_id=action.screen_id or "screen",
                    logical_control_id=logical_id,
                )
            elif action.action_kind == "combo_select":
                logical_id = action.logical_control_id or action.control_id
                prereq = action.prerequisite_signature or engine.prerequisite_signature()
                engine.ledger.mark_option_completed(
                    logical_id,
                    prereq,
                    action.target_value,
                    failed=False,
                )
                if engine.is_last_combo_select(action):
                    original = engine._combo_original_values.get(logical_id, "")
                    surface.restore_combo(action.control_label, original)
                    engine.finish_combo_sweep(logical_id)
                    engine.plan_next_section_combo(
                        surface,
                        surface.fingerprint(),
                        screen_id="general::tab",
                    )
            elif action.action_kind == "text_field_focus":
                engine.ledger.mark_focused(
                    action.logical_control_id or action.control_id,
                    action.prerequisite_signature or engine.prerequisite_signature(),
                )

        return engine, surface, action_log

    def test_ownership_completes_before_region_begins(self):
        engine, surface, action_log = self._run_section_crawl()

        ownership_open_idx = next(
            i for i, entry in enumerate(action_log) if entry == "combo_open:Ownership"
        )
        region_open_idx = next(
            i for i, entry in enumerate(action_log) if entry == "combo_open:Region"
        )
        ownership_selects = [
            i for i, entry in enumerate(action_log) if entry.startswith("combo_select:Ownership")
        ]
        region_selects = [
            i for i, entry in enumerate(action_log) if entry.startswith("combo_select:Region")
        ]

        self.assertLess(ownership_open_idx, region_open_idx)
        self.assertTrue(ownership_selects)
        self.assertTrue(region_selects)
        self.assertLess(max(ownership_selects), region_open_idx)
        self.assertEqual(len(ownership_selects), 3)
        self.assertEqual(len(region_selects), 2)
        self.assertEqual(engine.combos_completed_count(), 2)
        self.assertIn(("Ownership", "Owner occupied"), surface.restore_calls)
        self.assertIn(("Region", "Ontario"), surface.restore_calls)

    def test_ownership_not_requeued_after_state_change(self):
        ledger = VisitationLedger()
        prereq = "root"
        ledger.mark_combo_enumerated(
            "general > identification > ownership",
            prereq,
            [{"label": "Owner occupied"}, {"label": "Rental"}, {"label": "Other"}],
        )
        for option in ("Owner occupied", "Rental", "Other"):
            ledger.mark_option_completed(
                "general > identification > ownership",
                prereq,
                option,
            )
        ledger.mark_combo_restored("general > identification > ownership", prereq)

        allowed, reason = ledger.should_plan_action(
            logical_control_id="general > identification > ownership",
            prerequisite_signature=prereq,
            action_kind="combo_open",
        )
        self.assertFalse(allowed)
        self.assertEqual(reason, "already completed")

        allowed_select, _ = ledger.should_plan_action(
            logical_control_id="general > identification > ownership",
            prerequisite_signature=prereq,
            action_kind="combo_select",
            target_value="Rental",
        )
        self.assertFalse(allowed_select)

    def test_active_combo_sweep_blocks_other_combos(self):
        engine = CrawlEngine()
        engine.target_section_id = "general"
        engine.begin_combo_sweep("general > identification > ownership", "Owner occupied")

        ownership_select = PlannedAction(
            action_key="ownership-select-1",
            state_digest="digest",
            control_id="combo-ownership",
            control_label="Ownership",
            control_type="ComboBox",
            action_kind="combo_select",
            target_value="Rental",
            logical_control_id="general > identification > ownership",
            screen_id="general::tab",
        )
        region_open = PlannedAction(
            action_key="region-open",
            state_digest="digest",
            control_id="combo-region",
            control_label="Region",
            control_type="ComboBox",
            action_kind="combo_open",
            logical_control_id="general > identification > region",
            screen_id="general::tab",
        )
        engine.pending = [region_open, ownership_select]
        engine._opened_combos.add(("general::tab", "combo-ownership"))
        engine.actions = {a.action_key: a for a in engine.pending}

        next_action = engine.pop_next()
        self.assertEqual(next_action.action_kind, "combo_select")
        self.assertEqual(next_action.control_label, "Ownership")


if __name__ == "__main__":
    unittest.main()
