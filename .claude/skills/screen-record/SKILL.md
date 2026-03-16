---
name: screen-record
description: 录制屏幕视频并发送到飞书。连续截图合成 mp4，通过飞书 API 上传发送。触发词："/screen-record"、"录屏发我"、"录制屏幕"、"录个视频发飞书"
---

# screen-record - 录屏发飞书

## 触发词

- "/screen-record"
- "录屏发我"
- "录制屏幕"
- "录个视频发飞书"

## 参数（从用户输入中提取）

- `duration`：录制时长，单位秒（默认 60）
- `fps`：帧率（默认 2）

## 执行步骤

### 1. 确认依赖

```bash
python -c "import imageio" 2>/dev/null || pip install imageio imageio-ffmpeg -q
```

### 2. 录制屏幕（后台运行）

用 `run_in_background=true` 后台录制，等通知完成后再继续。

```python
import time, imageio, pyautogui, numpy as np

output = 'C:/tmp/screen_record.mp4'
fps = 2        # 从用户输入替换
duration = 60  # 从用户输入替换
total = fps * duration

writer = imageio.get_writer(output, fps=fps, codec='libx264', quality=5)
for i in range(total):
    t = time.time()
    writer.append_data(np.array(pyautogui.screenshot()))
    elapsed = time.time() - t
    sleep_time = 1/fps - elapsed
    if sleep_time > 0:
        time.sleep(sleep_time)
writer.close()
print("done:", output)
```

### 3. 读取飞书配置

```bash
grep -E "FEISHU_APP_ID|FEISHU_APP_SECRET|FEISHU_RECEIVE_USER_ID|FEISHU_RECEIVE_ID_TYPE" .env
```

### 4. 上传并发送视频

```javascript
const form = new FormData();
form.append('file_type', 'stream');  // 必须用 stream，否则报类型不匹配
form.append('file_name', 'screen_record.mp4');
form.append('file', new Blob([fs.readFileSync('C:/tmp/screen_record.mp4')], { type: 'video/mp4' }), 'screen_record.mp4');
// POST https://open.feishu.cn/open-apis/im/v1/files 上传，取 file_key
// 发送时 msg_type 用 "file"，content: JSON.stringify({ file_key })
```

## 注意事项

- 录制时务必后台运行，等完成通知后再上传
- 飞书上传必须用 `file_type: stream`，msg_type 用 `file`
- 输出路径固定为 `C:/tmp/screen_record.mp4`
