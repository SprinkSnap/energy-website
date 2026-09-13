"""Unit tests for catalog navigation engine."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from catalog_navigation import (
    classify_action,
    compute_screen_key,
    is_safe_to_invoke,
)


class _ElementInfo:
    def __init__(self, control_type: str, name: str = "", automation_id: str = ""):
        self.control_type = control_type
        self.name = name
        self.automation_id = automation_id
        self.class_name = "TestClass"


class _FakeControl:
    def __init__(self, control_type: str, name: str = "", automation_id: str = ""):
        self.element_info = _ElementInfo(control_type, name, automation_id)

    def window_text(self):
        return self.element_info.name


class CatalogNavigationTests(unittest.TestCase):
    def test_blocks_delete_and_save(self):
        for label in ("Delete", "Save", "Save As", "Calculate", "Import", "Export", "Exit"):
            control = _FakeControl("Button", label)
            classification, _ = classify_action(control)
            self.assertEqual(classification, "DESTRUCTIVE")

    def test_tab_is_safe(self):
        control = _FakeControl("TabItem", "Weather")
        classification, confidence = classify_action(control)
        self.assertEqual(classification, "SAFE_TAB")
        self.assertEqual(confidence, "high")
        self.assertTrue(is_safe_to_invoke(classification, confidence))

    def test_unknown_button_not_invoked(self):
        control = _FakeControl("Button", "Mystery Action")
        classification, confidence = classify_action(control)
        self.assertEqual(classification, "UNKNOWN")
        self.assertFalse(is_safe_to_invoke(classification, confidence))

    def test_screen_key_is_deterministic(self):
        key_a = compute_screen_key(
            hot2000_version="11.13",
            window_title="HOT2000",
            selected_tabs=["Weather"],
            key_labels=["Weather"],
        )
        key_b = compute_screen_key(
            hot2000_version="11.13",
            window_title="HOT2000",
            selected_tabs=["Weather"],
            key_labels=["Weather"],
        )
        self.assertEqual(key_a, key_b)

    def test_screen_key_differs_for_different_tabs(self):
        key_a = compute_screen_key(
            hot2000_version="11.13",
            window_title="HOT2000",
            selected_tabs=["Weather"],
        )
        key_b = compute_screen_key(
            hot2000_version="11.13",
            window_title="HOT2000",
            selected_tabs=["General"],
        )
        self.assertNotEqual(key_a, key_b)


if __name__ == "__main__":
    unittest.main()
