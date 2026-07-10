# 打飞机 · 局域网天梯

## 最快开玩（网页）

```bash
cd server
npm install   # 首次
npm start
```

浏览器打开终端里打印的地址，例如：

- 本机：http://127.0.0.1:3000
- 朋友：http://你的局域网IP:3000（同一 Wi‑Fi）

输入代号 → **进入天梯** 即可排队对战。

## 结构

```
fly/
├── server/          # Node 服务 + 网页客户端 (public/)
├── miniprogram/     # 微信小程序（可选，以后用）
└── 打飞机.html      # 原单机网页参考
```

## 玩法

- **单人练习**：本地随机，不依赖联机
- **天梯**：排队 → 前两名对战 → 观战 → 胜者守擂，败者垫底

## 微信小程序（可选）

1. 改 `miniprogram/utils/config.js` 的 HOST
2. 用微信开发者工具导入 `miniprogram/`
3. 勾选「不校验合法域名」
