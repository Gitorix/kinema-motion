// Synthetic sample motions shown before a video is loaded, one per movement type.
// Each sample frame uses the MediaPipe world convention (metres, origin between the hips, x right, y down,
// z away from the camera) plus normalised image coordinates, exactly like a real analysed video.
window.KinemaDemo = (() => {
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const unit = a => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
  const comb = (...terms) => terms.reduce((acc, [v, s]) => add(acc, scale(v, s)), [0, 0, 0]);
  const rad = d => d * Math.PI / 180;
  const ease = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const easeOut = u => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - (1 - u) * (1 - u)); // fast start, gentle stop
  const lerp = (a, b, u) => a + (b - a) * u;
  const U = [0, 1, 0];

  // 33 landmarks from a few posture angles (degrees), in a frame where y is up.
  // a: shin lean (knees forward), b: thigh angle (hips back), c: trunk lean forward,
  // e: arm raise forward (negative = behind the body), lat: arm raise to the side, kneeIn: knees drifting inward (m).
  function body({ F, L, root, a = 0, b = 0, c = 0, e = 0, lat = 0, kneeIn = 0, heelLift = 0 }) {
    const P = new Array(33);
    const at = (f, u, l) => comb([root, 1], [F, f], [U, u], [L, l]);
    const ankleU = 0.08 + heelLift;
    const kf = 0.42 * Math.sin(rad(a)), ku = ankleU + 0.42 * Math.cos(rad(a));
    const hf = kf - 0.44 * Math.sin(rad(b)), hu = ku + 0.44 * Math.cos(rad(b));
    const sf = hf + 0.5 * Math.sin(rad(c)), su = hu + 0.5 * Math.cos(rad(c));
    for (const s of [1, -1]) { // +1 = the person's left
      const i = (l, r) => (s > 0 ? l : r);
      P[i(27, 28)] = at(0, ankleU, 0.12 * s);
      P[i(29, 30)] = at(-0.05, 0.03 + 1.5 * heelLift, 0.12 * s);
      P[i(31, 32)] = at(0.14, 0.02, 0.14 * s);
      P[i(25, 26)] = at(kf, ku, (0.11 - kneeIn) * s);
      P[i(23, 24)] = at(hf, hu, 0.1 * s);
      const S = at(sf, su, 0.18 * s);
      P[i(11, 12)] = S;
      const upper = unit(comb([L, s * (0.06 + Math.sin(rad(lat)))], [U, -Math.cos(rad(e)) * Math.cos(rad(lat))], [F, Math.sin(rad(e)) + 0.02]));
      const El = add(S, scale(upper, 0.29));
      const fore = unit(comb([upper, 1], [U, 0.12], [F, 0.18]));
      const Wr = add(El, scale(fore, 0.26));
      const Ix = add(Wr, scale(fore, 0.09));
      P[i(13, 14)] = El;
      P[i(15, 16)] = Wr;
      P[i(19, 20)] = Ix;
      P[i(17, 18)] = comb([Ix, 1], [L, 0.02 * s], [F, -0.01]);
      P[i(21, 22)] = comb([Wr, 1], [fore, 0.05], [L, -0.03 * s], [U, 0.01], [F, 0.02]);
    }
    const lean = rad(c) * 0.5;
    const hc = at(sf + 0.22 * Math.sin(lean), su + 0.22 * Math.cos(lean), 0);
    const face = (f, u, l) => comb([hc, 1], [F, f], [U, u], [L, l]);
    P[0] = face(0.1, -0.01, 0);
    for (const s of [1, -1]) {
      const l = s > 0;
      P[l ? 1 : 4] = face(0.09, 0.03, 0.02 * s);
      P[l ? 2 : 5] = face(0.09, 0.03, 0.035 * s);
      P[l ? 3 : 6] = face(0.085, 0.03, 0.05 * s);
      P[l ? 7 : 8] = face(0, 0, 0.078 * s);
      P[l ? 9 : 10] = face(0.085, -0.045, 0.025 * s);
    }
    return P;
  }

  // world (hip-centred, y down, z away) + image (normalised) + visibility
  function pack(P, project, visOf) {
    const hip = scale(add(P[23], P[24]), 0.5);
    const w = new Float32Array(99), img = new Float32Array(66), vis = new Float32Array(33);
    for (let k = 0; k < 33; k++) {
      const [x, y, z] = P[k];
      w[k * 3] = x - hip[0];
      w[k * 3 + 1] = -(y - hip[1]);
      w[k * 3 + 2] = -(z - hip[2]);
      const [ix, iy] = project(P[k]);
      img[k * 2] = ix;
      img[k * 2 + 1] = iy;
      vis[k] = visOf(k);
    }
    return { w, img, vis };
  }

  const FRONT = { F: [0, 0, 1], L: [1, 0, 0] }; // facing the camera; their left is the viewer's right
  const SIDE = { F: [1, 0, 0], L: [0, 0, -1] }; // facing screen right; their left side is away from the camera
  const portrait = ([x, y]) => [0.5 + 0.6 * x, 0.95 - 0.45 * y];
  const all = () => 0.99;

  // In the air the centre of mass follows a parabola, as gravity demands, and the body turns around it:
  // the root (on the floor between the feet) goes wherever puts the centre of mass on that parabola.
  // fly: { T: flight time, x: forward travel of the feet, take / land: posture at take-off / landing }
  const G = 9.81;
  const centre = P => window.KinemaTrajectory.com(j => P[j]);
  function flightRoot(dirs, fly, tau, pose) {
    if (!fly.v) {
      const c0 = centre(body({ ...dirs, root: [0, 0, 0], ...fly.take }));
      const c1 = centre(body({ ...dirs, root: [fly.x, 0, 0], ...fly.land }));
      fly.c0 = c0;
      fly.v = c0.map((v, k) => (c1[k] - v) / fly.T + (k === 1 ? 0.5 * G * fly.T : 0));
    }
    const off = centre(body({ ...dirs, root: [0, 0, 0], ...pose }));
    return fly.c0.map((v, k) => v + fly.v[k] * tau - (k === 1 ? 0.5 * G * tau * tau : 0) - off[k]);
  }

  // three squats with knees drifting in at depth, then an overhead reach
  function squat(t) {
    const tt = t % 10;
    const s = tt < 6 ? 0.5 - 0.5 * Math.cos(Math.PI * tt) : 0;
    const raise = tt >= 6 && tt < 8.4 ? Math.sin(Math.PI * (tt - 6) / 2.4) : 0;
    const sway = 0.012 * Math.sin(t * 1.7);
    const P = body({ ...FRONT, root: [sway, 0, 0], a: 38 * s, b: 72 * s, c: 40 * s, e: 85 * s, lat: 165 * raise, kneeIn: 0.02 * s });
    return pack(P, portrait, all);
  }

  // countermovement jump: small arm swing, stiff landing with the knees drifting in
  const JUMP_FLY = { T: 0.5, x: 0, take: { a: 0, b: 0, c: 0, e: 110, heelLift: 0.08 }, land: { a: 5, b: 5, c: 0, e: 60, heelLift: 0 } };
  function jump(t) {
    let a = 0, b = 0, c = 0, e = 0, kneeIn = 0, heelLift = 0, root = [0, 0, 0], u;
    if (t >= 1 && t < 1.5) { u = ease((t - 1) / 0.5); a = 30 * u; b = 55 * u; c = 35 * u; e = -50 * u; }
    else if (t >= 1.5 && t < 1.75) {
      // the push speeds up until take-off, so the body leaves the floor already moving fast
      u = (t - 1.5) / 0.25;
      const p = u * u;
      a = 30 * (1 - p); b = 55 * (1 - p); c = 35 * (1 - p); e = -50 + 160 * p; heelLift = 0.08 * ease(u);
    }
    else if (t >= 1.75 && t < 2.25) {
      u = (t - 1.75) / 0.5; a = 5 * u; b = 5 * u; e = 110 - 50 * u; heelLift = 0.08 * (1 - u);
      root = flightRoot(FRONT, JUMP_FLY, t - 1.75, { a, b, c, e, heelLift });
    }
    else if (t >= 2.25 && t < 2.55) {
      // a stiff landing: the knees give a little, quickly
      const k = easeOut((t - 2.25) / 0.15);
      a = 5 + 10 * k; b = 5 + 15 * k; c = 10 * k; kneeIn = 0.02 * k; e = 60 - 30 * (t - 2.25) / 0.3;
    }
    else if (t >= 2.55 && t < 3.2) { u = ease((t - 2.55) / 0.65); a = 15 * (1 - u); b = 20 * (1 - u); c = 10 * (1 - u); kneeIn = 0.02 * (1 - u); e = 30 * (1 - u); }
    const P = body({ ...FRONT, root, a, b, c, e, kneeIn, heelLift });
    const s = 320; // pixels per metre, the same across and down the 600×800 frame
    return pack(P, ([x, y]) => [0.5 + s * x / 600, 0.92 - s * y / 800], all);
  }

  // standing long jump seen from the side: shallow hip hinge, sitting back on landing
  const BROAD_FLY = {
    T: 0.5, x: 2.2,
    take: { a: 45, b: -45, c: 45, e: 140, heelLift: 0.1 },
    tuck: { a: 50, b: 80, c: 30, e: 120, heelLift: 0 },
    land: { a: 25, b: 85, c: 0, e: 100, heelLift: 0 },
    absorb: { a: 50, b: 90, c: 35, e: 70, heelLift: 0 },
  };
  // in the air: pull the knees up first, then reach the feet forward for the landing
  function broadAir(u) {
    const { take, tuck, land } = BROAD_FLY;
    const [p, q, k] = u < 0.5 ? [take, tuck, ease(u / 0.5)] : [tuck, land, ease((u - 0.5) / 0.5)];
    return Object.fromEntries(Object.keys(take).map(key => [key, lerp(p[key], q[key], k)]));
  }
  function broad(t) {
    const { take, land, absorb } = BROAD_FLY, t1 = 2.05, t2 = t1 + BROAD_FLY.T;
    let pose = { a: 0, b: 0, c: 0, e: 0, heelLift: 0 }, root = [0, 0, 0], u;
    if (t >= 1 && t < 1.6) { u = ease((t - 1) / 0.6); pose = { a: 35 * u, b: 60 * u, c: 20 * u, e: -60 * u, heelLift: 0 }; }
    else if (t >= 1.6 && t < t1) {
      // the push speeds up until take-off, so the body leaves the floor already moving fast
      u = (t - 1.6) / (t1 - 1.6);
      const p = u * u;
      pose = { a: lerp(35, take.a, p), b: lerp(60, take.b, p), c: lerp(20, take.c, p), e: lerp(-60, take.e, p), heelLift: take.heelLift * ease(u) };
    } else if (t >= t1 && t < t2) {
      pose = broadAir((t - t1) / BROAD_FLY.T);
      root = flightRoot(SIDE, BROAD_FLY, t - t1, pose);
    } else if (t >= t2) {
      // after touch-down the body keeps travelling over the feet while the knees and hips give, then it stands up
      root = [BROAD_FLY.x, 0, 0];
      const k = easeOut((t - t2) / 0.17), r = ease((t - t2 - 0.45) / 0.8);
      pose = Object.fromEntries(Object.keys(land).map(key => [key, lerp(lerp(land[key], absorb[key], k), 0, r)]));
    }
    const P = body({ ...SIDE, root, ...pose });
    // the far (left) side is partly hidden behind the body, as in a real side view
    const left = new Set([2, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]);
    return pack(P, ([px, py]) => [0.15 + 0.236 * px, 0.92 - 0.42 * py], k => (left.has(k) ? 0.7 : 0.98));
  }

  const samples = {
    squat: { duration: 10, fps: 30, width: 600, height: 800, frame: squat },
    jump: { duration: 5, fps: 30, width: 600, height: 800, frame: jump },
    broad: { duration: 6, fps: 30, width: 960, height: 540, frame: broad },
  };
  return { samples };
})();
