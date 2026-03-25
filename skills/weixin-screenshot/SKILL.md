---
name: weixin-screenshot
description: 截取当前屏幕并通过微信发送给用户。触发词："/weixin-screenshot"、"截图发微信"、"截屏发微信"、"发截图到微信"
---

# weixin-screenshot - 截图发微信

截取全屏截图，通过微信 iLink Bot 通道发送给最近对话的微信用户。

## 前提条件

- mycc 后端正在运行（端口 18080）
- 微信通道已登录并有最近的对话用户

## 触发词

- "/weixin-screenshot"
- "截图发微信"
- "截屏发微信"
- "发截图到微信"

## 执行步骤

### 1. 截图

```bash
mkdir -p /c/tmp && python .claude/skills/desktop/ctl_win.py screenshot C:/tmp/wx-screenshot.png
```

### 2. 通过 mycc 后端发送到微信

```bash
curl -s -X POST http://localhost:18080/weixin/send-media \
  -H "Content-Type: application/json" \
  -d "{\"filePath\":\"C:/tmp/wx-screenshot.png\"}"
```

## 结果处理

- 返回 `{"ok":true}`：告知用户截图已发送到微信
- 返回错误：输出错误信息给用户，常见问题：
  - "微信通道未启动"：需要先 `/mycc` 启动后端并 `/mycc-weixin` 登录
  - "无法回复：没有最近的发送者"：需要先从微信给 bot 发一条消息
