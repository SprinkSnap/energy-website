"""Unit tests for scan state graph behavior."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from catalog_scan_state import ScanState


class CatalogScanStateTests(unittest.TestCase):
    def test_enqueue_deduplicates_action_key(self):
        state = ScanState.new(hot2000_version="11.13", fixture="baseline-general.h2k")
        state.enqueue({"actionKey": "a:Weather:TabItem", "screenKey": "weather"})
        state.enqueue({"actionKey": "a:Weather:TabItem", "screenKey": "weather"})
        self.assertEqual(len(state.pending), 1)

    def test_loop_prevention_visit_limit(self):
        state = ScanState.new(hot2000_version="11.13", fixture="baseline-general.h2k")
        key = "11.13::weather::abc"
        state.visited_screens[key] = 3
        self.assertFalse(state.should_visit(key))

    def test_save_and_load_roundtrip(self):
        state = ScanState.new(hot2000_version="11.13", fixture="baseline-general.h2k")
        state.record_screen("screen-1", title="Weather", status="captured", controls=7)
        state.enqueue({"actionKey": "root", "screenKey": "screen-1"})
        with tempfile.TemporaryDirectory() as tmp:
            raw_dir = Path(tmp)
            state.save(raw_dir)
            loaded = ScanState.load(raw_dir / "scan-state.json")
            self.assertIsNotNone(loaded)
            self.assertEqual(loaded.scan_id, state.scan_id)
            self.assertIn("screen-1", loaded.screens)


if __name__ == "__main__":
    unittest.main()
