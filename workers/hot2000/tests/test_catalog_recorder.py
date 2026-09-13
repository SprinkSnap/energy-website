"""Unit tests for catalog recorder helpers (non-Windows safe)."""

from __future__ import annotations

import json
import unittest

from catalog_models import CapturedControl, DropdownOption, SectionCapture
from catalog_recorder import _infer_section_from_title, _summarize_capture


class CatalogRecorderTests(unittest.TestCase):
    def test_infer_section_from_title(self):
        self.assertEqual(_infer_section_from_title("Weather"), "weather")
        self.assertEqual(_infer_section_from_title("Heating / Cooling"), "heating-cooling")
        self.assertEqual(_infer_section_from_title("Custom Panel"), "custom-panel")

    def test_section_capture_serializes_metadata(self):
        capture = SectionCapture(
            section="weather",
            window_title="Weather",
            worker="win-worker-01",
            controls=[
                CapturedControl(
                    stable_id="region",
                    control_type="ComboBox",
                    label="Weather region",
                    options=[
                        DropdownOption(index=0, label="ONTARIO", selected=True),
                    ],
                )
            ],
            inaccessible_controls=[{"stableId": "x", "verification": "inaccessible"}],
        )
        payload = capture.to_dict()
        self.assertEqual(payload["section"], "weather")
        self.assertEqual(payload["controls"][0]["options"][0]["label"], "ONTARIO")
        self.assertEqual(payload["inaccessibleControls"][0]["verification"], "inaccessible")
        json.dumps(payload)

    def test_summarize_capture_counts(self):
        capture = SectionCapture(
            section="general",
            controls=[
                CapturedControl(stable_id="a", control_type="Edit", value="123"),
                CapturedControl(stable_id="b", control_type="CheckBox"),
                CapturedControl(
                    stable_id="c",
                    control_type="ComboBox",
                    options=[DropdownOption(index=0, label="One")],
                ),
            ],
            inaccessible_controls=[{"stableId": "z"}],
        )
        summary = _summarize_capture(capture)
        self.assertEqual(summary["controlsDiscovered"], 3)
        self.assertEqual(summary["comboBoxes"], 1)
        self.assertEqual(summary["dropdownOptions"], 1)
        self.assertEqual(summary["inaccessibleControls"], 1)


if __name__ == "__main__":
    unittest.main()
