// Trajectories: the path each body point travels, measured in the plane the camera sees.
// Short detection gaps are filled, jitter is removed with a zero-lag low-pass filter (2nd-order Butterworth run
// forwards and backwards, the usual choice for motion capture), the whole-body centre of mass is estimated from
// segment masses (de Leva 1996), and pixels become metres with the floor as zero height.
// The camera sees no depth, so movement toward or away from it is not measured.
window.KinemaTrajectory = (() => {
  const LM = {
    nose: 0, lEye: 2, rEye: 5, lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
    lPinky: 17, rPinky: 18, lIdx: 19, rIdx: 20, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28,
    lHeel: 29, rHeel: 30, lFt: 31, rFt: 32,
  };
  const G = 9.81;
  const mid = (a, b) => a.map((v, k) => (v + b[k]) / 2);
  const lerp = (a, b, u) => a.map((v, k) => v + (b[k] - v) * u);
  const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

  // [mass fraction, centre of the segment]: de Leva (1996), measured from the joint nearer the trunk
  const SEGMENTS = [
    [0.0694, P => mid(P(LM.lEar), P(LM.rEar))],
    [0.4346, P => lerp(mid(P(LM.lSh), P(LM.rSh)), mid(P(LM.lHip), P(LM.rHip)), 0.4486)],
  ];
  for (const s of ['l', 'r']) {
    const j = name => LM[s + name];
    SEGMENTS.push(
      [0.0271, P => lerp(P(j('Sh')), P(j('El')), 0.5772)],
      [0.0162, P => lerp(P(j('El')), P(j('Wr')), 0.4574)],
      [0.0061, P => lerp(P(j('Wr')), mid(P(j('Idx')), P(j('Pinky'))), 0.79)],
      [0.1416, P => lerp(P(j('Hip')), P(j('Kn')), 0.4095)],
      [0.0433, P => lerp(P(j('Kn')), P(j('An')), 0.4459)],
      [0.0137, P => lerp(P(j('Heel')), P(j('Ft')), 0.4415)],
    );
  }
  // whole-body centre of mass; P(i) gives landmark i as [x, y] or [x, y, z] (the fractions add up to 1)
  function com(P) {
    let acc = null;
    for (const [m, at] of SEGMENTS) {
      const c = at(P);
      acc = acc ? acc.map((v, k) => v + c[k] * m) : c.map(v => v * m);
    }
    return acc;
  }

  // what can be drawn; a pair is drawn per side (both in a front view, the near side in a side view)
  const POINTS = [
    { k: 'com', ja: '重心', note: '体全体の重さの中心' },
    { k: 'sh', ja: '肩' },
    { k: 'hip', ja: '腰' },
    { k: 'kn', ja: '膝', pair: true },
    { k: 'ft', ja: 'つま先', pair: true },
    { k: 'wr', ja: '手首', pair: true },
  ];
  const SERIES = {
    com: P => com(P),
    sh: P => mid(P(LM.lSh), P(LM.rSh)),
    hip: P => mid(P(LM.lHip), P(LM.rHip)),
    knL: P => P(LM.lKn), knR: P => P(LM.rKn),
    ftL: P => P(LM.lFt), ftR: P => P(LM.rFt),
    wrL: P => P(LM.lWr), wrR: P => P(LM.rWr),
  };
  // series keys for a point, given the analysed side ('l', 'r' or 'both')
  const seriesOf = (k, side) => {
    if (!POINTS.find(p => p.k === k)?.pair) return [k];
    return side === 'l' ? [`${k}L`] : side === 'r' ? [`${k}R`] : [`${k}L`, `${k}R`];
  };

  // ---------- signal clean-up ----------
  // A copy with lone misread samples replaced by the middle value around them (a Hampel filter). The AI now and then
  // misplaces a limb or swaps left and right for a frame; movement, even fast, passes through untouched.
  // floor: differences smaller than this are never touched.
  function despike(a, floor = 0, reach = 3) {
    const out = Float64Array.from(a);
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) continue;
      const around = [];
      for (let j = Math.max(0, i - reach); j <= Math.min(a.length - 1, i + reach); j++) if (Number.isFinite(a[j])) around.push(a[j]);
      if (around.length < 3) continue;
      const m = median(around), spread = median(around.map(v => Math.abs(v - m)));
      if (Math.abs(a[i] - m) > Math.max(3.5 * 1.4826 * spread, floor)) out[i] = m;
    }
    return out;
  }
  // straight lines across gaps of up to maxGap samples; longer gaps stay empty
  function fillGaps(a, maxGap) {
    let last = -1;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) continue;
      if (last >= 0 && i - last > 1 && i - last - 1 <= maxGap) {
        for (let j = last + 1; j < i; j++) a[j] = a[last] + (a[i] - a[last]) * (j - last) / (i - last);
      }
      last = i;
    }
  }
  function lowpass(fc, fs) {
    const K = Math.tan(Math.PI * Math.min(fc, 0.4 * fs) / fs), n = 1 / (1 + Math.SQRT2 * K + K * K);
    const b0 = K * K * n;
    return { b0, b1: 2 * b0, b2: b0, a1: 2 * (K * K - 1) * n, a2: (1 - Math.SQRT2 * K + K * K) * n };
  }
  function pass(x, c) {
    const y = new Float64Array(x.length);
    let x1 = x[0], x2 = x[0], y1 = x[0], y2 = x[0];
    for (let i = 0; i < x.length; i++) {
      const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  // zero-lag filtering of every unbroken stretch (ends padded by point reflection); fc in Hz
  function smooth(a, fs, fc = 6) {
    const c = lowpass(fc, fs);
    for (let i = 0; i < a.length;) {
      if (!Number.isFinite(a[i])) { i++; continue; }
      let j = i;
      while (j + 1 < a.length && Number.isFinite(a[j + 1])) j++;
      const len = j - i + 1;
      if (len >= 6) {
        const pad = Math.min(len - 1, 12);
        const ext = new Float64Array(len + 2 * pad);
        for (let k = 0; k < pad; k++) {
          ext[k] = 2 * a[i] - a[i + pad - k];
          ext[pad + len + k] = 2 * a[j] - a[j - 1 - k];
        }
        for (let k = 0; k < len; k++) ext[pad + k] = a[i + k];
        const back = pass(pass(ext, c).reverse(), c).reverse();
        for (let k = 0; k < len; k++) a[i + k] = back[pad + k];
      }
      i = j + 1;
    }
    return a;
  }
  // least squares polynomial (degree 1 or 2): returns [c0, c1, c2]
  function polyfit(t, v, deg) {
    const n = deg + 1, A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
    for (let i = 0; i < t.length; i++) {
      const p = [1, t[i], t[i] * t[i]];
      for (let r = 0; r < n; r++) {
        for (let k = 0; k < n; k++) A[r][k] += p[r] * p[k];
        A[r][n] += p[r] * v[i];
      }
    }
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]];
      if (Math.abs(A[col][col]) < 1e-12) return null;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col] / A[col][col];
        for (let k = col; k <= n; k++) A[r][k] -= f * A[col][k];
      }
    }
    return A.map((row, r) => row[n] / row[r]);
  }

  // ---------- build ----------
  // c: the analysis context (frames, image size, analysed side, floor line); heightM: the person's height if known.
  function build(c, heightM) {
    const F = c.frames, n = F.length, fs = c.fps, g = c.ground;
    const keys = [...Object.keys(SERIES), 'toe', 'heel'];
    const raw = {}, px = {};
    for (const k of keys) raw[k] = { x: new Float64Array(n).fill(NaN), y: new Float64Array(n).fill(NaN) };
    for (let i = 0; i < n; i++) {
      const f = F[i];
      if (!f.ok || !f.img) continue;
      const P = j => [f.img[j * 2] * c.vw, f.img[j * 2 + 1] * c.vh];
      for (const [k, fn] of Object.entries(SERIES)) { const [x, y] = fn(P); raw[k].x[i] = x; raw[k].y[i] = y; }
      const toe = c.pt(f, 'toe'), heel = c.pt(f, 'heel');
      raw.toe.x[i] = toe[0]; raw.toe.y[i] = toe[1];
      raw.heel.x[i] = heel[0]; raw.heel.y[i] = heel[1];
    }
    const gap = Math.round(0.25 * fs), wobble = 0.015 * g.bodyH;
    for (const k of keys) {
      const sx = despike(raw[k].x, wobble), sy = despike(raw[k].y, wobble);
      fillGaps(sx, gap); fillGaps(sy, gap);
      px[k] = { x: smooth(sx, fs), y: smooth(sy, fs) };
    }

    // Pixels shrink with distance from the camera. A scale read at one place is turned into the scale at the body's
    // usual size in the picture, or the middle of readings from a near place and a far one would land on either.
    const toUsual = i => {
      const v = g.localBody[i] / g.bodyH;
      return Number.isFinite(v) && v > 0 ? v : 1;
    };
    // metres per pixel from the AI's body model: leg length in 3D over leg length in the image, standing
    const base = g.base;
    const legs = c.side === 'l' ? [['lHip', 'lKn', 'lAn']] : c.side === 'r' ? [['rHip', 'rKn', 'rAn']] : [['lHip', 'lKn', 'lAn'], ['rHip', 'rKn', 'rAn']];
    const ratios = [];
    for (const i of base) {
      const f = F[i];
      for (const [h, k, a] of legs) {
        const w = (p, q) => Math.hypot(f.w[LM[p] * 3] - f.w[LM[q] * 3], f.w[LM[p] * 3 + 1] - f.w[LM[q] * 3 + 1], f.w[LM[p] * 3 + 2] - f.w[LM[q] * 3 + 2]);
        const im = (p, q) => Math.hypot((f.img[LM[p] * 2] - f.img[LM[q] * 2]) * c.vw, (f.img[LM[p] * 2 + 1] - f.img[LM[q] * 2 + 1]) * c.vh);
        const pxLen = im(h, k) + im(k, a);
        if (pxLen > 1) ratios.push(((w(h, k) + w(k, a)) / pxLen) * toUsual(i));
      }
    }
    const mPerPxPose = median(ratios);
    // from the person's height: eye height is about 93% of standing height
    let mPerPxHeight = NaN;
    if (heightM > 0) {
      mPerPxHeight = median(base.map(i => {
        const f = F[i], ex = (f.img[LM.lEye * 2] + f.img[LM.rEye * 2]) / 2 * c.vw, ey = (f.img[LM.lEye * 2 + 1] + f.img[LM.rEye * 2 + 1]) / 2 * c.vh;
        const eyeH = g.localToe[i] + g.slope * ex - ey;
        return eyeH > 1 ? (heightM * 0.93 / eyeH) * toUsual(i) : NaN;
      }));
    }
    // origin: middle of the foot while standing (see setOrigin); side views measure forward along the way the person faces
    let origin = median(base.map(i => (raw.toe.x[i] + raw.heel.x[i]) / 2));
    const facing = Math.sign(median(base.map(i => {
      const f = F[i];
      return f.img[LM.nose * 2] - (f.img[LM.lEar * 2] + f.img[LM.rEar * 2]) / 2;
    }))) || 1;
    let dirX = c.view === 'front' ? 1 : facing;

    const T = {
      n, fs, keys, raw, px, m: {}, origin, originNote: c.view === 'front' ? '両足の真ん中から' : '足の真ん中から', facing, dirX, view: c.view, side: c.side,
      floor: { y0: g.toe, slope: g.slope, local: g.localToe }, mPerPx: NaN, mPerPxPose, scaleSource: '', heightM: heightM > 0 ? heightM : null,
    };
    // x runs along the floor and y straight up from it (a camera that is not level tilts both in the image);
    // the floor and the size of the body are those near each moment, since they change in the image when the person
    // stands nearer to or further from the camera
    T.setScale = (s, source) => {
      T.mPerPx = s;
      T.scaleSource = source;
      const sl = g.slope, k1 = 1 / Math.hypot(1, sl);
      for (const k of keys) {
        const mx = new Float64Array(n), my = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const x = px[k].x[i], y = px[k].y[i], oy = g.localToe[i] + sl * origin, near = g.bodyH / g.localBody[i];
          const q = s * (Number.isFinite(near) && near > 0 ? near : 1);
          mx[i] = ((x - origin) + (y - oy) * sl) * k1 * q * dirX;
          my[i] = (g.localToe[i] + sl * x - y) * k1 * q;
        }
        T.m[k] = { x: mx, y: my };
      }
    };
    T.setScale(Number.isFinite(mPerPxHeight) ? mPerPxHeight : mPerPxPose, Number.isFinite(mPerPxHeight) ? 'height' : 'pose');
    // measure along the floor from another point (image x), e.g. the take-off line of a long jump
    T.setOrigin = (x, note) => {
      origin = x;
      T.origin = x;
      T.originNote = note;
      T.setScale(T.mPerPx, T.scaleSource);
    };

    // Forward is the way the person faces until the movement itself shows which way it goes (see analyzeBroad).
    T.setForward = d => {
      dirX = d;
      T.dirX = d;
      T.setScale(T.mPerPx, T.scaleSource);
    };

    // The centre of mass in the air as a ballistic path (image pixels, y down): p = p0 + b·t + a·t² on each axis.
    // Gravity is the bend |a| = g / (2 · metres per pixel); a tilted camera only turns it a little sideways.
    // t = 0 is the first airborne frame; push-off ended at t0 (a little before it), where the speed is read.
    T.fitFlight = (takeoff, land, t0 = -1 / fs) => {
      const t = [], x = [], y = [];
      for (let i = takeoff; i < land; i++) {
        if (Number.isFinite(raw.com.x[i]) && Number.isFinite(raw.com.y[i])) { t.push((i - takeoff) / fs); x.push(raw.com.x[i]); y.push(raw.com.y[i]); }
      }
      if (t.length < 4) return null;
      const s = g.slope;
      const angleOf = (vx, vy) => Math.atan2(vx * s - vy, (Math.sign(vx) || 1) * (vx + vy * s)) * 180 / Math.PI; // above the floor
      // everything free: the bend measures gravity, which is what the scale can be read from
      let free = null;
      const qx = t.length >= 8 ? polyfit(t, x, 2) : null, qy = t.length >= 8 ? polyfit(t, y, 2) : null;
      if (qx && qy && qy[2] > 0 && Math.abs(qx[2]) <= qy[2]) {
        const [x0, bx, ax] = qx, [y0, by, ay] = qy;
        let ss = 0;
        for (let k = 0; k < t.length; k++) {
          ss += (x[k] - (x0 + bx * t[k] + ax * t[k] * t[k])) ** 2 + (y[k] - (y0 + by * t[k] + ay * t[k] * t[k])) ** 2;
        }
        free = { vx: bx + 2 * ax * t0, vy: by + 2 * ay * t0, a: Math.hypot(ax, ay), rms: Math.sqrt(ss / t.length) };
      }
      // With the scale known, so is the bend: only the speed is left to read, and a dozen noisy frames read that far
      // better than the bend and the speed at once. Not when the path bends quite differently (a slowed-down video).
      const here = T.mPerPx / toUsual(takeoff), bend = G / (2 * here);
      let known = null;
      if (here > 0 && (!free || (free.a > 0.4 * bend && free.a < 2.5 * bend))) {
        const px = polyfit(t, x, 1), py = polyfit(t, y.map((v, k) => v - bend * t[k] * t[k]), 1);
        if (px && py) known = { vx: px[1], vy: py[1] + 2 * bend * t0 };
      }
      const use = known || free;
      if (!use) return null;
      return {
        vx: use.vx, vy: use.vy, n: t.length, angle: angleOf(use.vx, use.vy), // at push-off
        a: free ? free.a : NaN, rms: free ? free.rms : Infinity, mPerPx: free ? (G / (2 * free.a)) * toUsual(takeoff) : NaN,
      };
    };
    // gravity as a ruler, when the person's height is not given: only when the parabola fits well and roughly
    // agrees with the body model (a slowed-down video or a moving camera breaks it)
    T.useGravity = fit => {
      if (!fit || T.scaleSource === 'height' || !Number.isFinite(mPerPxPose)) return false;
      const r = fit.mPerPx / mPerPxPose;
      if (fit.rms > 0.01 * g.bodyH || r < 0.85 || r > 1.18) return false;
      T.setScale(fit.mPerPx, 'gravity');
      return true;
    };
    return T;
  }

  return { LM, POINTS, SERIES, seriesOf, com, despike, fillGaps, smooth, build };
})();
