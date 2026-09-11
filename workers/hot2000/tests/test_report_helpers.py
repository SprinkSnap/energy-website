"""Unit tests for Full House Report helper coercion."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from unittest.mock import patch

from worker import (
    PDF_PRINTER_LABELS,
    PRINT_DIALOG_MARKERS,
    SAVE_PDF_DIALOG_MARKERS,
    SOC_DATA_SOURCE_LABELS,
    USE_DATA_FROM_DIALOG_MARKERS,
    WORKER_BUILD_ID,
    as_dialog_hwnd,
    click_dialog_button,
    enumerate_all_dialog_hwnds,
    find_python32_executable,
    get_menu_item_text,
    has_mdi_client_ancestor,
    invoke_win32_menu_path,
    printer_label_matches_pdf,
    is_soc_data_source_label,
    menu_handles_for_window,
    menu_labels_match,
    normalize_job_pids,
    normalize_menu_label,
    score_report_window,
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

    def test_is_soc_data_source_label_accepts_soc(self):
        self.assertTrue(
            is_soc_data_source_label("House with standard operating conditions")
        )

    def test_is_soc_data_source_label_rejects_bare_house(self):
        self.assertFalse(is_soc_data_source_label("House"))
        self.assertFalse(is_soc_data_source_label("Base House"))

    def test_menu_labels_match_must_not_select_bare_house_for_soc(self):
        self.assertTrue(
            menu_labels_match(
                "House with standard operating conditions",
                "House with standard operating conditions",
            )
        )
        self.assertFalse(is_soc_data_source_label("House"))

    def test_worker_build_id_requires_32bit_report_print_helper(self):
        self.assertEqual(WORKER_BUILD_ID, "2026-09-10zs")

    @patch.dict("os.environ", {"HOT2000_PYTHON32": r"C:\Python313-32\python.exe"})
    @patch("worker.Path")
    def test_find_python32_executable_uses_env(self, mock_path):
        mock_path.return_value.is_file.return_value = True
        self.assertEqual(
            find_python32_executable(),
            r"C:\Python313-32\python.exe",
        )

    @patch("worker.enumerate_top_level_windows", return_value=[100, 200])
    @patch("worker.win32gui")
    def test_enumerate_all_dialog_hwnds_includes_nested(self, mock_gui, _top):
        mock_gui.IsWindow.return_value = True
        mock_gui.IsWindowVisible.return_value = True
        mock_gui.GetClassName.side_effect = lambda hwnd: "#32770" if hwnd == 101 else "Frame"
        mock_gui.GetWindow.return_value = None
        mock_gui.EnumChildWindows.side_effect = lambda hwnd, cb, _: cb(101, None) if hwnd == 100 else None
        self.assertEqual(enumerate_all_dialog_hwnds(), [101])

    def test_printer_label_matches_pdf(self):
        self.assertTrue(printer_label_matches_pdf("Microsoft Print to PDF"))
        self.assertFalse(printer_label_matches_pdf("Brother PC-FAX v.3.2"))

    @patch("worker.window_area", return_value=300_000)
    @patch("worker.has_mdi_client_ancestor", return_value=True)
    def test_score_report_window_prefers_untitled_mdi_afx_child(
        self, _mdi, _area
    ):
        with patch("worker.win32gui") as mock_gui:
            mock_gui.IsWindow.return_value = True
            mock_gui.IsWindowVisible.return_value = True
            mock_gui.GetClassName.return_value = "Afx:00400000:8:00010003:00000000:00000000"
            mock_gui.GetWindowText.return_value = ""
            score = score_report_window(2001, 1000)
        self.assertGreaterEqual(score, 40)

    @patch("worker.win32gui")
    def test_has_mdi_client_ancestor_detects_mdi_child(self, mock_gui):
        mock_gui.GetParent.side_effect = lambda hwnd: {2001: 2000, 2000: 1000}.get(hwnd)
        mock_gui.GetClassName.side_effect = lambda hwnd: {
            2000: "MDIClient",
            2001: "AfxFrameOrView",
        }.get(hwnd, "")
        self.assertTrue(has_mdi_client_ancestor(2001, 1000))

    @patch("worker.win32gui")
    def test_score_report_window_prefers_soc_title(self, mock_gui):
        mock_gui.IsWindow.return_value = True
        mock_gui.IsWindowVisible.return_value = True
        mock_gui.GetClassName.return_value = "Afx:00400000"
        mock_gui.GetWindowText.return_value = (
            "Full House Report — House with standard operating conditions"
        )
        with patch("worker.window_area", return_value=300_000):
            with patch("worker.has_mdi_client_ancestor", return_value=True):
                score = score_report_window(2001, 1000)
        self.assertGreaterEqual(score, 140)


if __name__ == "__main__":
    unittest.main()
