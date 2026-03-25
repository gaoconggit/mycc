---
name: wx-notify
description: 微信通知。通过 mycc 微信通道给用户发消息。触发词："/wx-notify"、"微信通知我"、"发微信通知"、"微信告诉我"
---

# wx-notify - 微信通知

通过 mycc 后端的微信通道（iLink Bot API）给用户发消息。

## 触发词

- "/wx-notify"
- "微信通知我"
- "发微信通知"
- "微信告诉我"

## 执行步骤

1. **组织消息内容**
   - 如果用户指定了内容，直接用
   - 如果没指定，总结当前对话要点（3-5 句）

2. **发送微信消息**

## 发送命令

```bash
node .claude/skills/wx-notify/send.mjs "消息内容"
```

**参数说明**：
- 第一个参数：消息文本（必填）
- `--to userId`：指定接收者（可选，默认发给最近聊天的用户）
- `--file 文件路径`：附带发送文件/图片（可选）

**示例**：
```bash
node .claude/skills/wx-notify/send.mjs "任务完成：已部署到生产环境"
node .claude/skills/wx-notify/send.mjs "看看这个截图" --file /tmp/screenshot.png
```

## 前提条件

- mycc 后端运行中（端口 18080）
- 微信通道已登录（通过 /mycc-weixin 登录）

## 与其他技能的区别

| 技能 | 方式 | 场景 |
|------|------|------|
| **wx-notify** | iLink Bot API（后台） | 静默通知，不弹窗 |
| wx-send | 桌面 UIA 自动化 | 控制桌面微信客户端发消息 |
| tell-me | 飞书 webhook | 发飞书群通知 |
