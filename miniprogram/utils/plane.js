'use strict';

const TPL = ['00200', '11111', '00100', '00100', '01110'];

function rotCW(g) {
  const out = [];
  for (let r = 0; r < 5; r++) {
    let row = '';
    for (let c = 0; c < 5; c++) row += g[4 - c][r];
    out.push(row);
  }
  return out;
}

const ORIENTS = (() => {
  const arr = [];
  let g = TPL;
  for (let o = 0; o < 4; o++) {
    const cells = [];
    let head = null;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const ch = g[r][c];
        if (ch !== '0') {
          const cell = { dr: r, dc: c, h: ch === '2' };
          cells.push(cell);
          if (cell.h) head = cell;
        }
      }
    }
    arr.push({ cells, head });
    g = rotCW(g);
  }
  return arr;
})();

const ONAMES = ['机头朝上', '机头朝右', '机头朝下', '机头朝左'];

function planeCells(p) {
  return ORIENTS[p.o].cells.map((x) => ({ r: p.r + x.dr, c: p.c + x.dc, h: x.h }));
}

function headIdx(p) {
  const hd = ORIENTS[p.o].head;
  return (p.r + hd.dr) * 10 + (p.c + hd.dc);
}

function planeValid(p, others) {
  for (const cell of planeCells(p)) {
    if (cell.r < 0 || cell.r > 9 || cell.c < 0 || cell.c > 9) return false;
  }
  const hi = headIdx(p);
  for (const q of others) {
    if (headIdx(q) === hi) return false;
  }
  return true;
}

function randomLayout(existing) {
  const planes = [];
  const base = existing ? existing.slice() : [];
  let guard = 0;
  while (planes.length < 3 - (existing ? existing.length : 0)) {
    if (++guard > 5000) break;
    const p = {
      o: (Math.random() * 4) | 0,
      r: (Math.random() * 6) | 0,
      c: (Math.random() * 6) | 0,
    };
    if (planeValid(p, base.concat(planes))) planes.push(p);
  }
  return (existing || []).concat(planes);
}

function valueMap(planes) {
  const m = new Array(100).fill(0);
  for (const p of planes) {
    for (const cell of planeCells(p)) {
      const i = cell.r * 10 + cell.c;
      const v = cell.h ? 2 : 1;
      if (v > m[i]) m[i] = v;
    }
  }
  return m;
}

function headSet(planes) {
  return planes.map(headIdx);
}

function planeAt(orient, headCellIndex) {
  const hd = ORIENTS[orient].head;
  return {
    o: orient,
    r: ((headCellIndex / 10) | 0) - hd.dr,
    c: (headCellIndex % 10) - hd.dc,
  };
}

function silIndices(planes) {
  const out = [];
  for (const p of planes) {
    for (const cell of planeCells(p)) {
      out.push({ i: cell.r * 10 + cell.c, h: cell.h });
    }
  }
  return out;
}

module.exports = {
  ORIENTS,
  ONAMES,
  planeCells,
  headIdx,
  planeValid,
  randomLayout,
  valueMap,
  headSet,
  planeAt,
  silIndices,
};
