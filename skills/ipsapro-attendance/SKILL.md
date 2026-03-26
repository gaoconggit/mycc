---
name: ipsapro-attendance
description: 打开软通 iPSA 考勤系统，截图发微信。触发词："/ipsapro-attendance"、"看看考勤"、"打开考勤"、"查考勤"
---

# ipsapro-attendance - 查看考勤

打开软通动力 iPSA 专业服务系统的考勤管理页面，截图发到微信。

## 触发词

- "/ipsapro-attendance"
- "看看考勤"
- "打开考勤"
- "查考勤"

## 前置条件

- 环境变量 `IPSA_UserName` 和 `IPSA_PWD` 已配置
- mycc 后端已运行（发微信需要）
- 微信通道已 paired（用户已向 bot 发过消息）

## 执行步骤

### 1. 登录

adminlogin 路由无验证码，可全自动登录。每次执行都需重新登录（session 无法持久化）。

检查环境变量：
```bash
echo "用户名：$IPSA_UserName"
```
若为空，告知用户配置 `IPSA_UserName` 和 `IPSA_PWD`，终止执行。

打开登录页并填入账密：
```bash
agent-browser close 2>/dev/null; agent-browser open https://passport.isoftstone.com/adminlogin && agent-browser wait --load networkidle
agent-browser fill "input[type='text']" "$IPSA_UserName"
agent-browser fill "input[type='password']" "$IPSA_PWD"
agent-browser click "#BtnSubmit"
agent-browser wait --load networkidle
```

确认登录成功（URL 应跳转到 ipsapro.isoftstone.com）：
```bash
agent-browser get url
```
若 URL 仍含 `passport` / `login`，说明账密错误或登录失败，告知用户检查环境变量。

### 2. 打开考勤页面

```bash
agent-browser open https://ipsapro.isoftstone.com/portal/Special/hwkq && agent-browser wait --load load
```

确认页面已加载（URL 应含 `Attendance`）：
```bash
agent-browser get url
```

### 3. 截图

```bash
agent-browser set viewport 1920 1080 && agent-browser screenshot
```

记录截图路径（输出中的 `Screenshot saved to ...`）。

### 4. 发送通知（微信 + 飞书并行）

**发微信：**
```bash
curl -s -X POST http://localhost:18080/weixin/send-media \
  -H "Content-Type: application/json" \
  -d "{\"filePath\":\"<截图路径>\"}"
```

**发飞书：**（从 .env 读取配置，执行以下 node 脚本）
```bash
node -e "
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('E:/prj/mycc/.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split('=')));
const APP_ID = env.FEISHU_APP_ID?.trim();
const APP_SECRET = env.FEISHU_APP_SECRET?.trim();
const RECEIVE_ID = env.FEISHU_RECEIVE_USER_ID?.trim();
const RECEIVE_ID_TYPE = env.FEISHU_RECEIVE_ID_TYPE?.trim();
const IMG_PATH = '<截图路径>';

async function main() {
  const { tenant_access_token } = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  }).then(r => r.json());

  const form = new FormData();
  form.append('image_type', 'message');
  form.append('image', new Blob([fs.readFileSync(IMG_PATH)], { type: 'image/png' }), 'screenshot.png');
  const { data: { image_key } } = await fetch('https://open.feishu.cn/open-apis/im/v1/images', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + tenant_access_token }, body: form
  }).then(r => r.json());

  const result = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=' + RECEIVE_ID_TYPE, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tenant_access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receive_id: RECEIVE_ID, msg_type: 'image', content: JSON.stringify({ image_key }) })
  }).then(r => r.json());

  if (result.code === 0) console.log('sent'); else { console.error(result.msg); process.exit(1); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
"
```

## 结果处理

- **成功**：告知用户截图已发到微信和飞书
- **微信发送失败（Internal Server Error）**：微信通道未 paired，用户需先向 bot 发一条消息；飞书仍正常发送
- **微信发送失败（后端未运行）**：运行 `/mycc` 启动后端
- **飞书发送失败**：检查 .env 中 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_RECEIVE_USER_ID` 配置

## 注意事项

- adminlogin 的认证 token 存于内存，`state save/load` 无法恢复，每次必须重新登录
- 用无界面模式（默认）即可，无需 `--headed`
- 考勤页有持续网络请求，等待必须用 `--load load` 而非 `networkidle`（否则超时）
