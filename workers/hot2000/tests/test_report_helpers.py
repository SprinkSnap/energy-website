"""Unit tests for Full House Report helper coercion."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker import (
    PDF_PRINTER_LABELS,
    PRINT_DIALOG_MARKERS,
    SAVE_PDF_DIALOG_MARKERS,
    SOC_DATA_SOURCE_LABELS,
    USE_DATA_FROM_DIALOG_MARKERS,
    as_dialog_hwnd,
    click_dialog_button,
    get_menu_item_text,
    invoke_win32_menu_path,
    menu_handles_for_window,
    menu_labels_match,
    normalize_job_pids,
    normalize_menu_label,
)


class ReportHelperTests(unittest.TestCase):
    def test_as_dialog_hwnd_accepts_int(self):
        self.assertEqual(as_dialog_hwnd(12345), 12345)

    def test_as_dialog_hwnd_accepts_wrapper_like_object(self):
        class FakeWrapper:
            handle = 67890

        self.assertEqual(as_dialog_hwnd(FakeWrapper()), 67890)

    def test_click_dialog_button_rejects_int_labels(self):
        self.assertFalse(click_dialog_button(100, 200))

    def test_normalize_menu_label_strips_accelerator(self):
        self.assertEqual(normalize_menu_label("&Report"), "report")

    def test_menu_labels_match_partial(self):
        self.assertTrue(menu_labels_match("Full house report", "house report"))
        self.assertTrue(menu_labels_match("House with standard operating conditions", "standard operating"))

    def test_normalize_job_pids_accepts_int(self):
        self.assertEqual(normalize_job_pids(42), {42})

    def test_normalize_job_pids_accepts_set(self):
        self.assertEqual(normalize_job_pids({1, 2}), {1, 2})

    def test_invoke_win32_menu_path_rejects_int_labels(self):
        with self.assertRaises(TypeError):
            invoke_win32_menu_path(100, 200)

    def test_get_menu_item_text_returns_empty_without_menu(self):
        self.assertEqual(get_menu_item_text(0, 0), "")

    def test_menu_handles_for_window_returns_empty_without_win32(self):
        self.assertEqual(menu_handles_for_window(12345), [])

    def test_soc_data_source_labels_include_standard_operating(self):
        self.assertTrue(
            any("standard operating" in label.lower() for label in SOC_DATA_SOURCE_LABELS)
        )

    def test_use_data_from_dialog_markers(self):
        self.assertIn("use data from", USE_DATA_FROM_DIALOG_MARKERS)

    def test_menu_labels_match_soc_combo_entry(self):
        self.assertTrue(
            menu_labels_match(
                "House with standard operating conditions",
                "standard operating conditions",
            )
        )

    def test_pdf_printer_labels_include_microsoft(self):
        self.assertTrue(any("microsoft" in label.lower() for label in PDF_PRINTER_LABELS))

    def test_print_dialog_markers(self):
        self.assertIn("print", PRINT_DIALOG_MARKERS)

    def test_save_pdf_dialog_markers(self):
        self.assertTrue(
            any("save print output" in marker for marker in SAVE_PDF_DIALOG_MARKERS)
        )


if __name__ == "__main__":
    unittest.main()
