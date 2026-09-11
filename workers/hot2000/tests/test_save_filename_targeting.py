"""Tests for Save Print Output As filename targeting."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    SaveFilenameTargetingError,
    _uia_edit_is_filename_field,
    _uia_edit_is_search_or_address,
    _uia_edit_is_shell_rename,
    dismiss_shell_rename_error_if_present,
    find_save_dialog_filename_control_uia,
    looks_like_shell_rename_error,
    pdf_ready,
    save_print_output_dialog,
    set_dialog_filename,
    split_save_output_path,
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

    def test_rejects_full_path_as_filename(self):
        with self.assertRaises(SaveFilenameTargetingError):
            validate_save_filename_only(r"C:\Users\Test\Downloads\report.pdf")

    def test_rejects_path_separators_and_colon(self):
        for bad in ("folder\\report.pdf", "folder/report.pdf", "C:report.pdf"):
            with self.assertRaises(SaveFilenameTargetingError):
                validate_save_filename_only(bad)

    @patch("print_dialog_win32.dismiss_shell_rename_error_if_present")
    @patch("print_dialog_win32.find_common_dialog_filename_edit", return_value=2001)
    @patch("print_dialog_win32.read_edit_text", return_value="report.pdf")
    @patch("print_dialog_win32.set_edit_text", return_value=True)
    def test_set_dialog_filename_never_receives_full_path(
        self,
        mock_set,
        _read,
        _find_edit,
        _dismiss,
    ):
        set_dialog_filename(1000, "report.pdf")
        for call in mock_set.call_args_list:
            value = call[0][1]
            self.assertEqual(value, "report.pdf")
            self.assertNotIn("\\", value)
            self.assertNotIn("/", value)
            self.assertNotIn(":", value)

    def test_shell_rename_detection(self):
        self.assertTrue(
            looks_like_shell_rename_error(
                "Rename",
                "A file name can't contain any of the following characters",
            )
        )

    def test_search_and_address_edits_are_excluded(self):
        search_meta = {
            "name": "Search Downloads",
            "automation_id": "SearchBox",
            "class_name": "Edit",
            "hwnd": "",
            "rectangle": "",
        }
        address_meta = {
            "name": "Address",
            "automation_id": "AddressBar",
            "class_name": "Edit",
            "hwnd": "",
            "rectangle": "",
        }
        self.assertTrue(_uia_edit_is_search_or_address(search_meta))
        self.assertFalse(_uia_edit_is_filename_field(search_meta))
        self.assertTrue(_uia_edit_is_search_or_address(address_meta))
        self.assertFalse(_uia_edit_is_filename_field(address_meta))

    def test_shell_rename_edit_is_excluded(self):
        rename_meta = {
            "name": "Rename",
            "automation_id": "ShellRenameEdit",
            "class_name": "Edit",
            "hwnd": "",
            "rectangle": "",
        }
        self.assertTrue(_uia_edit_is_shell_rename(rename_meta))
        self.assertFalse(_uia_edit_is_filename_field(rename_meta))

    @patch("print_dialog_win32._uia_control_metadata")
    def test_uia_skips_search_and_shell_edits(self, mock_meta):
        search_edit = MagicMock(name="search_edit")
        shell_edit = MagicMock(name="shell_edit")
        filename_edit = MagicMock(name="filename_edit")
        dialog = MagicMock()
        dialog.child_window.side_effect = Exception("not found")
        dialog.descendants.return_value = [search_edit, shell_edit, filename_edit]
        mock_meta.side_effect = [
            {
                "name": "Search Downloads",
                "automation_id": "SearchBox",
                "class_name": "Edit",
                "hwnd": "1",
                "rectangle": "(0,0,1,1)",
            },
            {
                "name": "Rename",
                "automation_id": "ShellRenameEdit",
                "class_name": "Edit",
                "hwnd": "2",
                "rectangle": "(0,0,1,1)",
            },
            {
                "name": "File name:",
                "automation_id": "1148",
                "class_name": "Edit",
                "hwnd": "3",
                "rectangle": "(0,0,1,1)",
            },
        ]
        selected = find_save_dialog_filename_control_uia(dialog)
        self.assertEqual(selected, filename_edit)
        self.assertNotEqual(selected, search_edit)
        self.assertNotEqual(selected, shell_edit)

    @patch("print_dialog_win32.confirm_save_overwrite_if_present")
    @patch("print_dialog_win32.save_print_output_dialog_uia", return_value=True)
    def test_save_dialog_passes_basename_to_uia(self, mock_uia, _confirm):
        with tempfile.TemporaryDirectory() as tmp:
            downloads = Path(tmp) / "Downloads"
            downloads.mkdir()
            output = downloads / "HOT2000-Full-House-Report-job.pdf"
            logger = MagicMock()
            save_print_output_dialog(5000, output, logger)
        kwargs = mock_uia.call_args.kwargs
        self.assertEqual(kwargs["filename"], "HOT2000-Full-House-Report-job.pdf")
        self.assertIn("Downloads", kwargs["target_directory"])
        logger.step.assert_any_call("7_filename", "HOT2000-Full-House-Report-job.pdf")
        logged_filenames = [
            call.args[1]
            for call in logger.step.call_args_list
            if call.args and call.args[0] == "7_filename"
        ]
        for value in logged_filenames:
            self.assertNotIn("\\", value)
            self.assertNotIn(":", value)

    def test_pdf_verification_uses_absolute_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "report.pdf"
            path.write_bytes(b"%PDF-1.4\n" + b"x" * 200)
            self.assertTrue(pdf_ready(path.resolve()))
            self.assertTrue(wait_for_pdf_output(path.resolve(), timeout_s=0.5))

    @patch("print_dialog_win32.click_dialog_button", return_value=True)
    @patch(
        "print_dialog_win32.find_shell_rename_error_dialog_fast",
        return_value=9000,
    )
    def test_shell_rename_error_raises_clear_message(self, _find, _click):
        with self.assertRaises(SaveFilenameTargetingError) as ctx:
            dismiss_shell_rename_error_if_present()
        self.assertIn("Shell Rename edit", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
