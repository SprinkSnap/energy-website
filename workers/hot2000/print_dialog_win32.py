"""Print dialog automation for 32-bit HOT2000 helpers.

Uses pywin32 when available; falls back to ctypes on embeddable Python without pip.
"""

from __future__ import annotations

import ctypes
import os
import time
from pathlib import Path

USING_CTYPES_WIN32 = False

try:
    import win32api
    import win32con
    import win32gui
    import win32print
except ImportError:  # pragma: no cover - Windows only
    if os.name == "nt":
        try:
            from win32_ctypes import win32api, win32con, win32gui, win32print

            USING_CTYPES_WIN32 = True
        except ImportError:
            win32api = win32con = win32gui = win32print = None
    else:
        win32api = win32con = win32gui = win32print = None

CDM_SETCONTROLTEXT = 0x468
CDM_FILENAME_IDS = (0x0480, 0x0470, 1152)

PDF_PRINTER_LABELS = (
    "Microsoft Print to PDF",
    "Microsoft Print To PDF",
    "Print to PDF",
    "Microsoft Print to Pdf",
)

_LVM_GETITEMCOUNT = 0x1004
_LVM_GETITEMTEXTW = 0x1073
_LVM_GETNEXTITEM = 0x100C
_LVM_SETITEMSTATE = 0x102B
_LVM_ENSUREVISIBLE = 0x1013
_LVIF_TEXT = 0x0001
_LVIF_STATE = 0x0008
_LVNI_SELECTED = 0x0002
_LVIS_SELECTED = 0x0002
_LVIS_FOCUSED = 0x0001

_LB_GETCOUNT = 0x018B
_LB_GETTEXT = 0x0189
_LB_GETTEXTLEN = 0x018A
_LB_SETCURSEL = 0x0186
_LB_GETCURSEL = 0x0188

CMD_FILE_PRINT = 57607
TB_BUTTONCOUNT = 0x0418
TB_GETITEMRECT = 0x041D


class _LVITEMW(ctypes.Structure):
    _fields_ = [
        ("mask", ctypes.c_uint),
        ("iItem", ctypes.c_int),
        ("iSubItem", ctypes.c_int),
        ("state", ctypes.c_uint),
        ("stateMask", ctypes.c_uint),
        ("pszText", ctypes.c_void_p),
        ("cchTextMax", ctypes.c_int),
        ("iImage", ctypes.c_int),
        ("lParam", ctypes.c_void_p),
        ("iIndent", ctypes.c_int),
        ("iGroupId", ctypes.c_int),
        ("cColumns", ctypes.c_uint),
        ("puColumns", ctypes.c_void_p),
    ]


def require_pywin32() -> None:
    if win32gui is None or win32con is None:
        raise ImportError("Windows UI automation is unavailable")


def pdf_ready(output_path: Path) -> bool:
    try:
        if not output_path.is_file() or output_path.stat().st_size < 128:
            return False
        with output_path.open("rb") as handle:
            return handle.read(5).startswith(b"%PDF")
    except OSError:
        return False


def normalize_label(text: str) -> str:
    return (text or "").replace("&", "").strip().lower()


def printer_label_matches_pdf(label: str) -> bool:
    normalized = normalize_label(label)
    return "print to pdf" in normalized or normalized.endswith(" pdf")


def default_printer_is_pdf() -> bool:
    if win32print is None:
        return False
    try:
        default = str(win32print.GetDefaultPrinter() or "").strip().lower()
        return "print to pdf" in default or default.endswith(" pdf")
    except Exception:
        return False


def allow_set_foreground_window() -> None:
    if os.name != "nt":
        return
    try:
        ctypes.windll.user32.AllowSetForegroundWindow(ctypes.c_uint(0xFFFFFFFF))
    except Exception:
        pass


def is_valid_hwnd(hwnd: int | None) -> bool:
    try:
        return bool(hwnd) and bool(win32gui.IsWindow(hwnd))
    except Exception:
        return False


def window_area(hwnd: int) -> int:
    try:
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        return max(0, right - left) * max(0, bottom - top)
    except Exception:
        return 0


def enumerate_top_level_windows() -> list[int]:
    windows: list[int] = []

    def callback(hwnd, _):
        try:
            if win32gui.GetParent(hwnd):
                return
            windows.append(hwnd)
        except Exception:
            pass

    win32gui.EnumWindows(callback, None)
    return windows


def enumerate_all_dialog_hwnds() -> list[int]:
    seen: set[int] = set()
    dialogs: list[int] = []
    gw_owner = getattr(win32con, "GW_OWNER", 4)

    def add(hwnd: int | None) -> None:
        if not hwnd or hwnd in seen:
            return
        try:
            if not win32gui.IsWindow(hwnd) or not win32gui.IsWindowVisible(hwnd):
                return
            if win32gui.GetClassName(hwnd) != "#32770":
                return
        except Exception:
            return
        seen.add(hwnd)
        dialogs.append(hwnd)

    def walk_children(parent: int) -> None:
        def child_cb(child: int, _) -> None:
            add(child)
            try:
                win32gui.EnumChildWindows(child, child_cb, None)
            except Exception:
                pass

        try:
            win32gui.EnumChildWindows(parent, child_cb, None)
        except Exception:
            pass

    for hwnd in enumerate_top_level_windows():
        add(hwnd)
        walk_children(hwnd)
        try:
            owner = win32gui.GetWindow(hwnd, gw_owner)
            add(owner)
            walk_children(owner)
        except Exception:
            pass
    return dialogs


def dialog_visible_text(hwnd: int) -> str:
    parts: list[str] = []
    try:
        parts.append(win32gui.GetWindowText(hwnd) or "")
    except Exception:
        pass

    def callback(child, _):
        try:
            parts.append(win32gui.GetWindowText(child) or "")
            win32gui.EnumChildWindows(child, callback, None)
        except Exception:
            pass

    try:
        win32gui.EnumChildWindows(hwnd, callback, None)
    except Exception:
        pass
    return " ".join(parts)


def find_child_by_class_recursive(parent: int, class_name: str) -> list[int]:
    matches: list[int] = []

    def callback(hwnd, _):
        try:
            if win32gui.GetClassName(hwnd) == class_name:
                matches.append(hwnd)
            win32gui.EnumChildWindows(hwnd, callback, None)
        except Exception:
            pass

    win32gui.EnumChildWindows(parent, callback, None)
    return matches


def find_child_by_text_recursive(parent: int, text: str) -> int | None:
    found: int | None = None

    def callback(hwnd, _):
        nonlocal found
        if found is not None:
            return
        try:
            if win32gui.GetWindowText(hwnd) == text:
                found = hwnd
                return
            win32gui.EnumChildWindows(hwnd, callback, None)
        except Exception:
            pass

    win32gui.EnumChildWindows(parent, callback, None)
    return found


def find_child_button(dialog_hwnd: int, labels: tuple[str, ...]) -> int | None:
    wanted = {normalize_label(label) for label in labels}
    found: int | None = None

    def callback(hwnd, _):
        nonlocal found
        if found is not None:
            return
        try:
            if normalize_label(win32gui.GetWindowText(hwnd)) in wanted:
                found = hwnd
                return
            win32gui.EnumChildWindows(hwnd, callback, None)
        except Exception:
            pass

    win32gui.EnumChildWindows(dialog_hwnd, callback, None)
    return found


def click_dialog_button(dialog_hwnd: int, labels: tuple[str, ...]) -> bool:
    for label in labels:
        btn = find_child_by_text_recursive(dialog_hwnd, label)
        if btn:
            win32gui.SendMessage(btn, win32con.BM_CLICK, 0, 0)
            return True
        btn = find_child_button(dialog_hwnd, (label,))
        if btn:
            win32gui.SendMessage(btn, win32con.BM_CLICK, 0, 0)
            return True
    return False


def focus_window(hwnd: int) -> None:
    allow_set_foreground_window()
    try:
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
    except Exception:
        pass
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass


def focus_modal_dialog(hwnd: int) -> None:
    if not is_valid_hwnd(hwnd):
        return
    allow_set_foreground_window()
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass


def post_ctrl_p(hwnd: int) -> None:
    focus_window(hwnd)
    try:
        win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_CONTROL, 0)
        win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, ord("P"), 0)
        win32gui.PostMessage(hwnd, win32con.WM_KEYUP, ord("P"), 0)
        win32gui.PostMessage(hwnd, win32con.WM_KEYUP, win32con.VK_CONTROL, 0)
    except Exception:
        win32gui.SendMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_CONTROL, 0)
        win32gui.SendMessage(hwnd, win32con.WM_KEYDOWN, ord("P"), 0)
        win32gui.SendMessage(hwnd, win32con.WM_KEYUP, ord("P"), 0)
        win32gui.SendMessage(hwnd, win32con.WM_KEYUP, win32con.VK_CONTROL, 0)


def send_ctrl_p_to_window(hwnd: int) -> None:
    if is_valid_hwnd(hwnd):
        focus_modal_dialog(hwnd)
    time.sleep(0.5)
    try:
        win32api.keybd_event(win32con.VK_CONTROL, 0, 0, 0)
        win32api.keybd_event(ord("P"), 0, 0, 0)
        win32api.keybd_event(ord("P"), 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(win32con.VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)
        return
    except Exception:
        pass
    post_ctrl_p(hwnd)


class _RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


class _POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


def click_screen_point(x: int, y: int) -> bool:
    try:
        win32api.SetCursorPos((x, y))
        time.sleep(0.1)
        win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        return True
    except Exception:
        return False


def client_to_screen(hwnd: int, x: int, y: int) -> tuple[int, int]:
    point = _POINT(x, y)
    try:
        ctypes.windll.user32.ClientToScreen(hwnd, ctypes.byref(point))
        return point.x, point.y
    except Exception:
        return x, y


def click_toolbar_button(toolbar_hwnd: int, index: int) -> bool:
    rect = _RECT()
    try:
        if not win32gui.SendMessage(
            toolbar_hwnd,
            TB_GETITEMRECT,
            index,
            ctypes.byref(rect),
        ):
            return False
        if rect.right <= rect.left or rect.bottom <= rect.top:
            return False
        cx = (rect.left + rect.right) // 2
        cy = (rect.top + rect.bottom) // 2
        sx, sy = client_to_screen(toolbar_hwnd, cx, cy)
        return click_screen_point(sx, sy)
    except Exception:
        return False


def menu_labels_match(actual: str, expected: str) -> bool:
    actual_n = normalize_label(actual)
    expected_n = normalize_label(expected)
    if not actual_n or not expected_n:
        return False
    if actual_n == expected_n:
        return True
    return expected_n in actual_n or actual_n in expected_n


def get_menu_item_text(menu: int, index: int) -> str:
    try:
        mf_byposition = getattr(win32con, "MF_BYPOSITION", 0x400)
        return str(win32gui.GetMenuString(menu, index, mf_byposition) or "").strip()
    except Exception:
        return ""


def menu_handles_for_window(hwnd: int) -> list[int]:
    handles: list[int] = []
    seen: set[int] = set()
    candidates = [hwnd]
    try:
        parent = win32gui.GetParent(hwnd)
        if parent:
            candidates.append(parent)
    except Exception:
        pass
    try:
        ga_root = getattr(win32con, "GA_ROOT", 2)
        root = win32gui.GetAncestor(hwnd, ga_root)
        if root:
            candidates.append(root)
    except Exception:
        pass
    for candidate in candidates:
        try:
            menu = win32gui.GetMenu(candidate)
        except Exception:
            menu = 0
        if menu and menu not in seen:
            seen.add(menu)
            handles.append(menu)
    return handles


def list_menu_labels(menu: int) -> list[str]:
    labels: list[str] = []
    try:
        count = win32gui.GetMenuItemCount(menu)
    except Exception:
        return labels
    for index in range(count):
        labels.append(get_menu_item_text(menu, index))
    return labels


def find_menu_item_by_label(menu: int, label: str) -> int | None:
    try:
        count = win32gui.GetMenuItemCount(menu)
    except Exception:
        return None
    for index in range(count):
        if menu_labels_match(get_menu_item_text(menu, index), label):
            return index
    return None


def invoke_menu_path(hwnd: int, labels: tuple[str, ...]) -> None:
    menus = menu_handles_for_window(hwnd)
    if not menus:
        raise RuntimeError("Menu bar was not found.")
    last_error: Exception | None = None
    for menu in menus:
        try:
            submenu = menu
            for depth, label in enumerate(labels):
                index = find_menu_item_by_label(submenu, label)
                if index is None:
                    raise RuntimeError(
                        f'Menu item "{label}" not found. Available: {list_menu_labels(submenu)!r}'
                    )
                is_last = depth == len(labels) - 1
                if is_last:
                    cmd_id = win32gui.GetMenuItemID(submenu, index)
                    if cmd_id is None or cmd_id < 0:
                        raise RuntimeError(f'Menu item "{label}" has no command id.')
                    for send in (win32gui.PostMessage, win32gui.SendMessage):
                        try:
                            send(hwnd, win32con.WM_COMMAND, cmd_id, 0)
                            return
                        except Exception:
                            continue
                    raise RuntimeError(f'Could not send WM_COMMAND for "{label}".')
                submenu = win32gui.GetSubMenu(submenu, index)
                if not submenu:
                    raise RuntimeError(f'Submenu for "{label}" was not found.')
            return
        except Exception as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise RuntimeError("Menu bar was not found.")


def invoke_file_print_menu(hwnd: int) -> bool:
    """Open Print via File → Print using the live menu command id."""
    if not is_valid_hwnd(hwnd):
        return False
    focus_window(hwnd)
    time.sleep(0.35)
    for labels in (
        ("File", "Print"),
        ("&File", "&Print"),
        ("File", "&Print"),
        ("&File", "Print"),
    ):
        try:
            invoke_menu_path(hwnd, labels)
            time.sleep(0.8)
            if find_print_dialog(timeout_s=3):
                return True
        except Exception:
            continue
    return False


def send_alt_file_print(hwnd: int) -> bool:
    """Open Print via Alt+F, P keyboard shortcut."""
    if not is_valid_hwnd(hwnd):
        return False
    focus_window(hwnd)
    time.sleep(0.35)
    try:
        win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
        win32api.keybd_event(ord("F"), 0, 0, 0)
        win32api.keybd_event(ord("F"), 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
        time.sleep(0.5)
        win32api.keybd_event(ord("P"), 0, 0, 0)
        win32api.keybd_event(ord("P"), 0, win32con.KEYEVENTF_KEYUP, 0)
        time.sleep(0.8)
        return bool(find_print_dialog(timeout_s=3))
    except Exception:
        return False


def collect_print_target_hwnds(
    report_hwnd: int | None,
    main_hwnd: int | None,
) -> list[int]:
    """Return HWNDs most likely to host the report toolbar and Print command."""
    candidates: list[int] = []
    seen: set[int] = set()

    def add(hwnd: int | None) -> None:
        if not is_valid_hwnd(hwnd):
            return
        value = int(hwnd)
        if value in seen:
            return
        seen.add(value)
        candidates.append(value)

    add(main_hwnd)
    add(report_hwnd)
    if is_valid_hwnd(main_hwnd):
        main = int(main_hwnd)
        add(find_child_report_hwnd(main))
        try:
            popup = win32gui.GetLastActivePopup(main)
            if popup and popup != main:
                add(popup)
        except Exception:
            pass
        for child in find_child_by_class_recursive(main, "AfxFrameOrView42"):
            add(child)
        for child in find_child_by_class_recursive(main, "AfxFrameOrView140"):
            add(child)
        for child_hwnd in find_child_by_class_recursive(main, "Afx:"):
            try:
                cls = win32gui.GetClassName(child_hwnd)
            except Exception:
                continue
            if cls.startswith("Afx:"):
                add(child_hwnd)
    return candidates


def find_toolbar_hwnds(host_hwnds: list[int]) -> list[int]:
    toolbars: list[int] = []
    seen: set[int] = set()
    for host in host_hwnds:
        if not is_valid_hwnd(host):
            continue
        for class_name in ("ToolbarWindow32",):
            for toolbar_hwnd in find_child_by_class_recursive(host, class_name):
                if toolbar_hwnd not in seen:
                    seen.add(toolbar_hwnd)
                    toolbars.append(toolbar_hwnd)
    return toolbars


def click_report_toolbar_print_button(
    report_hwnd: int,
    extra_hosts: list[int] | None = None,
) -> bool:
    """Click the printer icon on the HOT2000 report toolbar."""
    hosts: list[int] = []
    seen: set[int] = set()
    for hwnd in [report_hwnd, *(extra_hosts or [])]:
        if is_valid_hwnd(hwnd) and int(hwnd) not in seen:
            seen.add(int(hwnd))
            hosts.append(int(hwnd))
    if not hosts:
        return False

    toolbars = find_toolbar_hwnds(hosts)
    for host in hosts:
        focus_window(host)
        time.sleep(0.25)
    for toolbar_hwnd in toolbars:
        try:
            count = int(win32gui.SendMessage(toolbar_hwnd, TB_BUTTONCOUNT, 0, 0))
        except Exception:
            continue
        if count <= 0:
            continue
        preferred = [1, 2, 0, 3, 4, 5, 6, 7]
        indices = preferred + [i for i in range(min(count, 12)) if i not in preferred]
        for index in indices:
            if index >= count:
                continue
            if click_toolbar_button(toolbar_hwnd, index):
                time.sleep(0.8)
                if find_print_dialog(timeout_s=2):
                    return True
    return False


def send_file_print_command(report_hwnd: int, main_hwnd: int | None = None) -> bool:
    """Open Print via MFC File → Print (same as the report toolbar printer icon)."""
    targets: list[int] = []
    seen: set[int] = set()
    for hwnd in (main_hwnd, report_hwnd):
        if is_valid_hwnd(hwnd) and int(hwnd) not in seen:
            seen.add(int(hwnd))
            targets.append(int(hwnd))
    if not targets:
        return False
    for hwnd in targets:
        if invoke_file_print_menu(hwnd):
            return True
    for hwnd in targets:
        focus_window(hwnd)
        time.sleep(0.3)
        for send in (win32gui.PostMessage, win32gui.SendMessage):
            try:
                send(hwnd, win32con.WM_COMMAND, CMD_FILE_PRINT, 0)
                time.sleep(0.8)
                if find_print_dialog(timeout_s=3):
                    return True
            except Exception:
                continue
    return False


def describe_window(hwnd: int) -> str:
    try:
        title = win32gui.GetWindowText(hwnd) or ""
        cls = win32gui.GetClassName(hwnd)
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        return (
            f"hwnd={hwnd} class={cls!r} title={title!r} "
            f"rect=({left},{top},{right},{bottom}) area={max(0, right - left) * max(0, bottom - top)}"
        )
    except Exception as exc:
        return f"hwnd={hwnd} (error: {exc})"


def collect_print_diagnostics(
    report_hwnd: int | None,
    main_hwnd: int | None,
) -> str:
    lines = [
        f"report_hwnd={report_hwnd!r} main_hwnd={main_hwnd!r}",
        "Print targets:",
    ]
    targets = collect_print_target_hwnds(report_hwnd, main_hwnd)
    for hwnd in targets[:12]:
        lines.append(f"  {describe_window(hwnd)}")
    toolbars = find_toolbar_hwnds(targets)
    lines.append(f"Toolbars found: {len(toolbars)}")
    for toolbar_hwnd in toolbars[:8]:
        try:
            count = int(win32gui.SendMessage(toolbar_hwnd, TB_BUTTONCOUNT, 0, 0))
        except Exception:
            count = -1
        lines.append(f"  toolbar {describe_window(toolbar_hwnd)} buttons={count}")
    if is_valid_hwnd(main_hwnd):
        for menu in menu_handles_for_window(int(main_hwnd)):
            lines.append(f"Menu labels: {list_menu_labels(menu)!r}")
    lines.append("Visible Print-like dialogs:")
    for hwnd in enumerate_all_dialog_hwnds():
        try:
            title = (win32gui.GetWindowText(hwnd) or "").strip()
            if "print" in title.lower():
                lines.append(f"  {describe_window(hwnd)}")
        except Exception:
            pass
    return "\n".join(lines)


def open_report_print_dialog(
    report_hwnd: int | None,
    main_hwnd: int | None,
) -> int | None:
    """Open the Windows Print dialog from the Full House Report viewer."""
    existing = find_print_dialog(timeout_s=1.5)
    if existing:
        return existing

    targets = collect_print_target_hwnds(report_hwnd, main_hwnd)
    if not targets:
        targets = [int(resolve_report_print_hwnd(report_hwnd, main_hwnd))]

    for hwnd in targets:
        if click_report_toolbar_print_button(hwnd, extra_hosts=targets):
            dialog = find_print_dialog(timeout_s=8)
            if dialog:
                return dialog

    main_target = int(main_hwnd) if is_valid_hwnd(main_hwnd) else targets[0]
    for hwnd in targets:
        if send_file_print_command(hwnd, main_hwnd=main_target):
            dialog = find_print_dialog(timeout_s=8)
            if dialog:
                return dialog

    for hwnd in (main_target, *targets):
        if send_alt_file_print(hwnd):
            dialog = find_print_dialog(timeout_s=8)
            if dialog:
                return dialog

    focus_target = targets[0]
    for hwnd in targets:
        if is_valid_hwnd(main_hwnd) and hwnd == int(main_hwnd):
            focus_target = hwnd
            break
    focus_window(focus_target)
    time.sleep(0.6)
    for hwnd in targets:
        send_ctrl_p_to_window(hwnd)
        dialog = find_print_dialog(timeout_s=12)
        if dialog:
            return dialog
    return find_print_dialog(timeout_s=20)


def resolve_report_print_hwnd(report_hwnd: int | None, main_hwnd: int | None) -> int:
    for hwnd in (report_hwnd, main_hwnd):
        if is_valid_hwnd(hwnd):
            return int(hwnd)
    raise RuntimeError("No valid report or main HWND for printing.")


def find_child_report_hwnd(main_hwnd: int) -> int | None:
    if not is_valid_hwnd(main_hwnd):
        return None
    for child in find_child_by_class_recursive(main_hwnd, "AfxFrameOrView42"):
        return child
    for child in find_child_by_class_recursive(main_hwnd, "AfxFrameOrView140"):
        return child
    for child_hwnd in find_child_by_class_recursive(main_hwnd, "Afx:"):
        try:
            cls = win32gui.GetClassName(child_hwnd)
        except Exception:
            continue
        if not cls.startswith("Afx:"):
            continue
        title = (win32gui.GetWindowText(child_hwnd) or "").strip().lower()
        if "full house" in title or title == "":
            return child_hwnd
    return None


def is_hot2000_print_dialog(hwnd: int) -> bool:
    try:
        if not win32gui.IsWindowVisible(hwnd):
            return False
        if win32gui.GetClassName(hwnd) != "#32770":
            return False
        title = (win32gui.GetWindowText(hwnd) or "").strip().lower()
        if title not in ("print",) and not title.startswith("print "):
            return False
        if find_child_by_class_recursive(hwnd, "SHELLDLL_DefView"):
            return True
        if find_child_by_class_recursive(hwnd, "SysListView32"):
            return True
        if find_child_by_class_recursive(hwnd, "ListBox"):
            return True
        if find_child_button(hwnd, ("&Print", "Print")):
            return True
        return bool(find_child_by_class_recursive(hwnd, "ComboBox"))
    except Exception:
        return False


def find_print_dialog(timeout_s: float = 45) -> int | None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        for hwnd in enumerate_all_dialog_hwnds():
            if is_hot2000_print_dialog(hwnd):
                return hwnd
        time.sleep(0.25)
    return None


def iter_list_views(parent_hwnd: int):
    seen: set[int] = set()
    for listview_hwnd in find_child_by_class_recursive(parent_hwnd, "SysListView32"):
        if listview_hwnd not in seen:
            seen.add(listview_hwnd)
            yield listview_hwnd


def iter_list_boxes(parent_hwnd: int):
    seen: set[int] = set()
    for listbox_hwnd in find_child_by_class_recursive(parent_hwnd, "ListBox"):
        if listbox_hwnd not in seen:
            seen.add(listbox_hwnd)
            yield listbox_hwnd


def get_listview_item_text(listview_hwnd: int, index: int) -> str:
    try:
        buf = ctypes.create_unicode_buffer(512)
        item = _LVITEMW()
        item.mask = _LVIF_TEXT
        item.iItem = index
        item.iSubItem = 0
        item.pszText = ctypes.addressof(buf)
        item.cchTextMax = len(buf)
        win32gui.SendMessage(
            listview_hwnd,
            _LVM_GETITEMTEXTW,
            index,
            ctypes.addressof(item),
        )
        return str(buf.value or "").strip()
    except Exception:
        return ""


def list_listview_items(listview_hwnd: int) -> list[str]:
    items: list[str] = []
    try:
        count = win32gui.SendMessage(listview_hwnd, _LVM_GETITEMCOUNT, 0, 0)
        for index in range(int(count)):
            text = get_listview_item_text(listview_hwnd, index)
            if text:
                items.append(text)
    except Exception:
        pass
    return items


def get_listview_selected_text(listview_hwnd: int) -> str:
    try:
        index = win32gui.SendMessage(
            listview_hwnd, _LVM_GETNEXTITEM, -1, _LVNI_SELECTED
        )
        if index < 0:
            return ""
        return get_listview_item_text(listview_hwnd, index)
    except Exception:
        return ""


def select_listview_index(listview_hwnd: int, index: int) -> bool:
    try:
        item = _LVITEMW()
        item.mask = _LVIF_STATE
        item.iItem = index
        item.stateMask = _LVIS_SELECTED | _LVIS_FOCUSED
        item.state = _LVIS_SELECTED | _LVIS_FOCUSED
        win32gui.SendMessage(
            listview_hwnd,
            _LVM_SETITEMSTATE,
            index,
            ctypes.addressof(item),
        )
        win32gui.SendMessage(listview_hwnd, _LVM_ENSUREVISIBLE, index, False)
        selected_index = win32gui.SendMessage(
            listview_hwnd, _LVM_GETNEXTITEM, -1, _LVNI_SELECTED
        )
        return selected_index == index
    except Exception:
        return False


def select_listview_text(listview_hwnd: int, text: str) -> bool:
    target = normalize_label(text)
    if not target:
        return False
    for index, item in enumerate(list_listview_items(listview_hwnd)):
        item_n = normalize_label(item)
        if item_n == target or target in item_n or item_n in target:
            if select_listview_index(listview_hwnd, index):
                return True
    return False


def list_listbox_items(listbox_hwnd: int) -> list[str]:
    items: list[str] = []
    try:
        count = win32gui.SendMessage(listbox_hwnd, _LB_GETCOUNT, 0, 0)
        for index in range(int(count)):
            length = win32gui.SendMessage(listbox_hwnd, _LB_GETTEXTLEN, index, 0)
            if length <= 0:
                continue
            buf = ctypes.create_unicode_buffer(int(length) + 1)
            win32gui.SendMessage(listbox_hwnd, _LB_GETTEXT, index, buf)
            text = str(buf.value or "").strip()
            if text:
                items.append(text)
    except Exception:
        pass
    return items


def get_listbox_selected_text(listbox_hwnd: int) -> str:
    try:
        index = win32gui.SendMessage(listbox_hwnd, _LB_GETCURSEL, 0, 0)
        if index < 0:
            return ""
        items = list_listbox_items(listbox_hwnd)
        if 0 <= index < len(items):
            return items[index]
    except Exception:
        pass
    return ""


def select_listbox_index(listbox_hwnd: int, index: int) -> bool:
    try:
        result = win32gui.SendMessage(listbox_hwnd, _LB_SETCURSEL, index, 0)
        return result != -1
    except Exception:
        return False


def select_listbox_text(listbox_hwnd: int, text: str) -> bool:
    target = normalize_label(text)
    if not target:
        return False
    for index, item in enumerate(list_listbox_items(listbox_hwnd)):
        item_n = normalize_label(item)
        if item_n == target or target in item_n or item_n in target:
            if select_listbox_index(listbox_hwnd, index):
                return True
    return False


def select_pdf_printer(dialog_hwnd: int) -> bool:
    dialog_hwnd = int(dialog_hwnd)
    if not is_valid_hwnd(dialog_hwnd) or not win32gui.IsWindowVisible(dialog_hwnd):
        return False
    focus_modal_dialog(dialog_hwnd)
    time.sleep(0.35)
    for listview_hwnd in iter_list_views(dialog_hwnd):
        for item in list_listview_items(listview_hwnd):
            if printer_label_matches_pdf(item):
                if select_listview_text(listview_hwnd, item):
                    return True
        for label in PDF_PRINTER_LABELS:
            if select_listview_text(listview_hwnd, label):
                return True
    for listbox_hwnd in iter_list_boxes(dialog_hwnd):
        for item in list_listbox_items(listbox_hwnd):
            if printer_label_matches_pdf(item):
                if select_listbox_text(listbox_hwnd, item):
                    return True
        for label in PDF_PRINTER_LABELS:
            if select_listbox_text(listbox_hwnd, label):
                return True
    blob = normalize_label(dialog_visible_text(dialog_hwnd))
    return "print to pdf" in blob


def click_print_dialog_button(dialog_hwnd: int) -> bool:
    if click_dialog_button(dialog_hwnd, ("&Print", "Print", "OK", "&OK")):
        return True
    try:
        print_id = win32gui.GetDlgItem(dialog_hwnd, 1)
        if print_id:
            win32gui.SendMessage(print_id, win32con.BM_CLICK, 0, 0)
            return True
    except Exception:
        pass
    return False


def click_print_dialog_button_mouse(dialog_hwnd: int) -> bool:
    """Physically click the Print button (required when BM_CLICK is ignored)."""
    if not is_valid_hwnd(dialog_hwnd):
        return False
    focus_modal_dialog(dialog_hwnd)
    button_hwnd = find_child_button(dialog_hwnd, ("&Print", "Print"))
    if not button_hwnd:
        try:
            button_hwnd = win32gui.GetDlgItem(dialog_hwnd, 1)
        except Exception:
            button_hwnd = None
    if button_hwnd and is_valid_hwnd(button_hwnd):
        try:
            left, top, right, bottom = win32gui.GetWindowRect(button_hwnd)
            if click_screen_point((left + right) // 2, (top + bottom) // 2):
                return True
        except Exception:
            pass
    try:
        left, top, right, bottom = win32gui.GetWindowRect(dialog_hwnd)
        for x_frac, y_frac in ((0.84, 0.92), (0.78, 0.90), (0.88, 0.94)):
            x = left + int((right - left) * x_frac)
            y = top + int((bottom - top) * y_frac)
            if click_screen_point(x, y):
                return True
    except Exception:
        pass
    return False


def click_print_dialog_via_command(dialog_hwnd: int) -> bool:
    if not is_valid_hwnd(dialog_hwnd):
        return False
    focus_modal_dialog(dialog_hwnd)
    try:
        win32gui.SendMessage(dialog_hwnd, win32con.WM_COMMAND, 1, 0)
        return True
    except Exception:
        return False


def send_print_dialog_alt_p(dialog_hwnd: int) -> bool:
    if not is_valid_hwnd(dialog_hwnd):
        return False
    focus_modal_dialog(dialog_hwnd)
    time.sleep(0.2)
    try:
        win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
        win32api.keybd_event(ord("P"), 0, 0, 0)
        win32api.keybd_event(ord("P"), 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
        return True
    except Exception:
        return False


def activate_print_dialog_default_button(dialog_hwnd: int) -> bool:
    if not is_valid_hwnd(dialog_hwnd):
        return False
    focus_modal_dialog(dialog_hwnd)
    time.sleep(0.2)
    try:
        win32api.keybd_event(win32con.VK_RETURN, 0, 0, 0)
        win32api.keybd_event(win32con.VK_RETURN, 0, win32con.KEYEVENTF_KEYUP, 0)
        return True
    except Exception:
        return False


def invoke_print_dialog_print(
    print_dialog_hwnd: int,
    output_path: Path,
    timeout_s: float = 30,
) -> bool:
    """Click Print using several strategies until Save Print Output As opens."""
    deadline = time.time() + timeout_s
    strategies = (
        click_print_dialog_via_command,
        click_print_dialog_button_mouse,
        send_print_dialog_alt_p,
        activate_print_dialog_default_button,
        click_print_dialog_button,
    )
    attempt = 0
    while time.time() < deadline:
        if pdf_ready(output_path) or find_save_pdf_dialog():
            return True
        strategy = strategies[attempt % len(strategies)]
        attempt += 1
        focus_modal_dialog(print_dialog_hwnd)
        time.sleep(0.25)
        strategy(print_dialog_hwnd)
        time.sleep(0.6)
    return pdf_ready(output_path) or bool(find_save_pdf_dialog())


def click_save_dialog_button(save_dialog: int) -> bool:
    if click_dialog_button(save_dialog, ("&Save", "Save")):
        return True
    try:
        ok = win32gui.GetDlgItem(save_dialog, 1)
        if ok:
            win32gui.SendMessage(ok, win32con.BM_CLICK, 0, 0)
            return True
    except Exception:
        pass
    button_hwnd = find_child_button(save_dialog, ("&Save", "Save"))
    if button_hwnd and is_valid_hwnd(button_hwnd):
        try:
            left, top, right, bottom = win32gui.GetWindowRect(button_hwnd)
            return click_screen_point((left + right) // 2, (top + bottom) // 2)
        except Exception:
            pass
    try:
        win32gui.SendMessage(save_dialog, win32con.WM_COMMAND, 1, 0)
        return True
    except Exception:
        return False


def find_save_pdf_dialog() -> int | None:
    for hwnd in enumerate_all_dialog_hwnds():
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            title = (win32gui.GetWindowText(hwnd) or "").strip().lower()
            body = dialog_visible_text(hwnd).lower()
            if "save print output" in title or "print output as" in title:
                return hwnd
            if "print output" in title and "save" in title:
                return hwnd
            if "pdf" in title and "save" in title:
                return hwnd
            if title == "save as" and (
                "print output" in body or ".pdf" in body or "file name" in body
            ):
                return hwnd
        except Exception:
            continue
    return None


def wait_for_save_pdf_dialog(timeout_s: float = 45) -> int | None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if find_save_pdf_dialog():
            return find_save_pdf_dialog()
        time.sleep(0.25)
    return None


def read_edit_text(edit_hwnd: int) -> str:
    try:
        length = win32gui.SendMessage(edit_hwnd, win32con.WM_GETTEXTLENGTH, 0, 0)
        if length <= 0:
            return win32gui.GetWindowText(edit_hwnd).strip()
        buf = ctypes.create_unicode_buffer(length + 1)
        win32gui.SendMessage(edit_hwnd, win32con.WM_GETTEXT, length + 1, buf)
        return buf.value.strip()
    except Exception:
        return ""


def find_dialog_filename_edit(dialog_hwnd: int) -> int | None:
    combo_edits: list[int] = []
    for combo_class in ("ComboBoxEx32", "ComboBox"):
        for combo in find_child_by_class_recursive(dialog_hwnd, combo_class):
            combo_edits.extend(find_child_by_class_recursive(combo, "Edit"))
    enabled_combo_edits = [hwnd for hwnd in combo_edits if win32gui.IsWindowEnabled(hwnd)]
    if enabled_combo_edits:
        return max(enabled_combo_edits, key=window_area)
    edits = [
        hwnd
        for hwnd in find_child_by_class_recursive(dialog_hwnd, "Edit")
        if win32gui.IsWindowEnabled(hwnd)
    ]
    if not edits:
        return None
    return max(edits, key=window_area)


def set_edit_text(edit_hwnd: int, path: str) -> bool:
    try:
        win32gui.SendMessage(edit_hwnd, win32con.EM_SETSEL, 0, -1)
        if win32gui.SendMessage(edit_hwnd, win32con.EM_REPLACESEL, 1, path):
            return bool(read_edit_text(edit_hwnd))
    except Exception:
        pass
    try:
        if win32gui.SendMessage(edit_hwnd, win32con.WM_SETTEXT, 0, path):
            return bool(read_edit_text(edit_hwnd))
    except Exception:
        pass
    try:
        win32gui.SendMessage(edit_hwnd, win32con.EM_SETSEL, 0, -1)
        for ch in path:
            win32gui.PostMessage(edit_hwnd, win32con.WM_CHAR, ord(ch), 0)
        time.sleep(0.2)
        return bool(read_edit_text(edit_hwnd))
    except Exception:
        return False


def set_dialog_filename(dialog_hwnd: int, path: str) -> None:
    candidates = [path, path.replace("/", "\\"), os.path.basename(path)]
    for control_id in CDM_FILENAME_IDS:
        for candidate in candidates:
            try:
                win32gui.SendMessage(dialog_hwnd, CDM_SETCONTROLTEXT, control_id, candidate)
            except Exception:
                pass
    edit_hwnd = find_dialog_filename_edit(dialog_hwnd)
    if edit_hwnd:
        for candidate in candidates:
            if set_edit_text(edit_hwnd, candidate):
                return
        set_edit_text(edit_hwnd, path)


def save_print_output_dialog(save_dialog: int, output_path: Path) -> None:
    path_str = str(output_path.resolve())
    set_dialog_filename(save_dialog, path_str)
    focus_modal_dialog(save_dialog)
    if not click_save_dialog_button(save_dialog):
        raise RuntimeError("Could not click Save in Save Print Output As dialog.")
    time.sleep(0.4)
    confirm_save_overwrite_if_present(save_dialog)


def looks_like_overwrite_confirm(title: str, body: str = "") -> bool:
    title_l = normalize_label(title)
    blob = normalize_label(f"{title} {body}")
    if "confirm save" in title_l or "replace" in title_l:
        return True
    if "already exists" in blob and ("replace" in blob or "overwrite" in blob):
        return True
    return False


def confirm_save_overwrite_if_present(save_dialog: int) -> None:
    """Click Yes on Confirm Save As when Print to PDF overwrites an existing file."""
    for hwnd in enumerate_all_dialog_hwnds():
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            title = win32gui.GetWindowText(hwnd) or ""
            body = dialog_visible_text(hwnd)
            if not looks_like_overwrite_confirm(title, body):
                continue
            if click_dialog_button(hwnd, ("&Yes", "Yes", "OK", "&OK")):
                time.sleep(0.3)
                return
        except Exception:
            continue


def wait_for_pdf_output(output_path: Path, timeout_s: float = 90) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if pdf_ready(output_path):
            return True
        time.sleep(0.25)
    return False


def complete_print_dialog_to_pdf(
    output_path: Path,
    print_dialog_hwnd: int,
) -> bool:
    """Select Microsoft Print to PDF, click Print, and save."""
    focus_modal_dialog(print_dialog_hwnd)
    time.sleep(0.4)

    if not default_printer_is_pdf():
        select_pdf_printer(print_dialog_hwnd)
        time.sleep(0.3)

    if not invoke_print_dialog_print(print_dialog_hwnd, output_path, timeout_s=35):
        return False

    save_dialog = wait_for_save_pdf_dialog(timeout_s=20)
    if pdf_ready(output_path):
        return True
    if not save_dialog:
        return False

    save_print_output_dialog(save_dialog, output_path)
    return wait_for_pdf_output(output_path)


def automate_report_print_to_pdf(
    output_path: Path,
    report_hwnd: int | None = None,
    main_hwnd: int | None = None,
) -> None:
    """Open Print from the report toolbar, then print to PDF."""
    print_dialog = open_report_print_dialog(report_hwnd, main_hwnd)
    if not print_dialog:
        diagnostics = collect_print_diagnostics(report_hwnd, main_hwnd)
        raise RuntimeError(
            "Print dialog did not open. Click the report toolbar printer icon, "
            "or use File → Print, then select Microsoft Print to PDF.\n"
            f"{diagnostics}"
        )

    if not complete_print_dialog_to_pdf(output_path, print_dialog):
        raise RuntimeError(
            "Save Print Output As dialog did not open or PDF was not written. "
            "The Print dialog opened but Print could not be activated."
        )


def automate_open_print_dialog_to_pdf(
    output_path: Path,
    print_dialog_hwnd: int | None = None,
) -> None:
    """Complete an already-open Print dialog to PDF."""
    dialog = print_dialog_hwnd
    if not dialog or not is_valid_hwnd(dialog):
        dialog = find_print_dialog(timeout_s=45)
    if not dialog:
        raise RuntimeError("Print dialog is not visible.")
    if not complete_print_dialog_to_pdf(output_path, dialog):
        raise RuntimeError("Save Print Output As dialog did not open or PDF was not written.")
