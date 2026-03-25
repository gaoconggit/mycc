#!/usr/bin/env python3
"""
AgentOS OCR 工具 — macOS Vision Framework
用法:
  ocr.py <image_path>                    # 全图 OCR，返回文字+坐标
  ocr.py <image_path> --bbox             # 返回带包围盒的 JSON
  ocr.py <image_path> --fast             # 快速模式（精度略低，速度更快）
  ocr.py --cursor [--size WxH]           # 截鼠标周围区域并 OCR（默认 300x200）
  ocr.py --screen                        # 全屏截图并 OCR
  ocr.py --screen --bbox                 # 全屏 OCR + 包围盒 JSON
"""
import sys
import os
import json
import time
import subprocess
import tempfile

def get_cursor_pos():
    result = subprocess.run(["cliclick", "p:."], capture_output=True, text=True)
    parts = result.stdout.strip().split(",")
    return int(parts[0]), int(parts[1])

def screenshot_region(x, y, w, h, path):
    subprocess.run(["screencapture", "-x", "-R", f"{x},{y},{w},{h}", path], check=True)

def screenshot_full(path):
    subprocess.run(["screencapture", "-x", path], check=True)

def ocr_image(image_path, fast=False, bbox=False):
    import Vision
    import Quartz
    from Foundation import NSURL

    url = NSURL.fileURLWithPath_(image_path)
    source = Quartz.CGImageSourceCreateWithURL(url, None)
    if source is None:
        print(f"Error: Cannot load image {image_path}", file=sys.stderr)
        return None
    cgImage = Quartz.CGImageSourceCreateImageAtIndex(source, 0, None)
    if cgImage is None:
        print(f"Error: Cannot decode image {image_path}", file=sys.stderr)
        return None

    request = Vision.VNRecognizeTextRequest.alloc().init()
    level = Vision.VNRequestTextRecognitionLevelFast if fast else Vision.VNRequestTextRecognitionLevelAccurate
    request.setRecognitionLevel_(level)
    request.setRecognitionLanguages_(["zh-Hans", "en-US"])
    request.setUsesLanguageCorrection_(True)

    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cgImage, None)
    start = time.time()
    success, error = handler.performRequests_error_([request], None)
    elapsed = time.time() - start

    if not success:
        print(f"OCR Error: {error}", file=sys.stderr)
        return None

    results = request.results()
    imageW = Quartz.CGImageGetWidth(cgImage)
    imageH = Quartz.CGImageGetHeight(cgImage)

    items = []
    for obs in results:
        candidate = obs.topCandidates_(1)
        if not candidate:
            continue
        text = candidate[0].string()
        conf = obs.confidence()
        box = obs.boundingBox()
        # 转换归一化坐标到像素坐标
        px = int(box.origin.x * imageW)
        py = int((1 - box.origin.y - box.size.height) * imageH)
        pw = int(box.size.width * imageW)
        ph = int(box.size.height * imageH)
        cx = px + pw // 2
        cy = py + ph // 2
        items.append({
            "text": text,
            "confidence": round(conf, 2),
            "bbox": [px, py, pw, ph],
            "center": [cx, cy]
        })

    return {
        "elapsed_ms": int(elapsed * 1000),
        "count": len(items),
        "image_size": [imageW, imageH],
        "items": items
    }

def main():
    args = sys.argv[1:]
    fast = "--fast" in args
    bbox_mode = "--bbox" in args
    cursor_mode = "--cursor" in args
    screen_mode = "--screen" in args

    # 清理标志参数
    for flag in ["--fast", "--bbox", "--cursor", "--screen"]:
        while flag in args:
            args.remove(flag)

    # 解析 --size
    size_w, size_h = 300, 200
    if "--size" in sys.argv:
        idx = sys.argv.index("--size")
        if idx + 1 < len(sys.argv):
            parts = sys.argv[idx + 1].split("x")
            size_w, size_h = int(parts[0]), int(parts[1])
        if "--size" in args:
            args.remove("--size")
        if sys.argv[idx + 1] in args:
            args.remove(sys.argv[idx + 1])

    tmp_path = None

    if cursor_mode:
        cx, cy = get_cursor_pos()
        left = max(0, cx - size_w // 2)
        top = max(0, cy - size_h // 2)
        tmp_path = tempfile.mktemp(suffix=".png")
        screenshot_region(left, top, size_w, size_h, tmp_path)
        image_path = tmp_path
        # OCR 后坐标要加上偏移
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

    result = ocr_image(image_path, fast=fast)
    if result is None:
        sys.exit(1)

    # 应用屏幕坐标偏移
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
        # 简洁文本输出
        if cursor_mode:
            print(f"cursor: ({result['cursor'][0]},{result['cursor'][1]})  ocr: {result['elapsed_ms']}ms")
        else:
            print(f"ocr: {result['elapsed_ms']}ms, {result['count']} items")
        for item in result["items"]:
            cx, cy = item["center"]
            print(f"  [{item['confidence']:.2f}] {item['text']}  @ ({cx},{cy})")

    # 清理临时文件
    if tmp_path and os.path.exists(tmp_path):
        os.unlink(tmp_path)

if __name__ == "__main__":
    main()
