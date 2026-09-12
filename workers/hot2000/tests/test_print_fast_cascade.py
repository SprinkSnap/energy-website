"""Tests for fast-cascade Full House Report print opening."""

import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import print_dialog_win32 as pdw
import worker


class PrintFastCascadeTests(unittest.TestCase):
    def test_fast_budget_constants(self):
        self.assertEqual(pdw.FAST_WM_PRINT_WAIT_S, 0.75)
        self.assertEqual(pdw.FAST_TOOLBAR_PRINT_WAIT_S, 1.0)
        self.assertEqual(pdw.FAST_MENU_PRINT_WAIT_S, 1.25)
        self.assertGreaterEqual(pdw.PRINT_OPEN_RESCUE_WAIT_S, 3.0)
        self.assertLessEqual(pdw.PRINT_OPEN_RESCUE_WAIT_S, 5.0)

    def test_worker_build_id_bumped(self):
        self.assertEqual(worker.WORKER_BUILD_ID, "2026-09-11j")

    def test_worker_uses_single_auto_print_strategy(self):
        source = Path(__file__).resolve().parents[1] / "worker.py"
        text = source.read_text(encoding="utf-8")
        self.assertIn('open_strategy = "auto"', text)
        self.assertIn("MAX_FULL_PRINT_ATTEMPTS = 2", text)
        self.assertNotIn('("wm", "toolbar", "menu")', text)

    @patch("print_dialog_win32.check_hot2000_alive_after_print")
    @patch("print_dialog_win32.invoke_file_print_menu", return_value=False)
    @patch("print_dialog_win32.fire_verified_hot2000_main_print_click", return_value=False)
    @patch("print_dialog_win32.safe_post_print_command")
    @patch("print_dialog_win32.peek_print_dialog", return_value=None)
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    @patch("print_dialog_win32.wait_for_print_dialog")
    def test_wm_fallback_budget_is_fast(
        self,
        mock_wait,
        _valid,
        _peek,
        _wm,
        _toolbar,
        _menu,
        _alive,
    ):
        mock_wait.return_value = None
        pdw.open_print_dialog_safe_strategies(1000)
        wm_calls = [
            c for c in mock_wait.call_args_list if c == call(timeout_s=0.75)
        ]
        self.assertTrue(wm_calls)
        self.assertEqual(mock_wait.call_args_list[0], call(timeout_s=0.75))

    @patch("print_dialog_win32.check_hot2000_alive_after_print")
    @patch("print_dialog_win32.invoke_file_print_menu", return_value=False)
    @patch("print_dialog_win32.fire_verified_hot2000_main_print_click", return_value=True)
    @patch("print_dialog_win32.safe_post_print_command")
    @patch("print_dialog_win32.peek_print_dialog", return_value=None)
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    @patch("print_dialog_win32.wait_for_print_dialog", return_value=None)
    def test_toolbar_fallback_without_six_second_wm_wait(
        self,
        mock_wait,
        _valid,
        _peek,
        _wm,
        _toolbar,
        _menu,
        _alive,
    ):
        pdw.open_print_dialog_safe_strategies(1000)
        timeouts = [c.kwargs.get("timeout_s") for c in mock_wait.call_args_list]
        self.assertIn(0.75, timeouts)
        self.assertIn(1.0, timeouts)
        self.assertNotIn(6.0, timeouts)

    @patch("print_dialog_win32.check_hot2000_alive_after_print")
    @patch("print_dialog_win32.invoke_file_print_menu", return_value=True)
    @patch("print_dialog_win32.fire_verified_hot2000_main_print_click", return_value=True)
    @patch("print_dialog_win32.safe_post_print_command")
    @patch("print_dialog_win32.peek_print_dialog", return_value=None)
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    @patch("print_dialog_win32.wait_for_print_dialog", return_value=None)
    def test_menu_fallback_uses_fast_budget(
        self,
        mock_wait,
        _valid,
        _peek,
        _wm,
        _toolbar,
        _menu,
        _alive,
    ):
        pdw.open_print_dialog_safe_strategies(1000)
        timeouts = [c.kwargs.get("timeout_s") for c in mock_wait.call_args_list]
        self.assertIn(1.25, timeouts)

    @patch("print_dialog_win32.check_hot2000_alive_after_print")
    @patch("print_dialog_win32.invoke_file_print_menu", return_value=False)
    @patch("print_dialog_win32.fire_verified_hot2000_main_print_click", return_value=False)
    @patch("print_dialog_win32.safe_post_print_command")
    @patch("print_dialog_win32.peek_print_dialog", return_value=None)
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    @patch("print_dialog_win32.wait_for_print_dialog", return_value=None)
    def test_rescue_poll_only_after_fast_strategies(
        self,
        mock_wait,
        _valid,
        _peek,
        _wm,
        _toolbar,
        _menu,
        _alive,
    ):
        pdw.open_print_dialog_safe_strategies(1000)
        timeouts = [c.kwargs.get("timeout_s") for c in mock_wait.call_args_list]
        self.assertEqual(timeouts[-1], pdw.PRINT_OPEN_RESCUE_WAIT_S)
        self.assertEqual(timeouts, [0.75, pdw.PRINT_OPEN_RESCUE_WAIT_S])

    @patch("print_dialog_win32.check_hot2000_alive_after_print")
    @patch("print_dialog_win32.invoke_file_print_menu")
    @patch("print_dialog_win32.fire_verified_hot2000_main_print_click")
    @patch("print_dialog_win32.safe_post_print_command")
    @patch("print_dialog_win32.peek_print_dialog", return_value=7777)
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    def test_existing_print_dialog_skips_wm_toolbar_and_menu(
        self,
        _valid,
        _peek,
        mock_wm,
        mock_toolbar,
        mock_menu,
        _alive,
    ):
        dialog = pdw.open_print_dialog_safe_strategies(1000)
        self.assertEqual(dialog, 7777)
        mock_wm.assert_not_called()
        mock_toolbar.assert_not_called()
        mock_menu.assert_not_called()

    @patch("print_dialog_win32.check_hot2000_alive_after_print")
    @patch("print_dialog_win32.invoke_file_print_menu")
    @patch("print_dialog_win32.fire_verified_hot2000_main_print_click")
    @patch("print_dialog_win32.safe_post_print_command")
    @patch("print_dialog_win32.wait_for_print_dialog", return_value=8888)
    @patch("print_dialog_win32.peek_print_dialog", return_value=None)
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    def test_print_dialog_during_wm_prevents_toolbar_and_menu(
        self,
        _valid,
        _peek,
        _wait,
        mock_wm,
        mock_toolbar,
        mock_menu,
        _alive,
    ):
        dialog = pdw.open_print_dialog_safe_strategies(1000)
        self.assertEqual(dialog, 8888)
        mock_wm.assert_called_once()
        mock_toolbar.assert_not_called()
        mock_menu.assert_not_called()

    @patch("worker.finalize_full_house_report_pdf_copy")
    @patch("worker.wait_for_pdf_output")
    @patch("worker.run_report_print_32bit")
    @patch("worker.ensure_report_active_before_print", return_value=2000)
    @patch("worker.refresh_report_print_target", return_value=2000)
    @patch("worker.wait_for_report_print_target", return_value=2000)
    @patch("worker.require_windows_default_pdf_printer")
    @patch("worker.build_full_house_report_downloads_path")
    @patch("worker.extract_house_name_from_h2k", return_value="Sample")
    @patch("worker.pdf_output_ready", return_value=True)
    @patch("worker.progress")
    def test_successful_pdf_skips_redundant_wait(
        self,
        _progress,
        _ready,
        _extract,
        mock_build,
        _printer,
        _wait_target,
        _refresh,
        _ensure,
        mock_run,
        mock_wait_pdf,
        _finalize,
    ):
        downloads = Path("/tmp/Downloads/Sample.pdf")
        mock_build.return_value = downloads
        worker.save_full_house_report_pdf(
            "job-1",
            {123},
            Path("/tmp/job/out.pdf"),
            1000,
            report_hwnd=2000,
        )
        mock_run.assert_called_once()
        mock_wait_pdf.assert_not_called()

    @patch("worker.finalize_full_house_report_pdf_copy")
    @patch("worker.wait_for_pdf_output")
    @patch("worker.run_report_print_32bit", side_effect=RuntimeError("fail"))
    @patch("worker.ensure_report_active_before_print", return_value=2000)
    @patch("worker.refresh_report_print_target", return_value=2000)
    @patch("worker.wait_for_report_print_target", return_value=2000)
    @patch("worker.require_windows_default_pdf_printer")
    @patch("worker.build_full_house_report_downloads_path")
    @patch("worker.extract_house_name_from_h2k", return_value="Sample")
    @patch("worker.pdf_output_ready", return_value=False)
    @patch("worker.hot2000_process_running", return_value=True)
    @patch("worker.progress")
    def test_whole_flow_retries_at_most_once(
        self,
        _progress,
        _running,
        _ready,
        _extract,
        mock_build,
        _printer,
        _wait_target,
        mock_refresh,
        mock_ensure,
        mock_run,
        _wait_pdf,
        _finalize,
    ):
        downloads = Path("/tmp/Downloads/Sample.pdf")
        mock_build.return_value = downloads
        with self.assertRaises(RuntimeError):
            worker.save_full_house_report_pdf(
                "job-1",
                {123},
                Path("/tmp/job/out.pdf"),
                1000,
                report_hwnd=2000,
            )
        self.assertEqual(mock_run.call_count, worker.MAX_FULL_PRINT_ATTEMPTS)
        self.assertGreaterEqual(mock_refresh.call_count, 1)
        self.assertGreaterEqual(mock_ensure.call_count, 2)

    @patch("print_dialog_win32.export_full_house_report_pdf_manual")
    @patch("worker.is_report_error_window", return_value=True)
    @patch("worker.win32gui")
    def test_sorry_title_never_enters_print_cascade(
        self,
        mock_gui,
        _is_error,
        mock_export,
    ):
        mock_gui.GetWindowText.return_value = "Sorry."
        with self.assertRaises(RuntimeError):
            worker.run_report_print_32bit(
                "My-House.pdf",
                Path("/tmp/My-House.pdf"),
                2001,
                1000,
                job_pids={123},
            )
        mock_export.assert_not_called()


if __name__ == "__main__":
    unittest.main()
