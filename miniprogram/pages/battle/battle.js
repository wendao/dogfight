const ws = require('../../utils/ws');
const { toast } = require('../../utils/api');
const { silIndices } = require('../../utils/plane');

function emptyCells() {
  return new Array(100).fill('');
}

function applyShots(base, shotMap) {
  const cells = base.slice();
  if (!shotMap) return cells;
  Object.keys(shotMap).forEach((k) => {
    const i = +k;
    const r = shotMap[k];
    cells[i] = r === 'head' ? 'hith' : r === 'body' ? 'hitb' : 'sky';
  });
  return cells;
}

function silBase(planes) {
  const cells = emptyCells();
  if (!planes) return cells;
  for (const c of silIndices(planes)) {
    cells[c.i] = c.h ? 'silhead' : 'sil';
  }
  return cells;
}

Page({
  data: {
    oppName: '',
    banner: '同步中…',
    myKilled: 0,
    opKilled: 0,
    timer: 60,
    urgent: false,
    tosText: '',
    mineCells: emptyCells(),
    enemyCells: emptyCells(),
    myTurn: false,
    lastMine: -1,
    lastEnemy: -1,
    popMine: -1,
    popEnemy: -1,
    selIdx: -1,
    showOver: false,
    reviewing: false,
    win: false,
    reason: '',
    overTip: '',
  },
  turnEnd: 0,
  timerIv: null,
  _offs: [],
  busy: false,
  _pending: -1,
  reviewing: false,
  onLoad() {
    this.bindWs();
    ws.send({ type: 'sync' });
  },
  onUnload() {
    this.unbind();
  },
  unbind() {
    this._offs.forEach((o) => o && o());
    this._offs = [];
    if (this.timerIv) clearInterval(this.timerIv);
  },
  bindWs() {
    this._offs.push(
      ws.on('match_state', (msg) => this.onMatch(msg)),
      ws.on('shot_result', (msg) => this.onShot(msg)),
      ws.on('ladder_state', () => {
        /* 复盘中不因 match 清空而跳走 */
      }),
      ws.on('error', (msg) => toast(msg.error || '错误'))
    );
  },
  onMatch(msg) {
    const m = msg.match;
    if (!m) {
      if (this.reviewing) return;
      wx.redirectTo({ url: '/pages/lobby/lobby' });
      return;
    }
    if (this.reviewing) return;
    const me = getApp().globalData.player;
    if (m.phase === 'place') {
      wx.redirectTo({ url: '/pages/place/place' });
      return;
    }
    const opp = m.players.find((p) => p.id !== me.id);
    this.turnEnd = m.turnEnd || 0;
    if (!this.timerIv) this.timerIv = setInterval(() => this.tickSec(), 500);

    const myTurn = m.phase === 'battle' && m.turn === me.id;
    let mineCells = applyShots(silBase(m.myLayout), m.boardShots);
    let enemyCells = applyShots(emptyCells(), m.shotResults);

    if (m.phase === 'over' && m.reveal && opp) {
      enemyCells = applyShots(silBase(m.reveal[opp.id]), m.shotResults);
    }

    const myKilled = (m.killed && m.killed[me.id]) || 0;
    const opKilled = opp && m.killed ? m.killed[opp.id] || 0 : 0;
    const myTos = (m.tos && m.tos[me.id]) || 0;
    const opTos = opp && m.tos ? m.tos[opp.id] || 0 : 0;

    let banner = '';
    if (m.phase === 'battle') {
      banner = myTurn ? '轮到你开火 —— 同一格点两次确认' : `等待 ${opp ? opp.name : '对手'} 行动…`;
    }

    if (!myTurn) this._pending = -1;

    const lastEnemy =
      m.myShots && m.myShots.length ? m.myShots[m.myShots.length - 1] : -1;
    const lastMine =
      m.oppShots && m.oppShots.length ? m.oppShots[m.oppShots.length - 1] : -1;

    this.setData({
      oppName: opp ? opp.name : '',
      banner,
      myKilled,
      opKilled,
      myTurn,
      mineCells,
      enemyCells,
      lastMine,
      lastEnemy,
      selIdx: myTurn && this._pending >= 0 ? this._pending : -1,
      tosText: myTos || opTos ? `超时 你${myTos}/3 · 对方${opTos}/3` : '',
    });

    if (m.phase === 'over' && !this.data.showOver) {
      this.showOver(m.winner === me.id, m.reason || '');
    }
  },
  onShot(msg) {
    const me = getApp().globalData.player;
    if (msg.by === me.id) {
      this.setData({ popEnemy: msg.i });
    } else {
      this.setData({ popMine: msg.i });
    }
  },
  tickSec() {
    if (this.reviewing || !this.turnEnd) return;
    const left = Math.max(0, Math.ceil((this.turnEnd - Date.now()) / 1000));
    this.setData({ timer: left, urgent: left <= 10 });
  },
  onFire(e) {
    if (!this.data.myTurn || this.busy || this.reviewing) return;
    const i = e.detail.i;
    const cells = this.data.enemyCells;
    if (cells[i] === 'sky' || cells[i] === 'hitb' || cells[i] === 'hith') return;
    if (this._pending === i) {
      this._pending = -1;
      this.setData({ selIdx: -1 });
      this.busy = true;
      ws.send({ type: 'fire', i });
      setTimeout(() => {
        this.busy = false;
      }, 400);
    } else {
      this._pending = i;
      this.setData({ selIdx: i });
      toast('再点一次确认开火');
    }
  },
  showOver(win, reason) {
    this.reviewing = true;
    this.setData({
      showOver: true,
      reviewing: true,
      myTurn: false,
      win,
      reason,
      overTip: '棋盘已揭晓，可复盘后再离开',
      banner: win ? '胜利！可查看双方布局复盘' : '落败 —— 可查看对手布局复盘',
      selIdx: -1,
    });
  },
  goLobby() {
    this.reviewing = false;
    ws.send({ type: 'join_ladder' });
    wx.redirectTo({ url: '/pages/lobby/lobby' });
  },
  leaveLadder() {
    this.reviewing = false;
    ws.send({ type: 'leave_ladder' });
    ws.close();
    wx.reLaunch({ url: '/pages/index/index' });
  },
  quit() {
    if (this.reviewing) return;
    wx.showModal({
      title: '认输退出',
      content: '确定认输并退出天梯吗？',
      success: (res) => {
        if (res.confirm) {
          ws.send({ type: 'surrender' });
          ws.send({ type: 'leave_ladder' });
          ws.close();
          wx.reLaunch({ url: '/pages/index/index' });
        }
      },
    });
  },
});
