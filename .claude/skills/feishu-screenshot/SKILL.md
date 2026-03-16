---
name: feishu-screenshot
description: 截取当前屏幕并通过飞书 API 发送给用户。触发词："/feishu-screenshot"、"截图发飞书"、"发截图给我"、"截屏发飞书"
---

# feishu-screenshot - 截图发飞书

截取全屏截图，上传到飞书并发送给用户。

## 触发词

- "/feishu-screenshot"
- "截图发飞书"
- "发截图给我"
- "截屏发飞书"

## 执行步骤

### 1. 截图

```bash
mkdir -p /c/tmp && python .claude/skills/desktop/ctl_win.py screenshot C:/tmp/screenshot.png
```

### 2. 读取飞书配置

```bash
grep -n "FEISHU" .env
```

取以下字段：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_RECEIVE_USER_ID`（即 RECEIVE_ID）、`FEISHU_RECEIVE_ID_TYPE`

### 3. 上传并发送图片

```bash
node -e "
const fs = require('fs');
const APP_ID = '<FEISHU_APP_ID>';
const APP_SECRET = '<FEISHU_APP_SECRET>';
const RECEIVE_ID = '<FEISHU_RECEIVE_USER_ID>';
const RECEIVE_ID_TYPE = '<FEISHU_RECEIVE_ID_TYPE>';

async function main() {
  const { tenant_access_token } = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  }).then(r => r.json());

  const form = new FormData();
  form.append('image_type', 'message');
  form.append('image', new Blob([fs.readFileSync('C:/tmp/screenshot.png')], { type: 'image/png' }), 'screenshot.png');
  const { data: { image_key } } = await fetch('https://open.feishu.cn/open-apis/im/v1/images', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tenant_access_token },
    body: form
  }).then(r => r.json());

  const result = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=' + RECEIVE_ID_TYPE, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tenant_access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receive_id: RECEIVE_ID, msg_type: 'image', content: JSON.stringify({ image_key }) })
  }).then(r => r.json());

  if (result.code === 0) console.log('sent');
  else { console.error(result.msg); process.exit(1); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
"
```

## 结果处理

- 输出 `sent`：告知用户截图已发送到飞书
- 非零退出码：输出错误信息给用户
