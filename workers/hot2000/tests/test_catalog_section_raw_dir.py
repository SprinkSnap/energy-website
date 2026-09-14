"""Regression tests for section crawl raw-desktop directory creation."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from catalog_section_crawl import _ensure_section_raw_dir, _section_raw_dir
from catalog_scan_state import ScanState


class SectionRawDirTests(unittest.TestCase):
    def test_ensure_section_raw_dir_creates_nested_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            job_dir = Path(tmp) / "job-123"
            job_dir.mkdir()
            scan_id = "scan-abc"

            raw_dir = _ensure_section_raw_dir(job_dir, scan_id)

            self.assertTrue(raw_dir.is_dir())
            self.assertEqual(raw_dir, job_dir / "raw-desktop" / scan_id)
            self.assertTrue((job_dir / "raw-desktop").is_dir())

    def test_section_navigation_pre_json_writes_on_fresh_scan(self):
        with tempfile.TemporaryDirectory() as tmp:
            job_dir = Path(tmp) / "job-456"
            job_dir.mkdir()
            scan_id = "scan-new"
            raw_dir = _section_raw_dir(job_dir, scan_id)
            self.assertFalse(raw_dir.exists())

            raw_dir = _ensure_section_raw_dir(job_dir, scan_id)
            snapshot = {"windowTitle": "HOT2000", "selectedTabs": ["General"]}
            target = raw_dir / "section-navigation-pre.json"
            target.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")

            self.assertTrue(target.is_file())
            loaded = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(loaded["windowTitle"], "HOT2000")

    def test_initialize_section_crawl_writes_pre_navigation_without_file_not_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            job_dir = Path(tmp) / "job-789"
            job_dir.mkdir()
            state = ScanState.new(hot2000_version="11.13", fixture="baseline-general.h2k")
            state.section_id = "general"
            state.section_label = "General"
            raw_dir = _section_raw_dir(job_dir, state.scan_id)
            self.assertFalse(raw_dir.exists())

            progress_calls: list[tuple[str, str, str | None]] = []

            def progress(job_id: str, stage: str, message: str | None = None) -> None:
                progress_calls.append((job_id, stage, message))

            fake_window = object()
            snapshot = {"windowTitle": "HOT2000", "currentSectionDetection": {"sectionId": "general"}}

            fake_session = type("Session", (), {"main_hwnd": 1000})()
            nav_outcome = type(
                "Outcome",
                (),
                {
                    "success": True,
                    "result": "already_active",
                    "message": None,
                    "diagnostics": None,
                },
            )()
            with patch("catalog_section_crawl.hydrate_scan_state", return_value=state):
                with patch("catalog_section_crawl.open_h2k_fixture", return_value=fake_session):
                    with patch("catalog_section_crawl.wait_for_model_ready"):
                        with patch(
                            "catalog_section_crawl.detect_hot2000_version",
                            return_value="11.13",
                        ):
                            with patch("catalog_recorder._desktop_window") as desktop:
                                desktop.return_value.window.return_value = fake_window
                                with patch(
                                    "catalog_section_crawl.capture_navigation_snapshot",
                                    return_value=snapshot,
                                ):
                                    with patch(
                                        "catalog_section_crawl.navigate_to_section",
                                        return_value=nav_outcome,
                                    ):
                                        with patch(
                                            "catalog_section_crawl.run_stateful_ui_crawl"
                                        ) as crawl:
                                            crawl.return_value = (state, object())
                                            with patch(
                                                "catalog_section_crawl.write_coverage_reports",
                                                return_value={},
                                            ):
                                                with patch("catalog_section_crawl.close_hot2000"):
                                                    from catalog_section_crawl import (
                                                        run_section_crawl,
                                                    )

                                                    run_section_crawl(
                                                        "job-789",
                                                        job_dir,
                                                        "worker-1",
                                                        progress,
                                                        lambda: None,
                                                        section_id="general",
                                                        section_label="General",
                                                    )

            pre_path = raw_dir / "section-navigation-pre.json"
            self.assertTrue(pre_path.is_file())
            self.assertTrue(any(call[1] == "scanning" for call in progress_calls))
            self.assertTrue(
                any(
                    call[2] == "Detecting current HOT2000 section…"
                    for call in progress_calls
                )
            )


if __name__ == "__main__":
    unittest.main()
