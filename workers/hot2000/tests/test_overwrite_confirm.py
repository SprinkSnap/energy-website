"""Confirm Save As detection does not require a Windows HWND."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker import looks_like_overwrite_confirm, normalize_caption


class OverwriteConfirmTests(unittest.TestCase):
    def test_confirm_save_as_title(self):
        self.assertTrue(looks_like_overwrite_confirm("Confirm Save As"))

    def test_already_exists_body(self):
        self.assertTrue(
            looks_like_overwrite_confirm(
                "Confirm Save As",
                "calculated.h2k already exists. Do you want to replace it?",
            )
        )
        self.assertTrue(
            looks_like_overwrite_confirm(
                "",
                "calculated.h2k already exists. Do you want to replace it?",
            )
        )

    def test_does_not_match_save_as_itself(self):
        self.assertFalse(looks_like_overwrite_confirm("Save As"))
        self.assertFalse(looks_like_overwrite_confirm("Save House File As"))
        self.assertFalse(looks_like_overwrite_confirm("Progress"))
        self.assertFalse(looks_like_overwrite_confirm("Confirm", "Save changes?"))

    def test_yes_button_captions(self):
        self.assertEqual(normalize_caption("&Yes"), "yes")
        self.assertEqual(normalize_caption("Yes"), "yes")


if __name__ == "__main__":
    unittest.main()
