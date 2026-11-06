// Movement analysis: turns per-frame pose data into checks with likely weak / tight muscles,
// cues, form points and drills. These are estimates from movement patterns, not measurements
// of muscle force and not a medical diagnosis.
window.KinemaAnalysis = (() => {
  const LM = { nose: 0, lSh: 11, rSh: 12, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28, lHeel: 29, rHeel: 30, lFt: 31, rFt: 32 };

  const MOVES = {
    squat: {
      ja: 'スクワット',
      tips: ['カメラは腰の高さ、2〜3m離して全身が入るように', 'まずは真横から撮るのがおすすめです（深さ・前傾・かかと・筋肉の出力を正確に見られます）。正面からは膝の向きと左右差が分かります', '立った姿勢から始めて、立った姿勢で終わる（途中から写っている回は数えません）', '3〜5回続けて行う'],
    },
    jump: {
      ja: 'ジャンプ（垂直跳び）',
      tips: ['カメラは固定し、跳んだときも頭から足まで入るように少し離す', 'まずは真横から撮るのがおすすめです（沈み込み・伸び切り・筋肉の出力を正確に見られます）。正面からは着地の膝の向きが分かります', '1回ずつ、着地して止まるまで撮る'],
    },
    broad: {
      ja: '立ち幅跳び',
      tips: ['真横から撮る（跳ぶ方向とカメラを直角に）', '踏み切りから着地まで全部が画面に入るよう広めに', 'カメラは腰の高さで固定'],
    },
  };

  // ---------- helpers ----------
  const ok = f => f && f.ok;
  const deg = r => r * 180 / Math.PI;
  const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const round = (v, d = 0) => Number(v.toFixed(d));

  function makeCtx(frames, vw, vh) {
    // a frame without a detected pose gives NaN, never an exception: real videos always have some
    const P = (f, i) => (f.img ? [f.img[i * 2] * vw, f.img[i * 2 + 1] * vh] : [NaN, NaN]);
    const angOf = (f, name) => (f.m && f.m.ang ? f.m.ang[name] : NaN);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const okIdx = frames.map((f, i) => (ok(f) ? i : -1)).filter(i => i >= 0);
    // camera view: shoulder width relative to torso length in the image
    const ratio = median(okIdx.map(i => {
      const f = frames[i];
      const torso = dist(mid(P(f, LM.lSh), P(f, LM.rSh)), mid(P(f, LM.lHip), P(f, LM.rHip)));
      return torso > 1 ? Math.abs(P(f, LM.lSh)[0] - P(f, LM.rSh)[0]) / torso : NaN;
    }));
    const view = ratio < 0.3 ? 'side' : ratio > 0.5 ? 'front' : 'oblique';
    // in a side view only the leg nearer the camera is reliable
    const visL = median(okIdx.map(i => (frames[i].vis[LM.lKn] + frames[i].vis[LM.lAn]) / 2));
    const visR = median(okIdx.map(i => (frames[i].vis[LM.rKn] + frames[i].vis[LM.rAn]) / 2));
    const side = view === 'front' ? 'both' : visL >= visR ? 'l' : 'r';
    const pick = (f, l, r) => (side === 'r' ? P(f, r) : side === 'l' ? P(f, l) : mid(P(f, l), P(f, r)));
    const knee = f => (side === 'both' ? (angOf(f, 'lKn') + angOf(f, 'rKn')) / 2 : angOf(f, `${side}Kn`));
    const hip = f => (side === 'both' ? (angOf(f, 'lHip') + angOf(f, 'rHip')) / 2 : angOf(f, `${side}Hip`));
    const sh = f => Math.max(angOf(f, 'lSh'), angOf(f, 'rSh'));
    const ang = (top, bottom) => deg(Math.atan2(Math.abs(top[0] - bottom[0]), bottom[1] - top[1])); // from vertical
    const pt = (f, name) => ({
      sh: pick(f, LM.lSh, LM.rSh), hip: pick(f, LM.lHip, LM.rHip), kn: pick(f, LM.lKn, LM.rKn),
      an: pick(f, LM.lAn, LM.rAn), heel: pick(f, LM.lHeel, LM.rHeel), toe: pick(f, LM.lFt, LM.rFt),
    })[name];
    const series = fn => frames.map(f => (ok(f) ? fn(f) : NaN));
    const shankPx = median(okIdx.map(i => dist(pt(frames[i], 'kn'), pt(frames[i], 'an'))));
    const shankM = median(okIdx.map(i => {
      const w = frames[i].w, a = side === 'r' ? LM.rKn : LM.lKn, b = side === 'r' ? LM.rAn : LM.lAn;
      return Math.hypot(w[a * 3] - w[b * 3], w[a * 3 + 1] - w[b * 3 + 1], w[a * 3 + 2] - w[b * 3 + 2]);
    }));
    // how the AI reads this person's straight knee and hip in this video: depending on the view, anywhere from about
    // 5° to 30°, so "straight" and "bent" are judged against this rather than against 0°
    const lowEnd = fn => {
      const s = okIdx.map(i => fn(frames[i])).filter(Number.isFinite).sort((x, y) => x - y);
      return s.length ? Math.max(0, s[Math.floor(0.1 * (s.length - 1))]) : 0;
    };
    const rest = { knee: lowEnd(knee), hip: lowEnd(hip) };
    const dt = frames.length > 1 ? frames[1].t - frames[0].t : 0;
    // a reading around frame i, so that one misread frame does not decide
    const around = (i, fn, reach = 2) => {
      const vals = [];
      for (let j = i - reach; j <= i + reach; j++) if (ok(frames[j])) vals.push(fn(frames[j]));
      return median(vals);
    };
    // the lowest point of either foot in the picture: on the floor as long as any part of a foot is
    const lowest = f => {
      let best = [NaN, -Infinity];
      for (const j of [LM.lFt, LM.rFt, LM.lHeel, LM.rHeel]) {
        const p = P(f, j);
        if (p[1] > best[1]) best = p;
      }
      return best;
    };
    return { frames, vw, vh, P, mid, dist, okIdx, view, side, knee, hip, sh, ang, angOf, around, lowest, pt, series, shankPx, shankM, rest, fps: dt > 0 ? 1 / dt : 30 };
  }
  // Seen from the front or at an angle, a bend toward the camera is hard for the AI to read and comes out too small.
  // Such a reading is not enough to call for improvement, and the card says why.
  const VIEW_NOTE = '正面や斜めからの動画では、奥行きの動きを読み取りにくいため、角度が実際より小さく出ることがあります。正確に見るには、真横から撮ってください。';
  const viewStatus = (c, s) => (c.view !== 'side' && s === 'bad' ? 'warn' : s);
  const viewNote = c => (c.view === 'side' ? '' : VIEW_NOTE);

  function smooth(a, k = 2) {
    return a.map((_, i) => {
      const w = [];
      for (let j = i - k; j <= i + k; j++) if (Number.isFinite(a[j])) w.push(a[j]);
      return w.length ? avg(w) : NaN;
    });
  }

  // how lengths were turned from pixels into metres (see KinemaTrajectory)
  const RULER = {
    height: '長さは、入力された身長をもとに換算しています。',
    gravity: '長さは、空中での重心の落ち方（重力）をもとに換算しています。',
    pose: '長さは、AIが推定した体の大きさをもとに換算しています。身長を入力すると、より正確になります。',
  };

  function check(id, title, status, value, target, detail, extra = {}) {
    return { id, title, status, value, target, detail, t: null, muscles: { weak: [], tight: [] }, cues: [], form: [], drills: [], ...extra };
  }

  // knee separation / ankle separation in the image; below ~0.8 the knees cave in.
  // With the ankles nearly in line in the image (the body turned away from the camera) the ratio says nothing.
  function kneeAnkleRatio(c, f) {
    const kn = Math.abs(c.P(f, LM.lKn)[0] - c.P(f, LM.rKn)[0]);
    const an = Math.abs(c.P(f, LM.lAn)[0] - c.P(f, LM.rAn)[0]);
    return an > 0.06 * c.ground.bodyH ? kn / an : NaN;
  }

  // ---------- squat ----------
  // A squat and not a step or a bow: the feet stay where they are, both knees bend together and the hips go down.
  // (A video also has people walking to their place, and every step bends a knee as far as a shallow squat.)
  function isSquat(c, start, bottom, end) {
    const F = c.frames, H = c.ground.bodyH;
    const secs = F[end].t - F[start].t;
    if (!(secs >= 0.4 && secs <= 15)) return false;
    // the middle of both feet, which a mix-up of left and right does not move
    const FEET = [LM.lFt, LM.rFt, LM.lHeel, LM.rHeel];
    const meanOf = (f, ids, k) => ids.reduce((s, j) => s + c.P(f, j)[k], 0) / ids.length;
    const foot = i => [c.around(i, f => meanOf(f, FEET, 0)), c.around(i, f => meanOf(f, FEET, 1))];
    const a = foot(start);
    const moved = Math.max(...[bottom, end].map(i => { const b = foot(i); return Math.hypot(b[0] - a[0], b[1] - a[1]); }));
    if (!(moved <= 0.1 * H)) return false;
    const l = c.around(bottom, f => c.angOf(f, 'lKn')), r = c.around(bottom, f => c.angOf(f, 'rKn'));
    // (leniently: seen from the side, the far leg is read poorly)
    if (Math.min(l, r) < c.rest.knee + 0.3 * (Math.max(l, r) - c.rest.knee)) return false;
    const hipY = i => c.around(i, f => meanOf(f, [LM.lHip, LM.rHip], 1));
    return hipY(bottom) - hipY(start) >= 0.06 * H;
  }

  function squatReps(c) {
    const k = smooth(c.series(c.knee));
    const reps = [];
    let skipped = 0;
    const seen = c.okIdx.map(i => k[i]).filter(Number.isFinite).sort((a, b) => a - b);
    if (!seen.length) return { reps, k, skipped };
    // Measured against what this video shows: the AI's reading of a straight knee and of a deep bend both depend on
    // the view (standing often reads about 20°, a deep squat from the front about 60°). The limits on them keep one
    // very deep moment elsewhere in the video from hiding the ordinary repetitions.
    const rest = seen[Math.floor(0.1 * (seen.length - 1))], deepest = seen[Math.floor(0.98 * (seen.length - 1))], amp = deepest - rest;
    const up = rest + Math.max(8, Math.min(0.25 * amp, 20)), down = rest + Math.max(15, Math.min(0.42 * amp, 35)), enough = rest + Math.max(25, Math.min(0.5 * amp, 40));
    let start = -1, lastLow = -1, bottom = -1, prev = -1;
    // Only frames with a detected pose can be the start, the bottom or the end of a repetition. A repetition counts
    // when it is seen from standing to standing: a person who first appears halfway down, or who is lost for a while
    // during it, gives no real start or bottom.
    for (const i of c.okIdx) {
      if (!Number.isFinite(k[i])) continue;
      if (prev >= 0 && c.frames[i].t - c.frames[prev].t > 0.5) { start = -1; lastLow = -1; }
      prev = i;
      if (start < 0) {
        if (k[i] < up) lastLow = i;
        else if (k[i] > down && lastLow >= 0) { start = lastLow; bottom = i; }
      } else {
        if (k[i] > k[bottom]) bottom = i;
        if (k[i] < up) {
          if (k[bottom] > enough) {
            if (isSquat(c, start, bottom, i)) {
              // the limits above lie partway down: the repetition really starts and ends where the knee starts to
              // bend and has finished straightening
              const near = rest + 5, F = c.frames, prevLimit = reps.length ? reps[reps.length - 1].end : 0;
              let a = start, e = i;
              while (a - 1 > prevLimit && ok(F[a - 1]) && k[a - 1] < k[a] && k[a - 1] > near) a--;
              while (e + 1 < k.length && ok(F[e + 1]) && k[e + 1] < k[e] && k[e + 1] > near) e++;
              reps.push({ start: a, bottom, end: e });
            } else skipped++;
          }
          start = -1; lastLow = i;
        }
      }
    }
    return { reps, k, skipped };
  }

  function analyzeSquat(c) {
    const { reps, k, skipped } = squatReps(c);
    const F = c.frames;
    const checks = [];
    if (!reps.length) {
      return { reps, checks, skipped, error: 'スクワットの動き（しゃがんで立つ）を見つけられませんでした。全身が映った状態で、3〜5回続けて撮ってください。' };
    }
    const at = i => F[i];
    const depths = reps.map(r => c.around(r.bottom, c.knee));
    const hips = reps.map(r => c.around(r.bottom, c.hip));
    const worst = (vals, cmp) => reps[vals.indexOf(cmp(...vals))];
    // the repetition in the middle of the values: what this person usually does, not one odd moment
    const typical = vals => {
      const m = median(vals);
      return reps[vals.indexOf(vals.reduce((b, v) => (Math.abs(v - m) < Math.abs(b - m) ? v : b), vals[0]))];
    };

    // depth
    const depth = median(depths), hipD = median(hips);
    const shallow = worst(depths, Math.min);
    const dStatus = viewStatus(c, depth >= 95 ? 'good' : depth >= 75 ? 'warn' : 'bad');
    checks.push(check('depth', 'しゃがむ深さ', dStatus, `膝 ${round(depth)}°・股関節 ${round(hipD)}°`, '膝 95°以上（太ももが床と平行くらい）',
      dStatus === 'good' ? '十分な深さまでしゃがめています。' : `深さが足りず、お尻と太ももの筋肉を使い切れていない可能性があります。足首の硬さが原因のことも多いです。${viewNote(c)}`,
      { t: F[shallow.bottom].t,
        muscles: dStatus === 'good' ? { weak: [], tight: [] } : { weak: ['glute_max', 'vastus_medialis', 'vastus_lateralis', 'adductor_magnus'], tight: ['soleus', 'gastrocnemius'] },
        cues: ['お尻を少し後ろに引きながら、真下にしゃがむ', '膝はつま先と同じ方向へ前に出してよい'],
        form: ['足幅は肩幅〜やや広め、つま先は少し外向き（15〜30°）', '太ももが床と平行になるまで下ろし、足裏全体で床を押して立つ'],
        drills: ['ゴブレットスクワット（重りを胸の前に持つ）', 'ボックススクワット（台に軽く座る）', '足首のストレッチ（壁に向かって膝を前に出す）'] }));

    // tempo
    const down = median(reps.map(r => F[r.bottom].t - F[r.start].t));
    const up = median(reps.map(r => F[r.end].t - F[r.bottom].t));
    const tStatus = down >= 0.8 ? 'good' : down >= 0.5 ? 'warn' : 'bad';
    checks.push(check('tempo', '下ろすスピード', tStatus, `下ろす ${round(down, 1)}秒・上がる ${round(up, 1)}秒`, '下ろす 1〜2秒',
      tStatus === 'good' ? 'しゃがむ動きをコントロールできています。' : '下ろすのが速く、勢いでしゃがんでいます。筋肉が伸びながら力を出す（ブレーキをかける）力を鍛えにくくなります。',
      { t: F[reps[0].start].t,
        muscles: tStatus === 'good' ? { weak: [], tight: [] } : { weak: ['vastus_lateralis', 'vastus_medialis', 'glute_max', 'transversus_abdominis'], tight: [] },
        cues: ['「2秒かけて下りる、1秒で上がる」', '下でバウンドしない'],
        form: ['息を吸ってお腹を固めてから下りはじめる'],
        drills: ['テンポスクワット（3秒で下ろす）', '一番下で2秒止めるポーズスクワット'] }));

    // depth consistency
    if (reps.length >= 3) {
      // with many repetitions, leaving out the single odd one at each end
      const sorted = [...depths].sort((a, b) => a - b), n = sorted.length;
      const spread = n >= 5 ? sorted[Math.floor(0.9 * (n - 1))] - sorted[Math.ceil(0.1 * (n - 1))] : sorted[n - 1] - sorted[0];
      const sStatus = spread <= 12 ? 'good' : spread <= 22 ? 'warn' : 'bad';
      checks.push(check('consistency', '毎回の深さのそろい方', sStatus, `ばらつき ${round(spread)}°（${reps.length}回）`, '12°以内',
        sStatus === 'good' ? '毎回ほぼ同じ深さでしゃがめています。' : '回によって深さが変わっています。疲れてくると浅くなる場合は、脚の筋持久力が足りない可能性があります。',
        { t: F[shallow.bottom].t, muscles: sStatus === 'good' ? { weak: [], tight: [] } : { weak: ['glute_max', 'vastus_lateralis', 'vastus_medialis'], tight: [] },
          cues: ['毎回、同じ深さの目印（台や床の線）を決める'], form: ['回数よりも、同じフォームを保てる回数で止める'], drills: ['ボックススクワットで深さを固定して練習'] }));
    }

    if (c.view !== 'front') {
      // trunk lean vs shin angle (side view)
      const lean = reps.map(r => c.around(r.bottom, f => c.ang(c.pt(f, 'sh'), c.pt(f, 'hip'))));
      const shin = reps.map(r => c.around(r.bottom, f => c.ang(c.pt(f, 'kn'), c.pt(f, 'an'))));
      const L = median(lean), S = median(shin);
      const lStatus = L <= 45 && L - S <= 15 ? 'good' : L <= 55 && L - S <= 25 ? 'warn' : 'bad';
      checks.push(check('lean', '上半身の前傾', lStatus, `上半身 ${round(L)}°・すね ${round(S)}°`, '上半身 45°以内、すねとほぼ平行',
        lStatus === 'good' ? '上半身とすねの角度のバランスが良く、太ももとお尻の両方を使えています。' : '上半身が前に倒れすぎて、腰や背中に負担が集まりやすい形です。足首の硬さや、お尻・背中の筋力不足が考えられます。',
        { t: F[worst(lean, Math.max).bottom].t,
          muscles: lStatus === 'good' ? { weak: [], tight: [] } : { weak: ['glute_max', 'erector_spinae', 'tibialis_anterior'], tight: ['soleus', 'gastrocnemius', 'iliopsoas'] },
          cues: ['胸を正面に向けたまま下りる', 'すねと上半身を平行にするイメージ'],
          form: ['重心は足の真ん中（土踏まず）の上', '腰を反らせすぎず、背中は一直線に保つ'],
          drills: ['ゴブレットスクワット', '壁に向かって立つウォールスクワット', 'トーレイズ（すねの前の強化）'] }));

      // heel lift (side view): how far the heel rises against the toe, from the start of each repetition to its
      // bottom, in shin lengths of that moment (the person may stand nearer or further from the camera). A few
      // centimetres of it is what the AI's reading of a foot wobbles by.
      const heelGap = i => c.around(i, f => c.pt(f, 'heel')[1] - c.pt(f, 'toe')[1], 3);
      const lifts = reps.map(r => (heelGap(r.start) - heelGap(r.bottom)) / c.around(r.start, f => c.dist(c.pt(f, 'kn'), c.pt(f, 'an')), 3));
      const lift = median(lifts);
      const hStatus = lift <= 0.08 ? 'good' : lift <= 0.15 ? 'warn' : 'bad';
      checks.push(check('heel', 'かかとの浮き', hStatus, `約 ${round(Math.max(0, lift) * c.shankM * 100)} cm`, '浮かない（4cm未満）',
        hStatus === 'good' ? 'かかとが床についたまましゃがめています。' : 'しゃがんだときに、かかとが浮いています。ふくらはぎ（特にヒラメ筋）が硬く、足首が十分に曲がらない可能性があります。',
        { t: F[typical(lifts).bottom].t,
          muscles: hStatus === 'good' ? { weak: [], tight: [] } : { weak: ['tibialis_anterior'], tight: ['soleus', 'gastrocnemius'] },
          cues: ['かかとで床を押し続ける', '足裏の3点（親指の付け根・小指の付け根・かかと）で立つ'],
          form: ['足首を曲げる余裕がないときは、かかとの下に薄い板を置いて練習してもよい'],
          drills: ['ふくらはぎのストレッチ（膝を伸ばす／曲げるの両方）', '壁に向かって膝を前に出す足首ドリル'] }));
    }

    if (c.view !== 'side') {
      // knees caving in (front view)
      // around each bottom, so that one misread frame does not decide
      const kasr = reps.map(r => median([-2, -1, 0, 1, 2].map(d => F[r.bottom + d]).filter(ok).map(f => kneeAnkleRatio(c, f))));
      const K = Math.min(...kasr.filter(Number.isFinite));
      if (Number.isFinite(K)) {
        const vStatus = K >= 0.85 ? 'good' : K >= 0.72 ? 'warn' : 'bad';
        checks.push(check('valgus', '膝の向き（内側に入っていないか）', vStatus, `膝の幅 ÷ 足首の幅 = ${round(K, 2)}`, '0.85以上（膝がつま先の真上）',
          vStatus === 'good' ? '膝がつま先と同じ方向に動いています。' : 'しゃがんだときに膝が内側に入っています。お尻の横の筋肉（中殿筋）の出力不足や、内ももの硬さが考えられます。膝を痛めやすい形です。',
          { t: F[reps[kasr.indexOf(K)].bottom].t,
            muscles: vStatus === 'good' ? { weak: [], tight: [] } : { weak: ['glute_med', 'glute_max', 'vastus_medialis'], tight: ['adductor_longus', 'adductor_magnus', 'tfl', 'vastus_lateralis'] },
            cues: ['膝をつま先の方向へ押し出す', '足で床を外側に引き裂くように力を入れる'],
            form: ['つま先と膝の向きをそろえる（つま先は15〜30°外向き）', '親指の付け根が床から浮かないように'],
            drills: ['膝の上にミニバンドを巻いたスクワット', 'クラムシェル', 'ミニバンドで横歩き（モンスターウォーク）'] }));
      }
      // left / right difference (front view)
      const diff = avg(reps.map(r => Math.abs(at(r.bottom).m.ang.lKn - at(r.bottom).m.ang.rKn)));
      const shift = avg(reps.map(r => {
        const f = at(r.bottom);
        const hipX = (c.P(f, LM.lHip)[0] + c.P(f, LM.rHip)[0]) / 2, anX = (c.P(f, LM.lAn)[0] + c.P(f, LM.rAn)[0]) / 2;
        const hipW = Math.abs(c.P(f, LM.lHip)[0] - c.P(f, LM.rHip)[0]) || 1;
        return (hipX - anX) / hipW;
      }));
      const aStatus = diff <= 8 && Math.abs(shift) <= 0.25 ? 'good' : diff <= 15 && Math.abs(shift) <= 0.4 ? 'warn' : 'bad';
      const toward = shift > 0 ? '画面の右' : '画面の左';
      checks.push(check('symmetry', '左右のバランス', aStatus, `膝の角度差 ${round(diff)}°・お尻のずれ ${round(Math.abs(shift) * 100)}%${aStatus === 'good' ? '' : `（${toward}寄り）`}`, '角度差 8°以内・ずれ 25%以内',
        aStatus === 'good' ? '左右ほぼ均等に体重を乗せられています。' : '左右どちらかに体重が偏っています。弱い側をかばっている可能性があります。',
        { t: F[reps[0].bottom].t,
          muscles: aStatus === 'good' ? { weak: [], tight: [] } : { weak: ['glute_med', 'glute_max', 'quadratus_lumborum'], tight: ['adductor_longus', 'tfl'] },
          cues: ['両足の裏に均等に体重を乗せる', 'おへそを両足の真ん中に保つ'],
          form: ['鏡や正面の動画で、お尻が左右にずれていないか確認する'],
          drills: ['ブルガリアンスクワット（片脚ずつ、弱い側を多めに）', '片脚ルーマニアンデッドリフト'] }));
    }

    return {
      reps: reps.map(r => ({ ...r, t0: F[r.start].t, t1: F[r.end].t, depth: round(c.around(r.bottom, c.knee)) })), checks, skipped, series: k,
      phases: reps.flatMap(r => [{ kind: 'ecc', i0: r.start, i1: r.bottom }, { kind: 'con', i0: r.bottom, i1: r.end }]),
      ...c.attempt(() => trajSquat(c, reps), NO_TRAJ),
    };
  }

  // ---------- floor ----------
  const okBefore = (F, i) => { while (i >= 0 && !ok(F[i])) i--; return i; };
  const okAfter = (F, i) => { while (i < F.length && !ok(F[i])) i++; return i < F.length ? i : -1; };

  // Where the feet rest on the floor (image pixels), from frames where the person stands still. Walking toward
  // or away from the camera moves the feet up and down the image, so frames with moving feet are left out.
  // slope: how much the floor rises across the image when the camera is not level (see floorSlope).
  function ground(c, slope = 0) {
    const F = c.frames, k = Math.max(2, Math.round(0.25 * c.fps));
    const toe = i => c.pt(F[i], 'toe'), heel = i => c.pt(F[i], 'heel');
    const height = i => c.pt(F[i], 'an')[1] - c.P(F[i], LM.nose)[1];
    const standing = c.okIdx.filter(i => c.knee(F[i]) < Math.max(20, c.rest.knee + 12));
    // judged on lightly smoothed positions: the AI's reading of a resting foot jitters by a few pixels
    const tx = smooth(c.series(f => c.pt(f, 'toe')[0])), ty = smooth(c.series(f => c.pt(f, 'toe')[1])), hy = smooth(c.series(f => c.pt(f, 'heel')[1]));
    const still = standing.filter(i => {
      const tol = 0.015 * height(i);
      if (!(tol > 0) || Math.max(ty[i], hy[i]) > 0.985 * c.vh) return false;
      for (let j = Math.max(0, i - k); j <= Math.min(F.length - 1, i + k); j++) {
        if (!ok(F[j])) continue;
        if (Math.abs(tx[j] - tx[i]) > tol || Math.abs(ty[j] - ty[i]) > tol || Math.abs(hy[j] - hy[i]) > tol) return false;
      }
      return true;
    });
    const base = still.length >= Math.max(5, Math.round(0.3 * c.fps)) ? still : standing.length >= 5 ? standing : c.okIdx;
    const bodyH = median(base.map(height));
    const tInt = base.map(i => toe(i)[1] - slope * toe(i)[0]), hInt = base.map(i => heel(i)[1] - slope * heel(i)[0]);
    const lowAt = i => { const p = c.lowest(F[i]); return p[1] - slope * p[0]; };
    const lInt = base.map(lowAt);
    const g = { toe: median(tInt), heel: median(hInt), slope, bodyH, base, still: still.length, localToe: new Float64Array(F.length), localHeel: new Float64Array(F.length), localBody: new Float64Array(F.length), localLow: new Float64Array(F.length) };
    // The floor and the size of the body near each moment, from still frames within 2 s: the person may stand at
    // different distances from the camera, where the floor lies elsewhere in the picture and the body looks bigger or smaller.
    const win = Math.round(2 * c.fps), sizes = base.map(height);
    for (let i = 0, lo = 0, hi = 0; i < F.length; i++) {
      while (lo < base.length && base[lo] < i - win) lo++;
      while (hi < base.length && base[hi] <= i + win) hi++;
      const near = hi - lo >= 5;
      g.localToe[i] = near ? median(tInt.slice(lo, hi)) : g.toe;
      g.localHeel[i] = near ? median(hInt.slice(lo, hi)) : g.heel;
      g.localBody[i] = near ? median(sizes.slice(lo, hi)) : bodyH;
      g.localLow[i] = near ? median(lInt.slice(lo, hi)) : median(lInt);
    }
    // moving to another place changes them gradually: a step here would read as a sudden movement of the body
    const reach = Math.round(0.4 * c.fps);
    for (const key of ['localToe', 'localHeel', 'localBody', 'localLow']) {
      const a = g[key];
      g[key] = a.map((_, i) => {
        let sum = 0, n = 0;
        for (let j = Math.max(0, i - reach); j <= Math.min(a.length - 1, i + reach); j++) if (Number.isFinite(a[j])) { sum += a[j]; n++; }
        return n ? sum / n : NaN;
      });
    }
    // how far the lower foot is above the floor: both feet are off the floor only when this is well above zero
    const lows = Float64Array.from(F, f => {
      if (!ok(f)) return NaN;
      const p = c.lowest(f);
      return slope * p[0] - p[1];
    });
    const read = window.KinemaTrajectory ? window.KinemaTrajectory.despike(lows, 0.01 * bodyH, 2) : lows;
    // Still frames can be far apart in a real video, and where the floor lies in the picture changes as the person moves
    // about on it. The feet show it themselves: within 0.7 s either way the lower foot is on the floor most of the time,
    // even around a flight, which never lasts that long.
    const near = Math.round(0.7 * c.fps);
    g.footFloor = Float64Array.from(read, (v, i) => {
      const vals = [];
      for (let j = Math.max(0, i - near); j <= Math.min(read.length - 1, i + near); j++) if (Number.isFinite(read[j])) vals.push(read[j]);
      if (vals.length < 5) return v;
      vals.sort((a, b) => a - b);
      return vals[Math.floor(0.1 * (vals.length - 1))];
    });
    g.low = Float64Array.from(read, (v, i) => v - g.footFloor[i]);
    return g;
  }
  // A camera that is not level, or not square to the direction of a long jump, makes the floor slope across the image.
  // The person stands still at two places far apart, before take-off and after landing; the line between their feet
  // there is the floor. (Steeper than about 22° means walking toward or away from the camera, not a floor.)
  const MAX_SLOPE = 0.4;
  function slopeBetween(c, before, after) {
    const F = c.frames;
    const at = idx => [0, 1].map(k => median(idx.map(i => c.pt(F[i], 'toe')[k])));
    const p0 = at(before), p1 = at(after), dx = p1[0] - p0[0];
    if (Math.abs(dx) < 0.5 * c.ground.bodyH) return 0;
    const s = (p1[1] - p0[1]) / dx;
    return Math.abs(s) <= MAX_SLOPE ? s : 0;
  }
  function floorSlope(c, fl) {
    const g = c.ground;
    const before = g.base.filter(i => i < fl.takeoff && i >= fl.takeoff - Math.round(2 * c.fps));
    const after = g.base.filter(i => i > fl.land && i <= fl.land + Math.round(2.5 * c.fps));
    return before.length < 5 || after.length < 5 ? 0 : slopeBetween(c, before, after);
  }
  // The same before any jump is known, from every moment a foot is at rest: standing, landing, and each step of walking
  // back. A person going back and forth along a line shows the floor along that line, in a video where they never
  // stand still for long. Without this, a floor that rises across the image hides the jumps.
  function contactSlope(c) {
    const F = c.frames, H = c.ground.bodyH, reach = Math.max(2, Math.round(0.07 * c.fps)), w = 0.12 * H;
    const lx = smooth(c.series(f => c.lowest(f)[0])), ly = smooth(c.series(f => c.lowest(f)[1]));
    const bins = new Map();
    for (const i of c.okIdx) {
      const moved = Math.hypot(lx[i + reach] - lx[i - reach], ly[i + reach] - ly[i - reach]);
      if (!(moved <= 0.012 * H)) continue;
      const key = Math.round(lx[i] / w);
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(ly[i]);
    }
    const pts = [...bins.entries()].filter(([, v]) => v.length >= 3).map(([k, v]) => [k * w, median(v)]);
    // the middle of the slopes between places far apart: a few odd places do not move it
    const slopes = [];
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        const dx = pts[b][0] - pts[a][0];
        if (Math.abs(dx) >= 0.5 * H) slopes.push((pts[b][1] - pts[a][1]) / dx);
      }
    }
    if (!slopes.length) return 0;
    const s = median(slopes);
    return Math.abs(s) >= 0.015 && Math.abs(s) <= MAX_SLOPE ? s : 0;
  }
  // angle above the floor of an image direction (dx, dy with y down), for a floor sloping by s across the image
  const floorAngle = (dx, dy, s) => deg(Math.atan2(dx * s - dy, (Math.sign(dx) || 1) * (dx + dy * s)));
  // length of an image step (dx, dy) measured along the floor
  const alongFloor = (dx, dy, s) => (dx + dy * s) / Math.hypot(1, s);

  // ---------- jumps ----------
  // Airborne = both feet clearly above the floor (ground: g.low). One foot off the floor is only a step, and from the
  // side a step looks just like a jump of that foot. A misread frame or a few frames without a detected pose in mid-air
  // do not split a flight. A flight is short and the feet rise well clear: when the person moves about, a foot can read
  // as a little above the floor for a while (the far foot appears higher in the picture), which is neither.
  // The feet alone can still mislead: walking toward or away from the camera moves the floor in the picture, and the AI
  // misreads feet it cannot see well. A jump also shows in the rest of the body: both knees bend together and the hips
  // drop before it, and the hips rise in the air. Walking does neither, and what cannot be seen does not count.
  function flights(c) {
    const F = c.frames, g = c.ground, n = F.length;
    const thr = 0.035 * g.bodyH, clear = 0.09 * g.bodyH;
    const maxGap = Math.max(2, Math.round(0.08 * c.fps));
    // the hips above the floor, for a body of the size it has there
    const hipUp = i => { const p = c.pt(F[i], 'hip'); return (g.slope * p[0] - p[1] - g.footFloor[i]) / g.localBody[i]; };
    const stand = median(g.base.map(hipUp));
    const bothKnees = i => c.around(i, f => Math.min(c.angOf(f, 'lKn'), c.angOf(f, 'rKn')), 1);
    const jumpLike = (a, b) => {
      // just before it: further back, the crouch of the last landing would pass for the sinking of this jump
      const reach = Math.round(0.7 * c.fps);
      const before = c.okIdx.filter(i => i >= a - reach && i < a), inAir = c.okIdx.filter(i => i >= a && i < b);
      // (a video can begin just before a jump: then what there is has to do)
      if (before.length < 0.4 * Math.min(reach, a) || !inAir.length) return false;
      const known = (list, fn) => list.map(fn).filter(Number.isFinite);
      const bent = Math.max(...known(before, bothKnees)) >= c.rest.knee + 30;
      // down from standing, or from where the hips just were (a person walking into a jump does not start by standing)
      const hips = known(before, hipUp), deepest = Math.min(...hips);
      const sank = Math.max(stand, ...hips.slice(0, hips.indexOf(deepest) + 1)) - deepest >= 0.06;
      const rose = Math.max(...known(inAir, hipUp)) - hipUp(before[before.length - 1]) >= 0.025;
      return bent && sank && rose;
    };
    const runsAbove = (level, from, to) => {
      const above = i => ok(F[i]) && g.low[i] > level, runs = [];
      for (let i = from; i <= to; i++) {
        if (!above(i)) continue;
        let j = i;
        for (;;) {
          if (j + 1 <= to && above(j + 1)) { j++; continue; }
          let k = j + 1;
          while (k <= to && !above(k) && k - j <= maxGap) k++;
          if (k > j + 1 && k <= to && above(k)) { j = k; continue; }
          break;
        }
        runs.push([i, j]);
        i = j;
      }
      return runs;
    };
    const list = [];
    c.notJumps = 0;
    const judge = (i, j, level) => {
      let peak = 0;
      for (let m = i; m <= j; m++) if (g.low[m] > peak) peak = g.low[m];
      const secs = F[j].t - F[i].t;
      // Too long for a flight: the feet also read a little above the floor before or after it. Look higher up.
      if (secs > 0.8 && 0.3 * peak > level) {
        for (const [a, b] of runsAbove(0.3 * peak, i, j)) judge(a, b, 0.3 * peak);
        return;
      }
      if (secs >= 0.1 && secs <= 0.8 && peak >= clear && i > 0 && j + 1 < n) {
        if (jumpLike(i, j + 1)) list.push({ takeoff: i, land: j + 1 });
        else c.notJumps++;
      }
    };
    for (const [a, b] of runsAbove(thr, 0, n - 1)) judge(a, b, thr);
    return list;
  }
  // A little hop on the way back is not one of the jumps being practised (it takes a few jumps to tell).
  function dropHops(c, jumps, size) {
    if (jumps.length < 4) return jumps;
    const typical = median(jumps.map(size)), kept = jumps.filter(j => size(j) >= 0.5 * typical);
    c.notJumps += jumps.length - kept.length;
    return kept;
  }

  // Flight time between frames. Airborne frames only start once the feet are a few centimetres up, so the time
  // above that height is measured where the feet cross it (interpolated), and gravity gives the rest:
  // a flight that spends Δ above height H lasts √(Δ² + 8H/g).
  function flightTimes(c, fl) {
    const F = c.frames, g = c.ground, thr = 0.035 * g.bodyH;
    const h = i => (i >= 0 && i < F.length && ok(F[i]) ? g.low[i] : NaN);
    const cross = (i, j) => {
      const a = h(i), b = h(j);
      return Number.isFinite(a) && Number.isFinite(b) && a !== b ? F[i].t + (F[j].t - F[i].t) * Math.max(0, Math.min(1, (thr - a) / (b - a))) : NaN;
    };
    let up = NaN, down = NaN;
    for (let i = fl.takeoff; i > Math.max(0, fl.takeoff - 5); i--) if (h(i - 1) <= thr) { up = cross(i - 1, i); break; }
    for (let j = fl.land; j < Math.min(F.length, fl.land + 5); j++) if (h(j) <= thr) { down = cross(j - 1, j); break; }
    if (!Number.isFinite(up)) up = F[fl.takeoff].t - 0.5 / c.fps;
    if (!Number.isFinite(down)) down = F[fl.land].t - 0.5 / c.fps;
    const mPerPx = c.traj && Number.isFinite(c.traj.mPerPx) ? c.traj.mPerPx : 1.5 / g.bodyH; // ankle to nose ≈ 1.5 m
    const above = Math.max(0, down - up);
    const flight = Math.sqrt(above * above + 8 * thr * mPerPx / 9.81);
    const midT = (up + down) / 2;
    return { tOff: midT - flight / 2, tLand: midT + flight / 2, flight };
  }

  // everything about one jump; `since` is where the previous one landed
  function jumpPhases(c, fl, since = 0) {
    const F = c.frames;
    const win = (a, b) => c.okIdx.filter(i => i >= a && i <= b);
    const first = Math.max(since, fl.takeoff - Math.round(1.5 * c.fps));
    const prep = win(first, fl.takeoff - 1);
    const bottom = prep.reduce((m, i) => (c.knee(F[i]) > c.knee(F[m]) ? i : m), prep[0] ?? fl.takeoff);
    let start = bottom;
    const bent = Math.max(15, c.rest.knee + 10); // the knee counts as bending from here (see c.rest)
    while (start > first && ok(F[start - 1]) && c.knee(F[start - 1]) >= bent && F[bottom].t - F[start - 1].t < 1.5) start--;
    const push = win(fl.takeoff - 2, fl.takeoff + 1);
    const extKnee = Math.min(...push.map(i => c.knee(F[i])));
    const extHip = Math.min(...push.map(i => c.hip(F[i])));
    const arms = Math.max(...win(fl.takeoff - Math.round(0.2 * c.fps), fl.takeoff + Math.round(0.1 * c.fps)).map(i => c.sh(F[i])));
    const after = win(fl.land, fl.land + Math.round(0.5 * c.fps));
    const absorbIdx = after.reduce((m, i) => (c.knee(F[i]) > c.knee(F[m]) ? i : m), after[0] ?? fl.land);
    return {
      ...fl, bottom, start,
      ...flightTimes(c, fl),
      depth: c.knee(F[bottom]), hipDepth: c.hip(F[bottom]),
      propulsion: F[fl.takeoff].t - F[bottom].t,
      extKnee, extHip, arms,
      absorb: ok(F[absorbIdx]) ? c.knee(F[absorbIdx]) : NaN, absorbIdx, after,
    };
  }
  const findJumps = (c, fl) => fl.map((f, n) => jumpPhases(c, f, n ? fl[n - 1].land : 0));
  // What this person usually does over several jumps: the jump in the middle by flight time, with the value in the
  // middle of each measure. One odd jump does not decide the advice.
  function typicalJump(jumps) {
    const J = { ...[...jumps].sort((a, b) => a.flight - b.flight)[Math.floor(jumps.length / 2)] };
    for (const k of ['extKnee', 'extHip', 'depth', 'hipDepth', 'arms', 'absorb', 'propulsion']) J[k] = median(jumps.map(j => j[k]));
    return J;
  }
  const longestJump = jumps => jumps.reduce((b, j) => (j.flight > b.flight ? j : b), jumps[0]);

  function extensionCheck(c, J) {
    // against the same person standing straight in this video (see c.rest)
    const dk = Math.max(0, J.extKnee - c.rest.knee), dh = Math.max(0, J.extHip - c.rest.hip);
    const s = dk <= 15 && dh <= 15 ? 'good' : dk <= 30 && dh <= 30 ? 'warn' : 'bad';
    return check('extension', '踏み切りの伸び切り', s, `立った姿勢との差：膝 ${round(dk)}°・股関節 ${round(dh)}°`, 'どちらも 15°以内（立った姿勢と同じくらい伸びる）',
      s === 'good' ? '踏み切りで股関節・膝・足首をしっかり伸ばし切れています。' : '踏み切りで体が伸び切る前に床を離れています。お尻・太もも前・ふくらはぎの、最後に押し切る力が足りない可能性があります。',
      { t: c.frames[J.takeoff].t,
        muscles: s === 'good' ? { weak: [], tight: [] } : { weak: ['glute_max', 'rectus_femoris', 'vastus_lateralis', 'gastrocnemius', 'soleus'], tight: ['iliopsoas'] },
        cues: ['床を最後まで押し切って、つま先で地面を突き放す', '頭のてっぺんから足先まで一本の棒になる'],
        form: ['股関節 → 膝 → 足首の順に、すばやく伸ばす（トリプルエクステンション）'],
        drills: ['ジャンプスクワット', 'カーフレイズ（つま先立ち）', 'ヒップスラスト'] });
  }

  function armCheck(c, J, target) {
    const s = viewStatus(c, J.arms >= target ? 'good' : J.arms >= target - 40 ? 'warn' : 'bad');
    return check('arms', '腕振り', s, `踏み切り時の腕の高さ ${round(J.arms)}°`, `${target}°以上（腕を前上方へ大きく）`,
      s === 'good' ? '腕の振り上げを跳躍に使えています。' : `腕の振りが小さく、腕の勢いを跳躍に使えていません。腕振りだけで記録が数％変わることがあります。${viewNote(c)}`,
      { t: c.frames[J.takeoff].t,
        muscles: s === 'good' ? { weak: [], tight: [] } : { weak: ['deltoid_anterior', 'pectoralis_major', 'latissimus_dorsi', 'deltoid_posterior'], tight: [] },
        cues: ['しゃがむと同時に腕を後ろへ大きく引く', '踏み切りに合わせて腕を前上方へ振り上げ、上で止める'],
        form: ['肘は軽く伸ばしたまま、肩から腕全体を振る'],
        drills: ['腕振りだけのジャンプ練習（その場で）', '軽いメディシンボールを持ったジャンプ'] });
  }

  function landingCheck(c, J, minGood) {
    const a = J.absorb;
    const s = viewStatus(c, !Number.isFinite(a) ? 'warn' : a >= minGood ? 'good' : a >= minGood - 15 ? 'warn' : 'bad');
    return check('landing', '着地の衝撃吸収', s, Number.isFinite(a) ? `着地後の膝 ${round(a)}°` : '着地を検出できませんでした', `膝を ${minGood}°以上曲げて柔らかく受け止める`,
      s === 'good' ? '膝と股関節を曲げて、着地の衝撃を受け止められています。' : `着地が硬く、衝撃が膝や腰に直接かかっています。筋肉が伸びながらブレーキをかける力（エキセントリック筋力）が足りない可能性があります。${viewNote(c)}`,
      { t: c.frames[J.land].t,
        muscles: s === 'good' ? { weak: [], tight: [] } : { weak: ['vastus_lateralis', 'vastus_medialis', 'rectus_femoris', 'glute_max'], tight: ['soleus'] },
        cues: ['つま先 → かかとの順に静かに着地する', '膝と股関節を同時に曲げて、お尻を少し後ろに引く'],
        form: ['着地の音が小さいほど上手に吸収できている'],
        drills: ['ドロップ着地（低い台から降りてピタッと止まる）', '着地で2秒止まるジャンプ練習'] });
  }

  function analyzeJump(c) {
    const F = c.frames;
    let fl = flights(c), jumps = findJumps(c, fl);
    if (!jumps.length) return { reps: [], checks: [], skipped: c.notJumps, error: '跳んで床を離れた瞬間を見つけられませんでした。カメラを固定し、跳ぶ前に1秒ほど立った状態から撮ってください。' };
    const best = longestJump(jumps);
    // in the air the centre of mass follows a parabola whose bend is gravity: a ruler that needs no body size
    const fit = c.traj && c.traj.fitFlight(best.takeoff, best.land, best.tOff - F[best.takeoff].t);
    if (c.traj && c.traj.useGravity(fit)) for (const j of jumps) Object.assign(j, flightTimes(c, j));
    jumps = dropHops(c, jumps, j => j.flight);
    fl = fl.filter(f => jumps.some(j => j.takeoff === f.takeoff));
    const J = typicalJump(jumps);
    const checks = [];
    const heightOf = j => 9.81 * j.flight * j.flight / 8;
    const h = median(jumps.map(heightOf)), top = heightOf(best);
    // over ~0.8 s of flight (80 cm+) is beyond human jumps: usually slow motion or a moving camera
    const odd = best.flight > 0.8;
    checks.push(check('height', '跳躍の高さ（推定）', odd ? 'warn' : 'info', jumps.length > 1 ? `約 ${round(h * 100)} cm（最高 ${round(top * 100)} cm・${jumps.length}回）` : `${round(h * 100)} cm（滞空 ${round(J.flight, 2)}秒）`, '目安：成人男性 40〜55cm、成人女性 30〜40cm',
      odd ? '滞空時間が長すぎるため、正しく計算できていない可能性が高いです。スロー再生の動画や、途中でカメラが動いた・切り替わった動画では正しく測れません。等倍速・固定カメラで撮り直してください。'
        : `滞空時間から計算しています${jumps.length > 1 ? `（${jumps.length}回の真ん中の値と最高の値）` : ''}。撮影のコマ数により数cmの誤差があります。`, { t: F[best.takeoff].t }));
    checks.push(extensionCheck(c, J));
    const d = J.depth;
    const ds = viewStatus(c, d >= 60 && d <= 105 ? 'good' : d >= 45 && d <= 120 ? 'warn' : 'bad');
    checks.push(check('counter', '沈み込みの深さ', ds, `膝 ${round(d)}°・股関節 ${round(J.hipDepth)}°`, '膝 60〜105°',
      ds === 'good' ? '反動に使う沈み込みの深さがちょうど良い範囲です。' : d < 60 ? `沈み込みが浅く、反動を使い切れていません。${viewNote(c)}` : '沈み込みが深すぎて、切り返しに時間がかかっています。',
      { t: F[J.bottom].t,
        muscles: ds === 'good' ? { weak: [], tight: [] } : { weak: ['glute_max', 'biceps_femoris', 'vastus_lateralis'], tight: [] },
        cues: d < 60 ? ['お尻を後ろに引いて、股関節から深く曲げる'] : ['クォータースクワット（膝90°弱）くらいで切り返す'],
        form: ['上半身は少し前傾し、腕は後ろへ引く'],
        drills: ['カウンタームーブメントジャンプを深さを変えて練習'] }));
    const p = J.propulsion;
    const ps = p <= 0.35 ? 'good' : p <= 0.5 ? 'warn' : 'bad';
    checks.push(check('transition', '切り返しの速さ', ps, `一番低い位置から踏み切りまで ${round(p, 2)}秒`, '0.35秒以内',
      ps === 'good' ? 'しゃがんでから跳ぶまでの切り返しが速く、筋肉のバネ（伸張反射）を使えています。' : '一番下で止まってから跳んでいます。筋肉のバネを使えず、力が逃げています。',
      { t: F[J.bottom].t,
        muscles: ps === 'good' ? { weak: [], tight: [] } : { weak: ['gastrocnemius', 'soleus', 'rectus_femoris', 'glute_max'], tight: [] },
        cues: ['しゃがんだら止まらずに一気に跳ぶ', '「下りる勢いをそのまま上に返す」'],
        form: ['沈み込みは素早く、深くしすぎない'],
        drills: ['リバウンドジャンプ（連続で跳ぶ）', 'ポゴジャンプ（足首だけで弾む）'] }));
    checks.push(armCheck(c, J, 140));
    checks.push(landingCheck(c, J, 45));
    if (c.view !== 'side') {
      // the narrow end of what the frames after each landing show, not the single narrowest: that can be one misread frame
      const K = median(jumps.map(j => {
        const widths = j.after.map(i => kneeAnkleRatio(c, F[i])).filter(Number.isFinite).sort((a, b) => a - b);
        return widths.length >= 3 ? widths[Math.floor(0.25 * widths.length)] : NaN;
      }));
      if (Number.isFinite(K)) {
        const s = K >= 0.85 ? 'good' : K >= 0.72 ? 'warn' : 'bad';
        checks.push(check('landvalgus', '着地での膝の向き', s, `膝の幅 ÷ 足首の幅 = ${round(K, 2)}`, '0.85以上',
          s === 'good' ? '着地で膝がつま先と同じ方向を向いています。' : '着地で膝が内側に入っています。膝のけが（前十字靱帯など）につながりやすい形です。お尻の横の筋肉の出力不足が考えられます。',
          { t: F[J.land].t,
            muscles: s === 'good' ? { weak: [], tight: [] } : { weak: ['glute_med', 'glute_max', 'vastus_medialis'], tight: ['adductor_longus', 'tfl'] },
            cues: ['着地で膝をつま先の真上に保つ', 'お尻の横に力を入れて受け止める'],
            form: ['着地の足幅は腰幅くらい'],
            drills: ['ミニバンドを膝に巻いたスクワット', 'サイドプランク', '片脚での着地練習'] }));
      }
    }
    return { reps: jumps.map(j => jumpRep(c, j)), checks, skipped: c.notJumps, flights: fl, phases: jumps.flatMap(j => jumpPhaseList(c, j)), ...c.attempt(() => trajJump(c, jumps), NO_TRAJ) };
  }
  // one jump's figures, for comparing them with one another (null where a figure could not be read)
  const jumpRep = (c, j) => {
    const T = c.traj, com = T && T.m.com, whole = v => (Number.isFinite(v) ? Math.round(v) : null), cm = v => whole(v * 100);
    return {
      t0: c.frames[j.start].t, t1: c.frames[Math.min(c.frames.length - 1, j.land + Math.round(0.4 * c.fps))].t, flight: round(j.flight, 2),
      ...(j.meters != null ? { meters: round(j.meters, 2) } : {}),
      angle: whole(j.angle), hipDepth: whole(j.hipDepth), kneeDepth: whole(j.depth), arms: whole(j.arms),
      rise: T ? cm(com.y[apexOf(T, j)] - (j.toeOff != null ? com.y[j.toeOff] : standHeight(c, com, j))) : null,
      sink: T ? cm(standHeight(c, com, j) - com.y[j.bottom]) : null,
    };
  };
  // sinking (braking), pushing off, landing
  const jumpPhaseList = (c, J) => [
    { kind: 'ecc', i0: J.start, i1: J.bottom },
    { kind: 'con', i0: J.bottom, i1: J.takeoff },
    { kind: 'land', i0: J.land, i1: Math.min(c.frames.length - 1, J.land + Math.round(0.5 * c.fps)) },
  ];

  function analyzeBroad(c) {
    const F = c.frames;
    const NOJUMP = { reps: [], checks: [], error: '跳んで床を離れた瞬間を見つけられませんでした。真横から、踏み切りから着地まで画面に入るように撮ってください。' };
    // the floor along its slope (see contactSlope), with the trajectories measured on it
    const onSlope = slope => {
      c.ground = ground(c, slope);
      if (c.traj) c.traj = window.KinemaTrajectory.build(c, c.heightM);
    };
    const first = contactSlope(c);
    if (first) onSlope(first);
    let fl = flights(c), jumps = findJumps(c, fl);
    if (!jumps.length) return { ...NOJUMP, skipped: c.notJumps };
    // no slope seen yet: measure it from the places just before and after the longest jump
    if (!first) {
      const slope = floorSlope(c, longestJump(jumps));
      if (slope) {
        onSlope(slope);
        fl = flights(c);
        jumps = findJumps(c, fl);
        if (!jumps.length) return { ...NOJUMP, skipped: c.notJumps };
      }
    }
    const T = c.traj, g = c.ground, s = g.slope, best = longestJump(jumps);
    const bestFit = T && T.fitFlight(best.takeoff, best.land, best.tOff - F[best.takeoff].t);
    if (T && T.useGravity(bestFit)) for (const j of jumps) Object.assign(j, flightTimes(c, j));
    // Each jump is measured from the toes' last frame on the floor to the heels' first frame back on it (airborne
    // frames only start a few centimetres up), in the middle of both feet, which a mix-up of left and right does not
    // move, and with the size of the body near that place. Frames without a detected pose are skipped.
    const low = 0.012 * g.bodyH, mPerPx = T && Number.isFinite(T.mPerPx) ? T.mPerPx : c.shankM / c.shankPx;
    const height = (i, part) => {
      const p = c.pt(F[i], part);
      // above where this part of the foot rests, for the floor the feet show nearby (a toe rests a little above a heel)
      return (part === 'toe' ? g.localToe[i] : g.localHeel[i]) - g.localLow[i] + s * p[0] - p[1] - g.footFloor[i];
    };
    const footAt = (i, ids) => [0, 1].map(k => c.around(i, f => (c.P(f, ids[0])[k] + c.P(f, ids[1])[k]) / 2, 1));
    for (const j of jumps) {
      let tb = j.takeoff - 1;
      while (tb > Math.max(0, j.takeoff - 6) && !(ok(F[tb]) && height(tb, 'toe') <= low)) tb--;
      if (!ok(F[tb]) || height(tb, 'toe') > low) tb = okBefore(F, j.takeoff - 1);
      let la = j.land;
      while (la < Math.min(F.length - 1, j.land + 6) && !(ok(F[la]) && height(la, 'heel') <= low)) la++;
      if (!ok(F[la]) || height(la, 'heel') > low) la = okAfter(F, j.land);
      j.toeOff = tb >= 0 ? tb : j.takeoff;
      const toe0 = footAt(j.toeOff, [LM.lFt, LM.rFt]), heel1 = footAt(la >= 0 ? la : j.land - 1, [LM.lHeel, LM.rHeel]);
      const step = alongFloor(heel1[0] - toe0[0], heel1[1] - toe0[1], s), near = g.bodyH / g.localBody[j.toeOff];
      const scale = mPerPx * (Number.isFinite(near) && near > 0 ? near : 1);
      j.dir = Math.sign(step) || 1;
      j.meters = Math.abs(step) * scale;
      // take-off angle: from the parabola of the centre of mass when it could be fitted, otherwise from the hips
      // over the first airborne frames (the last ground frame still includes the forward fall of the push)
      j.fit = T ? T.fitFlight(j.takeoff, j.land, j.tOff - F[j.takeoff].t) : null;
      if (j.fit) j.angle = j.fit.angle;
      else {
        const h0 = c.pt(F[j.takeoff], 'hip'), h1 = c.pt(F[okBefore(F, Math.min(j.land - 1, j.takeoff + 3))], 'hip');
        j.angle = floorAngle(h1[0] - h0[0], h1[1] - h0[1], s);
      }
      // falling backwards after landing loses distance: how far the centre of mass stays behind the heels (metres)
      const behind = j.after.filter(i => i >= j.land + Math.round(0.1 * c.fps)).map(i => {
        const p = T ? [T.px.com.x[i], T.px.com.y[i]] : c.pt(F[i], 'hip'), h = T ? [T.px.heel.x[i], T.px.heel.y[i]] : c.pt(F[i], 'heel');
        return -alongFloor(p[0] - h[0], p[1] - h[1], s) * j.dir * scale;
      }).filter(Number.isFinite);
      j.back = behind.length ? Math.max(...behind) : NaN;
    }
    jumps = dropHops(c, jumps, j => j.meters);
    // Forward is where the jumps go, whichever way the person happens to face while standing about between them.
    const way = Math.sign(median(jumps.map(j => j.dir)));
    // Going back between jumps can pass for a jump the other way, unless they really do go both ways.
    const along = jumps.filter(j => j.dir === way);
    if (jumps.length >= 4 && along.length < jumps.length && along.length >= 0.75 * jumps.length) {
      c.notJumps += jumps.length - along.length;
      jumps = along;
    }
    fl = fl.filter(f => jumps.some(j => j.takeoff === f.takeoff));
    if (T && way && c.view !== 'front' && way !== T.dirX) T.setForward(way);
    if (T) T.setOrigin(footAt(jumps[0].toeOff, [LM.lFt, LM.rFt])[0], '踏み切りのつま先から');
    const J = typicalJump(jumps), several = jumps.length > 1;
    const meters = median(jumps.map(j => j.meters)), farthest = Math.max(...jumps.map(j => j.meters)), far = jumps.find(j => j.meters === farthest);
    const checks = [];
    if (c.view === 'front') checks.push(check('view', '撮影の向き', 'warn', '正面から撮影', '真横から', '立ち幅跳びは真横から撮ると、踏み切りの角度や距離を正しく測れます。', { t: F[J.takeoff].t }));
    checks.push(check('distance', '跳んだ距離（推定）', 'info', several ? `約 ${round(meters, 2)} m（最長 ${round(farthest, 2)} m・${jumps.length}回）` : `約 ${round(meters, 2)} m`, '目安：成人男性 2.2〜2.5m、成人女性 1.6〜1.9m',
      `つま先（踏み切り）からかかと（着地）までの距離です${several ? `。${jumps.length}回の真ん中の値と最長の値を出しています（${jumps.map((j, n) => `${n + 1}回目 ${round(j.meters, 2)} m`).join('、')}）` : ''}。${(T && RULER[T.scaleSource]) || '長さは、すねの長さを基準に換算しています。'}カメラが斜めだと誤差が大きくなります。`, { t: F[far.land].t }));
    const angle = Math.round(median(jumps.map(j => j.angle))); // judged on the figure shown
    const as = angle >= 25 && angle <= 45 ? 'good' : angle >= 15 && angle <= 55 ? 'warn' : 'bad';
    checks.push(check('angle', '踏み切りの角度', as, `${round(angle)}°`, '25〜45°（目安35°前後）',
      as === 'good' ? '前に遠くへ跳ぶのに適した角度で踏み切れています。' : angle < 25 ? '角度が低く、前に突っ込むように跳んでいます。滞空時間が短くなり距離が伸びません。' : '角度が高く、上に跳びすぎています。高さに力を使ってしまい、前への距離が伸びません。',
      { t: F[J.takeoff].t,
        muscles: as === 'good' ? { weak: [], tight: [] } : { weak: ['glute_max', 'biceps_femoris', 'erector_spinae'], tight: [] },
        cues: angle < 25 ? ['斜め上の遠くを見て、体を斜め45°に打ち出す'] : ['前方の遠くを見て、体を前に倒しながら踏み切る'],
        form: ['踏み切りの瞬間、体は斜め前に一直線'],
        drills: ['目標ライン（ひも等）を跳び越える練習', '連続立ち幅跳び'] }));
    checks.push(extensionCheck(c, J));
    const hd = J.hipDepth;
    const hs = viewStatus(c, hd >= 90 ? 'good' : hd >= 70 ? 'warn' : 'bad');
    checks.push(check('counter', '沈み込み（股関節の曲げ）', hs, `股関節 ${round(hd)}°・膝 ${round(J.depth)}°`, '股関節 90°以上',
      hs === 'good' ? 'お尻を後ろに引いて股関節を深く曲げ、お尻と太もも裏の力をためられています。' : `膝ばかり曲げて、股関節の曲げが浅い形です。前に跳ぶ主役である、お尻と太もも裏を使い切れていません。${viewNote(c)}`,
      { t: F[J.bottom].t,
        muscles: hs === 'good' ? { weak: [], tight: [] } : { weak: ['glute_max', 'biceps_femoris', 'semitendinosus', 'erector_spinae'], tight: [] },
        cues: ['お辞儀をするように、お尻を後ろに引いて上半身を前に倒す', '腕を後ろへ大きく引いて力をためる'],
        form: ['背中は丸めず、股関節から体を折りたたむ'],
        drills: ['ルーマニアンデッドリフト', 'ケトルベルスイング'] }));
    checks.push(armCheck(c, J, 120));
    checks.push(landingCheck(c, J, 60));
    const back = median(jumps.map(j => j.back));
    if (Number.isFinite(back)) {
      const bs = back <= 0.04 ? 'good' : back <= 0.14 ? 'warn' : 'bad';
      checks.push(check('balance', '着地のバランス', bs, bs === 'good' ? '前向きに着地' : `重心がかかとより ${Math.round(back * 100)} cm 後ろ`, '重心がかかとより前（後ろに倒れない）',
        bs === 'good' ? '着地で後ろに倒れず、跳んだ距離を残せています。' : '着地で体が後ろに残り、後ろへ倒れたり手をついたりしやすい形です。記録はかかとの位置で測るため、距離を損します。',
        { t: F[J.land].t,
          muscles: bs === 'good' ? { weak: [], tight: [] } : { weak: ['rectus_abdominis', 'iliopsoas', 'transversus_abdominis'], tight: [] },
          cues: ['着地の直前に膝を胸へ引きつけ、足を前に出す', '着地の瞬間に腕と胸を前へ'],
          form: ['着地は両足同時、膝を曲げて前に体重を乗せる'],
          drills: ['ニーアップ（膝の引き上げ）', '着地で前に止まる練習'] }));
    }
    return { reps: jumps.map(j => jumpRep(c, j)), checks, skipped: c.notJumps, flights: fl, phases: jumps.flatMap(j => jumpPhaseList(c, j)), ...c.attempt(() => trajBroad(c, jumps, angle), NO_TRAJ) };
  }

  // ---------- what the trajectories show ----------
  // Each returns trajChecks (same shape as the checks above) and trajView: the stretch of frames worth drawing,
  // the movements inside it and the key moments to mark.
  const cmOf = v => Math.round(v * 100);
  const NONE = { weak: [], tight: [] };
  const NO_TRAJ = { trajChecks: [], trajView: null };
  function windowOf(c, a, b) {
    return { i0: Math.max(0, a - Math.round(0.3 * c.fps)), i1: Math.min(c.frames.length - 1, b + Math.round(0.8 * c.fps)) };
  }

  function trajSquat(c, reps) {
    const T = c.traj, F = c.frames, out = [];
    // perRep: the paths are shown one repetition at a time, each from where it started
    const view = reps.length
      ? { ...windowOf(c, reps[0].start, reps[reps.length - 1].end), segments: reps.map(r => [r.start, r.end]), perRep: true, events: reps.map(r => ({ i: r.bottom, ja: '最下点' })) }
      : null;
    if (!T || !reps.length) return { trajChecks: out, trajView: view };
    const com = T.m.com, hip = T.m.hip, sh = T.m.sh;
    const drops = reps.map(r => com.y[r.start] - com.y[r.bottom]).filter(Number.isFinite);
    if (drops.length) {
      out.push(check('t_drop', '重心の下がった距離', 'info', `約 ${cmOf(median(drops))} cm（${drops.length}回）`, '太ももが床と平行で約30〜40cm',
        '立った姿勢から一番低い位置まで、体の重さの中心（重心）が下がった距離です。深くしゃがむほど大きくなります。毎回の値がそろっているほど、安定したフォームです。',
        { t: F[reps[0].bottom].t }));
    }
    if (c.view !== 'front') {
      // fore-aft drift of the centre of mass away from the middle of the foot, where the foot is at that moment:
      // the furthest it goes in each repetition, and of those the one in the middle
      const drifts = reps.map(r => {
        let far = null;
        for (let i = r.start; i <= r.end; i++) {
          const v = com.x[i] - (T.m.toe.x[i] + T.m.heel.x[i]) / 2;
          if (Number.isFinite(v) && (!far || Math.abs(v) > Math.abs(far.v))) far = { v, i };
        }
        return far;
      }).filter(Boolean).sort((a, b) => Math.abs(a.v) - Math.abs(b.v));
      const worst = drifts[Math.floor(drifts.length / 2)];
      if (worst) {
        const d = Math.abs(worst.v), fwd = worst.v > 0;
        const s = d <= 0.05 ? 'good' : d <= 0.09 ? 'warn' : 'bad';
        out.push(check('t_ap', '重心の前後のぶれ', s, s === 'good' ? `約 ${cmOf(d)} cm` : `約 ${cmOf(d)} cm（${fwd ? 'つま先側' : 'かかと側'}）`, '足の真ん中から5cm以内',
          s === 'good' ? '重心が足の真ん中の上に保たれていて、バランスよくしゃがめています。'
            : fwd ? '重心がつま先側に流れています。お尻を後ろに引けず、膝や上半身が前に突っ込みやすい形です。かかとが浮きやすく、膝への負担も増えます。'
              : '重心がかかと側に流れて、後ろに倒れそうな形です。足首が硬くて膝を前に出せないと、お尻だけが後ろに下がってこうなります。',
          { t: F[worst.i].t,
            muscles: s === 'good' ? NONE : fwd ? { weak: ['glute_max', 'biceps_femoris', 'erector_spinae'], tight: ['soleus', 'gastrocnemius'] } : { weak: ['tibialis_anterior', 'vastus_medialis', 'rectus_abdominis'], tight: ['soleus', 'gastrocnemius'] },
            cues: fwd ? ['体重を土踏まずからかかと寄りに感じる', 'お尻を後ろの椅子に座るように引く'] : ['足裏の真ん中で床を押す', '腕を前に伸ばしてバランスをとる', '膝はつま先の方向へ前に出してよい'],
            form: ['重心（おへその少し下）が、足の真ん中の真上を上下するのが理想'],
            drills: fwd ? ['ボックススクワット（後ろの台に軽く座る）', 'ヒップヒンジの練習（お尻で後ろの壁に触れる）'] : ['ゴブレットスクワット（重りを胸の前に持つと前後のバランスがとりやすい）', '足首のストレッチ（壁に向かって膝を前に出す）'] }));
      }
      // hips rising faster than the shoulders at the start of the ascent ("good morning" squat)
      const rises = reps.map(r => {
        const q = Math.min(r.end, r.bottom + Math.max(1, Math.round(0.4 * (r.end - r.bottom))));
        const dh = hip.y[q] - hip.y[r.bottom], ds = sh.y[q] - sh.y[r.bottom];
        if (!Number.isFinite(dh) || !Number.isFinite(ds)) return null;
        return { q, dh, ds, k: ds > 0.005 ? (dh + 0.005) / (ds + 0.005) : dh > 0.02 ? 9 : 1 };
      }).filter(Boolean);
      if (rises.length) {
        const w = [...rises].sort((a, b) => a.k - b.k)[Math.floor(rises.length / 2)];
        const s = w.k <= 1.35 ? 'good' : w.k <= 1.8 ? 'warn' : 'bad';
        out.push(check('t_rise', '立ち上がり方（お尻と肩）', s, `立ち上がり始め：お尻 ${cmOf(w.dh)} cm・肩 ${cmOf(w.ds)} cm`, 'お尻と肩が同じくらい上がる',
          s === 'good' ? '立ち上がるとき、お尻と肩が同じくらいの速さで上がっています。脚の力で体を持ち上げられています。'
            : 'お尻が先に上がって、上半身が前に倒れたまま立ち上がっています（グッドモーニング型）。太もも前の力が足りず、腰や背中で持ち上げている可能性があります。',
          { t: F[w.q].t,
            muscles: s === 'good' ? NONE : { weak: ['vastus_lateralis', 'vastus_medialis', 'rectus_femoris', 'erector_spinae'], tight: [] },
            cues: ['胸とお尻を同時に持ち上げる', '頭のてっぺんから引っ張られるように立つ'],
            form: ['立ち上がりの最初は、膝を伸ばす力で床を押す'],
            drills: ['テンポスクワット（上がりも3秒かける）', '一番下で止めるポーズスクワット', 'ゴブレットスクワット'] }));
      }
    }
    if (c.view !== 'side') {
      // sideways drift at the bottom of each rep
      const shifts = reps.map(r => ({ r, d: com.x[r.bottom] - com.x[r.start] })).filter(s => Number.isFinite(s.d));
      if (shifts.length) {
        const w = [...shifts].sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[Math.floor(shifts.length / 2)];
        const d = Math.abs(w.d), s = d <= 0.03 ? 'good' : d <= 0.06 ? 'warn' : 'bad';
        out.push(check('t_ml', '重心の左右のぶれ', s, `約 ${cmOf(d)} cm${s === 'good' ? '' : `（${w.d > 0 ? '画面の右' : '画面の左'}へ）`}`, '3cm以内',
          s === 'good' ? '重心が左右にぶれず、まっすぐ上下に動いています。' : 'しゃがむと、重心が左右どちらかに流れています。流れた側の脚に頼っているか、反対側をかばっている可能性があります。',
          { t: F[w.r.bottom].t,
            muscles: s === 'good' ? NONE : { weak: ['glute_med', 'glute_max', 'quadratus_lumborum'], tight: ['adductor_longus'] },
            cues: ['両足の裏に均等に体重を乗せる', 'おへそを両足の真ん中に保ったまま下りる'],
            form: ['鏡の前で、おへそが左右にずれないか見ながら練習する'],
            drills: ['ブルガリアンスクワット（弱い側を多めに）', '片脚立ちのバランス練習'] }));
      }
    }
    return { trajChecks: out, trajView: view };
  }

  // centre-of-mass height while standing still just before the movement
  function standHeight(c, com, J) {
    const near = c.ground.base.filter(i => i < J.start && i >= J.start - Math.round(1.2 * c.fps));
    return median((near.length >= 5 ? near : c.ground.base).map(i => com.y[i]));
  }
  // the highest point of the centre of mass in the air
  function apexOf(T, J) {
    let k = J.takeoff;
    for (let i = J.takeoff; i < J.land; i++) if (T.m.com.y[i] > T.m.com.y[k]) k = i;
    return k;
  }
  // one stretch per jump, from sinking to just after landing
  const jumpsView = (c, jumps) => ({
    ...windowOf(c, jumps[0].start, jumps[jumps.length - 1].land),
    segments: jumps.map(J => [J.start, Math.min(c.frames.length - 1, J.land + Math.round(0.5 * c.fps))]),
    perRep: true,
    // each is measured from the toes at take-off in a long jump, from the middle of the foot otherwise
    anchors: jumps.map(J => (J.toeOff != null ? { i: J.toeOff, part: 'toe' } : { i: J.start, part: 'mid' })),
    events: jumps.flatMap(J => [
      { i: J.bottom, ja: '最下点' }, { i: J.takeoff, ja: '踏み切り' },
      ...(c.traj ? [{ i: apexOf(c.traj, J), ja: '最高点' }] : []), { i: J.land, ja: '着地' },
    ]),
  });

  function trajJump(c, jumps) {
    const T = c.traj, F = c.frames, out = [], view = jumpsView(c, jumps);
    if (!T) return { trajChecks: out, trajView: view };
    const com = T.m.com;
    const sink = median(jumps.map(J => standHeight(c, com, J) - com.y[J.bottom]));
    const rise = median(jumps.map(J => com.y[apexOf(T, J)] - standHeight(c, com, J)));
    const mid = jumps[Math.floor(jumps.length / 2)];
    if (Number.isFinite(sink) && Number.isFinite(rise)) {
      out.push(check('t_path', '重心の上下の動き', 'info', `沈み込み ${cmOf(sink)} cm → 最高点 +${cmOf(rise)} cm`, '立った姿勢を0として',
        '体の重さの中心（重心）が、一番低くなった位置と、空中で一番高くなった位置です。沈み込みが浅すぎても深すぎても、高く跳べません。',
        { t: F[apexOf(T, mid)].t }));
    }
    // the jump in the middle by how far it drifted
    const drifts = jumps.map(J => ({ J, dx: com.x[J.land] - com.x[J.takeoff] })).filter(o => Number.isFinite(o.dx)).sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx));
    const m = drifts[Math.floor(drifts.length / 2)];
    if (m) {
      const dx = m.dx, d = Math.abs(dx), s = d <= 0.08 ? 'good' : d <= 0.15 ? 'warn' : 'bad';
      const lateral = c.view === 'front';
      const where = lateral ? (dx > 0 ? '画面の右' : '画面の左') : dx > 0 ? '前' : '後ろ';
      out.push(check('t_drift', '空中でのずれ', s, `${cmOf(d)} cm${s === 'good' ? '' : `（${where}へ）`}`, '8cm以内（真上に跳ぶ）',
        s === 'good' ? '踏み切りから着地まで、重心がほぼ真上に動いています。力をまっすぐ上に伝えられています。'
          : lateral ? '空中で重心が左右に流れています。左右の脚で床を押す力に差があるか、体が片側に傾いたまま踏み切っています。'
            : dx > 0 ? '空中で重心が前に流れています。上半身が前に倒れたまま踏み切っていて、力の一部が前に逃げています。'
              : '空中で重心が後ろに流れています。かかとに体重が残ったまま踏み切っていて、力の一部が後ろに逃げています。',
        { t: F[m.J.takeoff].t,
          muscles: s === 'good' ? NONE : lateral ? { weak: ['glute_med', 'glute_max', 'quadratus_lumborum'], tight: [] }
            : dx > 0 ? { weak: ['glute_max', 'erector_spinae', 'rectus_abdominis'], tight: ['iliopsoas'] } : { weak: ['gastrocnemius', 'soleus', 'rectus_abdominis'], tight: [] },
          cues: lateral ? ['両足で均等に床を押す', '頭を真上に突き上げるように跳ぶ'] : dx > 0 ? ['踏み切りで胸を起こし、真上を見るつもりで跳ぶ'] : ['親指の付け根（母指球）で床を押し切る'],
          form: ['踏み切った位置と同じ場所に着地するのが理想'],
          drills: ['床に印をつけて、同じ位置に着地する練習', lateral ? '片脚ずつのジャンプで左右差を確かめる' : '壁の近くでまっすぐ跳ぶ練習'] }));
    }
    return { trajChecks: out, trajView: view };
  }

  function trajBroad(c, jumps, angle) {
    const T = c.traj, F = c.frames, out = [], view = jumpsView(c, jumps);
    if (!T) return { trajChecks: out, trajView: view };
    const com = T.m.com, mid = jumps[Math.floor(jumps.length / 2)];
    const sink = median(jumps.map(J => standHeight(c, com, J) - com.y[J.bottom]));
    const rise = median(jumps.map(J => com.y[apexOf(T, J)] - com.y[J.toeOff]));
    const travel = median(jumps.map(J => Math.abs(com.x[J.land] - com.x[J.toeOff])));
    if (Number.isFinite(rise) && Number.isFinite(travel)) {
      out.push(check('t_arc', '重心の放物線', 'info', `${jumps.some(J => J.fit) ? `角度 ${round(angle)}°・` : ''}最高点 +${cmOf(rise)} cm・空中で ${round(travel, 2)} m 前へ`, '角度25〜45°',
        '踏み切ってから着地するまで、重心は放物線を描きます。打ち出す角度が低すぎると高さが出ず、高すぎると前に進みません。図の線の形で、どちら寄りかを確かめられます。',
        { t: F[apexOf(T, mid)].t }));
    }
    if (Number.isFinite(sink)) {
      out.push(check('t_sink', '沈み込みの深さ（重心）', 'info', `${cmOf(sink)} cm`, '立った姿勢から',
        '踏み切る前に、重心が一番低くなるまで下がった距離です。深く沈むほど力をためられますが、深すぎると切り返しが遅くなります。',
        { t: F[mid.bottom].t }));
    }
    return { trajChecks: out, trajView: view };
  }

  // What the video shows, whatever was selected: jumps if both feet leave the floor (forward if the body travels with
  // them), squats if not. A sink before a jump also reads as a squat, so squats must clearly outnumber the jumps.
  function detect(frames, vw, vh) {
    const c = makeCtx(frames, vw, vh);
    if (c.okIdx.length < 10) return null;
    c.ground = ground(c);
    const slope = contactSlope(c);
    if (slope) c.ground = ground(c, slope);
    const fl = flights(c), squats = squatReps(c).reps.length;
    if (fl.length && fl.length * 2 >= squats) {
      const hipX = i => c.around(i, f => (c.P(f, LM.lHip)[0] + c.P(f, LM.rHip)[0]) / 2);
      const travel = median(fl.map(f => Math.abs(hipX(f.land) - hipX(f.takeoff - 1)))) / c.ground.bodyH;
      return { move: travel >= 0.25 ? 'broad' : 'jump', jumps: fl.length, squats };
    }
    return squats ? { move: 'squat', jumps: fl.length, squats } : null;
  }

  function analyze(move, frames, vw, vh, opts = {}) {
    const c = makeCtx(frames, vw, vh);
    const all = { i0: 0, i1: frames.length - 1, segments: [], events: [] };
    if (c.okIdx.length < 10) return { move, view: c.view, checks: [], reps: [], trajChecks: [], trajView: all, flights: [], error: '人物を十分に検出できませんでした。全身が明るく映った動画で試してください。' };
    // the trajectories and the muscle output build on the movement: if one of them fails, the advice is still shown
    const problems = [];
    c.attempt = (fn, fallback) => {
      try { return fn(); } catch (err) { console.error(err); problems.push(err); return fallback; }
    };
    c.ground = ground(c);
    c.heightM = opts.heightCm > 0 ? opts.heightCm / 100 : 0;
    c.traj = window.KinemaTrajectory ? c.attempt(() => window.KinemaTrajectory.build(c, c.heightM), null) : null;
    const fn = { squat: analyzeSquat, jump: analyzeJump, broad: analyzeBroad }[move];
    const out = fn(c);
    out.weightKg = opts.weightKg > 0 ? opts.weightKg : null;
    const kin = window.KinemaKinetics && !out.error ? c.attempt(() => window.KinemaKinetics.compute(c, out, move), null) : null;
    return { move, view: c.view, side: c.side, ground: c.ground, traj: c.traj, trajChecks: [], flights: [], kin, kinChecks: kin ? kin.checks : [], problems, ...out, trajView: out.trajView || all };
  }

  return { MOVES, RULER, analyze, detect };
})();
