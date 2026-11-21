/* The camera, shared by the baker (Node) and the page.
   An orbit about the bend in the elevated highway (the world origin). The world was laid out to the reference painting, seen
   through an ordinary lens: a 494 x 738 frame, 60 degrees tall, in which the bend sits at pixel (275, 258) (poseRef, toRef).
   The picture is drawn through a fisheye: a direction theta off the axis lands tan(k theta) / k "lens units" from the middle of
   the picture (k = 1 would be the ordinary lens; smaller k bends straight lines more and takes in more). The reference frame is
   92 degrees tall through it, and no window is more than 120 degrees wide. The bend is still pinned at pixel (275, 258) of the
   reference frame, for every pose, so the picture turns about it. */
const CamPath = (() => {
  const RAD = Math.PI / 180;
  const C = {
    R: 68, // eye to bend
    az0: 2.2 * RAD, // origin azimuth (0 = looking down the near highway, along -Z)
    el0: 6.65 * RAD, // origin elevation of the eye above the bend
    azRange: 35 * RAD, // hover left / right
    elUp: 36 * RAD, // hover to the top of the screen
    elDown: 3.4 * RAD, // hover to the bottom
    refAspect: 494 / 738,
    k: 0.4, // the fisheye
    fovV: 46 * RAD, // half the reference frame's height, as an angle off the axis
    fovHMax: 60 * RAD, // the widest half-angle allowed sideways
    // the ordinary lens the world was laid out with: half the reference frame's 60 degrees, and the bend's place, as tangents
    tanV0: Math.tan(30 * RAD),
    pinX0: (275 - 247) / 639,
    pinY0: (369 - 258) / 639
  };
  // the fisheye: angle off the axis to lens units, and back
  const lensR = th => Math.tan(C.k * th) / C.k,
    lensTh = r => Math.atan(C.k * r) / C.k;
  C.tanV = lensR(C.fovV); // (half the reference frame's height, in lens units; the names are kept from the ordinary lens)
  C.tanHMax = lensR(C.fovHMax);
  C.tanVMax = lensR(62 * RAD); // (a very tall, narrow window goes no taller than this: it narrows instead)
  C.pinX = ((275 - 247) / 369) * C.tanV; // where the bend sits in the frame, in lens units from the middle
  C.pinY = ((369 - 258) / 369) * C.tanV;
  // the way a lens point (lens units from the middle) looks, in camera space: [right, up, forward]
  function lensDir(u, v) {
    const r = Math.hypot(u, v);
    if (r < 1e-9) return [0, 0, 1];
    const th = lensTh(r),
      s = Math.sin(th);
    return [(u / r) * s, (v / r) * s, Math.cos(th)];
  }
  // camera space to lens units (null past 83 degrees off the axis: never in any picture)
  function toLens(c) {
    const rho = Math.hypot(c[0], c[1]),
      th = Math.atan2(rho, c[2]);
    if (th > 1.45) return null;
    const g = rho > 1e-9 ? lensR(th) / rho : 1 / c[2];
    return [c[0] * g, c[1] * g];
  }
  // az, el in radians (absolute). Returns eye and the three camera axes (right, up, forward), turned so that the bend lies along
  // the camera-space direction `pin`
  function orient(az, el, pin) {
    const ce = Math.cos(el),
      eye = [C.R * ce * Math.sin(az), C.R * Math.sin(el), C.R * ce * Math.cos(az)],
      ul = Math.hypot(eye[0], eye[1], eye[2]),
      u = [-eye[0] / ul, -eye[1] / ul, -eye[2] / ul],
      a = pin[0],
      b = pin[1],
      c = pin[2],
      r = Math.hypot(b, c),
      phi = Math.acos(Math.max(-1, Math.min(1, u[1] / r))) - Math.atan2(c, b),
      g = -(b * Math.sin(phi) + c * Math.cos(phi)),
      psi = Math.atan2(u[0], u[2]) - Math.atan2(a, g),
      sp = Math.sin(psi),
      cp = Math.cos(psi),
      sf = Math.sin(phi),
      cf = Math.cos(phi);
    return {
      eye,
      right: [cp, 0, -sp],
      up: [-sp * sf, cf, -cp * sf],
      fwd: [-sp * cf, -sf, -cp * cf],
      yaw: psi,
      pitch: phi
    };
  }
  const PIN = lensDir(C.pinX, C.pinY),
    PIN0 = (() => {
      const nl = Math.hypot(C.pinX0, C.pinY0, 1);
      return [C.pinX0 / nl, C.pinY0 / nl, 1 / nl];
    })();
  // the pose drawn (through the fisheye), and the pose the world was laid out with (through the ordinary lens)
  const pose = (az, el) => orient(az, el, PIN),
    poseRef = (az, el) => orient(az, el, PIN0);
  // hover position mx, my in -1..1 (my up) to az, el
  function hover(mx, my) {
    return [C.az0 + mx * C.azRange, C.el0 + (my > 0 ? my * C.elUp : my * C.elDown)];
  }
  // half the picture's width and height, in lens units, for a viewport of the given aspect (w / h)
  function lens(aspect) {
    let tanV, tanH;
    if (aspect <= C.refAspect) {
      tanH = C.tanV * C.refAspect;
      tanV = tanH / aspect;
      if (tanV > C.tanVMax) {
        tanV = C.tanVMax;
        tanH = tanV * aspect;
      }
    } else {
      tanV = C.tanV;
      tanH = tanV * aspect;
      if (tanH > C.tanHMax) {
        tanH = C.tanHMax;
        tanV = tanH / aspect;
      }
    }
    return { tanH, tanV };
  }
  // world point to camera space [x right, y up, depth forward]
  function toCam(P, p) {
    const dx = p[0] - P.eye[0],
      dy = p[1] - P.eye[1],
      dz = p[2] - P.eye[2];
    return [
      P.right[0] * dx + P.right[1] * dy + P.right[2] * dz,
      P.up[0] * dx + P.up[1] * dy + P.up[2] * dz,
      P.fwd[0] * dx + P.fwd[1] * dy + P.fwd[2] * dz
    ];
  }
  // reference-frame pixel (494 x 738) of a world point at the origin pose, and back: through the ordinary lens (pass poseRef)
  const REF = { w: 494, h: 738, f: 639 };
  function toRef(P, p) {
    const c = toCam(P, p);
    return [REF.w / 2 + (REF.f * c[0]) / c[2], REF.h / 2 - (REF.f * c[1]) / c[2], c[2]];
  }
  function refRay(P, u, v) {
    const x = (u - REF.w / 2) / REF.f,
      y = (REF.h / 2 - v) / REF.f,
      d = [
        P.right[0] * x + P.up[0] * y + P.fwd[0],
        P.right[1] * x + P.up[1] * y + P.fwd[1],
        P.right[2] * x + P.up[2] * y + P.fwd[2]
      ];
    return d;
  }
  // where the ray through a reference pixel meets the level y = y0, or the upright plane at depth `depth` along the view
  function refToLevel(P, u, v, y0) {
    const d = refRay(P, u, v),
      t = (y0 - P.eye[1]) / d[1];
    return t > 0 ? [P.eye[0] + d[0] * t, y0, P.eye[2] + d[2] * t] : null;
  }
  function refToDepth(P, u, v, depth) {
    const d = refRay(P, u, v);
    return [P.eye[0] + d[0] * depth, P.eye[1] + d[1] * depth, P.eye[2] + d[2] * depth];
  }
  return { C, RAD, REF, pose, poseRef, hover, lens, lensR, lensTh, lensDir, toLens, toCam, toRef, refRay, refToLevel, refToDepth };
})();
if (typeof module !== 'undefined') module.exports = CamPath;
