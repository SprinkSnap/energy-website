"""Tests for probe queue building and persistence."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from catalog_probe_queue import build_probe_queue, load_probe_state, save_probe_state


class ProbeQueueTests(unittest.TestCase):
    def test_build_queue_from_controls(self):
        controls = [
            {
                "stableId": "region",
                "controlType": "ComboBox",
                "label": "Weather region",
                "section": "weather",
                "screenKey": "11.13::weather",
                "options": [
                    {"index": 0, "label": "ONTARIO"},
                    {"index": 1, "label": "QUEBEC"},
                ],
            },
            {
                "stableId": "delete-btn",
                "controlType": "Button",
                "label": "Delete",
                "section": "weather",
            },
        ]
        state = build_probe_queue(controls, fixture_id="baseline-weather")
        self.assertGreater(len(state.items), 2)
        self.assertEqual(state.totals["skipped"], 1)
        self.assertTrue(any("::opt::" in i.control_id for i in state.items))

    def test_save_and_load_state(self):
        controls = [
            {
                "stableId": "name",
                "controlType": "Edit",
                "label": "Name",
                "section": "general",
                "screenKey": "11.13::general",
            }
        ]
        state = build_probe_queue(controls)
        with tempfile.TemporaryDirectory() as tmp:
            job_dir = Path(tmp)
            save_probe_state(job_dir, state)
            loaded = load_probe_state(job_dir)
            self.assertIsNotNone(loaded)
            self.assertEqual(len(loaded.items), len(state.items))
            self.assertEqual(loaded.probe_id, state.probe_id)

    def test_section_filter_in_build(self):
        controls = [
            {"stableId": "a", "controlType": "Edit", "section": "weather"},
            {"stableId": "b", "controlType": "Edit", "section": "general"},
        ]
        for c in controls:
            c["screenKey"] = f"11.13::{c['section']}"
        state = build_probe_queue(
            [c for c in controls if c["section"] == "weather"],
            section_filter="weather",
        )
        self.assertTrue(all(i.section == "weather" for i in state.items))


if __name__ == "__main__":
    unittest.main()
