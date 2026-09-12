"""Regression tests for Full House Report print speed optimizations."""

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import print_dialog_win32 as pdw


class PrintSpeedOptimizationTests(unittest.TestCase):
    def test_wm_command_is_first_print_strategy(self):
        self.assertEqual(pdw.PRINT_OPEN_STRATEGY_BY_ATTEMPT[0], "wm")

    def test_toolbar_and_menu_are_fallback_strategies(self):
        self.assertEqual(pdw.PRINT_OPEN_STRATEGY_BY_ATTEMPT[1:], ("toolbar", "menu"))

    def test_report_helper_uses_immediate_print_dialog_peek(self):
        source = (
            Path(__file__).resolve().parents[1] / "report_print_helper_32bit.py"
        ).read_text(encoding="utf-8")
        self.assertIn("peek_print_dialog()", source)
        self.assertNotIn("find_print_dialog(timeout_s=1.5)", source)

    def test_manual_open_uses_immediate_print_dialog_peek(self):
        source = Path(__file__).resolve().parents[1] / "print_dialog_win32.py"
        text = source.read_text(encoding="utf-8")
        start = text.index("def open_report_print_dialog_manual")
        body = text[start : text.index("\ndef ", start + 1)]
        self.assertIn("peek_print_dialog()", body)
        self.assertNotIn("find_print_dialog(timeout_s=1.0)", body)

    def test_worker_prefers_wm_command_strategy(self):
        worker_source = Path(__file__).resolve().parents[1] / "worker.py"
        self.assertIn('("wm", "toolbar", "menu")', worker_source.read_text(encoding="utf-8"))

    @patch("print_dialog_win32.verify_downloads_folder_selected_uia", return_value=True)
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32.set_verified_filename_only", return_value=6000)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=False)
    @patch("print_dialog_win32.wait_for_save_dialog_button_ready", return_value=True)
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.wait_for_filename_field_settled", return_value=True)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.select_downloads_folder_in_save_dialog")
    def test_save_flow_skips_downloads_navigation_when_already_selected(
        self,
        mock_select,
        _enter,
        _settled,
        _overwrite,
        _click_save,
        _save_ready,
        _rename,
        _verified,
        _reacquire,
        _already,
    ):
        logger = MagicMock()
        pdw.save_print_output_dialog(5000, "My-House.pdf", logger=logger)
        mock_select.assert_not_called()
        logger.step.assert_any_call("7_downloads_ready", "True method=already_selected")

    @patch("print_dialog_win32.click_print_dialog_button", return_value=True)
    @patch("print_dialog_win32.wait_for_print_dialog_print_button", return_value=True)
    @patch("print_dialog_win32.focus_modal_dialog")
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    def test_print_button_prefers_win32_activation(
        self,
        _valid,
        _focus,
        _wait,
        mock_win32_click,
    ):
        self.assertTrue(pdw.click_print_dialog_button_once(8000))
        mock_win32_click.assert_called_once_with(8000)

    @patch("print_dialog_win32.pdf_ready", return_value=True)
    @patch("print_dialog_win32._find_overwrite_confirm_dialog", return_value=None)
    def test_overwrite_poll_returns_immediately_when_pdf_ready(
        self,
        _confirm,
        _pdf,
    ):
        path = Path("/tmp/test-print-speed.pdf")
        pdw.confirm_save_overwrite_if_present(5000, expected_output_path=path)

    def test_failure_timeouts_remain_available(self):
        self.assertGreaterEqual(pdw.PRINT_OPEN_WAIT_S, 10.0)
        self.assertGreaterEqual(pdw.SAVE_DIALOG_WAIT_AFTER_PRINT_S, 30.0)
        self.assertGreaterEqual(pdw.PDF_SAVE_VERIFY_TIMEOUT_S, 60.0)

    def test_deep_diagnostics_not_on_success_path(self):
        source = Path(__file__).resolve().parents[1] / "print_dialog_win32.py"
        text = source.read_text(encoding="utf-8")
        complete_start = text.index("def complete_print_dialog_to_pdf")
        complete_end = text.index("\ndef open_report_print_dialog_manual", complete_start)
        complete_body = text[complete_start:complete_end]
        self.assertNotIn("collect_print_diagnostics(", complete_body)
        self.assertNotIn("find_save_pdf_dialog_deep_diagnostic", complete_body)

    def test_perf_logger_emits_timing_lines(self):
        logger = pdw.PrintStepLogger(None)
        logger.perf_mark("open_print")
        logger.perf_total()
        # perf_mark writes to stderr when log_path is None; ensure methods exist.
        self.assertIn("open_print", logger._perf_marks)

    @patch("print_dialog_win32.open_print_dialog_safe_strategies", return_value=9000)
    @patch("print_dialog_win32.peek_print_dialog", return_value=8888)
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    def test_already_visible_print_dialog_skips_open_command(
        self,
        _valid,
        _peek,
        mock_open,
    ):
        dialog, _targets = pdw.open_report_print_dialog_manual(1000, 1000)
        self.assertEqual(dialog, 8888)
        mock_open.assert_not_called()

    @patch("print_dialog_win32.wait_for_print_dialog", return_value=None)
    @patch("print_dialog_win32.safe_post_print_command")
    @patch("print_dialog_win32.peek_print_dialog", return_value=None)
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    @patch("print_dialog_win32.hot2000_process_running", return_value=False)
    def test_open_print_safe_strategies_raises_when_hot2000_exits(
        self,
        _alive,
        _valid,
        _peek,
        _wm,
        _wait,
    ):
        with self.assertRaises(pdw.Hot2000ExitedAfterPrintError):
            pdw.open_print_dialog_safe_strategies(1000)


if __name__ == "__main__":
    unittest.main()
