'use strict';

const { randomUUID } = require('crypto');

const tokens = new Map(); // token -> { id, name, token }
const players = new Map(); // id -> { id, name, token }

function uid() {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

/**
 * 登录 / 重连
 * - 带有效 token → 恢复同一身份（可改昵称）
 * - 无 token 或失效 → 新建身份
 * 同名允许：身份靠 id/token，不靠名字
 */
function login(name, existingToken) {
  const n = String(name || '')
    .trim()
    .slice(0, 12);

  if (existingToken && tokens.has(existingToken)) {
    const p = tokens.get(existingToken);
    if (n) p.name = n;
    players.set(p.id, p);
    return { id: p.id, name: p.name, token: p.token, resumed: true };
  }

  const id = uid();
  const token = randomUUID().replace(/-/g, '');
  const player = {
    id,
    name: n || '玩家' + id.slice(0, 4),
    token,
  };
  tokens.set(token, player);
  players.set(id, player);
  return { id: player.id, name: player.name, token: player.token, resumed: false };
}

function auth(token) {
  if (!token) return null;
  return tokens.get(token) || null;
}

function getPlayer(id) {
  return players.get(id) || null;
}

module.exports = { login, auth, getPlayer, uid };
