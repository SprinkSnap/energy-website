"""Tests for Phase 2 section-scoped catalog crawl."""

from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from catalog_phase2_sections import (
    PHASE2_SECTION_IDS,
    PHASE2_SECTIONS,
    get_section_by_id,
    is_foreign_section_navigation,
    parse_section_job_options,
)
from catalog_progress_batcher import ProgressBatcher
from catalog_section_navigation import _label_matches_section, _normalize_label
from catalog_ui_crawler_engine import CrawlEngine, PlannedAction
from catalog_ui_interaction import automatic_scan_mode


class SectionDefinitionsTests(unittest.TestCase):
    def test_phase2_sections_exact_order(self):
        labels = [section["label"] for section in PHASE2_SECTIONS]
        self.assertEqual(
            labels,
            [
                "General",
                "Info",
                "Specifications",
                "Weather",
                "Fuel Cost",
                "Unit & Mode",
                "Window Tightness",
                "Code Summary",
                "Temperatures",
                "Base Loads",
                "Generation",
                "Natural Air Infiltration",
                "Ventilation",
                "Heating/Cooling System",
                "Domestic Hot Water",
                "Program",
            ],
        )
        self.assertEqual(len(PHASE2_SECTION_IDS), 16)

    def test_parse_section_job_options(self):
        job = {
            "catalog_action": 'capture_section:{"sectionId":"weather","sectionLabel":"Weather"}'
        }
        options = parse_section_job_options(job)
        self.assertEqual(options["sectionId"], "weather")
        self.assertEqual(options["sectionLabel"], "Weather")


class SectionScopeEngineTests(unittest.TestCase):
    def test_general_job_skips_weather_navigation(self):
        engine = CrawlEngine()
        engine.target_section_id = "general"
        self.assertTrue(engine._should_skip_section_navigation("Weather", "tab_select"))
        self.assertFalse(engine._should_skip_section_navigation("Identification", "tab_select"))
        self.assertFalse(engine._should_skip_section_navigation("General", "tab_select"))

    def test_weather_job_skips_general_navigation(self):
        engine = CrawlEngine()
        engine.target_section_id = "weather"
        self.assertTrue(engine._should_skip_section_navigation("General", "button_invoke"))
        self.assertFalse(engine._should_skip_section_navigation("Location", "tab_select"))

    def test_two_region_controls_remain_distinct(self):
        from catalog_control_locator import build_control_locator

        class _Info:
            def __init__(self, automation_id: str, name: str = "Region") -> None:
                self.control_type = "ComboBox"
                self.automation_id = automation_id
                self.class_name = "ComboBox"
                self.name = name
                self.runtime_id = automation_id

        class _Parent:
            def children(self):
                return []

            def parent(self):
                return None

        class _Control:
            def __init__(self, automation_id: str) -> None:
                self.element_info = _Info(automation_id)
                self._parent = _Parent()

            def window_text(self):
                return "Region"

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

        region_a = _Control("a")
        region_b = _Control("b")
        locator_a = build_control_locator(
            region_a,
            window_title="HOT2000",
            section="general",
            tab_breadcrumb=["General", "Identification"],
        )
        locator_b = build_control_locator(
            region_b,
            window_title="HOT2000",
            section="weather",
            tab_breadcrumb=["Weather", "Location"],
        )
        self.assertNotEqual(locator_a.logical_control_id, locator_b.logical_control_id)

    def test_foreign_section_navigation_mapping(self):
        self.assertTrue(is_foreign_section_navigation("Weather", "general"))
        self.assertFalse(is_foreign_section_navigation("General", "general"))
        self.assertTrue(is_foreign_section_navigation("Fuel Cost", "weather"))


class ProgressBatcherTests(unittest.TestCase):
    def test_progress_is_rate_limited(self):
        batcher = ProgressBatcher(progress_interval_s=5.0, checkpoint_interval_s=30.0)
        calls: list[str] = []

        with patch("catalog_progress_batcher.time.monotonic", side_effect=[0.0, 1.0, 6.0]):
            batcher.maybe_progress(calls.append, "first")
            batcher.maybe_progress(calls.append, "second")
            batcher.maybe_progress(calls.append, "third")

        self.assertEqual(calls, ["first", "third"])

    def test_flush_sends_pending_progress(self):
        batcher = ProgressBatcher(progress_interval_s=5.0)
        calls: list[str] = []
        with patch("catalog_progress_batcher.time.monotonic", side_effect=[0.0, 1.0]):
            batcher.maybe_progress(calls.append, "first")
            batcher.maybe_progress(calls.append, "pending")
        batcher.flush_progress()
        self.assertEqual(calls, ["first", "pending"])


class AutomaticScanSafetyTests(unittest.TestCase):
    def test_automatic_scan_disables_physical_mouse(self):
        with patch.dict("os.environ", {"HOT2000_RECORDER_VISIBLE_INTERACTION": ""}, clear=False):
            self.assertTrue(automatic_scan_mode())


class SectionJobParsingTests(unittest.TestCase):
    def test_missing_section_raises(self):
        with self.assertRaises(ValueError):
            parse_section_job_options({"catalog_action": "capture_section:{}"})


class NavigationLabelTests(unittest.TestCase):
    def test_label_matches_section(self):
        labels = {_normalize_label(item) for item in get_section_by_id("unit-mode")["nav_labels"]}
        self.assertTrue(_label_matches_section("Unit & Mode", labels))


if __name__ == "__main__":
    unittest.main()
