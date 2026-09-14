"""Regression tests for Phase 2 crawler diagnostics and callback wiring."""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import MagicMock

from catalog_auto_scan import _assert_scan_callbacks
from catalog_ui_crawler import _assert_crawler_callbacks


class CatalogUiCrawlerDiagnosticsTests(unittest.TestCase):
    def test_checkpoint_coverage_report_does_not_shadow_progress_emitter(self):
        """Regression: assigning coverage dict to `report` broke emit_progress()."""
        import re

        source = (
            Path(__file__).resolve().parents[1] / "catalog_ui_crawler.py"
        ).read_text(encoding="utf-8")
        self.assertIsNone(
            re.search(r"(?<![_a-z])report = build_full_coverage_report", source),
            "coverage report must not reuse the emit_progress function name",
        )
        self.assertIn("coverage_report = build_full_coverage_report", source)
        self.assertIn("def emit_live_progress(", source)

    def test_emit_progress_survives_checkpoint_write_pattern(self):
        calls: list[tuple[str, str]] = []

        def emit_progress(stage: str, message: str) -> None:
            calls.append((stage, message))

        def fake_checkpoint(_job_id: str, _payload: dict, _meta: dict) -> None:
            coverage_report = {"resultClassification": "complete"}
            assert isinstance(coverage_report, dict)

        emit_progress("scanning", "before-checkpoint")
        fake_checkpoint("job-1", {}, {})
        emit_progress("scanning", "after-checkpoint")

        self.assertEqual(
            calls,
            [("scanning", "before-checkpoint"), ("scanning", "after-checkpoint")],
        )

    def test_old_shadowing_pattern_raises_dict_not_callable(self):
        def report(stage: str, message: str) -> str:
            return f"{stage}:{message}"

        report = {"resultClassification": "complete"}  # noqa: PLW0642 — intentional bug repro
        with self.assertRaisesRegex(TypeError, "not callable"):
            report("scanning", "broken")

    def test_assert_scan_callbacks_rejects_dict_checkpoint(self):
        with self.assertRaisesRegex(TypeError, "checkpoint must be callable"):
            _assert_scan_callbacks(
                progress=lambda *_a, **_k: None,
                control_check=lambda: "running",
                checkpoint={"not": "callable"},
            )

    def test_assert_crawler_callbacks_rejects_dict_progress(self):
        with self.assertRaisesRegex(TypeError, "progress must be callable"):
            _assert_crawler_callbacks(
                progress={"stage": "scanning"},
                control_check=lambda: None,
            )

    def test_assert_crawler_callbacks_accepts_valid_callbacks(self):
        _assert_crawler_callbacks(
            progress=MagicMock(),
            control_check=MagicMock(return_value="running"),
            checkpoint=MagicMock(),
            progress_with_pct=MagicMock(),
        )


if __name__ == "__main__":
    unittest.main()
