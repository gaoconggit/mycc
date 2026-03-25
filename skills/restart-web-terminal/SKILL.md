---
name: restart-web-terminal
description: 重启 web terminal 服务（端口 7681）。杀掉旧进程，重新启动 server.mjs。触发词："/restart-web-terminal"、"重启 web terminal"、"重启终端"
---

# Restart Web Terminal

重启本机 web terminal 服务。

## 触发词

- "/restart-web-terminal"
- "重启 web terminal"
- "重启终端"
- "web terminal 挂了"

## 执行步骤

直接运行重启脚本（后台启动，等待输出确认）：

```bash
bash /c/tool/restart-web-terminal.sh
```

脚本会自动：
1. 杀掉 7681 端口上的旧进程
2. 用固定 token 启动 server.mjs

## 成功标志

输出中出现 `Listening on http://127.0.0.1:7681` 即为成功。

## 失败处理

- 如果 node 报错，检查 server.mjs 路径是否存在
- 如果端口被其他进程占用，脚本会强制 kill
