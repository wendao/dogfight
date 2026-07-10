const { randomLayout, valueMap, headSet, planeCells } = require('../../utils/plane');

function emptyCells() {
  return new Array(100).fill('');
}

Page({
  data: {
    cells: emptyCells(),
    steps: 0,
    got: 0,
    over: false,
    lastShot: -1,
    popIdx: -1,
    showWin: false,
    isNew: false,
    best: 0,
  },
  onLoad() {
    this.reset();
  },
  reset() {
    const planes = randomLayout();
    this.planes = planes;
    this.map = valueMap(planes);
    this.heads = new Set(headSet(planes));
    this.rev = new Set();
    this.setData({
      cells: emptyCells(),
      steps: 0,
      got: 0,
      over: false,
      lastShot: -1,
      popIdx: -1,
      showWin: false,
    });
  },
  onCell(e) {
    if (this.data.over) return;
    const i = e.detail.i;
    if (this.rev.has(i)) return;
    this.rev.add(i);
    const v = this.map[i];
    const cells = this.data.cells.slice();
    cells[i] = v === 2 ? 'hith' : v === 1 ? 'hitb' : 'sky';
    let got = this.data.got;
    if (v === 2) got++;
    const steps = this.data.steps + 1;
    this.setData({ cells, steps, got, lastShot: i, popIdx: i });
    if (got >= 3) this.win(steps);
  },
  win(steps) {
    // 揭示剩余轮廓
    const cells = this.data.cells.slice();
    for (const p of this.planes) {
      for (const cell of planeCells(p)) {
        const i = cell.r * 10 + cell.c;
        if (!this.rev.has(i) && !cells[i]) {
          cells[i] = cell.h ? 'silhead' : 'sil';
        }
      }
    }
    let best = 0;
    let isNew = false;
    try {
      best = wx.getStorageSync('sp-best') || 0;
    } catch (e) { /* */ }
    if (!best || steps < best) {
      best = steps;
      isNew = true;
      try {
        wx.setStorageSync('sp-best', best);
      } catch (e) { /* */ }
    }
    this.setData({ cells, over: true, showWin: true, best, isNew });
  },
  again() {
    this.reset();
  },
  home() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) });
  },
});
