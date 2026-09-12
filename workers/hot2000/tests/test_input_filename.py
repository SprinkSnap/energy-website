"""Tests for Full House Report input H2K filename handling."""

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker import (
    WORKER_BUILD_ID,
    resolve_full_house_report_input_filename,
    sanitize_input_h2k_filename,
    verify_full_house_report_input_file,
)


class InputFilenameTests(unittest.TestCase):
    def test_my_house_h2k_unchanged(self):
        self.assertEqual(sanitize_input_h2k_filename("My-House.h2k"), "My-House.h2k")

    def test_stem_gets_h2k_extension(self):
        self.assertEqual(sanitize_input_h2k_filename("My-House"), "My-House.h2k")

    def test_path_reduced_to_basename(self):
        self.assertEqual(
            sanitize_input_h2k_filename(r"C:\temp\My-House.h2k"),
            "My-House.h2k",
        )

    def test_blank_falls_back_to_input_h2k(self):
        self.assertEqual(sanitize_input_h2k_filename(""), "input.h2k")

    def test_job_prefers_input_filename(self):
        job = {
            "input_filename": "My-House.h2k",
            "export_filename": "Other.h2k",
        }
        self.assertEqual(resolve_full_house_report_input_filename(job), "My-House.h2k")

    def test_job_falls_back_to_export_filename(self):
        job = {"export_filename": "123 Main Street.h2k"}
        self.assertEqual(
            resolve_full_house_report_input_filename(job),
            "123 Main Street.h2k",
        )

    def test_verify_requires_exact_name_and_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "My-House.h2k"
            xml = '<?xml version="1.0"?><HouseFile><House name="Test"/></HouseFile>'
            path.write_text(xml, encoding="utf-8")
            digest = hashlib.sha256(xml.encode("utf-8")).hexdigest()
            verify_full_house_report_input_file(
                path,
                "My-House.h2k",
                source_hash=digest,
            )

    def test_verify_rejects_hash_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "My-House.h2k"
            path.write_text(
                '<?xml version="1.0"?><HouseFile><House name="Test"/></HouseFile>',
                encoding="utf-8",
            )
            with self.assertRaises(RuntimeError):
                verify_full_house_report_input_file(
                    path,
                    "My-House.h2k",
                    source_hash="deadbeef",
                )

    @patch("worker.api_post")
    @patch("worker.download_input")
    @patch("worker.run_hot2000_full_house_report")
    def test_process_job_writes_named_input_for_full_house_report(
        self,
        mock_run,
        mock_download,
        _api_post,
    ):
        from worker import process_job

        def write_input(job, dest: Path):
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(
                '<?xml version="1.0"?><HouseFile><House name="Test"/></HouseFile>',
                encoding="utf-8",
            )

        mock_download.side_effect = write_input
        mock_run.return_value = ("<xml/>", "cGRm")

        with patch("worker.JOBS_ROOT", Path(tempfile.mkdtemp())):
            process_job(
                {
                    "job_id": "job-abc",
                    "kind": "full_house_report",
                    "input_filename": "My-House.h2k",
                    "export_filename": "My-House.h2k",
                    "source_hash": "abc",
                }
            )

        dest = mock_download.call_args[0][1]
        self.assertEqual(dest.name, "My-House.h2k")
        self.assertNotEqual(dest.name, "input.h2k")
        input_path = mock_run.call_args[0][2]
        self.assertEqual(input_path.name, "My-House.h2k")

    def test_worker_build_id_bumped(self):
        self.assertEqual(WORKER_BUILD_ID, "2026-09-11h")


if __name__ == "__main__":
    unittest.main()
