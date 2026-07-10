// 局域网调试：改成电脑 IP（server 启动日志会打印）
// 模拟器可用 127.0.0.1；真机必须用局域网 IP
const HOST = '127.0.0.1';
const PORT = 3000;

module.exports = {
  HOST,
  PORT,
  HTTP: `http://${HOST}:${PORT}`,
  WS: `ws://${HOST}:${PORT}/ws`,
};
