'use strict';

const CFG = {
  PLACE_MS: 60000,
  TURN_MS: 60000,
  GRACE: 5000,
  HB_MS: 6000,
  STALE: 25000,   // 队列/擂主：超过视为离开排队
  DEAD: 60000,    // 对局中：60s 内可刷新重连，超时才判离线
  TICK_MS: 1000,
  PORT: Number(process.env.PORT) || 3000,
};

module.exports = { CFG };
