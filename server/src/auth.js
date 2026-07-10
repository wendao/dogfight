'use strict';

const { randomUUID } = require('crypto');

const tokens = new Map(); // token -> { id, name }
const players = new Map(); // id -> { id, name, token }

function uid() {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

function login(name) {
  const n = String(name || '')
    .trim()
    .slice(0, 12) || '玩家' + uid().slice(0, 4);
  const id = uid();
  const token = randomUUID().replace(/-/g, '');
  const player = { id, name: n, token };
  tokens.set(token, player);
  players.set(id, player);
  return { id, name: n, token };
}

function auth(token) {
  if (!token) return null;
  return tokens.get(token) || null;
}

function getPlayer(id) {
  return players.get(id) || null;
}

module.exports = { login, auth, getPlayer, uid };
