/* Ships. Each kind is sculpted once with the toolkit (signed-distance solids, baked to splats where it stands at the origin, nose
   down -Z) and drawn by the page wherever its lane has carried it. Lights, plasma and sparks are laid by hand on top:
   plasma and sparks are splats the page's vertex shader carries along their own axis and lets die away. */
const U = require('./util.js');
const M = require('./materials.js');
const PAL = require('../palette.js');
const { RAMP } = M;
const AZ = [0, 0, 1],
  TAU = Math.PI * 2;

// a hull: shaded by the sculptor, with rows of lit ports along its sides (dim, warm: the light inside)
function hullMat(W, o) {
  const { REC, F, KIND } = W;
  return {
    r: o.ramp,
    b: o.b || 0,
    tex(x, y, z, ny, tone, nx, nz) {
      REC.tag(null);
      if (Math.abs(ny) > 0.6 || !o.p) return undefined;
      const fy = (y - (o.y0 || 0)) / o.pitch + 64,
        iv = Math.floor(fy),
        fv = fy - iv;
      if (fv < 0.3 || fv > 0.72) return undefined;
      if (o.rows && o.rows.indexOf(iv - 64) < 0) return undefined;
      const side = Math.abs(nx) > Math.abs(nz),
        iu = Math.floor((side ? z : x) / o.pitch + 64);
      if (o.clear && iu % o.clear === 0) return undefined;
      if (U.h4(o.seed, iu, iv, side ? (nx > 0 ? 1 : 2) : 3) > o.p) return undefined;
      REC.tag({ kind: KIND.WINDOW, flags: F.EM, ph: U.h4(o.seed, iu, iv, 9), sp: U.h4(o.seed, iu, iv, 5) < 0.8 ? 0 : 1 });
      return o.win[Math.floor(U.h4(o.seed, iu, iv, 4) * o.win.length)];
    }
  };
}
// a frame turned about the upright axis (for the sculptor's o.ax)
const yawAx = a => [
  [Math.cos(a), 0, -Math.sin(a)],
  [0, 1, 0],
  [Math.sin(a), 0, Math.cos(a)]
];

module.exports = function buildShips(W) {
  const K = W.KIND,
    rgb = i => PAL.rgb[i];

  function template(name, o, solids, extras) {
    const gS = W.group('ship ' + name, 0, { tpl: true, unlit: true }),
      gG = W.group('ship ' + name + ' glow', 1, { tpl: true }),
      S = W.sculptor({ res: o.res, aoR: 0.12, aoK: 1.2, shLen: 5, sunK: 0.5, amb: 0.17, sky: 0.16, wob: 0.05, sun: W.B.norm([0.45, 0.8, 0.4]) });
    S.emit = (solid, n0, n1) => {
      for (let i = n0; i < n1; i++) W.REC.setGroup(i, gS);
    };
    solids(S);
    S.bake();
    const T = { gS, gG, lights: [], R: U.rng(o.seed || 5), res: o.res, haloK: o.haloK };
    extras(T);
    const n = W.take();
    W.meta.tpl[name] = { solid: gS, glow: gG, rad: o.rad, lights: T.lights };
    return n;
  }

  /* A plasma engine. p: the middle of its nozzle; the exhaust goes back along +Z. r: the nozzle's radius.
     o: { len, core, mid, rim (palette colours, hot to cool), halo, sparks, spark: [colours], k (how many puffs) }
     The nozzle is a lit throat inside a ring of small lamps; the plume is three sheaths of puffs, the hot inner one fast and long, the
     outer ones slower and shorter, each puff thinning to nothing; a soft halo swells behind; sparks are thrown out and fall away. */
  function engine(T, p, r, o) {
    const R = T.R,
      len = o.len || r * 9,
      gS = T.gS,
      gG = T.gG;
    W.lamp(gS, p[0], p[1], p[2] + 0.03, r * 0.7, o.core, { n: AZ, sn: r * 0.3, kind: K.FLICKER, sp: 23, ph: R.range(0, 6) });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      W.lamp(gS, p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, p[2] + 0.01, r * 0.2, k % 2 ? o.mid : o.rim, {
        n: AZ,
        sn: r * 0.12,
        kind: K.TWINKLE,
        sp: 9,
        ph: k * 0.8
      });
    }
    const n = Math.round((o.k || 18) * 1.4);
    for (let i = 0; i < n; i++) {
      const lay = i % 3,
        a = R.range(0, TAU),
        rad = r * (lay === 0 ? 0.22 : lay === 1 ? 0.5 : 0.78) * Math.sqrt(R());
      W.lamp(gS, p[0] + Math.cos(a) * rad, p[1] + Math.sin(a) * rad, p[2] + 0.04, r * [0.46, 0.42, 0.36][lay], [o.core, o.mid, o.rim][lay], {
        ax: AZ,
        sl: r * [1.5, 1.15, 0.9][lay],
        kind: K.JET,
        ph: (i + R()) / n,
        sp: [2.3, 1.6, 1.15][lay] * (o.fast || 1),
        rg: len * [1.5, 1.1, 0.75][lay],
        ex: [-0.86, -0.72, -0.55][lay]
      });
    }
    for (let i = 0; i < 6; i++)
      W.glow(gG, p[0], p[1], p[2] + r * 0.6, r * 1.25, i % 2 ? o.mid : o.halo, 0.55, {
        ax: AZ,
        sa: r * 2.6,
        kind: K.JET,
        ph: i / 6 + R() * 0.1,
        sp: 0.9 * (o.fast || 1),
        rg: len * 0.85,
        ex: 0.9
      });
    // standing knots of light down the middle of the plume, each smaller than the last, and a long faint tail
    for (let k = 1; k <= 4; k++)
      W.lamp(gS, p[0], p[1], p[2] + len * 0.13 * k, r * (0.5 - 0.09 * k), k < 3 ? o.core : o.mid, {
        ax: AZ,
        sl: r * (0.62 - 0.1 * k),
        kind: K.FLICKER,
        sp: 31 - k * 3,
        ph: k * 1.9
      });
    W.glow(gG, p[0], p[1], p[2] + len * 0.55, r * 0.9, o.halo, 0.42, { ax: AZ, sa: len * 0.5, kind: K.FLICKER, sp: 7, ph: R.range(0, 6) });
    W.glow(gG, p[0], p[1], p[2] + len * 1.1, r * 0.6, o.halo - 1 > 0 ? o.halo : o.halo, 0.2, { ax: AZ, sa: len * 0.7, kind: K.FLICKER, sp: 5, ph: R.range(0, 6) });
    W.glow(gG, p[0], p[1], p[2] + r * 0.8, r * 3.4 * (T.haloK || 1), o.halo, 0.6, { kind: K.FLICKER, sp: 17, ph: R.range(0, 6) });
    W.glow(gG, p[0], p[1], p[2] + r * 0.2, r * 1.5, o.mid, 0.7, { kind: K.FLICKER, sp: 29, ph: R.range(0, 6) });
    const sc = o.spark || [26, 25, 31, 47];
    for (let i = 0; i < (o.sparks === undefined ? 10 : o.sparks); i++)
      W.lamp(gS, p[0] + R.range(-0.5, 0.5) * r, p[1] + R.range(-0.5, 0.5) * r, p[2] + 0.1, Math.max(0.028, r * 0.1), R.pick(sc), {
        ax: AZ,
        sl: Math.max(0.07, r * 0.3),
        kind: K.SPARK,
        ph: R(),
        sp: R.range(0.6, 1.5),
        rg: len * R.range(0.8, 1.7),
        ex: R.range(0.3, 1.5) * r * 5,
        big: true
      });
    const c = rgb(o.mid);
    T.lights.push({ p: [p[0], p[1], +(p[2] + len * 0.25).toFixed(2)], r: +(r * 30).toFixed(1), c: c.map(v => +(v * 0.95).toFixed(3)) });
  }
  // a small lamp on the hull, with a halo. o: { blink, sp, ph, n (the way it faces), s, halo }
  function lamp(T, p, pal, o) {
    o = o || {};
    const s = o.s || 0.06;
    W.lamp(T.gS, p[0], p[1], p[2], s, pal, {
      n: o.n,
      sn: s * 0.5,
      kind: o.blink ? K.BLINK : o.steady ? K.STILL : K.TWINKLE,
      sp: o.sp || (o.blink ? 2.4 : 1.6),
      ph: o.ph || 0,
      big: true
    });
    if (o.halo !== false)
      W.glow(T.gG, p[0], p[1], p[2], s * (o.hk || 5), o.hp === undefined ? pal - 1 : o.hp, o.ha || 0.5, {
        kind: o.blink ? K.BLINK : K.TWINKLE,
        sp: o.sp || (o.blink ? 2.4 : 1.6),
        ph: o.ph || 0
      });
  }
  /* a lit screen on a flank. p: its middle; n: the way it faces; t: the way its width runs; cols(i, j, nu, nv) -> [a, b] */
  function screen(T, p, n, t, w, h, nu, nv, cols, per) {
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const u = ((i + 0.5) / nu - 0.5) * w,
          v = ((j + 0.5) / nv - 0.5) * h,
          c = cols(i, j, nu, nv),
          cell = Math.max(w / nu, h / nv);
        W.lamp(T.gS, p[0] + t[0] * u, p[1] + v, p[2] + t[2] * u, cell * 0.52, c[0], {
          n,
          sn: cell * 0.2,
          kind: K.SIGN,
          ph: c[2] || 0,
          sp: 1 / (per || 4),
          rg: 1,
          ex: c[1]
        });
      }
    W.glow(T.gG, p[0] + n[0] * 0.4, p[1], p[2] + n[2] * 0.4, Math.max(w, h) * 0.75, cols(0, 0, nu, nv)[3] || 38, 0.4, { kind: K.FLICKER, sp: 3, ph: 1 });
  }
  const DK = { r: RAMP.plumD },
    DK2 = { r: RAMP.deck, b: 0.05 };

  /* ---------------- hauler: stacked slabs, a thicket of masts at the bow, a screen on its flank (the painting's lower right) ---------------- */
  template(
    'hauler',
    { res: 0.17, rad: 9.5, seed: 21 },
    S => {
      const hm = hullMat(W, { ramp: RAMP.hull, pitch: 0.36, p: 0.2, win: [22, 23, 23, 24], seed: 11 }),
        hs = hullMat(W, { ramp: RAMP.hullS, pitch: 0.36, p: 0.12, win: [22, 23, 43], seed: 12 });
      S.box([0, 0, 0], [1.25, 0.5, 4.8], hm);
      S.box([0.35, 0.78, 0.5], [0.85, 0.28, 3.4], hs);
      S.box([-0.4, -0.74, -0.6], [0.7, 0.26, 4.0], DK);
      S.box([-1.7, 0.08, 1.3], [0.45, 0.38, 2.5], hm);
      S.box([1.75, -0.18, -0.9], [0.5, 0.3, 2.9], DK);
      S.box([0.2, 1.26, -2.4], [0.5, 0.2, 0.85], hm);
      S.box([0, 0, 5.0], [0.95, 0.42, 0.45], DK2);
      S.box([0.9, 1.3, 2.3], [0.1, 0.5, 0.9], DK);
      S.box([-0.9, 0.62, -3.4], [0.3, 0.14, 1.0], DK);
    },
    T => {
      const R = T.R;
      [
        [-0.95, 0.25, 3.4],
        [-0.35, 0.5, 4.6],
        [0.3, 0.32, 2.6],
        [0.85, -0.1, 3.9],
        [0.0, -0.62, 3.1],
        [1.8, -0.2, 2.2],
        [-0.6, 0.9, 1.9]
      ].forEach(m => W.rod(T.gS, [m[0], m[1], -4.6], [m[0] * 1.08, m[1] * 1.15, -4.6 - m[2]], 0.04, 4, { big: true }));
      // the screen (white over red, blue beside: as painted)
      screen(T, [2.29, -0.16, -0.6], [1, 0, 0], [0, 0, 1], 1.9, 0.5, 8, 3, (i, j) => (j === 2 ? [47, 46, i * 0.11, 38] : j === 1 ? [34, 30, i * 0.07] : [39, 40, 0.5 + i * 0.09]), 5);
      for (let z = -4.4; z <= 4.5; z += 0.8) {
        lamp(T, [1.28, 0.52, z], 46, { s: 0.035, halo: false, ph: z * 2, sp: 1 });
        lamp(T, [-1.28, -0.5, z + 0.3], 23, { s: 0.035, halo: false, ph: z * 3, sp: 0.8 });
      }
      for (let z = -2.6; z <= 3.6; z += 0.7) lamp(T, [0.35 + 0.87, 1.07, z], 25, { s: 0.03, halo: false, ph: z, sp: 0.7 });
      lamp(T, [-2.2, 0.1, -1.0], 34, { blink: true, ph: 0 });
      lamp(T, [2.3, -0.18, -3.9], 44, { blink: true, ph: 1.6 });
      lamp(T, [0.9, 1.86, 2.3], 47, { blink: true, sp: 4.2, ph: 0.5, s: 0.05 });
      lamp(T, [0, -1.04, -2], 47, { blink: true, sp: 3.1, ph: 2.5, s: 0.05, n: [0, -1, 0] });
      // the bridge: a band of dim glass
      for (let x = -0.2; x <= 0.61; x += 0.2) lamp(T, [x, 1.28, -3.27], 43, { n: [0, 0, -1], s: 0.08, steady: true, hp: 42, ha: 0.3 });
      for (const x of [1.4, -2.3]) W.glow(T.gG, x, 0.1, R.range(-1, 1), 1.3, 20, 0.4, { kind: K.FLICKER, sp: 1.4, ph: x });
      const o = { core: 47, mid: 45, rim: 44, halo: 43, len: 3.6, sparks: 11, k: 21 };
      engine(T, [-0.48, 0.02, 5.47], 0.3, o);
      engine(T, [0.48, 0.02, 5.47], 0.3, o);
      engine(T, [-0.4, -0.74, 3.42], 0.17, Object.assign({}, o, { len: 2, sparks: 4, k: 12 }));
      T.lights.push({ p: [3.3, -0.16, -0.6], r: 8, c: [0.62, 0.3, 0.42] });
    }
  );

  /* ---------------- wing: a broad dark manta with a lit screen along its body (the painting's upper left) ---------------- */
  const wingShip = (name, res, haloK) => template(
    name,
    { res, rad: 8, seed: 22, haloK },
    S => {
      const hm = hullMat(W, { ramp: RAMP.hull, pitch: 0.34, p: 0.14, win: [22, 23, 24], seed: 31, rows: [0, -1] });
      S.ball([0, 0, 0], [1.5, 0.52, 3.7], hm);
      S.box([-2.9, -0.06, 1.0], [1.75, 0.12, 1.45], DK, { ax: yawAx(0.36) });
      S.box([2.9, -0.06, 1.0], [1.75, 0.12, 1.45], DK, { ax: yawAx(-0.36) });
      S.ball([-4.45, -0.06, 1.75], [0.3, 0.24, 1.15], DK2);
      S.ball([4.45, -0.06, 1.75], [0.3, 0.24, 1.15], DK2);
      S.box([0, 0.62, 2.7], [0.09, 0.5, 0.85], DK);
      S.ball([0, 0.36, -1.9], [0.62, 0.3, 0.95], { r: RAMP.slate, b: 0.08 });
      S.box([-1.47, 0.08, 0.35], [0.1, 0.44, 1.35], DK2);
    },
    T => {
      // the screen: a slow weave of violet and white
      screen(T, [-1.6, 0.08, 0.35], [-1, 0, 0], [0, 0, 1], 2.5, 0.72, 10, 4, (i, j) => ((i * 3 + j * 5) % 7 < 2 ? [47, 41, i * 0.1 + j * 0.2, 38] : [40, 39, i * 0.07 + j * 0.13, 38]), 3.4);
      for (const x of [-0.8, 0.8])
        for (const z of [-1.6, 0, 1.6]) lamp(T, [x, -0.5, z], 35, { n: [0, -1, 0], s: 0.07, ph: z + x, hp: 33, hk: 6 });
      lamp(T, [-4.5, 0.05, 0.8], 34, { blink: true, ph: 0 });
      lamp(T, [4.5, 0.05, 0.8], 44, { blink: true, ph: 1.4 });
      lamp(T, [0, 1.16, 2.9], 47, { blink: true, sp: 3.6, ph: 0.9, s: 0.05 });
      for (const x of [-0.25, 0, 0.25]) lamp(T, [x, 0.42, -2.72], 43, { n: [0, 0.3, -0.95], s: 0.09, steady: true, hp: 42, ha: 0.35 });
      lamp(T, [0, 0.05, -3.72], 26, { s: 0.07, ph: 0, hp: 22, hk: 8 });
      const o = { core: 47, mid: 41, rim: 40, halo: 38, len: 3.4, sparks: 9, k: 19, spark: [26, 36, 41, 47] };
      engine(T, [-0.72, 0, 3.32], 0.27, o);
      engine(T, [0.72, 0, 3.32], 0.27, o);
      engine(T, [-4.45, -0.06, 2.9], 0.14, Object.assign({}, o, { len: 1.6, sparks: 3, k: 10 }));
      engine(T, [4.45, -0.06, 2.9], 0.14, Object.assign({}, o, { len: 1.6, sparks: 3, k: 10 }));
      T.lights.push({ p: [-3, 0, 0.3], r: 9, c: [0.45, 0.36, 0.85] });
    }
  );
  wingShip('wing', 0.17);
  wingShip('wing-near', 0.085, 0.55); // (the same, finer, for the ones that pass close to the eye)

  /* ---------------- dart: the small craft. cold: parked, engines off, the nozzles still warm ---------------- */
  const dartShip = (name, res, cold, haloK) =>
    template(
      name,
      { res, rad: 2.6, seed: 23, haloK },
      S => {
        S.ball([0, 0, 0], [0.32, 0.2, 1.05], { r: RAMP.hull, b: 0.04 });
        S.box([0, -0.03, 0.4], [0.86, 0.035, 0.3], DK);
        S.box([0, 0.2, 0.75], [0.03, 0.2, 0.26], DK);
      },
      T => {
        lamp(T, [0, 0.02, -1.06], 26, cold ? { s: 0.04, halo: false, sp: 0.4 } : { s: 0.05, hp: 22, hk: 9, ha: 0.6 });
        lamp(T, [0, 0.17, -0.35], 44, { s: 0.07, steady: true, n: [0, 1, -0.4], hp: 42, ha: cold ? 0.15 : 0.3 });
        lamp(T, [-0.86, 0, 0.4], 34, { blink: true, s: 0.035 });
        lamp(T, [0.86, 0, 0.4], 44, { blink: true, ph: 1.5, s: 0.035 });
        if (cold) for (const x of [-0.15, 0.15]) lamp(T, [x, 0, 1.04], 28, { n: [0, 0, 1], s: 0.06, steady: true, halo: false });
        else {
          const o = { core: 47, mid: 45, rim: 13, halo: 43, len: 1.5, sparks: 4, k: 12, fast: 1.3 };
          engine(T, [-0.15, 0, 1.03], 0.1, o);
          engine(T, [0.15, 0, 1.03], 0.1, o);
        }
      }
    );
  dartShip('dart', 0.085);
  dartShip('dart-near', 0.045, false, 0.6);
  dartShip('dart-cold', 0.085, true);

  /* ---------------- barge: a flat bed of boxes behind a cab ---------------- */
  template(
    'barge',
    { res: 0.16, rad: 7.5, seed: 24 },
    S => {
      const cab = hullMat(W, { ramp: RAMP.hull, pitch: 0.3, p: 0.5, win: [23, 24, 24, 25], seed: 41, rows: [1, 2], y0: 0.1 });
      S.box([0, -0.2, 0], [1.15, 0.26, 4.3], DK);
      S.box([0, 0.52, -3.5], [0.92, 0.46, 0.7], cab);
      const ramps = [RAMP.slate, RAMP.warm, RAMP.plum, RAMP.slateD, RAMP.warmD, RAMP.hull];
      for (let i = 0; i < 6; i++) {
        const h = 0.22 + 0.2 * U.h4(i, 3, 7, 1),
          z = -2.25 + i * 1.05;
        S.box([-0.55, 0.06 + h, z], [0.48, h, 0.46], { r: ramps[i % 6] });
        const h2 = 0.2 + 0.22 * U.h4(i, 5, 9, 2);
        S.box([0.55, 0.06 + h2, z + 0.1], [0.48, h2, 0.46], { r: ramps[(i + 3) % 6] });
      }
      S.box([0, -0.12, 4.5], [0.82, 0.34, 0.36], DK2);
    },
    T => {
      for (let z = -4.1; z <= 4.2; z += 0.75) {
        lamp(T, [1.17, -0.02, z], 24, { s: 0.035, halo: false, ph: -z * 1.2, sp: 2.2 });
        lamp(T, [-1.17, -0.02, z], 24, { s: 0.035, halo: false, ph: -z * 1.2, sp: 2.2 });
      }
      lamp(T, [0, 1.06, -3.5], 30, { blink: true, sp: 3, s: 0.05 });
      lamp(T, [0, 0.5, -4.22], 26, { s: 0.07, hp: 22, hk: 9, ha: 0.55 });
      W.glow(T.gG, 0, 0.6, -3.5, 1.2, 21, 0.45, { kind: K.FLICKER, sp: 1.2, ph: 0 });
      const o = { core: 26, mid: 31, rim: 30, halo: 28, len: 3.1, sparks: 12, k: 19, spark: [26, 25, 31, 36] };
      engine(T, [-0.44, -0.12, 4.88], 0.26, o);
      engine(T, [0.44, -0.12, 4.88], 0.26, o);
    }
  );

  /* ---------------- liner: a long lit hull, its whole length of windows glowing ---------------- */
  const linerShip = (name, res, haloK) => template(
    name,
    { res, rad: 7, seed: 25, haloK },
    S => {
      const hm = hullMat(W, { ramp: RAMP.hullS, pitch: 0.27, p: 0.62, win: [23, 24, 24, 25, 46], seed: 51, rows: [-1, 0, 1], clear: 7, b: 0.03 });
      S.lathe([0, 0, -4.1], 8.2, t => 0.12 + 0.86 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.06)), 0.55), hm, { ax: S.AZ });
      S.box([0, 0.75, 2.9], [0.07, 0.55, 0.8], DK);
      S.box([-1.0, -0.05, 2.7], [0.75, 0.06, 0.6], DK, { ax: yawAx(0.3) });
      S.box([1.0, -0.05, 2.7], [0.75, 0.06, 0.6], DK, { ax: yawAx(-0.3) });
      S.box([0, -0.86, 0], [0.3, 0.14, 2.2], DK2);
    },
    T => {
      for (const x of [-1, 1]) for (const z of [-2, 0, 2]) W.glow(T.gG, x * 1.0, 0, z, 1.0, 21, 0.4, { kind: K.FLICKER, sp: 0.9, ph: z + x });
      lamp(T, [0, 0, -4.12], 47, { s: 0.07, hp: 12, hk: 8 });
      lamp(T, [0, 1.34, 2.9], 34, { blink: true, s: 0.05 });
      lamp(T, [-1.75, -0.05, 2.9], 34, { blink: true, ph: 1, s: 0.04 });
      lamp(T, [1.75, -0.05, 2.9], 44, { blink: true, ph: 2, s: 0.04 });
      for (let z = -1.8; z <= 1.9; z += 0.6) lamp(T, [0, -1.01, z], 35, { n: [0, -1, 0], s: 0.05, ph: z * 2, sp: 3, hp: 33 });
      const o = { core: 47, mid: 36, rim: 35, halo: 33, len: 3.2, sparks: 8, k: 17, spark: [26, 36, 47, 31] };
      engine(T, [0, 0.3, 4.08], 0.2, o);
      engine(T, [-0.3, -0.18, 4.08], 0.2, o);
      engine(T, [0.3, -0.18, 4.08], 0.2, o);
    }
  );
  linerShip('liner', 0.15);
  linerShip('liner-near', 0.075, 0.55);

  /* ---------------- freighter: a spine hung with cargo boxes, a bridge over the bow, four engines on a beam astern ---------------- */
  const freighter = (name, aft, rot) => template(
    name,
    { res: 0.17, rad: 10, seed: 26 + rot },
    S => {
      const cab = hullMat(W, { ramp: RAMP.hull, pitch: 0.3, p: 0.55, win: [24, 25, 25, 46], seed: 61, rows: [2, 3], y0: 0.1 }),
        ramps0 = [RAMP.warm, RAMP.slate, RAMP.plum, RAMP.hullS, RAMP.warmD, RAMP.hull, RAMP.slateD],
        ramps = ramps0.slice(rot).concat(ramps0.slice(0, rot));
      S.box([0, 0, 0.3], [0.42, 0.38, 5.7], DK2);
      S.box([0, 1.0, aft ? 4.55 : -4.7], [0.95, 0.5, 0.85], cab);
      S.box([0, 1.36, aft ? 4.95 : -5.1], [1.7, 0.1, 0.28], DK);
      for (let i = 0; i < 6; i++) {
        const z = -3.0 + i * 1.3;
        for (const sx of [-1, 1]) {
          const h = 0.42 + 0.5 * U.h4(i, sx, 7, 3);
          S.box([sx * 1.02, -0.3 + h, z], [0.56, h, 0.58], { r: ramps[(i * 2 + (sx > 0 ? 3 : 0)) % 7] });
          if (U.h4(i, sx, 9, 1) > 0.45) S.box([sx * 1.02, -0.3 + 2 * h + 0.3, z], [0.5, 0.3, 0.52], { r: ramps[(i + (sx > 0 ? 5 : 1)) % 7] });
        }
        S.box([0, -0.82, z], [0.5, 0.42, 0.58], { r: ramps[(i + 2) % 7] });
      }
      S.box([0, 0.05, 5.6], [2.0, 0.22, 0.5], DK);
      for (const sx of [-1.6, -0.6, 0.6, 1.6]) S.box([sx, 0.05, 6.1], [0.34, 0.36, 0.55], DK2);
    },
    T => {
      const ids0 = [30, 44, 34, 24, 8, 40],
        ids = ids0.slice(rot % 6).concat(ids0.slice(0, rot % 6));
      for (let i = 0; i < 6; i++) {
        const z = -3.0 + i * 1.3;
        for (const sx of [-1, 1]) {
          lamp(T, [sx * 1.6, 0.1, z - 0.3], ids[(i + (sx > 0 ? 2 : 0)) % 6], { n: [sx, 0, 0], s: 0.05, steady: true, halo: false });
          lamp(T, [sx * 1.6, 0.1, z + 0.3], 46, { n: [sx, 0, 0], s: 0.035, halo: false, ph: i, sp: 0.6 });
        }
      }
      // gantry arches over the cargo, a flood lamp under each
      for (const z of [-2.4, 0.2, 2.8]) {
        W.rod(T.gS, [-1.7, 0.2, z], [-1.7, 2.0, z], 0.05, 4, { big: true });
        W.rod(T.gS, [1.7, 0.2, z], [1.7, 2.0, z], 0.05, 4, { big: true });
        W.rod(T.gS, [-1.7, 2.0, z], [1.7, 2.0, z], 0.05, 4, { big: true });
        lamp(T, [0, 1.92, z], 26, { n: [0, -1, 0], s: 0.07, hp: 21, hk: 14, ha: 0.42, sp: 0.5, ph: z });
      }
      const bz = aft ? 4.95 : -5.1;
      lamp(T, [-1.72, 1.5, bz], 34, { blink: true });
      lamp(T, [1.72, 1.5, bz], 8, { blink: true, ph: 1.5, hp: 42 });
      lamp(T, [0, 1.75, aft ? 4.3 : -4.4], 47, { blink: true, sp: 3.4, ph: 0.7, s: 0.05 });
      lamp(T, aft ? [0, 0.2, -5.45] : [0, 0.9, -5.58], 26, { s: 0.08, hp: 22, hk: 9, ha: 0.55 });
      W.glow(T.gG, 0, 1.1, aft ? 4.6 : -4.9, 1.3, 21, 0.4, { kind: K.FLICKER, sp: 1.1, ph: 0 });
      const o = { core: 47, mid: 31, rim: 30, halo: 28, len: 3.3, sparks: 6, k: 13, spark: [26, 25, 31, 36] };
      for (const sx of [-1.6, -0.6, 0.6, 1.6]) engine(T, [sx, 0.05, 6.67], 0.22, o);
      T.lights.push({ p: [0, 2.6, 0], r: 8, c: [0.6, 0.5, 0.3] });
    }
  );
  freighter('freighter', false, 0);
  freighter('freighter-b', true, 3);

  /* ---------------- tanker: four pressure spheres in a row on a keel, ringed with frames, a pod at the bow ---------------- */
  template(
    'tanker',
    { res: 0.17, rad: 8.5, seed: 27 },
    S => {
      for (let i = 0; i < 4; i++) {
        S.ball([0, 0, -3.1 + i * 2.05], [1.02, 1.02, 0.96], { r: i % 2 ? RAMP.hullS : RAMP.pale, b: 0.04 });
        if (i < 3) S.box([0, 0, -2.08 + i * 2.05], [1.12, 1.12, 0.07], DK);
      }
      S.box([0, -1.12, 0], [0.3, 0.2, 4.7], DK);
      S.box([0, 1.1, 0], [0.16, 0.06, 4.3], DK2);
      S.ball([0, -0.25, -5.0], [0.6, 0.48, 0.8], { r: RAMP.slate, b: 0.06 });
      S.box([0, -0.1, 4.65], [0.95, 0.7, 0.42], DK2);
    },
    T => {
      for (let i = 0; i < 4; i++) {
        const z = -3.1 + i * 2.05;
        lamp(T, [0, 1.2, z], 30, { blink: true, sp: 2.6, ph: -i * 0.9, s: 0.05 });
        for (const sx of [-1, 1]) lamp(T, [sx * 1.04, 0, z], i % 2 ? 23 : 8, { n: [sx, 0, 0], s: 0.05, halo: false, sp: 0.7, ph: i + sx });
        lamp(T, [0, -1.04, z], 44, { n: [0, -1, 0], s: 0.05, hp: 42, sp: 2, ph: i * 1.4 });
      }
      for (const x of [-0.22, 0, 0.22]) lamp(T, [x, -0.12, -5.74], 44, { n: [0, 0.2, -1], s: 0.08, steady: true, hp: 42, ha: 0.35 });
      lamp(T, [0, 0.36, -5.0], 34, { blink: true, s: 0.04 });
      const o = { core: 47, mid: 45, rim: 44, halo: 43, len: 3.6, sparks: 8, k: 16 };
      engine(T, [-0.45, -0.1, 5.1], 0.3, o);
      engine(T, [0.45, -0.1, 5.1], 0.3, o);
      T.lights.push({ p: [0, -2.2, 0], r: 7, c: [0.2, 0.5, 0.6] });
    }
  );

  /* ---------------- tug: a blunt pusher, mostly engine, an amber beacon turning on its roof. cold: parked ---------------- */
  const tugShip = (name, cold) =>
    template(
      name,
      { res: 0.1, rad: 3.4, seed: 28 },
      S => {
        S.box([0, 0, 0], [0.55, 0.42, 0.9], hullMat(W, { ramp: RAMP.warm, pitch: 0.22, p: cold ? 0.25 : 0.5, win: [24, 25, 46], seed: 71, rows: [0] }));
        S.box([0, -0.05, -1.04], [0.78, 0.5, 0.1], DK2);
        S.box([0, 0.58, -0.25], [0.34, 0.18, 0.4], { r: RAMP.slate, b: 0.06 });
        S.box([0, 0, 1.0], [0.42, 0.36, 0.2], DK);
      },
      T => {
        lamp(T, [0, 0.84, -0.25], 31, { blink: true, sp: cold ? 1.2 : 5, s: 0.06, hp: 28, hk: 7 });
        if (!cold) {
          lamp(T, [-0.3, 0.2, -1.16], 26, { s: 0.05, hp: 22, hk: 8, ha: 0.5 });
          lamp(T, [0.3, 0.2, -1.16], 26, { s: 0.05, hp: 22, hk: 8, ha: 0.5 });
        }
        for (const x of [-0.18, 0.18]) lamp(T, [x, 0.6, -0.66], 44, { n: [0, 0.2, -1], s: 0.07, steady: true, hp: 42, ha: cold ? 0.12 : 0.3 });
        if (cold) lamp(T, [0, 0, 1.22], 28, { n: [0, 0, 1], s: 0.12, steady: true, halo: false });
        else {
          engine(T, [0, 0, 1.22], 0.3, { core: 47, mid: 41, rim: 40, halo: 38, len: 2.4, sparks: 6, k: 14, spark: [26, 36, 41, 47] });
          for (const sx of [-0.5, 0.5]) engine(T, [sx, -0.2, 1.0], 0.1, { core: 47, mid: 41, rim: 40, halo: 38, len: 1, sparks: 1, k: 7 });
        }
      }
    );
  tugShip('tug');
  tugShip('tug-cold', true);

  /* ---------------- lift: a glass car for the megatower's face. Its glazed front looks out along +Z; the page carries it up and down ---------------- */
  template(
    'lift',
    { res: 0.075, rad: 2.2, seed: 29 },
    S => {
      const { REC, F } = W;
      // dark frame; the panes between its bars are lit glass: bright where the ceiling light catches it, tinted toward the floor
      const glass = {
        r: RAMP.slateD,
        tex(x, y, z, ny, tone, nx, nz) {
          REC.tag(null);
          if (Math.abs(ny) > 0.6 || nz < -0.5) return undefined;
          const u = Math.abs(nx) > 0.6 ? z : x,
            hu = Math.abs(nx) > 0.6 ? 0.34 : 0.52;
          if (Math.abs(u) > hu - 0.09 || (Math.abs(nx) < 0.6 && Math.abs(u) < 0.035) || Math.abs(y + 0.3) < 0.04 || Math.abs(y) > 0.72) return undefined;
          REC.tag({ kind: W.KIND.STILL, flags: F.EM });
          return y > 0.42 ? 45 : y > -0.3 ? 44 : 43;
        }
      };
      S.box([0, 0, 0], [0.52, 0.82, 0.34], glass);
      S.box([0, 0.95, -0.05], [0.4, 0.13, 0.26], DK);
      S.box([0, -0.9, 0], [0.56, 0.08, 0.38], DK2);
    },
    T => {
      // who is riding: two or three dark figures against the glass; the ceiling light; a lamp above and below
      for (const x of [-0.26, 0.08, 0.3]) W.rod(T.gS, [x, -0.72, 0.36], [x, -0.26 + (x > 0.2 ? -0.1 : 0), 0.36], 0.05, 2, { n: 2, big: true });
      lamp(T, [0, 0.6, 0.36], 26, { n: [0, 0, 1], s: 0.12, steady: true, hp: 22, hk: 6, ha: 0.5 });
      lamp(T, [0, 1.12, 0], 34, { blink: true, sp: 3, s: 0.05 });
      lamp(T, [0, -1.02, 0.1], 47, { n: [0, -1, 0], s: 0.06, hp: 43, hk: 7, ha: 0.45, sp: 0.4 });
      W.glow(T.gG, 0, 0, 0.5, 1.5, 43, 0.5, { kind: K.FLICKER, sp: 0.6, ph: 0 });
      W.glow(T.gG, 0, 0.1, 0.4, 0.7, 44, 0.45, { kind: K.FLICKER, sp: 0.9, ph: 1 });
      T.lights.push({ p: [0, 0, 1.4], r: 5.5, c: [0.3, 0.62, 0.72] });
    }
  );
};
