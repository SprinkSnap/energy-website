"""Unit tests for Full House Report helper coercion."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker import as_dialog_hwnd, click_dialog_button


class ReportHelperTests(unittest.TestCase):
    def test_as_dialog_hwnd_accepts_int(self):
        self.assertEqual(as_dialog_hwnd(12345), 12345)

    def test_as_dialog_hwnd_accepts_wrapper_like_object(self):
        class FakeWrapper:
            handle = 67890

        self.assertEqual(as_dialog_hwnd(FakeWrapper()), 67890)

    def test_click_dialog_button_rejects_int_labels(self):
        self.assertFalse(click_dialog_button(100, 200))


if __name__ == "__main__":
    unittest.main()
