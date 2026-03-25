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

### 3. 上传并发送视频（curl）

从 `.env` 读取配置后，用 curl 完成上传和发送：

```bash
APP_ID=$(grep FEISHU_APP_ID .env | cut -d= -f2)
APP_SECRET=$(grep FEISHU_APP_SECRET .env | cut -d= -f2)
RECEIVE_ID=$(grep "^FEISHU_RECEIVE_USER_ID" .env | cut -d= -f2)
RECEIVE_ID_TYPE=$(grep "^FEISHU_RECEIVE_ID_TYPE" .env | cut -d= -f2)

TOKEN=$(curl -s -X POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}" \
  | python -c "import sys,json; print(json.load(sys.stdin)['tenant_access_token'])")

FILE_KEY=$(curl -s -X POST https://open.feishu.cn/open-apis/im/v1/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "file_type=stream" \
  -F "file_name=screen_record.mp4" \
  -F "file=@C:/tmp/screen_record.mp4;type=video/mp4" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d['data']['file_key']) if d.get('code')==0 else (_ for _ in ()).throw(Exception(d.get('msg')))")

curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=$RECEIVE_ID_TYPE" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"receive_id\":\"$RECEIVE_ID\",\"msg_type\":\"file\",\"content\":\"{\\\"file_key\\\":\\\"$FILE_KEY\\\"}\"}" \
  | python -c "import sys,json; d=json.load(sys.stdin); print('sent') if d.get('code')==0 else (_ for _ in ()).throw(Exception(d.get('msg')))"
```

## 注意事项

- 录制时务必后台运行，等完成通知后再上传
- 飞书上传必须用 `file_type: stream`，msg_type 用 `file`
- 输出路径固定为 `C:/tmp/screen_record.mp4`
- **不要用 Node.js fetch 上传文件**：在 MINGW64/Windows 环境下大文件 fetch 会报 `fetch failed`，用 curl 更稳定
