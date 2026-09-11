"""Tests for stacked Shell Rename dialog recovery during PDF save."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    SHELL_RENAME_MAX_DISMISSALS,
    SaveFilenameTargetingError,
    dismiss_all_shell_rename_errors,
    reacquire_save_pdf_dialog,
    save_print_output_dialog,
)


class RenameDialogRecoveryTests(unittest.TestCase):
    def _rename_sequence(self, count: int):
        values = [9000 + index for index in range(count)] + [None]
        return values

    @patch("print_dialog_win32.click_rename_dialog_ok", return_value=True)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    def test_one_rename_dialog_ok_then_continue(self, mock_find, _click):
        mock_find.side_effect = self._rename_sequence(1)
        dismissed = dismiss_all_shell_rename_errors()
        self.assertEqual(dismissed, 1)

    @patch("print_dialog_win32.click_rename_dialog_ok", return_value=True)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    def test_three_sequential_rename_dialogs(self, mock_find, _click):
        mock_find.side_effect = self._rename_sequence(3)
        dismissed = dismiss_all_shell_rename_errors()
        self.assertEqual(dismissed, 3)

    @patch("print_dialog_win32.click_rename_dialog_ok", return_value=True)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    def test_ten_rename_dialogs_all_dismissed(self, mock_find, _click):
        mock_find.side_effect = self._rename_sequence(10)
        dismissed = dismiss_all_shell_rename_errors()
        self.assertEqual(dismissed, 10)

    @patch("print_dialog_win32.click_rename_dialog_ok", return_value=True)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=9999)
    def test_eleventh_rename_dialog_hard_failure(self, _find, _click):
        with self.assertRaises(SaveFilenameTargetingError) as ctx:
            dismiss_all_shell_rename_errors(max_dismissals=10, timeout_s=30.0)
        self.assertIn("Too many Rename validation dialogs", str(ctx.exception))

    @patch("print_dialog_win32.is_save_pdf_dialog_hwnd", return_value=True)
    @patch("print_dialog_win32.find_save_pdf_dialog_fast", return_value=5001)
    def test_save_dialog_reacquired_after_rename(self, _find, _valid):
        logger = MagicMock()
        hwnd = reacquire_save_pdf_dialog(logger)
        self.assertEqual(hwnd, 5001)
        logger.step.assert_any_call("7_save_dialog_reacquired", "hwnd=5001")

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.set_verified_filename_full_path", return_value=2001)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32.dismiss_all_shell_rename_errors", return_value=0)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_save_clicked_only_after_no_rename(
        self,
        _rename,
        mock_dismiss,
        mock_reacquire,
        mock_enter,
        mock_set,
        _click,
        _confirm,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            save_print_output_dialog(5000, output)
        mock_dismiss.assert_called()
        mock_reacquire.assert_called()
        mock_enter.assert_called_once()
        mock_set.assert_not_called()

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.set_verified_filename_full_path", return_value=2001)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32.dismiss_all_shell_rename_errors", return_value=1)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    def test_filename_rediscovered_after_rename_retry(
        self,
        mock_find,
        _dismiss,
        mock_reacquire,
        mock_enter,
        _set,
        _click,
        _confirm,
    ):
        mock_find.side_effect = [9000, None, None, None]
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            save_print_output_dialog(5000, output)
        self.assertEqual(mock_enter.call_count, 2)
        self.assertEqual(mock_reacquire.call_count, 4)

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32.dismiss_all_shell_rename_errors", return_value=1)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=9000)
    def test_rename_after_second_filename_attempt_fails(
        self,
        _find,
        _dismiss,
        _reacquire,
        mock_enter,
        _click,
        _confirm,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            with self.assertRaises(SaveFilenameTargetingError) as ctx:
                save_print_output_dialog(5000, output)
        self.assertIn("kept recurring", str(ctx.exception))
        self.assertEqual(mock_enter.call_count, 2)

    @patch("print_dialog_win32.click_rename_dialog_ok", return_value=True)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    def test_finds_current_rename_hwnd_each_iteration(self, mock_find, _click):
        mock_find.side_effect = [100, 200, 300, None]
        dismiss_all_shell_rename_errors()
        self.assertEqual(mock_find.call_count, 4)

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=6001)
    @patch("print_dialog_win32.dismiss_all_shell_rename_errors", return_value=1)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_old_filename_hwnd_discarded_after_rename(
        self,
        _rename,
        _dismiss,
        _reacquire,
        mock_enter,
        _click,
        _confirm,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            save_print_output_dialog(5000, output)
        for call in mock_enter.call_args_list:
            save_hwnd = call.args[0]
            self.assertNotEqual(
                save_hwnd,
                5000,
                "Must not reuse stale save dialog hwnd after Rename recovery",
            )
            self.assertEqual(save_hwnd, 6001)


if __name__ == "__main__":
    unittest.main()
