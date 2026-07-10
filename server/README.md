# 打飞机天梯服务端

## 启动

```bash
cd server
npm install
npm start
```

默认监听 `0.0.0.0:3000`（局域网可访问）。

## 接口

- `POST /api/login` `{ "name": "代号" }` → `{ player: { id, name, token } }`
- `WS /ws` 先发 `{ "type":"auth", "token":"..." }`

## 小程序配置

把 `miniprogram/utils/config.js` 里的 `HOST` 改成启动日志里的局域网 IP。
