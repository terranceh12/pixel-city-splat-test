/* Recorder and packer.
   The toolkit's sculptor lays every splat through four builder calls (disc, stick, iso, axial). A recorder stands in front of the
   builder, lets each call through, and keeps for each splat what the page's renderer wants and the toolkit's 16 floats do not hold
   outright: the splat's axis (a disc's normal), its two sizes, its palette index, and the city's own motion tags.
   One row = 16 floats:
     [x, y, z, alpha] [ax, ay, az, sigma along axis] [sigma across, palette index, kind, flags] [phase, speed, range, extra] */
const zlib = require('zlib');
const ROW = 16;
const F = { EM: 1, NOFOG: 2, LIT: 4, BIG: 8, ADD: 16, RAINBOW: 32 };
/* motion kinds the page's vertex shader knows */
const KIND = {
  STILL: 0,
  TWINKLE: 1,
  WINDOW: 2,
  TRAIL: 3,
  BLINK: 4,
  JET: 5,
  BOB: 6,
  FLICKER: 7,
  SPARK: 8,
  DRIFT: 9,
  SIGN: 10,
  PUFF: 11,
  DUST: 12,
  RISE: 13
};
const FROM_TOOLKIT = { 1: KIND.TWINKLE, 3: KIND.RISE, 6: KIND.BOB, 7: KIND.FLICKER, 11: KIND.DRIFT };

function makeRecorder(B) {
  let cap = 1 << 16,
    n = 0,
    rows = new Float32Array(cap * ROW),
    grp = new Int32Array(cap),
    cur = null,
    curGroup = 0;
  const pal = new Map();
  B.P.forEach((c, i) => pal.set(c, i));
  const grow = () => {
    cap *= 2;
    const r = new Float32Array(cap * ROW);
    r.set(rows);
    rows = r;
    const g = new Int32Array(cap);
    g.set(grp);
    grp = g;
  };
  function rec(x, y, z, ax, sa, sp, col, a, an, isDisc) {
    if (n === cap) grow();
    const o = n * ROW;
    let kind = 0,
      flags = 0,
      ph = 0,
      s = 0,
      rg = 0,
      ex = 0;
    if (an) {
      if (an.em) flags |= F.EM;
      if (an.k && FROM_TOOLKIT[an.k]) {
        kind = FROM_TOOLKIT[an.k];
        ph = an.ph || 0;
        s = an.sp || 0;
        rg = an.rg || 0;
        ex = an.ex || 0;
      }
    }
    if (cur) {
      if (cur.kind !== undefined) kind = cur.kind;
      if (cur.flags !== undefined) flags |= cur.flags;
      if (cur.clear) flags &= ~cur.clear;
      ph = cur.ph || 0;
      s = cur.sp || 0;
      rg = cur.rg || 0;
      ex = cur.ex || 0;
    }
    if (isDisc && !(flags & F.EM) && a >= 1) flags |= F.LIT;
    let pi = pal.get(col);
    if (pi === undefined) pi = 1;
    rows[o] = x;
    rows[o + 1] = y;
    rows[o + 2] = z;
    rows[o + 3] = a;
    // (where two solids meet in a crease the sculptor's field can have no slope, and it hands over a normal of no length)
    const axl = Math.hypot(ax[0], ax[1], ax[2]);
    rows[o + 4] = axl > 0.3 ? ax[0] / axl : 0;
    rows[o + 5] = axl > 0.3 ? ax[1] / axl : 1;
    rows[o + 6] = axl > 0.3 ? ax[2] / axl : 0;
    rows[o + 7] = sa;
    rows[o + 8] = sp;
    rows[o + 9] = pi;
    rows[o + 10] = kind;
    rows[o + 11] = flags;
    rows[o + 12] = ph;
    rows[o + 13] = s;
    rows[o + 14] = rg;
    rows[o + 15] = ex;
    grp[n] = cur && cur.group !== undefined ? cur.group : curGroup;
    n++;
    cur = null;
  }
  const UP = [0, 1, 0];
  const B2 = Object.assign({}, B, {
    disc(x, y, z, nrm, st, sn, col, a, an) {
      rec(x, y, z, nrm, sn, st, col, a, an, true);
      B.disc(x, y, z, nrm, st, sn, col, a, an);
    },
    stick(x, y, z, ax, sl, sw, col, a, an) {
      rec(x, y, z, ax, sl, sw, col, a, an, false);
      B.stick(x, y, z, ax, sl, sw, col, a, an);
    },
    axial(x, y, z, ax, sa, sp, col, a, an) {
      rec(x, y, z, ax, sa, sp, col, a, an, false);
      B.axial(x, y, z, ax, sa, sp, col, a, an);
    },
    iso(x, y, z, s, col, a, an) {
      rec(x, y, z, UP, s, s, col, a, an, false);
      B.iso(x, y, z, s, col, a, an);
    }
  });
  return {
    B: B2,
    F,
    KIND,
    count: () => n,
    /* tag the next splat laid: { kind, flags, clear, ph, sp, rg, ex, group } (one splat only) */
    tag(t) {
      cur = t;
    },
    group(g) {
      curGroup = g;
    },
    setGroup(i, g) {
      grp[i] = g;
    },
    row: i => rows.subarray(i * ROW, i * ROW + ROW),
    /* hand over the rows recorded so far, and start again (call beside B.take()) */
    take() {
      const out = { n, rows: rows.slice(0, n * ROW), grp: grp.slice(0, n) };
      n = 0;
      cur = null;
      return out;
    }
  };
}

/* ---------------- packing ----------------
   groups: [{ name, pass (0 solid, 1 additive), rows: Float32Array, n, ... }] -> { meta, bin (gzip) } */
const SIG_LO = 0.004,
  SIG_K = Math.log(10000);
const sigCode = s => Math.max(0, Math.min(255, Math.round((255 * Math.log(Math.max(s, SIG_LO) / SIG_LO)) / SIG_K)));
function pack(groups) {
  let N = 0;
  for (const g of groups) N += g.n;
  const px = new Uint16Array(N),
    py = new Uint16Array(N),
    pz = new Uint16Array(N),
    ax = new Int8Array(N * 3),
    sg = new Uint8Array(N * 2),
    pl = new Uint8Array(N),
    al = new Uint8Array(N),
    kd = new Uint8Array(N),
    fg = new Uint8Array(N),
    an = [0, 1, 2, 3].map(() => new Uint16Array(N)),
    meta = [];
  let at = 0;
  for (const g of groups) {
    const r = g.rows,
      n = g.n,
      lo = [1e9, 1e9, 1e9],
      hi = [-1e9, -1e9, -1e9],
      alo = [1e9, 1e9, 1e9, 1e9],
      ahi = [-1e9, -1e9, -1e9, -1e9];
    let maxS = 0;
    for (let i = 0; i < n; i++) {
      const o = i * ROW;
      for (let k = 0; k < 3; k++) {
        if (r[o + k] < lo[k]) lo[k] = r[o + k];
        if (r[o + k] > hi[k]) hi[k] = r[o + k];
      }
      for (let k = 0; k < 4; k++) {
        if (r[o + 12 + k] < alo[k]) alo[k] = r[o + 12 + k];
        if (r[o + 12 + k] > ahi[k]) ahi[k] = r[o + 12 + k];
      }
      maxS = Math.max(maxS, r[o + 7], r[o + 8]);
    }
    if (!n) {
      lo.fill(0);
      hi.fill(0);
      alo.fill(0);
      ahi.fill(0);
    }
    const sz = [0, 1, 2].map(k => Math.max(hi[k] - lo[k], 1e-6)),
      asz = [0, 1, 2, 3].map(k => Math.max(ahi[k] - alo[k], 1e-9));
    for (let i = 0; i < n; i++) {
      const o = i * ROW,
        q = at + i;
      px[q] = Math.round(((r[o] - lo[0]) / sz[0]) * 65535);
      py[q] = Math.round(((r[o + 1] - lo[1]) / sz[1]) * 65535);
      pz[q] = Math.round(((r[o + 2] - lo[2]) / sz[2]) * 65535);
      const l = Math.hypot(r[o + 4], r[o + 5], r[o + 6]) || 1;
      ax[q * 3] = Math.round((r[o + 4] / l) * 127);
      ax[q * 3 + 1] = Math.round((r[o + 5] / l) * 127);
      ax[q * 3 + 2] = Math.round((r[o + 6] / l) * 127);
      sg[q * 2] = sigCode(r[o + 7]);
      sg[q * 2 + 1] = sigCode(r[o + 8]);
      pl[q] = r[o + 9];
      al[q] = r[o + 3] >= 1 ? 255 : Math.max(0, Math.min(253, Math.round(r[o + 3] * 254)));
      kd[q] = r[o + 10];
      fg[q] = r[o + 11];
      for (let k = 0; k < 4; k++) an[k][q] = Math.round(((r[o + 12 + k] - alo[k]) / asz[k]) * 65535);
    }
    const c = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2),
      rad = Math.hypot(sz[0], sz[1], sz[2]) / 2 + maxS * 3;
    const m = Object.assign({}, g.meta || {}, {
      name: g.name,
      pass: g.pass || 0,
      start: at,
      count: n,
      lo: lo.map(v => +v.toFixed(4)),
      sz: sz.map(v => +v.toFixed(4)),
      alo: alo.map(v => +v.toFixed(5)),
      asz: asz.map(v => +v.toFixed(5)),
      bs: [+c[0].toFixed(3), +c[1].toFixed(3), +c[2].toFixed(3), +rad.toFixed(3)]
    });
    meta.push(m);
    at += n;
  }
  // delta-code the position planes (regular grids become runs), then one gzip over everything
  const delta = a => {
    const o = new Uint16Array(a.length);
    let p = 0;
    for (let i = 0; i < a.length; i++) {
      o[i] = (a[i] - p) & 65535;
      p = a[i];
    }
    return o;
  };
  const split = a => {
    // low bytes then high bytes: the high bytes of small deltas are all zero
    const b = new Uint8Array(a.length * 2);
    for (let i = 0; i < a.length; i++) {
      b[i] = a[i] & 255;
      b[a.length + i] = a[i] >> 8;
    }
    return b;
  };
  const parts = [split(delta(px)), split(delta(py)), split(delta(pz)), new Uint8Array(ax.buffer), sg, pl, al, kd, fg].concat(
    an.map(a => split(delta(a)))
  );
  const raw = Buffer.concat(parts.map(p => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
  const bin = zlib.gzipSync(raw, { level: 9 });
  return { N, groups: meta, raw: raw.length, bin };
}

module.exports = { makeRecorder, pack, ROW, F, KIND, SIG_LO, SIG_K };
