#!/usr/bin/env python3
"""
AgentOS 桌面控制工具 — Windows
替代 macOS 的 cliclick + osascript

用法:
  ctl_win.py pos                           # 获取鼠标当前坐标（输出: x,y）
  ctl_win.py move x,y                      # 移动鼠标（不点击）
  ctl_win.py click x,y                     # 左键单击
  ctl_win.py dclick x,y                    # 双击
  ctl_win.py rclick x,y                    # 右键单击
  ctl_win.py type "文字内容"               # 输入文字（走剪贴板，支持中文/Unicode）
  ctl_win.py key enter                     # 按键（enter/tab/esc/delete/backspace/...）
  ctl_win.py hotkey ctrl+c                 # 快捷键组合（+分隔）
  ctl_win.py windows                       # 列出所有可见窗口（JSON）
  ctl_win.py activate "窗口标题"           # 激活/前台显示窗口（支持模糊匹配）
  ctl_win.py screenshot [path]             # 全屏截图，输出保存路径
  ctl_win.py screenshot-region x,y,w,h [path]  # 局部截图

依赖:
  pip install pyautogui pyperclip pywin32 pillow
"""

import sys
import json
import ctypes
import time
import tempfile


# ──── 鼠标操作 ────────────────────────────────────────────────────────────────

def cmd_pos():
    """获取鼠标坐标（不依赖 pyautogui，用 ctypes 直接调 Win32 API）"""
    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
    pt = POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
    print(f"{pt.x},{pt.y}")


def _parse_xy(arg):
    parts = arg.split(",")
    return int(parts[0]), int(parts[1])


def cmd_move(arg):
    import pyautogui
    x, y = _parse_xy(arg)
    pyautogui.moveTo(x, y, duration=0.1)


def cmd_click(arg):
    import pyautogui
    x, y = _parse_xy(arg)
    pyautogui.click(x, y)


def cmd_dclick(arg):
    import pyautogui
    x, y = _parse_xy(arg)
    pyautogui.doubleClick(x, y)


def cmd_rclick(arg):
    import pyautogui
    x, y = _parse_xy(arg)
    pyautogui.rightClick(x, y)


# ──── 键盘操作 ────────────────────────────────────────────────────────────────

def cmd_type(text):
    """输入文字，走剪贴板粘贴（支持中文和所有 Unicode 字符）"""
    import pyperclip
    import pyautogui
    old = pyperclip.paste()
    try:
        pyperclip.copy(text)
        time.sleep(0.05)
        pyautogui.hotkey("ctrl", "v")
        time.sleep(0.1)
    finally:
        pyperclip.copy(old)  # 恢复剪贴板


def cmd_key(key_name):
    import pyautogui
    # 名称映射（兼容 macOS cliclick 的命名习惯）
    key_map = {
        "return": "enter",
        "kp:return": "enter",
        "kp:tab": "tab",
        "kp:escape": "escape",
        "kp:delete": "backspace",
        "del": "delete",
        "esc": "escape",
        "bs": "backspace",
    }
    key = key_map.get(key_name.lower(), key_name.lower())
    pyautogui.press(key)


def cmd_hotkey(combo):
    """快捷键，如 ctrl+c / ctrl+shift+s / alt+f4"""
    import pyautogui
    keys = [k.strip() for k in combo.lower().split("+")]
    pyautogui.hotkey(*keys)


# ──── 窗口操作 ────────────────────────────────────────────────────────────────

def cmd_windows():
    """列出所有可见窗口（JSON 数组）"""
    import win32gui
    results = []

    def _callback(hwnd, _):
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            if title:
                try:
                    rect = win32gui.GetWindowRect(hwnd)
                    x, y, x2, y2 = rect
                    results.append({
                        "hwnd": hwnd,
                        "title": title,
                        "rect": [x, y, x2 - x, y2 - y],
                    })
                except Exception:
                    pass

    win32gui.EnumWindows(_callback, None)
    print(json.dumps(results, ensure_ascii=False, indent=2))


def cmd_activate(title):
    """激活窗口，支持精确匹配和模糊匹配"""
    import win32gui
    import win32con

    # 先精确匹配
    hwnd = win32gui.FindWindow(None, title)

    # 再模糊匹配（包含子串）
    if not hwnd:
        matches = []

        def _callback(h, _):
            t = win32gui.GetWindowText(h)
            if title in t and win32gui.IsWindowVisible(h):
                matches.append(h)

        win32gui.EnumWindows(_callback, None)
        if matches:
            hwnd = matches[0]

    if hwnd:
        try:
            import win32api
            import win32process
            # 解除 Windows 前台窗口限制：附加到当前前台窗口的线程
            cur_hwnd = win32gui.GetForegroundWindow()
            cur_tid = win32process.GetWindowThreadProcessId(cur_hwnd)[0]
            new_tid = win32process.GetWindowThreadProcessId(hwnd)[0]
            if cur_tid != new_tid:
                ctypes.windll.user32.AttachThreadInput(new_tid, cur_tid, True)
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.SetForegroundWindow(hwnd)
            if cur_tid != new_tid:
                ctypes.windll.user32.AttachThreadInput(new_tid, cur_tid, False)
            print(f"activated: {win32gui.GetWindowText(hwnd)}")
        except Exception as e:
            print(f"error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print(f"error: window not found: {title}", file=sys.stderr)
        sys.exit(1)


# ──── 截图 ────────────────────────────────────────────────────────────────────

def cmd_screenshot(args):
    import mss
    import mss.tools
    path = args[0] if args else tempfile.mktemp(suffix=".png")
    with mss.mss() as sct:
        img = sct.grab(sct.monitors[0])
        mss.tools.to_png(img.rgb, img.size, output=path)
    print(path)


def cmd_screenshot_region(args):
    import mss
    import mss.tools
    if not args:
        print("error: 缺少参数 x,y,w,h", file=sys.stderr)
        sys.exit(1)
    x, y, w, h = map(int, args[0].split(","))
    path = args[1] if len(args) > 1 else tempfile.mktemp(suffix=".png")
    with mss.mss() as sct:
        region = {"left": x, "top": y, "width": w, "height": h}
        img = sct.grab(region)
        mss.tools.to_png(img.rgb, img.size, output=path)
    print(path)


# ──── 主程序 ─────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    cmd = args[0].lower()
    rest = args[1:]

    try:
        if cmd == "pos":
            cmd_pos()
        elif cmd == "move":
            if not rest:
                print("error: move 需要参数 x,y", file=sys.stderr); sys.exit(1)
            cmd_move(rest[0])
        elif cmd == "click":
            if not rest:
                print("error: click 需要参数 x,y", file=sys.stderr); sys.exit(1)
            cmd_click(rest[0])
        elif cmd == "dclick":
            if not rest:
                print("error: dclick 需要参数 x,y", file=sys.stderr); sys.exit(1)
            cmd_dclick(rest[0])
        elif cmd == "rclick":
            if not rest:
                print("error: rclick 需要参数 x,y", file=sys.stderr); sys.exit(1)
            cmd_rclick(rest[0])
        elif cmd == "type":
            if not rest:
                print("error: type 需要参数 \"文字\"", file=sys.stderr); sys.exit(1)
            cmd_type(rest[0])
        elif cmd == "key":
            if not rest:
                print("error: key 需要参数（如 enter/tab/esc）", file=sys.stderr); sys.exit(1)
            cmd_key(rest[0])
        elif cmd == "hotkey":
            if not rest:
                print("error: hotkey 需要参数（如 ctrl+c）", file=sys.stderr); sys.exit(1)
            cmd_hotkey(rest[0])
        elif cmd == "windows":
            cmd_windows()
        elif cmd == "activate":
            if not rest:
                print("error: activate 需要窗口标题", file=sys.stderr); sys.exit(1)
            cmd_activate(rest[0])
        elif cmd == "screenshot":
            cmd_screenshot(rest)
        elif cmd == "screenshot-region":
            cmd_screenshot_region(rest)
        else:
            print(f"error: 未知命令 {cmd!r}", file=sys.stderr)
            print(__doc__)
            sys.exit(1)
    except ImportError as e:
        print(f"错误: 缺少依赖 — {e}", file=sys.stderr)
        print("请运行: pip install pyautogui pyperclip pywin32 pillow", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
