/* The pieces a city is put together from: towers (stacked box solids with lit windows), decks that follow a road's line,
   light trails, signs, beacons. Everything solid goes to the toolkit's sculptor as signed-distance boxes; lights are laid as
   glowing splats through the toolkit's builder. */
const U = require('./util.js');
const M = require('./materials.js');
const PAL = require('../palette.js');
const { clamp } = U;

// deep in the haze nothing needs to be fine
const deepPx = y => (y < -130 ? 3.6 : y < -100 ? 3 : y < -78 ? 2.4 : y < -58 ? 1.9 : y < -40 ? 1.5 : y < -24 ? 1.2 : 1);

/* A tower: a stack of box solids for the sculptor (walls and roof, laid coarse: they are dark), and its lit windows laid over
   them one splat to a window, so the glitter stays sharp however coarse the wall under it is.
   o: { x, z, w, d, top, bottom, yaw, style, ramp, win, lit, seed, tile, chunk, roofEdge, crown, tv, noWin, kit (roof clutter and a
        beacon), px (walls), wpx (windows), occl, under (its under side is open to the air: lay that face too) } */
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
        lo: o.lo,
        hi: o.hi || 5.5,
        segH: chunk + 1,
        top: first && o.roof !== false,
        bottom: !!o.under && yb <= bottom + 0.01,
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
                pal = mode === 2 ? o.tv || 13 : dimmed ? [22, 22, 23, 21][Math.floor(U.h4(seed, 34, i, j + face) * 4)] : win[Math.floor(U.h4(seed, 31, i * 3 + face, j) * win.length)];
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
      big,
      rainbow: o.rainbow
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
        ex: s,
        rainbow: o.rainbow
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

/* ---------------------------------------------------------------- roads through buildings ----------------------------------------------------------------
   Where a road passes through a footprint, the building is built round it: a storey-high hall is left open at the road's level, the
   floors above carried over it on corner columns, the opening edged with lights (as at Liziba in Chongqing).
   roads: [{ path, hw, under (how far the deck's structure hangs below the road) }] */
function roadGaps(o, roads) {
  const cs = Math.cos(o.yaw || 0),
    sn = Math.sin(o.yaw || 0),
    gaps = [];
  for (const rd of roads) {
    const m = rd.hw * 0.35,
      pts = rd.path.pts;
    let lo = 1e9,
      hi = -1e9;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i][0] - o.x,
        dz = pts[i][2] - o.z;
      if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
      if (Math.abs(dx * cs - dz * sn) < o.w / 2 + m && Math.abs(dx * sn + dz * cs) < o.d / 2 + m) {
        lo = Math.min(lo, pts[i][1]);
        hi = Math.max(hi, pts[i][1]);
      }
    }
    if (hi > -1e8) gaps.push([lo - 1.3 - (rd.under || 0), hi + 3.3, rd]);
  }
  gaps.sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const g of gaps) {
    const l = out[out.length - 1];
    if (l && g[1] > l[0] - 1.5) l[0] = Math.min(l[0], g[0]);
    else out.push(g.slice());
  }
  return out; // from the highest down: [y0, y1, road]
}
/* a tower with halls cut through it. gaps as roadGaps gives them, all inside (bottom, top) */
function towerCut(W, o, gaps, roads) {
  const K = W.KIND,
    yaw = o.yaw || 0,
    cs = Math.cos(yaw),
    sn = Math.sin(yaw),
    at = (lx, lz) => [o.x + lx * cs + lz * sn, o.z - lx * sn + lz * cs],
    bottom = o.bottom === undefined ? W.FOG_CUT : o.bottom,
    seed = (Math.round(o.x * 3.1) * 7919) ^ Math.round(o.z * 5.3);
  let top = o.top,
    first = true,
    res = 0;
  gaps.forEach((g, gi) => {
    const r = tower(W, Object.assign({}, o, { top, bottom: g[1], under: true, kit: first ? o.kit : false, roofEdge: first ? o.roofEdge : 0, crown: first ? o.crown : 0 }));
    if (first) res = r;
    first = false;
    // the hall: corner columns that stand clear of the road, lights under the floor above, a glow inside
    const ym = (g[0] + g[1]) / 2,
      cw = Math.max(0.5, o.w * 0.15),
      cd = Math.max(0.5, o.d * 0.15);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const c = at(sx * (o.w / 2 - cw / 2), sz * (o.d / 2 - cd / 2));
        let clear = true;
        for (const rd of roads) {
          const nr = rd.path.near(c[0], c[1]);
          if (nr[0] < rd.hw + Math.hypot(cw, cd) / 2 + 0.25 && nr[1] > g[0] - 2 && nr[1] < g[1] + 2) clear = false;
        }
        if (clear) tower(W, { x: c[0], z: c[1], w: cw, d: cd, top: g[1], bottom: g[0], yaw, ramp: M.RAMP.deck, noWin: true, roof: false, tile: o.tile, what: 'cut' });
      }
    const seen = U.seenFrom(o.x, g[1], o.z, 2);
    if (seen < 1e8) {
      const sp = U.clamp((1.6 * seen) / U.F_ART, 0.35, 3),
        pal = [24, 31, 44, 46, 40][Math.floor(U.h4(seed, gi, 3, 1) * 5)],
        gl = W.tile(o.x, o.z, 0, o.tile || 32, 'lit'),
        y = g[1] - 0.12,
        lamp = (lx, lz, i) => {
          const c = at(lx, lz);
          W.lamp(gl, c[0], y, c[1], Math.min(0.09, sp * 0.2), pal, { kind: K.TWINKLE, sp: 1.2, ph: i * 0.7, big: true });
        };
      let i = 0;
      for (let u = -o.w / 2 + sp / 2; u < o.w / 2; u += sp) (lamp(u, -o.d / 2 - 0.03, i++), lamp(u, o.d / 2 + 0.03, i++));
      for (let v = -o.d / 2 + sp / 2; v < o.d / 2; v += sp) (lamp(-o.w / 2 - 0.03, v, i++), lamp(o.w / 2 + 0.03, v, i++));
      W.glow(W.tile(o.x, o.z, 1, 64, 'halo'), o.x, ym, o.z, Math.min(o.w, o.d) * 0.55, pal === 44 ? 43 : pal === 40 ? 38 : 21, 0.4, { kind: K.FLICKER, sp: 1.3, ph: gi + seed % 7 });
    }
    top = g[0];
  });
  if (top > bottom + 1) tower(W, Object.assign({}, o, { top, bottom, kit: false, roofEdge: 0, crown: 0 }));
  return res;
}

/* ---------------------------------------------------------------- cliffs ----------------------------------------------------------------
   A cliff face along the ground line a -> b, looking out along `out`. It is built like the city it carries: bays of different
   widths side by side, each a stack of tiers that step in and out, so the face is all ledges, setbacks and buttresses; every
   tier has windows of its own. Here and there a tier is carved back into a landing port: a lit hall behind an apron with edge lights.
   Roads that meet the face pass through it in halls.
   o: { a: [x, z], b: [x, z], out: [nx, nz], back (how thick, behind the line), top (number or (x, z, i) => number), bottom, seed,
        bay: [min, max], step (the most a tier stands out), ports (chance), roads, kept (boxes for the lane planner), near (finer
        fittings), tile, ramps, lit, portsOut (an array: each port seen is added to it) }  ->  the bays: [{ x, z, w, top, s0, s1 }] */
function cliff(W, o) {
  const K = W.KIND,
    R = U.rng(o.seed || 1),
    dx = o.b[0] - o.a[0],
    dz = o.b[1] - o.a[1],
    L = Math.hypot(dx, dz),
    t = [dx / L, dz / L],
    out = o.out,
    yaw = Math.atan2(t[0], t[1]),
    bottom = o.bottom === undefined || typeof o.bottom === 'function' ? W.FOG_CUT : o.bottom,
    stepMax = o.step === undefined ? 3.4 : o.step,
    ramps = o.ramps || [M.RAMP.cliff, M.RAMP.cliff, M.RAMP.plumD, M.RAMP.cliffS, M.RAMP.mega, M.RAMP.slateD],
    styles = ['dark', 'sparse', 'sparse', 'resid', 'resid', 'columns', 'office', 'bands'],
    bays = [];
  let s = 0,
    i = 0;
  while (s < L - 0.01) {
    let w = R.range(o.bay ? o.bay[0] : 7, o.bay ? o.bay[1] : 14);
    if (L - s - w < (o.bay ? o.bay[0] : 7) * 0.6) w = L - s;
    const sm = s + w / 2,
      mx = o.a[0] + t[0] * sm,
      mz = o.a[1] + t[1] * sm,
      top = typeof o.top === 'function' ? o.top(mx, mz, i) : o.top,
      bot = typeof o.bottom === 'function' ? o.bottom(mx, mz, i, top) : bottom, // (a bay may end in mid air)
      ramp = R.pick(ramps),
      win = R.pick([M.WIN.warm, M.WIN.warm, M.WIN.pale, M.WIN.gold, M.WIN.dim, M.WIN.cool]),
      tile = o.tile || 48;
    bays.push({ x: mx, z: mz, w, top, bot, s0: s, s1: s + w, i });
    let y = top,
      p = R.range(0, stepMax * 0.4),
      j = 0,
      pmax = p;
    while (y > bot + 0.5) {
      const h = Math.min(y - bot, j === 0 ? R.range(5, 11) : y > -70 ? R.range(11, 21) : R.range(22, 34)),
        y0 = y - h < bot + 4 ? bot : y - h,
        port = j > 0 && y < -9 && y > -118 && h > 9 && w > 6.5 && R.chance(o.ports === undefined ? 0.13 : o.ports),
        cell = (yt, yb, pp, extra) => {
          if (yt - yb < 0.4) return;
          const wd = o.back + pp,
            c = [mx + out[0] * (pp - o.back) * 0.5, mz + out[1] * (pp - o.back) * 0.5],
            box = Object.assign(
              {
                x: c[0],
                z: c[1],
                w: wd,
                d: w,
                top: yt,
                bottom: yb,
                yaw,
                ramp,
                win,
                style: R.pick(styles),
                lit: (o.lit || (o.near ? 1.5 : 0.8)) * R.range(0.4, 1.4),
                seed: ((o.seed || 1) * 131 + i * 17 + j * 7919 + Math.round(yt * 3)) | 0,
                chunk: 40,
                px: 5,
                lo: 0.24,
                wpx: 2.6,
                tile,
                roofEdge: R.chance(0.1) ? R.pick([24, 39, 44, 30]) : 0,
                what: o.what || 'cliff'
              },
              extra || {}
            ),
            gaps = o.roads ? roadGaps(box, o.roads).filter(g => g[0] < yt - 0.3 && g[1] > yb + 0.3) : [];
          if (!gaps.length) return tower(W, box);
          // a road comes through: leave its hall open, with a line of lights over the opening
          let tt = yt;
          for (const g of gaps) {
            if (tt - g[1] > 0.4) tower(W, Object.assign({}, box, { top: tt, bottom: Math.max(yb, g[1]), under: g[1] > yb }));
            if (g[1] <= yt && g[1] > yb) {
              const seen = U.seenFrom(mx + out[0] * pp, g[1], mz + out[1] * pp, 2);
              if (seen < 1e8) {
                const sp = U.clamp((1.5 * seen) / U.F_ART, 0.3, 2.5),
                  gl = W.tile(mx, mz, 0, 64, 'lit');
                for (let u = -w / 2 + sp / 2; u < w / 2; u += sp)
                  W.lamp(gl, mx + out[0] * (pp + 0.04) + t[0] * u, g[1] - 0.1, mz + out[1] * (pp + 0.04) + t[1] * u, Math.min(0.09, sp * 0.22), 24, { kind: K.TWINKLE, sp: 1.1, ph: u, big: true });
                W.glow(W.tile(mx, mz, 1, 64, 'halo'), mx + out[0] * (pp - 0.5), (g[0] + g[1]) / 2, mz + out[1] * (pp - 0.5), w * 0.4, 21, 0.4, { kind: K.FLICKER, sp: 1, ph: i });
              }
            }
            tt = Math.min(tt, g[0]);
          }
          if (tt - yb > 0.4) tower(W, Object.assign({}, box, { top: tt, bottom: yb, roofEdge: 0 }));
        };
      if (port) {
        const ph = Math.min(4.8, h * 0.4),
          depth = Math.min(o.back * 0.7, 3.4),
          fy = y - ph, // the port's floor
          pa = Math.min(stepMax + 1, p + 1.3),
          col = R.pick([
            [44, 43, 45],
            [24, 21, 25],
            [40, 38, 41],
            [31, 28, 26]
          ]);
        cell(y, fy, -depth, { style: 'glitter', lit: 2.6, win: col[0] === 44 ? M.WIN.cool : M.WIN.pale, roof: false, roofEdge: 0, what: 'port' });
        cell(fy, y0, pa, { roofEdge: col[0], what: 'port' });
        const fx = mx + out[0] * pa,
          fz = mz + out[1] * pa,
          seen = U.seenFrom(fx, fy, fz, 2);
        if (seen < 1e8) {
          const gl = W.tile(mx, mz, 0, 64, 'lit'),
            gh = W.tile(mx, mz, 1, 64, 'halo'),
            sp = U.clamp((1.5 * seen) / U.F_ART, 0.3, 2.2);
          // lights along the top of the opening, and guide lights across the apron
          for (let u = -w / 2 + sp / 2; u < w / 2; u += sp)
            W.lamp(gl, mx - out[0] * (depth - 0.05) + t[0] * u, y - 0.15, mz - out[1] * (depth - 0.05) + t[1] * u, Math.min(0.08, sp * 0.2), col[2], { kind: K.TWINKLE, sp: 0.9, ph: u * 0.5, big: true });
          for (const u of [-w * 0.25, w * 0.25])
            for (let q = -depth + 0.4; q < pa - 0.2; q += Math.max(sp, 0.7))
              W.lamp(gl, mx + out[0] * q + t[0] * u, fy + 0.06, mz + out[1] * q + t[1] * u, Math.min(0.07, sp * 0.18), col[0], { kind: K.BLINK, sp: 2.6, ph: -q * 0.9, big: true });
          beacon(W, fx + t[0] * (w / 2 - 0.2), fy + 0.3, fz + t[1] * (w / 2 - 0.2), 34, { sp: 2.2, ph: i });
          beacon(W, fx - t[0] * (w / 2 - 0.2), fy + 0.3, fz - t[1] * (w / 2 - 0.2), 8, { sp: 2.2, ph: i + 1.6, hp: 42 });
          W.glow(gh, mx - out[0] * depth * 0.3, fy + ph * 0.5, mz - out[1] * depth * 0.3, Math.min(w, 9) * 0.42, col[1], 0.5, { kind: K.FLICKER, sp: 0.8, ph: i * 1.3 });
          if (o.portsOut) o.portsOut.push({ x: mx, z: mz, y: fy, out, t, w, depth, pa, seen });
          if (o.near && Math.hypot(fx, fz) < 100) W.meta.lights.push({ k: 'pulse', p: [+fx.toFixed(1), +(fy + 1.5).toFixed(1), +fz.toFixed(1)], r: 10, c: rgbOf(col[0]), i: 0.45, sp: 0.6, ph: i });
        }
        pmax = Math.max(pmax, pa);
      } else cell(y, y0, p);
      y = y0;
      j++;
      const r = R();
      p = U.clamp(p + (r < 0.42 ? R.range(0.5, 1.7) : r < 0.62 ? -R.range(0.4, 1.3) : 0), 0, stepMax);
      pmax = Math.max(pmax, p);
    }
    if (o.kept) {
      // (what the lane planner must keep ships out of)
      const xs = [],
        zs = [];
      for (const u of [-w / 2, w / 2])
        for (const q of [-o.back, pmax + 1]) (xs.push(mx + t[0] * u + out[0] * q), zs.push(mz + t[1] * u + out[1] * q));
      o.kept.push([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), top, bot]);
    }
    s += w;
    i++;
  }
  return bays;
}

/* ---------------------------------------------------------------- bands of light ----------------------------------------------------------------
   A line of lamps round a box's four edges at height y, each facing out, as close together as the eye needs to see a line.
   b: { x, z, w, d, yaw } (the box), o: { tile, kind, sp, down (face down: under a slab) } */
function band(W, b, y, pal, o) {
  o = o || {};
  const cs = Math.cos(b.yaw || 0),
    sn = Math.sin(b.yaw || 0),
    Ux = [cs, 0, -sn],
    Wz = [sn, 0, cs],
    g = W.tile(b.x, b.z, 0, o.tile || 96, 'lit');
  let made = 0;
  for (const [ax, sg, hh, ot, oh] of [
    [Ux, 1, b.w / 2, Wz, b.d / 2],
    [Ux, -1, b.w / 2, Wz, b.d / 2],
    [Wz, 1, b.d / 2, Ux, b.w / 2],
    [Wz, -1, b.d / 2, Ux, b.w / 2]
  ]) {
    const n = [ax[0] * sg, 0, ax[2] * sg],
      pc = [b.x + n[0] * hh, y, b.z + n[2] * hh];
    if (!U.planeSeen(pc, n)) continue;
    const seen = U.seenFrom(pc[0], y, pc[2], oh);
    if (seen > 1e8) continue;
    const sp = clamp((2.2 * seen) / U.F_ART, 0.3, 6),
      s = clamp((0.42 * seen) / U.F_ART, 0.05, 0.9);
    // (strokes laid end to end along the edge, so from far off it is one line)
    for (let u = -oh + sp / 2; u < oh; u += sp) {
      W.lamp(g, pc[0] + ot[0] * u + n[0] * 0.06, y, pc[2] + ot[2] * u + n[2] * 0.06, s, pal, {
        ax: ot,
        sl: sp * 0.6,
        kind: o.kind === undefined ? W.KIND.TWINKLE : o.kind,
        sp: o.sp || 0.7,
        ph: u * 0.37 + y
      });
      made++;
    }
  }
  return made;
}

// lines of light up the corners of a box that the eye can see, from y0 to y1
function corners(W, b, y0, y1, pal, o) {
  o = o || {};
  const cs = Math.cos(b.yaw || 0),
    sn = Math.sin(b.yaw || 0),
    g = W.tile(b.x, b.z, 0, o.tile || 96, 'lit'),
    up = [0, 1, 0];
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = b.x + (lx * b.w * cs) / 2 + (lz * b.d * sn) / 2,
      z = b.z - (lx * b.w * sn) / 2 + (lz * b.d * cs) / 2,
      nx = lx * cs + lz * sn,
      nz = -lx * sn + lz * cs;
    if (!U.planeSeen([x, (y0 + y1) / 2, z], [nx, 0, nz])) continue;
    const seen = U.seenFrom(x, (y0 + y1) / 2, z, (y1 - y0) / 2);
    if (seen > 1e8) continue;
    const sp = clamp((2.2 * seen) / U.F_ART, 0.3, 6),
      s = clamp((0.42 * seen) / U.F_ART, 0.05, 0.9);
    for (let y = y0 + sp / 2; y < y1; y += sp)
      W.lamp(g, x + nx * 0.08, y, z + nz * 0.08, s, pal, { ax: up, sl: sp * 0.6, kind: W.KIND.TWINKLE, sp: 0.4, ph: y * 0.1 });
  }
}

/* ---------------------------------------------------------------- the distant city's landmarks ----------------------------------------------------------------
   Towers that are built to do something and look it, for the skyline: each a few boxes, laid finer than an ordinary far tower so the
   shape carries, and outlined in light where it turns a corner.
   o: a tower's options (x, z, w, d, top, bottom, yaw, ...); type: 'twist' | 'stack' | 'gate' | 'terrace' | 'needle' | 'twin' | 'dock' |
   'diagrid' | 'crown'. out.park, if given, is handed places to park a ship (docking arms). Returns how far it reaches from (x, z). */
const RAD = Math.PI / 180;
function landmark(W, o, type, out) {
  const R = U.rng((o.seed || 1) ^ 0x2c1b3c6d),
    yaw = o.yaw || 0,
    cs = Math.cos(yaw),
    sn = Math.sin(yaw),
    at = (lx, lz) => [o.x + lx * cs + lz * sn, o.z - lx * sn + lz * cs],
    bottom = o.bottom === undefined ? W.FOG_CUT : o.bottom,
    span = o.top - bottom,
    base = Math.max(bottom, o.top - Math.min(span, 110)),
    K = W.KIND,
    edge = R.pick([24, 46, 44, 40, 35, 8, 30]),
    fine = Object.assign({}, o, { px: o.px || 2.4, hi: 3.6, wpx: 1.8, kit: false, roofEdge: 0, crown: 0, what: 'landmark' }),
    lines = o.lines !== false, // (the named ones are drawn in light at their corners as well)
    cornerPal = R.pick([46, 24, 44, 40]),
    part = q => tower(W, Object.assign({}, fine, q)),
    podium = () => base > bottom + 1 && part({ top: base, roof: false });
  let reach = Math.hypot(o.w, o.d) / 2;
  switch (type) {
    case 'twist': {
      // slabs turned a few degrees each on the one below, a lit seam between
      podium();
      const n = clamp(Math.round((o.top - base) / 6.5), 5, 16),
        side = Math.min(o.w, o.d) * 0.95,
        dt = (R() < 0.5 ? -1 : 1) * R.range(4, 7.5) * RAD;
      for (let i = 0; i < n; i++) {
        const yb = base + ((o.top - base) * i) / n,
          yt = base + ((o.top - base) * (i + 1)) / n - 0.3,
          b = { x: o.x, z: o.z, w: side, d: side, yaw: yaw + dt * i };
        part(Object.assign({}, b, { top: yt, bottom: yb, roof: i === n - 1, chunk: 40 }));
        if (i % 2 === 1 || i === n - 1) band(W, b, yt + 0.05, edge, { tile: o.tile });
        if (lines && i % 3 === 0) corners(W, b, yb, yt, cornerPal, { tile: o.tile });
      }
      reach = (side / 2) * Math.SQRT2;
      break;
    }
    case 'stack': {
      // long blocks laid crosswise on a slender core, each cantilevered out past the one below (as at The Interlace)
      const core = Math.min(o.w, o.d) * 0.36,
        nb = R.int(3, 5),
        L = Math.max(o.w, o.d) * R.range(1.3, 1.6),
        Wd = Math.min(o.w, o.d) * R.range(0.42, 0.52),
        H = clamp((o.top - base) / (nb * 1.6), 4, 9);
      part({ w: core, d: core, top: o.top - H * 0.5, style: 'columns' });
      if (lines) corners(W, { x: o.x, z: o.z, w: core, d: core, yaw }, base, o.top - H * 0.5, cornerPal, { tile: o.tile });
      for (let i = 0; i < nb; i++) {
        const yt = o.top - i * H * 1.55,
          yb = yt - H,
          turn = (i % 2 ? 90 : 0) * RAD + R.range(-12, 12) * RAD,
          off = (i % 2 ? -1 : 1) * L * R.range(0.12, 0.24),
          c = at(Math.cos(turn) * off, -Math.sin(turn) * off),
          b = { x: c[0], z: c[1], w: L, d: Wd, yaw: yaw + turn };
        if (yb < base) break;
        part(Object.assign({}, b, { top: yt, bottom: yb, under: true, style: R.pick(['glitter', 'office', 'resid']), lit: 1.4 }));
        band(W, b, yt + 0.05, edge, { tile: o.tile });
        band(W, b, yb - 0.05, 21, { tile: o.tile, down: true, kind: K.STILL });
        reach = Math.max(reach, Math.abs(off) + L / 2);
      }
      break;
    }
    case 'gate': {
      // two legs and a bridge across their tops: the sky shows through
      const legW = o.w * 0.3,
        bh = clamp((o.top - base) * 0.16, 4, 14),
        over = o.w * R.range(0, 0.22);
      for (const sx of [-1, 1]) {
        const c = at(sx * (o.w / 2 - legW / 2), 0);
        part({ x: c[0], z: c[1], w: legW, d: o.d, top: o.top - bh, roof: false });
        if (lines) corners(W, { x: c[0], z: c[1], w: legW, d: o.d, yaw }, base, o.top - bh, cornerPal, { tile: o.tile });
      }
      const c = at(over / 2, 0),
        b = { x: c[0], z: c[1], w: o.w + over, d: o.d, yaw };
      part(Object.assign({}, b, { top: o.top, bottom: o.top - bh, under: true, style: 'glitter', lit: 1.6 }));
      band(W, b, o.top - bh - 0.05, R.pick([24, 44, 46]), { tile: o.tile, down: true, kind: K.STILL });
      band(W, b, o.top + 0.05, edge, { tile: o.tile });
      W.glow(W.tile(o.x, o.z, 1, 192, 'halo'), o.x, o.top - bh - 3, o.z, o.w * 0.3, 38, 0.25, { kind: K.FLICKER, sp: 0.7, ph: R() * 6 });
      reach = (o.w + over) / 2 + over / 2;
      break;
    }
    case 'terrace': {
      // a stepped mountain of terraces, gardens lit along every ledge
      const n = R.int(4, 7),
        lean = R.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]),
        y0 = Math.max(bottom, o.top - Math.min(span, 26 + n * 8)),
        ht = (o.top - y0) / n;
      if (y0 > bottom + 1) part({ top: y0, roof: false });
      for (let i = 0; i < n; i++) {
        const k = 1 - i * 0.13,
          wi = o.w * (lean[0] ? k : 1 - i * 0.05),
          di = o.d * (lean[1] ? k : 1 - i * 0.05),
          c = at((lean[0] * (o.w - wi)) / 2, (lean[1] * (o.d - di)) / 2),
          yt = y0 + (i + 1) * ht,
          b = { x: c[0], z: c[1], w: wi, d: di, yaw };
        part(Object.assign({}, b, { top: yt, bottom: y0 + i * ht, roof: true }));
        band(W, b, yt + 0.06, i % 2 ? 8 : 24, { tile: o.tile, sp: 0.4 });
      }
      break;
    }
    case 'needle': {
      // a mast of a tower with a pod near the top (a lookout, a relay), a ring of light round the pod
      const T = o.top + (o.extra || R.range(10, 30)),
        sh = Math.min(o.w, o.d) * 0.34,
        yp = base + (T - base) * 0.8,
        pw = Math.min(o.w, o.d) * 0.95;
      part({ w: sh, d: sh, top: T, style: 'columns', roof: true });
      if (lines) corners(W, { x: o.x, z: o.z, w: sh, d: sh, yaw }, base, T, cornerPal, { tile: o.tile });
      for (const tw of [0, 45 * RAD]) {
        const b = { x: o.x, z: o.z, w: pw, d: pw, yaw: yaw + tw };
        part(Object.assign({}, b, { top: yp + 1.8, bottom: yp - 1.8, under: true, style: 'glitter', lit: 2.2, chunk: 40 }));
        band(W, b, yp + 1.85, R.pick([44, 35, 40]), { tile: o.tile, sp: 1.6 });
        band(W, b, yp - 1.85, 46, { tile: o.tile, down: true, kind: K.STILL });
      }
      W.rod(W.tile(o.x, o.z, 0, o.tile || 96), [o.x, T, o.z], [o.x, T + 9, o.z], 0.25, 4, { big: true });
      beacon(W, o.x, T + 9.2, o.z, 34, { sp: 2, ph: R() * 6, s: 0.3, hs: 2.4 });
      reach = (pw / 2) * Math.SQRT2;
      break;
    }
    case 'twin': {
      // two towers of different height tied by sky bridges
      const tw = o.w * 0.38,
        h2 = o.top - R.range(0.12, 0.3) * (o.top - base),
        ca = at(-o.w * 0.31, 0),
        cb = at(o.w * 0.31, 0);
      part({ x: ca[0], z: ca[1], w: tw, d: o.d });
      part({ x: cb[0], z: cb[1], w: tw, d: o.d * 0.86, top: h2 });
      if (lines) {
        corners(W, { x: ca[0], z: ca[1], w: tw, d: o.d, yaw }, base, o.top, cornerPal, { tile: o.tile });
        corners(W, { x: cb[0], z: cb[1], w: tw, d: o.d * 0.86, yaw }, base, h2, cornerPal, { tile: o.tile });
      }
      const nb = R.int(2, 3);
      for (let i = 0; i < nb; i++) {
        const yb = base + (h2 - base) * (0.42 + i * 0.22),
          b = { x: o.x, z: o.z, w: o.w * 0.3, d: o.d * 0.4, yaw };
        part(Object.assign({}, b, { top: yb + 2.4, bottom: yb, under: true, style: 'glitter', lit: 2.4 }));
        band(W, b, yb + 2.45, edge, { tile: o.tile });
      }
      band(W, { x: ca[0], z: ca[1], w: tw, d: o.d, yaw }, o.top + 0.05, edge, { tile: o.tile });
      break;
    }
    case 'dock': {
      // a tower with landing arms reaching out at two or three heights, lights to bring a ship in along each
      part({});
      const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]],
        na = R.int(2, 3);
      for (let i = 0; i < na; i++) {
        const f = faces[(i + R.int(0, 3)) % 4],
          along = f[0] ? o.w : o.d,
          L = along * R.range(0.6, 0.85),
          wa = (f[0] ? o.d : o.w) * 0.55,
          y = base + (o.top - base) * (0.45 + i * 0.18),
          lx = f[0] * (along / 2 + L / 2 - 0.5),
          lz = f[1] * (along / 2 + L / 2 - 0.5),
          c = at(lx, lz),
          b = { x: c[0], z: c[1], w: f[0] ? L : wa, d: f[0] ? wa : L, yaw };
        tower(W, Object.assign({}, b, { top: y, bottom: y - 0.9, under: true, noWin: true, ramp: M.RAMP.deck, roof: true, tile: o.tile, px: 2.4, hi: 3.6, what: 'landmark' }));
        band(W, b, y + 0.06, R.pick([24, 44, 30]), { tile: o.tile, kind: K.BLINK, sp: 2.4 });
        const tip = at(f[0] * (along / 2 + L - 0.6), f[1] * (along / 2 + L - 0.6));
        beacon(W, tip[0], y + 0.4, tip[1], 34, { sp: 2.4, ph: i, s: 0.2 });
        const nx = f[0] * cs + f[1] * sn,
          nz = -f[0] * sn + f[1] * cs; // (the way the arm reaches, in the world: a ship parked on it points out along it)
        if (out && out.park) out.park.push({ x: c[0], y, z: c[1], yaw: Math.atan2(-nx, -nz), along: L, wide: wa });
        reach = Math.max(reach, along / 2 + L);
      }
      break;
    }
    case 'diagrid': {
      // a plain shaft wrapped in a lattice of light
      part({ style: 'sparse' });
      const pal = R.pick([40, 44, 35, 24, 41]),
        g = W.tile(o.x, o.z, 0, o.tile || 96, 'lit'),
        y0 = Math.max(bottom, o.top - 90),
        Ux = [cs, 0, -sn],
        Wz = [sn, 0, cs];
      for (const [ax, sg, hh, ot, oh] of [
        [Ux, 1, o.w / 2, Wz, o.d / 2],
        [Ux, -1, o.w / 2, Wz, o.d / 2],
        [Wz, 1, o.d / 2, Ux, o.w / 2],
        [Wz, -1, o.d / 2, Ux, o.w / 2]
      ]) {
        const n = [ax[0] * sg, 0, ax[2] * sg],
          pc = [o.x + n[0] * hh, (o.top + y0) / 2, o.z + n[2] * hh];
        if (!U.planeSeen(pc, n)) continue;
        const seen = U.seenFrom(pc[0], pc[1], pc[2], oh);
        if (seen > 1e8) continue;
        const sp = clamp((1.4 * seen) / U.F_ART, 0.3, 4),
          s = clamp((0.45 * seen) / U.F_ART, 0.05, 0.9),
          cell = 2 * oh;
        for (let y = y0; y < o.top; y += sp) {
          const f = ((y - y0) / cell) % 2, // zig and zag across the face
            u1 = -oh + (f < 1 ? f : 2 - f) * 2 * oh,
            u2 = -u1;
          for (const u of [u1, u2])
            W.lamp(g, pc[0] + ot[0] * u + n[0] * 0.07, y, pc[2] + ot[2] * u + n[2] * 0.07, s, pal, { n, sn: s * 0.5, kind: K.TWINKLE, sp: 0.5, ph: y * 0.05 });
        }
      }
      band(W, o, o.top + 0.05, pal, { tile: o.tile });
      break;
    }
    default: {
      // 'crown': three set-back tiers on top, each outlined, and a spire
      const ch = clamp((o.top - base) * 0.22, 6, 18);
      part({ top: o.top - ch, roof: true });
      if (lines) corners(W, o, base, o.top - ch, cornerPal, { tile: o.tile });
      for (let i = 0; i < 3; i++) {
        const k = 0.8 - i * 0.18,
          b = { x: o.x, z: o.z, w: o.w * k, d: o.d * k, yaw },
          yt = o.top - ch + (ch * (i + 1)) / 3;
        part(Object.assign({}, b, { top: yt, bottom: o.top - ch + (ch * i) / 3, style: 'bands', lit: 1.5 }));
        band(W, b, yt + 0.05, i === 2 ? 46 : edge, { tile: o.tile });
      }
      W.rod(W.tile(o.x, o.z, 0, o.tile || 96), [o.x, o.top, o.z], [o.x, o.top + ch, o.z], 0.2, 4, { big: true });
      beacon(W, o.x, o.top + ch + 0.2, o.z, 34, { sp: 1.6, ph: R() * 6, s: 0.25, hs: 2 });
    }
  }
  return reach;
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
module.exports = { tower, towerCut, roadGaps, cliff, landmark, band, corners, roofKit, beacon, deck, piers, trail, riser, sign, deepPx, rgbOf };
