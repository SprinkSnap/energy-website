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
    @patch("print_dialog_win32._select_pdf_printer_uia")
    @patch("print_dialog_win32._select_pdf_printer_typeahead")
    @patch("print_dialog_win32._select_pdf_printer_pywinauto_win32")
    @patch("print_dialog_win32.select_listview_text")
    @patch("print_dialog_win32.list_listview_items")
    @patch("print_dialog_win32.list_installed_printers")
    @patch("print_dialog_win32.find_installed_pdf_printer")
    @patch(
        "print_dialog_win32.get_windows_default_printer",
        return_value="Microsoft Print to PDF",
    )
    def test_default_pdf_skips_all_enumeration(
        self,
        _mock_get_default,
        mock_find_installed,
        mock_list_installed,
        mock_list_items,
        mock_select_row,
        mock_pwa,
        mock_typeahead,
        mock_uia,
    ):
        selected = select_pdf_printer_in_print_dialog(5000)
        self.assertEqual(selected, "Microsoft Print to PDF")
        mock_find_installed.assert_not_called()
        mock_list_installed.assert_not_called()
        mock_list_items.assert_not_called()
        mock_select_row.assert_not_called()
        mock_pwa.assert_not_called()
        mock_typeahead.assert_not_called()
        mock_uia.assert_not_called()

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

    @patch("print_dialog_win32.find_installed_pdf_printer")
    @patch("print_dialog_win32.get_windows_default_printer", return_value="Brother Printer")
    def test_non_default_pdf_raises_immediately(self, _default, mock_find_installed):
        with self.assertRaises(PrinterSelectionError) as ctx:
            select_pdf_printer_in_print_dialog(5000)
        self.assertIn("must be the Windows default printer", str(ctx.exception))
        mock_find_installed.assert_not_called()

    @patch("print_dialog_win32.find_installed_pdf_printer")
    @patch("print_dialog_win32.get_windows_default_printer", return_value="Brother Printer")
    def test_selection_failure_is_immediate(self, _default, mock_find_installed):
        start = time.time()
        with self.assertRaises(PrinterSelectionError):
            select_pdf_printer_in_print_dialog(5000)
        elapsed = time.time() - start
        self.assertLess(elapsed, 1.0)
        mock_find_installed.assert_not_called()

    @patch("print_dialog_win32.pdf_ready", return_value=False)
    @patch("print_dialog_win32.find_save_pdf_dialog", return_value=None)
    @patch("print_dialog_win32.click_print_dialog_button_once", return_value=True)
    def test_invoke_print_dialog_print_single_click_and_wait(
        self, mock_click_once, _save, _pdf
    ):
        with patch(
            "print_dialog_win32.find_save_pdf_dialog",
            side_effect=[None, 9000],
        ):
            self.assertTrue(invoke_print_dialog_print(8000, Path("out.pdf")))
        mock_click_once.assert_called_once()
        self.assertEqual(mock_click_once.call_args[0][0], 8000)

    @patch("print_dialog_win32.invoke_print_dialog_print", return_value=True)
    @patch("print_dialog_win32.find_installed_pdf_printer")
    @patch("print_dialog_win32.list_installed_printers")
    @patch(
        "print_dialog_win32.get_windows_default_printer",
        return_value="Microsoft Print to PDF",
    )
    def test_complete_print_proceeds_directly_to_print(
        self,
        _mock_get_default,
        mock_list_installed,
        mock_find_installed,
        mock_invoke_print,
    ):
        with patch(
            "print_dialog_win32.select_pdf_printer_in_print_dialog",
            wraps=select_pdf_printer_in_print_dialog,
        ) as mock_select:
            with patch("print_dialog_win32.wait_for_save_pdf_dialog", return_value=9100):
                with patch("print_dialog_win32.save_print_output_dialog"):
                    with patch("print_dialog_win32.wait_for_pdf_output", return_value=True):
                        with patch("print_dialog_win32.find_save_pdf_dialog", return_value=None):
                            with patch("print_dialog_win32.pdf_ready", return_value=False):
                                with patch("print_dialog_win32.focus_modal_dialog"):
                                    self.assertTrue(
                                        complete_print_dialog_to_pdf(Path("out.pdf"), 8000)
                                    )
        mock_find_installed.assert_not_called()
        mock_list_installed.assert_not_called()
        mock_select.assert_called_once()
        mock_invoke_print.assert_called_once()

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
