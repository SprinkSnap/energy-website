"""Tests for UIA File name control discovery in Save Print Output As."""

import sys
import unittest
from pathlib import Path
from unittest.mock import ANY, MagicMock, patch

_PYWINAUTO_MOCK = MagicMock()

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from print_dialog_win32 import (
    SaveFilenameTargetingError,
    _is_excluded_filename_candidate,
    find_filename_edit_uia,
    read_uia_filename_value,
    score_filename_edit_candidate,
    set_verified_filename_only,
    write_uia_filename_value,
)


class MockRect:
    def __init__(self, left: int, top: int, right: int, bottom: int) -> None:
        self.left = left
        self.top = top
        self.right = right
        self.bottom = bottom


def _mock_uia_control(
    name: str,
    control_type: str,
    rect: tuple[int, int, int, int],
    *,
    visible: bool = True,
    enabled: bool = True,
    automation_id: str = "",
    class_name: str = "",
    value: str = "",
) -> MagicMock:
    control = MagicMock()
    control.window_text.return_value = name
    control.element_info.control_type = control_type
    control.element_info.automation_id = automation_id
    control.element_info.class_name = class_name
    control.rectangle.return_value = MockRect(*rect)
    control.is_visible.return_value = visible
    control.is_enabled.return_value = enabled
    control.get_value.return_value = value
    control.texts.return_value = [value] if value else []
    control.descendants.return_value = []
    control.handle = None
    return control


class FilenameEditUiaScoringTests(unittest.TestCase):
    def test_search_edit_is_excluded(self):
        self.assertTrue(_is_excluded_filename_candidate("Search Downloads", "Edit"))

    def test_address_edit_is_excluded(self):
        self.assertTrue(_is_excluded_filename_candidate("Address", "Edit"))

    def test_rename_edit_is_excluded(self):
        self.assertTrue(_is_excluded_filename_candidate("Rename", "Edit"))

    def test_filename_edit_near_label_scores_highest(self):
        label_rect = (10, 400, 90, 420)
        filename_rect = (100, 398, 420, 422)
        search_rect = (50, 40, 300, 60)
        dialog_rect = (0, 0, 600, 500)
        filename_score = score_filename_edit_candidate(
            label_rect,
            filename_rect,
            dialog_rect,
            "",
            "Edit",
        )
        search_score = score_filename_edit_candidate(
            label_rect,
            search_rect,
            dialog_rect,
            "Search Downloads",
            "Edit",
        )
        self.assertGreater(filename_score, search_score)
        self.assertEqual(search_score, float("-inf"))

    def test_first_arbitrary_edit_not_selected_without_label_association(self):
        label_rect = (10, 400, 90, 420)
        dialog_rect = (0, 0, 600, 500)
        arbitrary_rect = (20, 80, 200, 100)
        score = score_filename_edit_candidate(
            label_rect,
            arbitrary_rect,
            dialog_rect,
            "",
            "Edit",
        )
        filename_rect = (100, 398, 420, 422)
        filename_score = score_filename_edit_candidate(
            label_rect,
            filename_rect,
            dialog_rect,
            "",
            "Edit",
        )
        self.assertGreater(filename_score, score)


class FilenameEditUiaDiscoveryTests(unittest.TestCase):
    def setUp(self):
        _PYWINAUTO_MOCK.reset_mock()

    def _build_dialog(self):
        label = _mock_uia_control("File name:", "Text", (10, 400, 90, 420))
        filename_edit = _mock_uia_control(
            "My-House.pdf",
            "Edit",
            (100, 398, 420, 422),
            automation_id="FileNameControlHost",
            class_name="Edit",
            value="My-House.pdf",
        )
        search_edit = _mock_uia_control(
            "Search Downloads",
            "Edit",
            (50, 40, 300, 60),
        )
        dialog = MagicMock()
        dialog.rectangle.return_value = MockRect(0, 0, 600, 500)
        dialog.descendants.return_value = [label, search_edit, filename_edit]
        return dialog, filename_edit

    @patch.dict(sys.modules, {"pywinauto": _PYWINAUTO_MOCK})
    def test_uia_finds_file_name_edit_when_0480_missing(self):
        dialog, filename_edit = self._build_dialog()
        _PYWINAUTO_MOCK.Desktop.return_value.window.return_value = dialog
        logger = MagicMock()
        selected = find_filename_edit_uia(5000, logger)
        self.assertIs(selected, filename_edit)
        logger.step.assert_any_call(
            "7_filename_label",
            "name='File name:' rect=(10, 400, 90, 420)",
        )
        logger.step.assert_any_call(
            "7_filename_selected",
            ANY,
        )

    @patch.dict(sys.modules, {"pywinauto": _PYWINAUTO_MOCK})
    def test_uia_structure_text_label_plus_edit(self):
        dialog, filename_edit = self._build_dialog()
        _PYWINAUTO_MOCK.Desktop.return_value.window.return_value = dialog
        selected = find_filename_edit_uia(5000)
        self.assertIs(selected, filename_edit)

    @patch.dict(sys.modules, {"pywinauto": _PYWINAUTO_MOCK})
    def test_search_edit_not_selected(self):
        dialog, filename_edit = self._build_dialog()
        _PYWINAUTO_MOCK.Desktop.return_value.window.return_value = dialog
        selected = find_filename_edit_uia(5000)
        self.assertIsNotNone(selected)
        self.assertIs(selected, filename_edit)

    @patch("print_dialog_win32.read_edit_text")
    @patch("print_dialog_win32.set_edit_text", return_value=True)
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=2001)
    def test_win32_fast_path_when_0480_exists(self, _find, mock_set, mock_read):
        mock_read.return_value = "My-House.pdf"
        logger = MagicMock()
        hwnd = set_verified_filename_only(1000, "My-House.pdf", logger)
        self.assertEqual(hwnd, 2001)
        mock_set.assert_called_once()
        logger.step.assert_any_call(
            "7_filename_selected",
            ANY,
        )

    @patch("print_dialog_win32.find_filename_edit_uia")
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=None)
    def test_uia_fallback_when_0480_missing(self, _find0480, mock_find_uia):
        uia_control = MagicMock()
        uia_control.element_info.control_type = "Edit"
        uia_control.get_value.return_value = "My-House.pdf"
        uia_control.window_text.return_value = "My-House.pdf"
        uia_control.texts.return_value = ["My-House.pdf"]
        uia_control.handle = None
        uia_control.descendants.return_value = []
        mock_find_uia.return_value = uia_control
        with patch(
            "print_dialog_win32.write_uia_filename_value",
        ) as mock_write, patch(
            "print_dialog_win32.read_uia_filename_value",
            return_value="My-House.pdf",
        ):
            set_verified_filename_only(1000, "My-House.pdf")
        mock_write.assert_called_once_with(uia_control, "My-House.pdf")

    @patch("print_dialog_win32.find_filename_edit_uia", return_value=None)
    @patch("print_dialog_win32.find_verified_filename_edit_0480", return_value=None)
    @patch("print_dialog_win32.log_save_dialog_uia_controls")
    @patch("print_dialog_win32.log_save_dialog_direct_children")
    def test_failure_message_when_no_control_found(
        self,
        _log_children,
        _log_uia,
        _find0480,
        _find_uia,
    ):
        with self.assertRaises(SaveFilenameTargetingError) as ctx:
            set_verified_filename_only(1000, "My-House.pdf")
        self.assertIn("Could not locate the File name field", str(ctx.exception))
        self.assertNotIn("0x0480", str(ctx.exception))

    def test_readback_requires_exact_basename(self):
        control = MagicMock()
        control.element_info.control_type = "Edit"
        control.get_value.return_value = "wrong.pdf"
        control.window_text.return_value = "wrong.pdf"
        control.texts.return_value = ["wrong.pdf"]
        control.descendants.return_value = []
        control.handle = None
        with patch(
            "print_dialog_win32.find_verified_filename_edit_0480",
            return_value=None,
        ), patch(
            "print_dialog_win32.find_filename_edit_uia",
            return_value=control,
        ), patch(
            "print_dialog_win32.write_uia_filename_value",
        ):
            with self.assertRaises(SaveFilenameTargetingError) as ctx:
                set_verified_filename_only(1000, "My-House.pdf")
        self.assertIn("expected bare filename", str(ctx.exception).lower())

    def test_full_path_rejected_before_ui_entry(self):
        with self.assertRaises(SaveFilenameTargetingError):
            set_verified_filename_only(
                1000,
                r"C:\Users\Test\Downloads\My-House.pdf",
            )

    def test_write_uia_prefers_set_edit_text(self):
        control = MagicMock()
        control.element_info.control_type = "Edit"
        control.descendants.return_value = []
        write_uia_filename_value(control, "My-House.pdf")
        control.set_edit_text.assert_called_once_with("My-House.pdf")

    def test_read_uia_filename_value(self):
        control = MagicMock()
        control.element_info.control_type = "Edit"
        control.get_value.return_value = "My-House.pdf"
        control.descendants.return_value = []
        self.assertEqual(read_uia_filename_value(control), "My-House.pdf")


if __name__ == "__main__":
    unittest.main()
