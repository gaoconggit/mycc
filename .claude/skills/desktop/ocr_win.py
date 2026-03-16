#!/usr/bin/env python3
"""
AgentOS OCR 工具 — Windows.Media.Ocr (WinRT 原生)
用法:
  ocr_win.py <image_path>             # 全图 OCR，返回文字+坐标
  ocr_win.py <image_path> --bbox      # 返回带包围盒的 JSON
  ocr_win.py --cursor [--size WxH]    # 截鼠标周围区域并 OCR（默认 300x200）
  ocr_win.py --screen                 # 全屏截图并 OCR
  ocr_win.py --screen --bbox          # 全屏 OCR + 包围盒 JSON

依赖:
  pip install winrt-runtime winrt-Windows.Media.Ocr winrt-Windows.Graphics.Imaging winrt-Windows.Storage.Streams pillow
"""

import sys
import os
import json
import time
import asyncio
import tempfile
import ctypes


# ──── 截图 ───────────────────────────────────────────────────────────────────

def get_cursor_pos():
    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
    pt = POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
    return pt.x, pt.y


def screenshot_region(x, y, w, h, path):
    import mss
    import mss.tools
    with mss.mss() as sct:
        region = {"left": x, "top": y, "width": w, "height": h}
        img = sct.grab(region)
        mss.tools.to_png(img.rgb, img.size, output=path)


def screenshot_full(path):
    import mss
    import mss.tools
    with mss.mss() as sct:
        # monitors[0] 是所有显示器合并的虚拟桌面
        img = sct.grab(sct.monitors[0])
        mss.tools.to_png(img.rgb, img.size, output=path)


# ──── OCR（Windows.Media.Ocr via winsdk） ────────────────────────────────────

async def _do_ocr(image_path: str):
    try:
        from winrt.windows.media.ocr import OcrEngine
        from winrt.windows.graphics.imaging import BitmapDecoder
        from winrt.windows.storage.streams import InMemoryRandomAccessStream, DataWriter
    except ImportError:
        print("错误: 缺少 winrt 包，请运行: pip install winrt-runtime winrt-Windows.Media.Ocr winrt-Windows.Graphics.Imaging winrt-Windows.Storage.Streams", file=sys.stderr)
        sys.exit(1)

    # 用 BitmapDecoder 加载图片（支持 PNG/JPG 等，自动处理像素格式）
    with open(image_path, "rb") as f:
        data = f.read()

    ras = InMemoryRandomAccessStream()
    writer = DataWriter(ras)
    writer.write_bytes(data)
    await writer.store_async()
    writer.detach_stream()
    ras.seek(0)

    decoder = await BitmapDecoder.create_async(ras)
    sw_bitmap = await decoder.get_software_bitmap_async()

    img_w = decoder.pixel_width
    img_h = decoder.pixel_height

    # 创建 OCR 引擎（使用系统用户语言，需含中文包）
    engine = OcrEngine.try_create_from_user_profile_languages()
    if engine is None:
        print("错误: 无法创建 OCR 引擎，请在系统设置中安装中文 OCR 语言包", file=sys.stderr)
        sys.exit(1)

    t0 = time.time()
    result = await engine.recognize_async(sw_bitmap)
    elapsed = time.time() - t0

    items = []
    for line in result.lines:
        words = list(line.words)
        if not words:
            continue

        text = " ".join(w.text for w in words)

        # 取所有 word bounding_rect 的并集作为行坐标
        min_x = min(int(w.bounding_rect.x) for w in words)
        min_y = min(int(w.bounding_rect.y) for w in words)
        max_x = max(int(w.bounding_rect.x + w.bounding_rect.width) for w in words)
        max_y = max(int(w.bounding_rect.y + w.bounding_rect.height) for w in words)
        bw = max_x - min_x
        bh = max_y - min_y
        cx = min_x + bw // 2
        cy = min_y + bh // 2

        items.append({
            "text": text,
            "confidence": 1.0,  # Windows OCR 不提供置信度，固定 1.0
            "bbox": [min_x, min_y, bw, bh],
            "center": [cx, cy],
        })

    return {
        "elapsed_ms": int(elapsed * 1000),
        "count": len(items),
        "image_size": [img_w, img_h],
        "items": items,
    }


def ocr_image(image_path: str):
    return asyncio.run(_do_ocr(image_path))


# ──── 主程序 ─────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    bbox_mode = "--bbox" in args
    cursor_mode = "--cursor" in args
    screen_mode = "--screen" in args

    for flag in ["--bbox", "--cursor", "--screen"]:
        while flag in args:
            args.remove(flag)

    # 解析 --size WxH
    size_w, size_h = 300, 200
    if "--size" in sys.argv:
        idx = sys.argv.index("--size")
        if idx + 1 < len(sys.argv):
            parts = sys.argv[idx + 1].split("x")
            size_w, size_h = int(parts[0]), int(parts[1])
        if "--size" in args:
            args.remove("--size")
        size_str = f"{size_w}x{size_h}"
        if size_str in args:
            args.remove(size_str)

    tmp_path = None

    if cursor_mode:
        cx, cy = get_cursor_pos()
        left = max(0, cx - size_w // 2)
        top = max(0, cy - size_h // 2)
        tmp_path = tempfile.mktemp(suffix=".png")
        screenshot_region(left, top, size_w, size_h, tmp_path)
        image_path = tmp_path
        offset_x, offset_y = left, top
    elif screen_mode:
        tmp_path = tempfile.mktemp(suffix=".png")
        screenshot_full(tmp_path)
        image_path = tmp_path
        offset_x, offset_y = 0, 0
    elif args:
        image_path = args[0]
        offset_x, offset_y = 0, 0
    else:
        print(__doc__)
        sys.exit(1)

    result = ocr_image(image_path)

    # 应用屏幕坐标偏移（cursor/screen 模式下坐标要映射回屏幕绝对坐标）
    if offset_x or offset_y:
        for item in result["items"]:
            item["bbox"][0] += offset_x
            item["bbox"][1] += offset_y
            item["center"][0] += offset_x
            item["center"][1] += offset_y

    if cursor_mode:
        cx, cy = get_cursor_pos()
        result["cursor"] = [cx, cy]

    if bbox_mode:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        if cursor_mode:
            print(f"cursor: ({result['cursor'][0]},{result['cursor'][1]})  ocr: {result['elapsed_ms']}ms")
        else:
            print(f"ocr: {result['elapsed_ms']}ms, {result['count']} items")
        for item in result["items"]:
            x, y = item["center"]
            print(f"  [{item['confidence']:.2f}] {item['text']}  @ ({x},{y})")

    if tmp_path and os.path.exists(tmp_path):
        os.unlink(tmp_path)


if __name__ == "__main__":
    main()
