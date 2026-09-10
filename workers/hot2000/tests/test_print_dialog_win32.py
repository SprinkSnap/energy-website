"""Unit tests for pywin32 print dialog helpers."""

from pathlib import Path
import sys
import tempfile
import unittest
import os

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    activate_print_dialog_default_button,
    click_print_dialog_button_mouse,
    click_print_dialog_via_command,
    invoke_print_dialog_print,
    normalize_label,
    pdf_ready,
    printer_label_matches_pdf,
    require_pywin32,
)


class PrintDialogWin32Tests(unittest.TestCase):
    def test_normalize_label_strips_accelerator(self):
        self.assertEqual(normalize_label("&Print"), "print")

    def test_printer_label_matches_pdf(self):
        self.assertTrue(printer_label_matches_pdf("Microsoft Print to PDF"))
        self.assertFalse(printer_label_matches_pdf("Brother PC-FAX v.3.2"))

    def test_pdf_ready_accepts_valid_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "out.pdf"
            path.write_bytes(b"%PDF-1.4\n" + b"x" * 200)
            self.assertTrue(pdf_ready(path))

    def test_pdf_ready_rejects_small_or_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "out.pdf"
            path.write_bytes(b"not-a-pdf")
            self.assertFalse(pdf_ready(path))
            path.write_bytes(b"%PDF")
            self.assertFalse(pdf_ready(path))

    def test_print_dialog_helpers_are_callable(self):
        self.assertTrue(callable(click_print_dialog_via_command))
        self.assertTrue(callable(click_print_dialog_button_mouse))
        self.assertTrue(callable(invoke_print_dialog_print))
        self.assertTrue(callable(activate_print_dialog_default_button))

        if os.name != "nt":
            self.skipTest("Windows only")
        from win32_ctypes import win32con, win32gui

        self.assertEqual(win32con.BM_CLICK, 0x00F5)
        self.assertTrue(hasattr(win32gui, "SendMessage"))

    def test_require_pywin32_raises_off_windows(self):
        if sys.platform == "win32":
            self.skipTest("pywin32 may be installed on Windows runners")
        with self.assertRaises(ImportError):
            require_pywin32()


if __name__ == "__main__":
    unittest.main()
