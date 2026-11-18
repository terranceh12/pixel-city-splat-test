/* GLSL for the viewport. The marker in the resolve shader is replaced by the toolkit's own palette resolve (src/pixel-look.js, PixelLook.glsl), put in at build time. */
const NeonShaders = (() => {
  const FOG = `
uniform vec4 u_fog;        // y0, 1 / scale height, density at y0, 1 / uplight height
uniform vec4 u_fade;       // far fade start, far fade end, fog pool start, fog pool end (radii about the bend)
uniform float u_fogU;      // a thin even haze everywhere, by distance
uniform vec3 u_fogLo;
uniform vec3 u_fogHi;
uniform vec4 u_haze;       // the colour far things take on (the air between, blue-violet), and how fast with distance
uniform vec3 u_warm;       // the light of whatever lies under the fog
uniform sampler2D u_floor; // the light that comes up from the streets far below
uniform vec4 u_floorRect;  // x0, z0, 1 / width, 1 / depth
float fogTau(vec3 eye, vec3 p) {
  vec3 d = p - eye;
  float L = length(d);
  float a = max((eye.y - u_fog.x) * u_fog.y, -8.0);
  float b = max((p.y - u_fog.x) * u_fog.y, -8.0);
  float k = b - a;
  float e = abs(k) > 1e-3 ? (exp(-a) - exp(-b)) / k : exp(-a);
  return u_fog.z * L * e + u_fogU * L;
}
vec3 floorLight(vec2 xz) { return textureLod(u_floor, (xz - u_floorRect.xy) * u_floorRect.zw, 0.0).rgb; }
vec3 fogColour(vec3 p, vec3 fl) {
  float h = clamp((p.y - u_fog.x) * u_fog.y * 0.22, 0.0, 1.0);
  float pool = 1.0 - smoothstep(u_fade.z, u_fade.w, length(p.xz));
  float deep = clamp(0.3 - (p.y - u_fog.x) * u_fog.y * 0.4, 0.0, 1.0);   // 0 above the fog's level, 1 well down in it
  return (mix(u_fogLo, u_fogHi, h) + fl * (1.0 - 0.7 * h) + u_warm * (deep * deep)) * pool;
}
float hazeAt(float dist) { return 1.0 - exp(-u_haze.w * dist); }`;

  const splatVS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#ifdef ADDITIVE
layout(location = 0) in vec2 a_corner;
#endif
layout(location = 1) in vec4 a_p;   // x, y, z, alpha
layout(location = 2) in vec4 a_a;   // axis, sigma along it
layout(location = 3) in vec4 a_m;   // sigma across, palette index, kind, flags
layout(location = 4) in vec4 a_n;   // phase, speed, range, extra
uniform mat4 u_model;
uniform float u_mscale;
uniform vec3 u_eye, u_cr, u_cu, u_cf;
uniform vec2 u_focal, u_res, u_nf;
uniform float u_t, u_dil, u_gfade, u_linFar, u_maxPt;
uniform vec3 u_pal[48];
uniform int u_nl;
uniform vec4 u_lp[6];
uniform vec3 u_lc[6];
${FOG}
#ifdef ADDITIVE
out vec2 v_d;
#else
flat out vec2 v_ctr;
#endif
flat out vec3 v_conic;
flat out vec3 v_col;
flat out vec3 v_aux;
flat out float v_fade;
float hash1(float x) {
  uint n = floatBitsToUint(x * 12.9898 + 0.5);
  n ^= n >> 16; n *= 0x7feb352du; n ^= n >> 15; n *= 0x846ca68bu; n ^= n >> 16;
  return float(n >> 8) / 16777216.0;
}
void main() {
  v_conic = vec3(1.0, 0.0, 1.0); v_col = vec3(0.0); v_aux = vec3(1.0, 0.0, 0.0); v_fade = u_gfade;
#ifdef ADDITIVE
  v_d = vec2(0.0);
#else
  v_ctr = vec2(0.0); gl_PointSize = 1.0;
#endif
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vec3 p = a_p.xyz, axis = a_a.xyz;
  float al = a_p.w, sc = 1.0, bright = 1.0;
  int pal = int(a_m.y + 0.5), kind = int(a_m.z + 0.5), flags = int(a_m.w + 0.5);
  float ph = a_n.x, sp = a_n.y, rg = a_n.z, ex = a_n.w;
  bool em = (flags & 1) != 0;
  if (kind == 1) { float w = 0.62 + 0.38 * sin(u_t * sp + ph); al *= w; bright = w; }
  else if (kind == 2) {            // a window: steady, slowly switched, a flickering screen, or blinking
    int mode = int(sp + 0.5);
    if (mode == 1) {
      float T = 26.0 + 70.0 * fract(ph * 7.13);
      float n = floor(u_t / T + ph * 31.0);
      bright = hash1(ph * 917.0 + n) < 0.8 ? 1.0 : 0.1;
    } else if (mode == 2) {
      bright = 0.5 + 0.6 * hash1(floor(u_t * 9.0 + ph * 50.0) + ph * 100.0);
    } else if (mode == 3) {
      bright = fract(u_t * 0.45 + ph) < 0.5 ? 1.0 : 0.12;
    }
  }
  else if (kind == 3) {            // a light trail: brightness runs along the lane (extra = distance along it)
    float amp = 1.0;
    if (ph >= 10.0) { ph -= 10.0; amp = 0.4; }   // (a steadier line: lift shafts)
    float u = (ex - u_t * sp) / abs(rg) + ph;
    if (rg > 0.0) {
      float w = 0.5 + 0.5 * sin(6.2832 * u), w2 = 0.5 + 0.5 * sin(6.2832 * (u * 2.71 + 0.3));
      bright = 0.6 + 0.5 * w * w + 0.22 * w2 + 0.7 * smoothstep(0.93, 1.0, fract(u * 0.37 + ph * 3.1));
      bright = mix(1.0, bright, amp);
    } else {
      if (fract(u) > 0.07) al = 0.0;   // a lit car going by: a train, a lift
    }
  }
  else if (kind == 4) {            // a beacon
    float w = pow(max(0.0, sin(u_t * sp + ph)), 10.0);
    bright = 0.16 + 1.1 * w; if ((flags & 16) != 0) al *= w;
  }
  else if (kind == 5) {            // plasma: carried along its own axis, swelling or thinning, dying away
    float pr = fract(u_t * sp + ph);
    float fl = 0.75 + 0.25 * hash1(floor(u_t * 14.0) + ph * 31.0);
    p += axis * (pr * rg);
    sc *= max(0.08, 1.0 + pr * ex);
    al *= (1.0 - pr) * (1.0 - pr) * smoothstep(0.0, 0.06, pr) * fl;
  }
  else if (kind == 6) p.y += sin(u_t * sp + ph) * rg;
  else if (kind == 7) { float w = 0.8 + 0.2 * sin(u_t * sp + ph) * sin(u_t * sp * 2.31 + ph * 1.7); al *= w; bright = w; }
  else if (kind == 8) {            // a spark: thrown out along its axis, off to one side, falling, some cycles only
    float cyc = u_t * sp + ph, pr = fract(cyc), id = floor(cyc);
    float r1 = hash1(id + ph * 77.0), r2 = hash1(id * 1.7 + ph * 191.0), r3 = hash1(id * 2.3 + ph * 13.0);
    if (r3 > 0.55) al = 0.0;
    vec3 side = normalize(cross(axis, vec3(0.31, 0.83, 0.47)));
    vec3 side2 = cross(axis, side);
    float ang = r1 * 6.2832;
    p += axis * (pr * rg * (0.5 + r2)) + (side * cos(ang) + side2 * sin(ang)) * (pr * rg * 0.42 * r2) - vec3(0.0, pr * pr * ex, 0.0);
    al *= (1.0 - pr) * (0.55 + 0.45 * hash1(floor(u_t * 24.0) + id + ph));
  }
  else if (kind == 9) {            // drifting (the toolkit's kind 11)
    float x0 = p.x;
    p.x += rg * sin(u_t * sp + p.y * 1.3 + p.z * 0.9 + ph);
    p.y += rg * 0.6 * sin(u_t * sp * 1.3 + x0 * 1.1 + ph);
  }
  else if (kind == 10) {           // a sign: two colours taking turns
    if (fract(u_t * sp + ph) > 0.5) pal = int(ex + 0.5);
    if (rg > 0.5) bright = 0.82 + 0.3 * hash1(floor(u_t * 11.0) + ph * 9.0);
  }
  else if (kind == 11) {           // a bank of haze: drifting, breathing
    p.x += rg * sin(u_t * sp + ph);
    p.z += rg * 0.7 * cos(u_t * sp * 0.83 + ph * 1.9);
    al *= 0.62 + 0.38 * sin(u_t * sp * 2.3 + ph * 3.0);
  }
  else if (kind == 12) {           // dust in the air
    p += vec3(sin(u_t * sp + ph), 0.6 * sin(u_t * sp * 0.71 + ph * 1.7), cos(u_t * sp * 0.89 + ph * 2.3)) * rg;
    al *= 0.45 + 0.55 * sin(u_t * (0.6 + 1.9 * fract(ph * 3.7)) + ph * 5.0);
  }
  else if (kind == 13) {           // rising and thinning (steam)
    float pr = fract(u_t * sp / max(rg, 0.01) + ph);
    p.y += pr * rg;
    p.x += sin(pr * 7.0 + ph * 50.0) * 0.25 * pr;
    al *= (1.0 - pr) * smoothstep(0.0, 0.1, pr);
    sc *= 0.6 + pr * ex;
  }
  if (al < 0.004) return;
  vec3 pw = (u_model * vec4(p, 1.0)).xyz;
  vec3 aw = mat3(u_model) * axis;
  float awl = length(aw);
  aw = awl > 1e-4 ? aw / awl : vec3(0.0, 1.0, 0.0);
  float sa = a_a.w * sc * u_mscale, sq = a_m.x * sc * u_mscale;
  vec3 dv = pw - u_eye;
  vec3 pc = vec3(dot(u_cr, dv), dot(u_cu, dv), dot(u_cf, dv));
  if (pc.z < u_nf.x) return;
  vec3 av = vec3(dot(u_cr, aw), dot(u_cu, aw), dot(u_cf, aw));
  float iz = 1.0 / pc.z;
  vec2 lim = 0.65 * u_res / u_focal;
  vec2 tq = clamp(pc.xy * iz, -lim, lim);
  float j00 = u_focal.x * iz, j11 = u_focal.y * iz, j02 = -u_focal.x * tq.x * iz, j12 = -u_focal.y * tq.y * iz;
  float s2 = sq * sq, D = sa * sa - s2;
  vec2 u2 = vec2(j00 * av.x + j02 * av.z, j11 * av.y + j12 * av.z);
  float dil = u_dil * ((flags & 8) != 0 ? 4.0 : 1.0);
  float A = s2 * (j00 * j00 + j02 * j02) + D * u2.x * u2.x + dil;
  float Bq = s2 * (j02 * j12) + D * u2.x * u2.y;
  float C = s2 * (j11 * j11 + j12 * j12) + D * u2.y * u2.y + dil;
  float det = A * C - Bq * Bq;
  if (!(det > 0.0)) return;
  v_conic = vec3(C / det, -Bq / det, A / det);
#ifdef ADDITIVE
  float rad = 3.0;
#else
  float cut = log(0.5 / al);
  if (cut >= 0.0) return;
  float rad = sqrt(-2.0 * cut);
#endif
  vec2 ext = min(rad * sqrt(vec2(A, C)) + 0.5, vec2(1024.0));
  vec2 c = pc.xy * iz * u_focal;
  if (abs(c.x) - ext.x > 0.5 * u_res.x || abs(c.y) - ext.y > 0.5 * u_res.y) return;
#ifdef ADDITIVE
  v_d = a_corner * ext;
#else
  if (abs(c.x) > 0.5 * u_res.x || abs(c.y) > 0.5 * u_res.y) return;   // (a point is dropped whole once its middle leaves the picture: the picture is drawn with a border to spare)
  v_ctr = c + 0.5 * u_res;
#endif
  // colour: its palette colour, what light reaches it tonight, then the haze between it and the eye
  vec3 col = u_pal[pal];
  vec3 fl = floorLight(pw.xz);
  if (!em) {
    bool lit = (flags & 4) != 0;
    vec3 add = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      if (i >= u_nl) break;
      vec3 Lv = u_lp[i].xyz - pw;
      float d2 = dot(Lv, Lv), r = u_lp[i].w;
      float att = max(0.0, 1.0 - d2 / (r * r));
      float ndl = lit ? max(0.0, dot(aw, Lv) * inversesqrt(d2 + 1e-4)) : 0.6;
      add += u_lc[i] * (att * att * (0.2 + 0.8 * ndl));
    }
    float up = exp(-max(0.0, pw.y - u_fog.x) * u_fog.w) * (lit ? 1.0 - 0.75 * max(0.0, aw.y) : 0.6);
    add += (fl + u_warm * 0.55) * (up * 0.6);
    col += add * (0.32 + 1.3 * dot(col, vec3(0.30, 0.55, 0.15)));
  } else col *= bright;
  float F = 1.0 - exp(-fogTau(u_eye, pw));
  float far = smoothstep(u_fade.x, u_fade.y, length(pw.xz));
  float Hz = hazeAt(length(dv));
#ifdef ADDITIVE
  col *= (1.0 - F) * (1.0 - 0.8 * Hz) * (1.0 - far) * (1.0 - u_gfade);
  v_aux = vec3(0.0, 1.0, al);
#else
  if (em) { F *= 0.72; far *= far; Hz *= 0.45; }
  col = mix(col, fogColour(pw, fl), F);
  col = mix(col, u_haze.rgb, max(Hz, far));   // the farther, the more it is the colour of the air; at the city's edge, nothing else
  // (what is all but lost in the dark at the edge of the city is not given an inked outline against it)
  v_aux = vec3(far > 0.6 ? 1.0 : min(0.98, pc.z / u_linFar), em ? 1.0 : 0.0, cut);
#endif
  v_col = col;
  float zn = (u_nf.y + u_nf.x) / (u_nf.y - u_nf.x) - (2.0 * u_nf.y * u_nf.x) / ((u_nf.y - u_nf.x) * pc.z);
#ifdef ADDITIVE
  gl_Position = vec4((c + v_d) / (0.5 * u_res), zn, 1.0);
#else
  gl_Position = vec4(c / (0.5 * u_res), zn, 1.0);
  gl_PointSize = min(2.0 * max(ext.x, ext.y), u_maxPt);
#endif
}`;

  const splatFS = `#version 300 es
precision highp float;
#ifdef ADDITIVE
in vec2 v_d;
#else
flat in vec2 v_ctr;
#endif
flat in vec3 v_conic;
flat in vec3 v_col;
flat in vec3 v_aux;
flat in float v_fade;
layout(location = 0) out vec4 o_col;
layout(location = 1) out vec4 o_aux;
const float DIS[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
void main() {
#ifdef ADDITIVE
  vec2 dd = v_d;
#else
  vec2 dd = gl_FragCoord.xy - v_ctr;
#endif
  float pw = -0.5 * (v_conic.x * dd.x * dd.x + v_conic.z * dd.y * dd.y) - v_conic.y * dd.x * dd.y;
#ifdef ADDITIVE
  if (pw < -4.5) discard;
  o_col = vec4(v_col * min(0.99, v_aux.z * exp(pw)), 0.0);
  o_aux = vec4(0.0);
#else
  if (pw < v_aux.z) discard;
  if (v_fade > 0.0) {             // a thing coming or going: it is there in some art pixels and not in others
    ivec2 q = ivec2(gl_FragCoord.xy) >> 1;
    if (v_fade > (DIS[(q.x & 3) + ((q.y & 3) << 2)] + 0.5) / 16.0) discard;
  }
  o_col = vec4(v_col, 1.0);
  o_aux = vec4(v_aux.x, v_aux.y, 0.0, 1.0);
#endif
}`;

  const quadVS = `#version 300 es
layout(location = 0) in vec2 a_corner;
out vec2 v_uv;
void main() { v_uv = a_corner; gl_Position = vec4(a_corner, 1.0, 1.0); }`;

  /* what is behind everything: the haze pooled in the depths, lit from below, and above it the black of the night */
  const skyFS = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform vec3 u_eye, u_cr, u_cu, u_cf;
uniform vec2 u_tan;
uniform float u_sky;
${FOG}
layout(location = 0) out vec4 o_col;
layout(location = 1) out vec4 o_aux;
void main() {
  vec3 d = normalize(u_cf + u_cr * (v_uv.x * u_tan.x) + u_cu * (v_uv.y * u_tan.y));
  float H = 1.0 / u_fog.y, a = max((u_eye.y - u_fog.x) * u_fog.y, -8.0);
  vec3 col;
  if (d.y < -0.002) {
    float q = exp(-a) + (-d.y) / (u_fog.z * H);
    float ys = u_fog.x - H * log(q);
    float L = (ys - u_eye.y) / d.y;
    vec3 p = u_eye + d * L;
    float pool = 1.0 - smoothstep(u_fade.z, u_fade.w, length(p.xz));
    // looking down into it, the light from below shows through: the steeper, the more
    col = fogColour(p, floorLight(p.xz)) + u_warm * (pow(-d.y, 3.0) * 1.15 * pool);
    col = mix(col, u_haze.rgb, hazeAt(max(L - 220.0, 0.0)));
  } else {
    // above the horizon: the same air, thinning upward into the black
    col = u_haze.rgb * (1.0 - exp(-u_haze.w * 1500.0 * exp(-d.y * 9.0))) * u_sky;
  }
  o_col = vec4(col, 1.0);
  // lit haze counts as something that is there (so what stands in front of it is not inked round as if against the void), and says so in b
  o_aux = vec4(dot(col, vec3(0.30, 0.55, 0.15)) > 0.045 ? 0.99 : 1.0, 0.0, 1.0, 1.0);
}`;

  /* the pixel look: the toolkit's fixed-grid, palette-aware resolve, given a native picture worked on first
     (small lights kept, a rim where one thing stands in front of another) */
  const resolveFS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D u_scene;   // the picture at twice the art resolution
uniform sampler2D u_depth;   // its coverage (r under 0.995 where something solid was drawn) and what glows (g)
uniform sampler2D u_zbuf;    // its depth
uniform vec3 u_pal[48];
uniform vec3 u_out[48];
uniform int u_n;
uniform float u_grade, u_dither, u_rim;
uniform ivec2 u_ov;
uniform vec2 u_nf;
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
#define PIXEL_NATIVE
ivec2 pixelAt(ivec2 p);
float zAt(ivec2 p) {
  float z = 1.0;
  ivec2 q = p * 2;
  for (int i = 0; i < 4; i++) z = min(z, texelFetch(u_zbuf, pixelAt(q + ivec2(i & 1, i >> 1)), 0).r);
  return (2.0 * u_nf.x * u_nf.y) / (u_nf.y + u_nf.x - (z * 2.0 - 1.0) * (u_nf.y - u_nf.x));
}
vec3 pixelNative(ivec2 p) {
  vec3 avg = vec3(0.0), mx = vec3(0.0);
  float ml = -1.0, glow = 0.0;
  for (int i = 0; i < 4; i++) {
    ivec2 q = pixelAt(p * 2 + ivec2(i & 1, i >> 1));
    vec3 s = texelFetch(u_scene, q, 0).rgb;
    glow = max(glow, texelFetch(u_depth, q, 0).g);
    float l = dot(s, vec3(0.30, 0.55, 0.15));
    avg += s * 0.25;
    if (l > ml) { ml = l; mx = s; }
  }
  vec3 c = mix(avg, mx, smoothstep(0.08, 0.26, ml - dot(avg, vec3(0.30, 0.55, 0.15))));
  if (u_rim > 0.0 && glow < 0.5) {
    float d0 = zAt(p), dU = zAt(p + ivec2(0, 1)), dL = zAt(p - ivec2(1, 0)), dD = zAt(p - ivec2(0, 1)), dR = zAt(p + ivec2(1, 0));
    float th = 0.07 * d0 + 0.4;
    if (d0 < u_nf.y * 0.5) {
      if (dU - d0 > th || dL - d0 > th) c += u_rim * vec3(0.050, 0.044, 0.066);   // its top and left edges catch the light
      else if (d0 - dU > th || d0 - dL > th) c *= 1.0 - 0.2 * u_rim;               // what lies just under or right of it is shaded
      else if (dD - d0 > th || dR - d0 > th) c *= 1.0 - 0.1 * u_rim;
    }
  }
  return c;
}
PIXEL_LOOK_GLSL
out vec4 o_col;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) + u_ov;
  float hazy = 0.0;
  for (int i = 0; i < 4; i++) hazy += texelFetch(u_depth, pixelAt(p * 2 + ivec2(i & 1, i >> 1)), 0).b;
  vec3 c;
  if (hazy > 3.5) {
    // nothing but haze here: no outline, and a stronger ordered dither so its slow gradients band softly
    float noise = ((BAYER[(p.x & 3) + ((p.y & 3) << 2)] + 0.5) / 16.0 - 0.5) * u_dither * 2.6;
    c = clamp(pixelNative(p) + noise, 0.0, 1.0);
  } else c = pixelResolve(p);
  o_col = vec4(pixelMapped(pixelNearest(c, false)), 1.0);
}`;
  return { splatVS, splatFS, quadVS, skyFS, resolveFS };
})();
if (typeof module !== 'undefined') module.exports = NeonShaders;
