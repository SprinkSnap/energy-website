"""Shared helpers for print_dialog_win32 unit tests."""

from print_dialog_win32 import FilenameWriteResult


def verified_filename(name: str = "My-House.pdf", hwnd: int = 2001) -> FilenameWriteResult:
    return FilenameWriteResult(
        method="win32_0480",
        actual=name,
        verified=True,
        hwnd=hwnd,
    )


def pdf_ready_false_until_save_complete():
    """Return False during print/save flow, True on the final verification."""
    calls = {"count": 0}

    def _pdf_ready(_path):
        calls["count"] += 1
        return calls["count"] >= 6

    return _pdf_ready
