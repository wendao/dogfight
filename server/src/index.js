'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { CFG } = require('./config');
const { login, auth } = require('./auth');
const { LadderRoom } = require('./ladder');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.post('/api/login', (req, res) => {
  const { name, token } = req.body || {};
  const player = login(name, token);
  res.json({
    ok: true,
    player: { id: player.id, name: player.name, token: player.token },
    resumed: !!player.resumed,
  });
});

app.get('/api/me', (req, res) => {
  const token = req.headers['x-token'] || req.query.token;
  const player = auth(token);
  if (!player) return res.status(401).json({ ok: false, error: '未登录' });
  res.json({ ok: true, player: { id: player.id, name: player.name } });
});

/** 单人全服榜（内存，重启清空） */
let spLb = []; // [{n,s,t}]

app.get('/api/sp-lb', (_req, res) => {
  res.json({ ok: true, lb: spLb.slice(0, 10) });
});

app.post('/api/sp-score', (req, res) => {
  const name = String((req.body && req.body.name) || '飞行员')
    .trim()
    .slice(0, 12) || '飞行员';
  const steps = Number(req.body && req.body.steps);
  if (!Number.isInteger(steps) || steps < 1 || steps > 100) {
    return res.status(400).json({ ok: false, error: '无效步数' });
  }
  spLb.push({ n: name, s: steps, t: Date.now() });
  spLb.sort((a, b) => a.s - b.s || a.t - b.t);
  spLb = spLb.slice(0, 10);
  res.json({ ok: true, lb: spLb });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const room = new LadderRoom(() => {});

function send(ws, obj) {
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      /* ignore */
    }
  }
}

wss.on('connection', (ws) => {
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return send(ws, { type: 'error', error: '无效消息' });
    }

    if (msg.type === 'auth') {
      player = auth(msg.token);
      if (!player) return send(ws, { type: 'error', error: '认证失败，请重新登录' });
      room.setWs(player, ws);
      room.touch(player);
      send(ws, { type: 'auth_ok', player: { id: player.id, name: player.name } });
      // 若对局中，自动视为重连进天梯
      const inMatch = room.match && room.match.players.some((p) => p.id === player.id);
      if (inMatch) {
        room.join(player);
      } else {
        send(ws, room.ladderState(player.id));
        if (room.match) send(ws, room.matchStateFor(player.id));
      }
      return;
    }

    if (!player) return send(ws, { type: 'error', error: '请先认证' });

    room.touch(player);

    switch (msg.type) {
      case 'ping':
        send(ws, { type: 'pong', t: Date.now() });
        break;
      case 'join_ladder':
        room.setWs(player, ws);
        room.join(player);
        break;
      case 'leave_ladder':
        room.leave(player.id);
        send(ws, { type: 'left_ladder' });
        break;
      case 'place':
        {
          const r = room.handlePlace(player, msg.planes);
          if (!r.ok) send(ws, { type: 'error', error: r.error });
          else send(ws, { type: 'place_ok' });
        }
        break;
      case 'fire':
        {
          const r = room.handleFire(player, msg.i);
          if (!r.ok) send(ws, { type: 'error', error: r.error });
        }
        break;
      case 'surrender':
        {
          const r = room.handleSurrender(player);
          if (!r.ok) send(ws, { type: 'error', error: r.error });
        }
        break;
      case 'sync':
        send(ws, room.ladderState(player.id));
        if (room.match) send(ws, room.matchStateFor(player.id));
        break;
      default:
        send(ws, { type: 'error', error: '未知消息类型' });
    }
  });

  ws.on('close', () => {
    if (player) room.clearWs(player.id, ws);
  });
});

setInterval(() => room.tick(), CFG.TICK_MS);

function lanIPs() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) list.push(n.address);
    }
  }
  return list;
}

server.listen(CFG.PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   打飞机天梯已启动 —— 浏览器直接打开      ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  本机:     http://127.0.0.1:${CFG.PORT}`);
  for (const ip of ips) {
    console.log(`  局域网:   http://${ip}:${CFG.PORT}  ← 发给同一 Wi‑Fi 的朋友`);
  }
  console.log('');
});
