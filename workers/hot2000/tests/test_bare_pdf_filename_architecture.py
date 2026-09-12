"""Regression tests for bare PDF filename architecture (Full House Report save path)."""

import ast
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    CDM_FILENAME_CONTROL_ID,
    SaveFilenameTargetingError,
    complete_print_dialog_to_pdf,
    enter_save_print_output_filename,
    report_pdf_filename_from_export_name,
    resolve_full_house_report_pdf_paths,
    save_print_output_dialog,
    set_verified_filename_only,
    validate_save_filename_only,
)
from worker import WORKER_BUILD_ID, run_report_print_32bit


class BarePdfFilenameArchitectureTests(unittest.TestCase):
    def test_review_export_name_produces_pdf_basename(self):
        self.assertEqual(
            report_pdf_filename_from_export_name("My-House.h2k", "job-1"),
            "My-House.pdf",
        )

    def test_helper_cli_receives_bare_filename_not_full_path(self):
        helper_path = Path(__file__).resolve().parents[1] / "report_print_helper_32bit.py"
        source = helper_path.read_text(encoding="utf-8")
        self.assertIn("<pdf_filename>", source)
        self.assertIn("validate_save_filename_only(sys.argv[1].strip())", source)
        self.assertNotIn("str(output_path.resolve())", source)
        worker_source = Path(__file__).resolve().parents[1] / "worker.py"
        self.assertIn("bare_filename,", worker_source.read_text(encoding="utf-8"))

    @patch("print_dialog_win32.read_edit_text", return_value="My-House.pdf")
    @patch("print_dialog_win32.set_edit_text", return_value=True)
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=2001)
    def test_save_filename_setter_receives_exact_basename(
        self,
        _find,
        mock_set,
        _read,
    ):
        mock_gui = MagicMock()
        mock_gui.GetClassName.return_value = "Edit"
        with patch("print_dialog_win32.win32gui", mock_gui):
            set_verified_filename_only(1000, "My-House.pdf")
        self.assertEqual(mock_set.call_args[0][1], "My-House.pdf")

    def test_full_path_cannot_pass_pdf_filename_validation(self):
        with self.assertRaises(SaveFilenameTargetingError):
            validate_save_filename_only(r"C:\Users\Test\Downloads\My-House.pdf")

    @patch("print_dialog_win32.set_verified_filename_only", return_value=2001)
    @patch("print_dialog_win32.reacquire_save_pdf_dialog", return_value=5000)
    @patch("print_dialog_win32.select_downloads_folder_in_save_dialog")
    @patch("print_dialog_win32._dismiss_unexpected_rename_dialogs", return_value=0)
    @patch("print_dialog_win32.find_shell_rename_error_dialog_fast", return_value=None)
    def test_downloads_selected_before_filename_write(
        self,
        _rename,
        _dismiss,
        mock_select,
        _reacquire,
        mock_set,
    ):
        manager = MagicMock()
        manager.attach_mock(mock_select, "select")
        manager.attach_mock(mock_set, "set")
        enter_save_print_output_filename(5000, "My-House.pdf")
        self.assertEqual(
            [call[0] for call in manager.mock_calls],
            ["select", "set"],
        )

    @patch("print_dialog_win32.read_edit_text", return_value="wrong.pdf")
    @patch("print_dialog_win32.set_edit_text", return_value=True)
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=2001)
    def test_filename_readback_must_equal_pdf_filename(
        self,
        _find,
        _set,
        _read,
    ):
        mock_gui = MagicMock()
        mock_gui.GetClassName.return_value = "Edit"
        with patch("print_dialog_win32.win32gui", mock_gui):
            with self.assertRaises(SaveFilenameTargetingError) as ctx:
                set_verified_filename_only(1000, "My-House.pdf")
        self.assertIn("expected bare filename", str(ctx.exception).lower())

    def test_filesystem_verification_uses_downloads_plus_basename(self):
        downloads = Path("C:/Users/Test/Downloads")
        with patch(
            "print_dialog_win32.resolve_windows_downloads_folder",
            return_value=downloads,
        ):
            folder, bare, expected = resolve_full_house_report_pdf_paths(
                "My-House.pdf"
            )
        self.assertEqual(bare, "My-House.pdf")
        self.assertEqual(expected, downloads.resolve() / "My-House.pdf")
        self.assertEqual(folder, downloads.resolve())

    def test_only_set_verified_filename_only_writes_0480_in_production(self):
        source_path = Path(__file__).resolve().parents[1] / "print_dialog_win32.py"
        source = source_path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        writers: list[str] = []

        class WriterVisitor(ast.NodeVisitor):
            def visit_Call(self, node: ast.Call) -> None:
                if isinstance(node.func, ast.Name):
                    if node.func.id == "set_edit_text":
                        writers.append("set_edit_text")
                    elif node.func.id == "type_text_to_hwnd":
                        writers.append("type_text_to_hwnd")
                self.generic_visit(node)

        WriterVisitor().visit(tree)
        self.assertIn("set_edit_text", writers)
        self.assertTrue(
            all(
                "set_verified_filename_only" in source
                for _ in [0]
            )
        )
        set_fn_start = source.index("def set_verified_filename_only")
        set_fn_end = source.index("\ndef ", set_fn_start + 1)
        set_fn_body = source[set_fn_start:set_fn_end]
        self.assertIn("find_filename_edit_uia", set_fn_body)
        self.assertIn("write_uia_filename_value", set_fn_body)

    def test_browser_sends_export_filename_explicitly(self):
        jobs_js = (
            Path(__file__).resolve().parents[2].parent
            / "h2k-web-editor"
            / "hot2000-jobs.js"
        )
        source = jobs_js.read_text(encoding="utf-8")
        self.assertIn('form.append("export_filename"', source)

    def test_worker_claim_reads_export_filename(self):
        worker_source = Path(__file__).resolve().parents[1] / "worker.py"
        source = worker_source.read_text(encoding="utf-8")
        self.assertIn('job.get("export_filename")', source)

    def test_worker_build_id_bumped(self):
        self.assertEqual(WORKER_BUILD_ID, "2026-09-11e")

    @patch("worker.subprocess.Popen")
    @patch("worker.require_python32_for_report_print", return_value="python32")
    @patch("worker.report_print_helper_32bit_path")
    def test_run_report_print_32bit_passes_bare_filename_to_helper(
        self,
        mock_helper_path,
        _python32,
        mock_popen,
    ):
        mock_helper_path.return_value = Path("/fake/report_print_helper_32bit.py")
        proc = MagicMock()
        proc.poll.return_value = None
        proc.returncode = 0
        proc.communicate.return_value = ("", "")
        mock_popen.return_value = proc
        expected = Path("/tmp/Downloads/My-House.pdf")
        with patch("worker.pdf_output_ready", return_value=True):
            run_report_print_32bit(
                "My-House.pdf",
                expected,
                2000,
                1000,
            )
        cmd = mock_popen.call_args[0][0]
        self.assertEqual(cmd[2], "My-House.pdf")
        self.assertNotIn("\\", cmd[2])
        self.assertNotIn(":", cmd[2])

    @patch("print_dialog_win32.wait_for_pdf_output", return_value=True)
    @patch("print_dialog_win32.save_print_output_dialog")
    @patch("print_dialog_win32.find_save_pdf_dialog_fast", return_value=9100)
    @patch("print_dialog_win32.click_print_dialog_button_once", return_value=True)
    @patch(
        "print_dialog_win32.select_pdf_printer_in_print_dialog",
        return_value="Microsoft Print to PDF",
    )
    @patch("print_dialog_win32.pdf_ready", return_value=False)
    @patch("print_dialog_win32.focus_modal_dialog")
    @patch(
        "print_dialog_win32.resolve_windows_downloads_folder",
        return_value=Path("/tmp/Downloads"),
    )
    def test_complete_print_passes_bare_filename_to_save_dialog(
        self,
        _downloads,
        _focus,
        _pdf,
        _select,
        _click,
        _fast,
        mock_save,
        _wait,
    ):
        self.assertTrue(complete_print_dialog_to_pdf("My-House.pdf", 8000))
        self.assertEqual(mock_save.call_args[0][1], "My-House.pdf")


if __name__ == "__main__":
    unittest.main()
