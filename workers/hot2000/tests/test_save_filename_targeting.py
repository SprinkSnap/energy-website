"""Tests for Save Print Output As filename targeting via control 0x0480."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

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
    set_verified_filename_full_path,
    split_save_output_path,
    validate_full_pdf_output_path,
    validate_save_filename_only,
    wait_for_pdf_output,
)


class SaveFilenameTargetingTests(unittest.TestCase):
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
    def test_full_absolute_path_written_to_0480(
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
                full_path = str(output.resolve())
                mock_read.return_value = full_path
                set_verified_filename_full_path(1000, output)
        mock_set.assert_called_once()
        self.assertEqual(mock_set.call_args[0][1], full_path)
        cdm_calls = [
            args
            for args, _kwargs in mock_gui.SendMessage.call_args_list
            if len(args) >= 4 and args[2] == CDM_FILENAME_CONTROL_ID
        ]
        self.assertEqual(len(cdm_calls), 1)
        self.assertEqual(cdm_calls[0][3], full_path)

    @patch("print_dialog_win32.set_edit_text")
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=None)
    @patch("print_dialog_win32.log_save_dialog_direct_children")
    def test_missing_0480_fails_before_typing(
        self,
        _log_children,
        _find,
        mock_set,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "report.pdf"
            with self.assertRaises(SaveFilenameTargetingError) as ctx:
                set_verified_filename_full_path(1000, output)
        self.assertIn("0x0480", str(ctx.exception))
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
    @patch("print_dialog_win32.enter_save_print_output_filename")
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32.dismiss_all_shell_rename_errors", return_value=0)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_save_dialog_drains_rename_before_filename(
        self,
        _rename,
        mock_dismiss,
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
        mock_dismiss.assert_called()
        mock_enter.assert_called_once()

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


if __name__ == "__main__":
    unittest.main()
