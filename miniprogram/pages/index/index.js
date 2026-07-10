const { login, toast } = require('../../utils/api');
const config = require('../../utils/config');

Page({
  data: {
    name: '',
    host: config.HOST,
    port: config.PORT,
  },
  onShow() {
    const app = getApp();
    if (app.globalData.player && app.globalData.player.name) {
      this.setData({ name: app.globalData.player.name });
    }
  },
  onName(e) {
    this.setData({ name: e.detail.value });
  },
  async ensureLogin() {
    const app = getApp();
    const name = (this.data.name || '').trim();
    if (!name) {
      toast('请输入代号');
      return null;
    }
    try {
      wx.showLoading({ title: '登录中' });
      const player = await login(name);
      app.setPlayer(player);
      this.setData({ name: player.name });
      return player;
    } catch (e) {
      toast('连不上服务器，检查 IP');
      console.error(e);
      return null;
    } finally {
      wx.hideLoading();
    }
  },
  goSingle() {
    const app = getApp();
    const name = (this.data.name || '').trim() || '飞行员';
    if (!app.globalData.player) {
      app.setPlayer({ id: 'local', name, token: '' });
    } else if (name) {
      app.globalData.player.name = name;
    }
    wx.navigateTo({ url: '/pages/single/single' });
  },
  async goLadder() {
    const p = await this.ensureLogin();
    if (p) wx.navigateTo({ url: '/pages/lobby/lobby' });
  },
});
