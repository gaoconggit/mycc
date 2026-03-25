#!/bin/bash
# wechat-send-file.sh — 发送文件/图片到微信并自动验证
# 用法: wechat-send-file.sh /path/to/file
# 输出: 验证结果

if [ -z "$1" ] || [ ! -f "$1" ]; then
    echo "用法: wechat-send-file.sh /path/to/file" >&2
    echo "文件不存在: $1" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCR="$HOME/tools/ocr-env/bin/python3 $SCRIPT_DIR/ocr.py"
SIDEBAR=310
INPUT_H=110
FILEPATH=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")

# 1. 文件复制到剪贴板
osascript -e "set the clipboard to (POSIX file \"$FILEPATH\")" 2>/dev/null

# 2. 激活微信
osascript -e 'tell application "WeChat" to activate' 2>/dev/null
sleep 0.3

# 3. 动态获取窗口位置
POS=$(osascript -e 'tell application "System Events" to get {position, size} of window "微信" of process "WeChat"' 2>/dev/null)
if [ -z "$POS" ]; then
    echo "[error] 微信窗口未找到" >&2
    exit 1
fi

X=$(echo $POS | cut -d',' -f1 | tr -d ' ')
Y=$(echo $POS | cut -d',' -f2 | tr -d ' ')
W=$(echo $POS | cut -d',' -f3 | tr -d ' ')
H=$(echo $POS | cut -d',' -f4 | tr -d ' ')

# 4. 点击输入框
INPUT_X=$((X + SIDEBAR + (W - SIDEBAR) / 2))
INPUT_Y=$((Y + H - 50))
cliclick c:$INPUT_X,$INPUT_Y
sleep 0.1

# 5. 粘贴 + 回车发送
osascript -e 'tell application "System Events" to keystroke "v" using command down'
sleep 0.5
osascript -e 'tell application "System Events" to key code 36'

# 6. 等待 1 秒后 OCR 验证
sleep 1
BOX_X=$((X + SIDEBAR))
BOX_Y=$((Y + H - INPUT_H))
BOX_W=$((W - SIDEBAR))
BOX_H=$INPUT_H
osascript -e "do shell script \"screencapture -x -R \\\"${BOX_X},${BOX_Y},${BOX_W},${BOX_H}\\\" /tmp/wechat-inputbox.png\"" 2>/dev/null
RESULT=$($OCR /tmp/wechat-inputbox.png --bbox 2>/dev/null)
COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])" 2>/dev/null)

if [ "$COUNT" = "0" ]; then
    echo "[ok] 文件发送成功"
else
    echo "[warn] 输入框仍有内容（count=$COUNT），可能发送失败"
    echo "$RESULT"
fi
