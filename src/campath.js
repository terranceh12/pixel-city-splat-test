/* The camera, shared by the baker (Node) and the page.
   An orbit about the bend in the elevated highway (the world origin). The origin pose is matched to the reference painting:
   a 494 x 738 frame, 60 degrees tall, in which the bend sits at pixel (275, 258). The bend is pinned there for every pose, so
   the picture turns about it. */
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
    tanV: Math.tan(30 * RAD), // half of the reference frame's 60 degrees
    tanHMax: Math.tan(43 * RAD), // widest half-angle allowed sideways
    pinX: (275 - 247) / 639, // where the bend sits in the frame, as tangents from the optical axis
    pinY: (369 - 258) / 639
  };
  // az, el in radians (absolute). Returns eye and the three camera axes (right, up, forward)
  function pose(az, el) {
    const ce = Math.cos(el),
      eye = [C.R * ce * Math.sin(az), C.R * Math.sin(el), C.R * ce * Math.cos(az)],
      ul = Math.hypot(eye[0], eye[1], eye[2]),
      u = [-eye[0] / ul, -eye[1] / ul, -eye[2] / ul],
      nl = Math.hypot(C.pinX, C.pinY, 1),
      a = C.pinX / nl,
      b = C.pinY / nl,
      c = 1 / nl,
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
  // hover position mx, my in -1..1 (my up) to az, el
  function hover(mx, my) {
    return [C.az0 + mx * C.azRange, C.el0 + (my > 0 ? my * C.elUp : my * C.elDown)];
  }
  // half-angles (as tangents) for a viewport of the given aspect (w / h)
  function lens(aspect) {
    let tanV, tanH;
    if (aspect <= C.refAspect) {
      tanH = C.tanV * C.refAspect;
      tanV = tanH / aspect;
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
  // reference-frame pixel (494 x 738) of a world point at the origin pose, and back
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
  return { C, RAD, REF, pose, hover, lens, toCam, toRef, refRay, refToLevel, refToDepth };
})();
if (typeof module !== 'undefined') module.exports = CamPath;
