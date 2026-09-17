"""Tests for Export filename → PDF filename normalization."""

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    build_full_house_report_downloads_path,
    report_pdf_filename_from_export_name,
)


class ExportPdfFilenameTests(unittest.TestCase):
    def test_h2k_extension_removed(self):
        self.assertEqual(
            report_pdf_filename_from_export_name("House.h2k", "job-1"),
            "House.pdf",
        )

    def test_h2k_uppercase_extension_removed(self):
        self.assertEqual(
            report_pdf_filename_from_export_name("House.H2K", "job-1"),
            "House.pdf",
        )

    def test_pdf_extension_preserved(self):
        self.assertEqual(
            report_pdf_filename_from_export_name("House.pdf", "job-1"),
            "House.pdf",
        )

    def test_path_reduced_to_basename(self):
        self.assertEqual(
            report_pdf_filename_from_export_name(r"C:\temp\House.h2k", "job-1"),
            "House.pdf",
        )

    def test_blank_export_uses_job_id_fallback(self):
        self.assertEqual(
            report_pdf_filename_from_export_name("", "abc123"),
            "HOT2000-Full-House-Report-abc123.pdf",
        )

    def test_build_downloads_path_uses_export_filename(self):
        with mock.patch(
            "print_dialog_win32.resolve_windows_downloads_folder",
            return_value=Path("/tmp/Downloads"),
        ):
            path = build_full_house_report_downloads_path(
                "job-1",
                "Smith-House.h2k",
            )
        self.assertEqual(path.name, "Smith-House.pdf")
        self.assertEqual(path.parent, Path("/tmp/Downloads"))


if __name__ == "__main__":
    unittest.main()
