---
name: mycc-weixin
description: 微信通道管理。扫码登录、查看状态、重新连接。集成在 mycc 后端中，通过微信 iLink Bot API 实现双向通信。触发词："/mycc-weixin"、"连接微信"、"微信对接CC"、"微信登录"、"微信通道"
---

# 微信通道

通过微信 iLink Bot API 将微信消息接入 mycc，实现微信直接对话 CC。

## 触发词

- "/mycc-weixin"
- "连接微信"
- "微信对接CC"
- "微信登录"
- "微信通道"

## 架构

集成在 mycc 后端中，作为 `WeixinChannel` 通道：
- **接收消息**：long-poll `ilink/bot/getupdates`
- **发送回复**：`ilink/bot/sendmessage`
- **登录认证**：扫码登录，获取 `bot_token`
- **数据存储**：`{项目}/.claude/skills/mycc/weixin/`

## 首次登录

需要在 mycc 后端运行的环境中执行：

```typescript
// 在 mycc 后端代码中调用
import { WeixinChannel } from "./channels/weixin.js";

const channel = new WeixinChannel({ stateDir: ".claude/skills/mycc" });
await channel.login(); // 终端会打印二维码，用微信扫码
```

或者让 cc 直接执行登录脚本：

```bash
cd E:/prj/mycc/.claude/skills/mycc/scripts
node -e "
import { WeixinChannel } from './src/channels/weixin.js';
const ch = new WeixinChannel({ stateDir: '../' });
await ch.login();
" --input-type=module
```

登录成功后重启 mycc 后端即可自动启用微信通道。

## 检查状态

查看是否已登录：
```bash
cat E:/prj/mycc/.claude/skills/mycc/weixin/account.json
```

有 `token` 字段说明已登录。

## 重新登录

如果 session 过期或需要换号：
1. 删除 `weixin/account.json`
2. 重新执行登录流程
3. 重启 mycc 后端

## 环境变量

| 变量 | 说明 |
|------|------|
| `CHANNEL_WEIXIN` | 设为 `false` 可禁用微信通道 |

## 故障排查

| 现象 | 处理 |
|------|------|
| 消息收不到 | 检查 mycc 后端日志中 `[WeixinChannel]` 相关输出 |
| session 过期 | 重新登录（删除 account.json + 重新扫码） |
| 回复发不出去 | 检查 contextToken 是否正常缓存（先发一条消息触发） |
