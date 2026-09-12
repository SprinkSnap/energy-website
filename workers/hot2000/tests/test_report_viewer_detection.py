"""Regression tests for verified Full House Report viewer detection."""

from pathlib import Path
import sys
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from unittest.mock import MagicMock, patch

from worker import (
    REPORT_STABILITY_POLLS,
    WORKER_BUILD_ID,
    classify_report_window,
    ensure_report_active_before_print,
    find_report_window,
    is_report_error_window,
    run_report_print_32bit,
    score_report_window,
    wait_for_verified_report_viewer,
)


def _afx_mdi_window(
    mock_gui,
    *,
    hwnd: int = 2001,
    title: str = "",
    area: int = 300_000,
    in_mdi: bool = True,
):
    mock_gui.IsWindow.return_value = True
    mock_gui.IsWindowVisible.return_value = True
    mock_gui.GetClassName.return_value = "Afx:00400000:8:00010003:00000000:00000000"
    mock_gui.GetWindowText.return_value = title
    return patch("worker.window_area", return_value=area), patch(
        "worker.has_mdi_client_ancestor", return_value=in_mdi
    )


class ReportViewerDetectionTests(unittest.TestCase):
    def test_worker_build_id_bumped(self):
        self.assertEqual(WORKER_BUILD_ID, "2026-09-11j")

    @patch("worker.dialog_visible_text", return_value="")
    @patch("worker.win32gui")
    def test_rejects_sorry_mdi_afx_child(self, mock_gui, _body):
        patches = _afx_mdi_window(mock_gui, title="Sorry.")
        with patches[0], patches[1]:
            self.assertTrue(is_report_error_window(2001))
            self.assertEqual(score_report_window(2001, 1000), 0)
            self.assertIsNone(find_report_window({123}, 1000))

    @patch("worker.dialog_visible_text", return_value="")
    @patch("worker.win32gui")
    def test_rejects_error_mdi_afx_child(self, mock_gui, _body):
        patches = _afx_mdi_window(mock_gui, title="Error")
        with patches[0], patches[1]:
            self.assertTrue(is_report_error_window(2001))
            self.assertEqual(score_report_window(2001, 1000), 0)
            self.assertIsNone(find_report_window({123}, 1000))

    @patch("worker.hot2000_window_surfaces", return_value=[2001])
    @patch("worker.dialog_visible_text", return_value="")
    @patch("worker.win32gui")
    def test_rejects_generic_existing_afx_mdi_child(self, mock_gui, _body, _surfaces):
        patches = _afx_mdi_window(mock_gui, title="Some arbitrary page")
        with patches[0], patches[1]:
            self.assertEqual(
                score_report_window(2001, 1000, before_report_hwnds={1000, 2001}),
                0,
            )
            self.assertIsNone(
                find_report_window(
                    {123},
                    1000,
                    before_report_hwnds={1000, 2001},
                )
            )

    @patch("worker.dialog_visible_text", return_value="")
    @patch("worker.win32gui")
    def test_accepts_full_house_report_title(self, mock_gui, _body):
        patches = _afx_mdi_window(
            mock_gui,
            title="Full House Report — My House",
        )
        with patches[0], patches[1]:
            result = classify_report_window(2001, 1000)
            self.assertTrue(result.report_evidence)
            self.assertGreaterEqual(result.score, 40)
            self.assertEqual(result.evidence, "title_full_house")

    @patch("worker.dialog_visible_text", return_value="")
    @patch("worker.win32gui")
    def test_accepts_standard_operating_conditions_title(self, mock_gui, _body):
        patches = _afx_mdi_window(
            mock_gui,
            title="House with standard operating conditions",
        )
        with patches[0], patches[1]:
            result = classify_report_window(2001, 1000)
            self.assertTrue(result.report_evidence)
            self.assertGreaterEqual(result.score, 40)
            self.assertEqual(result.evidence, "standard_operating")

    @patch("worker.hot2000_window_surfaces", return_value=[2001])
    @patch("worker.dialog_visible_text", return_value="")
    @patch("worker.win32gui")
    def test_accepts_new_mdi_surface_after_report_command(
        self, mock_gui, _body, _surfaces
    ):
        patches = _afx_mdi_window(mock_gui, title="")
        with patches[0], patches[1]:
            result = classify_report_window(
                2001,
                1000,
                before_report_hwnds={1000, 1999},
            )
            self.assertTrue(result.report_evidence)
            self.assertEqual(result.evidence, "new_mdi_surface")
            self.assertGreaterEqual(result.score, 40)

    @patch("worker.REPORT_STATE_POLL_S", 0.01)
    @patch("worker.find_report_window")
    def test_new_candidate_requires_two_stable_polls(self, mock_find):
        mock_find.side_effect = [2001, 2002, 2002]
        with patch("worker.classify_report_window") as mock_classify:
            mock_classify.return_value = MagicMock(
                evidence="new_mdi_surface", report_evidence=True
            )
            with patch("worker.is_report_error_window", return_value=False):
                with patch("worker.hot2000_window_surfaces", return_value=[]):
                    with patch("worker.append_print_step"):
                        with patch("worker.win32gui") as mock_gui:
                            mock_gui.GetWindowText.return_value = "Full House Report"
                            mock_gui.GetClassName.return_value = "Afx:test"
                            hwnd = wait_for_verified_report_viewer(
                                {123},
                                1000,
                                timeout_s=1.0,
                                require_stable=True,
                            )
        self.assertEqual(hwnd, 2002)
        self.assertEqual(mock_find.call_count, 3)
        self.assertGreaterEqual(mock_find.call_count, REPORT_STABILITY_POLLS + 1)

    @patch("worker.ensure_report_active_before_print")
    @patch("worker.is_worker_32bit", return_value=True)
    @patch("worker.append_print_step")
    @patch("worker.is_report_error_window", return_value=True)
    @patch("worker.win32gui")
    def test_print_never_sent_for_sorry_target(
        self, mock_gui, _is_error, _step, _is32, _ensure
    ):
        mock_gui.GetWindowText.return_value = "Sorry."
        with patch("print_dialog_win32.export_full_house_report_pdf_manual") as mock_export:
            with self.assertRaises(RuntimeError):
                run_report_print_32bit(
                    "My-House.pdf",
                    Path("/tmp/My-House.pdf"),
                    2001,
                    1000,
                    job_dir=Path("/tmp/job"),
                    job_pids={123},
                )
        mock_export.assert_not_called()
        _ensure.assert_not_called()

    @patch("worker.ensure_report_active_before_print", return_value=2001)
    @patch("worker.pdf_output_ready", return_value=True)
    @patch("print_dialog_win32.export_full_house_report_pdf_manual")
    @patch("print_dialog_win32.peek_print_dialog", return_value=None)
    @patch("worker.is_worker_32bit", return_value=True)
    @patch("worker.append_print_step")
    @patch("worker.is_report_error_window", return_value=False)
    def test_cmd_file_print_uses_verified_report_after_activation(
        self,
        _is_error,
        mock_step,
        _is32,
        _peek,
        mock_export,
        _pdf_ready,
        mock_ensure,
    ):
        run_report_print_32bit(
            "My-House.pdf",
            Path("/tmp/My-House.pdf"),
            2001,
            1000,
            job_dir=Path("/tmp/job"),
            job_pids={123},
            before_report_hwnds={1000},
        )
        mock_ensure.assert_called_once()
        mock_export.assert_called_once()
        mock_step.assert_any_call(
            Path("/tmp/job"),
            "PRINT_FAST_PATH",
            "mode=in_process_32bit",
        )

    def test_no_fixed_two_second_delay_reintroduced(self):
        source = Path(__file__).resolve().parents[1] / "worker.py"
        text = source.read_text(encoding="utf-8")
        self.assertNotIn(
            "confirm_full_house_report_data_source(\n        job_pids,\n        main_hwnd=main_hwnd,\n        job_dir=job_dir,\n    )\n    time.sleep(2)",
            text,
        )
        self.assertIn("wait_for_verified_report_viewer", text)
        self.assertIn("REPORT_STABILITY_POLLS", text)

    @patch("worker.mdi_child_matches_report", return_value=False)
    @patch("worker.get_active_mdi_child_hwnd", return_value=3000)
    @patch("worker.activate_verified_report_viewer", return_value=2001)
    @patch("worker.find_report_window", return_value=2001)
    @patch("worker.is_report_error_window", return_value=False)
    @patch("worker.classify_report_window")
    @patch("worker.win32gui")
    def test_refuses_print_when_active_mdi_does_not_match(
        self,
        mock_gui,
        mock_classify,
        _is_error,
        _find,
        _activate,
        _active,
        _matches,
    ):
        mock_classify.return_value = MagicMock(
            evidence="title_full_house", report_evidence=True
        )
        mock_gui.GetWindowText.return_value = "Full House Report"
        mock_gui.GetClassName.return_value = "Afx:test"
        with self.assertRaises(RuntimeError):
            ensure_report_active_before_print(
                {123},
                1000,
                2001,
                job_dir=Path("/tmp/job"),
            )


if __name__ == "__main__":
    unittest.main()
