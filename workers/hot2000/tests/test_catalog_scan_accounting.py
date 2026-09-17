"""Tests for scan accounting invariants and terminal classification."""

from __future__ import annotations

import unittest

from catalog_scan_accounting import (
    build_accounting_summary,
    classify_scan_result,
    progress_percent_from_accounting,
    verify_accounting_invariant,
)
from catalog_scan_state import ScanState


class CatalogScanAccountingTests(unittest.TestCase):
    def test_accounting_invariant_holds(self):
        actions = {
            "a1": {"status": "completed"},
            "a2": {"status": "completed"},
            "a3": {"status": "failed"},
            "a4": {"status": "skipped"},
            "a5": {"status": "pending"},
        }
        summary = build_accounting_summary(actions, kind="actions")
        self.assertEqual(summary["actionsDiscovered"], 5)
        self.assertTrue(verify_accounting_invariant(summary, "actions"))

    def test_progress_never_exceeds_discovered_denominator(self):
        actions = {f"a{i}": {"status": "completed"} for i in range(4)}
        states = {f"s{i}": {"status": "completed"} for i in range(2)}
        pct = progress_percent_from_accounting(actions, states)
        self.assertLessEqual(pct, 100)
        self.assertEqual(pct, 100)

    def test_classify_complete_with_gaps_when_partial_screen(self):
        state = ScanState.new(hot2000_version="11.13", fixture="baseline-general.h2k")
        state.record_screen("main", title="Main", status="partial", section="program")
        state.completion_reason = "queue_drained"
        self.assertEqual(classify_scan_result(state), "complete_with_gaps")

    def test_classify_complete_when_no_gaps(self):
        state = ScanState.new(hot2000_version="11.13", fixture="baseline-general.h2k")
        state.record_screen("main", title="Main", status="captured", section="program")
        state.completion_reason = "queue_drained"
        self.assertEqual(classify_scan_result(state), "complete")

    def test_classify_partial_on_early_stop(self):
        state = ScanState.new(hot2000_version="11.13", fixture="baseline-general.h2k")
        state.status = "completed_with_limits"
        state.completion_reason = "max_actions"
        self.assertEqual(classify_scan_result(state), "partial")


if __name__ == "__main__":
    unittest.main()
