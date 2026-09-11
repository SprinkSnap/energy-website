"""Print dialog automation for 32-bit HOT2000 helpers.

Uses pywin32 when available; falls back to ctypes on embeddable Python without pip.
"""

from __future__ import annotations

import ctypes
import os
import re
import sys
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
CDM_FILENAME_CONTROL_ID = 0x0480  # edt1 — live Save path uses this control only

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

# HOT2000 main toolbar button order (from manual trace):
# New(0), Open(1), Save(2), Help(3), House(4), Print(5)
MAIN_TOOLBAR_PRINT_INDICES = (5,)
HOT2000_TOOLBAR_PRINT_INDICES = MAIN_TOOLBAR_PRINT_INDICES
MAX_PRINT_OPEN_TARGETS = 3

CMD_FILE_PRINT = 57607
CMD_EXIT = 57665
TB_BUTTONCOUNT = 0x0418
TB_GETITEMRECT = 0x041D

MIN_MAIN_TOOLBAR_BUTTONS = 6
PRINT_DIALOG_POLL_S = 0.05
PRINT_OPEN_WAIT_S = 10.0
PRINTER_SELECTION_OP_TIMEOUT_S = 5.0
PRINTER_SELECTION_TOTAL_TIMEOUT_S = 10.0
SAVE_DIALOG_WAIT_AFTER_PRINT_S = 30.0
PDF_SAVE_VERIFY_TIMEOUT_S = 60.0
PRINT_HELPER_MAX_TIMEOUT_S = 90.0
SHELL_RENAME_MAX_DISMISSALS = 15
SHELL_RENAME_DRAIN_TIMEOUT_S = 30.0
FILENAME_ENTRY_MAX_ATTEMPTS = 2
SHELL_RENAME_QUIET_PERIOD_S = 0.5
SHELL_RENAME_CLOSE_POLL_S = 0.05
SHELL_RENAME_CLOSE_TIMEOUT_S = 0.75
SHELL_RENAME_METHOD_WAIT_S = 0.3
FILENAME_POST_WRITE_WAIT_S = 0.4
DOWNLOADS_SELECT_TIMEOUT_S = 5.0
DOWNLOADS_NAV_ITEM_NAME = "Downloads"


class Hot2000ExitedAfterPrintError(RuntimeError):
    """Raised when HOT2000 Desktop exits during Print automation."""


class PrinterSelectionError(RuntimeError):
    """Raised when Microsoft Print to PDF cannot be selected within time limits."""


class SaveFilenameTargetingError(RuntimeError):
    """Raised when Save Print Output As filename targeting fails."""


_WINDOWS_INVALID_FILENAME_CHARS = '<>:"/\\|?*'


def sanitize_windows_filename(name: str, max_len: int = 120) -> str:
    cleaned = "".join(
        ch if ch not in _WINDOWS_INVALID_FILENAME_CHARS else "-"
        for ch in (name or "").strip()
    )
    cleaned = cleaned.strip(". ")
    return (cleaned or "HOT2000")[:max_len]


def resolve_windows_downloads_folder() -> Path:
    """Resolve the logged-in user's Downloads folder (Known Folder API with fallback)."""
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes

            class _GUID(ctypes.Structure):
                _fields_ = [
                    ("Data1", wintypes.DWORD),
                    ("Data2", wintypes.WORD),
                    ("Data3", wintypes.WORD),
                    ("Data4", wintypes.BYTE * 8),
                ]

            folderid_downloads = _GUID(
                0x374DE290,
                0x123F,
                0x4565,
                (0x91, 0x64, 0x39, 0xC4, 0x92, 0x5E, 0x46, 0x7B),
            )
            path_ptr = ctypes.c_wchar_p()
            hr = ctypes.windll.shell32.SHGetKnownFolderPath(
                ctypes.byref(folderid_downloads),
                0,
                None,
                ctypes.byref(path_ptr),
            )
            if hr == 0 and path_ptr.value:
                return Path(path_ptr.value)
        except Exception:
            pass
        profile = os.environ.get("USERPROFILE", "").strip()
        if profile:
            return Path(profile) / "Downloads"
    return Path.home() / "Downloads"


def build_full_house_report_downloads_path(
    job_id: str,
    house_name: str | None = None,
) -> Path:
    """Build a deterministic Full House Report PDF path under Downloads."""
    downloads = resolve_windows_downloads_folder()
    downloads.mkdir(parents=True, exist_ok=True)
    if house_name:
        stem = sanitize_windows_filename(house_name)
        filename = f"{stem}-Full-House-Report.pdf"
    else:
        safe_job = sanitize_windows_filename(job_id)
        filename = f"HOT2000-Full-House-Report-{safe_job}.pdf"
    if not filename.lower().endswith(".pdf"):
        filename = f"{filename}.pdf"
    return downloads / filename


def extract_house_name_from_h2k(h2k_path: Path) -> str | None:
    try:
        text = h2k_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    match = re.search(r'<House[^>]*\sname="([^"]+)"', text, re.IGNORECASE)
    if match:
        name = match.group(1).strip()
        return name or None
    return None


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


def list_installed_printers() -> list[str]:
    if win32print is None:
        return []
    try:
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        return [str(info[2]) for info in win32print.EnumPrinters(flags)]
    except Exception:
        return []


def find_installed_pdf_printer() -> str | None:
    for name in list_installed_printers():
        if printer_label_matches_pdf(name):
            return name
    return None


def get_windows_default_printer() -> str:
    if win32print is None:
        return ""
    try:
        return str(win32print.GetDefaultPrinter() or "").strip()
    except Exception:
        return ""


def get_windows_default_printer_logged(
    logger: PrintStepLogger | None = None,
) -> str:
    """Read GetDefaultPrinter with before/after logs for blocking-call diagnostics."""
    if logger:
        logger.step("4_get_default_start", "")
    default_name = get_windows_default_printer()
    if logger:
        logger.step("4_get_default_done", f"name='{default_name}'")
    return default_name


def require_windows_default_pdf_printer(
    logger: PrintStepLogger | None = None,
) -> str:
    """Fail fast when Microsoft Print to PDF is not the Windows default printer."""
    default_name = get_windows_default_printer_logged(logger)
    if logger:
        logger.step("4_default_printer", f"name='{default_name}'")
    if printer_label_matches_pdf(default_name):
        return default_name
    raise PrinterSelectionError(
        "Microsoft Print to PDF must be the Windows default printer on the HOT2000 worker PC.\n"
        f"GetDefaultPrinter() returned: {default_name!r}"
    )


def set_windows_default_printer(name: str) -> bool:
    target = str(name or "").strip()
    if not target or win32print is None:
        return False
    try:
        win32print.SetDefaultPrinter(target)
        return get_windows_default_printer().lower() == target.lower()
    except Exception:
        return False


class PdfDefaultPrinter:
    """Set Microsoft Print to PDF as default only while completing the Print dialog."""

    def __init__(self) -> None:
        self._previous = ""
        self.pdf_printer = ""

    def __enter__(self) -> str:
        self._previous = get_windows_default_printer()
        self.pdf_printer = find_installed_pdf_printer() or ""
        if self.pdf_printer:
            set_windows_default_printer(self.pdf_printer)
        return self.pdf_printer

    def __exit__(self, *_args) -> None:
        if self._previous and self.pdf_printer:
            set_windows_default_printer(self._previous)


OPEN_PRINT_STRATEGIES = frozenset({"toolbar", "menu", "wm", "auto"})
PRINT_OPEN_STRATEGY_BY_ATTEMPT = ("toolbar", "menu", "wm")


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


def find_child_by_class_prefix_recursive(parent: int, prefix: str) -> list[int]:
    """Find child windows whose class name starts with prefix (e.g. Afx:)."""
    matches: list[int] = []

    def callback(hwnd, _):
        try:
            cls = win32gui.GetClassName(hwnd)
            if cls.startswith(prefix):
                matches.append(hwnd)
            win32gui.EnumChildWindows(hwnd, callback, None)
        except Exception:
            pass

    try:
        win32gui.EnumChildWindows(parent, callback, None)
    except Exception:
        pass
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
    """Send Ctrl+P to a HOT2000 HWND via PostMessage — never global keyboard input."""
    if not is_valid_hwnd(hwnd):
        return
    attach_foreground_window(hwnd)
    time.sleep(0.35)
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
                    win32gui.PostMessage(hwnd, win32con.WM_COMMAND, cmd_id, 0)
                    return
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
    """Legacy global keyboard path — not used for opening Print (hits browser focus)."""
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


MAX_PRINT_TARGET_HWNDS = 8


def has_mdi_client_ancestor(hwnd: int, main_hwnd: int) -> bool:
    try:
        current = int(hwnd)
        main_hwnd = int(main_hwnd)
        while current and current != main_hwnd:
            parent = win32gui.GetParent(current)
            if not parent:
                break
            if win32gui.GetClassName(parent) == "MDIClient":
                return True
            current = parent
    except Exception:
        pass
    return False


def score_report_hwnd(hwnd: int, main_hwnd: int) -> int:
    """Score how likely an HWND hosts the Full House Report viewer."""
    try:
        if not is_valid_hwnd(hwnd) or not win32gui.IsWindowVisible(hwnd):
            return 0
        if win32gui.GetClassName(hwnd) == "#32770":
            return 0
        title = (win32gui.GetWindowText(hwnd) or "").strip()
        title_l = title.lower()
        area = window_area(hwnd)
        cls = win32gui.GetClassName(hwnd)
        in_mdi = has_mdi_client_ancestor(hwnd, main_hwnd)
        score = 0
        if int(hwnd) == int(main_hwnd):
            score += 25
        if in_mdi and cls.startswith("Afx:"):
            score += 55
            if (not title or title == "HOT2000") and area >= 60_000:
                score += 40
        if title and title != "HOT2000":
            score += 10
        if "full house" in title_l:
            score += 100
        if "report" in title_l:
            score += 80
        if "standard operating" in title_l or "operating conditions" in title_l:
            score += 140
        elif " soc" in title_l or title_l.endswith("soc"):
            score += 100
        elif "house" in title_l:
            score += 25
        if title_l in {"house", "house report"} and "standard operating" not in title_l:
            score -= 70
        return score
    except Exception:
        return 0


def find_mdi_client_hwnd(main_hwnd: int) -> int | None:
    """Find MDIClient as a direct child of the HOT2000 frame (fast — no full tree walk)."""
    if not is_valid_hwnd(main_hwnd):
        return None
    found: list[int] = []

    def callback(hwnd: int, _) -> None:
        try:
            if win32gui.GetClassName(hwnd) == "MDIClient":
                found.append(int(hwnd))
        except Exception:
            pass

    try:
        win32gui.EnumChildWindows(int(main_hwnd), callback, None)
    except Exception:
        return None
    return found[0] if found else None


def find_print_dialog_by_title() -> int | None:
    """Find the standard Print common dialog by class/title."""
    for title in ("Print", "&Print"):
        try:
            hwnd = win32gui.FindWindow("#32770", title)
            if hwnd and win32gui.IsWindowVisible(hwnd) and is_hot2000_print_dialog(hwnd):
                return int(hwnd)
        except Exception:
            continue
    return None


def peek_loose_print_dialog() -> int | None:
    """Detect the Print common dialog before child controls finish loading."""
    for hwnd in enumerate_top_level_windows():
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            title = (win32gui.GetWindowText(hwnd) or "").strip().lower()
            if title == "print" or title.startswith("print "):
                return int(hwnd)
        except Exception:
            continue
    return None


def peek_print_dialog() -> int | None:
    """Return the Print dialog HWND immediately, without waiting."""
    loose = peek_loose_print_dialog()
    if loose is not None:
        return loose
    return find_print_dialog_by_title() or _scan_visible_print_dialogs()


def wait_for_print_dialog(timeout_s: float = 8.0) -> int | None:
    """Poll quickly after a print action — HOT2000 can exit within seconds."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        found = peek_print_dialog()
        if found:
            return found
        time.sleep(PRINT_DIALOG_POLL_S)
    return None


def _scan_visible_print_dialogs() -> int | None:
    for hwnd in enumerate_top_level_windows():
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            if is_hot2000_print_dialog(hwnd):
                return int(hwnd)
        except Exception:
            continue
    return None


def activate_print_target(hwnd: int, main_hwnd: int | None = None) -> None:
    """Focus a report/MDI target so Print routes to HOT2000, not the browser."""
    focus_print_target(hwnd, main_hwnd, click_center=True)


def focus_print_target(
    hwnd: int,
    main_hwnd: int | None = None,
    *,
    click_center: bool = False,
) -> None:
    """Bring report viewer to foreground; optional center click like manual focus."""
    if not is_valid_hwnd(hwnd):
        return
    hwnd = int(hwnd)
    if is_valid_hwnd(main_hwnd):
        attach_foreground_window(int(main_hwnd))
        time.sleep(0.12)
    attach_foreground_window(hwnd)
    time.sleep(0.15)
    try:
        win32gui.SetFocus(hwnd)
    except Exception:
        pass
    if not click_center:
        return
    try:
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        if right > left and bottom > top:
            click_screen_point((left + right) // 2, (top + bottom) // 2)
            time.sleep(0.12)
    except Exception:
        pass


def hot2000_frame_alive(main_hwnd: int | None = None) -> bool:
    if is_valid_hwnd(main_hwnd):
        return True
    return find_hot2000_main_window() is not None


def hot2000_process_running(main_hwnd: int | None = None) -> bool:
    """True while the HOT2000 main frame HWND is still valid."""
    return hot2000_frame_alive(main_hwnd)


def toolbar_print_indices(button_count: int, *, main_toolbar: bool) -> list[int]:
    """Return safe toolbar button indices to try for Print on a verified main toolbar only."""
    if button_count <= 0:
        return []
    if main_toolbar and button_count >= MIN_MAIN_TOOLBAR_BUTTONS:
        return [index for index in MAIN_TOOLBAR_PRINT_INDICES if index < button_count]
    return []


def post_wm_command(hwnd: int, command_id: int) -> None:
    """Send WM_COMMAND asynchronously — SendMessage can crash 32-bit HOT2000 when re-entrant."""
    if not is_valid_hwnd(hwnd):
        return
    win32gui.PostMessage(hwnd, win32con.WM_COMMAND, command_id, 0)


def safe_post_print_command(hwnd: int) -> None:
    """Post File→Print WM_COMMAND — never confuse with CMD_EXIT."""
    assert CMD_FILE_PRINT != CMD_EXIT
    post_wm_command(hwnd, CMD_FILE_PRINT)


def raise_hot2000_exited_after_print(
    strategy: str,
    *,
    main_hwnd: int | None,
    toolbar_hwnd: int | None = None,
    toolbar_button_count: int | None = None,
    clicked_index: int | None = None,
    screen_coords: tuple[int, int] | None = None,
    foreground_before: int | None = None,
    foreground_after: int | None = None,
    print_dialog: int | None = None,
    logger: PrintStepLogger | None = None,
) -> None:
    """Stop all automation when HOT2000 disappears after a Print attempt."""
    if logger:
        logger.step("CRASH", f"strategy={strategy}")
        logger.step("CRASH", "hot2000_alive=False")
        logger.step("CRASH", f"print_dialog={print_dialog}")
    details = [
        f"strategy={strategy}",
        f"main_hwnd={main_hwnd}",
        f"toolbar_hwnd={toolbar_hwnd}",
        f"toolbar_button_count={toolbar_button_count}",
        f"clicked_index={clicked_index}",
        f"clicked_screen_coords={screen_coords}",
        f"foreground_hwnd_before_click={foreground_before}",
        f"foreground_hwnd_after_click={foreground_after}",
        f"print_dialog_appeared={print_dialog is not None}",
        f"hot2000_process_still_exists={hot2000_process_running(main_hwnd)}",
    ]
    raise Hot2000ExitedAfterPrintError(
        "HOT2000 Desktop exited immediately after attempting to open Print.\n"
        + "\n".join(details)
    )


def check_hot2000_alive_after_print(
    strategy: str,
    main_hwnd: int | None,
    logger: PrintStepLogger | None = None,
    **kwargs,
) -> None:
    """Raise if HOT2000 exited after a Print-opening strategy."""
    if hot2000_process_running(main_hwnd):
        return
    raise_hot2000_exited_after_print(strategy, main_hwnd=main_hwnd, logger=logger, **kwargs)


def toolbar_button_count(toolbar_hwnd: int) -> int:
    try:
        return int(win32gui.SendMessage(toolbar_hwnd, TB_BUTTONCOUNT, 0, 0))
    except Exception:
        return 0


def enumerate_main_toolbar_candidates(main_hwnd: int) -> list[dict]:
    """Collect ToolbarWindow32 candidates under the HOT2000 main frame only."""
    if not is_valid_hwnd(main_hwnd):
        return []
    main_hwnd = int(main_hwnd)
    seen: set[int] = set()
    candidates: list[dict] = []

    def add_toolbar(toolbar_hwnd: int, parent_hwnd: int, class_name: str) -> None:
        if toolbar_hwnd in seen:
            return
        seen.add(toolbar_hwnd)
        count = toolbar_button_count(toolbar_hwnd)
        try:
            left, top, right, bottom = win32gui.GetWindowRect(toolbar_hwnd)
        except Exception:
            left = top = right = bottom = 0
        candidates.append(
            {
                "hwnd": toolbar_hwnd,
                "class": class_name,
                "buttons": count,
                "parent": parent_hwnd,
                "rect": (left, top, right, bottom),
            }
        )

    for rebar in find_child_by_class_recursive(main_hwnd, "ReBarWindow32"):
        for toolbar_hwnd in find_child_by_class_recursive(rebar, "ToolbarWindow32"):
            add_toolbar(toolbar_hwnd, rebar, "ToolbarWindow32")
    for class_name in ("ToolbarWindow32", "ToolbarWindow20"):
        for toolbar_hwnd in find_child_by_class_recursive(main_hwnd, class_name):
            try:
                parent_hwnd = int(win32gui.GetParent(toolbar_hwnd))
            except Exception:
                parent_hwnd = 0
            add_toolbar(toolbar_hwnd, parent_hwnd, class_name)
    return candidates


def score_main_toolbar_candidate(candidate: dict, main_hwnd: int) -> int:
    """Prefer the main-frame ReBar toolbar with at least six buttons."""
    score = 0
    if candidate["buttons"] < MIN_MAIN_TOOLBAR_BUTTONS:
        return -1
    parent = candidate["parent"]
    try:
        parent_class = win32gui.GetClassName(parent)
    except Exception:
        parent_class = ""
    if parent_class == "ReBarWindow32":
        score += 60
        try:
            if int(win32gui.GetParent(parent)) == main_hwnd:
                score += 100
        except Exception:
            pass
    if candidate["buttons"] == MIN_MAIN_TOOLBAR_BUTTONS:
        score += 30
    left, top, right, bottom = candidate["rect"]
    area = max(0, right - left) * max(0, bottom - top)
    score += min(area // 1000, 20)
    return score


def find_hot2000_main_toolbar(
    main_hwnd: int,
    logger: PrintStepLogger | None = None,
) -> int | None:
    """Identify the HOT2000 main toolbar (>= 6 buttons) under the main frame only."""
    if not is_valid_hwnd(main_hwnd):
        return None
    main_hwnd = int(main_hwnd)
    candidates = enumerate_main_toolbar_candidates(main_hwnd)
    for candidate in candidates:
        left, top, right, bottom = candidate["rect"]
        if logger:
            logger.step(
                "1_toolbar_candidate",
                f"hwnd={candidate['hwnd']} class={candidate['class']!r} "
                f"buttons={candidate['buttons']} parent={candidate['parent']} "
                f"rect=({left},{top},{right},{bottom})",
            )
    ranked = [
        (score_main_toolbar_candidate(candidate, main_hwnd), candidate)
        for candidate in candidates
    ]
    ranked = [(score, candidate) for score, candidate in ranked if score >= 0]
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    selected = ranked[0][1]
    if logger:
        logger.step(
            "1_toolbar_selected",
            f"hwnd={selected['hwnd']} buttons={selected['buttons']}",
        )
    return int(selected["hwnd"])


def click_verified_hot2000_main_print(
    main_hwnd: int,
    logger: PrintStepLogger | None = None,
) -> bool:
    """Click index 5 on the verified HOT2000 main toolbar exactly once."""
    if not is_valid_hwnd(main_hwnd):
        return False
    main_hwnd = int(main_hwnd)
    toolbar_hwnd = find_hot2000_main_toolbar(main_hwnd, logger)
    if toolbar_hwnd is None:
        return False
    button_count = toolbar_button_count(toolbar_hwnd)
    if button_count < MIN_MAIN_TOOLBAR_BUTTONS:
        return False
    index = MAIN_TOOLBAR_PRINT_INDICES[0]
    rect = _RECT()
    try:
        if not win32gui.SendMessage(
            toolbar_hwnd,
            TB_GETITEMRECT,
            index,
            ctypes.byref(rect),
        ):
            return False
    except Exception:
        return False
    if rect.right <= rect.left or rect.bottom <= rect.top:
        return False
    cx = (rect.left + rect.right) // 2
    cy = (rect.top + rect.bottom) // 2
    sx, sy = client_to_screen(toolbar_hwnd, cx, cy)
    if logger:
        logger.step("2_before_click", f"foreground={get_foreground_hwnd()}")
        logger.step(
            "2_click_print",
            f"toolbar={toolbar_hwnd} index={index} "
            f"rect=({rect.left},{rect.top},{rect.right},{rect.bottom}) "
            f"screen=({sx},{sy})",
        )
    attach_foreground_window(main_hwnd)
    time.sleep(0.35)
    foreground_before = get_foreground_hwnd()
    if not click_screen_point(sx, sy):
        return False
    foreground_after = get_foreground_hwnd()
    print_dialog = wait_for_print_dialog(timeout_s=PRINT_OPEN_WAIT_S)
    alive = hot2000_process_running(main_hwnd)
    if logger:
        logger.step(
            "2_after_click",
            f"hot2000_alive={alive} foreground_before={foreground_before} "
            f"foreground_after={foreground_after} print_dialog={print_dialog}",
        )
    if not alive:
        raise_hot2000_exited_after_print(
            "toolbar",
            main_hwnd=main_hwnd,
            toolbar_hwnd=toolbar_hwnd,
            toolbar_button_count=button_count,
            clicked_index=index,
            screen_coords=(sx, sy),
            foreground_before=foreground_before,
            foreground_after=foreground_after,
            print_dialog=print_dialog,
            logger=logger,
        )
    if print_dialog and logger:
        logger.step("3_print_dialog", f"hwnd={print_dialog}")
    return print_dialog is not None


def open_print_dialog_safe_strategies(
    main_hwnd: int | None,
    logger: PrintStepLogger | None = None,
    open_strategy: str = "auto",
) -> int | None:
    """Open Print using verified main toolbar, then File→Print, then WM_COMMAND."""
    strategy = open_strategy if open_strategy in OPEN_PRINT_STRATEGIES else "auto"
    existing = peek_print_dialog()
    if existing:
        if logger:
            logger.step("3_print_dialog", f"Already visible hwnd={existing}")
        return existing

    if not is_valid_hwnd(main_hwnd):
        main_hwnd = find_hot2000_main_window()
    if not is_valid_hwnd(main_hwnd):
        return None
    main_hwnd = int(main_hwnd)

    if logger:
        logger.step("1_main", f"hwnd={main_hwnd} strategy={strategy}")

    ensure_hot2000_foreground(main_hwnd)
    steps = (
        PRINT_OPEN_STRATEGY_BY_ATTEMPT if strategy == "auto" else (strategy,)
    )

    for step in steps:
        if step == "toolbar":
            if click_verified_hot2000_main_print(main_hwnd, logger):
                return peek_print_dialog() or wait_for_print_dialog(timeout_s=2.0)
            check_hot2000_alive_after_print("toolbar", main_hwnd, logger=logger)
            dialog = wait_for_print_dialog(timeout_s=3.0)
            if dialog:
                if logger:
                    logger.step("3_print_dialog", f"hwnd={dialog} strategy=toolbar")
                return dialog
            check_hot2000_alive_after_print("toolbar", main_hwnd, logger=logger)
            continue

        if step == "menu":
            if logger:
                logger.step("2_file_print_menu", "Attempt File → Print")
            if invoke_file_print_menu(main_hwnd):
                dialog = wait_for_print_dialog(timeout_s=8.0)
                if dialog:
                    if logger:
                        logger.step("3_print_dialog", f"hwnd={dialog} strategy=menu")
                    return dialog
            check_hot2000_alive_after_print("menu", main_hwnd, logger=logger)
            continue

        if step == "wm":
            if logger:
                logger.step("2_wm_command", f"PostMessage WM_COMMAND {CMD_FILE_PRINT}")
            safe_post_print_command(main_hwnd)
            dialog = wait_for_print_dialog(timeout_s=6.0)
            if dialog:
                if logger:
                    logger.step("3_print_dialog", f"hwnd={dialog} strategy=wm_command")
                return dialog
            check_hot2000_alive_after_print("wm_command", main_hwnd, logger=logger)

    return None


def try_open_print_for_target(
    hwnd: int,
    main_hwnd: int | None = None,
    logger: PrintStepLogger | None = None,
    *,
    open_strategy: str = "auto",
) -> int | None:
    """Open Print via verified main toolbar → File→Print → WM_COMMAND only."""
    main_ref = int(main_hwnd) if is_valid_hwnd(main_hwnd) else None
    if main_ref is None and is_valid_hwnd(hwnd):
        main_ref = int(hwnd)
    if main_ref is None:
        return None
    if logger:
        logger.step(
            "2_try_target",
            f"main_hwnd={main_ref} report_hwnd={hwnd} strategy={open_strategy}",
        )
    return open_print_dialog_safe_strategies(
        main_ref,
        logger,
        open_strategy=open_strategy,
    )


def collect_print_diagnostics_fast(
    report_hwnd: int | None,
    main_hwnd: int | None,
    targets: list[int] | None = None,
    *,
    passed_report_hwnd: int | None = None,
    passed_main_hwnd: int | None = None,
) -> str:
    """Lightweight failure text — must not walk the entire desktop control tree."""
    passed_report = passed_report_hwnd if passed_report_hwnd is not None else report_hwnd
    passed_main = passed_main_hwnd if passed_main_hwnd is not None else main_hwnd
    lines = [
        f"report_hwnd={report_hwnd!r} main_hwnd={main_hwnd!r}",
        f"passed_report_hwnd={passed_report!r} passed_main_hwnd={passed_main!r}",
        f"passed_report_valid={is_valid_hwnd(passed_report)!r} "
        f"passed_main_valid={is_valid_hwnd(passed_main)!r}",
        f"hot2000_running={bool(find_hot2000_main_window())!r}",
        f"targets_tried={targets!r}",
    ]
    for hwnd in (targets or [])[:6]:
        lines.append(f"  {describe_window(hwnd)}")
    toolbars = find_toolbar_hwnds(targets or [])
    lines.append(f"toolbars_on_targets={len(toolbars)}")
    quick = find_print_dialog_by_title()
    if quick:
        lines.append(f"FindWindow(Print)={describe_window(quick)}")
    visible = find_print_dialog(timeout_s=0.5)
    if visible:
        lines.append(f"visible_print_dialog={describe_window(visible)}")
    return "\n".join(lines)


def enumerate_hot2000_surfaces(main_hwnd: int) -> list[int]:
    """Collect HOT2000 main, MDIClient, and report Afx surfaces (not every control)."""
    if not is_valid_hwnd(main_hwnd):
        return []
    main_hwnd = int(main_hwnd)
    seen: set[int] = set()
    surfaces: list[int] = []

    def add(hwnd: int | None) -> None:
        if not is_valid_hwnd(hwnd):
            return
        value = int(hwnd)
        if value in seen:
            return
        seen.add(value)
        surfaces.append(value)

    add(main_hwnd)
    mdi_client = find_mdi_client_hwnd(main_hwnd)
    if mdi_client:
        add(mdi_client)
        for child in find_child_by_class_prefix_recursive(mdi_client, "Afx:"):
            add(child)
        try:
            def immediate(child: int, _) -> None:
                add(child)

            win32gui.EnumChildWindows(mdi_client, immediate, None)
        except Exception:
            pass
    try:
        popup = win32gui.GetLastActivePopup(main_hwnd)
        if popup and int(popup) != main_hwnd:
            add(popup)
    except Exception:
        pass
    return surfaces


def load_print_target_hwnds_file(path: Path | None) -> list[int]:
    if path is None or not path.is_file():
        return []
    handles: list[int] = []
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            token = line.strip().split("#", 1)[0].strip()
            if token.isdigit():
                handles.append(int(token))
    except OSError:
        return []
    return handles


def is_hot2000_main_candidate(title: str, class_name: str) -> bool:
    """True only for the MFC HOT2000 main frame — not Notepad or other apps."""
    cls = (class_name or "").strip()
    title_l = (title or "").strip().lower()
    if cls in ("#32770", "Notepad"):
        return False
    if " - notepad" in title_l or title_l.endswith("notepad"):
        return False
    if not cls.startswith("Afx:"):
        return False
    return "hot2000" in title_l or cls.lower().startswith("afx")


def score_hot2000_main(hwnd: int) -> int:
    """Score how likely an HWND is the HOT2000 main frame (32-bit helper discovery)."""
    try:
        if not is_valid_hwnd(hwnd) or win32gui.GetParent(hwnd):
            return 0
        cls = win32gui.GetClassName(hwnd)
        title = win32gui.GetWindowText(hwnd)
        if not is_hot2000_main_candidate(title, cls):
            return 0

        title_l = title.lower()
        score = 0
        if "hot2000" in title_l:
            score += 120
        if title_l.startswith("hot2000"):
            score += 40
        if cls.startswith("Afx:"):
            score += 80
        elif cls.startswith("Afx"):
            score += 60
        if "hot2000" in cls.lower():
            score += 70
        if title:
            score += 10
        if win32gui.IsWindowVisible(hwnd):
            score += 25
        else:
            score -= 200
        area = window_area(hwnd)
        if area >= 200_000:
            score += 40
        elif area >= 50_000:
            score += 20
        elif area >= 10_000:
            score += 10
        return score
    except Exception:
        return 0


def find_hot2000_main_window() -> int | None:
    """Find the HOT2000 main frame when passed HWNDs from the 64-bit worker are stale."""
    best_hwnd: int | None = None
    best_score = 0
    for hwnd in enumerate_top_level_windows():
        score = score_hot2000_main(hwnd)
        if score > best_score:
            best_score = score
            best_hwnd = hwnd
    if best_hwnd and best_score >= 80:
        return best_hwnd
    return None


def resolve_print_hwnds(
    report_hwnd: int | None,
    main_hwnd: int | None,
    extra_hwnds: list[int] | None = None,
) -> tuple[int | None, int | None]:
    """Refresh report/main HWNDs from live windows and print-targets.txt."""
    resolved_main = int(main_hwnd) if is_valid_hwnd(main_hwnd) else None
    resolved_report = int(report_hwnd) if is_valid_hwnd(report_hwnd) else None

    for hwnd in extra_hwnds or []:
        if not is_valid_hwnd(hwnd):
            continue
        value = int(hwnd)
        main_score = score_hot2000_main(value)
        if resolved_main is None and main_score >= 80:
            resolved_main = value
            continue
        if resolved_main is None:
            try:
                ga_root = getattr(win32con, "GA_ROOT", 2)
                root = win32gui.GetAncestor(value, ga_root)
                if is_valid_hwnd(root) and score_hot2000_main(root) >= 80:
                    resolved_main = int(root)
            except Exception:
                pass
        if resolved_main is not None:
            report_score = score_report_hwnd(value, resolved_main)
            if report_score >= 40 and (
                resolved_report is None or report_score > score_report_hwnd(resolved_report, resolved_main)
            ):
                resolved_report = value

    discovered_main = find_hot2000_main_window()
    if discovered_main and resolved_main is None:
        resolved_main = discovered_main

    if resolved_main is not None and resolved_report is None:
        child = find_child_report_hwnd(resolved_main)
        if child is not None:
            resolved_report = child

    if resolved_main is None and resolved_report is not None:
        try:
            ga_root = getattr(win32con, "GA_ROOT", 2)
            root = win32gui.GetAncestor(resolved_report, ga_root)
            if is_valid_hwnd(root) and score_hot2000_main(root) >= 80:
                resolved_main = int(root)
        except Exception:
            pass

    return resolved_report, resolved_main


def resolve_print_context(
    report_hwnd: int | None,
    main_hwnd: int | None,
    extra_hwnds: list[int] | None = None,
) -> tuple[int | None, int | None, list[int]]:
    """Resolve HWNDs and return ranked print targets for the 32-bit helper."""
    resolved_report, resolved_main = resolve_print_hwnds(
        report_hwnd,
        main_hwnd,
        extra_hwnds,
    )
    targets = collect_print_target_hwnds(resolved_report, resolved_main, extra_hwnds)
    if not targets:
        discovered = find_hot2000_main_window()
        if discovered:
            targets = collect_print_target_hwnds(resolved_report, discovered, extra_hwnds)
            if resolved_main is None:
                resolved_main = discovered
    if not targets:
        targets = find_hot2000_top_level_windows()
    return resolved_report, resolved_main, targets


def collect_print_target_hwnds(
    report_hwnd: int | None,
    main_hwnd: int | None,
    extra_hwnds: list[int] | None = None,
) -> list[int]:
    """Return HWNDs most likely to host the report toolbar and Print command."""
    main = int(main_hwnd) if is_valid_hwnd(main_hwnd) else None
    if main is None:
        main = find_hot2000_main_window()
    ranked: list[tuple[int, int]] = []
    seen: set[int] = set()

    def consider(hwnd: int | None) -> None:
        if not is_valid_hwnd(hwnd) or main is None:
            return
        value = int(hwnd)
        if value in seen:
            return
        score = score_report_hwnd(value, main)
        if score <= 0:
            return
        seen.add(value)
        ranked.append((score, value))

    if main is not None:
        for hwnd in enumerate_hot2000_surfaces(main):
            consider(hwnd)
    consider(report_hwnd)
    for hwnd in extra_hwnds or []:
        consider(hwnd)

    ranked.sort(reverse=True)
    candidates = [hwnd for _, hwnd in ranked[:MAX_PRINT_TARGET_HWNDS]]

    if main is not None and main not in candidates:
        candidates.append(main)
    if is_valid_hwnd(report_hwnd):
        report = int(report_hwnd)
        if report not in candidates:
            candidates.insert(0, report)

    if not candidates and main is not None:
        candidates = [main]
    elif not candidates and is_valid_hwnd(report_hwnd):
        candidates = [int(report_hwnd)]

    return candidates[:MAX_PRINT_TARGET_HWNDS]


def attach_foreground_window(hwnd: int) -> None:
    """Bring hwnd to the foreground using AttachThreadInput when needed."""
    if not is_valid_hwnd(hwnd):
        return
    allow_set_foreground_window()
    try:
        user32 = ctypes.windll.user32
        foreground = user32.GetForegroundWindow()
        fg_thread = win32gui.GetWindowThreadProcessId(foreground)[0]
        target_thread = win32gui.GetWindowThreadProcessId(hwnd)[0]
        attached = False
        if fg_thread and target_thread and fg_thread != target_thread:
            user32.AttachThreadInput(fg_thread, target_thread, True)
            attached = True
        win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
        win32gui.SetForegroundWindow(hwnd)
        if attached:
            user32.AttachThreadInput(fg_thread, target_thread, False)
    except Exception:
        focus_window(hwnd)


def get_foreground_hwnd() -> int:
    try:
        return int(ctypes.windll.user32.GetForegroundWindow())
    except Exception:
        return 0


def is_hot2000_window(hwnd: int) -> bool:
    """True when hwnd belongs to HOT2000 Desktop (not a browser tab)."""
    if not is_valid_hwnd(hwnd):
        return False
    try:
        title = (win32gui.GetWindowText(hwnd) or "").strip().lower()
        cls = win32gui.GetClassName(hwnd)
        if "hot2000" in title:
            return True
        if cls.startswith("Afx:") and window_area(hwnd) >= 20_000:
            return True
        ga_root = getattr(win32con, "GA_ROOT", 2)
        root = win32gui.GetAncestor(hwnd, ga_root)
        if root and root != hwnd:
            return is_hot2000_window(root)
        parent = win32gui.GetParent(hwnd)
        if parent and parent != hwnd:
            return is_hot2000_window(parent)
    except Exception:
        pass
    return False


def foreground_is_hot2000() -> bool:
    fg = get_foreground_hwnd()
    return is_hot2000_window(fg) if fg else False


def ensure_hot2000_foreground(main_hwnd: int | None) -> None:
    """Bring HOT2000 to the foreground so automation never hits the browser."""
    if foreground_is_hot2000():
        return
    if is_valid_hwnd(main_hwnd):
        attach_foreground_window(int(main_hwnd))
        time.sleep(0.45)


def type_text_to_hwnd(hwnd: int, text: str, delay_s: float = 0.05) -> None:
    """Type text into a specific control via WM_CHAR (not global keyboard)."""
    if not is_valid_hwnd(hwnd):
        return
    try:
        win32gui.SetFocus(hwnd)
    except Exception:
        pass
    for ch in text:
        try:
            win32gui.PostMessage(hwnd, win32con.WM_CHAR, ord(ch), 0)
            time.sleep(delay_s)
        except Exception:
            pass


def type_keyboard_text(text: str, delay_s: float = 0.05) -> None:
    """Deprecated: global keyboard hits whichever app has focus (e.g. browser Ctrl+P)."""
    _ = (text, delay_s)


def focus_print_dialog_printer_list(dialog_hwnd: int) -> None:
    focus_modal_dialog(dialog_hwnd)
    time.sleep(0.25)
    for class_name in ("SHELLDLL_DefView", "SysListView32", "ListBox"):
        for hwnd in find_child_by_class_recursive(dialog_hwnd, class_name):
            try:
                win32gui.SetFocus(hwnd)
                left, top, right, bottom = win32gui.GetWindowRect(hwnd)
                click_screen_point((left + right) // 2, (top + bottom) // 2)
                return
            except Exception:
                continue


def click_pdf_printer_rows_mouse(dialog_hwnd: int) -> bool:
    for class_name in ("SHELLDLL_DefView", "SysListView32", "ListBox"):
        for hwnd in find_child_by_class_recursive(dialog_hwnd, class_name):
            try:
                left, top, right, bottom = win32gui.GetWindowRect(hwnd)
                height = max(bottom - top, 1)
                width = max(right - left, 1)
                x = left + width // 2
                for frac in (0.34, 0.44, 0.54, 0.24, 0.64):
                    y = top + int(height * frac)
                    click_screen_point(x, y)
                    time.sleep(0.12)
                return True
            except Exception:
                continue
    return False


def select_pdf_printer_via_keyboard(dialog_hwnd: int) -> None:
    """List type-ahead sent to the printer list control, not the foreground window."""
    focus_print_dialog_printer_list(dialog_hwnd)
    time.sleep(0.35)
    for class_name in ("SysListView32", "ListBox", "SHELLDLL_DefView"):
        for hwnd in find_child_by_class_recursive(dialog_hwnd, class_name):
            type_text_to_hwnd(hwnd, "Microsoft Print to PDF", delay_s=0.06)
            time.sleep(0.35)
            return


class PrintStepLogger:
    """Append one line per manual automation step for worker diagnostics."""

    def __init__(self, log_path: Path | None) -> None:
        self.log_path = log_path
        if log_path is not None:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text("", encoding="utf-8")

    def step(self, name: str, detail: str = "") -> None:
        line = f"{time.strftime('%H:%M:%S')} [{name}] {detail}".strip()
        if self.log_path is not None:
            with self.log_path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
        else:
            print(line, file=sys.stderr)


def find_toolbar_hwnds(host_hwnds: list[int]) -> list[int]:
    toolbars: list[int] = []
    seen: set[int] = set()

    def add_toolbar(toolbar_hwnd: int | None) -> None:
        if not toolbar_hwnd or toolbar_hwnd in seen:
            return
        seen.add(toolbar_hwnd)
        toolbars.append(toolbar_hwnd)

    for host in host_hwnds:
        if not is_valid_hwnd(host):
            continue
        for rebar in find_child_by_class_recursive(host, "ReBarWindow32"):
            for toolbar_hwnd in find_child_by_class_recursive(rebar, "ToolbarWindow32"):
                add_toolbar(toolbar_hwnd)
        for class_name in ("ToolbarWindow32", "ToolbarWindow20"):
            for toolbar_hwnd in find_child_by_class_recursive(host, class_name):
                add_toolbar(toolbar_hwnd)
    return toolbars


def find_hot2000_top_level_windows() -> list[int]:
    """Find visible HOT2000 frame windows when passed HWNDs are stale."""
    main = find_hot2000_main_window()
    if main is not None:
        targets = collect_print_target_hwnds(None, main)
        if targets:
            return targets
        return [main]

    matches: list[int] = []
    for hwnd in enumerate_top_level_windows():
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            title = (win32gui.GetWindowText(hwnd) or "").strip()
            cls = win32gui.GetClassName(hwnd)
            title_l = title.lower()
            if "hot2000" in title_l or (
                cls.startswith("Afx:") and window_area(hwnd) >= 40_000
            ):
                matches.append(hwnd)
        except Exception:
            continue
    matches.sort(key=window_area, reverse=True)
    return matches


def click_hot2000_main_toolbar_print(
    main_hwnd: int,
    logger: PrintStepLogger | None = None,
) -> bool:
    """Click Print (index 5) on the verified HOT2000 main toolbar only."""
    return click_verified_hot2000_main_print(main_hwnd, logger)


def click_report_toolbar_print_button(
    report_hwnd: int,
    extra_hosts: list[int] | None = None,
    main_hwnd: int | None = None,
    logger: PrintStepLogger | None = None,
) -> bool:
    """Deprecated: report toolbars are not targeted. Use verified main toolbar only."""
    target_main = main_hwnd if is_valid_hwnd(main_hwnd) else report_hwnd
    if not is_valid_hwnd(target_main):
        return False
    return click_verified_hot2000_main_print(int(target_main), logger)


def send_file_print_command(report_hwnd: int, main_hwnd: int | None = None) -> bool:
    """Open Print via File → Print or WM_COMMAND on the HOT2000 main frame only."""
    target = int(main_hwnd) if is_valid_hwnd(main_hwnd) else int(report_hwnd)
    if not is_valid_hwnd(target):
        return False
    if invoke_file_print_menu(target):
        return True
    safe_post_print_command(target)
    time.sleep(0.8)
    return bool(find_print_dialog(timeout_s=3))


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
    logger: PrintStepLogger | None = None,
) -> int | None:
    """Open the Windows Print dialog using verified main-toolbar strategies only."""
    resolved_report, resolved_main = resolve_print_hwnds(report_hwnd, main_hwnd)
    if logger and resolved_report:
        logger.step("1_report", f"hwnd={resolved_report}")
    return open_print_dialog_safe_strategies(resolved_main, logger)


def resolve_report_print_hwnd(report_hwnd: int | None, main_hwnd: int | None) -> int:
    for hwnd in (report_hwnd, main_hwnd):
        if is_valid_hwnd(hwnd):
            return int(hwnd)
    raise RuntimeError("No valid report or main HWND for printing.")


def find_child_report_hwnd(main_hwnd: int) -> int | None:
    if not is_valid_hwnd(main_hwnd):
        return None
    main_hwnd = int(main_hwnd)
    best_score = 0
    best_hwnd: int | None = None
    for hwnd in enumerate_hot2000_surfaces(main_hwnd):
        if hwnd == main_hwnd:
            continue
        score = score_report_hwnd(hwnd, main_hwnd)
        if score > best_score:
            best_score = score
            best_hwnd = hwnd
    if best_hwnd and best_score >= 40:
        return best_hwnd
    for child in find_child_by_class_recursive(main_hwnd, "AfxFrameOrView42"):
        return child
    for child in find_child_by_class_recursive(main_hwnd, "AfxFrameOrView140"):
        return child
    for child_hwnd in find_child_by_class_prefix_recursive(main_hwnd, "Afx:"):
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
        found = peek_print_dialog()
        if found:
            return found
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
    """Legacy list-view selection — not used in the live print path (can hang)."""
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
    """Physically click the Print button once (legacy wrapper)."""
    return click_print_dialog_button_once(dialog_hwnd)


def click_print_dialog_button_once(
    dialog_hwnd: int,
    logger: PrintStepLogger | None = None,
    *,
    click_start: float | None = None,
) -> bool:
    """Physically click the visible Print button exactly once."""
    started = click_start if click_start is not None else time.time()
    if logger:
        logger.step("5_print_button_start", "")
    if not is_valid_hwnd(dialog_hwnd):
        if logger:
            logger.step("5_print_button", "invalid dialog hwnd")
            logger.step(
                "5_click_print",
                f"clicked=False elapsed={time.time() - started:.2f}s",
            )
        return False
    focus_modal_dialog(dialog_hwnd)
    button_hwnd = find_child_button(dialog_hwnd, ("&Print", "Print"))
    if not button_hwnd:
        try:
            button_hwnd = win32gui.GetDlgItem(dialog_hwnd, 1)
        except Exception:
            button_hwnd = None
    if not button_hwnd or not is_valid_hwnd(button_hwnd):
        if logger:
            logger.step("5_print_button", "visible Print button not found")
            logger.step(
                "5_click_print",
                f"clicked=False elapsed={time.time() - started:.2f}s",
            )
        return False
    try:
        left, top, right, bottom = win32gui.GetWindowRect(button_hwnd)
    except Exception:
        if logger:
            logger.step("5_print_button", f"hwnd={button_hwnd} rect=unavailable")
            logger.step(
                "5_click_print",
                f"clicked=False elapsed={time.time() - started:.2f}s",
            )
        return False
    if logger:
        logger.step(
            "5_print_button",
            f"hwnd={button_hwnd} rect=({left},{top},{right},{bottom})",
        )
    clicked = click_screen_point((left + right) // 2, (top + bottom) // 2)
    if logger:
        logger.step(
            "5_click_print",
            f"clicked={clicked} elapsed={time.time() - started:.2f}s",
        )
    return clicked


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
    timeout_s: float = SAVE_DIALOG_WAIT_AFTER_PRINT_S,
    logger: PrintStepLogger | None = None,
) -> bool:
    """Click Print once in the Print dialog, then wait for Save Print Output As."""
    if pdf_ready(output_path):
        return True
    click_start = time.time()
    focus_modal_dialog(print_dialog_hwnd)
    if not click_print_dialog_button_once(
        print_dialog_hwnd,
        logger,
        click_start=click_start,
    ):
        return False
    wait_start = time.time()
    if logger:
        logger.step("6_wait_save_dialog", f"timeout={timeout_s:.0f}")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if pdf_ready(output_path):
            return True
        save_hwnd = find_save_pdf_dialog_fast()
        if save_hwnd:
            if logger:
                logger.step(
                    "6_save_dialog",
                    f"hwnd={save_hwnd} elapsed={time.time() - wait_start:.2f}s",
                )
            return True
        time.sleep(0.1)
    return pdf_ready(output_path)


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


_SAVE_PDF_DIALOG_TITLES = frozenset(
    {
        "save print output as",
        "save as",
    }
)


def _save_pdf_dialog_title_matches(title: str) -> bool:
    normalized = normalize_label(title)
    return normalized in _SAVE_PDF_DIALOG_TITLES


def find_save_pdf_dialog_fast() -> int | None:
    """Locate Save Print Output As using FindWindow and top-level title scan only."""
    if win32gui is None:
        return None
    for exact_title in ("Save Print Output As", "Save As"):
        try:
            hwnd = win32gui.FindWindow("#32770", exact_title)
            if hwnd and win32gui.IsWindowVisible(hwnd):
                return int(hwnd)
        except Exception:
            continue
    for hwnd in enumerate_top_level_windows():
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue
            if win32gui.GetClassName(hwnd) != "#32770":
                continue
            title = (win32gui.GetWindowText(hwnd) or "").strip()
            if _save_pdf_dialog_title_matches(title):
                return int(hwnd)
        except Exception:
            continue
    return None


def find_save_pdf_dialog_deep_diagnostic() -> int | None:
    """Deep recursive Save dialog scan — offline diagnostics only, never in live print flow."""
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


def wait_for_save_pdf_dialog(
    timeout_s: float = SAVE_DIALOG_WAIT_AFTER_PRINT_S,
    logger: PrintStepLogger | None = None,
    output_path: Path | None = None,
) -> int | None:
    wait_start = time.time()
    if logger:
        logger.step("6_wait_save_dialog", f"timeout={timeout_s:.0f}")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if output_path is not None and pdf_ready(output_path):
            return None
        found = find_save_pdf_dialog_fast()
        if found:
            if logger:
                logger.step(
                    "6_save_dialog",
                    f"hwnd={found} elapsed={time.time() - wait_start:.2f}s",
                )
            return found
        time.sleep(0.1)
    return None


def validate_save_filename_only(filename: str) -> str:
    """Ensure only a bare filename is written to the File name field."""
    raw = (filename or "").strip()
    for sep in ("\\", "/", ":"):
        if sep in raw:
            raise SaveFilenameTargetingError(
                "Save filename must not contain path separators or a drive colon: "
                f"{raw!r}"
            )
    cleaned = sanitize_windows_filename(raw)
    for sep in ("\\", "/", ":"):
        if sep in cleaned:
            raise SaveFilenameTargetingError(
                "Save filename must not contain path separators or a drive colon: "
                f"{cleaned!r}"
            )
    return cleaned


def split_save_output_path(output_path: Path) -> tuple[Path, str]:
    """Split an output PDF path into target directory and bare filename."""
    verified = validate_full_pdf_output_path(output_path)
    return verified.parent, verified.name


def validate_full_pdf_output_path(output_path: Path) -> Path:
    """Validate the absolute Downloads PDF path used for filesystem verification."""
    resolved = output_path.resolve()
    if not resolved.is_absolute():
        raise SaveFilenameTargetingError(
            f"PDF output path must be absolute: {resolved!r}"
        )
    filename = validate_save_filename_only(resolved.name)
    if not filename.lower().endswith(".pdf"):
        raise SaveFilenameTargetingError(
            f"PDF output filename must end with .pdf: {filename!r}"
        )
    parent = resolved.parent
    downloads = resolve_windows_downloads_folder().resolve()
    if parent != downloads and parent.name.lower() != "downloads":
        raise SaveFilenameTargetingError(
            f"PDF output parent must be the Downloads folder, got {parent!r}"
        )
    return parent / filename


def looks_like_shell_rename_error(title: str, body: str = "") -> bool:
    """Diagnostic helper — body text confirms the expected Shell Rename message."""
    title_l = normalize_label(title)
    blob = normalize_label(f"{title} {body}")
    if title_l != "rename":
        return False
    return (
        "file name can't contain" in blob
        or "can't contain any of the following" in blob
    )


def is_shell_rename_dialog_hwnd(hwnd: int | None) -> bool:
    """True for visible #32770 dialogs titled Rename during PDF save recovery."""
    if not is_valid_hwnd(hwnd):
        return False
    try:
        if not win32gui.IsWindowVisible(hwnd):
            return False
        if win32gui.GetClassName(hwnd) != "#32770":
            return False
        title = (win32gui.GetWindowText(hwnd) or "").strip()
        return title == "Rename"
    except Exception:
        return False


def dialog_immediate_static_text(hwnd: int) -> str:
    """Read direct Static child text only — no deep desktop recursion."""
    parts: list[str] = []

    def callback(child: int, _) -> None:
        try:
            if win32gui.GetClassName(child) == "Static":
                text = (win32gui.GetWindowText(child) or "").strip()
                if text:
                    parts.append(text)
        except Exception:
            pass

    try:
        win32gui.EnumChildWindows(hwnd, callback, None)
    except Exception:
        pass
    return " ".join(parts)


def is_save_pdf_dialog_hwnd(hwnd: int | None) -> bool:
    """True when hwnd is a visible Save Print Output As common dialog."""
    if not is_valid_hwnd(hwnd):
        return False
    try:
        if not win32gui.IsWindowVisible(hwnd):
            return False
        if win32gui.GetClassName(hwnd) != "#32770":
            return False
        title = (win32gui.GetWindowText(hwnd) or "").strip()
        return _save_pdf_dialog_title_matches(title)
    except Exception:
        return False


def reacquire_save_pdf_dialog(
    logger: PrintStepLogger | None = None,
) -> int:
    """Find the live Save Print Output As dialog after Rename recovery."""
    save_dialog = find_save_pdf_dialog_fast()
    if not is_save_pdf_dialog_hwnd(save_dialog):
        raise SaveFilenameTargetingError(
            "Save Print Output As dialog was not found after draining Rename errors."
        )
    if logger:
        logger.step("7_save_dialog_reacquired", f"hwnd={save_dialog}")
    return int(save_dialog)


def rename_dialog_still_visible(hwnd: int) -> bool:
    if not is_valid_hwnd(hwnd):
        return False
    try:
        return bool(win32gui.IsWindow(hwnd) and win32gui.IsWindowVisible(hwnd))
    except Exception:
        return False


def wait_for_rename_dialog_closed(
    hwnd: int,
    timeout_s: float = SHELL_RENAME_CLOSE_TIMEOUT_S,
) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if not rename_dialog_still_visible(hwnd):
            return True
        time.sleep(SHELL_RENAME_CLOSE_POLL_S)
    return not rename_dialog_still_visible(hwnd)


def click_rename_dialog_ok(
    rename_hwnd: int,
    logger: PrintStepLogger | None = None,
) -> str:
    """Click OK on the Shell Rename validation dialog; raise if it stays open."""
    ok_hwnd: int | None = None
    try:
        candidate = win32gui.GetDlgItem(rename_hwnd, 1)
        if candidate and is_valid_hwnd(candidate):
            try:
                if win32gui.IsWindowVisible(candidate) and win32gui.IsWindowEnabled(
                    candidate
                ):
                    ok_hwnd = int(candidate)
            except Exception:
                ok_hwnd = int(candidate)
    except Exception:
        pass

    def _attempt(method: str, action) -> str | None:
        if logger:
            logger.step("7_rename_ok_attempt", f"method={method}")
        try:
            action()
        except Exception:
            return None
        if wait_for_rename_dialog_closed(rename_hwnd, SHELL_RENAME_METHOD_WAIT_S):
            return method
        return None

    if ok_hwnd:
        method = _attempt(
            "BM_CLICK",
            lambda: win32gui.SendMessage(ok_hwnd, win32con.BM_CLICK, 0, 0),
        )
        if method:
            return method

    method = _attempt(
        "WM_COMMAND",
        lambda: win32gui.PostMessage(
            rename_hwnd,
            win32con.WM_COMMAND,
            1,
            ok_hwnd or 0,
        ),
    )
    if method:
        return method

    button_hwnd = ok_hwnd or find_child_button(rename_hwnd, ("OK", "&OK"))
    if button_hwnd and is_valid_hwnd(button_hwnd):

        def _mouse_click() -> None:
            left, top, right, bottom = win32gui.GetWindowRect(button_hwnd)
            click_screen_point((left + right) // 2, (top + bottom) // 2)

        method = _attempt("MOUSE", _mouse_click)
        if method:
            return method

    if click_dialog_button(rename_hwnd, ("OK", "&OK")):
        if logger:
            logger.step("7_rename_ok_attempt", "method=DIALOG_BUTTON")
        if wait_for_rename_dialog_closed(rename_hwnd, SHELL_RENAME_CLOSE_TIMEOUT_S):
            return "DIALOG_BUTTON"

    if wait_for_rename_dialog_closed(rename_hwnd, SHELL_RENAME_CLOSE_TIMEOUT_S):
        return "CLOSED_LATE"

    if rename_dialog_still_visible(rename_hwnd):
        raise SaveFilenameTargetingError("Could not dismiss Rename validation dialog.")
    return "GONE"


def dismiss_all_shell_rename_errors(
    logger: PrintStepLogger | None = None,
    max_dismissals: int = SHELL_RENAME_MAX_DISMISSALS,
    timeout_s: float = SHELL_RENAME_DRAIN_TIMEOUT_S,
) -> int:
    """Dismiss stacked Shell Rename validation dialogs until none remain."""
    deadline = time.time() + timeout_s
    dismissed = 0
    quiet_deadline: float | None = None

    while time.time() < deadline:
        rename_hwnd = find_shell_rename_error_dialog_fast()
        if rename_hwnd:
            if dismissed >= max_dismissals:
                raise SaveFilenameTargetingError(
                    "Too many Rename validation dialogs while saving Microsoft Print to PDF."
                )
            if logger:
                logger.step("7_rename_found", f"hwnd={rename_hwnd}")
            click_rename_dialog_ok(rename_hwnd, logger)
            dismissed += 1
            if logger:
                logger.step("7_rename_closed", f"count={dismissed}")
            quiet_deadline = time.time() + SHELL_RENAME_QUIET_PERIOD_S
            continue

        if dismissed == 0:
            return 0

        if quiet_deadline is None:
            quiet_deadline = time.time() + SHELL_RENAME_QUIET_PERIOD_S

        if time.time() >= quiet_deadline:
            if logger:
                logger.step("7_rename_drained", f"count={dismissed}")
            return dismissed

        time.sleep(SHELL_RENAME_CLOSE_POLL_S)

    raise SaveFilenameTargetingError(
        f"Timed out draining Rename validation dialogs after {dismissed} dismissal(s)."
    )


def find_shell_rename_error_dialog_fast() -> int | None:
    """Locate the Shell Rename dialog — FindWindow first, title-only match."""
    if win32gui is None:
        return None
    try:
        hwnd = win32gui.FindWindow("#32770", "Rename")
        if is_shell_rename_dialog_hwnd(hwnd):
            body = dialog_immediate_static_text(int(hwnd))
            if body and not looks_like_shell_rename_error("Rename", body):
                pass
            return int(hwnd)
    except Exception:
        pass
    for hwnd in enumerate_top_level_windows():
        if is_shell_rename_dialog_hwnd(hwnd):
            return int(hwnd)
    return None


def dismiss_shell_rename_error_if_present(
    logger: PrintStepLogger | None = None,
) -> int:
    """Drain any Shell Rename validation dialogs (recoverable, not fatal)."""
    return dismiss_all_shell_rename_errors(logger)


def log_save_dialog_direct_children(
    dialog_hwnd: int,
    logger: PrintStepLogger | None,
) -> None:
    """Log direct children of the Save dialog when 0x0480 is missing."""
    if logger is None:
        return

    def callback(child: int, _) -> None:
        try:
            ctrl_id = win32gui.GetDlgCtrlID(child)
            cls = win32gui.GetClassName(child)
            text = (win32gui.GetWindowText(child) or "").strip()
            logger.step(
                "7_save_child",
                f"hwnd={child} id={ctrl_id} class={cls!r} text={text!r}",
            )
        except Exception:
            pass

    try:
        win32gui.EnumChildWindows(dialog_hwnd, callback, None)
    except Exception:
        pass


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


def find_verified_filename_edit_0480(dialog_hwnd: int) -> int | None:
    """Locate the verified common-dialog File name edit (GetDlgItem 0x0480 only)."""
    try:
        hwnd = win32gui.GetDlgItem(dialog_hwnd, CDM_FILENAME_CONTROL_ID)
    except Exception:
        return None
    if not hwnd or not is_valid_hwnd(hwnd):
        return None
    try:
        if not win32gui.IsWindowEnabled(hwnd):
            return None
        cls = win32gui.GetClassName(hwnd)
    except Exception:
        return None
    if cls == "Edit":
        return int(hwnd)
    if cls in ("ComboBox", "ComboBoxEx32"):
        for child in find_child_by_class_recursive(hwnd, "Edit"):
            try:
                if win32gui.IsWindowEnabled(child):
                    return int(child)
            except Exception:
                continue
    return None


def find_common_dialog_filename_edit(dialog_hwnd: int) -> int | None:
    """Alias for the verified 0x0480 File name control."""
    return find_verified_filename_edit_0480(dialog_hwnd)


def find_dialog_filename_edit(dialog_hwnd: int) -> int | None:
    """File name field in Save Print Output As — GetDlgItem(0x0480) only."""
    return find_verified_filename_edit_0480(dialog_hwnd)


def _uia_control_name(control) -> str:
    try:
        return (control.window_text() or "").strip()
    except Exception:
        return ""


def _uia_control_type(control) -> str:
    try:
        return str(control.element_info.control_type or "")
    except Exception:
        return ""


def log_save_dialog_uia_controls(
    save_dialog: int,
    logger: PrintStepLogger | None,
) -> None:
    """Log Save dialog UIA descendants when Downloads cannot be identified."""
    if logger is None:
        return
    try:
        from pywinauto import Desktop
    except ImportError:
        logger.step("7_save_uia", "pywinauto unavailable")
        return
    try:
        dialog = Desktop(backend="uia").window(handle=int(save_dialog))
        for desc in dialog.descendants():
            try:
                logger.step(
                    "7_save_uia",
                    (
                        f"name={_uia_control_name(desc)!r} "
                        f"type={_uia_control_type(desc)!r} "
                        f"visible={desc.is_visible()!r} "
                        f"enabled={desc.is_enabled()!r}"
                    ),
                )
            except Exception:
                continue
    except Exception as exc:
        logger.step("7_save_uia", f"enumerate_failed={exc!r}")


def _reject_path_like_filename_written(written: str) -> None:
    """Raise when the File name field contains a path instead of a bare filename."""
    value = (written or "").strip()
    if value.startswith(("C:\\", "c:\\")):
        raise SaveFilenameTargetingError(
            f"File name field received a full path instead of a bare filename: {value!r}"
        )
    for sep in ("\\", "/", ":"):
        if sep in value:
            raise SaveFilenameTargetingError(
                f"File name field must not contain path separators or a drive colon: {value!r}"
            )


def find_downloads_navigation_item_uia(save_dialog: int):
    """Find a visible enabled Downloads navigation item in the Save dialog."""
    try:
        from pywinauto import Desktop
    except ImportError:
        return None
    try:
        dialog = Desktop(backend="uia").window(handle=int(save_dialog))
    except Exception:
        return None
    candidates = []
    for desc in dialog.descendants():
        try:
            if _uia_control_type(desc) not in ("TreeItem", "ListItem", "Button"):
                continue
            if _uia_control_name(desc) != DOWNLOADS_NAV_ITEM_NAME:
                continue
            if not desc.is_visible() or not desc.is_enabled():
                continue
            candidates.append(desc)
        except Exception:
            continue
    return candidates[0] if candidates else None


def verify_downloads_folder_selected_uia(save_dialog: int) -> bool:
    """Best-effort verification that Downloads is the active Save dialog folder."""
    try:
        from pywinauto import Desktop
    except ImportError:
        return True
    try:
        dialog = Desktop(backend="uia").window(handle=int(save_dialog))
    except Exception:
        return False
    location_blob = ""
    for desc in dialog.descendants():
        try:
            name = _uia_control_name(desc)
            ctype = _uia_control_type(desc)
            if ctype in ("TreeItem", "ListItem") and name == DOWNLOADS_NAV_ITEM_NAME:
                try:
                    if desc.is_selected():
                        return True
                except Exception:
                    pass
                try:
                    iface = desc.iface_selection_item
                    if iface and iface.CurrentIsSelected:
                        return True
                except Exception:
                    pass
            if name and ctype in ("Text", "Edit", "ComboBox", "ToolBar"):
                location_blob += f" {name}"
        except Exception:
            continue
    return "downloads" in location_blob.lower()


def wait_for_downloads_folder_ready(
    save_dialog: int,
    logger: PrintStepLogger | None = None,
    timeout_s: float = DOWNLOADS_SELECT_TIMEOUT_S,
) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if verify_downloads_folder_selected_uia(save_dialog):
            if logger:
                logger.step("7_downloads_ready", "True")
            return True
        time.sleep(0.1)
    if logger:
        logger.step("7_downloads_ready", "False")
    return False


def select_downloads_folder_in_save_dialog(
    save_dialog: int,
    logger: PrintStepLogger | None = None,
) -> None:
    """Select Downloads in the Save Print Output As navigation pane via UIA."""
    item = find_downloads_navigation_item_uia(save_dialog)
    if item is None:
        log_save_dialog_uia_controls(save_dialog, logger)
        raise SaveFilenameTargetingError(
            "Could not select Downloads folder in Save Print Output As."
        )
    if logger:
        logger.step("7_downloads_select", f"item='{DOWNLOADS_NAV_ITEM_NAME}'")
    clicked = False
    for action_name in ("select", "invoke", "click_input"):
        try:
            getattr(item, action_name)()
            clicked = True
            break
        except Exception:
            continue
    if not clicked:
        log_save_dialog_uia_controls(save_dialog, logger)
        raise SaveFilenameTargetingError(
            "Could not select Downloads folder in Save Print Output As."
        )
    if not wait_for_downloads_folder_ready(save_dialog, logger):
        log_save_dialog_uia_controls(save_dialog, logger)
        raise SaveFilenameTargetingError(
            "Could not select Downloads folder in Save Print Output As."
        )


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


def set_verified_filename_only(
    save_dialog: int,
    filename: str,
    logger: PrintStepLogger | None = None,
) -> int:
    """Write only the bare PDF filename into GetDlgItem(0x0480)."""
    bare_filename = validate_save_filename_only(filename)
    edit_hwnd = find_verified_filename_edit_0480(save_dialog)
    if not edit_hwnd:
        log_save_dialog_direct_children(save_dialog, logger)
        raise SaveFilenameTargetingError(
            "Verified File name control 0x0480 was not found."
        )
    try:
        cls = win32gui.GetClassName(edit_hwnd)
    except Exception:
        cls = "unknown"
    if logger:
        logger.step("7_filename", bare_filename)
        logger.step(
            "7_filename_control",
            f"hwnd={edit_hwnd} id=0x0480 class={cls!r}",
        )
    try:
        win32gui.SendMessage(edit_hwnd, win32con.EM_SETSEL, 0, -1)
    except Exception:
        pass
    if not set_edit_text(edit_hwnd, bare_filename):
        type_text_to_hwnd(edit_hwnd, bare_filename, delay_s=0.02)
    written = read_edit_text(edit_hwnd)
    _reject_path_like_filename_written(written)
    if logger:
        logger.step("7_set_filename_done", f"value='{written}'")
    return edit_hwnd


def enter_save_print_output_filename(
    save_dialog: int,
    output_path: Path,
    logger: PrintStepLogger | None = None,
    *,
    skip_downloads_navigation: bool = False,
    **_kwargs: object,
) -> int:
    """Select Downloads, then write only the bare PDF filename to control 0x0480."""
    target_directory, filename = split_save_output_path(output_path)
    if logger:
        logger.step("7_target_directory", str(target_directory))
    attach_foreground_window(save_dialog)
    focus_modal_dialog(save_dialog)
    time.sleep(0.35)
    if not skip_downloads_navigation:
        select_downloads_folder_in_save_dialog(save_dialog, logger)
        save_dialog = reacquire_save_pdf_dialog(logger)
        attach_foreground_window(save_dialog)
        focus_modal_dialog(save_dialog)
        time.sleep(0.2)
    return set_verified_filename_only(save_dialog, filename, logger)


def _dismiss_unexpected_rename_dialogs(
    logger: PrintStepLogger | None = None,
) -> int:
    """Defensive cleanup for unexpected Rename dialogs after basename targeting."""
    if not find_shell_rename_error_dialog_fast():
        return 0
    count = dismiss_all_shell_rename_errors(logger)
    if logger and count:
        logger.step("7_rename_unexpected", f"count={count}")
    return count


def save_print_output_dialog(
    save_dialog: int,
    output_path: Path,
    logger: PrintStepLogger | None = None,
) -> None:
    if logger:
        logger.step("7_save_dialog", f"hwnd={save_dialog}")

    _dismiss_unexpected_rename_dialogs(logger)
    save_dialog = reacquire_save_pdf_dialog(logger)

    target_directory, filename = split_save_output_path(output_path)
    if logger:
        logger.step("7_target_directory", str(target_directory))

    select_downloads_folder_in_save_dialog(save_dialog, logger)
    save_dialog = reacquire_save_pdf_dialog(logger)

    filename_set = False
    for attempt in range(1, FILENAME_ENTRY_MAX_ATTEMPTS + 1):
        _dismiss_unexpected_rename_dialogs(logger)
        save_dialog = reacquire_save_pdf_dialog(logger)
        enter_save_print_output_filename(
            save_dialog,
            output_path,
            logger,
            skip_downloads_navigation=True,
        )
        time.sleep(FILENAME_POST_WRITE_WAIT_S)
        if find_shell_rename_error_dialog_fast():
            _dismiss_unexpected_rename_dialogs(logger)
            if attempt >= FILENAME_ENTRY_MAX_ATTEMPTS:
                raise SaveFilenameTargetingError(
                    "Rename validation kept recurring after verified File name targeting."
                )
            save_dialog = reacquire_save_pdf_dialog(logger)
            select_downloads_folder_in_save_dialog(save_dialog, logger)
            save_dialog = reacquire_save_pdf_dialog(logger)
            continue
        filename_set = True
        break
    if not filename_set:
        raise SaveFilenameTargetingError(
            "Rename validation kept recurring after verified File name targeting."
        )

    _dismiss_unexpected_rename_dialogs(logger)
    save_dialog = reacquire_save_pdf_dialog(logger)
    focus_modal_dialog(save_dialog)
    time.sleep(0.2)
    if not click_save_dialog_button(save_dialog):
        raise RuntimeError("Could not click Save in Save Print Output As dialog.")
    if logger:
        logger.step("7_click_save", f"hwnd={save_dialog} method=win32")
    time.sleep(0.5)
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


def wait_for_pdf_output(
    output_path: Path,
    timeout_s: float = PDF_SAVE_VERIFY_TIMEOUT_S,
    logger: PrintStepLogger | None = None,
) -> bool:
    deadline = time.time() + timeout_s
    if logger:
        logger.step(
            "8_wait_pdf",
            f"waiting for {output_path} timeout={timeout_s:.0f}s",
        )
    while time.time() < deadline:
        if pdf_ready(output_path):
            return True
        time.sleep(0.1)
    return False


def _pdf_printer_visible_in_dialog(dialog_hwnd: int) -> bool:
    blob = normalize_label(dialog_visible_text(dialog_hwnd))
    return "print to pdf" in blob


def _collect_uia_printer_names(dialog_hwnd: int, op_deadline: float) -> list[str]:
    names: list[str] = []
    try:
        from pywinauto import Desktop
    except ImportError:
        return names
    if time.time() >= op_deadline:
        return names
    try:
        dialog = Desktop(backend="uia").window(handle=int(dialog_hwnd))
        for desc in dialog.descendants():
            if time.time() >= op_deadline:
                break
            try:
                text = (desc.window_text() or "").strip()
            except Exception:
                continue
            if text and ("printer" in text.lower() or "pdf" in text.lower()):
                names.append(text)
    except Exception:
        pass
    return names[:20]


def _printer_selection_failure_diagnostics(dialog_hwnd: int) -> str:
    deadline = time.time() + min(PRINTER_SELECTION_OP_TIMEOUT_S, 3.0)
    uia_names = _collect_uia_printer_names(dialog_hwnd, deadline)
    lines = [
        f"default_printer={get_windows_default_printer()!r}",
        f"installed_printers={list_installed_printers()!r}",
        f"print_dialog_hwnd={dialog_hwnd}",
        f"uia_printer_names={uia_names!r}",
    ]
    return "\n".join(lines)


def _select_pdf_printer_uia(
    dialog_hwnd: int,
    op_deadline: float,
    logger: PrintStepLogger | None = None,
) -> bool:
    try:
        from pywinauto import Desktop
    except ImportError:
        return False
    if time.time() >= op_deadline:
        return False
    try:
        dialog = Desktop(backend="uia").window(handle=int(dialog_hwnd))
        remaining = max(0.1, op_deadline - time.time())
        dialog.wait("visible", timeout=min(2.0, remaining), retry_interval=0.1)
    except Exception:
        return False
    for desc in dialog.descendants():
        if time.time() >= op_deadline:
            return False
        try:
            text = (desc.window_text() or "").strip()
        except Exception:
            continue
        if not text or not printer_label_matches_pdf(text):
            continue
        for action_name in ("select", "invoke", "click_input"):
            try:
                getattr(desc, action_name)()
                time.sleep(0.2)
                if _pdf_printer_visible_in_dialog(dialog_hwnd):
                    return True
            except Exception:
                continue
    return False


def _select_pdf_printer_pywinauto_win32(
    dialog_hwnd: int,
    op_deadline: float,
    logger: PrintStepLogger | None = None,
) -> bool:
    try:
        from pywinauto import Desktop
    except ImportError:
        return False
    if time.time() >= op_deadline:
        return False
    try:
        dialog = Desktop(backend="win32").window(handle=int(dialog_hwnd))
    except Exception:
        return False
    for class_name in ("SysListView32", "ListBox"):
        try:
            controls = dialog.descendants(class_name=class_name)
        except Exception:
            controls = []
        for control in controls:
            if time.time() >= op_deadline:
                return False
            try:
                items = control.items()
            except Exception:
                continue
            for item in items:
                if time.time() >= op_deadline:
                    return False
                try:
                    text = str(item.text() or "").strip()
                except Exception:
                    continue
                if not printer_label_matches_pdf(text):
                    continue
                for action_name in ("select", "click_input"):
                    try:
                        getattr(item, action_name)()
                        time.sleep(0.2)
                        if _pdf_printer_visible_in_dialog(dialog_hwnd):
                            return True
                    except Exception:
                        continue
    return False


def _select_pdf_printer_typeahead(
    dialog_hwnd: int,
    op_deadline: float,
    logger: PrintStepLogger | None = None,
) -> bool:
    if time.time() >= op_deadline:
        return False
    focus_print_dialog_printer_list(dialog_hwnd)
    if time.time() >= op_deadline:
        return False
    for class_name in ("SysListView32", "ListBox", "SHELLDLL_DefView"):
        for hwnd in find_child_by_class_recursive(dialog_hwnd, class_name):
            if time.time() >= op_deadline:
                return False
            type_text_to_hwnd(hwnd, PDF_PRINTER_LABELS[0], delay_s=0.04)
            time.sleep(0.35)
            if _pdf_printer_visible_in_dialog(dialog_hwnd):
                return True
    return False


def select_pdf_printer_in_print_dialog(
    dialog_hwnd: int,
    logger: PrintStepLogger | None = None,
) -> str:
    """Confirm Microsoft Print to PDF is the default printer — no printer enumeration."""
    dialog_hwnd = int(dialog_hwnd)

    def log(step: str, detail: str = "") -> None:
        if logger:
            logger.step(step, detail)

    log("4_select_printer_start", f"dialog={dialog_hwnd}")
    default_name = get_windows_default_printer_logged(logger)
    log("4_default_printer", f"name='{default_name}'")
    if printer_label_matches_pdf(default_name):
        log(
            "4_select_printer_done",
            "default is Microsoft Print to PDF; skipping enumeration",
        )
        return default_name
    raise PrinterSelectionError(
        "Microsoft Print to PDF must be the Windows default printer on the HOT2000 worker PC.\n"
        f"GetDefaultPrinter() returned: {default_name!r}"
    )


def select_pdf_printer_robust(
    dialog_hwnd: int,
    logger: PrintStepLogger | None = None,
) -> bool:
    """Select Microsoft Print to PDF without raw cross-process list-view messages."""
    try:
        select_pdf_printer_in_print_dialog(dialog_hwnd, logger)
        return True
    except PrinterSelectionError:
        return False


def complete_print_dialog_to_pdf(
    output_path: Path,
    print_dialog_hwnd: int,
    logger: PrintStepLogger | None = None,
) -> bool:
    """Manual steps 3–6: select PDF printer, Print, Save Print Output As, verify file."""
    focus_modal_dialog(print_dialog_hwnd)
    time.sleep(0.4)

    try:
        select_pdf_printer_in_print_dialog(print_dialog_hwnd, logger)
    except PrinterSelectionError:
        return False

    if pdf_ready(output_path):
        if logger:
            logger.step(
                "8_pdf_verified",
                f"path={output_path} bytes={output_path.stat().st_size}",
            )
        return True

    if not invoke_print_dialog_print(
        print_dialog_hwnd,
        output_path,
        timeout_s=SAVE_DIALOG_WAIT_AFTER_PRINT_S,
        logger=logger,
    ):
        return False

    if pdf_ready(output_path):
        if logger:
            logger.step(
                "8_pdf_verified",
                f"path={output_path} bytes={output_path.stat().st_size}",
            )
        return True

    save_dialog = find_save_pdf_dialog_fast()
    if not save_dialog:
        save_dialog = wait_for_save_pdf_dialog(
            timeout_s=SAVE_DIALOG_WAIT_AFTER_PRINT_S,
            logger=logger,
            output_path=output_path,
        )
    if pdf_ready(output_path):
        if logger:
            logger.step(
                "8_pdf_verified",
                f"path={output_path} bytes={output_path.stat().st_size}",
            )
        return True
    if not save_dialog:
        if logger:
            logger.step("6_wait_save_dialog", "Save Print Output As did not appear")
        return False

    save_print_output_dialog(save_dialog, output_path, logger=logger)
    ready = wait_for_pdf_output(
        output_path,
        timeout_s=PDF_SAVE_VERIFY_TIMEOUT_S,
        logger=logger,
    )
    if logger and ready:
        logger.step(
            "8_pdf_verified",
            f"path={output_path} bytes={output_path.stat().st_size}",
        )
    return ready


def open_report_print_dialog_manual(
    report_hwnd: int | None,
    main_hwnd: int | None,
    logger: PrintStepLogger | None = None,
    extra_hwnds: list[int] | None = None,
    *,
    open_strategy: str = "auto",
) -> tuple[int | None, list[int]]:
    """
    Manual steps 1–2: open Print via verified main toolbar, File→Print, WM_COMMAND.
    Does not scan arbitrary report toolbars or send Ctrl+P.
    """
    existing = find_print_dialog(timeout_s=1.0)
    if existing:
        if logger:
            logger.step("3_print_dialog", f"Already open hwnd={existing}")
        return existing, []

    report_hwnd, main_hwnd, targets = resolve_print_context(
        report_hwnd,
        main_hwnd,
        extra_hwnds,
    )
    if logger and is_valid_hwnd(report_hwnd):
        logger.step("1_report", f"hwnd={int(report_hwnd)}")
    if logger and is_valid_hwnd(main_hwnd):
        logger.step("1_main", f"hwnd={int(main_hwnd)}")

    main_target = int(main_hwnd) if is_valid_hwnd(main_hwnd) else None
    if main_target is None and targets:
        main_target = targets[0]
    if main_target is None:
        return None, targets

    dialog = open_print_dialog_safe_strategies(
        main_target,
        logger,
        open_strategy=open_strategy,
    )
    if dialog:
        return dialog, targets

    if logger:
        logger.step(
            "failed_open_print",
            f"Print dialog not found after safe strategies (strategy={open_strategy})",
        )
    return None, targets


def export_full_house_report_pdf_manual(
    output_path: Path,
    report_hwnd: int | None = None,
    main_hwnd: int | None = None,
    log_path: Path | None = None,
    targets_path: Path | None = None,
    *,
    open_strategy: str = "auto",
) -> None:
    """
    Automate the manual Full House Report → PDF operator flow end-to-end.

    Manual trace:
      1. Focus the open Full House Report viewer
      2. Open Print (verified main toolbar index 5, else File→Print, else WM_COMMAND)
      3. Select Microsoft Print to PDF
      4. Click Print
      5. Save Print Output As → job PDF path → Save → confirm overwrite
      6. Verify %PDF written
    """
    logger = PrintStepLogger(log_path)
    logger.step(
        "0_start",
        f"output={output_path.resolve()} strategy={open_strategy}",
    )
    extra_hwnds = load_print_target_hwnds_file(targets_path)
    passed_report_hwnd = report_hwnd
    passed_main_hwnd = main_hwnd
    resolved_report, resolved_main = resolve_print_hwnds(
        report_hwnd,
        main_hwnd,
        extra_hwnds,
    )
    if logger:
        logger.step(
            "0_resolve_hwnds",
            f"passed report={passed_report_hwnd} main={passed_main_hwnd} "
            f"resolved report={resolved_report} main={resolved_main} "
            f"extra_targets={len(extra_hwnds)}",
        )

    print_dialog, targets_tried = open_report_print_dialog_manual(
        resolved_report,
        resolved_main,
        logger,
        extra_hwnds=extra_hwnds,
        open_strategy=open_strategy,
    )
    if not print_dialog:
        orphan = peek_print_dialog() or find_print_dialog(timeout_s=3)
        if orphan:
            logger.step(
                "2_print_dialog_orphan",
                f"dialog={orphan} hot2000_up={bool(find_hot2000_main_window())}",
            )
            print_dialog = orphan
        elif not find_hot2000_main_window():
            raise Hot2000ExitedAfterPrintError(
                "HOT2000 Desktop exited immediately after attempting to open Print.\n"
                f"strategy=open_print\nmain_hwnd={resolved_main}\n"
                f"hot2000_process_still_exists=False\nprint_dialog_appeared=False"
            )
        else:
            diagnostics = collect_print_diagnostics_fast(
                resolved_report,
                resolved_main,
                targets_tried,
                passed_report_hwnd=passed_report_hwnd,
                passed_main_hwnd=passed_main_hwnd,
            )
            if log_path is not None:
                (log_path.parent / "print-debug.txt").write_text(diagnostics, encoding="utf-8")
            raise RuntimeError(
                "Print dialog did not open in HOT2000 Desktop. "
                "On the worker PC, click inside the Full House Report viewer, "
                "then use the main toolbar printer icon (6th button) or File → Print.\n"
                f"{diagnostics}"
            )

    if not complete_print_dialog_to_pdf(output_path, print_dialog, logger):
        if pdf_ready(output_path):
            logger.step("6_pdf_ready", str(output_path.resolve()))
            return
        orphan_dialog = peek_print_dialog() or (
            print_dialog if is_valid_hwnd(print_dialog) else None
        )
        if orphan_dialog and complete_print_dialog_to_pdf(output_path, orphan_dialog, logger):
            return
        hot2000_up = bool(find_hot2000_main_window())
        logger.step(
            "failed_complete_print",
            f"dialog={print_dialog} save={find_save_pdf_dialog_deep_diagnostic()} "
            f"pdf={pdf_ready(output_path)} hot2000_up={hot2000_up}",
        )
        if not hot2000_up:
            raise RuntimeError(
                "HOT2000 Desktop closed while completing Print → Save PDF. "
                "The Print dialog may have opened but HOT2000 exited before Save Print Output As. "
                "See print-steps.log and print-helper-32bit.log on the worker PC."
            )
        raise RuntimeError(
            "Save Print Output As dialog did not open or PDF was not written. "
            "The Print dialog opened but Print could not be activated."
        )


def automate_report_print_to_pdf(
    output_path: Path,
    report_hwnd: int | None = None,
    main_hwnd: int | None = None,
    log_path: Path | None = None,
) -> None:
    """Open Print from the report viewer, then print to PDF."""
    export_full_house_report_pdf_manual(
        output_path,
        report_hwnd,
        main_hwnd,
        log_path=log_path,
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
