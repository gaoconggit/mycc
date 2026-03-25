#!/bin/bash
# wechat-read.sh — 读取微信当前聊天内容（纯 OCR，零 token）
# 用法: wechat-read.sh [--bbox]
# 输出: OCR 识别的聊天文字（默认简洁模式，--bbox 返回 JSON）

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCR="$HOME/tools/ocr-env/bin/python3 $SCRIPT_DIR/ocr.py"
SIDEBAR=310    # 微信侧边栏固定宽度（图标60 + 列表250）
TITLE_H=50     # 顶部标题栏高度
INPUT_H=110    # 底部工具栏+输入框高度

BBOX_FLAG=""
if [[ "$1" == "--bbox" ]]; then
    BBOX_FLAG="--bbox"
fi

# 1. 动态获取窗口位置
POS=$(osascript -e 'tell application "System Events" to get {position, size} of window "微信" of process "WeChat"' 2>/dev/null)
if [ -z "$POS" ]; then
    echo "[error] 微信窗口未找到" >&2
    exit 1
fi

X=$(echo $POS | cut -d',' -f1 | tr -d ' ')
Y=$(echo $POS | cut -d',' -f2 | tr -d ' ')
W=$(echo $POS | cut -d',' -f3 | tr -d ' ')
H=$(echo $POS | cut -d',' -f4 | tr -d ' ')

# 2. 计算聊天内容区域（右侧，去掉标题栏和输入框）
CHAT_X=$((X + SIDEBAR))
CHAT_Y=$((Y + TITLE_H))
CHAT_W=$((W - SIDEBAR))
CHAT_H=$((H - TITLE_H - INPUT_H))

# 3. 激活微信 + 截图（同一个 osascript 防焦点抢夺）
osascript -e "
tell application \"WeChat\" to activate
delay 0.8
do shell script \"screencapture -x -R \\\"${CHAT_X},${CHAT_Y},${CHAT_W},${CHAT_H}\\\" /tmp/wechat-chat.png\"
" 2>/dev/null

# 4. OCR
$OCR /tmp/wechat-chat.png $BBOX_FLAG 2>/dev/null
