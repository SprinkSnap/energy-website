"""Unit tests for Full House Report helper coercion."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker import (
    as_dialog_hwnd,
    click_dialog_button,
    invoke_win32_menu_path,
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


if __name__ == "__main__":
    unittest.main()
