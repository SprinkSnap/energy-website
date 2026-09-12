"""Regression tests for second-pass Full House Report speed optimizations."""

import re
import struct
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import worker


class FasterFullHouseReportTests(unittest.TestCase):
    def test_worker_source_has_no_fixed_two_second_report_wait(self):
        source = Path(__file__).resolve().parents[1] / "worker.py"
        text = source.read_text(encoding="utf-8")
        self.assertNotIn(
            "confirm_full_house_report_data_source(\n        job_pids,\n        main_hwnd=main_hwnd,\n        job_dir=job_dir,\n    )\n    time.sleep(2)",
            text,
        )
        self.assertIn("wait_for_full_house_report_ready", text)

    def test_open_soc_menu_has_no_fixed_one_second_wait(self):
        source = Path(__file__).resolve().parents[1] / "worker.py"
        text = source.read_text(encoding="utf-8")
        open_start = text.index("def open_soc_full_house_report(")
        open_end = text.index("\ndef is_valid_hwnd", open_start)
        body = text[open_start:open_end]
        self.assertNotIn("time.sleep(1)", body)

    def test_pywinauto_menu_has_no_fixed_two_second_wait(self):
        source = Path(__file__).resolve().parents[1] / "worker.py"
        text = source.read_text(encoding="utf-8")
        start = text.index("def open_soc_full_house_report_pywinauto")
        end = text.index("\ndef click_dialog_button", start)
        body = text[start:end]
        self.assertNotIn("time.sleep(2)", body)

    def test_run_report_print_has_no_pre_helper_quarter_second_wait(self):
        source = Path(__file__).resolve().parents[1] / "worker.py"
        text = source.read_text(encoding="utf-8")
        start = text.index("def run_report_print_32bit")
        end = text.index("\ndef automate_print_dialog_uia", start)
        body = text[start:end]
        self.assertNotIn("time.sleep(0.25)", body)

    def test_subprocess_poll_interval_is_fast(self):
        self.assertLessEqual(worker.SUBPROCESS_POLL_S, 0.10)

    def test_print_dialog_poll_intervals_are_fifty_ms(self):
        import print_dialog_win32 as pdw

        self.assertEqual(pdw.SAVE_DIALOG_POLL_S, 0.05)
        self.assertEqual(pdw.PDF_READY_POLL_S, 0.05)

    def test_failure_timeouts_remain(self):
        import print_dialog_win32 as pdw

        self.assertGreaterEqual(pdw.PRINT_OPEN_WAIT_S, 10.0)
        self.assertGreaterEqual(pdw.SAVE_DIALOG_WAIT_AFTER_PRINT_S, 30.0)
        self.assertGreaterEqual(pdw.PDF_SAVE_VERIFY_TIMEOUT_S, 60.0)

    @patch("worker.pdf_output_ready", return_value=True)
    @patch("print_dialog_win32.export_full_house_report_pdf_manual")
    @patch("print_dialog_win32.peek_print_dialog", return_value=None)
    @patch("worker.is_worker_32bit", return_value=True)
    @patch("worker.append_print_step")
    def test_32bit_worker_uses_in_process_print_path(
        self,
        _step,
        _is32,
        _peek,
        mock_export,
        _pdf_ready,
    ):
        worker.run_report_print_32bit(
            "My-House.pdf",
            Path("/tmp/My-House.pdf"),
            1000,
            2000,
            job_dir=Path("/tmp/job"),
        )
        mock_export.assert_called_once()
        _step.assert_any_call(Path("/tmp/job"), "PRINT_FAST_PATH", "mode=in_process_32bit")

    @patch("worker.subprocess.Popen")
    @patch("worker.require_python32_for_report_print", return_value="python32")
    @patch("worker.report_print_helper_32bit_path")
    @patch("worker.is_worker_32bit", return_value=False)
    @patch("worker.append_print_step")
    def test_non_32bit_worker_keeps_subprocess_helper(
        self,
        mock_step,
        _is32,
        mock_helper_path,
        _python32,
        mock_popen,
    ):
        mock_helper_path.return_value = Path("/fake/report_print_helper_32bit.py")
        proc = MagicMock()
        proc.poll.return_value = 0
        proc.returncode = 0
        proc.communicate.return_value = ("", "")
        mock_popen.return_value = proc
        with patch("worker.pdf_output_ready", return_value=True):
            worker.run_report_print_32bit(
                "My-House.pdf",
                Path("/tmp/My-House.pdf"),
                1000,
                2000,
                job_dir=Path("/tmp/job"),
            )
        mock_popen.assert_called_once()
        mock_step.assert_any_call(
            Path("/tmp/job"),
            "PRINT_FAST_PATH",
            "mode=subprocess_32bit_helper",
        )

    def test_worker_build_id_bumped(self):
        self.assertEqual(worker.WORKER_BUILD_ID, "2026-09-11h")

    def test_wait_for_full_house_report_ready_returns_immediately(self):
        with patch("worker.wait_for_verified_report_viewer", return_value=9000):
            hwnd = worker.wait_for_full_house_report_ready({123}, 1000, timeout_s=1.0)
        self.assertEqual(hwnd, 9000)

    def test_confirm_data_source_skips_when_report_already_visible(self):
        with patch("worker.is_valid_hwnd", return_value=True):
            with patch("worker.find_report_window", return_value=9000):
                with patch("worker.find_dialog_by_markers", return_value=None):
                    with patch("worker.wait_for_use_data_from_dialog") as mock_wait:
                        worker.confirm_full_house_report_data_source(
                            {123},
                            main_hwnd=1000,
                            job_dir=Path("/tmp/job"),
                        )
        mock_wait.assert_not_called()


if __name__ == "__main__":
    unittest.main()
