---
name: dingtalk-send
description: 发送钉钉消息。通过 UIA 自动化控制桌面钉钉客户端发送消息给指定联系人。触发词："/dingtalk-send"、"发钉钉给"、"钉钉发消息"、"通过钉钉发"
---

# dingtalk-send - 发钉钉消息

通过 `dingtalk-send-message.exe` 控制桌面钉钉客户端，向指定联系人发送纯文本消息。

## 触发词

- "/dingtalk-send"
- "发钉钉给 xxx"
- "钉钉发消息"
- "通过钉钉发"

## 前置条件

- 钉钉 PC 客户端已登录并在运行
- 工具路径：`C:\tool\dingtalk-send-message.exe`

## 执行步骤

1. **从用户输入中提取**：
   - `recipient`：联系人名称（钉钉搜索框中显示的名字）
   - `message`：要发送的消息内容

2. **如果信息不完整**，询问用户补充

3. **执行发送命令**

## 发送命令

```powershell
C:\tool\dingtalk-send-message.exe --recipient "联系人名称" --message "消息内容"
```

**可选参数**：
- `--timeout <秒>`：UI 查找和 OCR 的超时时间
- `--replace-draft`：覆盖输入框中已有的草稿
- `--dry-run`：演习模式，只打开聊天窗口不实际发送
- `--verbose`：保存中间 OCR 截图用于排查

**示例**：
```powershell
C:\tool\dingtalk-send-message.exe --recipient "张三" --message "你好，这是一条测试消息"
```

## 结果处理

- **成功**：告知用户消息已发送
- **失败**（exit code 非 0）：
  - 输出错误信息给用户
  - 常见原因：钉钉未启动、联系人名称不匹配、UIA 控件未暴露
  - 建议用户确认钉钉已打开并停留在主界面

## 注意事项

- `recipient` 必须与钉钉搜索结果中显示的名称完全一致
- 消息为纯文本，不支持表情/图片/文件
- 本工具仅支持 Windows，依赖桌面钉钉 PC 版
