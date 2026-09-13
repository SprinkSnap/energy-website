"""Tests for probe eligibility classification."""

from __future__ import annotations

import unittest

from catalog_probe_eligibility import (
    choose_probe_value,
    classify_probe_eligibility,
    is_probe_eligible,
)


class ProbeEligibilityTests(unittest.TestCase):
    def test_safe_text_edit(self):
        cls, reason = classify_probe_eligibility(
            {"controlType": "Edit", "label": "Builder name", "value": "Acme"}
        )
        self.assertEqual(cls, "SAFE_TEXT")
        self.assertTrue(is_probe_eligible(cls))

    def test_safe_number_edit(self):
        cls, _ = classify_probe_eligibility(
            {"controlType": "Edit", "label": "Area", "value": "20.0"}
        )
        self.assertEqual(cls, "SAFE_NUMBER")
        self.assertEqual(choose_probe_value(cls, "20.0"), "21.25")

    def test_destructive_button_skipped(self):
        cls, reason = classify_probe_eligibility(
            {"controlType": "Button", "label": "Delete component"}
        )
        self.assertFalse(is_probe_eligible(cls))
        self.assertIn(cls, {"DESTRUCTIVE", "NAVIGATION_ONLY"})

    def test_readonly_skipped(self):
        cls, _ = classify_probe_eligibility(
            {"controlType": "Edit", "label": "Calculated", "readonly": True}
        )
        self.assertEqual(cls, "COMPUTED_READONLY")

    def test_checkbox_safe(self):
        cls, _ = classify_probe_eligibility({"controlType": "CheckBox", "label": "Feature"})
        self.assertEqual(cls, "SAFE_CHECKBOX")

    def test_dropdown_safe(self):
        cls, _ = classify_probe_eligibility(
            {
                "controlType": "ComboBox",
                "label": "Fuel",
                "options": [{"index": 0, "label": "Gas"}],
            }
        )
        self.assertEqual(cls, "SAFE_CODED_SELECT")

    def test_inaccessible_unsupported(self):
        cls, _ = classify_probe_eligibility(
            {"controlType": "Edit", "verification": "inaccessible"}
        )
        self.assertEqual(cls, "UNSUPPORTED")


if __name__ == "__main__":
    unittest.main()
