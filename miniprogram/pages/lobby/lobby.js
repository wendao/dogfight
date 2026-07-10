const ws = require('../../utils/ws');
const { toast } = require('../../utils/api');
const { silIndices } = require('../../utils/plane');

function emptyCells() {
  return new Array(100).fill('');
}

function paintShots(shotMap) {
  const cells = emptyCells();
  if (!shotMap) return cells;
  Object.keys(shotMap).forEach((k) => {
    const i = +k;
    const r = shotMap[k];
    cells[i] = r === 'head' ? 'hith' : r === 'body' ? 'hitb' : 'sky';
  });
  return cells;
}

Page({
  data: {
    championName: '',
    streak: 0,
    hasChamp: false,
    isChamp: false,
    queue: [],
    status: '连接中…',
    hasMatch: false,
    phase: '',
    p0Name: '',
    p1Name: '',
    cells0: emptyCells(),
    cells1: emptyCells(),
    killed0: 0,
    killed1: 0,
  },
  _offs: [],
  onShow() {
    this.connectAndJoin();
  },
  onHide() {
    // 保持连接，离开时再 leave
  },
  onUnload() {
    // 跳转布阵/对战也会 unload，不能在这里 leave
    this.cleanup();
  },
  cleanup() {
    this._offs.forEach((off) => off && off());
    this._offs = [];
  },
  async connectAndJoin() {
    const app = getApp();
    const player = app.globalData.player;
    if (!player || !player.token) {
      toast('请先登录');
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }
    this.cleanup(false);
    this._offs.push(
      ws.on('ladder_state', (msg) => this.onLadder(msg)),
      ws.on('match_state', (msg) => this.onMatch(msg)),
      ws.on('error', (msg) => toast(msg.error || '错误')),
      ws.on('ws_close', () => this.setData({ status: '连接断开，重连中…' }))
    );
    try {
      if (!ws.isAuthed()) {
        await ws.connect(player.token);
      }
      ws.send({ type: 'join_ladder' });
      ws.send({ type: 'sync' });
    } catch (e) {
      toast('连接失败');
      console.error(e);
      this.setData({ status: '连接失败，检查服务器 IP' });
    }
  },
  onLadder(msg) {
    const q = msg.queue || [];
    const you = msg.you || {};
    this.setData({
      hasChamp: !!(msg.champion && msg.champion.id),
      championName: msg.champion ? msg.champion.name : '',
      streak: msg.streak || 0,
      isChamp: !!you.isChamp,
      queue: q.map((x) => ({
        id: x.id,
        name: x.name,
        me: x.id === (getApp().globalData.player && getApp().globalData.player.id),
      })),
    });
    if (!msg.matchId) {
      const n = q.length + (msg.champion ? 1 : 0);
      this.setData({
        hasMatch: false,
        status: n >= 2 ? '正在撮合对局…' : '人数不足，等待更多飞行员…',
        cells0: emptyCells(),
        cells1: emptyCells(),
      });
    }
  },
  onMatch(msg) {
    const m = msg.match;
    if (!m) return;
    const app = getApp();
    const me = app.globalData.player;
    const inMatch = m.players.some((p) => p.id === me.id);

    if (inMatch && m.phase === 'place') {
      wx.redirectTo({ url: '/pages/place/place' });
      return;
    }
    if (inMatch && m.phase === 'battle') {
      wx.redirectTo({ url: '/pages/battle/battle' });
      return;
    }

    // 观战
    const [p0, p1] = m.players;
    let cells0 = paintShots(m.boardShots0);
    let cells1 = paintShots(m.boardShots1);
    if (m.phase === 'over' && m.reveal) {
      cells0 = this.revealOn(cells0, m.reveal[p0.id]);
      cells1 = this.revealOn(cells1, m.reveal[p1.id]);
    }
    let status = '';
    if (m.phase === 'place') {
      status = `对局：${p0.name} vs ${p1.name} —— 双方布阵中…`;
    } else if (m.phase === 'over') {
      const w = m.players.find((p) => p.id === m.winner);
      status = `${w ? w.name : '?'} 获胜！（${m.reason || ''}）即将开始新对局…`;
    } else {
      const tp = m.players.find((p) => p.id === m.turn);
      status = `观战中 · 轮到 ${tp ? tp.name : ''}`;
    }
    this.setData({
      hasMatch: true,
      phase: m.phase,
      p0Name: p0.name,
      p1Name: p1.name,
      cells0,
      cells1,
      killed0: (m.killed && m.killed[p1.id]) || 0, // 打在 p0 上的是 p1 击落数
      killed1: (m.killed && m.killed[p0.id]) || 0,
      status,
    });
  },
  revealOn(cells, planes) {
    if (!planes) return cells;
    const next = cells.slice();
    for (const c of silIndices(planes)) {
      if (!next[c.i]) next[c.i] = c.h ? 'silhead' : 'sil';
    }
    return next;
  },
  exit() {
    wx.showModal({
      title: '退出天梯',
      content: '确定退出？对局中将视为认输。',
      success: (res) => {
        if (res.confirm) {
          ws.send({ type: 'leave_ladder' });
          ws.close();
          wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) });
        }
      },
    });
  },
});
