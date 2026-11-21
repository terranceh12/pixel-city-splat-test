/* Shared by the scene's parts: seeded chance, the places the eye can be, how fine a surface has to be laid at a given place,
   and paths (a road's centre line with distance along it). */
const CP = require('../campath.js');

function rng(seed) {
  let a = seed >>> 0;
  const R = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  R.range = (lo, hi) => lo + (hi - lo) * R();
  R.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * R());
  R.pick = arr => arr[Math.floor(R() * arr.length)];
  R.chance = p => R() < p;
  return R;
}
// a number in 0..1 from up to four integers, the same every time
function h4(a, b, c, d) {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647 + (d | 0) * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/* every place the eye can be: the hover range of the orbit, sampled */
function eyes(na, ne) {
  const C = CP.C,
    out = [];
  for (let i = 0; i < na; i++)
    for (let j = 0; j < ne; j++) {
      const az = C.az0 + ((i / (na - 1)) * 2 - 1) * C.azRange,
        el = C.el0 - C.elDown + (j / (ne - 1)) * (C.elUp + C.elDown);
      out.push(CP.pose(az, el));
    }
  return out;
}
const EYES = eyes(15, 9);
const EYE_MAX_Y = Math.max(...EYES.map(e => e.eye[1])),
  EYE_MIN_Y = Math.min(...EYES.map(e => e.eye[1]));
/* how near the eye ever comes to a place while that place is in the picture (the widest picture any window gives through the
   fisheye, in lens units, and a margin). A roof right under the eye's path is never seen from there: the picture's lower edge
   passes well in front of it. */
const SEE_H = CP.C.tanHMax * 1.08,
  SEE_V = CP.C.tanVMax * 1.03;
function seenFrom(x, y, z, m) {
  let best = 1e9;
  m = m || 0;
  for (const e of EYES) {
    const dx = x - e.eye[0],
      dy = y - e.eye[1],
      dz = z - e.eye[2],
      l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l >= best) continue;
    if (l > m + 0.5) {
      const cx = e.right[0] * dx + e.right[1] * dy + e.right[2] * dz,
        cy = e.up[0] * dx + e.up[1] * dy + e.up[2] * dz,
        cz = e.fwd[0] * dx + e.fwd[1] * dy + e.fwd[2] * dz,
        q = CP.toLens([cx, cy, cz]);
      if (!q) continue;
      const mm = (1.4 * m) / l;
      if (Math.abs(q[0]) > SEE_H + mm || Math.abs(q[1]) > SEE_V + mm) continue;
    }
    best = l;
  }
  return best;
}
function nearestEye(x, y, z) {
  let m = 1e9;
  for (const e of EYES) {
    const d = Math.hypot(x - e.eye[0], y - e.eye[1], z - e.eye[2]);
    if (d < m) m = d;
  }
  return m;
}
/* the spacing to lay splats at so that each is about `px` art pixels across from the nearest the eye ever sees it
   (a picture about 360 art pixels tall seen through the fisheye: one unit at distance d is about 300 / d art pixels, a little more
   toward the edges, a little less in the middle) */
const F_ART = 300;
let PX = 2;
const setPx = v => (PX = v),
  getPx = () => PX;
function resAt(x, y, z, px, lo, hi) {
  return clamp(((px || PX) * seenFrom(x, y, z, 1.5)) / F_ART, lo || 0.06, hi || 3.2);
}
/* ... for a box: centre c, half sizes h, turned by yaw. The finest any part of it asks for */
function resBox(c, h, yaw, px, lo, hi) {
  const cs = Math.cos(yaw || 0),
    sn = Math.sin(yaw || 0);
  let best = 1e9;
  const ny = h[1] > 6 ? 5 : 3;
  for (let a = -1; a <= 1; a++)
    for (let b = 0; b < ny; b++)
      for (let d = -1; d <= 1; d++) {
        const lx = a * h[0],
          lz = d * h[2],
          m = seenFrom(c[0] + lx * cs + lz * sn, c[1] + ((b / (ny - 1)) * 2 - 1) * h[1], c[2] - lx * sn + lz * cs, 1.5);
        if (m < best) best = m;
      }
  return clamp(((px || PX) * best) / F_ART, lo || 0.085, hi || 3.2);
}
// can any eye be in front of the plane through p with normal n?
function planeSeen(p, n) {
  for (const e of EYES)
    if ((e.eye[0] - p[0]) * n[0] + (e.eye[1] - p[1]) * n[1] + (e.eye[2] - p[2]) * n[2] > 0.3) return true;
  return false;
}

/* a path: points laid a fixed step apart along straight runs joined by round corners.
   at(s) gives { p, t (the way it runs), n (to its left, level) } */
function makePath(way, o) {
  o = o || {};
  const step = o.step || 0.5,
    rad = o.rad || 10,
    pts = [];
  const push = p => {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-6) pts.push(p);
  };
  const line = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      n = Math.max(1, Math.round(L / step));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
    }
  };
  let from = way[0];
  for (let i = 1; i < way.length; i++) {
    const v = way[i];
    if (i === way.length - 1) {
      line(from, v);
      break;
    }
    // round the corner at v
    const a = way[i - 1],
      b = way[i + 1],
      d1 = [v[0] - a[0], v[2] - a[2]],
      d2 = [b[0] - v[0], b[2] - v[2]],
      l1 = Math.hypot(d1[0], d1[1]),
      l2 = Math.hypot(d2[0], d2[1]);
    d1[0] /= l1;
    d1[1] /= l1;
    d2[0] /= l2;
    d2[1] /= l2;
    const turn = Math.acos(clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1)),
      tl = Math.min(rad * Math.tan(turn / 2), l1 * 0.45, l2 * 0.45),
      r = tl / Math.tan(turn / 2),
      p0 = [v[0] - d1[0] * tl, v[1], v[2] - d1[1] * tl],
      p1 = [v[0] + d2[0] * tl, v[1], v[2] + d2[1] * tl];
    line(from, p0);
    if (turn > 1e-4) {
      const sgn = d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 1 : -1,
        nx = -d1[1] * sgn,
        nz = d1[0] * sgn,
        cx = p0[0] + nx * r,
        cz = p0[2] + nz * r,
        a0 = Math.atan2(p0[2] - cz, p0[0] - cx),
        n = Math.max(2, Math.round((r * turn) / step));
      for (let k = 1; k <= n; k++) {
        const ang = a0 + (sgn * turn * k) / n;
        push([cx + Math.cos(ang) * r, v[1], cz + Math.sin(ang) * r]);
      }
    }
    from = p1;
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const len = cum[cum.length - 1];
  function at(s) {
    s = clamp(s, 0, len);
    let lo = 0,
      hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= s) lo = m;
      else hi = m;
    }
    const a = pts[lo],
      b = pts[hi],
      L = cum[hi] - cum[lo] || 1,
      f = (s - cum[lo]) / L,
      t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L],
      hl = Math.hypot(t[0], t[2]) || 1;
    return {
      p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f],
      t,
      n: [t[2] / hl, 0, -t[0] / hl] // to the left of the way it runs
    };
  }
  // distance from a point on the ground to the centre line
  function dist(x, z) {
    let m = 1e9;
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i][0] - x, pts[i][2] - z);
      if (d < m) m = d;
    }
    return m;
  }
  // ... and the height of the line where it comes nearest
  function near(x, z) {
    let m = 1e9,
      y = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i][0] - x, pts[i][2] - z);
      if (d < m) {
        m = d;
        y = pts[i][1];
      }
    }
    return [m, y];
  }
  return { pts, cum, len, at, dist, near };
}

/* how near a place comes to anywhere the eye can be: the eye keeps to a patch of a sphere about the bend (the hover range), so this is
   the distance to the nearest point of that patch */
function eyePatchDist(x, y, z) {
  const C = CP.C,
    r = Math.hypot(x, y, z) || 1e-6,
    az = clamp(Math.atan2(x, z), C.az0 - C.azRange, C.az0 + C.azRange),
    el = clamp(Math.asin(clamp(y / r, -1, 1)), C.el0 - C.elDown, C.el0 + C.elUp),
    ce = Math.cos(el);
  return Math.hypot(x - C.R * ce * Math.sin(az), y - C.R * Math.sin(el), z - C.R * ce * Math.cos(az));
}

module.exports = { CP, rng, h4, clamp, eyePatchDist, EYES, EYE_MAX_Y, EYE_MIN_Y, nearestEye, seenFrom, resAt, resBox, setPx, getPx, planeSeen, makePath, F_ART };
