"""Ensure install-worker.ps1 deploys all 32-bit print helper modules."""

from pathlib import Path
import unittest


class InstallWorkerScriptTests(unittest.TestCase):
    def test_install_worker_copies_print_dialog_win32(self):
        script = (
            Path(__file__).resolve().parents[1] / "install-worker.ps1"
        ).read_text(encoding="utf-8")
        self.assertIn("win32_ctypes.py", script)
        self.assertIn("print_dialog_win32.py", script)
        self.assertIn("report_print_helper_32bit.py", script)
        self.assertIn("print_helper_32bit.py", script)


if __name__ == "__main__":
    unittest.main()
