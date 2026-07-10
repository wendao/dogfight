'use strict';

const CFG = {
  PLACE_MS: 60000,
  TURN_MS: 60000,
  GRACE: 5000,
  HB_MS: 6000,
  STALE: 20000,
  DEAD: 30000,
  TICK_MS: 1000,
  PORT: Number(process.env.PORT) || 3000,
};

module.exports = { CFG };
