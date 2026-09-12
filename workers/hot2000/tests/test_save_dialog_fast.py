"""Tests for super-fast Save Print Output As automation."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import print_dialog_win32 as pdw
from print_dialog_test_helpers import pdf_ready_false_until_save_complete, verified_filename


class SaveDialogFastTests(unittest.TestCase):
    def test_worker_build_id_bumped(self):
        import worker

        self.assertEqual(worker.WORKER_BUILD_ID, "2026-09-11j")

    def test_pdf_ready_poll_interval(self):
        self.assertLessEqual(pdw.PDF_READY_POLL_S, 0.025)

    @patch("print_dialog_win32.read_edit_text", return_value="My-House.pdf")
    @patch("print_dialog_win32.set_edit_text", return_value=True)
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=2001)
    @patch("print_dialog_win32.win32gui")
    def test_uia_not_rediscovered_after_verified_win32_write(self, mock_gui, *_mocks):
        mock_gui.GetClassName.return_value = "Edit"
        with patch("print_dialog_win32.find_filename_edit_uia") as mock_uia:
            result = pdw.set_verified_filename_only(1000, "My-House.pdf")
        self.assertTrue(result.verified)
        mock_uia.assert_not_called()

    @patch("print_dialog_win32.wait_for_filename_field_settled")
    @patch("print_dialog_win32.read_save_dialog_filename_value")
    @patch("print_dialog_win32.wait_for_pdf_after_save", return_value=True)
    @patch("print_dialog_win32.click_save_dialog_button_fast", return_value=True)
    @patch(
        "print_dialog_win32.enter_save_print_output_filename",
        return_value=verified_filename(),
    )
    @patch("print_dialog_win32.verify_downloads_folder_selected_uia", return_value=True)
    @patch("print_dialog_win32.ensure_save_dialog_hwnd", side_effect=lambda hwnd, _l: hwnd)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_verified_result_skips_redundant_readback_and_settle(
        self,
        _rename,
        _ensure,
        _downloads,
        _enter,
        _save,
        _wait_pdf,
        mock_read,
        mock_settle,
    ):
        pdw.save_print_output_dialog(5000, "My-House.pdf")
        mock_read.assert_not_called()
        mock_settle.assert_not_called()

    @patch("print_dialog_win32.time.sleep")
    @patch("print_dialog_win32.wait_for_pdf_after_save", return_value=True)
    @patch("print_dialog_win32.click_save_dialog_button_fast", return_value=True)
    @patch(
        "print_dialog_win32.enter_save_print_output_filename",
        return_value=verified_filename(),
    )
    @patch("print_dialog_win32.verify_downloads_folder_selected_uia", return_value=True)
    @patch("print_dialog_win32.ensure_save_dialog_hwnd", side_effect=lambda hwnd, _l: hwnd)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_no_filename_post_write_sleep_on_verified_path(
        self,
        _rename,
        _ensure,
        _downloads,
        _enter,
        _save,
        _wait_pdf,
        mock_sleep,
    ):
        pdw.save_print_output_dialog(5000, "My-House.pdf")
        for args, _kwargs in mock_sleep.call_args_list:
            self.assertNotEqual(args[0], pdw.FILENAME_POST_WRITE_WAIT_S)

    @patch("print_dialog_win32.wait_for_pdf_after_save", return_value=True)
    @patch("print_dialog_win32.click_save_dialog_button_fast", return_value=True)
    @patch(
        "print_dialog_win32.enter_save_print_output_filename",
        return_value=verified_filename(),
    )
    @patch("print_dialog_win32.verify_downloads_folder_selected_uia", return_value=True)
    @patch("print_dialog_win32.ensure_save_dialog_hwnd", side_effect=lambda hwnd, _l: hwnd)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_save_uses_fast_button_click(
        self,
        _rename,
        _ensure,
        _downloads,
        _enter,
        mock_save,
        _wait_pdf,
    ):
        pdw.save_print_output_dialog(5000, "My-House.pdf")
        mock_save.assert_called_once_with(5000)

    @patch("print_dialog_win32.select_downloads_folder_in_save_dialog")
    @patch("print_dialog_win32.wait_for_pdf_after_save", return_value=True)
    @patch("print_dialog_win32.click_save_dialog_button_fast", return_value=True)
    @patch(
        "print_dialog_win32.enter_save_print_output_filename",
        return_value=verified_filename(),
    )
    @patch("print_dialog_win32.verify_downloads_folder_selected_uia", return_value=True)
    @patch("print_dialog_win32.ensure_save_dialog_hwnd", side_effect=lambda hwnd, _l: hwnd)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_downloads_verified_once_when_already_selected(
        self,
        _rename,
        _ensure,
        _downloads,
        _enter,
        _save,
        _wait_pdf,
        mock_select,
    ):
        pdw.save_print_output_dialog(5000, "My-House.pdf")
        mock_select.assert_not_called()

    @patch("print_dialog_win32.reacquire_save_pdf_dialog")
    @patch("print_dialog_win32.is_save_pdf_dialog_hwnd", return_value=True)
    @patch("print_dialog_win32.wait_for_pdf_after_save", return_value=True)
    @patch("print_dialog_win32.click_save_dialog_button_fast", return_value=True)
    @patch(
        "print_dialog_win32.enter_save_print_output_filename",
        return_value=verified_filename(),
    )
    @patch("print_dialog_win32.verify_downloads_folder_selected_uia", return_value=True)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_valid_save_hwnd_not_reacquired(
        self,
        _rename,
        _downloads,
        _enter,
        _save,
        _wait_pdf,
        _valid,
        mock_reacquire,
    ):
        pdw.save_print_output_dialog(5000, "My-House.pdf")
        mock_reacquire.assert_not_called()

    @patch("print_dialog_win32.click_dialog_button", return_value=True)
    @patch("print_dialog_win32.pdf_ready", return_value=True)
    def test_precleared_staging_skips_overwrite_scan(self, _ready, mock_click):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "My-House.pdf"
            path.write_bytes(b"%PDF-1.4\n" + b"x" * 200)
            with patch(
                "print_dialog_win32.peek_overwrite_confirm_fast",
                return_value=9999,
            ) as mock_peek:
                self.assertTrue(
                    pdw.wait_for_pdf_after_save(
                        path,
                        staging_precleared=True,
                    )
                )
                mock_peek.assert_not_called()
                mock_click.assert_not_called()

    @patch("print_dialog_win32.click_dialog_button", return_value=True)
    @patch("print_dialog_win32.pdf_ready")
    @patch("print_dialog_win32.peek_overwrite_confirm_fast")
    @patch("print_dialog_win32.time.sleep")
    def test_combined_post_save_loop_handles_overwrite_then_pdf(
        self,
        _sleep,
        mock_peek,
        mock_ready,
        mock_click,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "My-House.pdf"
            mock_peek.side_effect = [1234, None, None]
            mock_ready.side_effect = [False, True]
            self.assertTrue(
                pdw.wait_for_pdf_after_save(path, staging_precleared=False, timeout_s=1.0)
            )
            mock_click.assert_called_once()
            mock_peek.assert_called()

    def test_pdf_ready_uses_single_stat(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ok.pdf"
            path.write_bytes(b"%PDF-1.4\n" + b"x" * 200)
            with patch.object(Path, "is_file") as mock_is_file:
                self.assertTrue(pdw.pdf_ready(path))
                mock_is_file.assert_not_called()


if __name__ == "__main__":
    unittest.main()
