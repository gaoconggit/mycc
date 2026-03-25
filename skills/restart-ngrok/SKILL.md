---
name: restart-ngrok
description: 重启 ngrok。杀掉旧的 ngrok.exe 进程，直接运行 ngrok 命令启动，确认进程已启动。触发词："/restart-ngrok"、"重启ngrok"、"启动ngrok"
---

# Restart ngrok

ngrok 安装目录：`E:\soft\ngrok client 1.5\`
启动命令：`ngrok -log=logs/stdout.txt -config=app.yml start cc`

## 执行步骤

1. 检查是否有 ngrok 进程在运行：
   ```bash
   tasklist | grep -i ngrok
   ```

2. 如果有，杀掉它：
   ```bash
   taskkill //F //IM ngrok.exe
   ```

3. 用桌面自动化启动 ngrok（Win+R → 输入 ngrok → 回车）：
   ```bash
   SKILL_DIR="E:/prj/mycc/.claude/skills/desktop"
   CTL="python $SKILL_DIR/ctl_win.py"
   $CTL hotkey win+r
   sleep 0.5
   $CTL type "ngrok"
   $CTL key enter
   ```

4. 等待 3 秒后确认进程已启动：
   ```bash
   sleep 3 && tasklist | grep -i ngrok
   ```

5. 汇报结果（新 PID）。
