/* Materials for the sculptor. A tower's walls are shaded by the toolkit on a six-step ramp; its windows are picked out by the
   material's tex() from where the point lies on the wall, and tagged so the page can switch them on and off. */
const U = require('./util.js');
const CELL = 0.36; // a storey, and the width of a window bay, in world units

// six-step ramps (the sculptor's night light lands walls on steps 1, 2, 3 and roofs on 4)
const RAMP = {
  plum: [1, 2, 3, 4, 5, 6],
  plumD: [1, 1, 2, 3, 4, 5],
  slate: [1, 9, 10, 11, 12, 13],
  slateD: [1, 2, 9, 10, 11, 12],
  warm: [1, 14, 15, 16, 17, 18],
  warmD: [1, 2, 14, 15, 16, 17],
  deck: [1, 1, 1, 2, 2, 3],
  road: [1, 1, 1, 2, 2, 2],
  mega: [1, 1, 2, 3, 3, 4],
  hull: [1, 2, 3, 4, 5, 7],
  hullS: [1, 9, 10, 11, 12, 13],
  pale: [2, 14, 15, 16, 17, 18],
  cliff: [1, 1, 2, 3, 4, 5],
  cliffS: [1, 2, 9, 10, 11, 11],
  pipe: [1, 2, 3, 4, 5, 6],
  pipeS: [1, 2, 9, 10, 11, 12]
};
const WIN = {
  warm: [46, 46, 22, 25, 23],
  pale: [46, 46, 22, 26, 46],
  gold: [25, 46, 24, 23, 22],
  amber: [24, 23, 23, 31, 22],
  cool: [46, 13, 13, 46, 45],
  dim: [22, 22, 23, 21, 46]
};

/* t: { cx, cz, hx, hz, yaw, ytop, res, seed, style, ramp, win, lit, roofEdge, piers, bandEvery, crown, tv, noWin } */
function towerMat(W, t) {
  const { REC, F, KIND } = W,
    q = t.res / CELL,
    near = q <= 0.6,
    grid = near ? CELL : t.res,
    seed = t.seed | 0,
    litK = (t.lit === undefined ? 1 : t.lit) * (q > 1.4 ? 1.25 * Math.pow(1 / q, 0.8) : 1),
    win = t.win || WIN.warm,
    style = t.style || 'resid',
    cy = Math.cos(t.yaw || 0),
    sy = Math.sin(t.yaw || 0);
  const prob = (face, iu, iv) => {
    const fl = U.h4(seed, 7, iv, 0),
      cm = U.h4(seed, 9 + face, iu, 0);
    switch (style) {
      case 'office':
        return fl < 0.5 ? 0.72 : 0.05;
      case 'columns':
        return cm < 0.38 ? 0.8 : 0.03;
      case 'bands':
        return iv % 7 < 2 ? 0.82 : 0.08;
      case 'glitter':
        return 0.48;
      case 'dark':
        return 0.022;
      case 'sparse':
        return 0.07;
      default:
        return 0.13 + 0.12 * cm;
    }
  };
  const m = { r: t.ramp || RAMP.plum };
  m.tex = (x, y, z, ny, tone, nx, nz) => {
    REC.tag(null);
    const dx = x - t.cx,
      dz = z - t.cz,
      lx = dx * cy - dz * sy,
      lz = dx * sy + dz * cy;
    if (ny > 0.7) {
      if (t.roofEdge) {
        const e = Math.min(t.hx - Math.abs(lx), t.hz - Math.abs(lz));
        if (e < t.res * 1.02) {
          REC.tag({ flags: F.EM });
          return t.roofEdge;
        }
      }
      return undefined;
    }
    if (ny < -0.7 || t.noWin) return undefined;
    const lnx = nx * cy - nz * sy,
      lnz = nx * sy + nz * cy;
    let u, face;
    if (Math.abs(lnx) > Math.abs(lnz)) {
      face = lnx > 0 ? 0 : 1;
      u = lz + t.hz;
    } else {
      face = lnz > 0 ? 2 : 3;
      u = lx + t.hx;
    }
    const gu = u / grid,
      gv = (t.ytop - y) / grid,
      iu = Math.floor(gu + 1e-4),
      iv = Math.floor(gv + 1e-4);
    if (near) {
      const fu = gu - iu,
        fv = gv - iv;
      if (fu < 0.14 || fu > 0.74 || fv < 0.18 || fv > 0.74) return undefined;
    }
    if (iv < (t.crown || 0)) return undefined;
    if (t.bandEvery && iv % t.bandEvery === t.bandEvery - 1) return undefined;
    if (t.piers && iu % t.piers === 0) return undefined;
    if (U.h4(seed, face, iu, iv) >= prob(face, iu, iv) * litK) return undefined;
    const r2 = U.h4(seed, 77 + face, iu, iv),
      mode = r2 < 0.8 ? 0 : r2 < 0.965 ? 1 : 2,
      wc = mode === 2 ? t.tv || 13 : win[Math.floor(U.h4(seed, 31, iu * 3 + face, iv) * win.length)];
    REC.tag({ kind: KIND.WINDOW, flags: F.EM | (q > 1.15 ? F.BIG : 0), ph: U.h4(seed, 5, iu * 7 + face, iv), sp: mode });
    return wc;
  };
  if (t.bandEvery || t.piers)
    m.mod = (x, y, z, ny, A, nxU) => {
      if (ny > 0.7 || ny < -0.7) return 0;
      let d = 0;
      const iv = Math.floor((t.ytop - y) / grid + 1e-4);
      if (t.bandEvery && iv % t.bandEvery === t.bandEvery - 1) d -= 0.17;
      if (t.piers) {
        const dx = x - t.cx,
          dz = z - t.cz,
          lx = dx * cy - dz * sy,
          lz = dx * sy + dz * cy,
          onX = t.hx - Math.abs(lx) < t.hz - Math.abs(lz),
          iu = Math.floor((onX ? lz + t.hz : lx + t.hx) / grid + 1e-4);
        if (iu % t.piers === 0) d += 0.17;
      }
      return d;
    };
  return m;
}
const plain = (ramp, b) => ({ r: ramp, b: b || 0 });
module.exports = { towerMat, plain, RAMP, WIN, CELL };
