"""Tests for fixture immutability and workspace isolation."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from catalog_probe_fixtures import create_probe_workspace, sha256_file, verify_fixture_unchanged


class ProbeFixtureTests(unittest.TestCase):
    def test_fixture_unchanged_verification(self):
        self.assertTrue(verify_fixture_unchanged("baseline-general"))

    def test_workspace_isolation(self):
        with tempfile.TemporaryDirectory() as tmp:
            job_dir = Path(tmp)
            paths = create_probe_workspace(job_dir, "baseline-general")
            baseline_hash = sha256_file(paths["baseline"])
            master_hash = paths["master_hash"]
            self.assertEqual(baseline_hash, master_hash)
            paths["working"].write_text("<modified/>", encoding="utf-8")
            self.assertNotEqual(sha256_file(paths["baseline"]), sha256_file(paths["working"]))
            self.assertEqual(sha256_file(paths["baseline"]), master_hash)


if __name__ == "__main__":
    unittest.main()
