"""Regression tests for bounded Print-dialog printer selection."""

import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    PRINTER_SELECTION_TOTAL_TIMEOUT_S,
    SAVE_DIALOG_WAIT_AFTER_PRINT_S,
    PDF_SAVE_VERIFY_TIMEOUT_S,
    PrinterSelectionError,
    complete_print_dialog_to_pdf,
    invoke_print_dialog_print,
    pdf_ready,
    select_pdf_printer_in_print_dialog,
    select_pdf_printer_robust,
)


class PrintPrinterSelectionTests(unittest.TestCase):
    @patch("print_dialog_win32.default_printer_is_pdf", return_value=True)
    @patch("print_dialog_win32.get_windows_default_printer", return_value="Microsoft Print to PDF")
    @patch("print_dialog_win32.find_installed_pdf_printer", return_value="Microsoft Print to PDF")
    @patch("print_dialog_win32.list_listview_items")
    def test_default_pdf_skips_listview_enumeration(self, mock_list, *_mocks):
        selected = select_pdf_printer_in_print_dialog(5000)
        self.assertEqual(selected, "Microsoft Print to PDF")
        mock_list.assert_not_called()

    @patch("print_dialog_win32.select_pdf_printer_in_print_dialog")
    @patch("print_dialog_win32.list_listview_items")
    @patch("print_dialog_win32.get_listview_item_text")
    def test_select_pdf_printer_robust_avoids_raw_lvm(
        self, mock_get_text, mock_list, mock_select
    ):
        mock_select.return_value = "Microsoft Print to PDF"
        self.assertTrue(select_pdf_printer_robust(5000))
        mock_list.assert_not_called()
        mock_get_text.assert_not_called()

    @patch("print_dialog_win32._select_pdf_printer_typeahead", return_value=False)
    @patch("print_dialog_win32._select_pdf_printer_pywinauto_win32", return_value=False)
    @patch("print_dialog_win32._select_pdf_printer_uia", return_value=True)
    @patch("print_dialog_win32._pdf_printer_visible_in_dialog", return_value=False)
    @patch("print_dialog_win32.default_printer_is_pdf", return_value=False)
    @patch("print_dialog_win32.find_installed_pdf_printer", return_value="Microsoft Print to PDF")
    @patch("print_dialog_win32.get_windows_default_printer", return_value="Brother Printer")
    @patch("print_dialog_win32.set_windows_default_printer", return_value=True)
    def test_uia_is_first_non_default_method(
        self,
        _set_default,
        _default,
        _installed,
        _visible,
        _pdf_visible,
        mock_uia,
        mock_win32,
        mock_type,
    ):
        selected = select_pdf_printer_in_print_dialog(5000)
        self.assertEqual(selected, "Microsoft Print to PDF")
        mock_uia.assert_called_once()
        mock_win32.assert_not_called()
        mock_type.assert_not_called()

    @patch("print_dialog_win32._printer_selection_failure_diagnostics", return_value="diag")
    @patch("print_dialog_win32._select_pdf_printer_typeahead", return_value=False)
    @patch("print_dialog_win32._select_pdf_printer_pywinauto_win32", return_value=False)
    @patch("print_dialog_win32._select_pdf_printer_uia", return_value=False)
    @patch("print_dialog_win32._pdf_printer_visible_in_dialog", return_value=False)
    @patch("print_dialog_win32.default_printer_is_pdf", return_value=False)
    @patch("print_dialog_win32.find_installed_pdf_printer", return_value="Microsoft Print to PDF")
    @patch("print_dialog_win32.get_windows_default_printer", return_value="Brother Printer")
    @patch("print_dialog_win32.set_windows_default_printer", return_value=False)
    def test_selection_failure_within_total_timeout(self, *_mocks):
        start = time.time()
        with self.assertRaises(PrinterSelectionError):
            select_pdf_printer_in_print_dialog(5000)
        elapsed = time.time() - start
        self.assertLessEqual(elapsed, PRINTER_SELECTION_TOTAL_TIMEOUT_S + 2.0)

    @patch("print_dialog_win32.pdf_ready", return_value=False)
    @patch("print_dialog_win32.find_save_pdf_dialog", return_value=None)
    @patch("print_dialog_win32.click_print_dialog_button_mouse")
    def test_invoke_print_dialog_print_single_click_and_wait(
        self, mock_mouse, _save, _pdf
    ):
        with patch(
            "print_dialog_win32.find_save_pdf_dialog",
            side_effect=[None, 9000],
        ):
            self.assertTrue(invoke_print_dialog_print(8000, Path("out.pdf")))
        mock_mouse.assert_called_once_with(8000)

    def test_save_dialog_wait_constant_is_thirty_seconds(self):
        self.assertEqual(SAVE_DIALOG_WAIT_AFTER_PRINT_S, 30.0)
        self.assertEqual(PRINTER_SELECTION_TOTAL_TIMEOUT_S, 10.0)
        self.assertEqual(PDF_SAVE_VERIFY_TIMEOUT_S, 60.0)

    def test_pdf_ready_requires_pdf_header_and_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "out.pdf"
            path.write_bytes(b"%PDF-1.4\n" + b"x" * 200)
            self.assertTrue(pdf_ready(path))
            path.write_bytes(b"not-a-pdf" + b"x" * 200)
            self.assertFalse(pdf_ready(path))

    @patch("print_dialog_win32.wait_for_pdf_output", return_value=True)
    @patch("print_dialog_win32.save_print_output_dialog")
    @patch("print_dialog_win32.wait_for_save_pdf_dialog", return_value=9100)
    @patch("print_dialog_win32.invoke_print_dialog_print", return_value=True)
    @patch("print_dialog_win32.select_pdf_printer_in_print_dialog", return_value="Microsoft Print to PDF")
    @patch("print_dialog_win32.find_save_pdf_dialog", return_value=None)
    @patch("print_dialog_win32.pdf_ready", return_value=False)
    @patch("print_dialog_win32.focus_modal_dialog")
    def test_complete_print_waits_for_save_after_print(
        self,
        _focus,
        _pdf,
        _find_save,
        _select,
        mock_invoke_print,
        _wait_save,
        _save_dialog,
        _wait_pdf,
    ):
        output = Path("out.pdf")
        self.assertTrue(complete_print_dialog_to_pdf(output, 8000))
        mock_invoke_print.assert_called_once()
        _wait_save.assert_called_once()


if __name__ == "__main__":
    unittest.main()
