// The turning force at each joint in any movement, as far as a video allows.
// Arms hang free: the force at the shoulder and elbow follows from the weight of the arm and how it speeds up
// (moment = Σ r × m(a − g), segment masses from de Leva 1996, as a share of body mass). A racket or a weight in the hand is
// not known and not counted. Legs and back come from the push on the floor (js/kinetics.js).
// Everything here is per kilogram of body mass. A 30 fps video smooths the fastest moments, so peaks read low.
// Which muscles: from the joint and the direction of its force, using js/body-knowledge.js. How a joint's force is shared
// among its muscles cannot be seen, so the arm's muscles get no shares.
window.KinemaOutput = (() => {
  const TP = window.KinemaTrajectory, LM = TP.LM, G = 9.81;
  const MASS = { upper: 0.0263, fore: 0.015, hand: 0.00585 }; // de Leva 1996, the middle of the values for men and women
  const COM = { upper: 0.5772, fore: 0.4574 };
  // what counts as a strong force at each joint (N·m/kg), to compare joints of very different size
  const STRONG = { shoulder: 0.5, elbow: 0.25, hip: 2.5, knee: 2.5, ankle: 2.0, trunk: 1.5 };
  // beyond what arms produce even in elite throwing: the video misread something, so no number is given
  const LIMIT = { shoulder: 2, elbow: 1 };
  const JA = { shoulder: '肩', elbow: '肘', hip: '股関節', knee: '膝', ankle: '足首', trunk: '体幹' };

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const FC = 8;
  function clean(a, fs) {
    const out = Float64Array.from(a);
    out.set(TP.despike(out));
    TP.fillGaps(out, Math.round(0.25 * fs));
    return TP.smooth(out, fs, FC);
  }
  function rate(a, fs) {
    const d = new Float64Array(a.length).fill(NaN);
    for (let i = 1; i < a.length - 1; i++) if (Number.isFinite(a[i - 1]) && Number.isFinite(a[i + 1])) d[i] = (a[i + 1] - a[i - 1]) * fs / 2;
    return d;
  }
  // one point's path, its acceleration, in metres
  function track(F, id, k, fs) {
    const axes = [0, 1, 2].map(ax => clean(F.map(f => (f && f.ok && f.w ? f.w[id * 3 + ax] * k : NaN)), fs));
    return { at: i => axes.map(a => a[i]), ax: axes };
  }
  function segmentAcc(A, B, u, fs) {
    const axes = [0, 1, 2].map(ax => {
      const p = A.ax[ax].map((v, i) => v + (B.ax[ax][i] - v) * u);
      return rate(rate(p, fs), fs);
    });
    return i => axes.map(a => a[i]);
  }

  // shoulder and elbow of one arm, frame by frame
  function arm(F, side, k, fs) {
    const n = F.length, S = track(F, LM[`${side}Sh`], k, fs), E = track(F, LM[`${side}El`], k, fs), W = track(F, LM[`${side}Wr`], k, fs);
    const hip = track(F, LM[`${side}Hip`], k, fs);
    const aU = segmentAcc(S, E, COM.upper, fs), aF = segmentAcc(E, W, COM.fore, fs), aH = segmentAcc(W, W, 0, fs);
    const gravity = [0, G, 0]; // the pose model's y runs downward
    const shoulder = new Float64Array(n).fill(NaN), elbow = new Float64Array(n).fill(NaN), plane = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const s = S.at(i), e = E.at(i), w = W.at(i), h = hip.at(i);
      if (![...s, ...e, ...w, ...h].every(Number.isFinite)) continue;
      const pU = lerp(s, e, COM.upper), pF = lerp(e, w, COM.fore), parts = [[pF, aF(i), MASS.fore], [w, aH(i), MASS.hand]];
      if (![...aF(i), ...aH(i), ...aU(i)].every(Number.isFinite)) continue;
      const about = (j, list) => list.reduce((M, [p, acc, m]) => {
        const c = cross(sub(p, j), sub(acc, gravity).map(v => v * m));
        return [M[0] + c[0], M[1] + c[1], M[2] + c[2]];
      }, [0, 0, 0]);
      const mE = about(e, parts), mS = about(s, [[pU, aU(i), MASS.upper], ...parts]);
      // positive: bending the elbow; positive: raising the arm away from the trunk
      elbow[i] = dot(mE, norm(cross(sub(w, e), sub(s, e))));
      shoulder[i] = dot(mS, norm(cross(sub(h, s), sub(e, s))));
      plane[i] = sub(e, s);
    }
    return { shoulder, elbow, plane };
  }

  function angleRate(F, keys, fs) {
    const a = clean(F.map(f => (f && f.m && f.m.ang ? keys.reduce((s, k) => s + f.m.ang[k], 0) / keys.length : NaN)), fs);
    return rate(a, fs).map(v => v * Math.PI / 180);
  }
  // forward or sideways: which of flexion and abduction the raised arm is doing
  function armPlane(F, i, side, u) {
    const f = F[i];
    if (!f || !f.w || !u) return 'front';
    const at = id => [f.w[id * 3], f.w[id * 3 + 1], f.w[id * 3 + 2]];
    const across = norm(sub(at(LM.lSh), at(LM.rSh)));
    return Math.abs(dot(norm(u), across)) > 0.7 ? 'side' : 'front';
  }

  function muscleSet(joint, sign, plane) {
    const B = window.KINEMA_BODY;
    if (!B) return null;
    const pick = {
      elbow: ['elbow', sign > 0 ? 'flex' : 'extend'],
      shoulder: ['shoulder', sign > 0 ? (plane === 'side' ? 'abduct' : 'flex') : (plane === 'side' ? 'adduct' : 'extend')],
      hip: ['hip', sign > 0 ? 'extend' : 'flex'], knee: ['knee', sign > 0 ? 'extend' : 'flex'], ankle: ['ankle', sign > 0 ? 'plantar' : 'dorsi'], trunk: ['trunk', sign > 0 ? 'extend' : 'flex'],
    }[joint];
    const mv = B.move(pick[0], pick[1]);
    return mv ? { ja: mv.ja, prime: mv.prime, assist: mv.assist } : null;
  }

  function compute(F, Q, fs, legs) {
    const n = F.length;
    if (!Q || !Q.bouts) return null;
    const k = legs && legs.k > 0 ? legs.k : 1;
    const arms = { l: arm(F, 'l', k, fs), r: arm(F, 'r', k, fs) };
    const speed = {
      l: { shoulder: angleRate(F, ['lSh'], fs), elbow: angleRate(F, ['lEl'], fs) },
      r: { shoulder: angleRate(F, ['rSh'], fs), elbow: angleRate(F, ['rEl'], fs) },
    };
    const series = hand => ({
      shoulder: arms[hand].shoulder, elbow: arms[hand].elbow,
      hip: legs ? legs.M.hip : null, knee: legs ? legs.M.knee : null, ankle: legs ? legs.M.ankle : null, trunk: legs ? legs.M.trunk : null,
    });
    const power = (hand, joint, i) => {
      if (joint === 'shoulder' || joint === 'elbow') return arms[hand][joint][i] * speed[hand][joint][i];
      return legs && legs.P[joint] ? legs.P[joint][i] : NaN;
    };
    const moving = Q.bouts.filter(b => b.kind !== 'walk');
    const bouts = moving.map(b => {
      const S = series(b.hand), joints = [];
      for (const j of ['shoulder', 'elbow', 'hip', 'knee', 'ankle', 'trunk']) {
        const s = S[j];
        if (!s) continue;
        let best = 0, at = -1, work = 0;
        for (let i = b.a; i <= b.b; i++) {
          if (!Number.isFinite(s[i])) continue;
          if (Math.abs(s[i]) > Math.abs(best)) { best = s[i]; at = i; }
          const p = power(b.hand, j, i);
          if (j !== 'trunk' && Number.isFinite(p)) work += Math.max(0, p) / fs;
        }
        if (at < 0) continue;
        const plane = j === 'shoulder' ? armPlane(F, at, b.hand, arms[b.hand].plane[at]) : null;
        const p = power(b.hand, j, at), set = muscleSet(j, best, plane), unsure = Math.abs(best) > (LIMIT[j] || Infinity);
        joints.push({ joint: j, ja: JA[j], peak: Math.abs(best), unsure, sign: Math.sign(best), at, work: unsure ? 0 : work, brake: Number.isFinite(p) && p < 0, strength: Math.abs(best) / STRONG[j], moveJa: set ? set.ja : '', prime: set ? set.prime : [], assist: set ? set.assist : [] });
      }
      const total = joints.reduce((t, x) => t + x.work, 0);
      for (const x of joints) x.share = total > 0 ? x.work / total : 0;
      return { a: b.a, b: b.b, hand: b.hand, kind: b.kind, kindJa: b.kindJa, joints };
    });
    return { n, fs, bouts, arms, legs: legs || null, series, JA, STRONG };
  }
  // the muscles to colour on the figure for one movement: the joints working hardest for their size
  function musclesOf(bout) {
    const map = {};
    if (!bout) return map;
    const B = window.KINEMA_BODY, known = new Set((window.KINEMA_MUSCLES || []).map(m => m.id));
    const ranked = [...bout.joints].filter(j => j.joint !== 'trunk').sort((a, b) => b.strength - a.strength).slice(0, 3);
    for (const id of B ? [...B.TRUNK.stabilitySystem.local.muscles, 'erector_spinae'] : []) if (known.has(id)) map[id] = 'stab';
    for (const j of ranked) for (const id of j.assist) if (known.has(id)) map[id] = 'tight';
    for (const j of ranked) for (const id of j.prime) if (known.has(id)) map[id] = 'weak';
    return map;
  }
  return { compute, musclesOf, MASS, COM, JA };
})();
