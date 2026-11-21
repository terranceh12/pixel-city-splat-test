/* What the eye can ever see.
   The eye only moves over a patch of a sphere (the hover range), so most of a dense city is never seen from anywhere on it: the
   backs of things, and the lower walls behind the next row of towers. Before anything is baked, every place a splat would be laid
   (a "candidate") is tested from a grid of eye positions against a depth picture of all the others; only candidates that pass
   somewhere are handed to the sculptor. The test is made to err toward keeping:
     - occluders are drawn smaller than they are, and thinner still where they are seen edge-on
     - the depth picture is then pushed back by a few pixels all round (so what an occluder hides from one eye position it also
       hides from the positions between this one and the next)
     - nothing nearer than `nearOcc` hides anything (near things slide across far ones too fast between two eye positions) */
const CP = require('../campath.js');

function makeCands() {
  let cap = 1 << 18,
    n = 0,
    X = new Float32Array(cap),
    Y = new Float32Array(cap),
    Z = new Float32Array(cap),
    R = new Float32Array(cap), // spacing (the candidate stands for a square this wide)
    NV = new Int8Array(cap * 3), // which way it faces
    OC = new Uint8Array(cap); // may it hide others?
  const grow = () => {
    cap *= 2;
    const g = (a, k) => {
      const b = new a.constructor(cap * (k || 1));
      b.set(a);
      return b;
    };
    X = g(X);
    Y = g(Y);
    Z = g(Z);
    R = g(R);
    NV = g(NV, 3);
    OC = g(OC);
  };
  return {
    add(x, y, z, r, nx, ny, nz, occ) {
      if (n === cap) grow();
      X[n] = x;
      Y[n] = y;
      Z[n] = z;
      R[n] = r;
      NV[n * 3] = Math.round(nx * 127);
      NV[n * 3 + 1] = Math.round(ny * 127);
      NV[n * 3 + 2] = Math.round(nz * 127);
      OC[n] = occ ? 1 : 0;
      return n++;
    },
    count: () => n,
    x: i => X[i],
    y: i => Y[i],
    z: i => Z[i],
    arrays: () => ({ n, X, Y, Z, R, NV, OC })
  };
}

function visibility(C, o) {
  o = o || {};
  const { n, X, Y, Z, R, NV, OC } = C.arrays(),
    vis = new Uint8Array(n);
  if (o.all) {
    vis.fill(1);
    return vis;
  }
  /* The depth picture is small (half the art resolution), and an occluder is drawn a pixel bigger all round than it is, so that a
     wall of them comes out whole; the push-back then takes two pixels off every edge. What is left over is one pixel of margin, and
     that margin is what lets one eye position speak for the ones between it and the next: an occluder at depth a hides a place at
     depth b only if the two cannot slide by more than that pixel across each other in half a step of the eye (1/a - 1/b small).
     Far things slide little, so they are tried from every second position only. */
  // (the depth picture is drawn through the same fisheye as the page: lens units, and distance from the eye for depth)
  const f = o.f || 170,
    TH = CP.C.tanHMax * 1.1, // half the picture, in lens units: the widest any window gives, its border of spare pixels, and room to spare
    TV = CP.C.tanVMax * 1.06,
    lensR = CP.lensR,
    THMAX = CP.lensTh(Math.hypot(TH, TV)),
    W = Math.ceil(2 * f * TH),
    H = Math.ceil(2 * f * TV),
    zb = new Float32Array(W * H),
    tmp = new Float32Array(W * H),
    k = 2,
    nearOcc = o.nearOcc || 10,
    stepDeg = o.step || 1,
    Cc = CP.C,
    na = Math.max(2, Math.round((2 * Cc.azRange) / (stepDeg * CP.RAD)) + 1),
    ne = Math.max(2, Math.round((Cc.elUp + Cc.elDown) / (stepDeg * CP.RAD)) + 1),
    half = (Cc.R * stepDeg * CP.RAD * Math.SQRT2) / 2,
    tauNear = 1 / (f * half),
    tauFar = 1 / (f * half * 2),
    pi = new Int32Array(n),
    pd = new Float32Array(n),
    solids = o.solids,
    FAR = 150;
  // which solids are far (tried from every third eye position)
  const far = new Uint8Array(solids.length),
    sr = new Float32Array(solids.length);
  solids.forEach((s, i) => {
    sr[i] = Math.hypot(s.h[0], s.h[1], s.h[2]) + s.res;
    far[i] = Math.hypot(s.c[0], s.c[2]) - sr[i] > FAR ? 1 : 0;
  });
  for (let ia = 0; ia < na; ia++)
    for (let ie = 0; ie < ne; ie++) {
      const coarse = ia % 2 === 0 && ie % 2 === 0,
        az = Cc.az0 + ((ia / (na - 1)) * 2 - 1) * Cc.azRange,
        el = Cc.el0 - Cc.elDown + (ie / (ne - 1)) * (Cc.elUp + Cc.elDown),
        P = CP.pose(az, el),
        ex = P.eye[0],
        ey = P.eye[1],
        ez = P.eye[2],
        r0 = P.right[0],
        r1 = P.right[1],
        r2 = P.right[2],
        u0 = P.up[0],
        u1 = P.up[1],
        u2 = P.up[2],
        f0 = P.fwd[0],
        f1 = P.fwd[1],
        f2 = P.fwd[2];
      zb.fill(1e9);
      const todo = [];
      for (let si = 0; si < solids.length; si++) {
        if (far[si] && !coarse) continue;
        const s = solids[si],
          dx = s.c[0] - ex,
          dy = s.c[1] - ey,
          dz = s.c[2] - ez,
          d = f0 * dx + f1 * dy + f2 * dz,
          rad = sr[si];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > rad) {
          // (is any of its bounding sphere in the picture? its middle in lens units, and its angular size there, with room)
          const cx0 = r0 * dx + r1 * dy + r2 * dz,
            cy0 = u0 * dx + u1 * dy + u2 * dz,
            rho = Math.hypot(cx0, cy0),
            th = Math.atan2(rho, d),
            al = Math.asin(Math.min(1, rad / dist)) * 1.3;
          if (th - al > THMAX) continue;
          if (th < 1.4) {
            const g = rho > 1e-9 ? lensR(th) / rho : 1 / d,
              ca = Math.cos(CP.C.k * Math.min(1.5, th + al)),
              rl = al / (ca * ca); // (the most a lens unit can stretch over that angle, times the angle)
            if (Math.abs(cx0 * g) - rl > TH || Math.abs(cy0 * g) - rl > TV) continue;
          }
        }
        todo.push(si);
        for (let i = s.start, e = s.start + s.count; i < e; i++) {
          const cx = X[i] - ex,
            cy = Y[i] - ey,
            cz = Z[i] - ez,
            q = i * 3,
            facing = -(cx * NV[q] + cy * NV[q + 1] + cz * NV[q + 2]) / 127;
          pi[i] = -1;
          if (facing <= 0) continue;
          const dist2 = cx * cx + cy * cy + cz * cz,
            dep = Math.sqrt(dist2); // (depth is distance from the eye, as on the page)
          if (dep < 0.6) continue;
          const lx = r0 * cx + r1 * cy + r2 * cz,
            ly = u0 * cx + u1 * cy + u2 * cz,
            rho = Math.hypot(lx, ly),
            th = Math.atan2(rho, f0 * cx + f1 * cy + f2 * cz);
          if (th > 1.45) continue;
          const g = rho > 1e-9 ? lensR(th) / rho : 1 / dep,
            sx = W * 0.5 + f * lx * g,
            sy = H * 0.5 + f * ly * g;
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          const ix = sx | 0,
            iy = sy | 0,
            p = iy * W + ix;
          pi[i] = p;
          pd[i] = dep;
          if (!OC[i] || dep < nearOcc) continue;
          if (facing * facing < dist2 * 0.04) continue; // (edge-on: it would be drawn far wider than it is)
          const side = (f * R[i]) / dep, // (the fisheye never draws a thing smaller than this: the occluder errs small)
            h = side < 0.7 ? 0 : side > 9 ? 5 : Math.round(side * 0.5);
          if (h < 1) {
            if (dep < zb[p]) zb[p] = dep;
          } else {
            const x0 = ix - h < 0 ? 0 : ix - h,
              x1 = ix + h >= W ? W - 1 : ix + h,
              y0 = iy - h < 0 ? 0 : iy - h,
              y1 = iy + h >= H ? H - 1 : iy + h;
            for (let y = y0; y <= y1; y++) {
              const row = y * W;
              for (let x = x0; x <= x1; x++) if (dep < zb[row + x]) zb[row + x] = dep;
            }
          }
        }
      }
      // push the depth picture back by k pixels all round (the farthest of the neighbourhood)
      for (let y = 0; y < H; y++) {
        const row = y * W;
        for (let x = 0; x < W; x++) {
          let m = 0;
          const a = x - k < 0 ? 0 : x - k,
            b = x + k >= W ? W - 1 : x + k;
          for (let q = a; q <= b; q++) if (zb[row + q] > m) m = zb[row + q];
          tmp[row + x] = m;
        }
      }
      for (let x = 0; x < W; x++)
        for (let y = 0; y < H; y++) {
          let m = 0;
          const a = y - k < 0 ? 0 : y - k,
            b = y + k >= H ? H - 1 : y + k;
          for (let q = a; q <= b; q++) if (tmp[q * W + x] > m) m = tmp[q * W + x];
          zb[y * W + x] = m;
        }
      for (let t = 0; t < todo.length; t++) {
        const s = solids[todo[t]],
          tau = far[todo[t]] ? tauFar : tauNear;
        for (let i = s.start, e = s.start + s.count; i < e; i++) {
          if (vis[i] || pi[i] < 0) continue;
          const z = zb[pi[i]],
            d = pd[i];
          if (z >= d * 0.985 - 0.25 || 1 / z - 1 / d > tau) vis[i] = 1;
        }
      }
    }
  return vis;
}

module.exports = { makeCands, visibility };
