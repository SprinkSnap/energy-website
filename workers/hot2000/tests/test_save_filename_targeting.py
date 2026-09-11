"""Tests for Save Print Output As filename targeting via control 0x0480."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, call, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    CDM_FILENAME_CONTROL_ID,
    SaveFilenameTargetingError,
    dismiss_shell_rename_error_if_present,
    enter_save_print_output_filename,
    find_verified_filename_edit_0480,
    looks_like_shell_rename_error,
    pdf_ready,
    save_print_output_dialog,
    set_verified_filename_only,
    split_save_output_path,
    validate_full_pdf_output_path,
    validate_save_filename_only,
    wait_for_pdf_output,
)


class SaveFilenameTargetingTests(unittest.TestCase):
    def test_split_path_hot2000_report_job_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "HOT2000-Full-House-Report-123.pdf"
            directory, filename = split_save_output_path(output)
            self.assertEqual(directory, downloads.resolve())
            self.assertEqual(filename, "HOT2000-Full-House-Report-123.pdf")

    def test_split_path_uses_basename_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            directory, filename = split_save_output_path(output)
            self.assertEqual(directory, downloads.resolve())
            self.assertEqual(filename, "report.pdf")

    def test_validate_full_path_accepts_downloads_absolute_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "HOT2000-Full-House-Report-job.pdf"
            verified = validate_full_pdf_output_path(output)
            self.assertEqual(verified.name, "HOT2000-Full-House-Report-job.pdf")
            self.assertEqual(verified.parent, downloads.resolve())

    def test_rejects_full_path_as_bare_filename(self):
        with self.assertRaises(SaveFilenameTargetingError):
            validate_save_filename_only(r"C:\Users\Test\Downloads\report.pdf")

    def test_rejects_path_separators_and_colon_in_bare_filename(self):
        for bad in ("folder\\report.pdf", "folder/report.pdf", "C:report.pdf"):
            with self.assertRaises(SaveFilenameTargetingError):
                validate_save_filename_only(bad)

    @patch("print_dialog_win32.read_edit_text")
    @patch("print_dialog_win32.set_edit_text", return_value=True)
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=2001)
    def test_filename_control_receives_basename_only(
        self,
        _find,
        mock_set,
        mock_read,
    ):
        mock_gui = MagicMock()
        mock_gui.GetClassName.return_value = "Edit"
        with patch("print_dialog_win32.win32gui", mock_gui):
            with tempfile.TemporaryDirectory() as tmp:
                downloads = Path(tmp) / "Downloads"
                downloads.mkdir()
                output = downloads / "HOT2000-Full-House-Report-job.pdf"
                mock_read.return_value = output.name
                set_verified_filename_only(1000, output.name)
        mock_set.assert_called_once()
        self.assertEqual(mock_set.call_args[0][1], "HOT2000-Full-House-Report-job.pdf")
        cdm_calls = [
            args
            for args, _kwargs in mock_gui.SendMessage.call_args_list
            if len(args) >= 4 and args[2] == CDM_FILENAME_CONTROL_ID
        ]
        self.assertEqual(cdm_calls, [])

    @patch("print_dialog_win32.read_edit_text")
    @patch("print_dialog_win32.set_edit_text", return_value=True)
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=2001)
    def test_filename_control_never_receives_full_path(
        self,
        _find,
        mock_set,
        mock_read,
    ):
        mock_gui = MagicMock()
        mock_gui.GetClassName.return_value = "Edit"
        with patch("print_dialog_win32.win32gui", mock_gui):
            with tempfile.TemporaryDirectory() as tmp:
                downloads = Path(tmp) / "Downloads"
                downloads.mkdir()
                output = downloads / "report.pdf"
                mock_read.return_value = "report.pdf"
                set_verified_filename_only(1000, output.name)
        written = mock_set.call_args[0][1]
        self.assertEqual(written, "report.pdf")
        self.assertNotIn("\\", written)
        self.assertNotIn("/", written)
        self.assertNotIn(":", written)

    @patch("print_dialog_win32.read_edit_text")
    @patch("print_dialog_win32.set_edit_text", return_value=True)
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=2001)
    def test_rejects_written_value_starting_with_drive_path(
        self,
        _find,
        _set,
        mock_read,
    ):
        mock_gui = MagicMock()
        mock_gui.GetClassName.return_value = "Edit"
        with patch("print_dialog_win32.win32gui", mock_gui):
            mock_read.return_value = (
                r"C:\Users\Test\Downloads\HOT2000-Full-House-Report-123.pdf"
            )
            with self.assertRaises(SaveFilenameTargetingError) as ctx:
                set_verified_filename_only(1000, "HOT2000-Full-House-Report-123.pdf")
        self.assertIn("expected bare filename", str(ctx.exception).lower())

    @patch("print_dialog_win32.log_save_dialog_uia_controls")
    @patch("print_dialog_win32.log_save_dialog_direct_children")
    @patch("print_dialog_win32.find_filename_edit_uia", return_value=None)
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=None)
    @patch("print_dialog_win32.set_edit_text")
    def test_missing_0480_falls_back_to_uia_then_fails_safely(
        self,
        mock_set,
        _find0480,
        _find_uia,
        _log_children,
        _log_uia,
    ):
        with self.assertRaises(SaveFilenameTargetingError) as ctx:
            set_verified_filename_only(1000, "report.pdf")
        self.assertIn("Could not locate the File name field", str(ctx.exception))
        self.assertNotIn("0x0480", str(ctx.exception))
        mock_set.assert_not_called()

    def test_find_verified_filename_edit_uses_only_0480(self):
        mock_gui = MagicMock()
        mock_gui.GetDlgItem.return_value = 3001
        mock_gui.IsWindowEnabled.return_value = True
        mock_gui.GetClassName.return_value = "Edit"
        with patch("print_dialog_win32.win32gui", mock_gui):
            with patch("print_dialog_win32.is_valid_hwnd", return_value=True):
                edit = find_verified_filename_edit_0480(1000)
        self.assertEqual(edit, 3001)
        mock_gui.GetDlgItem.assert_called_once_with(1000, CDM_FILENAME_CONTROL_ID)

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.set_verified_filename_only", return_value=2001)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.select_downloads_folder_in_save_dialog")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32._dismiss_unexpected_rename_dialogs", return_value=0)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_downloads_selection_before_filename_entry(
        self,
        _rename,
        _dismiss,
        _reacquire,
        mock_select,
        mock_enter,
        _set,
        _click,
        _confirm,
    ):
        manager = MagicMock()
        manager.attach_mock(mock_select, "select")
        manager.attach_mock(mock_enter, "enter")
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            save_print_output_dialog(5000, output.name)
        self.assertEqual(
            [call[0] for call in manager.mock_calls],
            ["select", "enter"],
        )

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.set_verified_filename_only", return_value=2001)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.select_downloads_folder_in_save_dialog")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32._dismiss_unexpected_rename_dialogs", return_value=0)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_save_clicked_after_downloads_and_filename(
        self,
        _rename,
        _dismiss,
        _reacquire,
        mock_select,
        mock_enter,
        mock_set,
        mock_click,
        _confirm,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            save_print_output_dialog(5000, output.name)
        mock_select.assert_called()
        mock_enter.assert_called_once()
        mock_set.assert_not_called()
        mock_click.assert_called_once()

    @patch("print_dialog_win32.select_downloads_folder_in_save_dialog")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32.set_verified_filename_only", return_value=2001)
    def test_enter_filename_selects_downloads_first(
        self,
        _set,
        _reacquire,
        mock_select,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            enter_save_print_output_filename(5000, output.name)
        mock_select.assert_called_once_with(5000, None)

    def test_shell_rename_detection(self):
        self.assertTrue(
            looks_like_shell_rename_error(
                "Rename",
                "A file name can't contain any of the following characters",
            )
        )

    def test_pdf_verification_uses_absolute_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "Downloads"
            path.mkdir()
            pdf = path / "report.pdf"
            pdf.write_bytes(b"%PDF-1.4\n" + b"x" * 200)
            self.assertTrue(pdf_ready(pdf.resolve()))
            self.assertTrue(wait_for_pdf_output(pdf.resolve(), timeout_s=0.5))

    @patch("print_dialog_win32.click_rename_dialog_ok", return_value="BM_CLICK")
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast")
    @patch("print_dialog_win32.time")
    def test_shell_rename_error_is_recoverable(self, mock_time, mock_find, _click):
        clock = {"now": 0.0}
        mock_time.time.side_effect = lambda: clock["now"]
        mock_time.sleep.side_effect = lambda seconds: clock.__setitem__(
            "now", clock["now"] + seconds
        )
        seen = {"rename": False}

        def find_rename():
            if not seen["rename"]:
                seen["rename"] = True
                return 9000
            return None

        mock_find.side_effect = find_rename
        dismissed = dismiss_shell_rename_error_if_present()
        self.assertEqual(dismissed, 1)

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.click_save_dialog_button", return_value=True)
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.select_downloads_folder_in_save_dialog")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32._dismiss_unexpected_rename_dialogs", return_value=0)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_normal_success_path_has_zero_rename_dialogs(
        self,
        _rename,
        mock_dismiss,
        _reacquire,
        _select,
        _enter,
        _click,
        _confirm,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            save_print_output_dialog(5000, output.name)
        mock_dismiss.assert_called()
        self.assertEqual(mock_dismiss.return_value, 0)

    @patch("print_dialog_win32.wait_for_downloads_folder_ready", return_value=True)
    @patch("print_dialog_win32.find_downloads_navigation_item_uia")
    def test_downloads_navigation_selects_downloads_item(
        self,
        mock_find_item,
        _ready,
    ):
        from print_dialog_win32 import select_downloads_folder_in_save_dialog

        item = MagicMock()
        mock_find_item.return_value = item
        logger = MagicMock()
        select_downloads_folder_in_save_dialog(5000, logger)
        item.select.assert_called_once()
        logger.step.assert_any_call("7_downloads_select", "item='Downloads'")


if __name__ == "__main__":
    unittest.main()
