/* Where the ships fly. A lane is a straight run from a to b, flown slowly; a ship fades out of the night at one end and back into it at
   the other, then waits and comes again. Lanes are thrown at random and kept only if the whole run is clear: of the roads (never
   under one, nor just over it), of the named towers, and of the air the eye swings through. The towers of the grid are cut down
   afterwards wherever a lane passes over them. */
const U = require('./util.js');

function planLanes(W, o) {
  const R = U.rng(o.seed || 77),
    CELL = 2,
    X0 = -260,
    Z0 = -330,
    NX = 260,
    NZ = 240,
    cells = new Array(NX * NZ);
  // every blocker is a span of heights over a patch of ground
  const mark = (x, z, rad, lo, hi) => {
    const a0 = Math.max(0, Math.floor((x - rad - X0) / CELL)),
      a1 = Math.min(NX - 1, Math.floor((x + rad - X0) / CELL)),
      b0 = Math.max(0, Math.floor((z - rad - Z0) / CELL)),
      b1 = Math.min(NZ - 1, Math.floor((z + rad - Z0) / CELL));
    for (let a = a0; a <= a1; a++)
      for (let b = b0; b <= b1; b++) {
        const c = cells[a * NZ + b] || (cells[a * NZ + b] = []),
          l = c[c.length - 1];
        if (l && l[0] === lo && l[1] === hi) continue;
        c.push([lo, hi]);
      }
  };
  // a road: its deck, with room over and under it; its legs, all the way down; a named tower, from its top down
  for (const rd of o.roads)
    for (let i = 0; i < rd.path.pts.length; i += 2) {
      const p = rd.path.pts[i];
      mark(p[0], p[2], rd.hw + 0.6, Math.round(p[1]) - 3.2, Math.round(p[1]) + 3);
    }
  // (legs and what is kept stand down to the city's floor, FOG_CUT; under it the air is open, and the fast traffic flies there)
  const FLOOR = W.FOG_CUT;
  for (const p of o.piers) mark(p[0], p[1], p[3] + 0.8, FLOOR - 2, p[2]);
  for (const b of o.kept)
    for (let x = b[0]; x <= b[1] + 1; x += CELL) for (let z = b[2]; z <= b[3] + 1; z += CELL) mark(x, z, 0.5, FLOOR - 2, b[4] + 3);
  const blocked = (x, z, lo, hi) => {
    const a = Math.floor((x - X0) / CELL),
      b = Math.floor((z - Z0) / CELL);
    if (a < 0 || b < 0 || a >= NX || b >= NZ) return false;
    const c = cells[a * NZ + b];
    if (!c) return false;
    for (let i = 0; i < c.length; i++) if (lo < c[i][1] && hi > c[i][0]) return true;
    return false;
  };
  const SHIP = {
    hauler: { half: 1.6, wide: 2.4, eye: 17, sc: [0.9, 1.25], sp: [0.55, 0.95] },
    wing: { half: 1.2, wide: 4.9, eye: 19, sc: [0.9, 1.5], sp: [0.7, 1.2] },
    dart: { half: 0.5, wide: 0.9, eye: 9, sc: [0.8, 1.5], sp: [1.3, 2.3] },
    barge: { half: 1.2, wide: 1.3, eye: 15, sc: [0.8, 1.2], sp: [0.5, 0.9] },
    liner: { half: 1.3, wide: 1.9, eye: 15, sc: [0.9, 1.4], sp: [0.8, 1.3] },
    freighter: { half: 1.9, wide: 2.0, eye: 19, sc: [1, 1.3], sp: [0.5, 0.75] },
    tanker: { half: 1.5, wide: 1.5, eye: 17, sc: [1, 1.3], sp: [0.5, 0.75] },
    tug: { half: 0.9, wide: 1.0, eye: 9, sc: [0.9, 1.2], sp: [0.5, 0.75] }
  };
  SHIP['freighter-b'] = SHIP.freighter;
  SHIP['wing-near'] = SHIP.wing;
  SHIP['dart-near'] = SHIP.dart;
  SHIP['liner-near'] = SHIP.liner;
  SHIP.racer = { half: 0.4, wide: 0.9, eye: 9, sc: [1.6, 2.2], sp: [15, 22] };
  SHIP['racer-p'] = SHIP.racer;
  // is the run from a to b clear for a ship of this kind?
  function clear(a, b, kind, sc, why) {
    const k = SHIP[kind],
      L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      n = Math.ceil(L / 2),
      hl = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1,
      side = k.wide * sc + 0.7, // its half width, and a little room
      ux = (b[2] - a[2]) / hl,
      uz = -(b[0] - a[0]) / hl,
      ns = Math.max(1, Math.ceil(side / 1.4));
    for (let i = 0; i <= n; i++) {
      const f = i / n,
        x = a[0] + (b[0] - a[0]) * f,
        y = a[1] + (b[1] - a[1]) * f,
        z = a[2] + (b[2] - a[2]) * f;
      if (blocked(x, z, y - k.half * sc, y + k.half * sc)) {
        if (why) why.push('blocked at ' + [x, y, z].map(v => v.toFixed(1)) + ' by ' + JSON.stringify(cells[Math.floor((x - X0) / CELL) * NZ + Math.floor((z - Z0) / CELL)]));
        return false;
      }
      for (let j = 1; j <= ns; j++) {
        const w = (side * j) / ns;
        if (blocked(x + ux * w, z + uz * w, y - k.half * sc, y + k.half * sc) || blocked(x - ux * w, z - uz * w, y - k.half * sc, y + k.half * sc)) return false;
      }
      if (o.ground && y + k.half * sc > FLOOR && y - k.half * sc < o.ground(x, z)) return false; // (over the city proper a ship keeps above the roofs, or goes under its floor)
      if (U.nearestEye(x, y, z) < k.eye * sc) {
        if (why) why.push('eye ' + U.nearestEye(x, y, z).toFixed(1) + ' at ' + [x, y, z].map(v => v.toFixed(1)));
        return false;
      }
    }
    return true;
  }
  // one place along a run: is there room for the ship there? (ux, uz: across its heading)
  function room(x, y, z, kind, sc, ux, uz) {
    const k = SHIP[kind],
      side = k.wide * sc + 0.7,
      ns = Math.max(1, Math.ceil(side / 1.4)),
      lo = y - k.half * sc,
      hi = y + k.half * sc;
    if (blocked(x, z, lo, hi) || U.nearestEye(x, y, z) < k.eye * sc) return false;
    for (let j = 1; j <= ns; j++) {
      const w = (side * j) / ns;
      if (blocked(x + ux * w, z + uz * w, lo, hi) || blocked(x - ux * w, z - uz * w, lo, hi)) return false;
    }
    return true;
  }
  /* a ship that must be passing the place c at the start (it is in the painting there): the heading near head0 with the longest
     clear run through c is taken, however short the run before it has to be */
  function through(kind, c, head0, fan, sc, sp, least) {
    least = least || [34, 40];
    const k = SHIP[kind];
    let best = null;
    for (let h = head0 - fan; h <= head0 + fan + 1e-9; h += 0.025) {
      const dx = Math.sin(h),
        dz = Math.cos(h),
        run = [0, 0];
      for (let dir = 0; dir < 2; dir++) {
        const sg = dir ? 1 : -1;
        let t = 0;
        while (t < 170 && room(c[0] + dx * sg * (t + 2), c[1], c[2] + dz * sg * (t + 2), kind, sc, dz, -dx)) t += 2;
        run[dir] = t;
      }
      if (run[0] < least[0] || run[1] < least[1] || !room(c[0], c[1], c[2], kind, sc, dz, -dx)) continue;
      const score = Math.min(run[0], 150) + Math.min(run[1], 150) - Math.abs(h - head0) * 30;
      if (!best || score > best.score) best = { score, h, run };
    }
    if (!best) {
      if (o.debug) {
        const k2 = SHIP[kind];
        console.log('   no run through', c, 'room here:', room(c[0], c[1], c[2], kind, sc, 1, 0), 'blocked:', blocked(c[0], c[2], c[1] - k2.half * sc, c[1] + k2.half * sc), 'eye', U.nearestEye(c[0], c[1], c[2]).toFixed(1), JSON.stringify(cells[Math.floor((c[0] - X0) / CELL) * NZ + Math.floor((c[2] - Z0) / CELL)]));
      }
      return false;
    }
    const dx = Math.sin(best.h),
      dz = Math.cos(best.h),
      before = best.run[0] - 1,
      after = best.run[1] - 1,
      a = [c[0] - dx * before, c[1], c[2] - dz * before],
      b = [c[0] + dx * after, c[1], c[2] + dz * after],
      len = before + after,
      v = sp || (k.sp[0] + k.sp[1]) / 2,
      gap = 26,
      cycle = len / v + gap;
    lanes.push({
      tpl: kind,
      a: a.map(x => +x.toFixed(2)),
      b: b.map(x => +x.toFixed(2)),
      sp: +v.toFixed(3),
      gap,
      u0: +(before / v / cycle).toFixed(4),
      sc,
      bob: 0.25,
      port: Math.min(30, before * 0.8),
      half: k.half * sc
    });
    return true;
  }
  const lanes = [];
  /* through: the place it should be passing at the start; head: its heading (radians, 0 = toward +Z), give or take `fan` */
  function add(kind, q) {
    const k = SHIP[kind];
    for (let tries = 0; tries < 4000; tries++) {
      const sc = q.sc || R.range(k.sc[0], k.sc[1]),
        head = (q.head === undefined ? R.range(0, 6.283) : q.head + R.range(-1, 1) * (q.fan === undefined ? 0.5 : q.fan)) + (tries > 1500 ? R.range(-1.5, 1.5) : 0),
        dx = Math.sin(head),
        dz = Math.cos(head),
        jit = q.jit === undefined ? 0 : q.jit * (1 + tries / 600),
        c = q.through
          ? [q.through[0] + R.range(-jit, jit), q.through[1] + R.range(-jit, jit) * 0.4, q.through[2] + R.range(-jit, jit)]
          : [R.range(q.x[0], q.x[1]), R.range(q.y[0], q.y[1]), R.range(q.z[0], q.z[1])],
        before = q.before ? q.before * (tries > 300 ? R.range(0.4, 1) : 1) : R.range(110, 190),
        after = q.after ? q.after * (tries > 300 ? R.range(0.6, 1) : 1) : R.range(110, 190),
        slope = R.range(-0.02, 0.02),
        a = [c[0] - dx * before, c[1] - slope * before, c[2] - dz * before],
        b = [c[0] + dx * after, c[1] + slope * after, c[2] + dz * after];
      const why = o.debug && q.through && tries % 400 === 0 ? [] : null;
      if (!clear(a, b, kind, sc, why)) {
        if (why) console.log('   try', tries, kind, 'head', head.toFixed(2), 'a', a.map(v => v.toFixed(0)), 'b', b.map(v => v.toFixed(0)), why[0] || 'side');
        continue;
      }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
        sp = R.range(k.sp[0], k.sp[1]),
        gap = R.range(12, 50),
        cycle = len / sp + gap,
        u0 = q.through ? before / sp / cycle : R();
      lanes.push({
        tpl: kind,
        a: a.map(v => +v.toFixed(2)),
        b: b.map(v => +v.toFixed(2)),
        sp: +sp.toFixed(3),
        gap: +gap.toFixed(1),
        u0: +u0.toFixed(4),
        sc: +sc.toFixed(2),
        bob: +(0.15 + 0.25 * R()).toFixed(2),
        port: 30,
        half: k.half * sc
      });
      return true;
    }
    return false;
  }
  /* a pack: ships that keep station on one another down one level lane, low in a ravine.
     members: [{ kind, off: [to the right, up, astern], sc }]; q: { x, y, z (ranges for the middle of the run), head, fan, len } */
  function pack(members, q) {
    for (let tries = 0; tries < 6000; tries++) {
      const head = q.head + R.range(-1, 1) * (q.fan || 0.1),
        fx = Math.sin(head),
        fz = Math.cos(head),
        rx = -fz,
        rz = fx,
        c = [R.range(q.x[0], q.x[1]), R.range(q.y[0], q.y[1]), R.range(q.z[0], q.z[1])],
        half = (q.len / 2) * (tries > 2500 ? R.range(0.5, 0.9) : R.range(0.85, 1.1)),
        runs = members.map(m => {
          const o = [c[0] + rx * m.off[0] - fx * m.off[2], c[1] + m.off[1], c[2] + rz * m.off[0] - fz * m.off[2]];
          return { a: [o[0] - fx * half, o[1], o[2] - fz * half], b: [o[0] + fx * half, o[1], o[2] + fz * half] };
        });
      if (!runs.every((r, i) => clear(r.a, r.b, members[i].kind, members[i].sc || 1))) continue;
      const sp = R.range(0.5, 0.72),
        gap = R.range(14, 30),
        u0 = R();
      runs.forEach((r, i) =>
        lanes.push({
          tpl: members[i].kind,
          a: r.a.map(v => +v.toFixed(2)),
          b: r.b.map(v => +v.toFixed(2)),
          sp: +sp.toFixed(3),
          gap: +gap.toFixed(1),
          u0: +u0.toFixed(4),
          sc: members[i].sc || 1,
          bob: 0.08,
          port: Math.min(30, half * 0.5),
          half: SHIP[members[i].kind].half * (members[i].sc || 1),
          pack: 1
        })
      );
      return true;
    }
    return false;
  }
  const PI = Math.PI;
  // the ones that are in the painting, where the painting has them
  const ok = [
    through('hauler', [15, -18, 23], 2.6, 0.6, 1.15, 0.7, [4, 40]), // (it comes out from under the island's wall)
    through('wing', [-27.6, 25, -24], -1.9, 0.5, 1.5, 0.8),
    through('dart', [-19.8, 24, -29.7], -1.95, 0.5, 1.4, 1.5),
    through('dart', [-19.3, -5, -5.8], 0.9, 3.2, 1.3, 1.7, [16, 22])
  ];
  if (ok.indexOf(false) >= 0) console.log('  (a painted ship found no clear lane: ' + ok.join(' ') + ')');
  // the rest: most of them down among the lower roads
  const deep = (kind, y0, y1, n, head, fan) => {
    for (let i = 0; i < n; i++) add(kind, { x: [-75, 80], y: [y0, y1], z: [-90, 58], head, fan });
  };
  deep('hauler', -58, -14, 4);
  deep('barge', -66, -10, 6);
  deep('liner', -52, -8, 5);
  deep('wing', -46, -12, 3);
  deep('dart', -60, -5, 12);
  deep('dart', 6, 30, 2, PI * 0.5, 1.2);
  deep('liner', 16, 40, 1, -PI * 0.5, 0.5);
  // freighters in company, down in the ravines
  const packs = [
    pack(
      [
        { kind: 'tug', off: [0, 0.6, -13], sc: 1.1 },
        { kind: 'freighter', off: [-4.2, 0, 0], sc: 1.15 },
        { kind: 'freighter', off: [4.2, -1.2, 5], sc: 1.15 }
      ],
      { x: [34, 62], y: [-58, -51], z: [-20, 40], head: PI, fan: 0.12, len: 210 }
    ),
    pack(
      [
        { kind: 'tanker', off: [0, 0, 0], sc: 1.25 },
        { kind: 'tanker', off: [1.5, -1, 15], sc: 1.25 },
        { kind: 'tanker', off: [-1.5, -2, 30], sc: 1.25 }
      ],
      { x: [28, 66], y: [-104, -84], z: [-40, 30], head: 0, fan: 0.14, len: 200 }
    ),
    pack(
      [
        { kind: 'tanker', off: [0, 0, 0], sc: 1.1 },
        { kind: 'tug', off: [2.6, 0.8, 9], sc: 1 }
      ],
      { x: [-31, -23], y: [-58, -50], z: [40, 64], head: 0, fan: 0.04, len: 96 }
    ),
    pack(
      [
        { kind: 'freighter', off: [0, 0, 0], sc: 1.2 },
        { kind: 'tanker', off: [-4.6, -1.5, 9], sc: 1.1 },
        { kind: 'tug', off: [4, 1, 8], sc: 1 },
        { kind: 'tug', off: [0, 2.4, 19], sc: 1 }
      ],
      { x: [36, 66], y: [-80, -71], z: [-70, 20], head: 0.1, fan: 0.2, len: 190 }
    ),
    pack(
      [
        { kind: 'freighter', off: [0, 0, 0], sc: 1.1 },
        { kind: 'freighter', off: [0.8, -1.6, 17], sc: 1.1 }
      ],
      { x: [-48, -34], y: [-92, -52], z: [-75, -55], head: -2.83, fan: 0.05, len: 96 }
    ),
    pack(
      [
        { kind: 'tanker', off: [-3, 0, 0], sc: 1 },
        { kind: 'tanker', off: [3, 0.6, 4], sc: 1 }
      ],
      { x: [30, 70], y: [-36, -31], z: [30, 70], head: PI / 2, fan: 1.6, len: 60 }
    ),
    pack(
      [
        { kind: 'freighter-b', off: [0, 0, 0], sc: 1.1 },
        { kind: 'tanker', off: [-4.4, -1.2, 10], sc: 1.05 },
        { kind: 'tug', off: [0, 1.6, -13], sc: 1 }
      ],
      { x: [34, 68], y: [-66, -60], z: [-110, -40], head: 0, fan: 0.15, len: 110 }
    )
  ];
  if (packs.indexOf(false) >= 0) console.log('  (a freighter pack found no clear lane: ' + packs.join(' ') + ')');
  /* a few that pass close to the eye. A lane is laid across the view from the starting pose, `depth` in front of the eye and `lift`
     above the line of sight (both in world units), turned `turn` from straight across, and run out each way for as long as it keeps
     at least `least` from everywhere the eye can be and clear of everything built. tMid: when (seconds after the page opens) it is
     first at its nearest. */
  const CP = U.CP,
    P0 = CP.pose(CP.C.az0, CP.C.el0);
  function close(kind, q) {
    const k = SHIP[kind],
      sc = q.sc || 1;
    const ok = (x, y, z, ux, uz) => {
      if (U.eyePatchDist(x, y, z) < q.least) return false;
      if (o.ground && y - k.half * sc < Math.min(2, o.ground(x, z))) return false;
      const lo = y - k.half * sc,
        hi = y + k.half * sc,
        side = k.wide * sc + 0.7;
      if (blocked(x, z, lo, hi) || blocked(x + ux * side, z + uz * side, lo, hi) || blocked(x - ux * side, z - uz * side, lo, hi)) return false;
      return true;
    };
    let best = null;
    for (let tries = 0; tries < 900; tries++) {
      const depth = q.depth * (1 + R.range(-0.15, 0.25) * (tries > 0 ? 1 : 0)),
        lift = q.lift + R.range(-2, 2) * (tries > 0 ? 1 : 0),
        turn = q.turn + R.range(-0.2, 0.2) * (tries > 0 ? 1 : 0),
        c = [0, 1, 2].map(i => P0.eye[i] + P0.fwd[i] * depth + P0.up[i] * lift),
        d0 = [Math.cos(turn) * P0.right[0] + Math.sin(turn) * P0.fwd[0], 0, Math.cos(turn) * P0.right[2] + Math.sin(turn) * P0.fwd[2]],
        dl = Math.hypot(d0[0], d0[2]),
        d = [d0[0] / dl, (q.climb || 0), d0[2] / dl],
        ux = d[2],
        uz = -d[0];
      if (!ok(c[0], c[1], c[2], ux, uz)) continue;
      const run = [0, 0];
      for (let s = 0; s < 2; s++) {
        const sg = s ? 1 : -1;
        let t = 0;
        while (t < 140 && ok(c[0] + d[0] * sg * (t + 1.5), c[1] + d[1] * sg * (t + 1.5), c[2] + d[2] * sg * (t + 1.5), ux, uz)) t += 1.5;
        run[s] = t;
      }
      if (run[0] < q.run || run[1] < q.run) continue;
      best = { c, d, run };
      break;
    }
    if (!best) return false;
    const before = Math.min(best.run[0], 120) - 1,
      after = Math.min(best.run[1], 120) - 1,
      a = best.c.map((v, i) => v - best.d[i] * before),
      b = best.c.map((v, i) => v + best.d[i] * after),
      len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      cycle = len / q.sp + q.gap,
      u0 = ((((before / q.sp - q.tMid) / cycle) % 1) + 1) % 1;
    lanes.push({
      tpl: kind,
      a: a.map(v => +v.toFixed(2)),
      b: b.map(v => +v.toFixed(2)),
      sp: q.sp,
      gap: q.gap,
      u0: +u0.toFixed(4),
      sc,
      bob: 0.12,
      port: Math.min(18, before * 0.5),
      half: k.half * sc,
      close: 1
    });
    return true;
  }
  const near = [
    // a wing gliding across in front of the eye, a little above the line of sight
    close('wing-near', { depth: 19, lift: 2.5, turn: 0.18, least: 8, run: 26, sp: 0.85, gap: 34, tMid: 9, sc: 1 }),
    // a pair of darts cutting across lower down, the other way
    close('dart-near', { depth: 8.5, lift: -2.2, turn: Math.PI - 0.25, least: 4.5, run: 22, sp: 1.9, gap: 41, tMid: 24, sc: 1.1 }),
    close('dart-near', { depth: 10.5, lift: -3.4, turn: Math.PI - 0.25, least: 4.5, run: 22, sp: 1.9, gap: 41, tMid: 25.3, sc: 1.1 }) ||
      close('dart-near', { depth: 10.5, lift: -1.2, turn: Math.PI - 0.25, least: 4.5, run: 22, sp: 1.9, gap: 41, tMid: 25.3, sc: 1.1 }) ||
      close('dart-near', { depth: 12, lift: 0.4, turn: Math.PI - 0.3, least: 4.5, run: 20, sp: 1.9, gap: 41, tMid: 25.3, sc: 1.1 }),
    // a liner going away past the eye's right shoulder, climbing slowly
    close('liner-near', { depth: 22, lift: 5, turn: 0.5, least: 9, run: 28, sp: 1.0, gap: 48, tMid: 44, sc: 1.2, climb: 0.03 })
  ];
  if (near.indexOf(false) >= 0) console.log('  (a close pass found no clear lane: ' + near.join(' ') + ')');
  // far traffic, small in the distance
  for (let i = 0; i < 6; i++) add(i % 2 ? 'liner' : 'barge', { x: [-200, 200], y: [16, 40], z: [-300, -130], head: i % 2 ? PI * 0.5 : -PI * 0.5, fan: 0.6 });
  /* fast traffic far down, between the city's floor and the city under it: a string of ships one after another down one lane.
     kinds: the templates, in turn; q: { x, y, z (ranges for the middle of the run), head, fan, before, after, sp, gap, sc } */
  function stream(kinds, n, q) {
    const kind = kinds[0];
    for (let tries = 0; tries < 3000; tries++) {
      const head = q.head + R.range(-1, 1) * (q.fan || 0.05),
        dx = Math.sin(head),
        dz = Math.cos(head),
        c = [R.range(q.x[0], q.x[1]), R.range(q.y[0], q.y[1]), R.range(q.z[0], q.z[1])],
        a = [c[0] - dx * q.before, c[1], c[2] - dz * q.before],
        b = [c[0] + dx * q.after, c[1], c[2] + dz * q.after];
      if (!clear(a, b, kind, q.sc)) continue;
      for (let i = 0; i < n; i++)
        lanes.push({
          tpl: kinds[i % kinds.length],
          a: a.map(v => +v.toFixed(2)),
          b: b.map(v => +v.toFixed(2)),
          sp: q.sp,
          gap: q.gap,
          u0: +((i + 0.35 * R()) / n).toFixed(4),
          sc: +(q.sc * R.range(0.9, 1.1)).toFixed(2),
          bob: 0,
          port: 30,
          half: SHIP[kind].half * q.sc,
          fogK: 0.4, // (seen through much less of the fog than it is in: what shows of it down there must be its lights, and those must carry)
          below: 1 // (deep under everything: the towers are not cut down for it)
        });
      return true;
    }
    return false;
  }
  const fast = [
    // down the east ravine toward the eye, and back up it lower down
    stream(['racer', 'racer', 'racer-p'], 5, { x: [44, 52], y: [-146, -140], z: [-16, 16], head: 0, fan: 0.05, before: 100, after: 128, sp: 26, gap: 3, sc: 2.6 }),
    stream(['racer-p', 'racer'], 4, { x: [60, 72], y: [-160, -154], z: [-16, 16], head: PI, fan: 0.05, before: 128, after: 100, sp: 22, gap: 4, sc: 2.8 }),
    // across, under the city's floor: out from under one bank, over the city below, under the island, and on
    stream(['racer', 'racer-p', 'racer', 'racer'], 4, { x: [-16, 0], y: [FLOOR - 8, FLOOR - 6], z: [-34, -18], head: PI / 2, fan: 0.12, before: 170, after: 160, sp: 30, gap: 3, sc: 2.8 })
  ];
  if (fast.indexOf(false) >= 0) console.log('  (a stream of fast ships found no clear lane: ' + fast.join(' ') + ')');
  return lanes;
}
module.exports = { planLanes };
