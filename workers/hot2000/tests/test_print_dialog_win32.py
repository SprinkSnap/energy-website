"""Unit tests for pywin32 print dialog helpers."""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    activate_print_dialog_default_button,
    click_print_dialog_button_mouse,
    click_print_dialog_via_command,
    click_hot2000_main_toolbar_print,
    click_report_toolbar_print_button,
    collect_print_target_hwnds,
    export_full_house_report_pdf_manual,
    invoke_file_print_menu,
    invoke_menu_path,
    invoke_print_dialog_print,
    menu_labels_match,
    normalize_label,
    open_report_print_dialog,
    pdf_ready,
    peek_print_dialog,
    post_wm_command,
    printer_label_matches_pdf,
    require_pywin32,
    resolve_print_hwnds,
    send_file_print_command,
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

    def test_menu_labels_match_is_fuzzy(self):
        self.assertTrue(menu_labels_match("&File", "File"))
        self.assertTrue(menu_labels_match("Print", "&Print"))

    def test_print_dialog_helpers_are_callable(self):
        self.assertTrue(callable(click_print_dialog_via_command))
        self.assertTrue(callable(click_print_dialog_button_mouse))
        self.assertTrue(callable(invoke_print_dialog_print))
        self.assertTrue(callable(activate_print_dialog_default_button))
        self.assertTrue(callable(click_hot2000_main_toolbar_print))
        self.assertTrue(callable(click_report_toolbar_print_button))
        self.assertTrue(callable(export_full_house_report_pdf_manual))
        self.assertTrue(callable(send_file_print_command))
        self.assertTrue(callable(invoke_file_print_menu))
        self.assertTrue(callable(invoke_menu_path))
        self.assertTrue(callable(open_report_print_dialog))

    def test_win32_ctypes_module_loads(self):
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

    @patch("print_dialog_win32.is_valid_hwnd")
    @patch("print_dialog_win32.find_hot2000_main_window", return_value=1000)
    @patch("print_dialog_win32.enumerate_hot2000_surfaces", return_value=[1000, 2001])
    @patch("print_dialog_win32.score_report_hwnd")
    def test_collect_print_target_hwnds_discovers_main_when_stale(
        self, mock_score, _surfaces, _find_main, mock_valid
    ):
        mock_valid.side_effect = lambda hwnd: hwnd in (1000, 2001)
        mock_score.side_effect = lambda hwnd, main: 120 if hwnd == 2001 else 25
        targets = collect_print_target_hwnds(9999, 8888)
        self.assertIn(2001, targets)
        self.assertIn(1000, targets)

    @patch("print_dialog_win32.is_valid_hwnd")
    @patch("print_dialog_win32.find_hot2000_main_window", return_value=1000)
    @patch("print_dialog_win32.find_child_report_hwnd", return_value=2001)
    @patch("print_dialog_win32.score_hot2000_main")
    @patch("print_dialog_win32.score_report_hwnd")
    def test_resolve_print_hwnds_uses_print_targets_file(
        self, mock_report_score, mock_main_score, mock_child, _find_main, mock_valid
    ):
        mock_valid.side_effect = lambda hwnd: hwnd in (1000, 2001)
        mock_main_score.side_effect = lambda hwnd: 100 if hwnd == 1000 else 0
        mock_report_score.side_effect = lambda hwnd, main: 150 if hwnd == 2001 else 0
        report, main = resolve_print_hwnds(8888, 7777, extra_hwnds=[2001, 1000])
        self.assertEqual(main, 1000)
        self.assertEqual(report, 2001)
        mock_child.assert_called_once_with(1000)

    @patch("print_dialog_win32.is_valid_hwnd", return_value=False)
    @patch("print_dialog_win32.find_hot2000_main_window", return_value=None)
    def test_resolve_print_hwnds_returns_none_when_hot2000_missing(
        self, _find_main, _valid
    ):
        report, main = resolve_print_hwnds(7145988, 7145988)
        self.assertIsNone(report)
        self.assertIsNone(main)

    @patch("print_dialog_win32.peek_print_dialog", return_value=5555)
    @patch("print_dialog_win32.activate_print_target")
    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    @patch("print_dialog_win32.win32gui")
    def test_try_open_print_stops_when_print_dialog_visible(
        self, mock_gui, mock_valid, _activate, mock_peek
    ):
        from print_dialog_win32 import try_open_print_for_target

        mock_valid.return_value = True
        dialog = try_open_print_for_target(1000, main_hwnd=1000)
        self.assertEqual(dialog, 5555)
        mock_gui.PostMessage.assert_not_called()

    @patch("print_dialog_win32._scan_visible_print_dialogs", return_value=7777)
    @patch("print_dialog_win32.find_print_dialog_by_title", return_value=None)
    def test_peek_print_dialog_uses_scan_fallback(self, _title, _scan):
        self.assertEqual(peek_print_dialog(), 7777)

    @patch("print_dialog_win32.is_valid_hwnd", return_value=True)
    @patch("print_dialog_win32.win32con")
    @patch("print_dialog_win32.win32gui")
    def test_post_wm_command_uses_postmessage_only(self, mock_gui, mock_con, _valid):
        mock_con.WM_COMMAND = 0x0111
        post_wm_command(1000, 57607)
        mock_gui.PostMessage.assert_called_once_with(1000, 0x0111, 57607, 0)
        mock_gui.SendMessage.assert_not_called()


if __name__ == "__main__":
    unittest.main()
