// Muscle output estimated from the video, without a force plate or EMG:
//  1. the push on the floor, from how the centre of mass speeds up and slows down: F = m·(g + a);
//  2. each joint's turning force (moment), from that push and how far the joint sits from its line of action
//     (the weight and inertia of the leg segments are left out, a usual simplification when standing on both feet);
//  3. joint power = moment × joint speed: positive while the muscles shorten and push, negative while they brake
//     as they are stretched;
//  4. each muscle's part of its joint's output, from its size (cross-section), as a guide.
// Values are per kilogram of body mass and for both legs together, in the plane the body moves in (front-back).
window.KinemaKinetics = (() => {
  const TP = window.KinemaTrajectory, LM = TP.LM, G = 9.81;
  const JOINTS = ['hip', 'knee', 'ankle'];

  // joint actions and the muscles doing them, with each one's part of the work (relative cross-section)
  const GROUPS = {
    hip: { ja: '股関節を伸ばす', members: { glute_max: 0.45, adductor_magnus: 0.25, semimembranosus: 0.12, biceps_femoris: 0.1, semitendinosus: 0.08 } },
    knee: { ja: '膝を伸ばす', members: { vastus_lateralis: 0.35, vastus_medialis: 0.25, vastus_intermedius: 0.25, rectus_femoris: 0.15 } },
    ankle: { ja: '足首を伸ばす（つま先で押す）', members: { soleus: 0.55, gastrocnemius: 0.3, tibialis_posterior: 0.08, fibularis_longus: 0.07 } },
    trunk: { ja: '背中をまっすぐ保つ', members: { erector_spinae: 0.75, multifidus: 0.25 } },
  };
  const groupOf = id => Object.keys(GROUPS).find(g => id in GROUPS[g].members) || null;
  // turning force (N·m/kg) shown as full colour on the figure
  const REF = { hip: 2.5, knee: 2.5, ankle: 2.0, trunk: 1.5 };

  // who does what in each movement (prime movers, synergists, stabilizers)
  const ROLES = {
    squat: {
      prime: ['glute_max', 'vastus_lateralis', 'vastus_medialis', 'vastus_intermedius', 'rectus_femoris'],
      synergist: ['adductor_magnus', 'semimembranosus', 'biceps_femoris', 'semitendinosus', 'soleus', 'gastrocnemius'],
      stabilizer: ['erector_spinae', 'multifidus', 'transversus_abdominis', 'internal_oblique', 'glute_med', 'tibialis_anterior'],
    },
    jump: {
      prime: ['glute_max', 'vastus_lateralis', 'vastus_medialis', 'vastus_intermedius', 'rectus_femoris', 'soleus', 'gastrocnemius'],
      synergist: ['adductor_magnus', 'semimembranosus', 'biceps_femoris', 'semitendinosus', 'tibialis_posterior', 'fibularis_longus', 'deltoid_anterior'],
      stabilizer: ['erector_spinae', 'multifidus', 'transversus_abdominis', 'glute_med', 'foot_intrinsic'],
    },
    broad: {
      prime: ['glute_max', 'semimembranosus', 'biceps_femoris', 'semitendinosus', 'vastus_lateralis', 'vastus_medialis', 'soleus', 'gastrocnemius'],
      synergist: ['adductor_magnus', 'vastus_intermedius', 'rectus_femoris', 'tibialis_posterior', 'deltoid_anterior', 'latissimus_dorsi'],
      stabilizer: ['erector_spinae', 'multifidus', 'transversus_abdominis', 'rectus_abdominis', 'glute_med'],
    },
  };
  const ROLE = {
    prime: { ja: '主動作筋', note: 'メインで力を出して、動きを生み出す筋肉' },
    synergist: { ja: '補助筋', note: '主動作筋を助けて、同じ向きに力を出す筋肉' },
    stabilizer: { ja: '安定筋', note: '関節や姿勢を安定させて、力が逃げないように支える筋肉' },
  };
  // what the muscles without a number do
  const NO_NUMBER = {
    transversus_abdominis: 'お腹を固めて体幹を安定させる', internal_oblique: 'お腹を固めて体幹を安定させる', rectus_abdominis: '体幹を固め、着地で体が後ろに倒れないよう支える',
    glute_med: '骨盤を水平に保ち、膝が内側に入らないよう支える', tibialis_anterior: '足首を安定させ、すねを前に引き寄せる',
    foot_intrinsic: '足裏のアーチを保ち、床をつかむ', deltoid_anterior: '腕を前上方へ振り上げる', latissimus_dorsi: '腕を後ろへ大きく引く',
  };
  const PHASES = {
    squat: { ecc: '下ろす（ブレーキ）', con: '上がる（押す）' },
    jump: { ecc: '沈み込み（ブレーキ）', con: '踏み切り（押す）', land: '着地（受け止め）' },
    broad: { ecc: '沈み込み（ブレーキ）', con: '踏み切り（押す）', land: '着地（受け止め）' },
  };

  const mid = (a, b) => a.map((v, k) => (v + b[k]) / 2);
  const lerp = (a, b, u) => a.map((v, k) => v + (b[k] - v) * u);
  // centre of mass of the head, trunk and arms (de Leva 1996), the load the back muscles hold up
  const UPPER = [
    [0.0694, P => mid(P(LM.lEar), P(LM.rEar))],
    [0.4346, P => lerp(mid(P(LM.lSh), P(LM.rSh)), mid(P(LM.lHip), P(LM.rHip)), 0.4486)],
    ...['l', 'r'].flatMap(s => [
      [0.0271, P => lerp(P(LM[`${s}Sh`]), P(LM[`${s}El`]), 0.5772)],
      [0.0162, P => lerp(P(LM[`${s}El`]), P(LM[`${s}Wr`]), 0.4574)],
      [0.0061, P => P(LM[`${s}Wr`])],
    ]),
  ];
  const UPPER_MASS = UPPER.reduce((s, [m]) => s + m, 0);
  function upperCom(P) {
    let acc = [0, 0, 0];
    for (const [m, at] of UPPER) acc = acc.map((v, k) => v + at(P)[k] * m);
    return acc.map(v => v / UPPER_MASS);
  }
  // rate of change (per second); ends and gaps take the one-sided difference
  function deriv(a, fs) {
    const d = new Float64Array(a.length).fill(NaN);
    for (let i = 0; i < a.length; i++) {
      const p = a[i - 1], q = a[i + 1];
      if (Number.isFinite(p) && Number.isFinite(q)) d[i] = (q - p) * fs / 2;
      else if (Number.isFinite(q) && Number.isFinite(a[i])) d[i] = (q - a[i]) * fs;
      else if (Number.isFinite(p) && Number.isFinite(a[i])) d[i] = (a[i] - p) * fs;
    }
    return d;
  }
  const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const clean = (a, fs, fc = 6) => {
    a.set(TP.despike(a));
    TP.fillGaps(a, Math.round(0.25 * fs));
    return TP.smooth(a, fs, fc);
  };

  // c: analysis context, out: what the movement's analysis found (phases, flights, weightKg)
  function compute(c, out, move) {
    const T = c.traj, F = c.frames, n = F.length, fs = c.fps;
    if (!T || !out.phases || !out.phases.length) return null;
    const k = T.mPerPx / T.mPerPxPose; // the AI's body model → the person's real size
    if (!Number.isFinite(k) || k <= 0) return null;
    const legs = c.side === 'l' ? ['l'] : c.side === 'r' ? ['r'] : ['l', 'r'];

    // body positions in the plane the body moves in: u forward (the way the body faces), v up
    const sag = new Array(n).fill(null);
    const ang = { hip: new Float64Array(n).fill(NaN), knee: new Float64Array(n).fill(NaN), ankle: new Float64Array(n).fill(NaN) };
    for (let i = 0; i < n; i++) {
      const f = F[i];
      if (!f.ok || !f.w) continue;
      const P = j => [f.w[j * 3], -f.w[j * 3 + 1], -f.w[j * 3 + 2]];
      // forward (x, z). Filmed from the side it lies across the picture, the direction the AI reads best; otherwise it
      // is a quarter turn from the body's left-to-right line (in a side view that line runs along the depth it reads worst)
      const across = [0, 2].map(a => P(LM.lSh)[a] - P(LM.rSh)[a] + P(LM.lHip)[a] - P(LM.rHip)[a]);
      const len = Math.hypot(across[0], across[1]) || 1;
      const fw = c.view === 'side' ? [T.dirX, 0] : [-across[1] / len, across[0] / len];
      const uv = p => [p[0] * fw[0] + p[2] * fw[1], p[1]];
      const leg = name => {
        const pts = legs.map(s => uv(P(LM[`${s}${name}`])));
        return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
      };
      const s = { ank: leg('An'), kn: leg('Kn'), hip: leg('Hip'), heel: leg('Heel'), toe: leg('Ft'), com: uv(TP.com(P)), upper: uv(upperCom(P)) };
      sag[i] = s;
      const pick = (l, r) => (legs.length === 2 ? (f.m.ang[l] + f.m.ang[r]) / 2 : f.m.ang[legs[0] === 'l' ? l : r]);
      ang.hip[i] = pick('lHip', 'rHip');
      ang.knee[i] = pick('lKn', 'rKn');
      // ankle: angle between the shin (up to the knee) and the foot (forward to the toes); larger = on the toes
      const a = [s.kn[0] - s.ank[0], s.kn[1] - s.ank[1]], b = [s.toe[0] - s.ank[0], s.toe[1] - s.ank[1]];
      ang.ankle[i] = Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / ((Math.hypot(...a) * Math.hypot(...b)) || 1)))) * 180 / Math.PI;
    }

    // the push on the floor (N per kg, both feet): zero in the air
    const air = new Uint8Array(n);
    for (const fl of out.flights || []) for (let i = fl.takeoff; i < fl.land && i < n; i++) air[i] = 1;
    const vUp = clean(deriv(Float64Array.from(T.m.com.y), fs), fs), aUp = clean(deriv(vUp, fs), fs);
    const sideways = c.view === 'front'; // the camera does not see forward-back movement then
    // forward movement is smoothed more: its second derivative is noisy, and at hip height it would swing the moments
    const vFwd = sideways ? new Float64Array(n) : clean(deriv(Float64Array.from(T.m.com.x), fs), fs, 4);
    const aFwd = sideways ? new Float64Array(n) : clean(deriv(vFwd, fs), fs, 4);
    const Fv = new Float64Array(n).fill(NaN), Fu = new Float64Array(n).fill(NaN), cop = new Float64Array(n).fill(NaN);
    const M = { hip: new Float64Array(n).fill(NaN), knee: new Float64Array(n).fill(NaN), ankle: new Float64Array(n).fill(NaN), trunk: new Float64Array(n).fill(NaN) };
    for (let i = 0; i < n; i++) {
      const s = sag[i];
      if (!s || !Number.isFinite(aUp[i])) continue;
      let fv = air[i] ? 0 : G + aUp[i], fu = air[i] ? 0 : aFwd[i] || 0;
      if (fv <= 0) { fv = 0; fu = 0; }
      Fv[i] = fv; Fu[i] = fu;
      // where the push acts: on the line through the centre of mass (the body hardly spins while pushing),
      // kept within the foot (on the ball of the foot with the heel up)
      const floor = Math.min(s.heel[1], s.toe[1]);
      const heelUp = (s.heel[1] - floor) * k > 0.025;
      const ball = s.heel[0] + 0.72 * (s.toe[0] - s.heel[0]);
      const lo = heelUp ? Math.min(ball, s.toe[0]) : Math.min(s.heel[0], s.toe[0]);
      const hi = heelUp ? Math.max(ball, s.toe[0]) : Math.max(s.heel[0], s.toe[0]);
      const free = fv > 0 ? s.com[0] - (s.com[1] - floor) * fu / fv : s.com[0];
      const p = Math.max(lo, Math.min(hi, free));
      cop[i] = p;
      const d = (a, b) => (a - b) * k, h = q => (q[1] - floor) * k;
      // A push the foot cannot carry through the centre of mass (forward speed read from the video overstates it, at
      // hip height): the line from the foot through the centre of mass gives its forward part for the moments.
      const reach = s.com[1] - floor;
      const fl = p !== free && reach > 0 ? fv * (s.com[0] - p) / reach : fu;
      // the muscles' turning force that balances the push about each joint (positive = extending)
      M.ankle[i] = d(p, s.ank[0]) * fv + h(s.ank) * fl;
      M.knee[i] = d(s.kn[0], p) * fv - h(s.kn) * fl;
      M.hip[i] = d(p, s.hip[0]) * fv + h(s.hip) * fl;
      // the back: the head, trunk and arms leaning in front of the hips
      M.trunk[i] = UPPER_MASS * fv * d(s.upper[0], s.hip[0]);
    }
    for (const j of [...JOINTS, 'trunk']) clean(M[j], fs);
    // joint speed (rad/s, positive = extending) and power (W/kg)
    const w = {
      hip: deriv(clean(ang.hip, fs), fs).map(v => -v * Math.PI / 180),
      knee: deriv(clean(ang.knee, fs), fs).map(v => -v * Math.PI / 180),
      ankle: deriv(clean(ang.ankle, fs), fs).map(v => v * Math.PI / 180),
    };
    const P = Object.fromEntries(JOINTS.map(j => [j, M[j].map((m, i) => m * w[j][i])]));
    const Pcom = Fv.map((f, i) => f * vUp[i] + Fu[i] * vFwd[i]);
    // Work adds up the power over 0.2 s at a time: the AI's joint angles jitter, and every swing of a jitter would
    // otherwise count as work done or absorbed. What a joint really does lasts longer than that.
    const steady = Object.fromEntries(JOINTS.map(j => {
      const a = P[j], reach = Math.round(0.1 * fs);
      return [j, a.map((_, i) => {
        let sum = 0, n = 0;
        for (let q = Math.max(0, i - reach); q <= Math.min(a.length - 1, i + reach); q++) if (Number.isFinite(a[q])) { sum += a[q]; n++; }
        return n ? sum / n : NaN;
      })];
    }));

    // per kind of phase (squats: averaged over the repetitions)
    const summary = {};
    for (const kind of ['con', 'ecc', 'land']) {
      const list = out.phases.filter(ph => ph.kind === kind);
      if (!list.length) continue;
      const s = { kind, ja: PHASES[move][kind], count: list.length, peak: {}, work: {}, share: {}, peakPower: 0, phases: list };
      for (const j of [...JOINTS, 'trunk']) s.work[j] = 0;
      // the peaks are those of the repetition in the middle, not of the one odd moment in the whole video
      const tops = Object.fromEntries([...JOINTS, 'trunk'].map(j => [j, []])), powers = [];
      for (const ph of list) {
        const top = Object.fromEntries([...JOINTS, 'trunk'].map(j => [j, 0]));
        let power = 0;
        for (let i = ph.i0; i <= ph.i1; i++) {
          for (const j of [...JOINTS, 'trunk']) if (Number.isFinite(M[j][i])) top[j] = Math.max(top[j], M[j][i]);
          for (const j of JOINTS) {
            const p = steady[j][i];
            // pushing phases count the work done, braking phases the work absorbed
            if (Number.isFinite(p)) s.work[j] += (kind === 'con' ? Math.max(0, p) : Math.max(0, -p)) / fs;
          }
          if (Number.isFinite(Pcom[i])) power = Math.max(power, Pcom[i]);
        }
        for (const j of [...JOINTS, 'trunk']) tops[j].push(top[j]);
        powers.push(power);
      }
      for (const j of [...JOINTS, 'trunk']) s.peak[j] = median(tops[j]);
      s.tops = tops; // the peak of each repetition, to set one against the middle value
      s.peakPower = median(powers);
      for (const j of JOINTS) s.work[j] /= list.length;
      const total = JOINTS.reduce((t, j) => t + s.work[j], 0);
      for (const j of JOINTS) s.share[j] = total > 0 ? s.work[j] / total : 0;
      s.totalWork = total;
      summary[kind] = s;
    }

    const roles = ROLES[move];
    const muscles = Object.entries(roles).flatMap(([role, ids]) => ids.map(id => {
      const g = groupOf(id);
      const members = g ? GROUPS[g].members : null;
      return { id, role, group: g, share: g ? members[id] / Object.values(members).reduce((a, b) => a + b, 0) : 0, note: NO_NUMBER[id] || '' };
    }));
    const K = { n, fs, M, P, w, ang, Fv, Fu, cop, vUp, vFwd, Pcom, sideways, summary, muscles, k, checks: [] };
    K.checks = hints(c, K, move, out);
    return K;
  }

  // ---------- what the balance of the output shows ----------
  const pct = v => Math.round(v * 100);
  const NONE = { weak: [], tight: [] };
  function card(id, title, status, value, target, detail, extra = {}) {
    return { id, title, status, value, target, detail, t: null, muscles: NONE, cues: [], form: [], drills: [], ...extra };
  }
  function hints(c, K, move, out) {
    const F = c.frames, list = [];
    const con = K.summary.con;
    const tAt = s => (s ? F[s.phases[0].i0].t : null);
    if (con && con.totalWork > 0) {
      const { hip, knee, ankle } = con.share;
      const value = `股関節 ${pct(hip)}%・膝 ${pct(knee)}%・足首 ${pct(ankle)}%`;
      if (move === 'squat') {
        // with room for error: on real videos the split between hip and knee is good to about ±20 points
        const s = knee >= 0.72 ? 'warn' : hip >= 0.75 ? 'warn' : 'good';
        list.push(card('k_balance', '出力のバランス（股関節と膝）', s, value, '股関節と膝がそれぞれ25%以上',
          s === 'good' ? '立ち上がるとき、お尻（股関節）と太もも前（膝）の両方で力を出せています。'
            : knee >= 0.72 ? '膝を伸ばす力（太もも前）に頼って立ち上がっています。お尻の筋肉をあまり使えていません。膝への負担も大きくなります。'
              : '股関節を伸ばす力（お尻・太もも裏）に頼り、上半身を前に倒して立ち上がっています。腰に負担がかかりやすい形です。',
          { t: tAt(con),
            muscles: s === 'good' ? NONE : knee >= 0.72 ? { weak: ['glute_max', 'adductor_magnus', 'biceps_femoris'], tight: [] } : { weak: ['vastus_lateralis', 'vastus_medialis', 'vastus_intermedius'], tight: ['erector_spinae'] },
            cues: knee >= 0.72 ? ['お尻を後ろに引きながらしゃがむ', '立つときは、お尻で床を押し返す意識'] : ['胸を起こしたまま立つ', '膝で床を押して、太もも前で立ち上がる'],
            form: ['股関節と膝を同時に曲げ、同時に伸ばす'],
            drills: knee >= 0.72 ? ['ボックススクワット', 'ヒップヒンジの練習', 'ルーマニアンデッドリフト'] : ['ゴブレットスクワット', 'かかとを少し上げたスクワット'] }));
      } else {
        // Judged on the hip and the knee only, with room for error: on real videos the ankle's share does not hold up
        // (the AI reads the foot poorly), and the split between hip and knee is good to about ±20 points.
        const lowHip = hip < (move === 'broad' ? 0.3 : 0.2), highKnee = knee > 0.65;
        const s = lowHip || highKnee ? 'warn' : 'good';
        list.push(card('k_balance', '出力のバランス（踏み切り）', s, value, move === 'broad' ? '股関節30%以上' : '股関節20%以上・膝65%以下',
          s === 'good' ? (move === 'broad' ? '前に跳ぶ主役である、お尻（股関節）の力をしっかり使えています。' : 'お尻（股関節）と太もも前（膝）の両方で力を出して跳べています。')
            : lowHip ? `お尻と太もも裏（股関節）の出力が小さく、${move === 'broad' ? '前に跳ぶ主役の筋肉を使い切れていません。' : '大きな筋肉の力を跳躍に生かせていません。'}`
              : '膝を伸ばす力（太もも前）に頼って跳んでいます。お尻の力も合わせると、もっと高く（遠くへ）跳べます。',
          { t: tAt(con),
            muscles: s === 'good' ? NONE : lowHip ? { weak: ['glute_max', 'biceps_femoris', 'semimembranosus'], tight: [] } : { weak: ['glute_max', 'biceps_femoris'], tight: [] },
            cues: lowHip ? ['お尻を後ろに引いて沈み、お尻で床を押す'] : ['お尻・膝・足首の順に、すばやく伸ばし切る'],
            form: ['股関節 → 膝 → 足首の順に力をつなげる'],
            drills: lowHip ? ['ヒップスラスト', 'ケトルベルスイング'] : ['ジャンプスクワット（股関節から）', 'ヒップスラスト'] }));
      }
      // Top athletes jump at about 70 W/kg. Above what a body can do, the figure says something about the video, not the person.
      if (con.peakPower > 80) {
        list.push(card('k_power', '体全体の最大パワー', 'info', '推定できませんでした', '同じ撮り方で記録を比べる目安',
          '動画から計算した値が、人の体で出せる範囲を超えました（速い動きが動画のコマの間で飛んでいると起こります）。誤った数字を見せないよう、表示していません。コマ数の多い設定（60fps など）で撮ると、推定しやすくなります。', { t: tAt(con) }));
      } else if (con.peakPower > 0) {
        const kg = out.weightKg;
        list.push(card('k_power', '体全体の最大パワー', 'info', `${con.peakPower.toFixed(1)} W/kg${kg ? `（体重${kg}kgで約 ${Math.round(con.peakPower * kg)} W）` : ''}`, '同じ撮り方で記録を比べる目安',
          '押す動きのあいだに、体全体が出した最大のパワー（床を押す力 × 体の速さ）です。トレーニングの前後で比べると、伸びがわかります。', { t: tAt(con) }));
      }
    }
    // How the landing is taken, from how far the hips and the knees bend after touching down. The angles are read
    // directly from the video; the shares of work on landing are too sensitive to small errors to judge from.
    if (move !== 'squat' && K.summary.land) {
      const lands = K.summary.land.phases, ph = lands[Math.floor(lands.length / 2)];
      const gain = (a, p) => {
        let first = NaN, top = -Infinity;
        for (let i = p.i0; i <= p.i1; i++) if (Number.isFinite(a[i])) { if (!Number.isFinite(first)) first = a[i]; top = Math.max(top, a[i]); }
        return Number.isFinite(first) ? top - first : 0;
      };
      // over several jumps, the landing in the middle of each
      const dh = median(lands.map(p => gain(K.ang.hip, p))), dk = median(lands.map(p => gain(K.ang.knee, p))), part = dh + dk > 0 ? dh / (dh + dk) : 0;
      if (dh + dk >= 15) {
        const s = part >= 0.35 ? 'good' : part >= 0.2 ? 'warn' : 'bad';
        list.push(card('k_absorb', '着地の受け止め方（股関節と膝）', s, `着地後に曲げた角度：股関節 ${Math.round(dh)}°・膝 ${Math.round(dk)}°`, '股関節も膝と同じくらい曲げる',
          s === 'good' ? '着地で、お尻（股関節）と膝の両方を曲げて衝撃を受け止められています。膝にやさしい着地です。'
            : '着地で膝ばかりが曲がり、お尻（股関節）があまり曲がっていません。太もも前（膝）に負担が集まりやすく、膝のけがにつながりやすい形です。',
          { t: F[ph.i0].t,
            muscles: s === 'good' ? NONE : { weak: ['glute_max', 'biceps_femoris', 'semimembranosus'], tight: [] },
            cues: ['着地でお尻を後ろに引き、股関節から曲げて受け止める'], form: ['膝と股関節を同時に曲げる'],
            drills: ['ドロップ着地（股関節から曲げてピタッと止まる）', 'ルーマニアンデッドリフト'] }));
      }
    }
    // the back holds the leaning upper body through a squat (in a jump the push itself loads it briefly)
    const back = move === 'squat' ? Math.max(con ? con.peak.trunk : 0, K.summary.ecc ? K.summary.ecc.peak.trunk : 0) : 0;
    if (back > 0) {
      // at a bodyweight squat with the trunk leaning about 40°, this comes to around 2
      const s = back <= 2.5 ? 'good' : back <= 3.5 ? 'warn' : 'bad';
      list.push(card('k_back', '背中（腰）にかかる力', s, `最大 ${back.toFixed(2)} N·m/kg`, '2.5 N·m/kg 以下',
        s === 'good' ? '上半身の前傾がほどよく、背中の筋肉への負担は大きくありません。'
          : '上半身が前に倒れ、背中の筋肉（脊柱起立筋）が上半身の重さを強く支えています。腰を痛めやすい形です。',
        { t: tAt(con),
          muscles: s === 'good' ? NONE : { weak: ['erector_spinae', 'transversus_abdominis', 'glute_max'], tight: [] },
          cues: ['胸を起こし、お腹を固めたまま動く'], form: ['背中は丸めず、まっすぐのまま股関節から曲げる'],
          drills: ['プランク', 'バードドッグ', 'ゴブレットスクワット'] }));
    }
    // The output is worked out in the plane the body moves in, which a camera from the front or at an angle hardly sees.
    // From such a video the figures stay as a rough guide, without a verdict or muscles to work on.
    if (c.view !== 'side') {
      const ABOUT = {
        k_balance: '押す動きで、どの関節がどれくらい仕事をしたかの割合です。',
        k_absorb: '着地のあと、股関節と膝がどれくらい曲がったかです。',
        k_back: '上半身の重さを支えるために、背中の筋肉にかかる力です。',
      };
      for (const h of list) {
        if (!ABOUT[h.id]) continue;
        Object.assign(h, { status: 'info', muscles: NONE, cues: [], form: [], drills: [], target: '評価は真横から撮った動画で行います',
          detail: `${ABOUT[h.id]}正面や斜めからの動画では前後の動きを読み取りにくいため、大まかな目安です。真横から撮ると、この項目も評価できます。` });
      }
    }
    return list;
  }

  return { GROUPS, REF, ROLE, ROLES, PHASES, groupOf, compute };
})();
