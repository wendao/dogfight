App({
  globalData: {
    player: null,
  },
  onLaunch() {
    try {
      const p = wx.getStorageSync('player');
      if (p && p.token) this.globalData.player = p;
    } catch (e) { /* */ }
  },
  setPlayer(player) {
    this.globalData.player = player;
    try {
      wx.setStorageSync('player', player);
    } catch (e) { /* */ }
  },
  clearPlayer() {
    this.globalData.player = null;
    try {
      wx.removeStorageSync('player');
    } catch (e) { /* */ }
  },
});
