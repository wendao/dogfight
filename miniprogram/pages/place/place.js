const ws = require('../../utils/ws');
const { toast } = require('../../utils/api');
const {
  ONAMES,
  ORIENTS,
  planeAt,
  planeValid,
  planeCells,
  randomLayout,
  silIndices,
} = require('../../utils/plane');

function emptyCells() {
  return new Array(100).fill('');
}

Page({
  data: {
    oppName: '',
    cells: emptyCells(),
    count: 0,
    orient: 0,
    oriName: ONAMES[0],
    timer: 60,
    urgent: false,
    submitted: false,
    status: '点选机头位置放置飞机（可重叠，机头不能同格）',
    canConfirm: false,
    mini: [],
  },
  localPlanes: [],
  preview: null,
  placeEnd: 0,
  timerIv: null,
  _offs: [],
  onLoad() {
    this.localPlanes = [];
    this.preview = null;
    this.drawMini();
    this.bindWs();
    ws.send({ type: 'sync' });
  },
  onUnload() {
    this.unbind();
  },
  unbind() {
    this._offs.forEach((o) => o && o());
    this._offs = [];
    if (this.timerIv) {
      clearInterval(this.timerIv);
      this.timerIv = null;
    }
  },
  bindWs() {
    this._offs.push(
      ws.on('match_state', (msg) => this.onMatch(msg)),
      ws.on('place_ok', () => {
        this.setData({
          submitted: true,
          status: '阵型已锁定，等待对手…',
          canConfirm: false,
        });
      }),
      ws.on('error', (msg) => toast(msg.error || '错误')),
      ws.on('ladder_state', (msg) => {
        if (!msg.matchId && this.data.submitted) {
          // 对局被清掉
        }
      })
    );
  },
  onMatch(msg) {
    const m = msg.match;
    if (!m) {
      wx.redirectTo({ url: '/pages/lobby/lobby' });
      return;
    }
    const me = getApp().globalData.player;
    const opp = m.players.find((p) => p.id !== me.id);
    this.setData({ oppName: opp ? opp.name : '' });
    this.placeEnd = m.placeEnd || 0;
    if (!this.timerIv) {
      this.timerIv = setInterval(() => this.tickSec(), 500);
    }

    if (m.phase === 'battle') {
      wx.redirectTo({ url: '/pages/battle/battle' });
      return;
    }
    if (m.phase === 'over') {
      toast(m.winner === me.id ? '对手离场，你获胜' : '对局结束');
      wx.redirectTo({ url: '/pages/lobby/lobby' });
      return;
    }

    if (m.myLayout && !this.data.submitted) {
      this.localPlanes = m.myLayout;
      this.setData({ submitted: true, count: 3, canConfirm: false, status: '阵型已锁定，等待对手…' });
      this.redraw();
    }

    if (this.data.submitted) {
      const oppReady = opp && m.submitted && m.submitted[opp.id];
      this.setData({
        status: oppReady ? '双方就绪，进入对局！' : '阵型已锁定，等待对手…',
      });
    } else if (opp && m.submitted && m.submitted[opp.id]) {
      this.setData({ status: '对手已就绪，等你部署。' });
    }
  },
  tickSec() {
    if (!this.placeEnd) return;
    const left = Math.max(0, Math.ceil((this.placeEnd - Date.now()) / 1000));
    this.setData({ timer: left, urgent: left <= 10 });
  },
  drawMini() {
    const g = new Array(25).fill('');
    for (const cell of ORIENTS[this.data.orient].cells) {
      g[cell.dr * 5 + cell.dc] = cell.h ? 'h' : 'b';
    }
    this.setData({ mini: g });
  },
  rotate() {
    if (this.data.submitted) return;
    const orient = (this.data.orient + 1) % 4;
    this.setData({ orient, oriName: ONAMES[orient] });
    this.drawMini();
    this.redraw();
  },
  undo() {
    if (this.data.submitted || !this.localPlanes.length) return;
    this.localPlanes.pop();
    this.redraw();
  },
  clear() {
    if (this.data.submitted) return;
    this.localPlanes = [];
    this.redraw();
  },
  rand() {
    if (this.data.submitted) return;
    this.localPlanes = randomLayout();
    this.redraw();
  },
  onCell(e) {
    if (this.data.submitted) return;
    const i = e.detail.i;
    // 触屏：第一次预览，再点同格放置；简化为直接放置
    this.tryPlace(i);
  },
  tryPlace(i) {
    if (this.localPlanes.length >= 3) {
      toast('已放满 3 架');
      return;
    }
    const p = planeAt(this.data.orient, i);
    if (!planeValid(p, this.localPlanes)) {
      toast('位置不合法');
      return;
    }
    this.localPlanes.push(p);
    this.redraw();
  },
  redraw() {
    const cells = emptyCells();
    for (const c of silIndices(this.localPlanes)) {
      cells[c.i] = c.h ? 'silhead' : 'sil';
    }
    // 简单不画预览，避免复杂
    this.setData({
      cells,
      count: this.localPlanes.length,
      canConfirm: this.localPlanes.length === 3 && !this.data.submitted,
    });
  },
  confirm() {
    if (!this.data.canConfirm) return;
    ws.send({ type: 'place', planes: this.localPlanes });
  },
});
