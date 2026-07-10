const config = require('./config');

let socket = null;
let authed = false;
let token = '';
const handlers = new Map(); // type -> Set<fn>
let reconnectTimer = null;
let pingTimer = null;
let manualClose = false;

function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type).delete(fn);
}

function emit(type, data) {
  const set = handlers.get(type);
  if (set) set.forEach((fn) => {
    try { fn(data); } catch (e) { console.error(e); }
  });
  const all = handlers.get('*');
  if (all) all.forEach((fn) => {
    try { fn(type, data); } catch (e) { console.error(e); }
  });
}

function send(obj) {
  if (!socket) return false;
  try {
    socket.send({ data: JSON.stringify(obj) });
    return true;
  } catch (e) {
    return false;
  }
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => send({ type: 'ping' }), 5000);
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function connect(t) {
  token = t || token;
  manualClose = false;
  if (socket) {
    try { socket.close({}); } catch (e) { /* */ }
    socket = null;
  }
  authed = false;
  return new Promise((resolve, reject) => {
    const ws = wx.connectSocket({
      url: config.WS,
      fail: reject,
    });
    socket = ws;
    let settled = false;

    ws.onOpen(() => {
      send({ type: 'auth', token });
    });

    ws.onMessage((ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'auth_ok') {
        authed = true;
        startPing();
        if (!settled) {
          settled = true;
          resolve(msg);
        }
      }
      if (msg.type === 'error' && !authed && !settled) {
        settled = true;
        reject(new Error(msg.error || '认证失败'));
      }
      emit(msg.type, msg);
    });

    ws.onError((err) => {
      if (!settled) {
        settled = true;
        reject(err || new Error('连接失败'));
      }
      emit('ws_error', err);
    });

    ws.onClose(() => {
      authed = false;
      stopPing();
      emit('ws_close', {});
      if (!manualClose) scheduleReconnect();
    });
  });
}

function scheduleReconnect() {
  if (reconnectTimer || !token) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(token).catch(() => scheduleReconnect());
  }, 2000);
}

function close() {
  manualClose = true;
  stopPing();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try { socket.close({}); } catch (e) { /* */ }
    socket = null;
  }
  authed = false;
}

function isAuthed() {
  return authed;
}

module.exports = {
  on,
  send,
  connect,
  close,
  isAuthed,
};
