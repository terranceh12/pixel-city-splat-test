/* The viewport: a WebGL2 host for the toolkit's splats.
   Each splat is one instanced quad; its covariance is carried to the screen as the toolkit's own renderer does it. Solid splats are
   cut hard at half strength and written with depth (no sorting needed); glows are added on top. The picture is drawn at twice the art
   resolution, resolved to the palette by the toolkit's PixelLook shader, and blown up in whole pixels. */
(function () {
  'use strict';
  const PACK = window.NEON_PACK,
    META = PACK.meta,
    CP = CamPath,
    PAL = NeonPalette,
    SH = NeonShaders,
    canvas = document.getElementById('view'),
    note = document.getElementById('note'),
    say = s => {
      if (note) note.textContent = s;
    };
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance'
  });
  if (!gl) {
    say('This scene needs WebGL2, which this browser did not provide.');
    return;
  }
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x),
    sstep = (a, b, x) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    },
    hash = x => {
      const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

  // ---------------- programs ----------------
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {},
      n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i),
        name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  const withDef = (src, d) => src.replace('#version 300 es', '#version 300 es\n#define ' + d);
  let P_SOLID, P_GLOW, P_SKY, P_RES;
  try {
    // (?moondbg: faces the moon lights drawn green, faces in the city's shadow red, to check the shadows while building)
    const vs = /[?&]moondbg/.test(location.search) ? withDef(SH.splatVS, 'MOONDBG') : SH.splatVS;
    P_SOLID = program(vs, SH.splatFS, { 1: 'a_p', 2: 'a_a', 3: 'a_m', 4: 'a_n' });
    P_GLOW = program(withDef(SH.splatVS, 'ADDITIVE'), withDef(SH.splatFS, 'ADDITIVE'));
    P_SKY = program(SH.quadVS, SH.skyFS);
    P_RES = program(SH.quadVS, SH.resolveFS);
  } catch (e) {
    say(String(e.message || e));
    window.NEON_ERROR = String(e.message || e);
    throw e;
  }

  // ---------------- the splats ----------------
  const corner = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corner);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const quadVAO = gl.createVertexArray();
  gl.bindVertexArray(quadVAO);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const groups = META.groups;
  let instBuf = null;

  async function inflate(b64) {
    const s = atob(b64),
      bin = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function expand(raw) {
    const N = META.N,
      rows = new Float32Array(N * 16);
    let at = 0;
    const plane16 = () => {
      const o = new Uint16Array(N);
      let p = 0;
      for (let i = 0; i < N; i++) {
        p = (p + raw[at + i] + (raw[at + N + i] << 8)) & 65535;
        o[i] = p;
      }
      at += N * 2;
      return o;
    };
    const px = plane16(),
      py = plane16(),
      pz = plane16(),
      ax = new Int8Array(raw.buffer, raw.byteOffset + at, N * 3);
    at += N * 3;
    const sg = raw.subarray(at, at + N * 2);
    at += N * 2;
    const pl = raw.subarray(at, at + N);
    at += N;
    const al = raw.subarray(at, at + N);
    at += N;
    const kd = raw.subarray(at, at + N);
    at += N;
    const fg = raw.subarray(at, at + N);
    at += N;
    const an = [plane16(), plane16(), plane16(), plane16()],
      SIG = new Float32Array(256);
    for (let i = 0; i < 256; i++) SIG[i] = META.sigLo * Math.exp((i / 255) * META.sigK);
    for (const g of groups) {
      const lo = g.lo,
        sz = g.sz,
        alo = g.alo,
        asz = g.asz;
      for (let i = g.start; i < g.start + g.count; i++) {
        const o = i * 16;
        rows[o] = lo[0] + (px[i] / 65535) * sz[0];
        rows[o + 1] = lo[1] + (py[i] / 65535) * sz[1];
        rows[o + 2] = lo[2] + (pz[i] / 65535) * sz[2];
        rows[o + 3] = al[i] === 255 ? 3 : al[i] / 254;
        rows[o + 4] = ax[i * 3] / 127;
        rows[o + 5] = ax[i * 3 + 1] / 127;
        rows[o + 6] = ax[i * 3 + 2] / 127;
        rows[o + 7] = SIG[sg[i * 2]];
        rows[o + 8] = SIG[sg[i * 2 + 1]];
        rows[o + 9] = pl[i];
        rows[o + 10] = kd[i];
        rows[o + 11] = fg[i];
        rows[o + 12] = alo[0] + (an[0][i] / 65535) * asz[0];
        rows[o + 13] = alo[1] + (an[1][i] / 65535) * asz[1];
        rows[o + 14] = alo[2] + (an[2][i] / 65535) * asz[2];
        rows[o + 15] = alo[3] + (an[3][i] / 65535) * asz[3];
      }
    }
    return rows;
  }
  function upload(rows) {
    instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rows, gl.STATIC_DRAW);
    for (const g of groups) {
      g.vao = gl.createVertexArray();
      gl.bindVertexArray(g.vao);
      if (g.pass === 1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, corner);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      for (let k = 0; k < 4; k++) {
        gl.enableVertexAttribArray(1 + k);
        gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, 64, g.start * 64 + k * 16);
        gl.vertexAttribDivisor(1 + k, g.pass === 1 ? 1 : 0);
      }
    }
    gl.bindVertexArray(null);
  }

  // ---------------- targets ----------------
  const T = { aw: 0, ah: 0, px: 1, ov: 8 },
    MAXPT = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
  function tex(w, h, internal, format, type) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3),
      W = Math.max(64, Math.floor(canvas.clientWidth * dpr)),
      H = Math.max(64, Math.floor(canvas.clientHeight * dpr));
    if (W === canvas.width && H === canvas.height && T.scene) return;
    canvas.width = W;
    canvas.height = H;
    // whole screen pixels to an art pixel, aiming at about 360 art pixels of height (fewer on a narrow, tall window)
    const want = FORCE.art || 360;
    let px = Math.max(1, Math.round(H / want));
    while (H / px > want * 1.3) px++;
    while (px > 1 && W / px < 200) px--;
    T.px = px;
    T.aw = Math.ceil(W / px);
    T.ah = Math.ceil(H / px);
    for (const k of ['c0', 'c1', 'z', 'out']) if (T[k]) gl.deleteTexture(T[k]);
    if (T.scene) gl.deleteFramebuffer(T.scene);
    if (T.art) gl.deleteFramebuffer(T.art);
    const sw = (T.aw + 2 * T.ov) * 2,
      sh = (T.ah + 2 * T.ov) * 2;
    T.sw = sw;
    T.sh = sh;
    T.c0 = tex(sw, sh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    T.c1 = tex(sw, sh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    T.z = tex(sw, sh, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
    T.out = tex(T.aw, T.ah, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    T.scene = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.c0, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, T.c1, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, T.z, 0);
    T.art = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.art);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.out, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---------------- light from the streets below ----------------
  const FL = META.floor,
    FN = FL.n,
    flAcc = new Float32Array(FN * FN * 3),
    flPix = new Uint8Array(FN * FN * 4),
    flTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, flTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, FN, FN, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  function floorLights(t) {
    flAcc.fill(0);
    const [x0, z0, w, d] = FL.rect,
      kx = FN / w,
      kz = FN / d;
    for (const L of FL.lights) {
      let x = L.x,
        z = L.z,
        I = L.i;
      if (L.f === 0) I *= 0.75 + 0.25 * Math.sin(t * L.s + L.ph);
      else if (L.f === 1) I *= (hash(Math.floor(t * L.s * 2.5) + L.ph * 13) > 0.25 ? 1 : 0.55) * (0.85 + 0.15 * Math.sin(t * 0.5 + L.ph));
      else if (L.f === 2) I *= 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * L.s + L.ph), 3);
      else if (L.f === 3) {
        // traffic far below: a light that runs along a street and comes round again
        const u = (t * L.s + L.ph) % 1;
        x += L.mx * u;
        z += L.mz * u;
        I *= Math.sin(u * Math.PI);
      }
      const cx = (x - x0) * kx,
        cz = (z - z0) * kz,
        r = L.r * kx,
        a0 = Math.max(0, Math.floor(cx - r * 2)),
        a1 = Math.min(FN - 1, Math.ceil(cx + r * 2)),
        b0 = Math.max(0, Math.floor(cz - r * 2)),
        b1 = Math.min(FN - 1, Math.ceil(cz + r * 2)),
        q = 1 / (r * r);
      for (let b = b0; b <= b1; b++)
        for (let a = a0; a <= a1; a++) {
          const dx = a + 0.5 - cx,
            dz = b + 0.5 - cz,
            g = I * Math.exp(-(dx * dx + dz * dz) * q),
            o = (b * FN + a) * 3;
          flAcc[o] += L.c[0] * g;
          flAcc[o + 1] += L.c[1] * g;
          flAcc[o + 2] += L.c[2] * g;
        }
    }
    for (let i = 0, j = 0; i < FN * FN * 3; i += 3, j += 4) {
      flPix[j] = Math.min(255, flAcc[i] * 255);
      flPix[j + 1] = Math.min(255, flAcc[i + 1] * 255);
      flPix[j + 2] = Math.min(255, flAcc[i + 2] * 255);
      flPix[j + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, flTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FN, FN, gl.RGBA, gl.UNSIGNED_BYTE, flPix);
  }

  // ---------------- things that move ----------------
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const paths = (META.paths || []).map(pts => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    return { pts, cum, len: cum[cum.length - 1] };
  });
  function along(path, s, out) {
    s = ((s % path.len) + path.len) % path.len;
    let i = 1;
    while (i < path.cum.length - 1 && path.cum[i] < s) i++;
    const a = path.pts[i - 1],
      b = path.pts[i],
      f = (s - path.cum[i - 1]) / Math.max(1e-6, path.cum[i] - path.cum[i - 1]);
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + (b[2] - a[2]) * f;
  }
  /* a ship's place: nose down its own -Z, carried along a straight lane from a to b. It fades out of the haze at one end and back
     into it at the other, waits, and comes again. */
  const ships = (META.ships || []).map((s, i) => {
    if (s.lift || s.park) {
      // a lift car (no lane, only a shaft: it keeps the way it faces and rides up and down), or a ship parked
      const cy = Math.cos(s.yaw || 0),
        sy = Math.sin(s.yaw || 0),
        sc = s.sc || 1,
        y = s.park ? s.y : s.y0,
        M = new Float32Array([cy * sc, 0, -sy * sc, 0, 0, sc, 0, 0, sy * sc, 0, cy * sc, 0, s.x, y, s.z, 1]);
      return { s, len: 1, f: [-sy, 0, -cy], r: [cy, 0, -sy], u: [0, 1, 0], M, sc, tpl: META.tpl[s.tpl], cycle: s.per || 1, fade: 0, on: true, pos: [s.x, y, s.z], i };
    }
    const d = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]],
      len = Math.hypot(d[0], d[1], d[2]),
      f = [d[0] / len, d[1] / len, d[2] / len],
      rl = Math.hypot(f[2], f[0]) || 1,
      r = [-f[2] / rl, 0, f[0] / rl], // f x up
      u = [-(f[1] * r[2]) + 0, f[2] * r[0] - f[0] * r[2], f[1] * r[0]], // (-f) x r, written out below properly
      M = new Float32Array(16);
    // up = r x f (so that x = r, y = up, z = -f is right-handed)
    u[0] = r[1] * f[2] - r[2] * f[1];
    u[1] = r[2] * f[0] - r[0] * f[2];
    u[2] = r[0] * f[1] - r[1] * f[0];
    const sc = s.sc || 1;
    M[0] = r[0] * sc;
    M[1] = r[1] * sc;
    M[2] = r[2] * sc;
    M[4] = u[0] * sc;
    M[5] = u[1] * sc;
    M[6] = u[2] * sc;
    M[8] = -f[0] * sc;
    M[9] = -f[1] * sc;
    M[10] = -f[2] * sc;
    M[15] = 1;
    return { s, len, f, r, u, M, sc, tpl: META.tpl[s.tpl], cycle: len / s.sp + (s.gap || 20), fade: 0, on: false, pos: [0, 0, 0], i };
  });
  function placeShips(t) {
    for (const h of ships) {
      const s = h.s;
      if (s.park) continue;
      if (s.lift) {
        // up and down the shaft, stopping a while at two floors on the way and at each end
        const u = (((t / s.per + s.ph) % 1) + 1) % 1,
          HF = 0.08,
          LF = (1 - 4 * HF) / 3;
        let x = u < 0.5 ? u * 2 : 2 - u * 2,
          e = 1;
        for (let k = 0; k < 3; k++) {
          x -= HF;
          if (x <= 0) {
            e = k / 3;
            break;
          }
          if (x < LF) {
            const f = x / LF;
            e = (k + f * f * (3 - 2 * f)) / 3;
            break;
          }
          x -= LF;
        }
        const y = s.y0 + (s.y1 - s.y0) * e;
        h.pos[1] = h.M[13] = y;
        continue;
      }
      const tt = (((t + s.u0 * h.cycle) % h.cycle) + h.cycle) % h.cycle,
        dist = tt * s.sp;
      h.on = dist <= h.len;
      if (!h.on) continue;
      const u = dist / h.len,
        edge = Math.min(u, 1 - u) * h.len,
        bob = Math.sin(t * 0.31 + h.i * 1.7) * (s.bob || 0);
      h.fade = 1 - sstep(0, s.port || 26, edge);
      h.pos[0] = s.a[0] + h.f[0] * dist;
      h.pos[1] = s.a[1] + h.f[1] * dist + bob;
      h.pos[2] = s.a[2] + h.f[2] * dist;
      h.M[12] = h.pos[0];
      h.M[13] = h.pos[1];
      h.M[14] = h.pos[2];
    }
  }
  /* a searchlight: its beam turns about its foot */
  const beams = (META.beams || []).map(b => ({ b, M: new Float32Array(16) }));
  function placeBeams(t) {
    for (const h of beams) {
      const b = h.b,
        yaw = b.yaw + Math.sin(t * b.sp + b.ph) * b.sweep,
        tilt = b.tilt + Math.sin(t * b.sp * 0.63 + b.ph * 2.1) * b.nod,
        cy = Math.cos(yaw),
        sy = Math.sin(yaw),
        ct = Math.cos(tilt),
        st = Math.sin(tilt),
        M = h.M;
      // the beam is modelled up its own +Y; tilt it about X, then turn it about Y
      M[0] = cy;
      M[1] = 0;
      M[2] = -sy;
      M[4] = sy * st;
      M[5] = ct;
      M[6] = cy * st;
      M[8] = sy * ct;
      M[9] = -st;
      M[10] = cy * ct;
      M[12] = b.p[0];
      M[13] = b.p[1];
      M[14] = b.p[2];
      M[15] = 1;
    }
  }
  /* lamps that light the splats near them: signs behind buildings that change colour, headlights going along the roads, the ships */
  const lamps = [],
    v3 = [0, 0, 0];
  function gatherLamps(t) {
    lamps.length = 0;
    for (const L of META.lights || []) {
      if (L.k === 'sign') {
        const step = Math.floor(t / L.per + L.ph),
          c = L.cols[((step % L.cols.length) + L.cols.length) % L.cols.length],
          fl = hash(Math.floor(t * 3) + L.ph * 31) > L.fl ? 1 : 0.6;
        lamps.push({ x: L.p[0], y: L.p[1], z: L.p[2], r: L.r, c0: c[0] * L.i * fl, c1: c[1] * L.i * fl, c2: c[2] * L.i * fl });
      } else if (L.k === 'sweep') {
        const P = paths[L.path];
        along(P, t * L.sp + L.off, v3);
        lamps.push({ x: v3[0], y: v3[1] + (L.h || 0.6), z: v3[2], r: L.r, c0: L.c[0] * L.i, c1: L.c[1] * L.i, c2: L.c[2] * L.i });
      } else if (L.k === 'pulse') {
        const w = 0.5 + 0.5 * Math.sin(t * L.sp + L.ph);
        lamps.push({ x: L.p[0], y: L.p[1], z: L.p[2], r: L.r, c0: L.c[0] * L.i * w, c1: L.c[1] * L.i * w, c2: L.c[2] * L.i * w });
      }
    }
    for (const h of ships) {
      if (!h.on || !h.tpl.lights) continue;
      for (const L of h.tpl.lights) {
        const k = (1 - h.fade) * (0.85 + 0.15 * Math.sin(t * 7.1 + h.i));
        lamps.push({
          x: h.pos[0] + (h.r[0] * L.p[0] + h.u[0] * L.p[1] - h.f[0] * L.p[2]) * h.sc,
          y: h.pos[1] + (h.r[1] * L.p[0] + h.u[1] * L.p[1] - h.f[1] * L.p[2]) * h.sc,
          z: h.pos[2] + (h.r[2] * L.p[0] + h.u[2] * L.p[1] - h.f[2] * L.p[2]) * h.sc,
          r: L.r * h.sc,
          c0: L.c[0] * k,
          c1: L.c[1] * k,
          c2: L.c[2] * k
        });
      }
    }
  }
  const lp = new Float32Array(24),
    lc = new Float32Array(18),
    pick = [];
  function lampsFor(x, y, z, rad) {
    pick.length = 0;
    for (let i = 0; i < lamps.length; i++) {
      const L = lamps[i],
        d = Math.hypot(L.x - x, L.y - y, L.z - z),
        reach = L.r + rad;
      if (d < reach) pick.push([(L.c0 + L.c1 + L.c2) * (1 - d / reach), L]);
    }
    if (pick.length > 6) pick.sort((a, b) => b[0] - a[0]);
    const n = Math.min(6, pick.length);
    for (let i = 0; i < n; i++) {
      const L = pick[i][1];
      lp[i * 4] = L.x;
      lp[i * 4 + 1] = L.y;
      lp[i * 4 + 2] = L.z;
      lp[i * 4 + 3] = L.r;
      lc[i * 3] = L.c0;
      lc[i * 3 + 1] = L.c1;
      lc[i * 3 + 2] = L.c2;
    }
    return n;
  }

  // ---------------- the eye ----------------
  const FORCE = { art: 0 },
    qs = new URLSearchParams(location.search),
    EYE = { tx: 0, ty: 0, x: 0, y: 0, last: performance.now() - 4000, held: null, time: null };
  if (qs.has('art')) FORCE.art = +qs.get('art');
  if (qs.has('mx') || qs.has('my')) EYE.held = [+(qs.get('mx') || 0), +(qs.get('my') || 0)];
  if (qs.has('t')) EYE.time = +qs.get('t');
  const DEBUG_CAM = qs.has('cam') ? qs.get('cam').split(',').map(Number) : null;
  const DEBUG = qs.has('debug') ? document.getElementById('stats') : null,
    PROF = qs.has('prof'),
    SKIP = (qs.get('skip') || '').split(','),
    ONLY = qs.get('only'),
    NOT = qs.get('not'),
    mark = name => {
      if (!PROF) return;
      gl.finish();
      const n = performance.now();
      stats.prof[name] = Math.round(n - stats.profT);
      stats.profT = n;
    };
  const point = e => {
    const r = canvas.getBoundingClientRect();
    EYE.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    EYE.ty = clamp(1 - ((e.clientY - r.top) / r.height) * 2, -1, 1);
    EYE.last = performance.now();
    if (!EYE.moved && performance.now() > 3500) {
      EYE.moved = true;
      document.body.classList.add('seen');
    }
  };
  window.addEventListener('pointermove', point, { passive: true });
  window.addEventListener('pointerdown', point, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    EYE.tx = 0;
    EYE.ty = 0;
  });
  // the arrow keys nudge the eye too
  window.addEventListener('keydown', e => {
    const k = { ArrowLeft: [-0.2, 0], ArrowRight: [0.2, 0], ArrowUp: [0, 0.2], ArrowDown: [0, -0.2] }[e.key];
    if (!k) return;
    EYE.tx = clamp(EYE.tx + k[0], -1, 1);
    EYE.ty = clamp(EYE.ty + k[1], -1, 1);
    EYE.last = performance.now();
    e.preventDefault();
  });
  const STILL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; // (then the eye does not wander by itself)
  const ease = m => Math.sign(m) * Math.pow(Math.abs(m), 1.25);

  // ---------------- a frame ----------------
  const pal3 = new Float32Array(48 * 3);
  PAL.rgb.forEach((c, i) => pal3.set(c, i * 3));
  const LOOK = META.look,
    MOON = LOOK.moon || { dir: [0.8, 0.53, 0.2], col: [0, 0, 0] },
    MOONK = qs.has('moonk') ? +qs.get('moonk') : 1, // (?moonk=4: the moonlight four times as strong, to see its shadows while building)
    NEAR = 0.6,
    FAR = 1400,
    stats = { drawn: 0, groups: 0, ms: 0, fps: 0 };
  let cam = null,
    lens = null;
  // is any of this bounding sphere in the picture? (through the fisheye: its middle in lens units, and its angular size there, with room)
  function sees(x, y, z, rad) {
    const dx = x - cam.eye[0],
      dy = y - cam.eye[1],
      dz = z - cam.eye[2],
      dist = Math.hypot(dx, dy, dz);
    if (dist <= rad + NEAR) return true;
    const d = cam.fwd[0] * dx + cam.fwd[1] * dy + cam.fwd[2] * dz,
      cx = cam.right[0] * dx + cam.right[1] * dy + cam.right[2] * dz,
      cy = cam.up[0] * dx + cam.up[1] * dy + cam.up[2] * dz,
      rho = Math.hypot(cx, cy),
      th = Math.atan2(rho, d),
      al = Math.asin(Math.min(1, rad / dist)) * 1.25;
    if (th - al > lens.thMax) return false;
    if (th > 1.4) return true;
    const g = rho > 1e-9 ? CP.lensR(th) / rho : 1 / d,
      ca = Math.cos(CP.C.k * Math.min(1.5, th + al)),
      rl = al / (ca * ca);
    return Math.abs(cx * g) - rl < lens.tanH && Math.abs(cy * g) - rl < lens.tanV;
  }
  function common(P, t) {
    const u = P.u;
    gl.useProgram(P.p);
    gl.uniform3fv(u.u_eye, cam.eye);
    gl.uniform3fv(u.u_cr, cam.right);
    gl.uniform3fv(u.u_cu, cam.up);
    gl.uniform3fv(u.u_cf, cam.fwd);
    gl.uniform4f(u.u_fog, LOOK.fogY, 1 / LOOK.fogH, LOOK.fogRho, 1 / LOOK.upH);
    gl.uniform1f(u.u_fogC, LOOK.fogC === undefined ? 8 : LOOK.fogC);
    gl.uniform4f(u.u_fade, LOOK.far0, LOOK.far1, LOOK.pool0, LOOK.pool1);
    gl.uniform1f(u.u_fogU, LOOK.fogU || 0);
    if (u.u_k) gl.uniform1f(u.u_k, CP.C.k);
    if (u.u_moonL) {
      gl.uniform3fv(u.u_moonL, MOON.dir);
      gl.uniform3fv(u.u_moonC, MOON.col.map(v => v * MOONK));
    }
    gl.uniform4fv(u.u_haze, LOOK.haze);
    gl.uniform3fv(u.u_warm, LOOK.warm);
    gl.uniform3fv(u.u_fogLo, LOOK.fogLo);
    gl.uniform3fv(u.u_fogHi, LOOK.fogHi);
    gl.uniform4f(u.u_floorRect, FL.rect[0], FL.rect[1], 1 / FL.rect[2], 1 / FL.rect[3]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flTex);
    gl.uniform1i(u.u_floor, 0);
    if (u.u_t) {
      gl.uniform1f(u.u_t, t);
      gl.uniform2f(u.u_focal, T.aw / lens.tanH0, T.ah / lens.tanV0);
      gl.uniform2f(u.u_res, T.sw, T.sh);
      gl.uniform1f(u.u_maxPt, MAXPT);
      gl.uniform2f(u.u_nf, NEAR, FAR);
      gl.uniform1f(u.u_dil, LOOK.dil);
      gl.uniform1f(u.u_linFar, FAR);
      gl.uniform3fv(u.u_pal, pal3);
    }
  }
  function drawList(P, pass, t) {
    const u = P.u;
    let lastM = null;
    let lastFog = -1;
    const one = (g, M, sc, fade, x, y, z, rad, lit, fog) => {
      if (!sees(x, y, z, rad)) return;
      if ((ONLY && g.name.indexOf(ONLY) < 0) || (NOT && g.name.indexOf(NOT) >= 0)) return;
      if (M !== lastM) {
        gl.uniformMatrix4fv(u.u_model, false, M);
        gl.uniform1f(u.u_mscale, sc);
        lastM = M;
      }
      gl.uniform1f(u.u_gfade, fade);
      fog = fog === undefined ? 1 : fog;
      if (fog !== lastFog && u.u_gfog) {
        gl.uniform1f(u.u_gfog, fog);
        lastFog = fog;
      }
      if (pass === 0) {
        const n = lit ? lampsFor(x, y, z, rad) : 0;
        gl.uniform1i(u.u_nl, n);
        if (n) {
          gl.uniform4fv(u.u_lp, lp);
          gl.uniform3fv(u.u_lc, lc);
        }
      }
      gl.bindVertexArray(g.vao);
      if (pass === 1) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, g.count);
      else gl.drawArrays(gl.POINTS, 0, g.count);
      stats.drawn += g.count;
      stats.groups++;
    };
    for (const g of groups) {
      if (g.pass !== pass || g.tpl || !g.count) continue;
      one(g, IDENT, 1, 0, g.bs[0], g.bs[1], g.bs[2], g.bs[3], !g.unlit);
    }
    for (const h of ships) {
      if (!h.on || h.fade > 0.995) continue;
      const g = groups[pass === 0 ? h.tpl.solid : h.tpl.glow];
      if (!g || !g.count) continue;
      one(g, h.M, h.sc, h.fade, h.pos[0], h.pos[1], h.pos[2], h.tpl.rad * h.sc, false, h.s.fogK);
    }
    if (pass === 1)
      for (const h of beams) {
        const g = groups[h.b.g];
        one(g, h.M, 1, 0, h.b.p[0], h.b.p[1] + h.b.len * 0.5, h.b.p[2], h.b.len, false);
      }
  }
  let t0 = performance.now(),
    prev = t0,
    acc = 0,
    frames = 0;
  function frame(now) {
    resize();
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    const t = EYE.time !== null ? EYE.time : (now - t0) / 1000;
    // where the eye is: eased toward the pointer; left alone a while, it drifts
    let gx = EYE.tx,
      gy = EYE.ty;
    if (!STILL && now - EYE.last > 9000) {
      const w = Math.min(1, (now - EYE.last - 9000) / 6000);
      gx = 0.3 * Math.sin(t * 0.11) * w;
      gy = 0.22 * Math.sin(t * 0.077 + 0.6) * w;
    }
    if (EYE.held) {
      EYE.x = EYE.held[0];
      EYE.y = EYE.held[1];
    } else {
      const k = 1 - Math.exp(-dt * 3.2);
      EYE.x += (ease(gx) - EYE.x) * k;
      EYE.y += (ease(gy) - EYE.y) * k;
    }
    const ae = CP.hover(EYE.x, EYE.y);
    cam = CP.pose(ae[0], ae[1]);
    if (DEBUG_CAM) {
      // (for looking at things up close while building: ?cam=eyeX,eyeY,eyeZ,atX,atY,atZ. What no hover pose can see is not there)
      const e = DEBUG_CAM.slice(0, 3),
        f0 = [DEBUG_CAM[3] - e[0], DEBUG_CAM[4] - e[1], DEBUG_CAM[5] - e[2]],
        fl = Math.hypot(f0[0], f0[1], f0[2]),
        f = f0.map(v => v / fl),
        rl = Math.hypot(f[2], f[0]),
        r = [-f[2] / rl, 0, f[0] / rl],
        u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      cam = { eye: e, right: r, up: u, fwd: f };
    }
    lens = CP.lens(T.aw / T.ah);
    lens.tanH0 = lens.tanH; // (the picture proper; with its border of spare pixels it takes in a little more)
    lens.tanV0 = lens.tanV;
    lens.tanH *= (T.aw + 2 * T.ov) / T.aw;
    lens.tanV *= (T.ah + 2 * T.ov) / T.ah;
    lens.thMax = CP.lensTh(Math.hypot(lens.tanH, lens.tanV)); // (the picture's corners, as an angle off the axis)
    stats.drawn = stats.groups = 0;
    stats.prof = {};
    stats.profT = performance.now();
    // light that plays over the city changes six times a second, like a hand-animated sprite, so that surfaces hold their
    // colours between changes instead of shimmering
    const tq = Math.floor(t * 6) / 6;
    floorLights(tq);
    placeShips(t);
    placeBeams(t);
    gatherLamps(tq);
    mark('cpu');

    gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene);
    gl.viewport(0, 0, T.sw, T.sh);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.depthMask(true);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 1]);
    gl.clearBufferfv(gl.COLOR, 1, [1, 0, 0, 1]);
    gl.clearBufferfv(gl.DEPTH, 0, [1]);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    common(P_SOLID, t);
    if (SKIP.indexOf('solid') < 0) drawList(P_SOLID, 0, t);
    mark('solid');
    // the depths and the night, wherever nothing was drawn
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    common(P_SKY, t);
    gl.uniform2f(P_SKY.u.u_tan, lens.tanH, lens.tanV);
    gl.uniform1f(P_SKY.u.u_time, t);
    gl.uniform1f(P_SKY.u.u_pxa, (2 * lens.tanV0) / T.ah); // (about the angle one art pixel spans, in the middle)
    gl.uniform1f(P_SKY.u.u_sky, LOOK.sky === undefined ? 1 : LOOK.sky);
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    mark('sky');
    // glows
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    common(P_GLOW, t);
    if (SKIP.indexOf('glow') < 0) drawList(P_GLOW, 1, t);
    mark('glow');
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    // to the palette, at the art resolution
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.art);
    gl.viewport(0, 0, T.aw, T.ah);
    const R = P_RES.u;
    gl.useProgram(P_RES.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, T.c0);
    gl.uniform1i(R.u_scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, T.c1);
    gl.uniform1i(R.u_depth, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, T.z);
    gl.uniform1i(R.u_zbuf, 2);
    gl.uniform3fv(R.u_pal, pal3);
    if (R.u_out) gl.uniform3fv(R.u_out, pal3);
    gl.uniform1i(R.u_n, PAL.rgb.length);
    gl.uniform1f(R.u_grade, 0);
    gl.uniform1f(R.u_dither, LOOK.dither);
    gl.uniform1f(R.u_rim, LOOK.rim);
    gl.uniform2i(R.u_ov, T.ov, T.ov);
    gl.uniform2f(R.u_nf, NEAR, FAR);
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);

    // whole pixels to the screen
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.art);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, T.aw, T.ah, 0, 0, T.aw * T.px, T.ah * T.px, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    mark('resolve');

    acc += dt;
    frames++;
    if (acc > 0.5) {
      stats.fps = frames / acc;
      stats.ms = (acc / frames) * 1000;
      acc = 0;
      frames = 0;
      if (DEBUG) DEBUG.textContent = stats.fps.toFixed(0) + ' fps\n' + stats.drawn.toLocaleString() + ' splats in ' + stats.groups + ' groups\n' + T.aw + ' x ' + T.ah + ' art px, x' + T.px;
    }
    stats.frame = (stats.frame || 0) + 1;
    stats.t = t;
    requestAnimationFrame(frame);
  }

  window.NEON = {
    stats,
    T,
    gl,
    maxPt: MAXPT,
    meta: META,
    hold(mx, my, t) {
      EYE.held = mx === null || mx === undefined ? null : [mx, my];
      EYE.time = t === undefined ? null : t;
    }
  };
  (async () => {
    say('unpacking ' + META.N.toLocaleString() + ' splats');
    const tm = (window.NEON.timing = { start: Math.round(performance.now()) });
    const raw = await inflate(PACK.b64);
    tm.inflate = Math.round(performance.now());
    PACK.b64 = null;
    const rows = expand(raw);
    tm.expand = Math.round(performance.now());
    upload(rows);
    tm.upload = Math.round(performance.now());
    resize();
    say('');
    document.body.classList.add('ready');
    window.NEON.ready = true;
    requestAnimationFrame(frame);
  })().catch(e => {
    say('could not start: ' + (e.message || e));
    window.NEON_ERROR = String(e.message || e);
  });
})();
