// The quality of a movement, whatever the sport: how far the joints move, in what order, how steady the trunk is, left against
// right, how alike the repetitions are, how smoothly they run. Everything is measured from the pose alone and compared with
// the person's own repetitions: no sport's idea of good is built in. The bands are rules of thumb, not validated norms.
// Lengths are in torso lengths (shoulders to hips) because the size in metres is not known for most videos.
window.KinemaQuality = (() => {
  const L = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28 };
  const KIND_JA = { swing: '振る', jump: '跳ぶ', squat: 'しゃがむ', lunge: '踏み込む', hinge: '上体を倒す', arm: '腕を動かす', walk: '移動（歩く・走る）', other: 'その他' };
  const JOINTS = [['kn', '膝', 'knee', 'flex'], ['hip', '股関節', 'hip', 'flex'], ['sh', '肩', 'shoulder', 'flex'], ['el', '肘', 'elbow', 'flex']];
  const KEY = { kn: ['lKn', 'rKn'], hip: ['lHip', 'rHip'], sh: ['lSh', 'rSh'], el: ['lEl', 'rEl'] };

  const fin = Number.isFinite;
  const sorted = v => v.filter(fin).sort((a, b) => a - b);
  const pct = (v, p) => { const s = sorted(v); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
  const median = v => pct(v, 0.5);
  const sd = v => { const s = v.filter(fin); if (s.length < 2) return NaN; const m = s.reduce((a, b) => a + b, 0) / s.length; return Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / (s.length - 1)); };
  const mean = v => { const s = v.filter(fin); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN; };
  // a one-frame misreading must not count as movement
  function clean(v) {
    const m = v.map((_, i) => median([v[i - 2], v[i - 1], v[i], v[i + 1], v[i + 2]]));
    return m.map((_, i) => mean([m[i - 1], m[i], m[i + 1]]));
  }
  const speedOf = (v, fps) => v.map((_, i) => (fin(v[i + 1]) && fin(v[i - 1]) ? (v[i + 1] - v[i - 1]) * fps / 2 : NaN));
  const span = (v, a, b) => { const s = sorted(v.slice(a, b + 1)); return s.length ? s[s.length - 1] - s[0] : NaN; };
  const peakAt = (v, a, b) => { let at = -1, best = -Infinity; for (let i = a; i <= b; i++) if (fin(v[i]) && v[i] > best) { best = v[i]; at = i; } return at; };

  function measure(F, vw, vh, fps) {
    const n = F.length, line = fn => clean(F.map(f => (f && f.ok && f.img ? fn(f) : NaN)));
    const X = i => line(f => f.img[i * 2] * vw), Y = i => line(f => f.img[i * 2 + 1] * vh);
    const mid = (a, b) => [line(f => (f.img[a * 2] + f.img[b * 2]) / 2 * vw), line(f => (f.img[a * 2 + 1] + f.img[b * 2 + 1]) / 2 * vh)];
    const [hx, hy] = mid(L.lHip, L.rHip), [sx, sy] = mid(L.lSh, L.rSh);
    const torso = median(hx.map((_, i) => Math.hypot(sx[i] - hx[i], sy[i] - hy[i])));
    const width = median(F.map(f => (f && f.ok && f.img ? Math.hypot((f.img[L.lSh * 2] - f.img[L.rSh * 2]) * vw, (f.img[L.lSh * 2 + 1] - f.img[L.rSh * 2 + 1]) * vh) : NaN))) / torso;
    const view = width >= 0.55 ? 'front' : width <= 0.3 ? 'side' : 'oblique';
    const pointSpeed = i => { const x = speedOf(X(i), fps), y = speedOf(Y(i), fps); return x.map((_, t) => Math.hypot(x[t], y[t]) / torso); };
    const sp = { hip: speedOf(hx, fps).map((_, t) => Math.hypot(speedOf(hx, fps)[t], speedOf(hy, fps)[t]) / torso) };
    for (const k of ['lSh', 'rSh', 'lEl', 'rEl', 'lWr', 'rWr', 'lAn', 'rAn']) sp[k] = pointSpeed(L[k]);
    const ang = {};
    for (const k of ['lKn', 'rKn', 'lHip', 'rHip', 'lSh', 'rSh', 'lEl', 'rEl']) ang[k] = clean(F.map(f => (f && f.m && f.m.ang ? f.m.ang[k] : NaN)));
    const angSp = {};
    for (const k of Object.keys(ang)) angSp[k] = speedOf(ang[k], fps).map(Math.abs);
    // how leaning the trunk is in the picture: 0 = upright
    const lean = hx.map((_, i) => Math.atan2(sx[i] - hx[i], hy[i] - sy[i]) * 180 / Math.PI);
    return { n, fps, torso, view, width, hx, hy, sx, sy, sp, ang, angSp, lean, ankY: [Y(L.lAn), Y(L.rAn)], F, vis: k => mean(F.map(f => (f && f.ok && f.vis ? f.vis[L[k]] : NaN))) };
  }

  // the stretches where something is moving
  function findBouts(M) {
    const { n, fps, sp, angSp } = M;
    const act = [];
    for (let i = 0; i < n; i++) {
      const hand = Math.max(sp.lWr[i] || 0, sp.rWr[i] || 0) / 6, foot = Math.max(sp.lAn[i] || 0, sp.rAn[i] || 0) / 6, body = (sp.hip[i] || 0) / 2;
      const bend = Math.max(angSp.lKn[i] || 0, angSp.rKn[i] || 0, angSp.lHip[i] || 0, angSp.rHip[i] || 0, angSp.lEl[i] || 0, angSp.rEl[i] || 0, angSp.lSh[i] || 0, angSp.rSh[i] || 0) / 250;
      act.push(Math.max(hand, foot, body, bend));
    }
    const level = Math.max(0.25, pct(act, 0.2) + 0.2 * (pct(act, 0.98) - pct(act, 0.2)));
    const runs = [];
    let from = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && act[i] >= level;
      if (on && from < 0) from = i;
      if (!on && from >= 0) { runs.push([from, i - 1]); from = -1; }
    }
    const joined = [];
    for (const r of runs) {
      const last = joined[joined.length - 1];
      if (last && r[0] - last[1] <= 0.2 * fps) last[1] = r[1]; else joined.push([...r]);
    }
    return joined.filter(([a, b]) => (b - a + 1) >= 0.2 * fps && Math.max(...act.slice(a, b + 1)) >= 0.4);
  }

  // what one stretch looks like
  function describe(M, a, b) {
    const { sp, ang, angSp, hx, hy, ankY, fps, torso } = M;
    const wristL = Math.max(...sp.lWr.slice(a, b + 1).filter(fin), 0), wristR = Math.max(...sp.rWr.slice(a, b + 1).filter(fin), 0);
    const hand = wristR >= wristL ? 'r' : 'l', wrist = sp[`${hand}Wr`], peak = peakAt(wrist, a, b);
    const wristPeak = Math.max(wristL, wristR), hipPeak = Math.max(...sp.hip.slice(a, b + 1).filter(fin), 0);
    const r = {
      kn: Math.max(span(ang.lKn, a, b) || 0, span(ang.rKn, a, b) || 0), hip: Math.max(span(ang.lHip, a, b) || 0, span(ang.rHip, a, b) || 0),
      sh: Math.max(span(ang.lSh, a, b) || 0, span(ang.rSh, a, b) || 0), el: Math.max(span(ang.lEl, a, b) || 0, span(ang.rEl, a, b) || 0),
    };
    const travel = (Math.abs((hx[b] - hx[a]) / torso) || 0) + 0, secs = (b - a + 1) / fps;
    // both feet off their floor at once
    const margin = Math.round(fps);
    const floor = ankY.map(y => pct(y.slice(Math.max(0, a - margin), Math.min(y.length, b + margin + 1)), 0.9));
    let air = 0;
    for (let i = a; i <= b; i++) if ((floor[0] - ankY[0][i]) / torso > 0.3 && (floor[1] - ankY[1][i]) / torso > 0.3) air++;
    // the feet taking turns
    let turns = 0, prev = 0;
    for (let i = a; i <= b; i++) {
      const d = (sp.lAn[i] || 0) - (sp.rAn[i] || 0);
      if (Math.abs(d) < 0.5) continue;
      if (prev && Math.sign(d) !== prev) turns++;
      prev = Math.sign(d);
    }
    const deep = peakAt(ang.lKn.map((v, i) => (v + ang.rKn[i]) / 2), a, b);
    const apart = deep >= 0 ? Math.abs(ang.lKn[deep] - ang.rKn[deep]) : 0, deepest = deep >= 0 ? Math.max(ang.lKn[deep], ang.rKn[deep]) : 0;
    let kind = 'other';
    const onTheMove = travel >= 1.2 && secs >= 0.5;
    if (air >= 3) kind = 'jump';
    // arms swing while walking too: on the move, only a far faster hand counts as a swing
    else if (wristPeak >= (onTheMove ? 10 : 6) && wristPeak >= 2.5 * Math.max(hipPeak, 0.5)) kind = 'swing';
    else if (onTheMove) kind = 'walk';
    else if (apart >= 35 && deepest >= 60 && Math.min(M.vis('lKn'), M.vis('rKn')) >= 0.5) kind = 'lunge';
    else if (r.kn >= 40 && travel < 1) kind = 'squat';
    else if (r.hip >= 50 && r.kn < 35 && M.view !== 'front') kind = 'hinge';
    else if (Math.max(r.el, r.sh) >= 50 && r.kn < 25 && travel < 0.6) kind = 'arm';
    const still = wristPeak < 1.5 && hipPeak < 0.5 && Math.max(r.kn, r.hip, r.sh, r.el) < 25; // the pose model's own jitter
    return { a, b, kind, still, kindJa: KIND_JA[kind], hand, peak: kind === 'swing' && peak >= 0 ? peak : Math.round((a + b) / 2), secs, wristPeak, hipPeak, travel, range: r, t0: M.F[a] ? M.F[a].t : 0, t1: M.F[b] ? M.F[b].t : 0, trunk: span(M.lean, a, b) };
  }

  function typeOf(bouts) {
    const counts = {};
    for (const b of bouts) counts[b.kind] = (counts[b.kind] || 0) + 1;
    const real = bouts.filter(b => b.kind !== 'walk' && b.kind !== 'other');
    const tally = Object.entries(counts).filter(([k]) => k !== 'walk' && k !== 'other').sort((a, b) => b[1] - a[1]);
    if (!tally.length) return counts.walk ? { id: 'walk', ja: KIND_JA.walk, sure: true, counts, others: [] } : { id: 'unknown', ja: '不明', sure: false, counts, others: [] };
    const [id, count] = tally[0];
    return { id, ja: KIND_JA[id], sure: count >= 2 && count / real.length >= 0.6, counts, others: tally.slice(1).map(([k]) => KIND_JA[k]) };
  }

  // the repetitions: the stretches of the main kind, or the rise and fall of one joint inside a long stretch
  function cyclesOf(M, bouts, type) {
    const main = bouts.filter(b => b.kind === type.id);
    if (main.length >= 2) return main.map(b => ({ a: b.a, b: b.b, peak: b.peak }));
    const b = main[0] || bouts[0];
    if (!b) return [];
    const ranges = Object.keys(M.ang).map(k => [k, span(M.ang[k], b.a, b.b) || 0]).sort((x, y) => y[1] - x[1]);
    const key = ranges[0][0], v = M.ang[key], hi = pct(v.slice(b.a, b.b + 1), 0.95), lo = pct(v.slice(b.a, b.b + 1), 0.05), mid = (hi + lo) / 2;
    if (!(hi - lo >= 20)) return [{ a: b.a, b: b.b, peak: b.peak }];
    const out = [];
    let start = -1;
    for (let i = b.a; i <= b.b; i++) {
      if (v[i] >= mid && start < 0) start = i;
      if (start >= 0 && (v[i] < mid || i === b.b)) {
        if (i - start >= 0.15 * M.fps) out.push({ a: Math.max(b.a, start - Math.round((i - start) / 2)), b: Math.min(b.b, i + Math.round((i - start) / 2)), peak: peakAt(v, start, i) });
        start = -1;
      }
    }
    return out.length ? out : [{ a: b.a, b: b.b, peak: b.peak }];
  }

  const none = (ja, reason) => ({ ja, status: 'none', value: '—', detail: reason, rows: [] });

  function rangeItem(M) {
    const near = (a, b) => (M.view === 'side' ? (M.vis(a) >= M.vis(b) ? [a] : [b]) : [a, b]);
    const body = window.KINEMA_BODY;
    const rows = JOINTS.map(([k, ja, joint, move]) => {
      const keys = near(...KEY[k]), mv = body && body.move(joint, move);
      const top = Math.max(...keys.map(key => pct(M.ang[key], 0.98)).filter(fin)), low = Math.min(...keys.map(key => pct(M.ang[key], 0.02)).filter(fin));
      if (!fin(top) || !fin(low)) return null;
      const ref = mv && mv.romChecked && mv.rom ? `参考可動域 ${mv.rom}°` : '';
      return { ja, text: `${Math.round(low)}〜${Math.round(top)}°（幅 ${Math.round(top - low)}°）`, note: ref, width: top - low };
    }).filter(Boolean);
    if (!rows.length) return none('動く範囲', '関節の角度を読み取れませんでした。');
    const most = [...rows].sort((a, b) => b.width - a.width)[0];
    return { ja: '動く範囲', status: 'info', value: `${most.ja}が最も大きく動いています（幅 ${Math.round(most.width)}°）`, detail: M.view === 'front' ? '正面の動画では、曲げ伸ばしの角度が実際より小さく読めることがあります。' : '角度は動画からの推定です。0°がまっすぐ、大きいほど深く曲がっています。', rows };
  }

  // Each point's fastest moment before the hand's: a whip runs hips, shoulder, elbow, wrist. At 30 frames a second
  // anything within one frame cannot be told apart.
  function orderItem(M, bouts) {
    const swings = bouts.filter(b => b.kind === 'swing');
    if (!swings.length) return none('動く順番', '腕を振る動きがあるときに評価します（腰→肩→肘→手首）。');
    const steps = [['腰', () => M.sp.hip], ['肩', h => M.sp[`${h}Sh`]], ['肘', h => M.sp[`${h}El`]], ['手首', h => M.sp[`${h}Wr`]]];
    const tol = 1, MOVING = 0.6; // torso lengths a second: slower than this, a point is not taking part
    const each = swings.map(b => {
      const end = b.peak, from = Math.max(b.a - Math.round(0.2 * M.fps), end - Math.round(0.6 * M.fps));
      const at = steps.map(([, get]) => { const s = get(b.hand), i = peakAt(s, from, end); return i >= 0 && s[i] >= MOVING ? i : -1; });
      const moving = at.filter(i => i >= 0);
      // within a frame or so of one another, a video cannot say which came first
      const parted = moving.length >= 3 && moving[moving.length - 1] - moving[0] >= 2;
      let ok = parted;
      for (let i = 1; i < moving.length; i++) if (moving[i] < moving[i - 1] - tol) ok = false;
      return { at, ok, parted, end, count: moving.length };
    });
    const typical = steps.map(([ja], i) => ({ ja, ms: median(each.map(e => (e.at[i] >= 0 ? (e.at[i] - e.end) / M.fps * 1000 : NaN))), part: each.filter(e => e.at[i] >= 0).length / each.length }));
    const rows = typical.map(s => ({ ja: s.ja, text: s.part < 0.5 ? 'ほとんど動いていません' : `手首の最高速の ${Math.round(Math.abs(s.ms))} ミリ秒前`, note: '' }));
    rows[rows.length - 1].text = '基準（最高速）';
    const detail = '普通の動画は1コマ約33ミリ秒なので、差が1コマ以内なら同時に見えます。とても速い動きでは、手首の最高速を捉えきれません。';
    const judged = each.filter(e => e.parted);
    const still = typical.filter(s => s.part < 0.5).map(s => s.ja);
    if (judged.length < each.length / 2) {
      return { ja: '動く順番', status: 'info', value: still.length ? `${still.join('と')}がほとんど動かず、腕の動きが中心です。動いている部分の順番は、この動画の速さでは見分けられません` : 'ほぼ同時に速さが出ていて、この動画の速さでは順番を見分けられません', detail, rows };
    }
    const chain = typical.filter(s => s.part >= 0.5).map(s => s.ja).join('→');
    const good = judged.filter(e => e.ok).length, rate = good / judged.length;
    return { ja: '動く順番', status: rate >= 0.7 ? 'good' : rate >= 0.4 ? 'mid' : 'warn', value: `${judged.length}回のうち ${good}回、${chain}の順に速さが伝わっています`, detail, rows };
  }

  function stabilityItem(M, bouts) {
    const list = bouts.filter(b => b.kind !== 'walk' && fin(b.trunk));
    if (!list.length) return none('安定性', '動いている場面が見つかりませんでした。');
    const v = list.map(b => b.trunk), typical = median(v), most = list.reduce((a, b) => (b.trunk > a.trunk ? b : a));
    const rows = [{ ja: '体幹の傾きの幅', text: `${list.length}回の中央値 ${Math.round(typical)}°`, note: `最大 ${Math.round(most.trunk)}°（${most.t0.toFixed(1)}秒）` }];
    return { ja: '安定性', status: 'info', value: `動いている間の体幹の傾きは、中央値で ${Math.round(typical)}° 変化しています`, detail: '肩と腰を結ぶ線の変化です。動きの目的で倒すこともあるので、回どうしで見比べてください。腹圧や体幹の筋力を測ったものではありません。', rows, at: most.a };
  }

  function symmetryItem(M) {
    if (M.view === 'side') return none('左右差', '真横の動画では奥の手足が隠れて読み取りにくいため、評価しません。正面や斜めの動画で確かめられます。');
    const rows = [];
    let biggest = 0;
    for (const [k, ja] of JOINTS) {
      const [a, b] = KEY[k], ra = pct(M.ang[a], 0.98) - pct(M.ang[a], 0.02), rb = pct(M.ang[b], 0.98) - pct(M.ang[b], 0.02);
      if (!fin(ra) || !fin(rb)) continue;
      const d = Math.abs(ra - rb);
      biggest = Math.max(biggest, d);
      rows.push({ ja, text: `左 ${Math.round(ra)}°・右 ${Math.round(rb)}°`, note: d >= 15 ? `差 ${Math.round(d)}°` : '' });
    }
    if (!rows.length) return none('左右差', '左右の角度を読み取れませんでした。');
    return { ja: '左右差', status: biggest < 15 ? 'good' : biggest < 30 ? 'mid' : 'warn', value: biggest < 15 ? '左右の動く幅はほぼそろっています' : `左右の動く幅に最大 ${Math.round(biggest)}° の差があります`, detail: '片手で打つ、投げるなど、もともと左右が違う動きでは差が出るのが普通です。', rows };
  }

  function repeatItem(M, cycles) {
    if (cycles.length < 3) return none('再現性', `比べるには同じ動きが3回以上必要です（今回は${cycles.length}回）。`);
    const readable = k => M.view !== 'side' || (k[0] === 'l') === (M.vis('lKn') >= M.vis('rKn'));
    const key = Object.keys(M.ang).filter(readable).map(k => [k, median(cycles.map(c => span(M.ang[k], c.a, c.b)))]).filter(x => fin(x[1])).sort((a, b) => b[1] - a[1])[0];
    if (!key) return none('再現性', '関節の角度を読み取れませんでした。');
    const name = { lKn: '左膝', rKn: '右膝', lHip: '左股関節', rHip: '右股関節', lSh: '左肩', rSh: '右肩', lEl: '左肘', rEl: '右肘' }[key[0]];
    const tops = cycles.map(c => pct(M.ang[key[0]].slice(c.a, c.b + 1), 0.98)), secs = cycles.map(c => (c.b - c.a + 1) / M.fps);
    const m = mean(tops), spread = sd(tops);
    const odd = tops.reduce((best, v, i) => (Math.abs(v - m) > Math.abs(tops[best] - m) ? i : best), 0);
    return {
      ja: '再現性', status: spread < 5 ? 'good' : spread < 10 ? 'mid' : 'warn',
      value: spread < 5 ? `${cycles.length}回とも、よくそろっています` : spread < 10 ? `${cycles.length}回で、ややばらつきがあります` : `${cycles.length}回で、ばらつきが大きめです`,
      detail: `最も大きく動く${name}で比べています。`,
      rows: [{ ja: `${name}の最大角度`, text: `平均 ${Math.round(m)}°・ばらつき ±${spread.toFixed(1)}°`, note: `最も違うのは ${odd + 1}回目` }, { ja: '1回の時間', text: `平均 ${mean(secs).toFixed(2)}秒・ばらつき ±${sd(secs).toFixed(2)}秒`, note: '' }],
      at: cycles[odd].a,
    };
  }

  // how many times the speed rises and falls within one repetition, on the part that moves most
  function smoothItem(M, cycles) {
    if (!cycles.length) return none('なめらかさ', '動いている場面が見つかりませんでした。');
    const humps = cycles.map(c => {
      const parts = ['lWr', 'rWr', 'lAn', 'rAn'].map(k => M.sp[k]).concat([M.sp.hip]);
      const ranks = parts.map(s => Math.max(...s.slice(c.a, c.b + 1).filter(fin), 0));
      const s = parts[ranks.indexOf(Math.max(...ranks))], top = Math.max(...ranks);
      if (!(top > 0.5)) return NaN;
      let count = 0, rising = false, lowest = Infinity, need = true;
      for (let i = c.a + 1; i <= c.b; i++) {
        if (!fin(s[i]) || !fin(s[i - 1])) continue;
        lowest = Math.min(lowest, s[i]);
        if (s[i] > s[i - 1]) rising = true;
        else if (rising && s[i - 1] >= 0.35 * top && (need || lowest <= 0.6 * s[i - 1])) { count++; rising = false; need = false; lowest = s[i]; } else if (s[i] < s[i - 1]) rising = false;
      }
      return count;
    });
    const typical = median(humps);
    if (!fin(typical)) return none('なめらかさ', '動きが小さく、評価できませんでした。');
    const spread = sd(humps);
    return { ja: 'なめらかさ', status: 'info', value: `1回の動きの中で、速さの山は ${typical} 個です`, detail: '山が少ないほど一息に動けています。往復する動きでは2個が普通です。回どうしで増えていないかを見てください。', rows: [{ ja: '回ごとのばらつき', text: fin(spread) ? `±${spread.toFixed(1)} 個` : '—', note: `${humps.length}回で計算` }] };
  }

  function analyze(frames, vw, vh, fps) {
    const F = frames;
    const seen = F.filter(f => f && f.ok).length;
    if (seen < 10) return { error: '人物を十分に検出できませんでした。全身が明るく映った動画で試してください。', bouts: [], items: {}, type: { id: 'unknown', ja: '不明', sure: false, counts: {}, others: [] } };
    const M = measure(F, vw, vh, fps);
    // A squat held at the bottom, or a press paused at the top, is one movement in two stretches.
    const whole = [];
    for (const b of findBouts(M).map(([a0, b0]) => describe(M, a0, b0)).filter(x => !x.still)) {
      const last = whole[whole.length - 1];
      const gap = last ? (b.a - last.b) / fps : Infinity;
      // the back swing and the swing are one movement, however short the pause between them
      const together = last ? (b.b - last.a + 1) / fps : Infinity; // quick strokes one after another stay separate strokes
      if (last && last.kind === b.kind && ((b.kind === 'swing' && gap <= 0.5 && together <= 1.5) || (['squat', 'hinge', 'arm', 'lunge'].includes(b.kind) && gap <= 0.8 && together <= 3.5))) whole[whole.length - 1] = describe(M, last.a, b.b);
      else whole.push(b);
    }
    const bouts = whole;
    const type = typeOf(bouts);
    const cycles = cyclesOf(M, bouts, type);
    return {
      view: M.view, seenRate: seen / F.length, bouts, type, cycles,
      items: { range: rangeItem(M), order: orderItem(M, bouts), stability: stabilityItem(M, bouts), symmetry: symmetryItem(M), repeat: repeatItem(M, cycles), smooth: smoothItem(M, cycles) },
    };
  }
  // Does this video fit one of the three movements KINEMA can judge? Wrong confidence is worse than saying less, but the
  // 3 movements must keep working: only clear signs move a video away from them.
  function notOneOfThree(Q, detected, fitsMove = true) {
    if (!detected || !fitsMove) return true;
    const c = Q.type.counts || {}, swings = c.swing || 0;
    if (swings >= 2 && swings > (detected.move === 'squat' ? detected.squats : detected.jumps)) return true;
    if (detected.move === 'squat' && (c.lunge || 0) + (c.hinge || 0) > (c.squat || 0)) return true;
    return false;
  }
  return { analyze, notOneOfThree, KIND_JA };
})();
