"""Tests for mapping merge and conflict detection."""

from __future__ import annotations

import unittest

from catalog_probe_mappings import merge_mapping
from catalog_probe_models import FieldMapping, MappingEvidence


class ProbeMappingTests(unittest.TestCase):
    def _mapping(self, control_id: str, path: str, confidence: str = "exact") -> FieldMapping:
        return FieldMapping(
            control_id=control_id,
            screen_key="11.13::weather",
            label="Region",
            fixture_id="baseline-weather",
            hot2000_version="11.13",
            mapping={"path": path, "type": "attribute", "confidence": confidence},
            evidence=MappingEvidence(baseline_value="5", probe_stored_value="6"),
        )

    def test_merge_agreeing_increases_confidence(self):
        existing = [
            {
                "controlId": "region",
                "fixtureId": "baseline-weather",
                "mapping": {"path": "/Weather/Region/@code", "confidence": "high"},
            }
        ]
        merged, conflicts = merge_mapping(
            existing,
            self._mapping("region", "/Weather/Region/@code", "exact"),
            fixture_hash="abc",
        )
        self.assertEqual(len(conflicts), 0)
        self.assertEqual(len(merged), 1)

    def test_merge_conflict_retains_both(self):
        existing = [
            {
                "controlId": "region",
                "fixtureId": "baseline-weather",
                "mapping": {"path": "/Weather/Region/@code", "confidence": "exact"},
            }
        ]
        merged, conflicts = merge_mapping(
            existing,
            self._mapping("region", "/Weather/Location/@code"),
            fixture_hash="abc",
        )
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(len(merged), 2)


if __name__ == "__main__":
    unittest.main()
