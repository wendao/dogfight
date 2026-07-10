const config = require('./config');

function login(name) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.HTTP}/api/login`,
      method: 'POST',
      data: { name },
      success(res) {
        if (res.data && res.data.ok) resolve(res.data.player);
        else reject(new Error((res.data && res.data.error) || '登录失败'));
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

function toast(title) {
  wx.showToast({ title: String(title).slice(0, 20), icon: 'none' });
}

module.exports = { login, toast };
