'use strict';

const { CFG } = require('./config');
const { uid } = require('./auth');
const {
  randomLayout,
  normalizePlanes,
  shotResult,
  killedCount,
  valueMap,
  planeCells,
} = require('./game/plane');

function createMatch(a, b) {
  return {
    id: uid(),
    players: [
      { id: a.id, name: a.name },
      { id: b.id, name: b.name },
    ],
    phase: 'place',
    placeEnd: Date.now() + CFG.PLACE_MS,
    layouts: {},
    moves: [],
    tos: {},
    turn: null,
    turnEnd: 0,
    winner: null,
    reason: '',
    overAt: 0,
    createdAt: Date.now(),
  };
}

function playerIdx(match, playerId) {
  return match.players.findIndex((p) => p.id === playerId);
}

function oppId(match, playerId) {
  const p = match.players.find((x) => x.id !== playerId);
  return p ? p.id : null;
}

function shotsBy(match, shooterId) {
  return match.moves.filter((m) => m.by === shooterId && m.i != null).map((m) => m.i);
}

function hash(s) {
  let a = 0;
  for (const ch of s) a = (a + ch.charCodeAt(0)) | 0;
  return Math.abs(a);
}

function submitLayout(match, playerId, planes) {
  if (match.phase !== 'place') return { ok: false, error: '不在布阵阶段' };
  if (match.layouts[playerId]) return { ok: false, error: '已提交阵型' };
  const norm = normalizePlanes(planes);
  if (!norm) return { ok: false, error: '阵型不合法' };
  match.layouts[playerId] = norm;
  tryStartBattle(match);
  return { ok: true };
}

function autoPlace(match, playerId) {
  if (match.phase !== 'place' || match.layouts[playerId]) return;
  match.layouts[playerId] = randomLayout();
  tryStartBattle(match);
}

function tryStartBattle(match) {
  if (match.phase !== 'place') return;
  const [p0, p1] = match.players;
  if (!match.layouts[p0.id] || !match.layouts[p1.id]) return;
  match.phase = 'battle';
  match.turn = match.players[hash(match.id) % 2].id;
  match.turnEnd = Date.now() + CFG.TURN_MS;
}

function fire(match, playerId, i) {
  if (match.phase !== 'battle') return { ok: false, error: '不在对战阶段' };
  if (match.turn !== playerId) return { ok: false, error: '还没轮到你' };
  if (!Number.isInteger(i) || i < 0 || i > 99) return { ok: false, error: '格子无效' };
  if (match.moves.some((m) => m.by === playerId && m.i === i)) {
    return { ok: false, error: '已经打过这格' };
  }
  const targetId = oppId(match, playerId);
  const layout = match.layouts[targetId];
  if (!layout) return { ok: false, error: '数据未就绪' };

  const result = shotResult(layout, i);
  match.moves.push({ by: playerId, i, result, t: Date.now() });
  match.tos[playerId] = 0;

  const mine = shotsBy(match, playerId);
  const killed = killedCount(layout, mine);
  if (killed >= 3) {
    endMatch(match, playerId, '三机全灭');
  } else {
    match.turn = targetId;
    match.turnEnd = Date.now() + CFG.TURN_MS;
  }
  return { ok: true, result, i, killed };
}

function surrender(match, playerId) {
  if (match.phase === 'over') return { ok: false, error: '对局已结束' };
  const winner = oppId(match, playerId);
  if (!winner) return { ok: false, error: '无对手' };
  endMatch(match, winner, '对手认输');
  return { ok: true };
}

function endMatch(match, winnerId, reason) {
  match.phase = 'over';
  match.winner = winnerId;
  match.reason = reason;
  match.overAt = Date.now();
}

function applyTimeout(match, now) {
  if (match.phase !== 'battle') return false;
  if (now <= match.turnEnd + CFG.GRACE) return false;
  const current = match.turn;
  const other = oppId(match, current);
  match.moves.push({ by: current, to: 1, t: now });
  match.tos[current] = (match.tos[current] || 0) + 1;
  if (match.tos[current] >= 3) {
    endMatch(match, other, '对方连续超时');
  } else {
    match.turn = other;
    match.turnEnd = now + CFG.TURN_MS;
  }
  return true;
}

function applyPlaceTimeout(match, now) {
  if (match.phase !== 'place') return false;
  if (now < match.placeEnd) return false;
  let changed = false;
  for (const p of match.players) {
    if (!match.layouts[p.id]) {
      autoPlace(match, p.id);
      changed = true;
    }
  }
  return changed;
}

function publicMatchState(match, viewerId, { spectator = false } = {}) {
  const [p0, p1] = match.players;
  const isPlayer = match.players.some((p) => p.id === viewerId);
  const myIdx = playerIdx(match, viewerId);

  const shotResults = {};
  for (const m of match.moves) {
    if (m.i != null && m.result) {
      if (!shotResults[m.by]) shotResults[m.by] = {};
      shotResults[m.by][m.i] = m.result;
    }
  }

  const killed = {};
  for (const p of match.players) {
    const target = match.players.find((x) => x.id !== p.id);
    if (target && match.layouts[target.id]) {
      killed[p.id] = killedCount(match.layouts[target.id], shotsBy(match, p.id));
    } else {
      killed[p.id] = 0;
    }
  }

  const state = {
    id: match.id,
    players: match.players,
    phase: match.phase,
    placeEnd: match.placeEnd,
    turn: match.turn,
    turnEnd: match.turnEnd,
    tos: match.tos,
    winner: match.winner,
    reason: match.reason,
    overAt: match.overAt,
    killed,
    submitted: {},
    myLayout: null,
    myShots: [],
    oppShots: [],
    shotResults: {},
    boardShots: {},
    reveal: null,
  };

  for (const p of match.players) {
    state.submitted[p.id] = !!match.layouts[p.id];
  }

  if (isPlayer && myIdx >= 0) {
    const me = match.players[myIdx].id;
    const opp = match.players[1 - myIdx].id;
    state.myLayout = match.layouts[me] || null;
    state.myShots = shotsBy(match, me);
    state.oppShots = shotsBy(match, opp);
    // 敌方格子：自己打出的结果
    state.shotResults = shotResults[me] || {};
    // 己方被打：对方结果
    state.boardShots = shotResults[opp] || {};
  }

  // 观战：两边命中结果都可见，不泄露未打中的布局；结束可 reveal
  if (spectator || !isPlayer) {
    state.boardShots0 = shotResults[p1.id] || {}; // 打在 p0 上的
    state.boardShots1 = shotResults[p0.id] || {}; // 打在 p1 上的
    state.shotResults = null;
  }

  if (match.phase === 'over') {
    state.reveal = {};
    for (const p of match.players) {
      state.reveal[p.id] = match.layouts[p.id] || null;
    }
  }

  return state;
}

function silCells(planes) {
  if (!planes) return [];
  const cells = [];
  for (const p of planes) {
    for (const cell of planeCells(p)) {
      cells.push({ i: cell.r * 10 + cell.c, h: cell.h });
    }
  }
  return cells;
}

module.exports = {
  createMatch,
  submitLayout,
  autoPlace,
  fire,
  surrender,
  endMatch,
  applyTimeout,
  applyPlaceTimeout,
  publicMatchState,
  playerIdx,
  oppId,
  shotsBy,
  silCells,
  valueMap,
};
