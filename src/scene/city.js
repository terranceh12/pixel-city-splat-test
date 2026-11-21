/* The city, laid out after the reference painting. The world's origin is the bend in the elevated highway, at road level; the near
   highway runs toward +Z (toward and under the eye), the far one off to the left of -Z. One unit is about three storeys. */
const U = require('./util.js');
const M = require('./materials.js');
const PT = require('./parts.js');
const PAL = require('../palette.js');
const { planLanes } = require('./lanes.js');
const { clamp, h4 } = U;
const { RAMP, WIN } = M;
const RAD = Math.PI / 180;

// smooth noise in 0..1 over the ground, `s` units to a lump
function vn(x, z, s, k) {
  const fx = x / s,
    fz = z / s,
    ix = Math.floor(fx),
    iz = Math.floor(fz),
    ux = fx - ix,
    uz = fz - iz,
    sx = ux * ux * (3 - 2 * ux),
    sz = uz * uz * (3 - 2 * uz),
    a = h4(ix, iz, k || 11, 3),
    b = h4(ix + 1, iz, k || 11, 3),
    c = h4(ix, iz + 1, k || 11, 3),
    d = h4(ix + 1, iz + 1, k || 11, 3);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

module.exports = function buildCity(W) {
  const K = W.KIND,
    meta = W.meta,
    R = W.rnd,
    plain = M.plain;

  /* ------------------------------------------------------------------ roads ------------------------------------------------------------------ */
  const BEND = 18 * RAD,
    dir = [-Math.sin(BEND), 0, -Math.cos(BEND)];
  const main = U.makePath(
    [
      [-0.3, 0, 150],
      [-0.3, 0, 0],
      [-0.3 + dir[0] * 64, 0, dir[2] * 64],
      [-0.3 + dir[0] * 740, 24, dir[2] * 740]
    ],
    { step: 0.5, rad: 6 }
  );
  const S_BEND = 150,
    S0 = 62; // (the eye is over s = 82; the road is laid from well behind it)
  const lower = [
    // name, level, half width, way, lanes [off, sig, pal, sp, wl], piers every
    {
      name: 'L1',
      y: -11,
      hw: 1.15,
      way: [
        [-128, -11, -112],
        [-30, -11, 0],
        [-0.4, -11, 26.5], // (into the island, where it turns toward the eye...)
        [1.35, -11, 40], // (... and runs on inside it, along the east face: seen through the slit there, ISLAND_SLIT)
        [1.35, -11, 110]
      ],
      rad: 30,
      lanes: [
        [0.5, 0.07, 30, -11, 13],
        [0.16, 0.05, 24, -15, 17],
        [-0.3, 0.05, 23, 12, 15],
        [-0.62, 0.04, 29, 9, 11]
      ],
      edge: 38,
      gap: 30
    },
    {
      name: 'L2',
      y: -26,
      hw: 1.5,
      way: [
        [-190, -26, -10],
        [-45, -26, 10],
        [-8, -26, 0] // (it runs into the island's foot by the bend, which still stands all the way down, and stops there)
      ],
      rad: 40,
      lanes: [
        [0.7, 0.07, 46, -14, 19],
        [0.3, 0.06, 25, -10, 14],
        [-0.3, 0.06, 34, 12, 16],
        [-0.72, 0.05, 33, 16, 21]
      ],
      edge: 37,
      gap: 34
    },
    {
      name: 'L3',
      y: -44,
      hw: 1.7,
      way: [
        [13, -44, 130],
        [18, -44, 10],
        [52, -44, -190]
      ],
      rad: 40,
      lanes: [
        [0.8, 0.09, 44, -9, 18],
        [0.3, 0.07, 45, -13, 23],
        [-0.3, 0.07, 40, 10, 16],
        [-0.8, 0.08, 39, 7, 13]
      ],
      edge: 37,
      gap: 40
    },
    {
      name: 'L4',
      y: -64,
      hw: 2.1,
      way: [
        [-170, -64, -38],
        [-20, -64, 52],
        [80, -64, 100]
      ],
      rad: 50,
      lanes: [
        [0.9, 0.12, 35, -8, 20],
        [0.3, 0.1, 34, -11, 26],
        [-0.4, 0.1, 31, 9, 18],
        [-0.95, 0.1, 30, 6, 15]
      ],
      edge: 33,
      gap: 46
    },
    {
      name: 'L5',
      y: -33,
      hw: 1.3,
      way: [
        [-82, -33, 96],
        [-74, -33, 0],
        [-120, -33, -170]
      ],
      rad: 40,
      lanes: [
        [0.5, 0.07, 25, -12, 15],
        [-0.4, 0.07, 30, 10, 17]
      ],
      edge: 38,
      gap: 36
    }
  ];
  for (const L of lower) L.path = U.makePath(L.way, { step: 0.75, rad: L.rad });
  // high in the distant city, three more, carried on tall legs and through the towers in their way
  const high = [
    {
      name: 'H1',
      hw: 1.9,
      way: [
        [230, 26, -110],
        [120, 26, -170],
        [10, 28, -250],
        [-110, 32, -330],
        [-330, 36, -380]
      ],
      rad: 60
    },
    {
      name: 'H2',
      hw: 2.2,
      way: [
        [-260, 44, -170],
        [-150, 44, -250],
        [-20, 46, -330],
        [140, 48, -400],
        [330, 50, -430]
      ],
      rad: 60
    },
    {
      name: 'H3',
      hw: 1.6,
      way: [
        [-260, 13, -40],
        [-120, 14, -95],
        [-20, 15, -125],
        [44, 16, -140],
        [110, 18, -190],
        [190, 21, -300],
        [230, 24, -460]
      ],
      rad: 60
    }
  ];
  for (const H of high) H.path = U.makePath(H.way, { step: 1, rad: H.rad });
  /* ------------------------------------------------------------------ the lie of the land ------------------------------------------------------------------
     After the painting: the near highway runs along the top of a long wall, an island with the megatower at its bend. East of it
     (the painting's empty right half) and west of it the ground falls away into ravines; another opens to the north-west under the
     far highway, bridged by it and by the pipelines. Nothing of the low city stands in a ravine; its banks are cliffs. */
  const hwx = z => -0.3 + 0.3249 * Math.min(z, 0), // the far highway's x at z
    RV = [
      [2.6, 80, 2.5, 112], // east, from the wall to the far bank
      [8.3, 80, -4, 2.5],
      [21, 80, -125, -4], // its arm to the north-east
      [-40, -14.5, -6, 112] // west
    ],
    ISLAND = [-14.5, 2.6, -6.5, 112],
    // past its foot by the bend the island is a bridge: the near highway, and the storeys under it that L1 runs through (behind the
    // slit), and below them nothing, as in the painting, where the abyss shows under the highway. HOLLOW is the open air under it
    HOLLOW_Z = 12,
    BRIDGE_BOT = -16,
    HOLLOW = [-14.5, 2.6, HOLLOW_Z, 112],
    inRect = (x, z, r, m) => x > r[0] - m && x < r[1] + m && z > r[2] - m && z < r[3] + m,
    inRavine = (x, z, m) => RV.some(r => inRect(x, z, r, m)) || (z < -6 + m && z > -125 - m && x > hwx(z) - 48 - m && x < hwx(z) + 7 + m),
    bankTop = (x, z) => -5 - 9 * vn(x, z, 50, 21);

  /* ------------------------------------------------------------------ what is where ------------------------------------------------------------------ */
  const kept = [], // ground a tower of the grid must stay off: [x0, x1, z0, z1, top]
    legs = []; // where the roads' legs stand: [x, z, top, half width]
  const keep = (x0, x1, z0, z1, top) => kept.push([x0, x1, z0, z1, top]);
  const hero = o => {
    const cs = Math.abs(Math.cos(o.yaw || 0)),
      sn = Math.abs(Math.sin(o.yaw || 0)),
      ex = (o.w * cs + o.d * sn) / 2 + 1.3,
      ez = (o.w * sn + o.d * cs) / 2 + 1.3;
    keep(o.x - ex, o.x + ex, o.z - ez, o.z + ez, o.top + (o.kit ? 5 : 1));
    return PT.tower(W, Object.assign({ what: 'hero' }, o));
  };
  const HALO = { 22: 20, 23: 20, 24: 21, 25: 22, 26: 22, 29: 28, 30: 28, 31: 28, 34: 32, 35: 33, 36: 33, 39: 37, 40: 38, 41: 38, 44: 42, 45: 43, 46: 16, 47: 11 };

  const roads = [{ path: main, hw: 2.0, under: 1.7 }].concat(
      lower.map(L => ({ path: L.path, hw: L.hw + 0.35, under: 0.3 })),
      high.map(H => ({ path: H.path, hw: H.hw + 0.35, under: 0.4 }))
    ),
    lowerRoads = roads.slice(1);
  // a named tower that a road passes through is built round it, like the rest
  const heroCut = o => {
    const gaps = PT.roadGaps(o, roads).filter(g => g[1] < o.top - 3.5 && g[0] > (o.bottom === undefined ? W.FOG_CUT : o.bottom) + 3);
    if (!gaps.length) return hero(o);
    const cs = Math.abs(Math.cos(o.yaw || 0)),
      sn = Math.abs(Math.sin(o.yaw || 0));
    keep(o.x - (o.w * cs + o.d * sn) / 2 - 1.3, o.x + (o.w * cs + o.d * sn) / 2 + 1.3, o.z - (o.w * sn + o.d * cs) / 2 - 1.3, o.z + (o.w * sn + o.d * cs) / 2 + 1.3, o.top + 5);
    return PT.towerCut(W, Object.assign({ what: 'hero' }, o), gaps, roads);
  };

  // ---- the elevated highway ----
  PT.deck(W, main, { s0: S0, s1: main.len, wl: 1.5, wr: 2.0, y0: -0.55, y1: 0, mat: plain(RAMP.road), lo: 0.055 });
  PT.deck(W, main, { s0: S0, s1: main.len, wl: 0.95, wr: 1.45, y0: -1.75, y1: -0.55, mat: plain(RAMP.deck), top: false });
  // kerbs, where they are near enough to be seen as such
  PT.deck(W, main, { s0: S0, s1: S_BEND + 34, wl: 1.5, wr: -1.36, y0: 0, y1: 0.16, mat: plain(RAMP.plumHi || RAMP.plum, 0.1), piece: 2.2, occl: false });
  PT.deck(W, main, { s0: S0, s1: S_BEND + 34, wl: -1.86, wr: 2.0, y0: 0, y1: 0.16, mat: plain(RAMP.plum, 0.1), piece: 2.2, occl: false });
  PT.piers(W, main, { s0: S_BEND + 12, s1: main.len - 10, gap: 27, w: 1.5, d: 1.7, y: -1.75, out: legs });
  const LANES = [
    // off (to the left), half width, colour, speed (+ away from the eye), ripple, halo, lesser
    [0.9, 0.03, 39, 3, 31, null, 1],
    [0.52, 0.02, 22, -19, 12, null, 1],
    [0.31, 0.055, 24, -22, 15, { pal: 21, a: 0.09, sig: 0.2 }, 0],
    [-0.06, 0.055, 24, -17, 11, { pal: 21, a: 0.09, sig: 0.2 }, 0],
    [-0.29, 0.02, 22, -13, 9, null, 1],
    [-0.46, 0.03, 30, 15, 13, null, 1],
    [-0.62, 0.028, 29, 20, 17, null, 1],
    [-0.86, 0.03, 39, -3, 27, null, 1]
  ];
  // (every lane but the two violet edge lines carries traffic of every colour)
  LANES.forEach((l, i) =>
    PT.trail(W, main, { s0: S0, s1: main.len - 30, off: l[0], sig: l[1], pal: l[2], sp: l[3], wl: l[4], ph: i * 0.37, glow: l[5], y: 0.04, minor: l[6], rainbow: l[2] !== 39 })
  );
  // lone bright cars now and then
  PT.trail(W, main, { s0: S0, s1: main.len - 60, off: 0.12, sig: 0.05, pal: 26, sp: -34, wl: -150, ph: 0.2, y: 0.07, rainbow: true });
  PT.trail(W, main, { s0: S0, s1: main.len - 60, off: -0.54, sig: 0.045, pal: 35, sp: 31, wl: -190, ph: 0.6, y: 0.07, rainbow: true });
  meta.paths.push(samplePath(main, S0 + 4, 430, 5));
  // the light the cars throw on what they pass, in their colours
  const CARC = [24, 30, 34, 35, 40, 27, 44, 8, 46, 25].map(i => PT.rgbOf(i));
  for (let i = 0; i < 6; i++)
    meta.lights.push({ k: 'sweep', path: 0, sp: -21, off: i * 61 + 11, h: 0.9, r: 10, c: CARC[(i * 3) % 10], i: 0.6 });
  for (let i = 0; i < 4; i++)
    meta.lights.push({ k: 'sweep', path: 0, sp: 17, off: i * 92 + 40, h: 0.9, r: 8, c: CARC[(i * 3 + 1) % 10], i: 0.42 });

  // ---- lower highways ----
  lower.forEach((L, li) => {
    const P = L.path;
    PT.deck(W, P, { s0: 0, s1: P.len, wl: L.hw, wr: L.hw, y0: -0.5, y1: 0, mat: plain(RAMP.road), what: 'lower' });
    const legEnd = L.name === 'L1' ? P.cum[P.pts.findIndex(p => p[0] > -17)] : P.len; // (L1 is carried by the island from there on)
    PT.piers(W, P, { s0: 9, s1: legEnd, gap: L.gap, w: 1.2, d: 1.2, y: -0.5, out: legs });
    L.lanes.forEach((l, i) =>
      PT.trail(W, P, {
        s0: 0,
        s1: P.len,
        off: l[0] * L.hw,
        sig: l[1],
        pal: l[2],
        sp: l[3],
        wl: l[4],
        ph: i * 0.41 + li,
        y: 0.05,
        glow: i === 0 || i === 2 ? { pal: HALO[l[2]] || 20, a: 0.14, sig: 0.3 } : null,
        minor: i % 2,
        rainbow: true
      })
    );
    PT.trail(W, P, { s0: 0, s1: P.len, off: L.hw * 0.97, sig: 0.03, pal: L.edge, sp: 2, wl: 40, y: 0.04, minor: 1 });
    PT.trail(W, P, { s0: 0, s1: P.len, off: -L.hw * 0.97, sig: 0.03, pal: L.edge, sp: -2, wl: 36, y: 0.04, minor: 1 });
    meta.paths.push(samplePath(P, 0, P.len, 6));
    for (let i = 0; i < 3; i++)
      meta.lights.push({ k: 'sweep', path: li + 1, sp: L.lanes[0][3] * 1.1, off: i * (P.len / 3) + 20 * li, h: 0.8, r: 9, c: CARC[(li * 3 + i * 4) % 10], i: 0.5 });
  });
  // ---- the high roads ----
  high.forEach((H, hi) => {
    const P = H.path;
    PT.deck(W, P, { s0: 0, s1: P.len, wl: H.hw, wr: H.hw, y0: -0.6, y1: 0, mat: plain(RAMP.road), what: 'high', tile: 96, maxPiece: 14 });
    PT.deck(W, P, { s0: 0, s1: P.len, wl: H.hw * 0.6, wr: H.hw * 0.6, y0: -1.6, y1: -0.6, mat: plain(RAMP.deck), top: false, what: 'high', tile: 96, maxPiece: 14 });
    PT.piers(W, P, { s0: 20 + hi * 7, s1: P.len, gap: 44, w: 2.2, d: 2.2, y: -1.6, out: legs, tile: 96 });
    [
      [0.62, 0.09, 24, -16, 15],
      [0.22, 0.08, 30, -12, 19],
      [-0.22, 0.08, 34, 13, 17],
      [-0.62, 0.09, 46, 17, 13]
    ].forEach((l, i) =>
      PT.trail(W, P, { s0: 0, s1: P.len, off: l[0] * H.hw, sig: l[1], pal: l[2], sp: l[3], wl: l[4], ph: i * 0.29 + hi * 0.7, y: 0.06, tile: 96, rainbow: true, glow: i === 1 ? { pal: 21, a: 0.12, sig: 0.6 } : null })
    );
    PT.trail(W, P, { s0: 0, s1: P.len, off: H.hw * 0.97, sig: 0.05, pal: 39, sp: 2, wl: 40, y: 0.05, tile: 96, minor: 1 });
    PT.trail(W, P, { s0: 0, s1: P.len, off: -H.hw * 0.97, sig: 0.05, pal: 39, sp: -2, wl: 36, y: 0.05, tile: 96, minor: 1 });
  });

  // ---- the megatower: stands at the outside of the bend; glass lifts ride its face ----
  const MG = { x: 5.3, z: -2.0, w: 6.0, d: 9.0, top: 36 };
  hero({ x: MG.x, z: MG.z, w: MG.w, d: MG.d, top: MG.top, style: 'dark', ramp: RAMP.mega, chunk: 16, lit: 0.8, roof: false, win: WIN.pale });
  // its foot steps out toward the east ravine
  hero({ x: 9.7, z: -1.3, w: 2.8, d: 6.6, top: -27, style: 'office', ramp: RAMP.cliffS, lit: 1.2, roofEdge: 44 });
  hero({ x: 11.3, z: -1.7, w: 6, d: 7.8, top: -68, style: 'sparse', ramp: RAMP.cliff, roofEdge: 24 });
  const zf = MG.z + MG.d / 2 + 0.05,
    xr = MG.x + MG.w / 2 + 0.05,
    FZ = [0, 0, 1],
    FX = [1, 0, 0],
    LIFT_X = [3.15, 4.2, 5.3, 6.4, 7.45],
    LIFT_Z = [0.6, -3.6],
    LIFT_SC = 0.8, // (the cars' size: the template is modelled at 1, a little large against the tower)
    lifts = [];
  // each shaft: two steady guide rails with the car between them
  LIFT_X.forEach((x, i) => {
    for (const e of [-0.44, 0.44])
      PT.riser(W, x + e, zf, W.FOG_CUT, MG.top, { sig: 0.014, pal: i % 2 ? 39 : 12, sp: 0.5, wl: 40, ph: 10 + i * 0.3, n: FZ });
    lifts.push({ tpl: 'lift', lift: 1, x, z: zf + 0.36 * LIFT_SC, yaw: 0, y0: -132, y1: MG.top - 2.2, per: 44 + 9 * ((i * 3) % 5), ph: (i * 0.37) % 1, sc: LIFT_SC });
    if (i % 2 === 0) lifts.push({ tpl: 'lift', lift: 1, x, z: zf + 0.36 * LIFT_SC, yaw: 0, y0: -132, y1: MG.top - 2.2, per: 61 + 5 * i, ph: (0.5 + i * 0.21) % 1, sc: LIFT_SC, far: 1 });
  });
  LIFT_Z.forEach((z, i) => {
    for (const e of [-0.44, 0.44]) PT.riser(W, xr, z + e, -27, MG.top, { sig: 0.014, pal: 39, sp: 0.5, wl: 40, ph: 10 + i * 0.4, n: FX });
    lifts.push({ tpl: 'lift', lift: 1, x: xr + 0.36 * LIFT_SC, z, yaw: Math.PI / 2, y0: -24, y1: MG.top - 2.2, per: 39 + 8 * i, ph: 0.3 + 0.4 * i, sc: LIFT_SC });
  });
  // one tall hairline of light down the face, as painted
  PT.riser(W, 6.92, zf, W.FOG_CUT, MG.top, { sig: 0.03, pal: 24, sp: -3, wl: 34, ph: 10.2, glow: { pal: 21, a: 0.12, sig: 0.3 }, n: FZ });

  // ---- the island: the wall under the near highway, its lower shoulder to the west with sunken landing courts ----
  const ports = [], // aprons a ship may be parked on
    parked = []; // ...and the ships parked: drawn by the page like the others, standing still
  /* its east face. Where the lower road L1 runs on inside the island toward the eye, the face's upper storeys stand on a slit: a thin
     window line along the face, through which the road's traffic is seen going by. (L1 is kept out of this cliff's roads, so it is not
     given halls here: the slit is the road's room.) */
  const SLIT = { z0: HOLLOW_Z, z1: 120, floor: -11.5, top: -10.1 },
    L1road = roads.find(r => r.path === lower[0].path),
    eastBays = PT.cliff(W, {
      a: [2.6, 2.5],
      b: [2.6, 112],
      out: [1, 0],
      back: 3.2,
      top: (x, z) => (z > SLIT.z0 && z < SLIT.z1 ? SLIT.floor : -1.75),
      bottom: (x, z) => (z > HOLLOW_Z ? BRIDGE_BOT : W.FOG_CUT),
      seed: 11,
      roads: lowerRoads.filter(r => r !== L1road),
      kept,
      near: true,
      step: 3,
      ports: 0.2,
      what: 'island',
      portsOut: ports
    });
  const SLIT_RAMPS = [RAMP.cliff, RAMP.cliffS, RAMP.plumD, RAMP.mega, RAMP.slateD],
    SLIT_STYLES = ['sparse', 'resid', 'columns', 'office', 'bands'];
  eastBays.forEach(b => {
    if (b.top !== SLIT.floor) return;
    // the storeys over the slit: flush with the face (nothing may hang over it), lit underneath
    PT.tower(W, {
      x: 1.0,
      z: b.z,
      w: 3.2,
      d: b.w,
      top: -1.75,
      bottom: SLIT.top,
      under: true,
      ramp: SLIT_RAMPS[Math.floor(h4(b.i, 3, 61, 1) * SLIT_RAMPS.length)],
      win: [WIN.warm, WIN.pale, WIN.cool][Math.floor(h4(b.i, 4, 61, 1) * 3)],
      style: SLIT_STYLES[Math.floor(h4(b.i, 5, 61, 1) * SLIT_STYLES.length)],
      lit: 1.4,
      chunk: 40,
      px: 5,
      lo: 0.24,
      wpx: 2.6,
      tile: 48,
      what: 'island'
    });
    // the slit's lintel: a run of small lamps just inside it, so it reads as a lit line even where the road is out of sight
    const seen = U.seenFrom(2.6, SLIT.top, b.z, 2);
    if (seen > 1e8) return;
    const sp = clamp((1.3 * seen) / U.F_ART, 0.25, 2),
      gl = W.tile(2.6, b.z, 0, 64, 'lit');
    for (let u = -b.w / 2 + sp / 2; u < b.w / 2; u += sp)
      W.lamp(gl, 2.45, SLIT.top - 0.08, b.z + u, Math.min(0.06, sp * 0.18), h4(b.i, Math.round(u * 4), 62, 1) < 0.85 ? 46 : 26, { kind: K.TWINKLE, sp: 0.6, ph: u * 0.7, big: true });
  });
  PT.cliff(W, { a: [-5, 112], b: [-5, -6.5], out: [-1, 0], back: 4.4, top: -1.75, bottom: (x, z) => (z > HOLLOW_Z ? BRIDGE_BOT : -24), seed: 12, roads: lowerRoads, step: 1.2, ports: 0, bay: [9, 16], what: 'island' });
  PT.tower(W, { x: 0.85, z: -2, w: 2.9, d: 9, top: -1.75, noWin: true, ramp: RAMP.cliff, what: 'island' });
  const courtAt = (z, i) => i === 0, // (one court left, on the foot's bay at the edge of the open air)
    shoulder = PT.cliff(W, {
      a: [-14.5, HOLLOW_Z], // (past HOLLOW_Z there is no shoulder: the bridge stands over the open abyss, and L1 comes to it over the air)
      b: [-14.5, -6.5],
      out: [-1, 0],
      back: 9.6,
      top: (x, z, i) => -7.5 - 5 * h4(i, 5, 9, 2) - (courtAt(z, i) ? 3.2 : 0),
      seed: 13,
      roads: lowerRoads,
      kept,
      near: true,
      step: 3.2,
      ports: 0.2,
      bay: [9, 14],
      what: 'island',
      portsOut: ports
    });
  let courts = 0;
  shoulder.forEach((b, k) => {
    if (!courtAt(b.z, b.i)) return;
    // a court sunk between its neighbours: a parapet on the open side, pad lights on its floor
    PT.tower(W, { x: -14.2, z: b.z, w: 0.6, d: b.w, top: b.top + 1.5, bottom: b.top - 1, noWin: true, ramp: RAMP.cliffS, roofEdge: 24, what: 'island' });
    landingPad(-9.6, b.top, b.z, Math.min(b.w, 9) * 0.34, k);
    // something parked on most of them, nose to the open side
    if (courts++ % 3 !== 2) {
      const tug = courts % 2 === 0,
        sc = tug ? 1.1 : 1.25;
      parked.push({ tpl: tug ? 'tug-cold' : 'dart-cold', park: 1, x: -9.6 + (tug ? 0.4 : -0.6), y: +(b.top + (tug ? 0.55 : 0.2) * sc + 0.02).toFixed(2), z: +(b.z + (k % 2 ? 1.1 : -0.9)).toFixed(2), yaw: Math.PI / 2 + (k % 2 ? 0.35 : -0.5), sc });
    }
  });
  PT.cliff(W, { a: [-14.5, -6.5], b: [2.3, -6.5], out: [0, -1], back: 4, top: -8, seed: 14, roads: lowerRoads, kept, near: true, step: 2.4, ports: 0.25, bay: [5, 8], what: 'island', portsOut: ports });
  keep(-14.5, 2.6, -6.5, 112, -1);
  const islandKeep = kept[kept.length - 1];

  // ---- the banks of the ravines ----
  const bank = (a, b, out, seed, o) => PT.cliff(W, Object.assign({ a, b, out, back: 10, top: bankTop, seed, roads, kept, tile: 64, what: 'bank' }, o || {}));
  bank([21, -125], [21, -4], [1, 0], 21, { near: true, portsOut: ports }); // the peninsula behind the megatower, its east face
  bank([21, -4], [8.3, -4], [0, 1], 22, { near: true, back: 8, bay: [5, 8], ports: 0.3, portsOut: ports }); // ... and the front of it, right of the megatower
  bank([4.6, -6.5], [hwx(-125) + 7, -125], [-0.951, 0.309], 23, { near: true, portsOut: ports }); // ... and its west face, under the far highway
  bank([-40, -6], [-40, 112], [1, 0], 26, { near: true, portsOut: ports }); // the west bank
  bank([80, 112], [80, -125], [-1, 0], 24); // the far bank to the east
  bank([80, -125], [21, -125], [0, 1], 25);
  bank([-50, -6], [-40, -6], [0, -1], 27, { bay: [10, 12] });
  bank([hwx(-125) - 48, -125], [-50, -6], [0.951, -0.309], 28);
  bank([hwx(-125) + 7, -125], [hwx(-125) - 48, -125], [0, 1], 29);

  // ---- named towers, from the painting ----
  hero({ x: 12.9, z: -9.5, w: 8.2, d: 9, top: 15.5, bottom: -12, style: 'columns', win: WIN.warm, lit: 1.3, kit: 'plain', ramp: RAMP.plum });
  PT.sign(W, { p: [10.7, 16.15, -4.9], n: [0, 0, 1], w: 2.4, h: 0.8, a: 24, b: 25, pat: 'bars', per: 5, lamp: { r: 12, i: 0.7 } });
  hero({ x: 15.5, z: -36, w: 9, d: 9, top: 23, bottom: -14, style: 'resid', ramp: RAMP.slateD, kit: 'mast', win: WIN.pale });
  PT.sign(W, { p: [15.5, 12.5, -31.45], n: [0, 0, 1], w: 1.4, h: 2.2, a: 34, b: 30, pat: 'blocks', per: 3.2, lamp: { r: 14, i: 0.8 } });
  heroCut({ x: 44, z: -140, w: 13, d: 13, top: 56, style: 'glitter', win: WIN.pale, tile: 128 });
  PT.tower(W, { x: 44, z: -140, w: 8, d: 8, top: 68, bottom: 56, style: 'bands', win: WIN.gold, tile: 128, kit: 'mast' });
  hero({ x: -47, z: 12, w: 8, d: 9, top: 9.5, bottom: -16, style: 'columns', ramp: RAMP.slateD, kit: 'mast', lit: 1.2, roofEdge: 39 });
  PT.sign(W, { p: [-42.95, 1, 13], n: [1, 0, 0], w: 1.7, h: 1.7, a: 34, b: 47, c: 30, pat: 'split', per: 4.1, lamp: { r: 13, i: 0.9 } });
  hero({ x: -53, z: 34, w: 10, d: 10, top: 11.5, bottom: -16, style: 'resid', kit: 'std', win: WIN.warm });
  hero({ x: -64, z: -142, w: 12, d: 12, top: 34, style: 'glitter', win: WIN.gold, tile: 128 });

  // ---- landmarks on the skyline: placed where the painting's distant city shows, clear of the roads (scratch search in the notes) ----
  const parkFar = [];
  [
    ['gate', -110, -225, 26, 12, 72],
    ['needle', -85, -360, 16, 16, 88],
    ['terrace', -30, -225, 26, 22, 46],
    ['twist', -45, -400, 18, 18, 96],
    ['dock', 15, -285, 16, 16, 52],
    ['crown', 20, -385, 18, 18, 100],
    ['stack', 35, -190, 18, 18, 62],
    ['twin', 80, -335, 26, 12, 82],
    ['diagrid', -130, -165, 16, 16, 76],
    ['twist', 105, -235, 16, 16, 72],
    ['gate', 160, -320, 24, 12, 76],
    ['needle', -240, -275, 14, 14, 72]
  ].forEach(([type, x, z, w, d, top0], i) => {
    // (no taller than will show under the top of a landscape window from the starting pose: about 11 degrees over the horizon)
    const top = Math.round(Math.min(top0, 6 + 0.16 * Math.hypot(x, z))),
      reach = PT.landmark(
      W,
      {
        x,
        z,
        w: w * 1.35,
        d: d * 1.35,
        top,
        bottom: -40,
        yaw: i % 3 === 1 ? BEND : 0,
        px: 1.8,
        style: ['glitter', 'office', 'bands', 'resid'][i % 4],
        ramp: [RAMP.slate, RAMP.cliffS, RAMP.plum, RAMP.pale][i % 4],
        win: [WIN.warm, WIN.pale, WIN.gold, WIN.cool][i % 4],
        lit: 1.2,
        tile: 128,
        seed: 7919 * (i + 3),
        extra: 6
      },
      type,
      { park: parkFar }
    );
    keep(x - reach - 2, x + reach + 2, z - reach - 2, z + reach + 2, top + 12);
  });

  // ---- the pipelines: four mains floating across the north-west ravine from the island to the far city, as painted ----
  const pipeRuns = [];
  {
    const pd = W.B.norm([-0.43, 0, -0.9]),
      px = [-pd[2], 0, pd[0]],
      spec = [
        [0.78, -9.6, RAMP.pipe],
        [0.5, -8.7, RAMP.pipeS],
        [0.78, -10.3, RAMP.pipe],
        [0.42, -9.1, RAMP.pipeS]
      ],
      LEN = 142;
    spec.forEach((q, k) => {
      const off = (k - 1.5) * 1.95,
        a = [-8.5 + px[0] * off, q[1], -4 + px[2] * off],
        b = [a[0] + pd[0] * LEN, q[1], a[2] + pd[2] * LEN];
      W.pipe(a, b, q[0], { ramp: q[2], collar: 11 + k });
    });
    pipeRuns.push({ path: U.makePath([[-8.5, -9.5, -4], [-8.5 + pd[0] * LEN, -9.5, -4 + pd[2] * LEN]], { step: 1.5 }), hw: 5 });
    // what holds them up: a yoke under the four every so often, a lifter glowing at each end of it; running lights along the top
    for (let d = 16; d < LEN - 14; d += 21) {
      const c = [-8.5 + pd[0] * d, -11.3, -4 + pd[2] * d],
        gS = W.tile(c[0], c[2], 0, 48, 'pipe'),
        gH = W.tile(c[0], c[2], 1, 64, 'halo');
      W.rod(gS, [c[0] - px[0] * 4.6, c[1], c[2] - px[2] * 4.6], [c[0] + px[0] * 4.6, c[1], c[2] + px[2] * 4.6], 0.22, 3, { big: true });
      for (const e of [-4.6, 4.6]) {
        const x = c[0] + px[0] * e,
          z = c[2] + px[2] * e;
        W.lamp(gS, x, c[1] - 0.35, z, 0.3, 41, { n: [0, -1, 0], sn: 0.12, kind: K.FLICKER, sp: 9, ph: d + e, big: true });
        W.glow(gH, x, c[1] - 1.2, z, 1.1, 39, 0.55, { ax: [0, 1, 0], sa: 2.2, kind: K.FLICKER, sp: 6, ph: d });
        W.glow(gH, x, c[1] - 0.4, z, 1.9, 38, 0.4, { kind: K.FLICKER, sp: 4, ph: d + 1 });
      }
      PT.beacon(W, c[0], -7.7, c[2], 34, { sp: 2, ph: d * 0.3, s: 0.1 });
    }
    PT.trail(W, pipeRuns[0].path, { s0: 4, s1: LEN - 6, off: -0.98, y: 1.75, sig: 0.03, pal: 30, sp: -6, wl: -37, ph: 0.2 });
    // two more, lower, from the peninsula to the far bank across the east ravine
    for (const k of [0, 1]) W.pipe([20, -24 - k * 2.2, -18 - k * 2.4], [81, -24 - k * 2.2, -30 - k * 2.4], 0.6 - k * 0.15, { ramp: k ? RAMP.pipeS : RAMP.pipe, collar: 9 });
    pipeRuns.push({ path: U.makePath([[20, -25, -19], [81, -25, -31]], { step: 1.5 }), hw: 3 });
    for (const x of [36, 51, 66]) {
      const z = -19 - ((x - 20) / 61) * 12 - 1.2,
        gH = W.tile(x, z, 1, 64, 'halo');
      W.lamp(W.tile(x, z, 0, 48, 'pipe'), x, -27.6, z, 0.3, 45, { n: [0, -1, 0], sn: 0.12, kind: K.FLICKER, sp: 9, ph: x, big: true });
      W.glow(gH, x, -28.6, z, 1.1, 44, 0.5, { ax: [0, 1, 0], sa: 2.2, kind: K.FLICKER, sp: 6, ph: x });
      PT.beacon(W, x, -22.9, z + 1.2, 30, { sp: 2.4, ph: x, s: 0.1 });
    }
  }

  ports
    .filter(q => q.seen < 1e8 && Math.hypot(q.x, q.z) < 120)
    .sort((a, b) => a.seen - b.seen)
    .forEach((q, i) => {
      if (i % 2 || parked.length >= 10) return;
      const tug = i % 4 === 2,
        sc = tug ? 1.05 : 1.2,
        f = (q.pa - q.depth) / 2,
        u = (i % 3 - 1) * q.w * 0.15;
      parked.push({ tpl: tug ? 'tug-cold' : 'dart-cold', park: 1, x: +(q.x + q.out[0] * f + q.t[0] * u).toFixed(2), y: +(q.y + (tug ? 0.55 : 0.2) * sc + 0.02).toFixed(2), z: +(q.z + q.out[1] * f + q.t[1] * u).toFixed(2), yaw: Math.atan2(-q.out[0], -q.out[1]) + (i % 3 - 1) * 0.25, sc });
    });

  /* ------------------------------------------------------------------ the rest of the city ------------------------------------------------------------------ */
  // (the lanes planned before the island was opened underneath are planned as they were, against the whole island; then the open air
  // under the bridge is let in, and the low traffic on that side is planned through it)
  const keptOpen = kept.filter(b => b !== islandKeep).concat([
    [-14.5, 2.6, -6.5, HOLLOW_Z + 1, -1], // the island's foot by the bend, all the way down
    [-7.4, 5, HOLLOW_Z - 1, 112, -1, BRIDGE_BOT] // the bridge
  ]);
  const lanes = planLanes(W, {
    roads: roads.concat(pipeRuns),
    piers: legs,
    kept,
    ground: (x, z) => (inRavine(x, z, 0) ? -1e9 : 12),
    keptOpen,
    groundOpen: (x, z) => (inRavine(x, z, 0) || inRect(x, z, HOLLOW, 0) ? -1e9 : 12),
    seed: 4242,
    debug: !!process.env.LANES
  });
  meta.ships = lanes.concat(lifts, parked);
  const air = lanes.filter(l => !l.below).map(l => ({ path: U.makePath([l.a, l.b], { step: 1.5 }), hw: l.half * 2.2 + 2.4, drop: l.half + 2.4 }));
  /* the ships down between this city and the one below are made smaller the deeper they fly, so the abyss reads deeper than it is
     (after the lanes have cut the towers: the city stays as it was). Not the painted hauler, not the fast ones' lights (those are
     sized to be seen from far off; they only lose a little) */
  for (const l of lanes) {
    const y = Math.max(l.a[1], l.b[1]);
    if (y > -15 || l.tpl === 'hauler' || l.close) continue;
    const k = l.below ? 0.8 : clamp(0.62 - (-y - 20) * 0.003, 0.42, 0.62);
    l.sc = +(l.sc * k).toFixed(3);
    l.half = +(l.half * k).toFixed(3);
  }
  const stats = { towers: 0, cut: 0, landmarks: 0, floor: 0, signs: 0, street: 0 };
  const LANDMARK = ['twist', 'stack', 'gate', 'terrace', 'needle', 'twin', 'dock', 'diagrid', 'crown', 'twist', 'terrace', 'twin', 'stack', 'needle'],
    dockPark = [];
  const VIVID = [8, 27, 34, 35, 40, 44, 30, 24, 31, 45, 41, 8, 27, 35];
  const floorLights = [],
    // (light thrown up by the streets: muted, so it tints the haze without turning it gold)
    FLC = [
      [0.66, 0.52, 0.36],
      [0.7, 0.62, 0.48],
      [0.64, 0.46, 0.38],
      [0.62, 0.42, 0.52],
      [0.46, 0.42, 0.66],
      [0.38, 0.52, 0.62],
      [0.62, 0.6, 0.56],
      [0.36, 0.6, 0.46],
      [0.36, 0.44, 0.72],
      [0.7, 0.4, 0.56]
    ];
  function cell(gx, gz, pitch, ring) {
    const j1 = h4(gx, gz, 1, ring),
      j2 = h4(gx, gz, 2, ring),
      x = (gx + 0.5 + (j1 - 0.5) * 0.3) * pitch,
      z = (gz + 0.5 + (j2 - 0.5) * 0.3) * pitch,
      r = Math.hypot(x, z);
    if (ring === 0 ? r >= 178 : ring === 1 ? r < 178 || r >= 432 : r < 432 || r >= 770) return;
    if (z > 86 + Math.abs(x) * 0.12) return;
    const n1 = vn(x, z, 95),
      n2 = vn(x + 300, z - 170, 38, 5),
      n3 = h4(gx, gz, 3, ring),
      n4 = h4(gx, gz, 4, ring),
      n5 = h4(gx, gz, 6, ring);
    // light from the streets below, for the haze: more of it where there is a gap
    if (r < 330 && n5 < (n3 < 0.1 ? 0.9 : 0.2)) {
      const mode = n4 < 0.5 ? 0 : n4 < 0.72 ? 1 : n4 < 0.88 ? 2 : 3,
        c = FLC[Math.floor(h4(gx, gz, 8, ring) * (inRavine(x, z, 0) ? 3 : FLC.length))],
        ang = h4(gx, gz, 9, ring) * 6.283,
        run = 30 + 60 * n1;
      floorLights.push({
        x: +x.toFixed(1),
        z: +z.toFixed(1),
        i: +(0.07 + 0.15 * h4(gx, gz, 10, ring)).toFixed(3),
        r: +(9 + 15 * n2).toFixed(1),
        c,
        f: mode,
        s: +(mode === 3 ? 0.03 + 0.05 * n3 : 0.25 + 0.9 * n3).toFixed(3),
        ph: +(n4 * 6.28).toFixed(2),
        mx: mode === 3 ? +(Math.cos(ang) * run).toFixed(1) : 0,
        mz: mode === 3 ? +(Math.sin(ang) * run).toFixed(1) : 0
      });
    }
    const turned = vn(x, z, 240, 7) > 0.56 ? BEND : 0;
    if (n3 < 0.1) {
      street(x, z, n4, n5, 3);
      return; // an empty lot: a square, bright with shop fronts
    }
    let w = pitch * (0.42 + 0.22 * n4),
      d = pitch * (0.42 + 0.22 * h4(gx, gz, 7, ring)),
      top;
    if (ring === 0) {
      const back = clamp((-z + 10) / 120, 0, 1);
      // (low near the eye, as painted; rising toward the far edge, where the high roads weave behind and between them)
      const cap = 9 + (z < -60 ? 18 * clamp((r - 115) / 60, 0, 1) : 0);
      top = Math.min(cap, -36 + 30 * n2 + 24 * n1 + back * (12 + (cap - 9))) + (n3 > 0.92 ? 4 + 150 * (n3 - 0.92) : 0);
    } else if (ring === 1) top = -10 + 30 * n1 * n1 + 22 * n2 + (n3 > 0.9 ? 16 + 420 * (n3 - 0.9) : 0);
    else top = -4 + 34 * n1 * n1 + 22 * n2 + (n3 > 0.93 ? 30 + 700 * (n3 - 0.93) : 0);
    const rad = Math.hypot(w, d) / 2;
    if (inRavine(x, z, rad * 0.8) || inRect(x, z, ISLAND, rad)) return;
    // on the banks the city stands back a little from the edge, and no higher than its neighbours across the gap
    if (ring === 0 && inRavine(x, z, rad + 14)) top = Math.min(top, 14 + 10 * n4);
    // nothing may stand in the eye's way: it swings through the air south of the bend
    const az = Math.atan2(x, z) / RAD;
    if (az > -50 && az < 54) {
      if (r > 38 && r < 92) top = Math.min(top, -16 - 14 * n4);
      else if (r <= 38) top = Math.min(top, -3 - 9 * n4);
    } else if (r < 100 && z > 30) top = Math.min(top, 6 + 10 * n4);
    // a road through the plot: a tall enough tower is built round it, a low one stops under it
    const gaps = PT.roadGaps({ x, z, w, d, yaw: turned }, roads);
    for (const g of gaps) if (top < g[1] + 5 && top > g[0] - 1) top = g[0] - 1 - 4 * n4;
    for (const a of air) {
      const nr = a.path.near(x, z);
      if (nr[0] < rad + a.hw) top = Math.min(top, nr[1] - a.drop - 4 * n4);
    }
    for (const b of kept) if (x + rad > b[0] && x - rad < b[1] && z + rad > b[2] && z - rad < b[3]) return;
    if (top < W.FOG_CUT + 14) return;
    const sv = h4(gx, gz, 12, ring),
      style =
        ring === 2
          ? sv < 0.5
            ? 'glitter'
            : sv < 0.75
              ? 'bands'
              : 'office'
          : sv < 0.2
            ? 'office'
            : sv < 0.35
              ? 'columns'
              : sv < 0.46
                ? 'bands'
                : sv < 0.6 + ring * 0.12
                  ? 'glitter'
                  : sv < 0.74
                    ? 'sparse'
                    : sv < 0.93
                      ? 'resid'
                      : 'dark',
      rv = h4(gx, gz, 13, ring),
      ramp = rv < 0.4 ? RAMP.plum : rv < 0.6 ? RAMP.plumD : rv < 0.75 ? RAMP.slate : rv < 0.85 ? RAMP.slateD : rv < 0.95 ? RAMP.warm : RAMP.warmD,
      wv = h4(gx, gz, 14, ring),
      win = wv < 0.4 ? WIN.warm : wv < 0.65 ? WIN.pale : wv < 0.8 ? WIN.gold : wv < 0.88 ? WIN.amber : wv < 0.94 ? WIN.cool : WIN.dim,
      tile = ring === 0 ? 32 : ring === 1 ? 96 : 192,
      bottom = ring === 0 ? undefined : ring === 1 ? Math.min(top - 46, -34) : Math.min(top - 40, -24),
      ev = h4(gx, gz, 15, ring),
      o = {
        x,
        z,
        w,
        d,
        top,
        bottom,
        yaw: turned,
        style,
        ramp,
        win,
        lit: 0.55 + 0.9 * h4(gx, gz, 16, ring),
        tile,
        kit: ring === 0 ? 'std' : false,
        roofEdge: ev < 0.05 ? [24, 39, 34, 44, 30][Math.floor(ev * 100)] : 0,
        piers: sv > 0.5 && n4 > 0.6 ? 4 : 0,
        bandEvery: n5 > 0.7 ? 6 : 0,
        crown: 1,
        what: 'ring' + ring
      };
    const cuts = gaps.filter(g => g[1] < top - 3.5 && g[0] > (bottom === undefined ? W.FOG_CUT : bottom) + 3);
    // some of the distant ones are landmarks: built to do something, and shaped like it. They reach out past their plot, so they keep
    // clear of the roads and the ships' lanes by more
    let mark = null;
    if (ring > 0 && !cuts.length && top > 14 && h4(gx, gz, 17, ring) < 0.14) {
      const reachK = 1.75 * rad;
      mark = LANDMARK[Math.floor(h4(gx, gz, 18, ring) * LANDMARK.length)];
      for (const rd of roads) if (rd.path.dist(x, z) < reachK + rd.hw) mark = null;
      for (const a of air) if (a.path.near(x, z)[0] < reachK + a.hw) mark = null;
    }
    if (cuts.length) {
      PT.towerCut(W, o, cuts, roads);
      stats.cut++;
    } else if (mark) {
      PT.landmark(W, Object.assign({ seed: (gx * 73856093) ^ (gz * 19349663) ^ ring, lines: false }, o), mark, { park: dockPark });
      stats.landmarks++;
    } else PT.tower(W, o);
    stats.towers++;
    if (ring < 2 && n5 > 0.3) street(x + pitch * 0.5, z + pitch * 0.5, n4, n3, 1 + (n5 > 0.8 ? 1 : 0));
    // a narrower top on some
    if (!mark && top > -4 && n5 > 0.55) {
      const up = (6 + 16 * n1) * (ring === 2 ? 1.6 : 1);
      PT.tower(W, Object.assign({}, o, { w: w * 0.58, d: d * 0.58, top: top + up, bottom: top, roofEdge: 0, kit: ring < 2 ? 'mast' : false, crown: 0 }));
      if (ring > 0 && n5 > 0.8) PT.beacon(W, x, top + up + 2.5, z, 34, { sp: 1.5 + 2 * n4, ph: n3 * 6, s: 0.3, hs: 2.5 });
    }
    // signs: some on show, more of them round the back where only their light is seen
    if (ring < 2 && top > -30 && ev > 0.92 && !cuts.length && !mark) {
      const hidden = ev > 0.955,
        a = [34, 39, 44, 30, 24, 35, 40][Math.floor(n3 * 7)],
        b = [47, 24, 35, 39, 44, 30, 46][Math.floor(n4 * 7)],
        cs = Math.cos(turned),
        sn = Math.sin(turned),
        face = hidden ? [-sn, 0, -cs] : n1 > 0.5 ? [sn, 0, cs] : [x > 0 ? -cs : cs, 0, x > 0 ? sn : -sn],
        half = Math.abs(face[2]) > 0.7 ? d / 2 : w / 2,
        sw = Math.min(w, d) * (0.3 + 0.3 * n2),
        sy = top - 2 - 10 * n5;
      PT.sign(W, {
        p: [x + face[0] * (half + 0.05), sy, z + face[2] * (half + 0.05)],
        n: face,
        w: sw,
        h: sw * (0.5 + n4),
        a,
        b,
        pat: ['stripes', 'blocks', 'bars', 'check'][Math.floor(n5 * 4)],
        hidden,
        lamp: { r: (ring ? 34 : 17) + 12 * n2, i: hidden ? 0.9 : 0.6, out: hidden ? 3 : 2, fl: 0.06 },
        gs: hidden ? 1.6 : 0.8,
        ga: hidden ? 0.5 : 0.32
      });
      stats.signs++;
    }
  }
  [11.5, 17, 27].forEach((pitch, ring) => {
    const n = Math.ceil(770 / pitch);
    for (let gx = -n; gx < n; gx++) for (let gz = -n; gz < Math.ceil(120 / pitch); gz++) cell(gx, gz, pitch, ring);
  });
  dockPark
    .concat(parkFar)
    .filter(q => U.seenFrom(q.x, q.y, q.z, 2) < 1e8)
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
    .slice(0, 5)
    .forEach((q, i) => {
      const sc = 1.6;
      parked.push({ tpl: i % 2 ? 'tug-cold' : 'dart-cold', park: 1, x: +q.x.toFixed(2), y: +(q.y + (i % 2 ? 0.55 : 0.2) * sc + 0.02).toFixed(2), z: +q.z.toFixed(2), yaw: +q.yaw.toFixed(3), sc });
    });
  stats.parked = parked.length;
  meta.ships = lanes.concat(lifts, parked);

  /* ------------------------------------------------------------------ light and air ------------------------------------------------------------------ */
  // the city under the fog, as it looks from far above
  floorLights.push({ x: 6, z: 9, i: 0.08, r: 19, c: FLC[1], f: 0, s: 0.7, ph: 0, mx: 0, mz: 0 });
  stats.deep = deepCity();
  for (let i = 0; i < 14; i++) {
    const L = lower[i % lower.length].path,
      a = L.at(R.range(0.1, 0.9) * L.len),
      b = L.at(R.range(0.1, 0.9) * L.len);
    floorLights.push({
      x: +a.p[0].toFixed(1),
      z: +a.p[2].toFixed(1),
      i: 0.13,
      r: 12,
      c: FLC[i % 3],
      f: 3,
      s: +R.range(0.03, 0.07).toFixed(3),
      ph: +R.range(0, 1).toFixed(2),
      mx: +(b.p[0] - a.p[0]).toFixed(1),
      mz: +(b.p[2] - a.p[2]).toFixed(1)
    });
  }
  meta.floor = { n: 128, rect: [-345, -430, 690, 690], lights: floorLights.filter(l => Math.abs(l.x) < 300 && l.z > -385 && l.z < 215) };
  stats.floor = meta.floor.lights.length;

  // event lights far off behind the skyline: a slow pulse of colour on the towers round them, a glow above the roofs
  [
    [-150, 30, -260, 39, 40],
    [95, 26, -205, 34, 35],
    [-40, 22, -330, 44, 45],
    [210, 34, -150, 39, 41],
    [-250, 30, -120, 30, 31],
    [20, 16, -150, 40, 41],
    [-95, 14, -70, 34, 36],
    [70, 6, -60, 39, 41]
  ].forEach((e, i) => {
    const c = PT.rgbOf(e[4]);
    meta.lights.push({ k: 'pulse', p: [e[0], e[1], e[2]], r: 62, c, i: 0.7, sp: 0.3 + 0.07 * i, ph: i * 1.7 });
    const g = W.tile(e[0], e[2], 1, 192, 'halo');
    W.glow(g, e[0], e[1] + 5, e[2], 7, e[3] - 1, 0.2, { kind: K.TWINKLE, sp: 0.35 + 0.11 * i, ph: i * 1.7 });
    W.glow(g, e[0], e[1] + 14, e[2], 15, e[3] - 2, 0.16, { kind: K.TWINKLE, sp: 0.35 + 0.11 * i, ph: i * 1.7 });
  });
  // searchlights turning over the far roofs
  const beamT = [40, 46, 35].map((pal, i) => {
    const g = W.group('beam ' + i, 1, { tpl: true }),
      len = 120,
      n = 30;
    for (let k = 0; k < n; k++) {
      const y = ((k + 0.5) / n) * len;
      W.glow(g, 0, y, 0, 0.7 + y * 0.03, pal, 0.3 * Math.pow(1 - y / len, 1.3) + 0.02, { ax: [0, 1, 0], sa: (len / n) * 0.9 });
    }
    return { g, len };
  });
  [
    [-120, -8, -215, 0],
    [-108, -8, -223, 0],
    [130, -6, -260, 1],
    [60, -10, -120, 2],
    [-205, -4, -60, 1],
    [250, 0, -300, 0],
    [-30, -12, -400, 2]
  ].forEach((b, i) =>
    meta.beams.push({
      p: [b[0], b[1], b[2]],
      yaw: i * 1.3,
      sp: 0.11 + 0.035 * (i % 4),
      ph: i * 2.1,
      sweep: 0.9,
      tilt: 0.42 + 0.06 * (i % 3),
      nod: 0.22,
      g: beamT[b[3]].g,
      len: beamT[b[3]].len
    })
  );

  // dust in the air between the eye and the bend
  {
    const cols = [46, 46, 41, 25, 19, 45, 36];
    for (let i = 0; i < 2000; i++) {
      const x = R.range(-62, 66),
        y = R.range(-46, 46),
        z = R.range(-26, 66),
        seen = U.seenFrom(x, y, z, 0);
      if (seen > 90 || seen < 3) continue;
      const s = clamp((0.42 * seen) / U.F_ART, 0.012, 0.11);
      W.glow(W.tile(x, z, 1, 64, 'dust'), x, y, z, s, R.pick(cols), R.range(0.22, 0.7), {
        kind: K.DUST,
        ph: R.range(0, 6.28),
        sp: R.range(0.12, 0.5),
        rg: R.range(0.3, 1.5),
        big: true
      });
    }
  }
  // banks of haze lying in the depths, drifting
  for (let i = 0; i < 170; i++) {
    const x = R.range(-160, 160),
      z = R.range(-210, 75),
      y = R.range(-84, -28),
      s = R.range(10, 26);
    W.glow(W.tile(x, z, 1, 128, 'haze'), x, y, z, s * 1.3, y < -58 ? 15 : 14, R.range(0.025, 0.06), {
      kind: K.PUFF,
      ph: R.range(0, 6.28),
      sp: R.range(0.03, 0.09),
      rg: R.range(3, 9),
      ax: [1, 0, 0],
      sa: s * R.range(1.4, 2.6)
    });
  }
  // wisps of fog drifting just over the city down there, veiling it here and there
  for (let i = 0; i < 160; i++) {
    const x = R.range(-95, 85),
      z = R.range(-130, 112),
      y = R.range(-178, -142),
      sz = R.range(8, 18);
    if (!inRavine(x, z, -sz * 0.3) && !inRect(x, z, HOLLOW, -sz * 0.3)) continue;
    W.glow(W.tile(x, z, 1, 96, 'fog'), x, y, z, sz, R.pick([16, 17, 17, 18]), R.range(0.05, 0.1), {
      kind: K.PUFF,
      ph: R.range(0, 6.28),
      sp: R.range(0.02, 0.05),
      rg: R.range(3, 8),
      ax: W.B.norm([R.range(-1, 1), 0, R.range(-1, 1)]),
      sa: sz * R.range(1.8, 3.2)
    });
  }
  // the top of the fog in the ravines: long banks of it, lit from below, drifting
  for (let i = 0; i < 150; i++) {
    const x = R.range(-95, 85),
      z = R.range(-130, 112),
      y = R.range(-128, -96),
      sz = R.range(7, 16);
    if (!inRavine(x, z, -sz * 0.4) && !inRect(x, z, HOLLOW, -sz * 0.4)) continue;
    W.glow(W.tile(x, z, 1, 96, 'fog'), x, y, z, sz, R.pick([16, 17, 17, 18]), R.range(0.045, 0.085), {
      kind: K.PUFF,
      ph: R.range(0, 6.28),
      sp: R.range(0.025, 0.06),
      rg: R.range(2, 6),
      ax: W.B.norm([R.range(-1, 1), 0, R.range(-1, 1)]),
      sa: sz * R.range(1.6, 2.8)
    });
  }
  // steam off a few roofs
  [
    [-9.6, -9, 47],
    [15, 23.3, -37],
    [-53, 11.8, 35],
    [12.5, 15.8, -11]
  ].forEach((v, i) => {
    const g = W.tile(v[0], v[2], 1, 64, 'haze');
    for (let k = 0; k < 9; k++)
      W.glow(g, v[0] + R.range(-0.2, 0.2), v[1], v[2] + R.range(-0.2, 0.2), R.range(0.25, 0.45), 17, 0.32, {
        kind: K.RISE,
        ph: k / 9 + i * 0.13,
        sp: R.range(0.5, 0.8),
        rg: R.range(3.5, 6),
        ex: 2.4
      });
  });

  /* ------------------------------------------------------------------ helpers ------------------------------------------------------------------ */
  // shop fronts and screens down at street level, between the towers: small lights of every colour, mostly hidden, their glow in the gaps
  function street(x, z, a, b, n) {
    if (inRavine(x, z, 2) || inRect(x, z, ISLAND, 2)) return;
    const ground = bankTop(x, z) - 3;
    for (let k = 0; k < n; k++) {
      const px = x + (h4(k, Math.round(x * 3), 5, 1) - 0.5) * 5,
        pz = z + (h4(k, Math.round(z * 3), 6, 2) - 0.5) * 5,
        y = ground - 7 * h4(k, Math.round(x), Math.round(z), 3),
        seen = U.seenFrom(px, y + 3, pz, 2);
      if (seen > 1e8 || seen < 42) continue; // (close to the eye a glow this soft would be a blot)
      const ca = VIVID[Math.floor(h4(k, Math.round(px * 7), Math.round(pz * 7), 4) * VIVID.length)],
        cb = VIVID[Math.floor(h4(k, Math.round(px * 5), Math.round(pz * 9), 5) * VIVID.length)],
        sz = clamp((0.7 * seen) / U.F_ART, 0.14, 1.6),
        ph = a * 7 + k;
      W.lamp(W.tile(px, pz, 0, 96, 'lit'), px, y, pz, sz, ca, { kind: K.SIGN, ph, sp: 0.1 + 0.3 * b, rg: 1, ex: cb, big: true });
      const gh = W.tile(px, pz, 1, 96, 'halo');
      W.glow(gh, px, y + 1, pz, 2.2 + 2.5 * a, ca, 0.22, { kind: K.FLICKER, sp: 1 + 3 * b, ph });
      W.glow(gh, px, y + 6, pz, 5 + 3 * b, ca, 0.09, { ax: [0, 1, 0], sa: 9, kind: K.FLICKER, sp: 0.7 + b, ph: ph + 2 });
      stats.street++;
    }
  }
  /* the city at the bottom of the ravines, 180 units down, seen through the fog: districts of lit streets laid in grids that turn
     from one district to the next, older ones lamp-gold, newer ones white, the odd dark park; every third street an avenue, brighter,
     some with traffic moving on them; downtown blocks speckled with windows. Each district also lights the fog over it a little. */
  function deepCity() {
    const Y = -186,
      D = 24,
      FLD = [
        [0.6, 0.5, 0.38],
        [0.55, 0.55, 0.6]
      ];
    let n = 0;
    for (let dx = -102; dx < 92; dx += D)
      for (let dz = -136; dz < 120; dz += D) {
        const cx = dx + D / 2,
          cz = dz + D / 2;
        if (!inRavine(cx, cz, D * 0.5)) continue;
        const k = h4(dx, dz, 41, 7),
          kind = k < 0.16 ? 'park' : k < 0.4 ? 'down' : k < 0.78 ? 'old' : 'new',
          ang = (vn(cx, cz, 90, 43) - 0.5) * 1.3 + (h4(dx, dz, 45, 7) > 0.5 ? BEND : 0),
          cs = Math.cos(ang),
          sn = Math.sin(ang),
          blk = kind === 'down' ? 4.2 + 1.6 * h4(dx, dz, 42, 7) : 5.6 + 3.4 * h4(dx, dz, 42, 7),
          trafficK = h4(dx, dz, 46, 7),
          put = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs],
          inside = (x, z) => x >= dx && x < dx + D && z >= dz && z < dz + D && inRavine(x, z, -1.2);
        for (const axis of [0, 1])
          for (let v = -D * 0.75, li = 0; v <= D * 0.75; v += blk, li++) {
            // a street: one colour of lamp along its length, the lamps so close that from up here they run together into a line
            const avenue = li % 3 === 0,
              rs = h4(dx * 3 + li, dz * 3 + axis, 52, 7),
              dim = !avenue && h4(dx * 5 + li, dz * 5 + axis, 53, 7) < 0.4,
              white = kind === 'new' || (kind === 'down' && rs < 0.6),
              pal = avenue ? (rs < 0.5 ? 25 : 46) : white ? (dim ? 19 : rs < 0.75 ? 46 : 26) : dim ? (rs < 0.6 ? 22 : 29) : rs < 0.62 ? 30 : rs < 0.9 ? 23 : 31,
              seg = avenue ? 1.5 : 2.1,
              ax = axis ? [sn, 0, cs] : [cs, 0, -sn],
              cars = avenue && h4(dx, dz, li, axis) < 0.55,
              carSp = (h4(dx, li, 47, axis) < 0.5 ? -1 : 1) * (5 + 6 * trafficK);
            if ((kind === 'park' && !avenue) || (!avenue && h4(dx * 7 + li, dz * 7 + axis, 54, 7) < 0.25)) continue; // (parks, yards, streets with the lamps off)
            for (let u = -D * 0.75; u <= D * 0.75; u += seg) {
              const p = axis ? put(v, u) : put(u, v),
                x = p[0],
                z = p[1];
              if (!inside(x, z)) continue;
              const r = h4(Math.round(x * 13), Math.round(z * 13), 44, axis);
              if (r < 0.05) continue; // (a dark stretch)
              const seen = U.seenFrom(x, Y, z, 0);
              if (seen > 1e8) continue;
              const sw = clamp((0.26 * seen) / U.F_ART, 0.1, 0.45) * (avenue ? 1.35 : 1),
                y = Y + (rs - 0.5) * 1.2,
                g = W.tile(x, z, 0, 96, 'deep');
              W.lamp(g, x, y, z, sw, pal, { ax, sl: seg * 0.62, kind: K.STILL, nofog: true });
              n++;
              if (cars) {
                // lone cars going by: white lights one way, red the other
                W.lamp(g, x, y + 0.3, z, sw * 1.2, carSp > 0 ? 47 : 34, { ax, sl: seg * 0.4, kind: K.TRAIL, sp: carSp, rg: -(22 + 20 * trafficK), ex: u, ph: r, nofog: true });
                n++;
              }
            }
          }
        if (kind === 'down')
          // windows of the towers down there: a speckle inside the blocks
          for (let i = 0; i < 45; i++) {
            const lx = (h4(dx, dz, i, 48) - 0.5) * D,
              lz = (h4(dx, dz, i, 49) - 0.5) * D,
              p = put(lx, lz);
            if (!inside(p[0], p[1])) continue;
            const seen = U.seenFrom(p[0], Y, p[1], 0);
            if (seen > 1e8) continue;
            W.lamp(W.tile(p[0], p[1], 0, 96, 'deep'), p[0], Y + 2 + 6 * h4(i, dx, dz, 50), p[1], clamp((0.4 * seen) / U.F_ART, 0.15, 0.6), [46, 25, 46, 26, 24][i % 5], { kind: K.WINDOW, sp: i % 7 ? 0 : 1, ph: h4(i, dz, dx, 51), nofog: true });
            n++;
          }
        floorLights.push({ x: +cx.toFixed(1), z: +cz.toFixed(1), i: kind === 'park' ? 0.01 : kind === 'down' ? 0.05 : 0.032, r: D * 0.7, c: FLD[kind === 'new' ? 1 : 0], f: 0, s: 0.15, ph: +(k * 6).toFixed(2), mx: 0, mz: 0 });
      }
    return n;
  }
  function samplePath(P, s0, s1, step) {
    const pts = [];
    for (let s = s0; s <= s1; s += step) pts.push(P.at(s).p.map(v => +v.toFixed(2)));
    return pts;
  }
  // a ring of lights on a roof, chasing round, and a cross of them in the middle
  function landingPad(x, y, z, rad, i) {
    const g = W.tile(x, z, 0, 64, 'lit'),
      n = 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283;
      W.lamp(g, x + Math.cos(a) * rad, y + 0.06, z + Math.sin(a) * rad, 0.07, i === 1 ? 44 : 24, {
        kind: K.BLINK,
        sp: 2.4,
        ph: -a + i,
        big: true
      });
    }
    for (let k = -2; k <= 2; k++) {
      W.lamp(g, x + k * rad * 0.22, y + 0.06, z, 0.06, 46, { kind: K.TWINKLE, sp: 1.3, ph: k, big: true });
      if (k) W.lamp(g, x, y + 0.06, z + k * rad * 0.22, 0.06, 46, { kind: K.TWINKLE, sp: 1.3, ph: k + 2, big: true });
    }
    W.glow(W.tile(x, z, 1, 64, 'halo'), x, y + 0.5, z, rad * 1.1, i === 1 ? 42 : 20, 0.5, { kind: K.FLICKER, sp: 1.1, ph: i });
    meta.lights.push({ k: 'pulse', p: [x, y + 2.5, z], r: 9, c: PT.rgbOf(i === 1 ? 44 : 24), i: 0.5, sp: 2.4, ph: i });
  }
  stats.lanes = lanes.length;
  stats.lifts = lifts.length;
  return { main, lower, stats, MG, lanes };
};
