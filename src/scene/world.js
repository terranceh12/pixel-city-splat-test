/* The scene's workbench: one toolkit builder behind a recorder, the list of draw groups, the places where splats may be laid
   (candidates, tested for visibility before anything is baked), and the box solids that will be handed to the sculptor. */
const { makeRecorder, F, KIND, ROW } = require('../bake/ir.js');
const PALETTE = require('../palette.js');
const { makeCands, visibility } = require('./pvs.js');
const U = require('./util.js');

function makeWorld(kit, opt) {
  const { makeBuilder, makeSculpt, KIT: K } = kit,
    B0 = makeBuilder(opt.seed || 7, PALETTE.hex),
    REC = makeRecorder(B0),
    B = REC.B,
    P = B.P,
    cands = makeCands(),
    solids = [],
    groups = [],
    tiles = new Map(),
    done = []; // rows already taken out of the recorder: { rows, grp, n }
  const EM = { em: true };
  const W = {
    kit,
    K,
    B,
    B0,
    REC,
    P,
    F,
    KIND,
    R: PALETTE.R,
    opt,
    cands,
    solids,
    groups,
    rnd: U.rng(opt.seed || 7),
    meta: { paths: [], lights: [], ships: [], tpl: {}, beams: [], floor: null, look: null },
    FOG_CUT: -170
  };
  /* a draw group: pass 0 solid, 1 added light. tpl: drawn by the page with a transform of its own, not as scenery */
  W.group = (name, pass, extra) => {
    groups.push(Object.assign({ name, pass: pass || 0 }, extra || {}));
    return groups.length - 1;
  };
  // scenery is grouped by tiles of ground, so the page can leave out what is off the screen and light each tile with the lamps near it
  W.tile = (x, z, pass, size, tag) => {
    size = size || 32;
    const key = (pass || 0) + ':' + (tag || '') + ':' + size + ':' + Math.floor(x / size) + ':' + Math.floor(z / size);
    let g = tiles.get(key);
    if (g === undefined) {
      g = W.group((tag || 'tile') + ' ' + Math.floor(x / size) + ',' + Math.floor(z / size), pass);
      tiles.set(key, g);
    }
    return g;
  };

  /* ---------------- boxes ----------------
     A box solid whose faces are laid on a square grid `res` apart, counted down from its top. Only faces some eye can see are laid, and
     nothing below `ycut`. A tall box is cut into stacked pieces (each its own solid, so the sculptor's field stays quick).
     s: { c, h, yaw, res, ycut, mat, grp, top (false: no roof), sides (false: none), occl (false: hides nothing), segH, bottom } */
  W.box = s => {
    const yaw = s.yaw || 0,
      Ux = [Math.cos(yaw), 0, -Math.sin(yaw)],
      Wz = [Math.sin(yaw), 0, Math.cos(yaw)],
      c = s.c,
      h = s.h,
      res = s.res || U.resBox(c, h, yaw, s.px, s.lo, s.hi),
      ytop = c[1] + h[1],
      ylo = Math.max(c[1] - h[1], s.ycut === undefined ? W.FOG_CUT : s.ycut),
      occ = s.occl !== false,
      segH = s.segH || 12;
    if (ytop <= ylo) return [];
    const matObj = typeof s.mat === 'function' ? s.mat(res, ytop) : s.mat;
    const sides = [];
    if (s.sides !== false)
      for (const [ax, sg, hh, ot, oh, end] of [
        [Ux, 1, h[0], Wz, h[2], false],
        [Ux, -1, h[0], Wz, h[2], false],
        [Wz, 1, h[2], Ux, h[0], true],
        [Wz, -1, h[2], Ux, h[0], true]
      ]) {
        if (end && s.ends === false) continue; // (a piece of a long run: its ends meet the next piece)
        const n = [ax[0] * sg, 0, ax[2] * sg],
          pc = [c[0] + n[0] * hh, c[1], c[2] + n[2] * hh];
        if (!U.planeSeen(pc, n)) continue;
        const nt = Math.max(1, Math.round((2 * oh) / res));
        sides.push({ n, pc, ot, oh, nt });
      }
    const topSeen = s.top !== false && U.EYE_MAX_Y > ytop + 0.3,
      botSeen = s.bottom === true && U.EYE_MIN_Y < c[1] - h[1] - 0.3,
      rows = Math.max(1, Math.round((ytop - ylo) / res)),
      nseg = Math.max(1, Math.ceil((ytop - ylo) / segH)),
      made = [];
    for (let k = 0; k < nseg; k++) {
      const hi = ytop - ((ytop - ylo) * k) / nseg,
        lo = ytop - ((ytop - ylo) * (k + 1)) / nseg,
        start = cands.count();
      for (let j = 0; j < rows; j++) {
        const y = ytop - (j + 0.5) * res;
        if (y > hi || y <= lo) continue;
        for (const f of sides)
          for (let i = 0; i < f.nt; i++) {
            const t = -f.oh + ((i + 0.5) / f.nt) * 2 * f.oh;
            cands.add(f.pc[0] + f.ot[0] * t, y, f.pc[2] + f.ot[2] * t, res, f.n[0], 0, f.n[2], occ);
          }
      }
      for (const [seen, yy, ny] of [
        [topSeen && k === 0, ytop, 1],
        [botSeen && k === nseg - 1, c[1] - h[1], -1]
      ]) {
        if (!seen) continue;
        const na = Math.max(1, Math.round((2 * h[0]) / res)),
          nb = Math.max(1, Math.round((2 * h[2]) / res));
        for (let a = 0; a < na; a++)
          for (let b = 0; b < nb; b++) {
            const la = -h[0] + ((a + 0.5) / na) * 2 * h[0],
              lb = -h[2] + ((b + 0.5) / nb) * 2 * h[2];
            cands.add(c[0] + Ux[0] * la + Wz[0] * lb, yy, c[2] + Ux[2] * la + Wz[2] * lb, res, 0, ny, 0, occ);
          }
      }
      const count = cands.count() - start;
      if (!count) continue;
      const rec = {
        c: [c[0], (hi + lo) / 2, c[2]],
        h: [h[0], (hi - lo) / 2, h[2]],
        Ux,
        Wz,
        res,
        mat: matObj,
        what: s.what || 'box',
        grp: s.grp === undefined ? W.tile(c[0], c[2], 0) : s.grp,
        start,
        count
      };
      solids.push(rec);
      made.push(rec);
    }
    return made;
  };

  /* ---------------- baking ---------------- */
  /* ---------------- lights that belong to a wall (windows, roof-edge lamps) ----------------
     Laid as candidates too, so that the ones no eye can see are never made; they hide nothing themselves. */
  const sets = [];
  W.lightSet = (c, h, res, grp) => {
    const rec = { c, h, res, grp, start: cands.count(), count: 0, info: [] };
    sets.push(rec);
    return rec;
  };
  // n: the way it faces; s: its half size; kind, ph, sp: how it behaves
  W.lightAdd = (rec, x, y, z, n, pal, s, kind, ph, sp, big) => {
    cands.add(x, y, z, rec.res, n[0], n[1], n[2], false);
    rec.info.push(pal, s, kind, ph, sp, big ? 1 : 0);
    rec.count++;
  };
  W.layLights = () => {
    const { X, Y, Z, NV } = cands.arrays(),
      vis = W.vis;
    let made = 0;
    for (const r of sets)
      for (let k = 0; k < r.count; k++) {
        const i = r.start + k;
        if (!vis[i]) continue;
        const q = k * 6,
          s = r.info[q + 1];
        REC.tag({ group: r.grp, kind: r.info[q + 2], flags: F.EM | (r.info[q + 5] ? F.BIG : 0), ph: r.info[q + 3], sp: r.info[q + 4] });
        B.disc(X[i], Y[i], Z[i], [NV[i * 3] / 127, NV[i * 3 + 1] / 127, NV[i * 3 + 2] / 127], s, s * 0.4, P[r.info[q]], 3, EM);
        made++;
      }
    return made;
  };
  W.cull = o => {
    W.vis = visibility(cands, Object.assign({ solids: solids.concat(sets) }, o));
    let n = 0;
    for (let i = 0; i < W.vis.length; i++) n += W.vis[i];
    const by = {};
    for (const r of solids.concat(sets)) {
      const k = r.what || 'lights',
        e = by[k] || (by[k] = [0, 0]);
      e[0] += r.count;
      for (let i = r.start; i < r.start + r.count; i++) e[1] += W.vis[i];
    }
    return { cands: W.vis.length, seen: n, by };
  };
  /* the moon: low on the right, a little toward the eye's side, never in the picture. The sculptor shades by it (short contact
     shade), the page lights by it (a cool light), and its long shadows are worked out once, here, by W.moonShade */
  W.moon = B.norm([0.78, 0.52, 0.2]);
  W.sculptor = o => {
    const S = K.sculpt(makeSculpt(B));
    S.sun = W.moon;
    S.amb = 0.1;
    S.sky = 0.1;
    S.sunK = 0.42;
    S.aoR = 0.14;
    S.aoK = 1.3;
    S.shLen = 14;
    S.wob = 0.03;
    Object.assign(S, o || {});
    S.emit = (solid, n0, n1) => {
      if (solid && solid.grp !== undefined) for (let i = n0; i < n1; i++) REC.setGroup(i, solid.grp);
    };
    return S;
  };
  // hand every box to a sculptor (only the candidates that can be seen), bake, and keep the rows
  W.bakeBoxes = () => {
    const S = W.sculptor(),
      { X, Y, Z } = cands.arrays(),
      vis = W.vis;
    let laid = 0;
    for (const r of solids) {
      let any = false;
      for (let i = r.start; i < r.start + r.count; i++)
        if (vis[i]) {
          any = true;
          break;
        }
      if (!any) continue;
      const c = r.c,
        h = r.h,
        Ux = r.Ux,
        Wz = r.Wz,
        p = S.solid(
          [0, 0, 0],
          1,
          (x, y, z) => {
            const dx = x - c[0],
              dz = z - c[2],
              qx = Math.abs(dx * Ux[0] + dz * Ux[2]) - h[0],
              qy = Math.abs(y - c[1]) - h[1],
              qz = Math.abs(dx * Wz[0] + dz * Wz[2]) - h[2];
            return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
          },
          (res, f) => {
            for (let i = r.start; i < r.start + r.count; i++) if (vis[i]) f(X[i], Y[i], Z[i]);
          },
          r.mat,
          { res: r.res }
        );
      p.bc = c;
      p.br = Math.hypot(h[0], h[1], h[2]);
      p.grp = r.grp;
      laid++;
    }
    S.bake();
    W.take();
    return laid;
  };
  /* the moon's shadows. A depth picture of every place a splat may be laid (seen or not: the backs of things cast shadows too),
     drawn from the moon over the city within `rad` of the bend; then every splat laid so far that is not a light is marked (MSH)
     where something stands between it and the moon. Each place is drawn a little wider than its spacing, so walls come out whole;
     each splat is tested from a little off its surface (out along its normal, and toward the moon), so it does not shade itself. */
  W.moonShade = o => {
    o = o || {};
    W.take();
    const L = W.moon,
      Fm = [-L[0], -L[1], -L[2]],
      Uh = B.norm([Fm[2], 0, -Fm[0]]),
      Vv = [Uh[1] * Fm[2] - Uh[2] * Fm[1], Uh[2] * Fm[0] - Uh[0] * Fm[2], Uh[0] * Fm[1] - Uh[1] * Fm[0]],
      RAD = o.rad || 480,
      R2 = RAD * RAD,
      SZ = o.size || 4096,
      { n, X, Y, Z, R, OC } = cands.arrays();
    let u0 = 1e9,
      u1 = -1e9,
      v0 = 1e9,
      v1 = -1e9;
    for (let i = 0; i < n; i++) {
      if (X[i] * X[i] + Z[i] * Z[i] > R2) continue;
      const u = X[i] * Uh[0] + Y[i] * Uh[1] + Z[i] * Uh[2],
        v = X[i] * Vv[0] + Y[i] * Vv[1] + Z[i] * Vv[2];
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const tx = Math.max(u1 - u0, v1 - v0) / (SZ - 8),
      map = new Float32Array(SZ * SZ).fill(1e9);
    for (let i = 0; i < n; i++) {
      if (!OC[i] || X[i] * X[i] + Z[i] * Z[i] > R2) continue;
      const cu = (X[i] * Uh[0] + Y[i] * Uh[1] + Z[i] * Uh[2] - u0) / tx + 4,
        cv = (X[i] * Vv[0] + Y[i] * Vv[1] + Z[i] * Vv[2] - v0) / tx + 4,
        d = X[i] * Fm[0] + Y[i] * Fm[1] + Z[i] * Fm[2],
        h = Math.ceil((R[i] * 0.6) / tx),
        x0 = Math.max(0, Math.floor(cu) - h),
        x1 = Math.min(SZ - 1, Math.floor(cu) + h),
        y0 = Math.max(0, Math.floor(cv) - h),
        y1 = Math.min(SZ - 1, Math.floor(cv) + h);
      for (let y = y0; y <= y1; y++) {
        const row = y * SZ;
        for (let x = x0; x <= x1; x++) if (d < map[row + x]) map[row + x] = d;
      }
    }
    let tested = 0,
      marked = 0;
    const bias = 0.35 + 1.5 * tx;
    for (const t of done)
      for (let k = 0; k < t.n; k++) {
        const r = t.rows,
          q = k * ROW,
          fl = r[q + 11];
        if (fl & (F.EM | F.ADD)) continue;
        const x = r[q],
          y = r[q + 1],
          z = r[q + 2];
        if (x * x + z * z > R2) continue;
        const lit = fl & F.LIT,
          nl = r[q + 4] * L[0] + r[q + 5] * L[1] + r[q + 6] * L[2];
        if (lit && nl <= 0.02) continue; // (turned away from the moon: the page gives it none of its light anyway)
        const off = lit ? 0.25 + 1.2 * r[q + 8] : 0,
          px = x + r[q + 4] * off + L[0] * 0.3,
          py = y + r[q + 5] * off + L[1] * 0.3,
          pz = z + r[q + 6] * off + L[2] * 0.3,
          ix = Math.floor((px * Uh[0] + py * Uh[1] + pz * Uh[2] - u0) / tx + 4),
          iy = Math.floor((px * Vv[0] + py * Vv[1] + pz * Vv[2] - v0) / tx + 4);
        if (ix < 0 || iy < 0 || ix >= SZ || iy >= SZ) continue;
        tested++;
        if (map[iy * SZ + ix] < px * Fm[0] + py * Fm[1] + pz * Fm[2] - bias) {
          r[q + 11] = fl | F.MSH;
          marked++;
        }
      }
    return { tested, marked, texel: tx };
  };
  // move what the recorder holds into the finished pile
  W.take = () => {
    const t = REC.take();
    B0.take();
    if (t.n) done.push(t);
    return t.n;
  };
  /* the finished rows sorted into their groups: [{ name, pass, rows, n, meta }] */
  W.finish = () => {
    W.take();
    const cnt = new Int32Array(groups.length);
    for (const t of done) for (let i = 0; i < t.n; i++) cnt[t.grp[i]]++;
    const out = groups.map((g, i) => ({ name: g.name, pass: g.pass, n: 0, rows: new Float32Array(cnt[i] * ROW), meta: g }));
    for (const t of done)
      for (let i = 0; i < t.n; i++) {
        const g = out[t.grp[i]];
        g.rows.set(t.rows.subarray(i * ROW, i * ROW + ROW), g.n * ROW);
        g.n++;
      }
    return out;
  };

  /* ---------------- laying splats by hand (lights, trails, dust) ---------------- */
  W.orFlags = 0; // (flags added to every lamp and glow laid while set: a ship whose lights must show through the deep fog sets NOFOG)
  // a glow: added light, a soft ball. o: { kind, ph, sp, rg, ex, big }
  W.glow = (g, x, y, z, s, pal, a, o) => {
    o = o || {};
    REC.tag({
      group: g,
      kind: o.kind || 0,
      flags: F.EM | F.ADD | (o.big ? F.BIG : 0) | (o.rainbow ? F.RAINBOW : 0) | W.orFlags,
      ph: o.ph,
      sp: o.sp,
      rg: o.rg,
      ex: o.ex
    });
    if (o.ax) B.axial(x, y, z, o.ax, o.sa || s, s, P[pal], a, EM);
    else B.iso(x, y, z, s, P[pal], a, EM);
  };
  // a solid light: a small bright dab that hides what is behind it. o: { n (the way it faces), kind, ph, sp, rg, ex, big, sn }
  W.lamp = (g, x, y, z, s, pal, o) => {
    o = o || {};
    REC.tag({ group: g, kind: o.kind || 0, flags: F.EM | (o.big ? F.BIG : 0) | (o.nofog ? F.NOFOG : 0) | (o.rainbow ? F.RAINBOW : 0) | W.orFlags, ph: o.ph, sp: o.sp, rg: o.rg, ex: o.ex });
    if (o.n) B.disc(x, y, z, o.n, s, o.sn || s * 0.5, P[pal], 3, EM);
    else if (o.ax) B.stick(x, y, z, o.ax, o.sl || s, s, P[pal], 3, EM);
    else B.iso(x, y, z, s, P[pal], 3, EM);
  };
  // a dark rod (an antenna, a strut, a cable): sticks laid end to end. o: { pal, n (how many) }
  W.rod = (g, a, b, r, pal, o) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      L = Math.hypot(d[0], d[1], d[2]) || 1,
      ax = [d[0] / L, d[1] / L, d[2] / L],
      n = (o && o.n) || Math.max(1, Math.round(L / Math.max(r * 5, 0.25)));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      REC.tag({ group: g, flags: o && o.big ? F.BIG : 0 });
      B.stick(a[0] + d[0] * f, a[1] + d[1] * f, a[2] + d[2] * f, ax, (L / n) * 0.62, r, P[pal], 3);
    }
  };
  /* a pipe from a to b: rings of discs facing outward, shaded by hand on a ramp (moonlight from S.sun's side, a little from the sky).
     Only the part of the round an eye can see is laid. o: { ramp, collar (a wider, darker band every so far), tile } */
  const SUN = B.norm([0.59, 0.74, 0.33]);
  W.pipe = (a, b, r, o) => {
    o = o || {};
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      L = Math.hypot(d[0], d[1], d[2]),
      ax = [d[0] / L, d[1] / L, d[2] / L],
      s1 = B.norm([ax[2], 0, -ax[0]]),
      s2 = [ax[1] * s1[2] - ax[2] * s1[1], ax[2] * s1[0] - ax[0] * s1[2], ax[0] * s1[1] - ax[1] * s1[0]],
      ramp = o.ramp || [1, 2, 3, 5, 6, 7];
    let s = 0,
      n = 0;
    while (s < L) {
      const c = [a[0] + ax[0] * s, a[1] + ax[1] * s, a[2] + ax[2] * s],
        res = U.resAt(c[0], c[1], c[2], o.px || 2, 0.09, 2.4),
        col = o.collar && s % o.collar < res * 1.01,
        rr = col ? r * 1.22 : r,
        k = Math.max(6, Math.round((6.283 * rr) / res)),
        g = W.tile(c[0], c[2], 0, o.tile || 48, 'pipe');
      for (let i = 0; i < k; i++) {
        const an = ((i + (n & 1) * 0.5) / k) * 6.283,
          nx = s1[0] * Math.cos(an) + s2[0] * Math.sin(an),
          ny = s1[1] * Math.cos(an) + s2[1] * Math.sin(an),
          nz = s1[2] * Math.cos(an) + s2[2] * Math.sin(an);
        if (ny < -0.55) continue;
        const lit = 0.1 + 0.6 * Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]) + 0.2 * Math.max(0, ny) - (col ? 0.12 : 0),
          tone = ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(lit * ramp.length)))];
        REC.tag({ group: g, flags: res > 0.8 ? F.BIG : 0 });
        B.disc(c[0] + nx * rr, c[1] + ny * rr, c[2] + nz * rr, [nx, ny, nz], Math.max(res, (6.283 * rr) / k) * 0.6, res * 0.2, P[tone], 3);
      }
      s += res;
      n++;
    }
  };
  return W;
}
module.exports = { makeWorld };
