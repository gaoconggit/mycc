#!/usr/bin/env node

/**
 * 通过 mycc 微信通道发送消息
 *
 * 用法：node send.mjs "消息内容" [--to userId]
 *
 * 不指定 --to 时，自动发给最近跟你聊天的微信用户。
 * 依赖 mycc 后端运行中（端口 18080）。
 */

const PORT = process.env.MYCC_PORT || 18080;
const BASE = `http://localhost:${PORT}`;

async function main() {
  const args = process.argv.slice(2);

  // 解析参数
  let text = "";
  let to = "";
  let filePath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--to" && args[i + 1]) {
      to = args[++i];
    } else if (args[i] === "--file" && args[i + 1]) {
      filePath = args[++i];
    } else if (!text) {
      text = args[i];
    }
  }

  if (!text && !filePath) {
    console.error("用法: node send.mjs \"消息内容\" [--to userId] [--file 文件路径]");
    process.exit(1);
  }

  const body = {};
  if (text) body.text = text;
  if (to) body.to = to;
  if (filePath) body.filePath = filePath;

  try {
    const res = await fetch(`${BASE}/weixin/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (data.ok) {
      console.log(`OK - 已发送给 ${data.to}`);
    } else {
      console.error(`失败: ${data.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`请求失败: ${err.message}`);
    console.error("请确认 mycc 后端正在运行（端口 18080）");
    process.exit(1);
  }
}

main();
