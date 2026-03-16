---
name: desktop
description: 桌面操控。让 CC 看屏幕、动鼠标、点按钮、输文字。基于 macOS 原生 OCR 触觉反馈，不截全屏传 AI，极致省 token。触发词："/desktop"、"帮我操作桌面"、"点一下那个按钮"、"看看屏幕上有什么"
layer: 基础层
authorization: B区（执行后通知）
output_levels: L1
status: intern
intern_start: 2026-03-03
intern_end: 2026-04-02
---

# Desktop — CC 桌面操控

## 核心理念：触觉反馈

不截全屏传 AI（慢、贵），而是用 macOS 原生 OCR 当"触觉"。
鼠标移到哪 → OCR 哪 → Agent 知道手在哪、摸到什么。

## CLI 工具栈

所有操作通过 Bash 调 CLI 工具完成：

```bash
# ===== 眼（感知） =====

# OCR 工具路径（ocr.py 在本 skill 目录下，venv 在 ~/tools/ocr-env/）
SKILL_DIR=".claude/skills/desktop"
OCR="$HOME/tools/ocr-env/bin/python3 $SKILL_DIR/ocr.py"

# 全屏 OCR（快速模式，~240ms，注意：中文必须用精确模式）
$OCR --screen --fast

# 全屏 OCR + JSON 包围盒（精确模式，~870ms）
$OCR --screen --bbox

# 鼠标附近 OCR（触觉，~250ms，默认 300x200）
$OCR --cursor

# 鼠标附近 OCR + JSON（带可点击坐标）
$OCR --cursor --bbox

# 鼠标附近 OCR（自定义区域大小）
$OCR --cursor --size 200x100

# 指定图片 OCR
$OCR /path/to/image.png

# ===== 手（操控） =====

# 获取鼠标位置
cliclick p:.

# 移动鼠标
cliclick m:500,300

# 点击
cliclick c:500,300

# 双击
cliclick dc:500,300

# 右键
cliclick rc:500,300

# 输入文字
cliclick t:"Hello World"

# 按键（回车、Tab 等）
# 注意：cliclick kp:return 在微信等部分应用中无效，优先用 osascript
osascript -e 'tell application "System Events" to key code 36'   # Return（推荐）
cliclick kp:return                                                # Return（备选）
cliclick kp:tab
cliclick kp:escape

# 键盘快捷键
osascript -e 'tell application "System Events" to keystroke "c" using command down'
osascript -e 'tell application "System Events" to keystroke "v" using command down'
osascript -e 'tell application "System Events" to keystroke "s" using command down'
osascript -e 'tell application "System Events" to keystroke "a" using command down'

# ===== 感知（窗口/应用状态） =====

# 当前可见应用列表
osascript -e 'tell application "System Events" to get name of every process whose visible is true'

# 当前前台窗口信息
osascript -e 'tell application "System Events" to get {name, position, size} of every window of (first process whose frontmost is true)'

# 切换到指定应用
osascript -e 'tell application "APP_NAME" to activate'

# 点击菜单
osascript -e 'tell application "System Events" to click menu item "ITEM" of menu "MENU" of menu bar 1 of process "APP"'

# 全屏截图（传 Claude 视觉兜底时用）
screencapture -x /tmp/desktop-screenshot.png

# 局部截图
screencapture -x -R "x,y,w,h" /tmp/desktop-region.png
```

## 操作流程

### 标准流程：点击按钮

```
1. 全屏 OCR 找目标
   $OCR --screen --fast
   → 找到 "保存" @ (550, 300)

2. 移动鼠标 + 触觉确认
   cliclick m:550,300
   $OCR --cursor --size 200x100
   → 确认 "保存" 在鼠标下方 ✓

3. 点击
   cliclick c:550,300

4. 触觉验证结果
   $OCR --cursor
   → 确认操作成功
```

### 快捷流程：已知坐标直接点

```
cliclick c:550,300
```

### 文字输入

```
1. 点击输入框
   cliclick c:400,200

2. 清空（全选+删除）
   osascript -e 'tell application "System Events" to keystroke "a" using command down'
   cliclick kp:delete

3. 输入文字
   cliclick t:"要输入的内容"
```

### OCR 找不到时的兜底

```
1. 全屏截图
   screencapture -x /tmp/desktop-screenshot.png

2. 用 Read 工具读取截图（Claude 视觉）
   → Claude 自动分析截图内容

3. 根据 Claude 的分析结果决定操作
```

## 安全规则

| 级别 | 操作 | 策略 |
|------|------|------|
| 绿色 | 截图、OCR、读剪贴板、列窗口、移动鼠标 | 自动执行 |
| 黄色 | 点击、输入文字、切换窗口 | 执行并告知用户 |
| 红色 | 涉及密码、支付、删除、发消息 | 先问用户 |

**禁区**：
- 不操控 Terminal/iTerm（防 GUI 绕过权限控制）
- 不输入密码
- 不操作支付页面
- 不修改系统安全设置

## OCR 输出格式

### 简洁模式（默认）
```
cursor: (516,703)  ocr: 277ms
  [0.50] 上线的时候记得把密码改强一点  @ (665,678)
  [0.50] 己置那个上游的api 呢？  @ (508,744)
```

### JSON 模式（--bbox）
```json
{
  "cursor": [516, 703],
  "elapsed_ms": 243,
  "items": [
    {
      "text": "保存",
      "confidence": 0.98,
      "bbox": [540, 290, 60, 30],
      "center": [570, 305]
    }
  ]
}
```

`center` 是文字中心坐标，可直接传给 `cliclick c:` 点击。

## 性能参考

| 操作 | 耗时 |
|------|------|
| 鼠标移动/点击 | < 10ms |
| 局部 OCR（300x200） | ~250ms |
| 全屏 OCR（快速） | ~240ms |
| 全屏 OCR（精确） | ~870ms |
| 获取窗口列表 | < 50ms |

---

## Windows 版

### 工具栈

macOS 的 `cliclick` + `osascript` + `Vision Framework` 在 Windows 上的对应实现：

| macOS | Windows |
|-------|---------|
| `ocr.py`（Vision Framework）| `ocr_win.py`（Windows.Media.Ocr WinRT）|
| `cliclick` | `ctl_win.py`（pyautogui + Win32 API）|
| `osascript` | `ctl_win.py activate/windows` |
| `screencapture` | `ctl_win.py screenshot` |

### 安装依赖

```bash
pip install winrt-runtime "winrt-Windows.Media.Ocr" "winrt-Windows.Graphics.Imaging" "winrt-Windows.Storage.Streams" "winrt-Windows.Foundation.Collections" mss pyautogui pyperclip pywin32
```

> OCR 还需要在「Windows 设置 → 时间和语言 → 语言」中安装中文语言包。

### CLI 命令速查

```bash
SKILL_DIR=".claude/skills/desktop"
OCR="python $SKILL_DIR/ocr_win.py"
CTL="python $SKILL_DIR/ctl_win.py"

# ===== 眼（感知） =====

# 全屏 OCR（简洁输出）
$OCR --screen

# 全屏 OCR + JSON 包围盒
$OCR --screen --bbox

# 鼠标附近 OCR（触觉，默认 300x200）
$OCR --cursor

# 鼠标附近 OCR + JSON（带可点击坐标）
$OCR --cursor --bbox

# 鼠标附近 OCR（自定义区域）
$OCR --cursor --size 200x100

# 指定图片 OCR
$OCR /path/to/image.png

# ===== 手（操控） =====

# 获取鼠标位置
$CTL pos

# 移动鼠标
$CTL move 500,300

# 点击
$CTL click 500,300

# 双击
$CTL dclick 500,300

# 右键
$CTL rclick 500,300

# 输入文字（走剪贴板，支持中文）
$CTL type "Hello World"
$CTL type "你好世界"

# 按键
$CTL key enter
$CTL key tab
$CTL key esc
$CTL key delete

# 快捷键
$CTL hotkey ctrl+c
$CTL hotkey ctrl+v
$CTL hotkey ctrl+s
$CTL hotkey ctrl+a
$CTL hotkey alt+f4

# ===== 感知（窗口/应用状态） =====

# 列出所有可见窗口（JSON）
$CTL windows

# 激活指定窗口（支持模糊匹配）
$CTL activate "微信"
$CTL activate "Chrome"

# 全屏截图（传 Claude 视觉兜底时用）
$CTL screenshot /tmp/desktop-screenshot.png

# 局部截图
$CTL screenshot-region x,y,w,h /tmp/region.png
```

### 操作流程

与 macOS 版完全相同，只需替换工具变量：

```bash
# 标准流程：点击按钮
1. 全屏 OCR 找目标
   $OCR --screen --bbox
   → 找到 "保存" @ center:[550, 300]

2. 移动鼠标 + 触觉确认
   $CTL move 550,300
   $OCR --cursor --size 200x100
   → 确认 "保存" 在鼠标下方 ✓

3. 点击
   $CTL click 550,300

4. 触觉验证结果
   $OCR --cursor
```

### 注意事项

- **Windows OCR 无置信度**：confidence 固定返回 1.0，忽略该字段
- **中文输入用 type 命令**：走剪贴板粘贴，`$CTL type "你好"`，不要用 `key` 逐字输入
- **窗口激活限制**：部分 UWP 应用 `SetForegroundWindow` 可能无效，可先手动点击一次
- **多显示器**：截图使用 `all_screens=True`，OCR 坐标对应全虚拟桌面坐标

### OCR 输出格式

与 macOS 版完全相同：

**简洁模式（默认）**
```
cursor: (516,703)  ocr: 180ms
  [1.00] 保存  @ (550,300)
  [1.00] 取消  @ (650,300)
```

**JSON 模式（--bbox）**
```json
{
  "cursor": [516, 703],
  "elapsed_ms": 180,
  "items": [
    {
      "text": "保存",
      "confidence": 1.0,
      "bbox": [520, 285, 60, 30],
      "center": [550, 300]
    }
  ]
}
```

`center` 是文字中心坐标，可直接传给 `$CTL click` 点击。

---

## 微信操控脚本

本 skill 目录下有三个微信操控脚本，封装了完整的读/发/验证流程：

```bash
SKILL_DIR=".claude/skills/desktop"

# 读取当前聊天内容（OCR 聊天区域，排除标题栏和输入框）
$SKILL_DIR/wechat-read.sh              # 简洁文字
$SKILL_DIR/wechat-read.sh --bbox       # JSON 包围盒

# 发送文字消息（自动验证：OCR 输入框 count==0 = 成功）
$SKILL_DIR/wechat-send.sh "消息内容"

# 发送文件/图片（剪贴板 POSIX file → 粘贴 → 回车 → OCR 验证）
$SKILL_DIR/wechat-send-file.sh /path/to/file
```

### 使用前提
- 微信已打开并停留在目标聊天窗口
- 需要 cliclick（`brew install cliclick`）
- 需要 OCR 环境（`~/tools/ocr-env/`，pyobjc + Vision Framework）

### 关键参数（脚本内固定）
- `SIDEBAR=310`：微信侧边栏固定宽度（图标60 + 列表250）
- `TITLE_H=50`：顶部标题栏高度
- `INPUT_H=110`：底部输入框+工具栏高度

### 注意事项
- **中文 OCR 不用 --fast**：fast 模式中文乱码，脚本默认用精确模式
- **坐标动态获取**：每次操作前 `osascript get {position, size}`，不硬编码
- **焦点防抢**：activate + delay 写在同一个 osascript block 里
