import os
import time
import xml.etree.ElementTree as ET

import win32con
import win32gui
import win32process

from pywinauto import Desktop


OPEN_COMMAND = 57601
CALCULATE_COMMAND = 29791
SAVE_AS_COMMAND = 57604

INPUT_H2K = r"C:\HOT2000Worker\test\input.h2k"
OUTPUT_H2K = r"C:\HOT2000Worker\test\calculated.h2k"


def find_hot2000_main():
    matches = []

    def callback(hwnd, _):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                return

            title = win32gui.GetWindowText(hwnd)
            class_name = win32gui.GetClassName(hwnd)

            if (
                title == "HOT2000"
                and class_name.startswith("Afx:")
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


def find_dialog(pid, wanted_title=None):
    matches = []

    def callback(hwnd, _):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                return

            _, window_pid = (
                win32process.GetWindowThreadProcessId(hwnd)
            )

            if window_pid != pid:
                return

            class_name = win32gui.GetClassName(hwnd)
            title = win32gui.GetWindowText(hwnd)

            if class_name == "#32770":
                if (
                    wanted_title is None
                    or wanted_title.lower() in title.lower()
                ):
                    matches.append(hwnd)

        except Exception:
            pass

    win32gui.EnumWindows(callback, None)

    return matches[0] if matches else None


def wait_for_dialog(pid, title, timeout=15):
    start = time.time()

    while time.time() - start < timeout:
        hwnd = find_dialog(pid, title)

        if hwnd:
            return hwnd

        time.sleep(0.25)

    raise RuntimeError(
        f"Dialog not found: {title}"
    )


def enter_filename_and_click(dialog_hwnd, path, button_title):
    import time

    from pywinauto import Desktop
    from pywinauto.keyboard import send_keys

    dialog = Desktop(
        backend="win32"
    ).window(
        handle=dialog_hwnd
    )

    dialog.set_focus()

    filename_box = dialog.child_window(
        best_match="File &name:Edit"
    )

    filename_box.set_focus()

    filename_box.set_edit_text(
        path
    )

    print("File name entered:")
    print(path)

    time.sleep(1)

    # Press Enter to activate the default Open/Save button
    send_keys("{ENTER}")

    print("Enter pressed.")

    # Wait for dialog to close
    for _ in range(20):
        if not dialog.exists():
            print("Dialog closed successfully.")
            return

        time.sleep(0.25)

    raise RuntimeError(
        "Dialog did not close after pressing Enter."
    )

def count_soc(path):
    if not os.path.exists(path):
        return 0, []

    root = ET.parse(path).getroot()

    soc_count = 0
    codes = []

    for element in root.iter():
        tag = element.tag.split("}")[-1]

        if tag == "Results":
            code = (
                element.get("houseCode", "")
                .strip()
            )

            codes.append(code)

            if code.upper() == "SOC":
                soc_count += 1

    return soc_count, codes


if not os.path.exists(INPUT_H2K):
    raise RuntimeError(
        "Input file does not exist."
    )


if os.path.exists(OUTPUT_H2K):
    os.remove(OUTPUT_H2K)


soc_before, codes_before = count_soc(
    INPUT_H2K
)

print("INPUT:")
print(INPUT_H2K)

print("")
print("Before calculation:")
print("SOC count:", soc_before)
print("House codes:", codes_before)


main_hwnd = find_hot2000_main()

_, pid = (
    win32process.GetWindowThreadProcessId(
        main_hwnd
    )
)

print("")
print("HOT2000 found.")
print("PID:", pid)
print("Handle:", main_hwnd)


# -----------------------------------------
# OPEN INPUT FILE
# -----------------------------------------

print("")
print("Opening input H2K...")

win32gui.PostMessage(
    main_hwnd,
    win32con.WM_COMMAND,
    OPEN_COMMAND,
    0
)

open_hwnd = wait_for_dialog(
    pid,
    "Open"
)

enter_filename_and_click(
    open_hwnd,
    INPUT_H2K,
    "&Open"
)

print("Input file opened.")

time.sleep(5)


# -----------------------------------------
# CALCULATE
# -----------------------------------------

print("")
print("Sending Calculate command...")

result = win32gui.PostMessage(
    main_hwnd,
    win32con.WM_COMMAND,
    CALCULATE_COMMAND,
    0
)

print("Calculate screen opened.")

print("")
print("Waiting 45 seconds...")

for second in range(1, 46):
    if second % 5 == 0:
        print(
            f"Waiting: {second}/45 sec"
        )

    time.sleep(1)


# -----------------------------------------
# SAVE AS
# -----------------------------------------

print("")
print("Sending Save As command...")

win32gui.PostMessage(
    main_hwnd,
    win32con.WM_COMMAND,
    SAVE_AS_COMMAND,
    0
)

save_hwnd = wait_for_dialog(
    pid,
    "Save"
)

print(
    "Save As dialog found:",
    save_hwnd
)

enter_filename_and_click(
    save_hwnd,
    OUTPUT_H2K,
    "&Save"
)

print(
    "Save requested:",
    OUTPUT_H2K
)


# -----------------------------------------
# HANDLE POSSIBLE OVERWRITE DIALOG
# -----------------------------------------

time.sleep(2)

overwrite = find_dialog(
    pid,
    "Confirm"
)

if overwrite:
    dialog = Desktop(
        backend="win32"
    ).window(
        handle=overwrite
    )

    try:
        dialog.child_window(
            title="&Yes",
            class_name="Button"
        ).click()

    except Exception:
        pass


# -----------------------------------------
# WAIT FOR OUTPUT FILE
# -----------------------------------------

print("")
print("Waiting for output file...")

for _ in range(20):
    if os.path.exists(OUTPUT_H2K):
        break

    time.sleep(0.5)


if not os.path.exists(OUTPUT_H2K):
    raise RuntimeError(
        "calculated.h2k was not created."
    )


print("Output file created.")

soc_after, codes_after = count_soc(
    OUTPUT_H2K
)

print("")
print("OUTPUT:")
print(OUTPUT_H2K)

print("")
print("After calculation:")
print("SOC count:", soc_after)
print("House codes:", codes_after)


if soc_after > 0:
    print("")
    print("SUCCESS")
    print(
        "HOT2000 produced an SOC result."
    )

else:
    print("")
    print("NO SOC RESULT")
    print(
        "Calculate command did not "
        "produce SOC in saved output."
    )