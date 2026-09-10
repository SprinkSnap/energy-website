"""HOT2000 main window matching must not select Notepad."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker import is_hot2000_main_candidate


class MainWindowMatchTests(unittest.TestCase):
    def test_rejects_notepad_with_hot2000_in_title(self):
        self.assertFalse(
            is_hot2000_main_candidate(
                "HOT2000 Worker.txt - Notepad",
                "Notepad",
            )
        )

    def test_accepts_mfc_hot2000_frame(self):
        self.assertTrue(
            is_hot2000_main_candidate(
                "HOT2000",
                "Afx:00440000:8:00010003:00000000:00FF0F79",
            )
        )

    def test_accepts_hot2000_with_open_file(self):
        self.assertTrue(
            is_hot2000_main_candidate(
                "HOT2000 - calculated.h2k",
                "Afx:00440000:8:00010003:00000000:00FF0F79",
            )
        )

    def test_rejects_dialog(self):
        self.assertFalse(is_hot2000_main_candidate("Progress", "#32770"))


if __name__ == "__main__":
    unittest.main()
