'use strict';

const { CFG } = require('./config');
const {
  createMatch,
  submitLayout,
  fire,
  surrender,
  endMatch,
  applyTimeout,
  applyPlaceTimeout,
  publicMatchState,
  oppId,
} = require('./match');

/** 全局天梯 + 在线连接 */
class LadderRoom {
  constructor(broadcast) {
    this.broadcast = broadcast; // (payload, filterFn?) => void
    this.champion = null; // { id, name }
    this.streak = 0;
    this.queue = []; // [{ id, name }]
    this.match = null;
    this.lastMatchId = null;
    this.online = new Map(); // playerId -> { id, name, lastHb, ws }
    this.finalizing = false;
  }

  ladderState(viewerId) {
    return {
      type: 'ladder_state',
      champion: this.champion,
      streak: this.streak,
      queue: this.queue,
      matchId: this.match ? this.match.id : null,
      matchSummary: this.match
        ? {
            id: this.match.id,
            players: this.match.players,
            phase: this.match.phase,
            turn: this.match.turn,
            turnEnd: this.match.turnEnd,
            placeEnd: this.match.placeEnd,
            winner: this.match.winner,
            reason: this.match.reason,
            killed: publicMatchState(this.match, viewerId || '', { spectator: true }).killed,
          }
        : null,
      you: viewerId
        ? {
            isChamp: !!(this.champion && this.champion.id === viewerId),
            inQueue: this.queue.some((q) => q.id === viewerId),
            inMatch: !!(this.match && this.match.players.some((p) => p.id === viewerId)),
          }
        : null,
    };
  }

  matchStateFor(playerId) {
    if (!this.match) return null;
    const inMatch = this.match.players.some((p) => p.id === playerId);
    return {
      type: 'match_state',
      match: publicMatchState(this.match, playerId, { spectator: !inMatch }),
    };
  }

  touch(player) {
    const cur = this.online.get(player.id);
    if (cur) {
      cur.lastHb = Date.now();
      cur.name = player.name;
    }
  }

  setWs(player, ws) {
    this.online.set(player.id, {
      id: player.id,
      name: player.name,
      lastHb: Date.now(),
      ws,
    });
  }

  clearWs(playerId, ws) {
    const cur = this.online.get(playerId);
    if (cur && cur.ws === ws) {
      cur.ws = null;
    }
  }

  join(player) {
    // 保留已有 ws（auth/setWs 已挂上），只刷新心跳与名字
    const prev = this.online.get(player.id);
    this.online.set(player.id, {
      id: player.id,
      name: player.name,
      lastHb: Date.now(),
      ws: prev && prev.ws ? prev.ws : null,
    });

    const isChamp = this.champion && this.champion.id === player.id;
    const inQ = this.queue.some((q) => q.id === player.id);
    const inMatch = this.match && this.match.players.some((p) => p.id === player.id);

    // 对局中重连：同步名字到 match.players，不重新入队
    if (inMatch) {
      const slot = this.match.players.find((p) => p.id === player.id);
      if (slot) slot.name = player.name;
    }
    if (isChamp) this.champion.name = player.name;
    if (inQ) {
      const q = this.queue.find((x) => x.id === player.id);
      if (q) q.name = player.name;
    }

    if (!isChamp && !inQ && !inMatch) {
      this.queue.push({ id: player.id, name: player.name });
    }

    this.tryMatchmake();
    this.pushAll();
    // 重连进对局时立刻推 match_state
    if (inMatch) this.pushMatch();
  }

  leave(playerId) {
    // 对局中认输
    if (this.match && this.match.phase !== 'over' && this.match.players.some((p) => p.id === playerId)) {
      const winner = oppId(this.match, playerId);
      if (winner) {
        endMatch(this.match, winner, '对手退出');
        this.finalizeMatch();
      }
    }
    this.queue = this.queue.filter((q) => q.id !== playerId);
    if (this.champion && this.champion.id === playerId && !this.match) {
      this.champion = null;
      this.streak = 0;
    }
    this.online.delete(playerId);
    this.tryMatchmake();
    this.pushAll();
  }

  tryMatchmake() {
    if (this.match) return;
    let a = null;
    let b = null;
    if (this.champion) {
      if (this.queue.length >= 1) {
        a = { ...this.champion };
        b = this.queue.shift();
      }
    } else if (this.queue.length >= 2) {
      a = this.queue.shift();
      b = this.queue.shift();
    }
    if (a && b) {
      this.match = createMatch(a, b);
      this.lastMatchId = this.match.id;
    }
  }

  finalizeMatch() {
    if (!this.match || this.match.phase !== 'over') return;
    if (this.finalizing) return;
    this.finalizing = true;
    try {
      const m = this.match;
      const w = m.players.find((p) => p.id === m.winner);
      const l = m.players.find((p) => p.id !== m.winner);
      if (w) {
        this.streak = this.champion && this.champion.id === w.id ? (this.streak || 0) + 1 : 1;
        this.champion = { id: w.id, name: w.name };
        this.queue = this.queue.filter((q) => q.id !== w.id && q.id !== (l && l.id));
        if (l) {
          // 败者在线则垫底
          const alive = this.online.get(l.id) && Date.now() - this.online.get(l.id).lastHb < CFG.STALE;
          if (alive || this.online.has(l.id)) {
            this.queue.push({ id: l.id, name: l.name });
          }
        }
      }
      this.match = null;
      this.tryMatchmake();
    } finally {
      this.finalizing = false;
    }
  }

  handlePlace(player, planes) {
    if (!this.match || !this.match.players.some((p) => p.id === player.id)) {
      return { ok: false, error: '不在对局中' };
    }
    const r = submitLayout(this.match, player.id, planes);
    this.pushMatch();
    this.pushAll();
    return r;
  }

  handleFire(player, i) {
    if (!this.match || !this.match.players.some((p) => p.id === player.id)) {
      return { ok: false, error: '不在对局中' };
    }
    const r = fire(this.match, player.id, i);
    if (r.ok) {
      this.broadcast(
        {
          type: 'shot_result',
          matchId: this.match.id,
          by: player.id,
          i: r.i,
          result: r.result,
          killed: r.killed,
        },
        null
      );
      if (this.match.phase === 'over') {
        this.pushMatch();
        // 稍后再结算，让客户端先看结果
        // 给双方留复盘时间（客户端可自行停留更久）
        setTimeout(() => {
          this.finalizeMatch();
          this.pushAll();
        }, 8000);
      } else {
        this.pushMatch();
      }
      this.pushAll();
    }
    return r;
  }

  handleSurrender(player) {
    if (!this.match || !this.match.players.some((p) => p.id === player.id)) {
      return { ok: false, error: '不在对局中' };
    }
    const r = surrender(this.match, player.id);
    if (r.ok) {
      this.pushMatch();
      setTimeout(() => {
        this.finalizeMatch();
        this.pushAll();
      }, 2000);
      this.pushAll();
    }
    return r;
  }

  pushAll() {
    for (const [pid, info] of this.online) {
      if (!info.ws || info.ws.readyState !== 1) continue;
      try {
        info.ws.send(JSON.stringify(this.ladderState(pid)));
        if (this.match) {
          info.ws.send(JSON.stringify(this.matchStateFor(pid)));
        }
      } catch (e) {
        /* ignore */
      }
    }
  }

  pushMatch() {
    if (!this.match) return;
    for (const [pid, info] of this.online) {
      if (!info.ws || info.ws.readyState !== 1) continue;
      try {
        info.ws.send(JSON.stringify(this.matchStateFor(pid)));
      } catch (e) {
        /* ignore */
      }
    }
  }

  sendTo(playerId, payload) {
    const info = this.online.get(playerId);
    if (!info || !info.ws || info.ws.readyState !== 1) return;
    try {
      info.ws.send(JSON.stringify(payload));
    } catch (e) {
      /* ignore */
    }
  }

  tick() {
    const now = Date.now();

    // 清理陈旧队列
    if (this.queue.length) {
      const keep = [];
      for (const q of this.queue) {
        const info = this.online.get(q.id);
        if (info && now - info.lastHb < CFG.STALE) keep.push(q);
      }
      if (keep.length !== this.queue.length) {
        this.queue = keep;
        this.pushAll();
      }
    }

    // 擂主失联
    if (this.champion && !this.match) {
      const info = this.online.get(this.champion.id);
      if (!info || now - info.lastHb > CFG.STALE) {
        this.champion = null;
        this.streak = 0;
        this.tryMatchmake();
        this.pushAll();
      }
    }

    if (!this.match) {
      this.tryMatchmake();
      return;
    }

    const m = this.match;
    if (m.phase === 'over') {
      if (now - (m.overAt || 0) > 10000) {
        this.finalizeMatch();
        this.pushAll();
      }
      return;
    }

    // 双方失联
    let deadN = 0;
    for (const p of m.players) {
      const info = this.online.get(p.id);
      if (!info || now - info.lastHb > CFG.DEAD) deadN++;
    }
    if (deadN === 2) {
      this.match = null;
      this.pushAll();
      return;
    }

    // 单方离线：超过 DEAD 才判负（给刷新/重连留窗口）
    for (const p of m.players) {
      const info = this.online.get(p.id);
      const offline = !info || now - info.lastHb > CFG.DEAD;
      if (offline) {
        const winner = oppId(m, p.id);
        if (winner) {
          endMatch(m, winner, '对手离线（超时未重连）');
          this.pushMatch();
          setTimeout(() => {
            this.finalizeMatch();
            this.pushAll();
          }, 2000);
          this.pushAll();
          return;
        }
      }
    }

    let changed = false;
    if (applyPlaceTimeout(m, now)) changed = true;
    if (applyTimeout(m, now)) changed = true;
    if (changed) {
      this.pushMatch();
      if (m.phase === 'over') {
        setTimeout(() => {
          this.finalizeMatch();
          this.pushAll();
        }, 2000);
      }
      this.pushAll();
    }
  }
}

module.exports = { LadderRoom };
