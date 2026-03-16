#!/usr/bin/env node
/**
 * web-terminal server — multi-tab AI terminal
 * Based on fncc-web-terminal, extended with multi-tab + token auth
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import crypto from 'crypto';

const PORT = parseInt(process.env.WEB_TERMINAL_PORT || '7681');
const TOKEN = process.env.WEB_TERMINAL_TOKEN || crypto.randomBytes(12).toString('hex');
const CWD = process.env.WEB_TERMINAL_CWD || process.cwd();
const MAX_SCROLLBACK = 50 * 1024;

// Tab definitions
const TABS = [
  { id: 'claude', label: 'Claude Code', cmd: 'claude', args: ['--continue'] },
  { id: 'codex', label: 'Codex', cmd: 'codex', args: [] },
];

if (process.env.WEB_TERMINAL_TABS) {
  try {
    const custom = JSON.parse(process.env.WEB_TERMINAL_TABS);
    TABS.length = 0;
    TABS.push(...custom);
  } catch (e) {
    console.error('[web-terminal] Invalid WEB_TERMINAL_TABS JSON, using defaults');
  }
}

// Per-tab state
const tabState = {};
for (const tab of TABS) {
  tabState[tab.id] = { pty: null, scrollback: '', status: 'idle' };
}

function appendScrollback(tabId, data) {
  const state = tabState[tabId];
  if (!state) return;
  state.scrollback += data;
  if (state.scrollback.length > MAX_SCROLLBACK) {
    state.scrollback = state.scrollback.slice(state.scrollback.length - MAX_SCROLLBACK);
  }
}

function spawnTab(tabId, cols, rows) {
  const tab = TABS.find(t => t.id === tabId);
  const state = tabState[tabId];
  if (!tab || !state || state.pty) return;

  let spawnCmd, spawnArgs;
  if (process.platform === 'win32') {
    spawnCmd = 'pwsh.exe';
    const initCmd = `[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${tab.cmd} ${tab.args.join(' ')}`;
    spawnArgs = ['-NoLogo', '-NoExit', '-Command', initCmd];
  } else {
    spawnCmd = 'bash';
    spawnArgs = ['-c', `${tab.cmd} ${tab.args.join(' ')}`];
  }

  try {
    state.pty = pty.spawn(spawnCmd, spawnArgs, {
      name: 'xterm-256color',
      cols: Math.max(cols || 120, 10),
      rows: Math.max(rows || 40, 5),
      cwd: CWD,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });

    state.status = 'running';
    broadcast({ type: 'status', tab: tabId, status: 'running' });

    state.pty.onData((data) => {
      appendScrollback(tabId, data);
      broadcast({ type: 'output', tab: tabId, data });
    });

    state.pty.onExit(() => {
      console.log(`[PTY] ${tab.label} exited`);
      state.pty = null;
      state.status = 'stopped';
      broadcast({ type: 'exit', tab: tabId });
    });

    console.log(`[PTY] Spawned ${tab.label}: ${tab.cmd} ${tab.args.join(' ')}`);
  } catch (e) {
    console.error(`[PTY] Failed to spawn ${tab.label}:`, e.message);
    state.status = 'error';
    broadcast({ type: 'status', tab: tabId, status: 'error' });
  }
}

// WebSocket clients
const clients = new Set();

function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(json);
  }
}

// ===== Login page =====
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>CC Terminal</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1a2e;color:#e0e0e0;font-family:-apple-system,'Segoe UI',sans-serif;height:100dvh;display:flex;align-items:center;justify-content:center}
.box{background:#16213e;border:1px solid rgba(233,69,96,0.2);border-radius:12px;padding:36px;width:320px}
h2{margin-bottom:24px;font-size:18px;color:#e94560;text-align:center;font-weight:700}
input{width:100%;background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);color:#e0e0e0;padding:12px;border-radius:8px;font-size:14px;outline:none;margin-bottom:14px}
input:focus{border-color:rgba(233,69,96,0.5)}
button{width:100%;background:#e94560;border:none;color:#fff;padding:12px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600}
button:hover{opacity:0.9}
.err{color:#ff6b81;font-size:12px;margin-top:8px;text-align:center;display:none}
</style></head><body>
<div class="box">
<h2>CC Terminal</h2>
<input id="token" type="password" placeholder="Token..." autofocus>
<button onclick="login()">Enter</button>
<div class="err" id="err">Token incorrect</div>
</div>
<script>
async function login(){var t=document.getElementById('token').value;var r=await fetch('/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})});if(r.ok)location.href='/terminal';else document.getElementById('err').style.display='block'}
document.getElementById('token').addEventListener('keydown',function(e){if(e.key==='Enter')login()});
</script></body></html>`;

// ===== Terminal page =====
const TABS_JSON = JSON.stringify(TABS.map(t => ({ id: t.id, label: t.label })));

const TERMINAL_HTML = `<!DOCTYPE html>
<html lang="zh"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>CC Terminal</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<style>
@font-face {
  font-family: 'Symbols Nerd Font Mono';
  src: url('https://cdn.jsdelivr.net/gh/ryanoasis/nerd-fonts@v3.3.0/patched-fonts/NerdFontsSymbolsOnly/SymbolsNerdFontMono-Regular.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;background:#1a1a2e;overflow:hidden;font-family:-apple-system,'SF Pro Text','Segoe UI',sans-serif}

#app{display:flex;flex-direction:column;height:100vh;height:100dvh}

/* Header with tabs */
#header{
  display:flex;align-items:center;
  padding:0;height:36px;min-height:36px;
  background:#0d1326;border-bottom:1px solid rgba(233,69,96,0.15);
  flex-shrink:0;user-select:none;overflow-x:auto;
  -webkit-overflow-scrolling:touch;
}
.tab{
  padding:0 16px;height:100%;display:flex;align-items:center;
  font-size:13px;color:#666;cursor:pointer;white-space:nowrap;
  border-bottom:2px solid transparent;transition:all 0.2s;flex-shrink:0;
}
.tab.active{color:#e94560;border-bottom-color:#e94560}
.tab:active{opacity:0.7}
.header-right{
  margin-left:auto;display:flex;align-items:center;gap:6px;
  padding:0 12px;flex-shrink:0;
}
.dot{width:7px;height:7px;border-radius:50%;background:#f87171;flex-shrink:0;transition:background 0.3s}
.dot.on{background:#4ade80;box-shadow:0 0 6px rgba(74,222,128,0.5)}
.status-text{font-size:11px;color:#666;transition:color 0.3s}
.status-text.on{color:#4ade80}

/* Terminal area */
#terminal-wrap{flex:1;min-height:0;position:relative;overflow:hidden}
.term-panel{position:absolute;inset:0;display:none;overflow:hidden}
.term-panel.active{display:block}
.term-panel .xterm{height:100%!important}
.term-panel .xterm-screen{height:100%!important}
.xterm-viewport{overflow-y:auto!important}
.xterm-viewport::-webkit-scrollbar{width:6px}
.xterm-viewport::-webkit-scrollbar-thumb{background:rgba(233,69,96,0.3);border-radius:3px}

/* Overlay */
#overlay{
  display:none;position:absolute;inset:0;z-index:10;
  background:rgba(13,19,38,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  align-items:center;justify-content:center;flex-direction:column;gap:16px;
}
#overlay.show{display:flex}
#overlay .msg{color:#888;font-size:14px}
#overlay button{
  padding:10px 36px;font-size:14px;border:none;border-radius:20px;
  background:#e94560;color:#fff;cursor:pointer;font-weight:600;
  transition:transform 0.15s,box-shadow 0.15s;
}
#overlay button:hover{transform:scale(1.05);box-shadow:0 4px 20px rgba(233,69,96,0.4)}
#overlay button:active{transform:scale(0.97)}

/* Mobile bar — hidden on desktop */
#mobile-bar{display:none;flex-shrink:0}

@media (max-width:768px),(pointer:coarse){
  #header{height:40px;min-height:40px}
  .tab{font-size:14px;padding:0 14px}

  #mobile-bar{
    display:flex;flex-direction:column;
    background:#111833;border-top:1px solid rgba(233,69,96,0.12);
    flex-shrink:0;
  }
  .quick-keys{
    display:flex;gap:6px;padding:6px 10px;
    overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;
  }
  .quick-keys::-webkit-scrollbar{display:none}
  .qk{
    padding:5px 14px;background:rgba(255,255,255,0.06);color:#aab;
    border:1px solid rgba(255,255,255,0.08);border-radius:16px;
    font-size:13px;white-space:nowrap;cursor:pointer;
    font-family:'SF Mono','Menlo','Consolas',monospace;flex-shrink:0;
    transition:all 0.15s;-webkit-tap-highlight-color:transparent;
  }
  .qk:active{background:#e94560;color:#fff;border-color:#e94560;transform:scale(0.93)}
  .qk-sep{width:1px;background:rgba(255,255,255,0.08);flex-shrink:0;margin:4px 2px}

  .input-row{display:flex;gap:8px;align-items:flex-end;padding:8px 10px}
  .input-row textarea{
    flex:1;background:#1a1f3a;color:#e0e0e0;
    border:1px solid rgba(255,255,255,0.1);border-radius:20px;
    padding:10px 16px;font-size:16px;font-family:inherit;
    resize:none;outline:none;min-height:40px;max-height:120px;
    line-height:1.4;transition:border-color 0.2s;
  }
  .input-row textarea:focus{border-color:rgba(233,69,96,0.6)}
  .input-row textarea::placeholder{color:#555}

  .send-btn{
    width:40px;height:40px;border:none;border-radius:50%;
    background:#e94560;color:#fff;cursor:pointer;
    flex-shrink:0;display:flex;align-items:center;justify-content:center;
    transition:transform 0.15s;-webkit-tap-highlight-color:transparent;
  }
  .send-btn:active{transform:scale(0.9)}
  .send-btn svg{width:18px;height:18px}
}
</style></head>
<body>
<div id="app">
  <div id="header"></div>
  <div id="terminal-wrap">
    <div id="overlay">
      <div class="msg">Connection lost</div>
      <button id="reconnect-btn">Reconnect</button>
    </div>
  </div>
  <div id="mobile-bar">
    <div class="quick-keys" id="quick-keys"></div>
    <div class="input-row">
      <textarea id="mobile-input" rows="1" placeholder="输入命令..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
      <button class="send-btn" id="send-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js"></script>
<script>
var TABS = ${TABS_JSON};
var activeTab = TABS[0].id;
var ws = null;
var reconnectAttempts = 0;
var maxReconnect = 10;
var reconnectTimer = null;

var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 768);

// ===== Build header tabs =====
var headerEl = document.getElementById('header');
TABS.forEach(function(t) {
  var el = document.createElement('div');
  el.className = 'tab' + (t.id === activeTab ? ' active' : '');
  el.textContent = t.label;
  el.dataset.tab = t.id;
  el.onclick = function() { switchTab(t.id); };
  headerEl.appendChild(el);
});
var rightEl = document.createElement('div');
rightEl.className = 'header-right';
rightEl.innerHTML = '<span id="status-text" class="status-text">Connecting</span><span id="status-dot" class="dot"></span>';
headerEl.appendChild(rightEl);

// ===== Build xterm instances =====
var wrapEl = document.getElementById('terminal-wrap');
var terms = {};
var fitAddons = {};
var panels = {};

TABS.forEach(function(t) {
  var panel = document.createElement('div');
  panel.className = 'term-panel' + (t.id === activeTab ? ' active' : '');
  panel.id = 'panel-' + t.id;
  wrapEl.insertBefore(panel, document.getElementById('overlay'));
  panels[t.id] = panel;

  var term = new window.Terminal({
    cursorBlink: false,
    cursorStyle: 'bar',
    cursorWidth: 1,
    cursorInactiveStyle: 'none',
    fontSize: isMobile ? 12 : 14,
    fontFamily: "'Cascadia Code','Fira Code','JetBrains Mono','Menlo','Consolas','Symbols Nerd Font Mono',monospace",
    lineHeight: isMobile ? 1.1 : 1.15,
    theme: {
      background: '#1a1a2e',
      foreground: '#e0e0e0',
      cursor: 'transparent',
      cursorAccent: 'transparent',
      selectionBackground: 'rgba(233,69,96,0.25)',
      selectionForeground: '#fff',
      black: '#1a1a2e', red: '#e94560', green: '#4ade80', yellow: '#fbbf24',
      blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e0e0e0',
      brightBlack: '#4a4a6a', brightRed: '#ff6b81', brightGreen: '#6aff96',
      brightYellow: '#ffe066', brightBlue: '#82bdff', brightMagenta: '#d8a8ff',
      brightCyan: '#5aeaea', brightWhite: '#ffffff',
    },
    scrollback: 10000,
    allowProposedApi: true,
    convertEol: true,
  });

  var fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);
  if (window.WebLinksAddon) term.loadAddon(new window.WebLinksAddon.WebLinksAddon());
  term.open(panel);
  fit.fit();
  terms[t.id] = term;
  fitAddons[t.id] = fit;

  // Desktop keyboard input
  if (!isMobile) {
    term.onData(function(data) {
      sendRaw(t.id, data);
    });
  }
});

// ===== Fit =====
function doFit() {
  try {
    var fit = fitAddons[activeTab];
    if (fit) {
      fit.fit();
      var t = terms[activeTab];
      if (ws && ws.readyState === 1 && t) {
        ws.send(JSON.stringify({ type: 'resize', tab: activeTab, cols: t.cols, rows: t.rows }));
      }
    }
  } catch(e) {}
}
requestAnimationFrame(doFit);
setTimeout(doFit, 100);
setTimeout(doFit, 500);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(doFit);

var resizeTimer;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(doFit, 150);
});

// ===== Tab switching =====
function switchTab(tabId) {
  if (activeTab === tabId) return;
  activeTab = tabId;
  document.querySelectorAll('.tab').forEach(function(el) {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });
  Object.keys(panels).forEach(function(id) {
    panels[id].classList.toggle('active', id === tabId);
  });
  setTimeout(function() {
    fitAddons[tabId].fit();
    if (!isMobile) terms[tabId].focus();
  }, 50);
  if (ws && ws.readyState === 1) {
    var t = terms[tabId];
    ws.send(JSON.stringify({ type: 'activate', tab: tabId, cols: t.cols, rows: t.rows }));
  }
}

// ===== WebSocket =====
var dotEl = document.getElementById('status-dot');
var textEl = document.getElementById('status-text');
var overlayEl = document.getElementById('overlay');

function setStatus(connected) {
  if (connected) {
    dotEl.classList.add('on');
    textEl.classList.add('on');
    textEl.textContent = 'Connected';
  } else {
    dotEl.classList.remove('on');
    textEl.classList.remove('on');
    textEl.textContent = 'Disconnected';
  }
}

function connect() {
  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host + '/ws');
  textEl.textContent = 'Connecting';

  ws.onopen = function() {
    setStatus(true);
    overlayEl.classList.remove('show');
    reconnectAttempts = 0;
    doFit();
    var t = terms[activeTab];
    ws.send(JSON.stringify({ type: 'activate', tab: activeTab, cols: t.cols, rows: t.rows }));
  };

  ws.onmessage = function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'output' || msg.type === 'scrollback') {
        if (terms[msg.tab]) terms[msg.tab].write(msg.data);
      } else if (msg.type === 'exit') {
        if (terms[msg.tab]) {
          terms[msg.tab].write('\\r\\n\\x1b[31m[Session ended]\\x1b[0m\\r\\n');
        }
      }
    } catch(ex) {}
  };

  ws.onclose = function() {
    setStatus(false);
    if (reconnectAttempts < maxReconnect) {
      reconnectAttempts++;
      reconnectTimer = setTimeout(connect, 3000);
    } else {
      overlayEl.classList.add('show');
    }
  };

  ws.onerror = function() {};
}

document.getElementById('reconnect-btn').addEventListener('click', function() {
  clearTimeout(reconnectTimer);
  reconnectAttempts = 0;
  if (ws) { try { ws.close(); } catch(e) {} }
  connect();
});

function sendRaw(tabId, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'input', tab: tabId, data: data }));
  }
}

connect();

// ===== Mobile =====
if (isMobile) {
  var appEl = document.getElementById('app');
  if (window.visualViewport) {
    function adjustForKeyboard() {
      appEl.style.height = window.visualViewport.height + 'px';
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(doFit, 100);
    }
    window.visualViewport.addEventListener('resize', adjustForKeyboard);
    window.visualViewport.addEventListener('scroll', function() { window.scrollTo(0, 0); });
  }

  var input = document.getElementById('mobile-input');
  var sendBtn = document.getElementById('send-btn');
  var qkContainer = document.getElementById('quick-keys');

  var quickKeys = [
    { label: 'Ctrl+C', code: 3 },
    { label: 'Enter', code: 13 },
    { label: 'Tab', code: 9 },
    { label: 'Esc', code: 27 },
    'sep',
    { label: '\\u2191', seq: '[A' },
    { label: '\\u2193', seq: '[B' },
    'sep',
    { label: 'y', ch: 'y' },
    { label: 'n', ch: 'n' },
    { label: 'Ctrl+Z', code: 26 },
    { label: 'Ctrl+D', code: 4 },
    { label: 'Ctrl+L', code: 12 },
    { label: '/exit', str: '/exit\\r' },
  ];

  quickKeys.forEach(function(k) {
    if (k === 'sep') {
      var sep = document.createElement('div');
      sep.className = 'qk-sep';
      qkContainer.appendChild(sep);
      return;
    }
    var btn = document.createElement('button');
    btn.className = 'qk';
    btn.textContent = k.label;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var data;
      if (k.code !== undefined) data = String.fromCharCode(k.code);
      else if (k.seq) data = String.fromCharCode(27) + k.seq;
      else if (k.ch) data = k.ch;
      else if (k.str) data = k.str;
      if (data) sendRaw(activeTab, data);
    }, { passive: false });
    qkContainer.appendChild(btn);
  });

  function sendInput() {
    var text = input.value;
    if (!text) return;
    sendRaw(activeTab, text + String.fromCharCode(13));
    input.value = '';
    autoResizeInput();
  }

  sendBtn.addEventListener('click', function(e) { e.preventDefault(); sendInput(); });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInput(); }
  });

  function autoResizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }
  input.addEventListener('input', autoResizeInput);
}

// Desktop focus
if (!isMobile) {
  terms[activeTab].focus();
  document.addEventListener('click', function(e) {
    if (!e.target.closest('button') && !e.target.closest('.tab') && !e.target.closest('input') && !e.target.closest('textarea')) {
      terms[activeTab].focus();
    }
  });
}
</script>
</body></html>`;

// ===== Cookie helpers =====
function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

function isAuthed(req) {
  return parseCookies(req)['cct'] === TOKEN;
}

// ===== HTTP server =====
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (url.pathname === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  if (url.pathname === '/' || url.pathname === '/login') {
    if (isAuthed(req)) { res.writeHead(302, { Location: '/terminal' }); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(LOGIN_HTML);
    return;
  }

  if (url.pathname === '/auth' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { token } = JSON.parse(body);
        if (token === TOKEN) {
          res.writeHead(200, {
            'Set-Cookie': `cct=${TOKEN}; HttpOnly; SameSite=Strict; Path=/`,
            'Content-Type': 'application/json'
          });
          res.end('{"ok":true}');
        } else {
          res.writeHead(401);
          res.end('{"ok":false}');
        }
      } catch {
        res.writeHead(400);
        res.end('bad request');
      }
    });
    return;
  }

  if (url.pathname === '/terminal') {
    if (!isAuthed(req)) { res.writeHead(302, { Location: '/' }); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(TERMINAL_HTML);
    return;
  }

  // Legacy compat
  const match = url.pathname.match(/^\/t\/([^/]+)$/);
  if (match && match[1] === TOKEN) {
    res.writeHead(302, { Location: '/terminal', 'Set-Cookie': `cct=${TOKEN}; HttpOnly; SameSite=Strict; Path=/` });
    res.end();
    return;
  }

  res.writeHead(403);
  res.end('Forbidden');
});

// ===== WebSocket server =====
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  if (!isAuthed(req)) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  clients.add(ws);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'activate') {
        const tabId = msg.tab;
        const state = tabState[tabId];
        if (!state) return;
        if (!state.pty && state.status !== 'error') {
          spawnTab(tabId, msg.cols, msg.rows);
        } else if (state.pty && msg.cols && msg.rows) {
          state.pty.resize(Math.max(msg.cols, 10), Math.max(msg.rows, 5));
        }
        if (state.scrollback) {
          ws.send(JSON.stringify({ type: 'scrollback', tab: tabId, data: state.scrollback }));
        }
        ws.send(JSON.stringify({ type: 'status', tab: tabId, status: state.status }));
      }

      if (msg.type === 'input') {
        const state = tabState[msg.tab];
        if (state && state.pty) state.pty.write(msg.data);
      }

      if (msg.type === 'resize') {
        const state = tabState[msg.tab];
        if (state && state.pty) {
          state.pty.resize(Math.max(msg.cols || 80, 10), Math.max(msg.rows || 24, 5));
        }
      }
    } catch {}
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[web-terminal] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[web-terminal] Token: ${TOKEN}`);
  console.log(`[web-terminal] Local URL: http://127.0.0.1:${PORT}/t/${TOKEN}`);
  console.log(`[web-terminal] Tabs: ${TABS.map(t => t.label).join(', ')}`);
});

process.on('SIGINT', () => {
  for (const state of Object.values(tabState)) {
    if (state.pty) state.pty.kill();
  }
  process.exit(0);
});
