---
name: es
description: 使用 Everything（es.exe）搜索本地文件。触发词："/es"、"搜索文件"、"找一下"、"es搜索"、"帮我找"、"找文件"
---

# Everything 文件搜索

使用 `C:/tool/es.exe` 搜索本地文件。Everything 索引全盘，速度极快。

## 用法

```bash
C:/tool/es.exe <关键词>
```

支持通配符：`*.exe`、`*.md`、`project*` 等。

## 示例

- "找一下 ngrok.exe" → `C:/tool/es.exe ngrok.exe`
- "搜索文件 *.psd" → `C:/tool/es.exe *.psd`
- "帮我找 node_modules 在哪" → `C:/tool/es.exe node_modules`

## 执行步骤

1. 从用户描述中提取搜索关键词
2. 执行 `C:/tool/es.exe <关键词>`
3. 展示结果，结果过多时只展示前 20 条并说明总数
