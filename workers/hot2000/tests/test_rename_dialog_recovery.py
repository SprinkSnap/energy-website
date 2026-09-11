"""Tests for stacked Shell Rename dialog recovery during PDF save."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import print_dialog_win32 as pdw
from print_dialog_win32 import (
    SHELL_RENAME_MAX_DISMISSALS,
    SHELL_RENAME_QUIET_PERIOD_S,
    SaveFilenameTargetingError,
    click_rename_dialog_ok,
    dismiss_all_shell_rename_errors,
    find_shell_rename_error_dialog_fast,
    is_shell_rename_dialog_hwnd,
    save_print_output_dialog,
)


class RenameSequenceSimulator:
    """Simulate sequential Rename dialogs that appear one after another."""

    def __init__(self, count: int, start_hwnd: int = 9000):
        self.hwns = [start_hwnd + index for index in range(count)]
        self.next_index = 0

    def find(self):
        if self.next_index < len(self.hwns):
            return self.hwns[self.next_index]
        return None

    def click_ok(self, hwnd, logger=None):
        assert hwnd == self.hwns[self.next_index]
        self.next_index += 1
        return "BM_CLICK"


class RenameDialogRecoveryTests(unittest.TestCase):
    @patch("print_dialog_win32.click_rename_dialog_ok")
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    def test_nine_sequential_rename_dialogs(self, mock_find, mock_click):
        sim = RenameSequenceSimulator(9)
        mock_find.side_effect = sim.find
        mock_click.side_effect = sim.click_ok
        dismissed = dismiss_all_shell_rename_errors()
        self.assertEqual(dismissed, 9)
        self.assertEqual(mock_click.call_count, 9)

    @patch("print_dialog_win32.is_save_pdf_dialog_hwnd", return_value=True)
    @patch("print_dialog_win32.find_save_pdf_dialog_fast", return_value=5001)
    @patch("print_dialog_win32.click_rename_dialog_ok")
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    @patch("print_dialog_win32.time")
    def test_nine_rename_then_save_dialog_reacquired(
        self,
        mock_time,
        mock_find,
        mock_click,
        _save_find,
        _valid,
    ):
        clock = {"now": 0.0}
        mock_time.time.side_effect = lambda: clock["now"]
        mock_time.sleep.side_effect = lambda seconds: clock.__setitem__(
            "now", clock["now"] + seconds
        )
        sim = RenameSequenceSimulator(9)
        mock_find.side_effect = sim.find
        mock_click.side_effect = sim.click_ok
        logger = MagicMock()
        dismissed = dismiss_all_shell_rename_errors(logger)
        self.assertEqual(dismissed, 9)
        hwnd = pdw.reacquire_save_pdf_dialog(logger)
        self.assertEqual(hwnd, 5001)
        logger.step.assert_any_call("7_rename_drained", "count=9")
        logger.step.assert_any_call("7_save_dialog_reacquired", "hwnd=5001")

    @patch("print_dialog_win32.click_dialog_button", return_value=False)
    @patch("print_dialog_win32.find_child_button", return_value=None)
    @patch("print_dialog_win32.wait_for_rename_dialog_closed", return_value=False)
    @patch("print_dialog_win32.rename_dialog_still_visible", return_value=True)
    @patch("print_dialog_win32.win32gui")
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=9000)
    def test_dismissal_count_only_when_hwnd_closes(
        self,
        _find,
        _valid,
        mock_gui,
        _visible,
        _wait,
        _child,
        _dialog,
    ):
        mock_gui.GetDlgItem.return_value = 8001
        mock_gui.IsWindowVisible.return_value = True
        mock_gui.IsWindowEnabled.return_value = True
        with self.assertRaises(SaveFilenameTargetingError) as ctx:
            dismiss_all_shell_rename_errors()
        self.assertIn("Could not dismiss Rename validation dialog", str(ctx.exception))

    @patch("print_dialog_win32.click_dialog_button", return_value=False)
    @patch("print_dialog_win32.find_child_button", return_value=None)
    @patch("print_dialog_win32.wait_for_rename_dialog_closed")
    @patch("print_dialog_win32.win32con")
    @patch("print_dialog_win32.win32gui")
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    def test_bm_click_fails_wm_command_succeeds(
        self,
        _valid,
        mock_gui,
        mock_con,
        mock_wait,
        _child,
        _dialog,
    ):
        mock_con.BM_CLICK = 245
        mock_con.WM_COMMAND = 273
        mock_gui.GetDlgItem.return_value = 8001
        mock_gui.IsWindowVisible.return_value = True
        mock_gui.IsWindowEnabled.return_value = True
        mock_wait.side_effect = [False, True]
        method = click_rename_dialog_ok(9000)
        self.assertEqual(method, "WM_COMMAND")
        mock_gui.SendMessage.assert_called_once()
        mock_gui.PostMessage.assert_called_once()

    @patch("print_dialog_win32.win32gui")
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    def test_title_rename_without_body_still_matches(self, _valid, mock_gui):
        mock_gui.IsWindowVisible.return_value = True
        mock_gui.GetClassName.return_value = "#32770"
        mock_gui.GetWindowText.return_value = "Rename"
        self.assertTrue(is_shell_rename_dialog_hwnd(9000))

    @patch("print_dialog_win32.dialog_immediate_static_text", return_value="")
    @patch("print_dialog_win32.win32gui")
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    def test_find_rename_without_body_text(self, _valid, mock_gui, _body):
        mock_gui.FindWindow.return_value = 9000
        mock_gui.IsWindowVisible.return_value = True
        mock_gui.GetClassName.return_value = "#32770"
        mock_gui.GetWindowText.return_value = "Rename"
        self.assertEqual(find_shell_rename_error_dialog_fast(), 9000)

    @patch("print_dialog_win32.click_rename_dialog_ok", return_value="BM_CLICK")
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    @patch("print_dialog_win32.time")
    def test_quiet_period_before_drain_completes(self, mock_time, mock_find, _click):
        clock = {"now": 0.0}

        def advance(seconds: float) -> None:
            clock["now"] += seconds

        mock_time.time.side_effect = lambda: clock["now"]
        mock_time.sleep.side_effect = lambda seconds: advance(seconds)
        mock_find.side_effect = [9000] + [None] * 20
        dismissed = dismiss_all_shell_rename_errors()
        self.assertEqual(dismissed, 1)
        self.assertGreaterEqual(clock["now"], SHELL_RENAME_QUIET_PERIOD_S)

    @patch("print_dialog_win32.click_rename_dialog_ok")
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    def test_fifteen_rename_dialogs_allowed(self, mock_find, mock_click):
        sim = RenameSequenceSimulator(15)
        mock_find.side_effect = sim.find
        mock_click.side_effect = sim.click_ok
        dismissed = dismiss_all_shell_rename_errors()
        self.assertEqual(dismissed, 15)

    @patch("print_dialog_win32.click_rename_dialog_ok", return_value="BM_CLICK")
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=9999)
    def test_sixteenth_rename_dialog_hard_failure(self, _find, _click):
        with self.assertRaises(SaveFilenameTargetingError) as ctx:
            dismiss_all_shell_rename_errors(max_dismissals=SHELL_RENAME_MAX_DISMISSALS)
        self.assertIn("Too many Rename validation dialogs", str(ctx.exception))

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.set_verified_filename_full_path", return_value=2001)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32.dismiss_all_shell_rename_errors", return_value=0)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_filename_not_attempted_before_rename_drain(
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
        self.assertGreaterEqual(mock_dismiss.call_count, 1)
        mock_reacquire.assert_called()
        mock_enter.assert_called_once()
        mock_set.assert_not_called()

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=6001)
    @patch("print_dialog_win32.dismiss_all_shell_rename_errors", return_value=9)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_save_and_filename_reacquired_after_rename_sequence(
        self,
        _rename,
        mock_dismiss,
        mock_reacquire,
        mock_enter,
        _click,
        _confirm,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            save_print_output_dialog(5000, output)
        self.assertGreaterEqual(mock_dismiss.call_count, 1)
        for call in mock_enter.call_args_list:
            self.assertEqual(call.args[0], 6001)
        for call in mock_reacquire.call_args_list:
            self.assertTrue(call.args or call.kwargs)

    @patch("print_dialog_win32.click_rename_dialog_ok")
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    @patch("print_dialog_win32.time")
    def test_finds_current_rename_hwnd_each_iteration(
        self,
        mock_time,
        mock_find,
        mock_click,
    ):
        clock = {"now": 0.0}
        mock_time.time.side_effect = lambda: clock["now"]
        mock_time.sleep.side_effect = lambda seconds: clock.__setitem__(
            "now", clock["now"] + seconds
        )
        sim = RenameSequenceSimulator(3, start_hwnd=100)
        mock_find.side_effect = sim.find
        mock_click.side_effect = sim.click_ok
        dismissed = dismiss_all_shell_rename_errors()
        self.assertEqual(dismissed, 3)
        self.assertGreaterEqual(mock_find.call_count, 4)

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


if __name__ == "__main__":
    unittest.main()
