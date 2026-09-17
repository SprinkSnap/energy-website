"""Minimal Win32 API bindings via ctypes for 32-bit embeddable Python.

Used when pywin32 is not installed in HOT2000_PYTHON32. Avoids pip/postinstall
issues with embeddable Python distributions.
"""

from __future__ import annotations

import ctypes
import os
from ctypes import wintypes

if os.name != "nt":
    raise ImportError("win32_ctypes is only available on Windows")

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
try:
    winspool = ctypes.windll.winspool.drv
except Exception:  # pragma: no cover
    winspool = None

WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


class win32con:
    BM_CLICK = 0x00F5
    EM_REPLACESEL = 0x00C2
    EM_SETSEL = 0x00B1
    GW_OWNER = 4
    KEYEVENTF_KEYUP = 0x0002
    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004
    SW_RESTORE = 9
    SW_SHOW = 5
    VK_CONTROL = 0x11
    VK_MENU = 0x12
    VK_RETURN = 0x0D
    WM_CHAR = 0x0102
    WM_COMMAND = 0x0111
    WM_GETTEXT = 0x000D
    WM_GETTEXTLENGTH = 0x000E
    WM_KEYDOWN = 0x0100
    WM_KEYUP = 0x0101
    WM_SETTEXT = 0x000C


class win32api:
    @staticmethod
    def keybd_event(bVk, bScan, dwFlags, dwExtraInfo) -> None:
        user32.keybd_event(bVk, bScan, dwFlags, dwExtraInfo)

    @staticmethod
    def SetCursorPos(point) -> None:
        x, y = point
        user32.SetCursorPos(int(x), int(y))

    @staticmethod
    def mouse_event(dwFlags, dx, dy, dwData, dwExtraInfo) -> None:
        user32.mouse_event(dwFlags, dx, dy, dwData, dwExtraInfo)


class win32print:
    @staticmethod
    def GetDefaultPrinter() -> str:
        if winspool is None:
            return ""
        size = wintypes.DWORD(0)
        winspool.GetDefaultPrinterW(None, ctypes.byref(size))
        if size.value <= 0:
            return ""
        buf = ctypes.create_unicode_buffer(size.value)
        if not winspool.GetDefaultPrinterW(buf, ctypes.byref(size)):
            return ""
        return buf.value


def _normalize_lparam(lparam):
    if isinstance(lparam, str):
        return ctypes.c_wchar_p(lparam)
    if isinstance(lparam, int):
        return lparam
    if isinstance(lparam, ctypes._SimpleCData):
        return lparam
    if isinstance(lparam, ctypes.Array):
        return ctypes.cast(ctypes.byref(lparam), wintypes.LPARAM)
    return lparam


class win32gui:
    @staticmethod
    def IsWindow(hwnd) -> bool:
        return bool(user32.IsWindow(hwnd))

    @staticmethod
    def IsWindowVisible(hwnd) -> bool:
        return bool(user32.IsWindowVisible(hwnd))

    @staticmethod
    def IsWindowEnabled(hwnd) -> bool:
        return bool(user32.IsWindowEnabled(hwnd))

    @staticmethod
    def GetWindowText(hwnd) -> str:
        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, len(buf))
        return buf.value

    @staticmethod
    def GetClassName(hwnd) -> str:
        buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, buf, len(buf))
        return buf.value

    @staticmethod
    def GetParent(hwnd):
        return user32.GetParent(hwnd)

    @staticmethod
    def GetWindow(hwnd, cmd):
        return user32.GetWindow(hwnd, cmd)

    @staticmethod
    def GetDlgItem(hwnd, item_id):
        return user32.GetDlgItem(hwnd, item_id)

    @staticmethod
    def GetWindowRect(hwnd):
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        return rect.left, rect.top, rect.right, rect.bottom

    @staticmethod
    def SendMessage(hwnd, msg, wparam, lparam):
        return user32.SendMessageW(
            hwnd,
            msg,
            wparam,
            _normalize_lparam(lparam),
        )

    @staticmethod
    def PostMessage(hwnd, msg, wparam, lparam):
        return user32.PostMessageW(
            hwnd,
            msg,
            wparam,
            _normalize_lparam(lparam),
        )

    @staticmethod
    def SetForegroundWindow(hwnd) -> None:
        user32.SetForegroundWindow(hwnd)

    @staticmethod
    def ShowWindow(hwnd, cmd) -> None:
        user32.ShowWindow(hwnd, cmd)

    @staticmethod
    def EnumWindows(callback, param) -> None:
        refs: list[object] = []

        @WNDENUMPROC
        def _cb(hwnd, _lparam):
            callback(hwnd, param)
            return True

        refs.append(_cb)
        user32.EnumWindows(_cb, 0)

    @staticmethod
    def EnumChildWindows(parent, callback, param) -> None:
        refs: list[object] = []

        @WNDENUMPROC
        def _cb(hwnd, _lparam):
            callback(hwnd, param)
            return True

        refs.append(_cb)
        user32.EnumChildWindows(parent, _cb, 0)
