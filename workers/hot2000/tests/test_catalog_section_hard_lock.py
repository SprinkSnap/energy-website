"""Regression tests for absolute section lock during Phase 2 section crawls."""

from __future__ import annotations

import copy
import inspect
import unittest
from unittest.mock import patch

from catalog_section_navigation import SectionDetection
from catalog_section_scope import (
    SCOPE_MODE_ACTIVE_VISIBLE_SECTION,
    SectionScopeIsolationError,
    SectionScopeLock,
    discover_section_scope_roots,
    establish_section_scope_lock,
    identify_section_content_root,
    is_application_chrome,
    is_main_section_navigation_tab,
    is_section_content_control,
    is_valid_section_scope_root,
    iter_section_content_controls,
    try_identify_narrow_section_root,
    verify_locked_section,
)
from catalog_ui_crawler_engine import CrawlEngine, CrawlLimits, PlannedAction
from catalog_ui_fingerprint import StateFingerprint


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
    def __init__(self, children: list["_FakeControl"], parent: "_FakeControl | None" = None) -> None:
        self._children = children
        self._outer_parent = parent

    def children(self):
        return self._children

    def parent(self):
        return self._outer_parent

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


def _wire_children(parent: _FakeControl, children: list[_FakeControl]) -> None:
    inner = _FakeParent(children, parent=parent)
    for child in children:
        child._parent = inner
    parent._children = children


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

    ownership = _FakeControl(label="Ownership", control_type="ComboBox", automation_id="ownership")
    region = _FakeControl(label="Region", control_type="ComboBox", automation_id="region")
    address = _FakeControl(label="Street Address", control_type="Edit", automation_id="address")
    checkbox_a = _FakeControl(label="Checkbox A", control_type="CheckBox", automation_id="cb-a")
    radio_a = _FakeControl(label="Radio A", control_type="RadioButton", automation_id="radio-a")
    button_a = _FakeControl(label="Button A", control_type="Button", automation_id="btn-a")
    content_children = [ownership, region, address, checkbox_a, radio_a, button_a]
    content_root = _FakeControl(
        label="GeneralContent",
        control_type="Pane",
        automation_id="general-content",
        children=content_children,
    )
    _wire_children(content_root, content_children)

    window = _FakeControl(
        label="HOT2000",
        control_type="Window",
        children=[*main_nav_tabs, content_root],
    )
    window._parent = _FakeParent([window])
    return window


def _build_distributed_general_window() -> _FakeControl:
    """General signatures in three groups whose common ancestor also contains main nav."""
    main_nav_tabs = [
        _FakeControl(label="General", selected=True),
        _FakeControl(label="Info"),
        _FakeControl(label="Weather"),
    ]
    main_nav = _FakeParent(main_nav_tabs)
    for tab in main_nav_tabs:
        tab._parent = main_nav

    ownership = _FakeControl(label="Ownership", control_type="ComboBox", automation_id="ownership")
    identification_group = _FakeControl(
        label="Identification",
        control_type="Group",
        automation_id="identification",
        children=[ownership],
    )
    _wire_children(identification_group, [ownership])

    region = _FakeControl(label="Region", control_type="ComboBox", automation_id="region")
    location_group = _FakeControl(
        label="Location",
        control_type="Group",
        automation_id="location",
        children=[region],
    )
    _wire_children(location_group, [region])

    address = _FakeControl(label="Street Address", control_type="Edit", automation_id="address")
    evaluation_group = _FakeControl(
        label="Evaluation",
        control_type="Group",
        automation_id="evaluation",
        children=[address],
    )
    _wire_children(evaluation_group, [address])

    toolbar_combo = _FakeControl(
        label="Version",
        control_type="ComboBox",
        automation_id="toolbar-version",
    )
    toolbar = _FakeControl(
        label="ToolBar",
        control_type="ToolBar",
        automation_id="main-toolbar",
        children=[toolbar_combo],
    )
    _wire_children(toolbar, [toolbar_combo])

    window = _FakeControl(
        label="HOT2000",
        control_type="Window",
        children=[toolbar, *main_nav_tabs, identification_group, location_group, evaluation_group],
    )
    window._parent = _FakeParent([window])
    return window


class GeneralSectionMockSurface:
    """Mock General section with foreign main tabs that must never be selected."""

    def __init__(self) -> None:
        self.ownership_value = "Owner occupied"
        self.region_value = "Ontario"
        self.ownership_options = [
            {"label": "Owner occupied", "index": 0},
            {"label": "Rental", "index": 1},
        ]
        self.region_options = [
            {"label": "Ontario", "index": 0},
            {"label": "Quebec", "index": 1},
        ]
        self.visited: list[str] = []

    def fingerprint(self) -> StateFingerprint:
        return StateFingerprint(
            window_title="HOT2000",
            selected_tabs=["General"],
            hot2000_version="11.13",
        )

    def list_tabs(self) -> list[dict]:
        return [
            {"id": "tab-general", "label": "General", "selected": True},
            {"id": "tab-info", "label": "Info", "selected": False},
            {"id": "tab-weather", "label": "Weather", "selected": False},
        ]

    def list_internal_tabs(self) -> list[dict]:
        return []

    def list_combos(self, *, metadata_only: bool = True) -> list[dict]:
        return [
            {
                "id": "combo-ownership",
                "label": "Ownership",
                "logicalControlId": "general > ownership",
                "locator": {"rectangle": {"top": 10, "left": 10}, "siblingOrdinal": 0},
            },
            {
                "id": "combo-region",
                "label": "Region",
                "logicalControlId": "general > region",
                "locator": {"rectangle": {"top": 20, "left": 10}, "siblingOrdinal": 1},
            },
        ]

    def list_text_fields(self) -> list[dict]:
        return [
            {
                "id": "text-address",
                "label": "Street Address",
                "controlType": "Edit",
                "logicalControlId": "general > street-address",
                "locator": {"rectangle": {"top": 0, "left": 0}, "siblingOrdinal": 0},
            }
        ]

    def list_checkboxes(self) -> list[dict]:
        return [
            {
                "id": "checkbox-a",
                "label": "Checkbox A",
                "checked": "unchecked",
                "logicalControlId": "general > checkbox-a",
                "locator": {},
            }
        ]

    def list_radio_groups(self) -> list[dict]:
        return [
            {
                "id": "group-a",
                "choices": [
                    {"id": "radio-a", "label": "Radio A", "logicalControlId": "general > radio-a"},
                ],
                "selected": None,
            }
        ]

    def list_buttons(self) -> list[dict]:
        return [
            {"id": "button-a", "label": "Button A", "classification": "SAFE_UI_REVEAL"},
        ]

    def list_scroll_regions(self) -> list[dict]:
        return []

    def list_dialogs(self) -> list[dict]:
        return []

    def capture_controls(self) -> list[dict]:
        return [{"stableId": "ownership", "controlType": "ComboBox"}]

    def execute_action(self, action: PlannedAction) -> dict:
        self.visited.append(f"{action.action_kind}:{action.control_label}")
        if action.action_kind == "tab_select":
            return {"status": "blocked", "error": "tab_select forbidden"}
        if action.action_kind == "combo_open":
            if action.control_label == "Ownership":
                return {
                    "status": "completed",
                    "options": copy.deepcopy(self.ownership_options),
                    "original_value": "Owner occupied",
                }
            if action.control_label == "Region":
                return {
                    "status": "completed",
                    "options": copy.deepcopy(self.region_options),
                    "original_value": "Ontario",
                }
        if action.action_kind == "combo_select":
            return {"status": "completed", "selected_value": action.target_value}
        if action.action_kind == "text_field_focus":
            return {"status": "completed"}
        if action.action_kind == "checkbox_toggle":
            return {"status": "completed", "restore": {"kind": "checkbox", "original": "unchecked"}}
        if action.action_kind == "radio_select":
            return {"status": "completed"}
        if action.action_kind == "button_invoke":
            return {"status": "completed"}
        return {"status": "skipped"}


class SectionHardLockTests(unittest.TestCase):
    def test_main_section_nav_tabs_detected(self):
        window = _build_general_window()
        main_tabs = [child for child in window._children if child.element_info.control_type == "TabItem"]
        self.assertEqual(len(main_tabs), 4)
        self.assertTrue(is_main_section_navigation_tab(main_tabs[1]))

    def test_isolates_narrow_general_content_root(self):
        window = _build_general_window()
        root, evidence = identify_section_content_root(window, "general")
        self.assertNotEqual(root, window)
        self.assertEqual(evidence["method"], "signature_narrow_container")
        self.assertEqual(evidence["mainNavTabsInRoot"], 0)
        self.assertGreaterEqual(evidence["signatureControlsInRoot"], 1)

    def test_rejects_window_fallback_scope(self):
        window = _build_general_window()
        signatures = [
            child
            for child in window.descendants()
            if child._label in {"Ownership", "Region", "Street Address"}
        ]
        self.assertFalse(is_valid_section_scope_root(window, signatures))

    def test_fails_closed_without_signature_controls(self):
        empty = _FakeControl(label="HOT2000", control_type="Window", children=[])
        with self.assertRaises(SectionScopeIsolationError):
            establish_section_scope_lock(empty, "general", "General")

    def test_distributed_groups_use_active_visible_section(self):
        window = _build_distributed_general_window()
        narrow_root, narrow_evidence = try_identify_narrow_section_root(window, "general")
        self.assertIsNone(narrow_root)
        self.assertIn(
            narrow_evidence.get("narrowRootFailureReason"),
            {"no_valid_narrow_root", "no_common_ancestor"},
        )

        lock, root, evidence = establish_section_scope_lock(window, "general", "General")
        self.assertEqual(lock.scope_mode, SCOPE_MODE_ACTIVE_VISIBLE_SECTION)
        self.assertFalse(lock.narrow_root_found)
        self.assertIsNone(root)
        self.assertGreater(evidence["sectionContentControlsAccepted"], 0)
        self.assertGreaterEqual(len(discover_section_scope_roots(window, "general")), 2)

    def test_no_narrow_root_not_fatal_when_general_verified(self):
        window = _build_distributed_general_window()
        lock, _, evidence = establish_section_scope_lock(window, "general", "General")
        self.assertFalse(lock.narrow_root_found)
        self.assertEqual(evidence["scopeMode"], SCOPE_MODE_ACTIVE_VISIBLE_SECTION)

    def test_toolbar_combo_excluded_ownership_region_included(self):
        window = _build_distributed_general_window()
        accepted = {
            control._label
            for control in iter_section_content_controls(window, section_id="general")
        }
        self.assertIn("Ownership", accepted)
        self.assertIn("Region", accepted)
        self.assertNotIn("Version", accepted)
        toolbar_combo = next(
            child
            for child in window.descendants()
            if child._label == "Version"
        )
        self.assertTrue(is_application_chrome(toolbar_combo))

    def test_foreign_main_tabs_never_section_content(self):
        window = _build_distributed_general_window()
        for tab in window._children:
            if tab.element_info.control_type == "TabItem":
                self.assertFalse(is_section_content_control(tab, "general"))

    def test_verify_locked_section_only_fails_on_positive_foreign(self):
        window = _build_general_window()
        lock = SectionScopeLock(section_id="general", section_label="General")
        ok, _ = verify_locked_section(window, lock)
        self.assertTrue(ok)

        foreign = SectionDetection(
            section_id="weather",
            confidence="high",
            score=10,
            method="selected_navigation",
            evidence=["selected:Weather"],
        )
        with patch("catalog_section_scope.detect_current_section", return_value=foreign):
            ok, reason = verify_locked_section(window, lock)
        self.assertFalse(ok)
        self.assertIn("foreign section weather", reason or "")

        inconclusive = SectionDetection(
            section_id=None,
            confidence="none",
            score=0,
            method="unknown",
            evidence=[],
        )
        with patch("catalog_section_scope.detect_current_section", return_value=inconclusive):
            ok, reason = verify_locked_section(window, lock)
        self.assertTrue(ok)

    def test_section_mode_plans_zero_tab_actions(self):
        engine = CrawlEngine()
        engine.target_section_id = "general"
        surface = GeneralSectionMockSurface()
        fp = surface.fingerprint()
        engine.plan_actions_for_surface(surface, fp, screen_id="general::pane")
        tab_actions = [a for a in engine.actions.values() if a.action_kind == "tab_select"]
        self.assertEqual(tab_actions, [])
        self.assertEqual(engine.counters.tabs_total, 0)

    def test_section_mode_source_has_no_tab_planning(self):
        engine = CrawlEngine()
        source = inspect.getsource(engine.plan_actions_for_surface)
        section_branch = source.split("if self.is_section_sequential_mode():")[1].split("else:")[0]
        self.assertNotIn("_plan_tabs(", section_branch)
        self.assertNotIn("_plan_section_internal_tabs(", section_branch)
        self.assertNotIn("tab_select", section_branch)

    def test_section_crawl_action_log_has_no_tab_select(self):
        engine = CrawlEngine(CrawlLimits(max_actions=500))
        engine.target_section_id = "general"
        surface = GeneralSectionMockSurface()
        fp = surface.fingerprint()
        engine.record_state(fp, {"controls": surface.capture_controls()})
        engine.plan_actions_for_surface(surface, fp, screen_id="general::pane")

        action_log: list[str] = []
        while True:
            action = engine.pop_next()
            if not action:
                break
            result = surface.execute_action(action)
            status = result.get("status", "failed")
            engine.mark_action(action.action_key, status)
            action_log.append(action.action_kind)
            if status != "completed":
                continue
            if action.action_kind == "combo_open":
                logical_id = action.logical_control_id or action.control_id
                engine.begin_combo_sweep(logical_id, str(result.get("original_value") or ""))
                engine._opened_combos.add((action.screen_id or "screen", action.control_id))
                engine.plan_combo_select_actions(
                    action.state_digest,
                    action.control_id,
                    action.control_label,
                    result.get("options") or [],
                    action.action_key,
                    screen_id=action.screen_id or "screen",
                    logical_control_id=logical_id,
                )
            elif action.action_kind == "combo_select":
                logical_id = action.logical_control_id or action.control_id
                prereq = action.prerequisite_signature or engine.prerequisite_signature()
                engine.ledger.mark_option_completed(
                    logical_id, prereq, action.target_value, failed=False
                )
                if engine.is_last_combo_select(action):
                    engine.finish_combo_sweep(logical_id)
                    engine.plan_next_section_combo(surface, fp, screen_id="general::pane")

        self.assertNotIn("tab_select", action_log)
        self.assertIn("text_field_focus", action_log)
        self.assertIn("combo_open", action_log)
        self.assertIn("combo_select", action_log)
        self.assertEqual(engine.counters.tabs_total, 0)
        self.assertEqual(engine.counters.tabs_visited, 0)

    def test_section_scope_lock_serializes_active_visible_fields(self):
        lock = SectionScopeLock(
            section_id="general",
            section_label="General",
            scope_mode=SCOPE_MODE_ACTIVE_VISIBLE_SECTION,
            narrow_root_found=False,
            narrow_root_failure_reason="no_valid_narrow_root",
            selected_section_verification={"sectionId": "general", "confidence": "high"},
        )
        payload = lock.to_dict()
        self.assertEqual(payload["lockedSectionId"], "general")
        self.assertEqual(payload["scopeMode"], SCOPE_MODE_ACTIVE_VISIBLE_SECTION)
        self.assertFalse(payload["narrowRootFound"])
        restored = SectionScopeLock.from_dict(payload)
        self.assertEqual(restored.section_id, "general")
        self.assertEqual(restored.scope_mode, SCOPE_MODE_ACTIVE_VISIBLE_SECTION)

    def test_no_physical_mouse_in_section_scope_modules(self):
        import catalog_section_scope
        import catalog_ui_crawler

        for module in (catalog_section_scope, catalog_ui_crawler):
            source = inspect.getsource(module)
            self.assertNotIn("click_input", source)
            self.assertNotIn("SetCursorPos", source)
            self.assertNotIn("pywinauto.mouse", source)


if __name__ == "__main__":
    unittest.main()
