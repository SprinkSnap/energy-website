"""Tests for HOT2000 worker progress stages and API error handling."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker import (
    VALID_PROGRESS_STAGES,
    WORKER_BUILD_ID,
    api_post,
    complete,
    progress,
)


class WorkerProgressTests(unittest.TestCase):
    def test_worker_build_id_bumped(self):
        self.assertEqual(WORKER_BUILD_ID, "2026-09-11j")

    @patch("worker.api_post")
    def test_progress_ready_rejected_locally_without_http(self, mock_api_post):
        with self.assertRaises(ValueError) as ctx:
            progress("job-1", "ready", "Report ready")
        self.assertIn("Invalid HOT2000 progress stage", str(ctx.exception))
        mock_api_post.assert_not_called()

    @patch("worker.api_post")
    def test_all_valid_progress_stages_are_accepted(self, mock_api_post):
        for stage in VALID_PROGRESS_STAGES:
            progress("job-1", stage, f"testing {stage}")
        self.assertEqual(mock_api_post.call_count, len(VALID_PROGRESS_STAGES))

    @patch("worker.api_post")
    def test_complete_and_failed_are_not_valid_progress_stages(self, mock_api_post):
        for invalid in ("complete", "failed", "queued"):
            with self.assertRaises(ValueError):
                progress("job-1", invalid)
        mock_api_post.assert_not_called()

    @patch("worker.win32gui", MagicMock())
    @patch("worker.progress")
    @patch("worker.close_hot2000_application")
    @patch("worker.finalize_full_house_report_pdf_copy")
    @patch("worker.save_full_house_report_pdf")
    @patch("worker.wait_for_full_house_report_ready", return_value=9000)
    @patch("worker.confirm_full_house_report_data_source")
    @patch("worker.wait_for_report_menu_result")
    @patch("worker.open_soc_full_house_report")
    @patch("worker.dismiss_blocking_dialogs")
    @patch("worker.find_hot2000_startup_error", return_value=None)
    @patch("worker.job_process_ids", return_value={1234})
    @patch("worker.ensure_hot2000_visible")
    @patch("worker.validate_hot2000_main")
    @patch("worker.wait_for_hot2000_main", return_value=8000)
    @patch("worker.subprocess.Popen")
    @patch("worker.allow_set_foreground_window")
    @patch("worker.pdf_output_ready", return_value=True)
    def test_full_house_report_never_calls_progress_ready(
        self,
        _pdf_ready,
        _allow,
        _popen,
        _wait_main,
        _validate,
        _visible,
        _pids,
        _startup,
        _dismiss,
        _open_report,
        _menu,
        _confirm,
        _report_ready,
        _save_pdf,
        _finalize,
        _close,
        mock_progress,
    ):
        from worker import run_hot2000_full_house_report

        proc = MagicMock()
        proc.pid = 1234
        _popen.return_value = proc

        def write_pdf(*args, **kwargs):
            pdf = args[2]
            pdf.write_bytes(b"%PDF-1.4\n" + b"x" * 200)
            return pdf

        _save_pdf.side_effect = write_pdf
        with tempfile.TemporaryDirectory() as tmp:
            job_dir = Path(tmp)
            input_path = job_dir / "My-House.h2k"
            input_path.write_text(
                '<?xml version="1.0"?><HouseFile><House name="Test"/></HouseFile>',
                encoding="utf-8",
            )
            run_hot2000_full_house_report(
                "job-1",
                job_dir,
                input_path,
                export_filename="My-House.h2k",
            )
        stages = [call.args[1] for call in mock_progress.call_args_list]
        self.assertNotIn("ready", stages)
        self.assertIn("extracting", stages)

    @patch("worker.api_post")
    @patch("worker.run_hot2000_full_house_report", return_value=("<xml/>", "cGRm"))
    @patch("worker.download_input")
    def test_after_pdf_encoding_next_api_call_is_complete(
        self,
        mock_download,
        mock_run,
        mock_api_post,
    ):
        from worker import process_job

        def write_input(job, dest: Path):
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(
                '<?xml version="1.0"?><HouseFile><House name="Test"/></HouseFile>',
                encoding="utf-8",
            )

        mock_download.side_effect = write_input
        with patch("worker.JOBS_ROOT", Path(tempfile.mkdtemp())):
            with patch("worker.fail") as mock_fail:
                process_job(
                    {
                        "job_id": "job-abc",
                        "kind": "full_house_report",
                        "input_filename": "My-House.h2k",
                        "export_filename": "My-House.h2k",
                    }
                )
        mock_fail.assert_not_called()
        mock_run.assert_called_once()
        mock_api_post.assert_called_once()
        path, body = mock_api_post.call_args[0]
        self.assertIn("/complete", path)
        self.assertEqual(body["report_pdf_base64"], "cGRm")

    @patch("worker.sync_session_auth", return_value="secret-token-value")
    @patch("worker.SESSION.post")
    def test_api_post_includes_server_error_detail(self, mock_post, _auth):
        response = MagicMock()
        response.status_code = 400
        response.ok = False
        response.json.return_value = {"error": "Invalid progress stage."}
        response.text = '{"error":"Invalid progress stage."}'
        mock_post.return_value = response
        with self.assertRaises(RuntimeError) as ctx:
            api_post("/worker/job-1/progress", {"stage": "printing"})
        self.assertIn("HTTP 400", str(ctx.exception))
        self.assertIn("Invalid progress stage.", str(ctx.exception))

    @patch("worker.sync_session_auth", return_value="secret-token-value")
    @patch("worker.SESSION.post")
    def test_api_post_error_never_includes_token(self, mock_post, _auth):
        response = MagicMock()
        response.status_code = 401
        response.ok = False
        response.json.return_value = {"error": "Unauthorized"}
        response.text = '{"error":"Unauthorized"}'
        mock_post.return_value = response
        with self.assertRaises(RuntimeError) as ctx:
            api_post("/worker/job-1/progress", {"stage": "printing"})
        message = str(ctx.exception)
        self.assertNotIn("secret-token-value", message)
        self.assertNotIn("Bearer", message)

    @patch("worker.api_post")
    def test_complete_posts_to_complete_route(self, mock_api_post):
        complete("job-1", "<xml/>", report_pdf_base64="cGRm")
        mock_api_post.assert_called_once()
        path, body = mock_api_post.call_args[0]
        self.assertIn("/complete", path)
        self.assertEqual(body["report_pdf_base64"], "cGRm")

    def test_run_hot2000_full_house_report_source_has_no_progress_ready(self):
        source = Path(__file__).resolve().parents[1].joinpath("worker.py").read_text(
            encoding="utf-8"
        )
        fn_start = source.index("def run_hot2000_full_house_report")
        fn_end = source.index("\ndef ", fn_start + 1)
        fn_body = source[fn_start:fn_end]
        self.assertNotIn('progress(job_id, "ready"', fn_body)


if __name__ == "__main__":
    unittest.main()
