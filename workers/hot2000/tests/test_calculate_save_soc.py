import os
import threading
import time
import xml.etree.ElementTree as ET

import win32con
import win32gui
import win32process

from pywinauto import Desktop
from pywinauto.keyboard import send_keys


CALCULATE_COMMAND = 29791
SAVE_AS_COMMAND = 57604
CLOSE_COMMAND = 57602

OUTPUT_PATH = r"C:\HOT2000Worker\test\calculated.h2k"

CALC_TIMEOUT = 300
DIALOG_TIMEOUT = 30


def find_hot2000_main():
    matches = []

    def callback(hwnd, _):
        try:
            title = win32gui.GetWindowText(hwnd)
            cls = win32gui.GetClassName(hwnd)

            if (
                cls.startswith("Afx:")
                and title.startswith("HOT2000")
            ):
                matches.append(hwnd)

        except Exception:
            pass

    win32gui.EnumWindows(callback, None)

    if not matches:
        raise RuntimeError(
            "HOT2000 main window not found."
        )

    return matches[0]


def windows_for_pid(pid):
    results = []

    def callback(hwnd, _):
        try:
            _, window_pid = (
                win32process.GetWindowThreadProcessId(hwnd)
            )

            if window_pid == pid:
                results.append(hwnd)

        except Exception:
            pass

    win32gui.EnumWindows(callback, None)

    return results


def find_visible_window(pid, title=None, class_name=None):
    for hwnd in windows_for_pid(pid):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue

            if (
                title is not None
                and win32gui.GetWindowText(hwnd) != title
            ):
                continue

            if (
                class_name is not None
                and win32gui.GetClassName(hwnd) != class_name
            ):
                continue

            return hwnd

        except Exception:
            pass

    return None


def print_visible_hot2000_windows(pid):
    print("")
    print("Visible HOT2000 windows:")

    for hwnd in windows_for_pid(pid):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue

            print(
                "  HWND=",
                hwnd,
                "CLASS=",
                repr(win32gui.GetClassName(hwnd)),
                "TEXT=",
                repr(win32gui.GetWindowText(hwnd))
            )

        except Exception:
            pass


def run_calculate(main):
    print("Calculate SendMessage started.")

    try:
        result = win32gui.SendMessage(
            main,
            win32con.WM_COMMAND,
            CALCULATE_COMMAND,
            0
        )

        print(
            "Calculate SendMessage returned:",
            result
        )

    except Exception as exc:
        print(
            "Calculate SendMessage error:",
            exc
        )


def find_results_dialog(pid):
    """
    Find the modal EnerGuide Rating System Results window.

    HOT2000 gives this top-level #32770 window an empty title,
    so identify it by its child text instead.
    """

    for hwnd in windows_for_pid(pid):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                continue

            if win32gui.GetClassName(hwnd) != "#32770":
                continue

            # Ignore the progress dialog.
            if win32gui.GetWindowText(hwnd) == "Progress":
                continue

            found_results_label = False
            ok_button = None

            def child_callback(child, _):
                nonlocal found_results_label
                nonlocal ok_button

                try:
                    text = win32gui.GetWindowText(child)
                    cls = win32gui.GetClassName(child)

                    if text == "EnerGuide Rating System Results":
                        found_results_label = True

                    if (
                        text == "OK"
                        and win32gui.IsWindowVisible(child)
                        and win32gui.IsWindowEnabled(child)
                    ):
                        ok_button = child

                except Exception:
                    pass

            win32gui.EnumChildWindows(
                hwnd,
                child_callback,
                None
            )

            if found_results_label and ok_button:
                return hwnd, ok_button

        except Exception:
            pass

    return None, None


def close_results_dialog(pid):
    dialog_hwnd, ok_hwnd = find_results_dialog(pid)

    if not dialog_hwnd:
        return False

    print("")
    print(
        "EnerGuide results dialog found:",
        dialog_hwnd
    )

    print(
        "OK button found:",
        ok_hwnd
    )

    print(
        "Closing results dialog..."
    )

    # BM_CLICK avoids relying on mouse coordinates.
    win32gui.SendMessage(
        ok_hwnd,
        win32con.BM_CLICK,
        0,
        0
    )

    deadline = time.time() + 10

    while time.time() < deadline:
        if not win32gui.IsWindow(dialog_hwnd):
            print(
                "Results dialog closed."
            )
            return True

        if not win32gui.IsWindowVisible(dialog_hwnd):
            print(
                "Results dialog closed."
            )
            return True

        time.sleep(0.1)

    raise RuntimeError(
        "EnerGuide results dialog did not close."
    )

def wait_for_calculation(pid, thread):
    print("")
    print(
        "Waiting for HOT2000 calculation to start..."
    )

    deadline = time.time() + 30
    progress = None

    while time.time() < deadline:

        progress = find_visible_window(
            pid,
            title="Progress",
            class_name="#32770"
        )

        if progress:
            break

        if not thread.is_alive():
            break

        time.sleep(0.1)

    if not progress:
        print(
            "No Progress window detected."
        )

        if thread.is_alive():
            raise RuntimeError(
                "Calculate is still running but "
                "Progress window was not detected."
            )

        print(
            "Calculate returned before Progress "
            "could be detected."
        )
        return

    print(
        "Progress window found:",
        progress
    )

    print(
        "Waiting for calculation to finish..."
    )

    deadline = time.time() + CALC_TIMEOUT
    results_closed = False

    while time.time() < deadline:

        #
        # HOT2000 reaches 100%, then opens the
        # EnerGuide results dialog.
        #
        if not results_closed:
            dialog_hwnd, ok_hwnd = (
                find_results_dialog(pid)
            )

            if dialog_hwnd:
                results_closed = close_results_dialog(
                    pid
                )

                time.sleep(0.5)

        #
        # Once the results dialog is closed,
        # Progress should disappear.
        #
        if not win32gui.IsWindow(progress):
            print(
                "Progress window closed."
            )
            break

        if not win32gui.IsWindowVisible(progress):
            print(
                "Progress window is no longer visible."
            )
            break

        time.sleep(0.2)

    else:
        raise RuntimeError(
            "HOT2000 calculation timed out."
        )

    print(
        "Waiting for Calculate command to return..."
    )

    thread.join(
        timeout=30
    )

    if thread.is_alive():
        raise RuntimeError(
            "Calculate command did not return "
            "after results dialog was closed."
        )

    time.sleep(1)

    print(
        "Calculation finished."
    )


def wait_for_save_as(pid):
    deadline = time.time() + DIALOG_TIMEOUT

    while time.time() < deadline:
        for hwnd in windows_for_pid(pid):
            try:
                if not win32gui.IsWindowVisible(hwnd):
                    continue

                if win32gui.GetClassName(hwnd) != "#32770":
                    continue

                title = win32gui.GetWindowText(hwnd)

                if title in (
                    "Save As",
                    "Save House File As"
                ):
                    return hwnd

            except Exception:
                pass

        time.sleep(0.1)

    return None

def save_as(main, pid, path):
    print("")
    print("Opening Save As...")

    win32gui.PostMessage(
        main,
        win32con.WM_COMMAND,
        SAVE_AS_COMMAND,
        0
    )

    dialog_hwnd = wait_for_save_as(pid)

    if not dialog_hwnd:
        print_visible_hot2000_windows(pid)

        raise RuntimeError(
            "Save As dialog not found."
        )

    print(
        "Save As dialog found:",
        dialog_hwnd
    )

    dialog = Desktop(
        backend="win32"
    ).window(
        handle=dialog_hwnd
    )

    dialog.set_focus()

    time.sleep(0.5)

    print("Focusing File name field...")

    # Alt+N focuses the File name field
    # in the Windows Save As dialog.
    send_keys("%n")

    time.sleep(0.3)

    # Replace the existing filename.
    send_keys("^a")

    send_keys(
        path,
        with_spaces=True
    )

    print("Output filename entered:")
    print(path)

    time.sleep(1)

    save_button = dialog.child_window(
        title="&Save",
        class_name="Button"
    )

    print(
        "Clicking Save button:",
        save_button.handle
    )

    win32gui.SendMessage(
        save_button.handle,
        win32con.BM_CLICK,
        0,
        0
    )

    print("Save button clicked.")

    deadline = time.time() + DIALOG_TIMEOUT

    while time.time() < deadline:
        if not win32gui.IsWindow(dialog_hwnd):
            print("Save As dialog closed.")
            return

        if not win32gui.IsWindowVisible(dialog_hwnd):
            print("Save As dialog closed.")
            return

        time.sleep(0.25)

    raise RuntimeError(
        "Save As dialog did not close."
    )

def wait_for_file(path):
    print("")
    print(
        "Waiting for calculated H2K file..."
    )

    deadline = time.time() + 20

    while time.time() < deadline:
        if os.path.exists(path):
            size = os.path.getsize(path)

            if size > 0:
                print(
                    "Calculated file exists."
                )
                print(
                    "Size:",
                    size,
                    "bytes"
                )
                return

        time.sleep(0.25)

    raise RuntimeError(
        "Calculated H2K file was not created."
    )



def close_current_house(main):
    print("")
    print("Closing calculated H2K in HOT2000...")

    win32gui.PostMessage(
        main,
        win32con.WM_COMMAND,
        CLOSE_COMMAND,
        0
    )

    deadline = time.time() + 20

    while time.time() < deadline:
        if not win32gui.IsWindow(main):
            raise RuntimeError(
                "HOT2000 main window disappeared while closing the house file."
            )

        title = win32gui.GetWindowText(main)

        if "[" not in title:
            print(
                "HOT2000 title after close:",
                repr(title)
            )
            return

        time.sleep(0.25)

    print(
        "HOT2000 title after close:",
        repr(win32gui.GetWindowText(main))
    )

    raise RuntimeError(
        "HOT2000 did not close the calculated house file."
    )


def wait_for_file_readable(path):
    print("")
    print("Waiting for calculated H2K to be readable...")

    deadline = time.time() + 20
    last_error = None

    while time.time() < deadline:
        try:
            with open(path, "rb") as file_handle:
                file_handle.read(1)

            print("Calculated H2K is readable.")
            return

        except (PermissionError, FileNotFoundError) as exc:
            last_error = exc
            time.sleep(0.25)

    raise RuntimeError(
        f"Calculated H2K remained locked: {last_error}"
    )


def get_house_codes(path):
    root = ET.parse(path).getroot()

    codes = []

    for element in root.iter():
        tag = element.tag.split("}")[-1]

        if tag == "Results":
            codes.append(
                element.get(
                    "houseCode",
                    ""
                )
            )

    return codes


def verify_soc(path):
    codes = get_house_codes(path)

    print("")
    print(
        "House codes:",
        codes
    )

    for code in codes:
        if code.strip().upper() == "SOC":
            print("")
            print(
                "SUCCESS: SOC results found."
            )
            return

    raise RuntimeError(
        "Calculated H2K contains no SOC results."
    )


# --------------------------------------------------
# MAIN
# --------------------------------------------------

main = find_hot2000_main()

_, pid = (
    win32process.GetWindowThreadProcessId(main)
)

print(
    "HOT2000 PID:",
    pid
)

print(
    "HOT2000 handle:",
    main
)

print(
    "Title:",
    repr(win32gui.GetWindowText(main))
)

win32gui.ShowWindow(
    main,
    win32con.SW_RESTORE
)

time.sleep(1)


if os.path.exists(OUTPUT_PATH):
    print("")
    print(
        "Removing previous calculated.h2k..."
    )

    os.remove(
        OUTPUT_PATH
    )


print("")
print(
    "Starting HOT2000 calculation..."
)

calc_thread = threading.Thread(
    target=run_calculate,
    args=(main,),
    daemon=True
)

calc_thread.start()


wait_for_calculation(
    pid,
    calc_thread
)


print_visible_hot2000_windows(
    pid
)


save_as(
    main,
    pid,
    OUTPUT_PATH
)


wait_for_file(
    OUTPUT_PATH
)


close_current_house(
    main
)


wait_for_file_readable(
    OUTPUT_PATH
)


verify_soc(
    OUTPUT_PATH
)


print("")
print("=" * 60)
print(
    "HOT2000 CALCULATE + SAVE AS TEST PASSED"
)
print("=" * 60)