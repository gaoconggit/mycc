#!/bin/bash
# wechat-send.sh — 发送微信消息并自动验证（纯 OCR，零 token）
# 用法: wechat-send.sh "消息内容"
# 输出: 验证结果（count==0 表示发送成功）

if [ -z "$1" ]; then
    echo "用法: wechat-send.sh \"消息内容\"" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCR="$HOME/tools/ocr-env/bin/python3 $SCRIPT_DIR/ocr.py"
SIDEBAR=310
INPUT_H=110

# 1. 复制到剪贴板
echo -n "$1" | pbcopy

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

# 4. 点击输入框（右侧面板中央，距底部 50px）
INPUT_X=$((X + SIDEBAR + (W - SIDEBAR) / 2))
INPUT_Y=$((Y + H - 50))
cliclick c:$INPUT_X,$INPUT_Y
sleep 0.1

# 5. 粘贴 + 回车发送
osascript -e 'tell application "System Events" to keystroke "v" using command down'
sleep 0.2
osascript -e 'tell application "System Events" to key code 36'

# 6. 等待 1 秒后 OCR 验证输入框
sleep 1
BOX_X=$((X + SIDEBAR))
BOX_Y=$((Y + H - INPUT_H))
BOX_W=$((W - SIDEBAR))
BOX_H=$INPUT_H
osascript -e "do shell script \"screencapture -x -R \\\"${BOX_X},${BOX_Y},${BOX_W},${BOX_H}\\\" /tmp/wechat-inputbox.png\"" 2>/dev/null
RESULT=$($OCR /tmp/wechat-inputbox.png --bbox 2>/dev/null)
COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])" 2>/dev/null)

if [ "$COUNT" = "0" ]; then
    echo "[ok] 发送成功"
else
    echo "[warn] 输入框仍有内容（count=$COUNT），可能发送失败"
    echo "$RESULT"
fi
