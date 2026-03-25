#!/bin/bash
# wechat-monitor.sh — 微信聊天监控，检测 @MYCC 触发
# 用法: wechat-monitor.sh [关键词，默认 MYCC]
# 后台运行: nohup wechat-monitor.sh &
# 输出: 检测到触发词时原子写入 /tmp/wechat-trigger（信号+内容合一）

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCR="$HOME/tools/ocr-env/bin/python3 $SCRIPT_DIR/ocr.py"
SIDEBAR=310
TITLE_H=50
INPUT_H=110
POLL=5
TRIGGER_KEYWORD="${1:-MYCC}"
TRIGGER_FILE="/tmp/wechat-trigger"
LATEST_FILE="/tmp/wechat-latest.txt"

LAST_HASH=""
LAST_TRIGGER_HASH=""
WARMUP=true
LAST_TRIGGER_TIME=0
COOLDOWN=20

PYTHON="$HOME/tools/ocr-env/bin/python3"

# 获取微信主窗口 ID + 尺寸
# 先试 OnScreenOnly（快），找不到再 fallback All（覆盖最小化）
# 优先选 Name='微信' 且最大的窗口
# 输出格式: "窗口ID 宽 高"
get_wechat_window_info() {
    $PYTHON -c "
import Quartz
for flag in [Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGWindowListOptionAll]:
    windows = Quartz.CGWindowListCopyWindowInfo(flag, Quartz.kCGNullWindowID)
    best = None
    for w in windows:
        owner = str(w.get('kCGWindowOwnerName', '') or '')
        if owner == '微信' or owner == 'WeChat':
            b = w.get('kCGWindowBounds', {})
            width = int(float(b.get('Width', 0)))
            height = int(float(b.get('Height', 0)))
            name = str(w.get('kCGWindowName', '') or '')
            if width > 400:
                score = width * height + (10000000 if name == '微信' else 0)
                if best is None or score > best[0]:
                    best = (score, w['kCGWindowNumber'], width, height)
    if best:
        print(f'{best[1]} {best[2]} {best[3]}')
        exit()
" 2>/dev/null
}

WIN_INFO=$(get_wechat_window_info)
WINDOW_ID=$(echo "$WIN_INFO" | awk '{print $1}')
WIN_W=$(echo "$WIN_INFO" | awk '{print $2}')
WIN_H=$(echo "$WIN_INFO" | awk '{print $3}')
if [ -z "$WINDOW_ID" ]; then
    echo "[monitor] 找不到微信窗口，等待..."
fi

echo "[monitor] 启动微信监控 $(date '+%H:%M:%S') [静默模式]"
echo "[monitor] 微信窗口 ID: ${WINDOW_ID:-未找到} (${WIN_W:-?}x${WIN_H:-?})"
echo "[monitor] 监听关键词: $TRIGGER_KEYWORD"
echo "[monitor] 触发文件: $TRIGGER_FILE"
echo "[monitor] 轮询间隔: ${POLL}s"

while true; do
    # 如果没有窗口 ID，重新获取
    if [ -z "$WINDOW_ID" ]; then
        WIN_INFO=$(get_wechat_window_info)
        WINDOW_ID=$(echo "$WIN_INFO" | awk '{print $1}')
        WIN_W=$(echo "$WIN_INFO" | awk '{print $2}')
        WIN_H=$(echo "$WIN_INFO" | awk '{print $3}')
        if [ -z "$WINDOW_ID" ]; then
            sleep $POLL
            continue
        fi
        echo "[monitor] 找到微信窗口 ID: $WINDOW_ID (${WIN_W}x${WIN_H})"
    fi

    W="$WIN_W"
    H="$WIN_H"

    # 静默截图（不激活窗口！）
    if ! screencapture -l "$WINDOW_ID" -x -o /tmp/wechat-monitor-full.png 2>/dev/null; then
        WINDOW_ID=""  # 窗口可能已关闭，重新查找
        sleep $POLL
        continue
    fi

    # 裁剪聊天区域（2x Retina）
    CROP_W=$(( (W - SIDEBAR) * 2 ))
    CROP_H=$(( (H - TITLE_H - INPUT_H) * 2 ))
    CROP_Y=$(( TITLE_H * 2 ))
    CROP_X=$(( SIDEBAR * 2 ))
    cp /tmp/wechat-monitor-full.png /tmp/wechat-monitor.png
    sips --cropToHeightWidth "$CROP_H" "$CROP_W" --cropOffset "$CROP_Y" "$CROP_X" /tmp/wechat-monitor.png >/dev/null 2>&1

    # OCR
    RESULT=$($OCR /tmp/wechat-monitor.png 2>/dev/null)
    # 只用文字内容算 hash（去掉 ocr 耗时行，避免每次时间不同导致 hash 变化）
    CURRENT_HASH=$(echo "$RESULT" | grep -v "^ocr:" | md5)

    if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
        # 内容变化了
        echo "$RESULT" > "$LATEST_FILE"
        echo "[monitor] 内容变化 $(date '+%H:%M:%S')"

        # 检查是否包含触发关键词（只对关键词行的纯文字算 hash，去掉坐标/置信度/空格噪声）
        TRIGGER_LINES=$(echo "$RESULT" | grep -i "$TRIGGER_KEYWORD")
        if [ -n "$TRIGGER_LINES" ]; then
            TRIGGER_HASH=$(echo "$TRIGGER_LINES" | sed 's/ *@ *(.*//' | sed 's/^ *\[.*\] *//' | tr -d ' ' | md5)
            if [ "$WARMUP" = true ]; then
                # 预热：记录初始状态，不触发
                echo "[monitor] 预热完成，记录现有 @${TRIGGER_KEYWORD} 状态"
                LAST_TRIGGER_HASH="$TRIGGER_HASH"
                WARMUP=false
            elif [ "$TRIGGER_HASH" != "$LAST_TRIGGER_HASH" ]; then
                NOW=$(date +%s)
                if [ $((NOW - LAST_TRIGGER_TIME)) -ge $COOLDOWN ]; then
                    echo ""
                    echo "[monitor] ====== @MYCC 触发! $(date '+%H:%M:%S') ======"
                    echo "$RESULT" > /tmp/wechat-trigger.tmp
                    mv /tmp/wechat-trigger.tmp /tmp/wechat-trigger
                    echo "$RESULT"
                    echo "[monitor] 已写入 /tmp/wechat-trigger（原子）"
                    echo "[monitor] ========================================="
                    LAST_TRIGGER_TIME=$NOW
                else
                    echo "[monitor] 冷却中，跳过 ($(($COOLDOWN - $NOW + $LAST_TRIGGER_TIME))s 后恢复)"
                fi
                LAST_TRIGGER_HASH="$TRIGGER_HASH"
            fi
        fi

        LAST_HASH="$CURRENT_HASH"
    fi

    sleep $POLL
done
