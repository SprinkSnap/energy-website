"""Regression tests for hard section UI scope lock during Phase 2 section crawls."""

from __future__ import annotations

import inspect
import unittest

from catalog_section_scope import (
    SectionScopeLock,
    is_main_section_navigation_tab,
    list_section_internal_tabs,
)
from catalog_ui_crawler_engine import CrawlEngine


class _FakeElementInfo:
    def __init__(
        self,
        *,
        control_type: str,
        automation_id: str = "",
        name: str = "",
    ) -> None:
        self.control_type = control_type
        self.automation_id = automation_id
        self.class_name = control_type
        self.name = name
        self.runtime_id = automation_id or name


class _FakeParent:
    def __init__(self, children: list["_FakeControl"]) -> None:
        self._children = children

    def children(self):
        return self._children

    def parent(self):
        return None

    def descendants(self):
        for child in self._children:
            yield child
            yield from child.descendants()


class _FakeControl:
    def __init__(
        self,
        *,
        label: str,
        control_type: str = "TabItem",
        automation_id: str = "",
        selected: bool = False,
        parent: _FakeParent | None = None,
        children: list["_FakeControl"] | None = None,
    ) -> None:
        self.element_info = _FakeElementInfo(
            control_type=control_type,
            automation_id=automation_id,
            name=label,
        )
        self._label = label
        self._selected = selected
        self._children = children or []
        self._parent = parent or _FakeParent(self._children)

    def window_text(self):
        return self._label

    def parent(self):
        return self._parent

    def children(self):
        return self._children

    def descendants(self):
        for child in self._children:
            yield child
            yield from child.descendants()

    def is_visible(self):
        return True

    def is_selected(self):
        return self._selected

    def is_enabled(self):
        return True


def _build_general_window() -> _FakeControl:
    main_nav_tabs = [
        _FakeControl(label="General", selected=True),
        _FakeControl(label="Info"),
        _FakeControl(label="Specifications"),
        _FakeControl(label="Weather"),
    ]
    main_nav = _FakeParent(main_nav_tabs)
    for tab in main_nav_tabs:
        tab._parent = main_nav

    identification_tab = _FakeControl(label="Identification", selected=True)
    evaluation_tab = _FakeControl(label="Evaluation")
    internal_tabs = [identification_tab, evaluation_tab]
    internal_nav = _FakeParent(internal_tabs)
    for tab in internal_tabs:
        tab._parent = internal_nav

    ownership = _FakeControl(label="Ownership", control_type="ComboBox", automation_id="ownership")
    region = _FakeControl(label="Region", control_type="ComboBox", automation_id="region")
    client = _FakeControl(label="Client First Name", control_type="Edit", automation_id="client")
    content_children = internal_tabs + [ownership, region, client]
    content_root = _FakeControl(label="GeneralContent", control_type="Pane", children=content_children)
    content_parent = _FakeParent([content_root])
    content_root._parent = content_parent
    for child in content_children:
        child._parent = _FakeParent(content_children)

    window = _FakeControl(
        label="HOT2000",
        control_type="Window",
        children=[*_FakeParent(main_nav_tabs)._children, content_root],
    )
    window._parent = _FakeParent([window])
    return window


class SectionHardLockTests(unittest.TestCase):
    def test_main_section_nav_tabs_detected(self):
        window = _build_general_window()
        main_tabs = [
            child
            for child in window._children
            if child.element_info.control_type == "TabItem"
        ]
        self.assertTrue(is_main_section_navigation_tab(main_tabs[0]))
        self.assertTrue(is_main_section_navigation_tab(main_tabs[1]))
        self.assertTrue(is_main_section_navigation_tab(main_tabs[2]))
        self.assertTrue(is_main_section_navigation_tab(main_tabs[3]))

    def test_internal_tabs_are_not_main_section_nav(self):
        window = _build_general_window()
        content_root = window._children[-1]
        internal = list_section_internal_tabs(content_root, window)
        labels = [tab.window_text() for tab in internal]
        self.assertIn("Identification", labels)
        self.assertIn("Evaluation", labels)
        self.assertNotIn("Info", labels)
        self.assertNotIn("Weather", labels)

    def test_section_mode_does_not_plan_top_level_tabs(self):
        engine = CrawlEngine()
        engine.target_section_id = "general"
        source = inspect.getsource(engine.plan_actions_for_surface)
        self.assertIn("_plan_section_internal_tabs", source)
        section_branch = source.split("if self.is_section_sequential_mode():")[1].split("else:")[0]
        self.assertNotIn("_plan_tabs(", section_branch)

    def test_plan_section_internal_tabs_skips_foreign_main_tabs(self):
        engine = CrawlEngine()
        engine.target_section_id = "general"

        class _Surface:
            def list_internal_tabs(self):
                return [
                    {
                        "id": "internal-identification",
                        "label": "Identification",
                        "selected": False,
                        "logicalControlId": "general > identification",
                        "locator": {},
                    }
                ]

            def list_combos(self, *, metadata_only=True):
                return []

            def list_text_fields(self):
                return []

            def list_checkboxes(self):
                return []

            def list_radio_groups(self):
                return []

            def list_buttons(self):
                return []

            def list_scroll_regions(self):
                return []

            def list_dialogs(self):
                return []

            def capture_controls(self):
                return []

        planned = engine._plan_section_internal_tabs(_Surface(), "digest", "screen")
        self.assertEqual(len(planned), 1)
        self.assertEqual(planned[0].control_label, "Identification")
        self.assertEqual(engine.counters.tabs_total, 1)

    def test_section_scope_lock_serializes_evidence(self):
        lock = SectionScopeLock(
            section_id="general",
            section_label="General",
            structural_path="Window > Pane[content]",
            scope_root_control_type="Pane",
        )
        payload = lock.to_dict()
        self.assertEqual(payload["lockedSectionId"], "general")
        self.assertEqual(payload["lockedSectionRoot"]["structuralPath"], "Window > Pane[content]")
        restored = SectionScopeLock.from_dict(payload)
        self.assertEqual(restored.section_id, "general")
        self.assertEqual(restored.structural_path, "Window > Pane[content]")


if __name__ == "__main__":
    unittest.main()
