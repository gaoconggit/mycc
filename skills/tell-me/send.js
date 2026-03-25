#!/usr/bin/env node
/**
 * 飞书通知脚本 - 使用飞书 Bot API（同 mycc 飞书通道）
 * 用法: node send.js "标题" "内容" [颜色]
 * 颜色: blue(默认), green, orange, red
 */

const [,, title, content, color = 'blue'] = process.argv;

if (!title || !content) {
  console.error('用法: node send.js "标题" "内容" [颜色]');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');

// 从脚本位置向上找 .env 文件
function loadEnv() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim();
        }
      }
      return;
    }
    dir = path.dirname(dir);
  }
}

loadEnv();

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;
const receiveId = process.env.FEISHU_RECEIVE_USER_ID;
const receiveIdType = process.env.FEISHU_RECEIVE_ID_TYPE || 'open_id';

if (!appId || !appSecret || !receiveId) {
  console.error('❌ 飞书未配置，请在 .env 中设置：');
  console.error('   FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_RECEIVE_USER_ID');
  process.exit(1);
}

async function getToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error('获取 token 失败: ' + data.msg);
  return data.tenant_access_token;
}

async function sendCard(token) {
  const ts = new Date().toLocaleString('zh-CN');
  const body = content.replace(/\\n/g, '\n');
  const card = {
    schema: '2.0',
    header: {
      title: { content: title, tag: 'plain_text' },
      template: color,
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: body + '\n\n---\n' + ts,
        },
      ],
    },
  };

  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=' + receiveIdType, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    }),
  });

  const data = await res.json();
  if (data.code !== 0) throw new Error('发送失败: ' + data.msg);
}

(async () => {
  try {
    const token = await getToken();
    await sendCard(token);
    console.log('✅ 发送成功');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();
