"""Tests for Downloads-folder Full House Report PDF workflow."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    PDF_SAVE_VERIFY_TIMEOUT_S,
    PRINT_HELPER_MAX_TIMEOUT_S,
    PRINTER_SELECTION_TOTAL_TIMEOUT_S,
    SAVE_DIALOG_WAIT_AFTER_PRINT_S,
    build_full_house_report_downloads_path,
    complete_print_dialog_to_pdf,
    invoke_print_dialog_print,
    pdf_ready,
    sanitize_windows_filename,
    select_pdf_printer_in_print_dialog,
)


class PdfDownloadsWorkflowTests(unittest.TestCase):
    def test_sanitize_windows_filename_removes_invalid_chars(self):
        self.assertEqual(sanitize_windows_filename('house<>:"/\\|?*name'), "house---------name")

    def test_build_downloads_path_uses_job_id(self):
        with patch(
            "print_dialog_win32.resolve_windows_downloads_folder",
            return_value=Path("/tmp/Downloads"),
        ):
            path = build_full_house_report_downloads_path("job-123")
        self.assertTrue(str(path).endswith("HOT2000-Full-House-Report-job-123.pdf"))
        self.assertIn("Downloads", str(path))

    def test_build_downloads_path_prefers_export_filename(self):
        with patch(
            "print_dialog_win32.resolve_windows_downloads_folder",
            return_value=Path("/tmp/Downloads"),
        ):
            path = build_full_house_report_downloads_path(
                "job-123",
                "Smith-House.h2k",
            )
        self.assertEqual(path.name, "Smith-House.pdf")

    def test_build_downloads_path_falls_back_to_house_name(self):
        with patch(
            "print_dialog_win32.resolve_windows_downloads_folder",
            return_value=Path("/tmp/Downloads"),
        ):
            path = build_full_house_report_downloads_path(
                "job-123",
                None,
                house_name="My House",
            )
        self.assertEqual(path.name, "My House-Full-House-Report.pdf")

    @patch("print_dialog_win32._select_pdf_printer_uia")
    @patch("print_dialog_win32.list_installed_printers")
    @patch("print_dialog_win32.find_installed_pdf_printer")
    @patch("print_dialog_win32.list_listview_items")
    @patch(
        "print_dialog_win32.get_windows_default_printer",
        return_value="Microsoft Print to PDF",
    )
    def test_default_pdf_skips_list_enumeration(
        self,
        _mock_get_default,
        mock_list_items,
        mock_find_installed,
        mock_list_installed,
        mock_uia,
    ):
        logger = MagicMock()
        select_pdf_printer_in_print_dialog(5000, logger)
        mock_list_items.assert_not_called()
        mock_find_installed.assert_not_called()
        mock_list_installed.assert_not_called()
        mock_uia.assert_not_called()
        logger.step.assert_any_call(
            "4_select_printer_done",
            "default is Microsoft Print to PDF; skipping enumeration",
        )

    def test_timeout_constants_are_bounded(self):
        self.assertEqual(PRINTER_SELECTION_TOTAL_TIMEOUT_S, 10.0)
        self.assertEqual(SAVE_DIALOG_WAIT_AFTER_PRINT_S, 30.0)
        self.assertEqual(PDF_SAVE_VERIFY_TIMEOUT_S, 60.0)
        self.assertLessEqual(PRINT_HELPER_MAX_TIMEOUT_S, 90.0)

    @patch("print_dialog_win32.pdf_ready", return_value=False)
    @patch("print_dialog_win32.find_save_pdf_dialog_fast")
    @patch("print_dialog_win32.click_print_dialog_button_once", return_value=True)
    def test_print_clicked_once(self, mock_click_once, mock_fast, _pdf):
        mock_fast.side_effect = [None, 9000]
        self.assertTrue(invoke_print_dialog_print(8000, Path("out.pdf")))
        mock_click_once.assert_called_once()

    @patch("print_dialog_win32.wait_for_pdf_output", return_value=True)
    @patch("print_dialog_win32.save_print_output_dialog")
    @patch("print_dialog_win32.find_save_pdf_dialog_fast", return_value=9100)
    @patch("print_dialog_win32.click_print_dialog_button_once", return_value=True)
    @patch("print_dialog_win32.select_pdf_printer_in_print_dialog", return_value="Microsoft Print to PDF")
    @patch("print_dialog_win32.pdf_ready", return_value=False)
    @patch("print_dialog_win32.focus_modal_dialog")
    def test_complete_print_waits_for_save_before_verify(
        self,
        _focus,
        _pdf,
        _select,
        mock_click,
        _fast,
        mock_save_dialog,
        _wait_pdf,
    ):
        output = Path("/tmp/Downloads/HOT2000-Full-House-Report-test.pdf")
        self.assertTrue(complete_print_dialog_to_pdf(output, 8000))
        mock_click.assert_called_once()
        mock_save_dialog.assert_called_once()

    def test_pdf_ready_requires_header_and_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "out.pdf"
            path.write_bytes(b"%PDF-1.4\n" + b"x" * 200)
            self.assertTrue(pdf_ready(path))


class WorkerDownloadsIntegrationTests(unittest.TestCase):
    @patch("worker.progress")
    @patch("worker.write_print_targets_file")
    @patch("worker.shutil.copy2")
    @patch("worker.pdf_output_ready", return_value=True)
    @patch("worker.wait_for_pdf_output")
    @patch("worker.run_report_print_32bit")
    @patch("worker.refresh_report_print_target", return_value=2000)
    @patch("worker.wait_for_report_print_target", return_value=2000)
    @patch("worker.require_windows_default_pdf_printer", return_value="Microsoft Print to PDF")
    @patch("worker.build_full_house_report_downloads_path")
    @patch("worker.extract_house_name_from_h2k", return_value="Sample House")
    def test_save_full_house_report_copies_verified_downloads_pdf(
        self,
        _extract,
        mock_build,
        _find_printer,
        _wait_report,
        _refresh,
        mock_run,
        _wait_pdf,
        _ready,
        mock_copy2,
        _write_targets,
        _progress,
    ):
        from worker import save_full_house_report_pdf

        downloads = Path("/tmp/Downloads/Sample House-Full-House-Report.pdf")
        website = Path("/tmp/job/soc-full-house-report.pdf")
        mock_build.return_value = downloads
        result = save_full_house_report_pdf(
            "job-1",
            {1234},
            website,
            1000,
            job_dir=None,
        )
        mock_run.assert_called_once()
        self.assertEqual(mock_run.call_args[0][0], downloads)
        mock_copy2.assert_called_with(downloads, website)
        self.assertEqual(result, downloads)

    @patch("worker.send_command")
    @patch("worker.append_print_step")
    def test_close_hot2000_refuses_without_pdf_verified(self, _append, _send):
        from worker import close_hot2000_application

        proc = MagicMock()
        with self.assertRaises(RuntimeError):
            close_hot2000_application(
                proc,
                1000,
                1234,
                require_pdf_verified=True,
                pdf_verified=False,
            )
        _send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
