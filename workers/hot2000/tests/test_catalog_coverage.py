"""Unit tests for coverage report generation."""

from __future__ import annotations

import unittest

from catalog_coverage import build_coverage, render_coverage_markdown
from catalog_scan_state import ScanState


class CatalogCoverageTests(unittest.TestCase):
    def test_coverage_totals_and_markdown(self):
        state = ScanState.new(hot2000_version="11.13", fixture="baseline-general.h2k")
        state.record_screen(
            "weather-key",
            title="Weather",
            status="captured",
            section="weather",
            controls=7,
            dropdowns=2,
            options=84,
        )
        state.record_screen(
            "program-key",
            title="Program",
            status="guided-captured",
            section="program",
            reachability="guided",
            controls=21,
            dropdowns=6,
            options=40,
            inaccessible=1,
        )
        coverage = build_coverage(state)
        self.assertIn("weather", coverage["sections"])
        self.assertGreater(coverage["summary"]["completionPercentage"], 0)
        md = render_coverage_markdown(coverage)
        self.assertIn("weather", md)
        self.assertIn("program", md)


if __name__ == "__main__":
    unittest.main()
