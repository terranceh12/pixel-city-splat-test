/* The pieces a city is put together from: towers (stacked box solids with lit windows), decks that follow a road's line,
   light trails, signs, beacons. Everything solid goes to the toolkit's sculptor as signed-distance boxes; lights are laid as
   glowing splats through the toolkit's builder. */
const U = require('./util.js');
const M = require('./materials.js');
const PAL = require('../palette.js');
const { clamp } = U;

// deep in the haze nothing needs to be fine
const deepPx = y => (y < -78 ? 2.6 : y < -58 ? 2.0 : y < -40 ? 1.5 : y < -24 ? 1.2 : 1);

/* A tower: a stack of box solids for the sculptor (walls and roof, laid coarse: they are dark), and its lit windows laid over
   them one splat to a window, so the glitter stays sharp however coarse the wall under it is.
   o: { x, z, w, d, top, bottom, yaw, style, ramp, win, lit, seed, tile, chunk, roofEdge, crown, tv, noWin, kit (roof clutter and a
        beacon), px (walls), wpx (windows), occl } */
const WALL_PX = 4,
  WIN_PX = 2;
function winProb(style, seed, face, iu, iv) {
  const fl = U.h4(seed, 7, iv, 0),
    cm = U.h4(seed, 9 + face, iu, 0);
  switch (style) {
    case 'office': // whole floors working late
      return fl < 0.22 ? 0.5 : 0.025;
    case 'columns': // stair wells and lift lobbies
      return cm < 0.2 ? 0.5 : 0.02;
    case 'bands':
      return iv % 9 < 2 ? 0.45 : 0.03;
    case 'glitter':
      return 0.2;
    case 'dark':
      return 0.008;
    case 'sparse':
      return 0.03;
    default: // flats: a scatter, thicker in patches
      return 0.035 + 0.09 * cm * fl;
  }
}
function tower(W, o) {
  const yaw = o.yaw || 0,
    hx = o.w / 2,
    hz = o.d / 2,
    bottom = o.bottom === undefined ? W.FOG_CUT : o.bottom,
    tile = o.tile || 32,
    grp = W.tile(o.x, o.z, 0, tile),
    gWin = W.tile(o.x, o.z, 0, tile, 'win'),
    seed = o.seed === undefined ? (Math.round(o.x * 7.3) * 73856093) ^ (Math.round(o.z * 5.1) * 19349663) : o.seed,
    chunk = o.chunk || 18,
    cs = Math.cos(yaw),
    sn = Math.sin(yaw),
    Ux = [cs, 0, -sn],
    Wz = [sn, 0, cs],
    win = o.win || M.WIN.warm,
    K = W.KIND,
    mat = M.plain(o.ramp || M.RAMP.plum);
  let ya = o.top,
    k = 0,
    resTop = 0;
  while (ya > bottom + 0.01) {
    const yb = Math.max(bottom, ya - chunk),
      first = k === 0,
      ym = (ya + yb) / 2,
      c = [o.x, ym, o.z],
      h = [hx, (ya - yb) / 2, hz],
      made = W.box({
        c,
        h,
        yaw,
        px: (o.px || WALL_PX) * deepPx(ym),
        hi: o.hi || 5.5,
        segH: chunk + 1,
        top: first && o.roof !== false,
        grp,
        ycut: bottom,
        occl: o.occl,
        what: o.what || 'tower',
        mat
      });
    if (first) resTop = made.length ? made[0].res : 0;
    // the windows of this stretch of wall
    if (!o.noWin || (first && o.roofEdge)) {
      const g = U.resBox(c, h, yaw, (o.wpx || WIN_PX) * deepPx(ym), M.CELL, 4.2),
        q = g / M.CELL,
        lit = o.lit === undefined ? 1 : o.lit,
        nCells = q > 1.4 ? Math.pow(q, 1.3) : 1, // (far off, one dot stands for several windows: it is lit if any of them is)
        set = W.lightSet(c, h, g, gWin),
        s = g * (q > 1.4 ? 0.15 : 0.2),
        big = false;
      if (!o.noWin)
        [
          [Ux, 1, hx, Wz, hz, 0],
          [Ux, -1, hx, Wz, hz, 1],
          [Wz, 1, hz, Ux, hx, 2],
          [Wz, -1, hz, Ux, hx, 3]
        ].forEach(([ax, sg, hh, ot, oh, face]) => {
          const n = [ax[0] * sg, 0, ax[2] * sg],
            pc = [o.x + n[0] * hh, ym, o.z + n[2] * hh];
          if (!U.planeSeen(pc, n)) return;
          const nu = Math.max(1, Math.floor((2 * oh - g * 0.3) / g)),
            u0 = -(nu * g) / 2,
            j0 = Math.ceil((o.top - ya) / g - 0.5 + 1e-6),
            j1 = Math.floor((o.top - yb) / g - 0.5 - 1e-6);
          for (let j = j0; j <= j1; j++) {
            if (j < (o.crown || 0)) continue;
            const y = o.top - (j + 0.5) * g;
            for (let i = 0; i < nu; i++) {
              const p1 = Math.min(0.95, winProb(o.style || 'resid', seed, face, i, j) * lit);
              if (U.h4(seed, face, i, j) >= (nCells > 1 ? Math.min(0.5, 1 - Math.pow(1 - p1, nCells)) : p1)) continue;
              const u = u0 + (i + 0.5) * g,
                r2 = U.h4(seed, 77 + face, i, j),
                mode = r2 < 0.8 ? 0 : r2 < 0.965 ? 1 : 2,
                dimmed = nCells > 2 && U.h4(seed, 33, i + face * 5, j) < 0.55,
                pal = mode === 2 ? o.tv || 13 : dimmed ? [19, 18, 23, 19][Math.floor(U.h4(seed, 34, i, j + face) * 4)] : win[Math.floor(U.h4(seed, 31, i * 3 + face, j) * win.length)];
              W.lightAdd(set, pc[0] + ot[0] * u + n[0] * 0.04, y, pc[2] + ot[2] * u + n[2] * 0.04, n, pal, s, K.WINDOW, U.h4(seed, 5, i * 7 + face, j), mode, big);
            }
          }
        });
      if (first && o.roofEdge && U.EYE_MAX_Y > o.top + 0.5) {
        // a line of lamps round the roof
        const up = [0, 1, 0],
          e = Math.min(g, 0.6),
          put = (lx, lz) => W.lightAdd(set, o.x + Ux[0] * lx + Wz[0] * lz, o.top + 0.04, o.z + Ux[2] * lx + Wz[2] * lz, up, o.roofEdge, e * 0.3, K.STILL, 0, 0, e < g);
        for (let u = -hx + e / 2; u < hx; u += e) (put(u, -hz + e * 0.3), put(u, hz - e * 0.3));
        for (let v = -hz + e * 1.5; v < hz - e; v += e) (put(-hx + e * 0.3, v), put(hx - e * 0.3, v));
      }
    }
    ya = yb;
    k++;
  }
  if (o.kit && resTop && resTop < 1.4) roofKit(W, o, resTop, seed);
  return resTop;
}

// what stands on a roof: plant rooms, a mast with a beacon
function roofKit(W, o, res, seed) {
  const R = U.rng(seed ^ 0x51ed),
    yaw = o.yaw || 0,
    cs = Math.cos(yaw),
    sn = Math.sin(yaw),
    at = (lx, lz) => [o.x + lx * cs + lz * sn, o.z - lx * sn + lz * cs],
    grp = W.tile(o.x, o.z, 0, o.tile || 32),
    n = res < 0.7 ? R.int(1, 3) : 1;
  for (let i = 0; i < n; i++) {
    const w = R.range(0.18, 0.4) * o.w,
      d = R.range(0.18, 0.4) * o.d,
      h = R.range(0.3, 1.3),
      p = at(R.range(-0.5, 0.5) * (o.w - w), R.range(-0.5, 0.5) * (o.d - d));
    W.box({
      c: [p[0], o.top + h / 2, p[1]],
      h: [w / 2, h / 2, d / 2],
      yaw,
      grp,
      mat: M.plain(o.ramp === M.RAMP.slate ? M.RAMP.slateD : M.RAMP.plumD),
      occl: false
    });
  }
  if (o.kit !== 'plain' && R.chance(o.kit === 'mast' ? 1 : 0.45)) {
    const p = at(R.range(-0.3, 0.3) * o.w, R.range(-0.3, 0.3) * o.d),
      h = R.range(1.6, 4.5) * (o.kit === 'mast' ? 1.6 : 1);
    W.rod(grp, [p[0], o.top, p[1]], [p[0], o.top + h, p[1]], Math.max(0.03, res * 0.2), 4, { big: res > 0.25 });
    beacon(W, p[0], o.top + h + 0.08, p[1], R.pick([34, 34, 35, 30]), { sp: R.range(1.6, 3.2), ph: R.range(0, 6.3) });
  }
}

// a blinking light with its halo
function beacon(W, x, y, z, pal, o) {
  o = o || {};
  const seen = U.seenFrom(x, y, z, 1);
  if (seen > 1e8) return;
  const s = Math.max(o.s || 0.07, (0.5 * seen) / U.F_ART),
    ph = o.ph || 0,
    sp = o.sp || 2.2;
  W.lamp(W.tile(x, z, 0, 64, 'lit'), x, y, z, s, pal, { kind: o.steady ? W.KIND.TWINKLE : W.KIND.BLINK, sp, ph, big: true });
  if (o.halo !== false)
    W.glow(W.tile(x, z, 1, 64, 'halo'), x, y, z, Math.max(s * 5, o.hs || 0.5), o.hp || pal - 1, o.ha || 0.55, {
      kind: o.steady ? W.KIND.TWINKLE : W.KIND.BLINK,
      sp,
      ph
    });
}

/* a deck that follows a path. o: { s0, s1, wl, wr (to the left and right of the centre line), y0, y1 (its under side and top, from the
   path's own height), piece, mat, tile, px, ycut, occl } */
function deck(W, path, o) {
  let s = o.s0;
  while (s < o.s1 - 1e-6) {
    const mid0 = path.at(Math.min(o.s1, s + 0.5)),
      r0 = U.resAt(mid0.p[0], mid0.p[1] + o.y1, mid0.p[2], o.px, 0.06, 3.2),
      piece = clamp(o.piece || r0 * 8, 0.8, o.maxPiece || 9),
      e = Math.min(o.s1, s + piece),
      q = path.at((s + e) / 2),
      hl = Math.hypot(q.t[0], q.t[2]) || 1,
      yaw = Math.atan2(q.t[0] / hl, q.t[2] / hl),
      off = (o.wl - o.wr) / 2;
    W.box({
      c: [q.p[0] + q.n[0] * off, q.p[1] + (o.y0 + o.y1) / 2, q.p[2] + q.n[2] * off],
      h: [(o.wl + o.wr) / 2, (o.y1 - o.y0) / 2, (e - s) / 2 + 0.06 + piece * 0.03],
      yaw,
      px: o.px,
      lo: o.lo,
      mat: o.mat,
      grp: W.tile(q.p[0], q.p[2], 0, o.tile || 32),
      ends: false,
      top: o.top,
      ycut: o.ycut,
      occl: o.occl,
      what: o.what || 'deck'
    });
    s = e;
  }
}
// legs under a path, every `gap` along it. o: { s0, s1, gap, w, d, y (their top, from the path's height), mat, off }
function piers(W, path, o) {
  for (let s = o.s0; s < o.s1; s += o.gap) {
    const q = path.at(s),
      hl = Math.hypot(q.t[0], q.t[2]) || 1,
      x = q.p[0] + q.n[0] * (o.off || 0),
      z = q.p[2] + q.n[2] * (o.off || 0),
      top = q.p[1] + o.y,
      bot = o.bottom === undefined ? W.FOG_CUT : o.bottom;
    tower(W, {
      x,
      z,
      w: o.w,
      d: o.d,
      top,
      bottom: bot,
      yaw: Math.atan2(q.t[0] / hl, q.t[2] / hl),
      ramp: o.ramp || M.RAMP.deck,
      noWin: true,
      roof: false,
      what: 'pier',
      tile: o.tile || 32
    });
    if (o.out) o.out.push([x, z, top, Math.max(o.w, o.d) / 2]);
  }
}

/* a light trail along a path: a line of glowing strokes whose brightness runs along it.
   o: { s0, s1, off (to the left of the centre line), y, sig (half width), pal, sp (how fast the brightness runs: + away), wl (the
        length of a ripple; negative: lone lit cars that far apart), ph, glow: { pal, a, sig } } */
function trail(W, path, o) {
  const K = W.KIND;
  let s = o.s0,
    gl = 0;
  while (s < o.s1) {
    const q = path.at(s),
      x = q.p[0] + q.n[0] * o.off,
      y = q.p[1] + (o.y === undefined ? 0.05 : o.y),
      z = q.p[2] + q.n[2] * o.off,
      seen = U.seenFrom(x, y, z, 2);
    if (seen > 1e8) {
      s += 3;
      continue;
    }
    const res = clamp((U.resAt(x, y, z) * (o.fine || 1)) / 1, 0.07, 3.2),
      ds = clamp(res * 1.25, 0.12, 3),
      thin = (o.sig * 3.8 * U.F_ART) / seen,
      big = false;
    if (o.minor && thin < 0.55) {
      s += ds;
      continue;
    }
    W.lamp(W.tile(x, z, 0, o.tile || 48, 'tr'), x, y, z, o.sig, o.pal, {
      ax: q.t,
      sl: ds * 0.72,
      kind: K.TRAIL,
      ph: o.ph || 0,
      sp: o.sp,
      rg: o.wl,
      ex: s,
      big
    });
    if (o.glow && s >= gl) {
      const g = o.glow,
        gs = Math.max(g.sig, res * 1.2);
      W.glow(W.tile(x, z, 1, o.tile || 48, 'trg'), x, y + 0.05, z, gs, g.pal, g.a, {
        ax: q.t,
        sa: gs * 2.2,
        kind: K.TRAIL,
        ph: o.ph || 0,
        sp: o.sp,
        rg: Math.abs(o.wl),
        ex: s
      });
      gl = s + gs * 2.2;
    }
    s += ds;
  }
}
/* the same straight up a wall (lifts): x, z fixed, from y0 to y1. o as for trail, plus n (the way the wall faces) */
function riser(W, x, z, y0, y1, o) {
  const K = W.KIND,
    up = [0, 1, 0];
  let y = y0,
    gl = y0;
  while (y < y1) {
    const seen = U.seenFrom(x, y, z, 2);
    if (seen > 1e8) {
      y += 2;
      continue;
    }
    const res = clamp(U.resAt(x, y, z) * deepPx(y), 0.07, 3.2),
      ds = clamp(res * 1.25, 0.12, 3),
      big = false;
    W.lamp(W.tile(x, z, 0, 48, 'tr'), x, y, z, o.sig, o.pal, {
      ax: up,
      sl: ds * 0.72,
      kind: K.TRAIL,
      ph: o.ph || 0,
      sp: o.sp,
      rg: o.wl,
      ex: y - y0,
      big
    });
    if (o.glow && y >= gl) {
      const g = o.glow,
        gs = Math.max(g.sig, res * 1.2);
      W.glow(W.tile(x, z, 1, 48, 'trg'), x + (o.n ? o.n[0] * 0.1 : 0), y, z + (o.n ? o.n[2] * 0.1 : 0), gs, g.pal, g.a, {
        ax: up,
        sa: gs * 2.4,
        kind: K.TRAIL,
        ph: o.ph || 0,
        sp: o.sp,
        rg: Math.abs(o.wl),
        ex: y - y0
      });
      gl = y + gs * 2.4;
    }
    y += ds;
  }
}

const rgbOf = i => PAL.rgb[i];
/* a lit sign on a wall. o: { p (its middle), n (the way it faces, level), w, h, a, b (its two palette colours), pat ('stripes',
   'blocks', 'bars', 'split'), per (seconds for a change), lamp (lights what is round it: { r, i }), glow, hidden (only its light) } */
function sign(W, o) {
  const K = W.KIND,
    n = o.n,
    t = [n[2], 0, -n[0]], // along the wall
    p = o.p,
    seen = U.seenFrom(p[0], p[1], p[2], 2),
    R = U.rng((Math.round(p[0] * 31) ^ Math.round(p[2] * 17) ^ Math.round(p[1] * 13)) | 0),
    per = o.per || R.range(2.5, 7),
    ph0 = R(),
    gA = W.tile(p[0], p[2], 1, 64, 'halo');
  if (!o.hidden && seen < 1e8) {
    const res = clamp(U.resAt(p[0], p[1], p[2]) * 0.8, 0.06, 2),
      nu = Math.max(2, Math.round(o.w / res)),
      nv = Math.max(2, Math.round(o.h / res)),
      g = W.tile(p[0], p[2], 0, 64, 'lit'),
      cell = Math.max(o.w / nu, o.h / nv);
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const u = ((i + 0.5) / nu - 0.5) * o.w,
          v = ((j + 0.5) / nv - 0.5) * o.h;
        let ph = ph0,
          a = o.a,
          b = o.b;
        if (o.pat === 'stripes') ph += i / nu;
        else if (o.pat === 'bars') ph += j / nv;
        else if (o.pat === 'blocks') ph += U.h4(i >> 1, j >> 1, nu, 3);
        else if (o.pat === 'split') {
          if (j * 2 >= nv) ((a = o.b), (b = o.c === undefined ? o.a : o.c));
        } else ph += ((i + j) & 1) * 0.5;
        W.lamp(g, p[0] + t[0] * u + n[0] * 0.06, p[1] + v, p[2] + t[2] * u + n[2] * 0.06, cell * 0.5, a, {
          n,
          sn: cell * 0.22,
          kind: K.SIGN,
          ph,
          sp: 1 / per,
          rg: o.steady ? 0 : 1,
          ex: b,
          big: res > 0.5
        });
      }
  }
  if (o.glow !== false && seen < 1e8)
    W.glow(gA, p[0] + n[0] * 0.5, p[1], p[2] + n[2] * 0.5, Math.max(o.w, o.h) * (o.gs || 0.8), o.gp === undefined ? o.a - 1 : o.gp, o.ga || 0.2, {
      kind: K.FLICKER,
      sp: R.range(2, 5),
      ph: R.range(0, 6)
    });
  if (o.lamp) {
    const ca = rgbOf(o.a),
      cb = rgbOf(o.b);
    W.meta.lights.push({
      k: 'sign',
      p: [+(p[0] + n[0] * (o.lamp.out || 2)).toFixed(2), +p[1].toFixed(2), +(p[2] + n[2] * (o.lamp.out || 2)).toFixed(2)],
      r: o.lamp.r || 16,
      cols: [ca, cb].map(c => c.map(v => +v.toFixed(3))),
      per: +(per / 2).toFixed(2),
      ph: +ph0.toFixed(3),
      fl: o.lamp.fl === undefined ? 0.12 : o.lamp.fl,
      i: o.lamp.i || 1
    });
  }
}
module.exports = { tower, roofKit, beacon, deck, piers, trail, riser, sign, deepPx, rgbOf };
