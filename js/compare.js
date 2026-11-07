// Two movements laid over one another: two videos, or two repetitions of one video. A is always blue and solid, B always
// orange and dashed, so the difference shows in colour and in line alike. Both are lined up on one moment of the movement
// (the take-off, or the bottom of a squat), on the floor, at their real size, facing the same way.
window.createKinemaCompare = api => {
  const $ = s => document.querySelector(s), { esc } = api;
  const COLOR = { a: '#1f6feb', b: '#e8590c' };
  // on the charts, whose background follows the page: brighter on a dark one
  const chartColor = k => (matchMedia('(prefers-color-scheme: dark)').matches ? { a: '#6ea8ff', b: '#ff9a5c' } : COLOR)[k];
  const KEY_JA = { squat: '一番しゃがんだ瞬間', jump: '踏み切りの瞬間', broad: '踏み切りの瞬間' };
  const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]];
  const JOINTS = { kn: '膝', hip: '股関節', sh: '肩' };
  // a video analysed in general has no repetitions of a known movement: what can be picked is each movement found in it
  const movementsOf = r => (r && r.general && r.quality ? (r.quality.bouts || []).filter(b => b.kind !== 'walk') : null);
  const keyJa = p => (p.item.result && p.item.result.general ? (p.rep && p.rep.kind === 'swing' ? '手首が最も速い瞬間' : '動きの真ん中') : KEY_JA[p.item.move]);

  const view = $('#cmpCanvas'), side = { a: pickers('a'), b: pickers('b') };
  function pickers(k) {
    return { source: $(`#cmp-${k}-source`), rep: $(`#cmp-${k}-rep`), video: $(`#cmp-${k}-video`), item: null, v: null, tint: document.createElement('canvas') };
  }
  const cmp = { t: 0, t0: 0, t1: 1, playing: false, rate: 0.5, joint: 'kn', mix: 0.5, layer: 'video', last: 0, dirtyCharts: true };
  let open = false, loop = 0, cache = new Map(), asked = 0;

  // ---------- one repetition, lined up ----------
  const median = v => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
  function prepare(item, repIdx) {
    const r = item.result, F = item.frames, n = F.length, fps = item.fps;
    const reps = r && r.reps ? r.reps : [], segs = r && r.trajView && r.trajView.segments && r.trajView.segments.length ? r.trajView.segments : null;
    const found = movementsOf(r), piece = found ? found[Math.min(repIdx, found.length - 1)] : null;
    const seg = piece ? [piece.a, piece.b] : segs ? segs[Math.min(repIdx, segs.length - 1)] : [0, n - 1];
    const rep = piece || reps[repIdx] || null;
    const flight = (r && r.flights || []).find(f => f.takeoff >= seg[0] && f.takeoff <= seg[1]);
    let key = piece ? piece.peak : r && r.move === 'squat' && rep && Number.isInteger(rep.bottom) ? rep.bottom : flight ? flight.takeoff : Math.round((seg[0] + seg[1]) / 2);
    const pad = Math.round(0.4 * fps), a = Math.max(0, seg[0] - pad), b = Math.min(n - 1, seg[1] + pad);
    // the nearest frame with a pose stands in for the moment itself
    for (let d = 0; d < n && !(F[key] && F[key].ok); d++) { if (F[key + d] && F[key + d].ok) key += d; else if (F[key - d] && F[key - d].ok) key -= d; }
    const f = F[key];
    if (!f || !f.ok) return null;
    const px = (fr, i) => [fr.img[i * 2] * item.vw, fr.img[i * 2 + 1] * item.vh];
    const heights = [];
    for (let i = seg[0]; i <= seg[1]; i++) {
      if (!F[i] || !F[i].ok) continue;
      const nose = px(F[i], 0), l = px(F[i], 27), rr = px(F[i], 28);
      heights.push(Math.hypot(nose[0] - (l[0] + rr[0]) / 2, nose[1] - (l[1] + rr[1]) / 2));
    }
    const T = r && r.traj;
    const mPerPx = T && Number.isFinite(T.mPerPx) && T.mPerPx > 0 ? T.mPerPx : 1.5 / (Math.max(...heights, 1)); // ankle to nose ≈ 1.5 m
    // the way the feet point; on a front view it hardly says anything, and the picture stays as filmed
    const foot = ((f.img[31 * 2] - f.img[29 * 2]) + (f.img[32 * 2] - f.img[30 * 2])) * item.vw;
    const dir = T && T.view === 'front' ? 1 : foot < 0 ? -1 : 1;
    const toes = [px(f, 31), px(f, 32)], lows = [px(f, 29), px(f, 30), ...toes];
    return { item, rep, repIdx, a, b, key, fps, mPerPx, dir, ax: (toes[0][0] + toes[1][0]) / 2, ay: Math.max(...lows.map(p => p[1])), t0: (a - key) / fps, t1: (b - key) / fps };
  }
  const indexAt = (p, t) => Math.max(p.a, Math.min(p.b, p.key + Math.round(t * p.fps)));
  function jointAngle(p, i, joint) {
    const f = p.item.frames[i], ang = f && f.m && f.m.ang;
    if (!ang) return NaN;
    const s = p.item.result && p.item.result.side, name = c => `${c}${joint === 'kn' ? 'Kn' : joint === 'hip' ? 'Hip' : 'Sh'}`;
    return s === 'l' ? ang[name('l')] : s === 'r' ? ang[name('r')] : (ang[name('l')] + ang[name('r')]) / 2;
  }

  // ---------- the overlay ----------
  function sizeCanvas(c) {
    const dpr = Math.min(devicePixelRatio, 1.5), W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return null;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); cmp.dirtyCharts = true; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, W, H, dpr };
  }
  // the same scale for both, so that the whole of both movements fits
  function fitOverlay(W, H) {
    let x0 = 0, x1 = 0.3, top = 1.9;
    for (const k of ['a', 'b']) {
      const p = side[k].prep;
      if (!p) continue;
      for (let i = p.a; i <= p.b; i++) {
        const f = p.item.frames[i];
        if (!f || !f.ok) continue;
        for (const j of [0, 15, 16, 27, 28, 31, 32]) {
          const x = p.dir * (f.img[j * 2] * p.item.vw - p.ax) * p.mPerPx, y = (p.ay - f.img[j * 2 + 1] * p.item.vh) * p.mPerPx;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); top = Math.max(top, y);
        }
      }
    }
    const k = Math.min((W - 28) / Math.max(x1 - x0, 0.6), (H * 0.88 - 12) / top);
    return { k, ox: (W - (x1 - x0) * k) / 2 - x0 * k, floor: H * 0.88 };
  }
  function drawVideoLayer(g, S, dpr, fit, W, H) {
    if (cmp.layer !== 'video') return false;
    let drew = false;
    for (const k of ['a', 'b']) {
      const s = side[k], p = s.prep, v = s.video;
      if (!p || !p.item.url || v.readyState < 2) continue;
      const t = s.tint, tw = Math.round(W * dpr), th = Math.round(H * dpr);
      if (t.width !== tw || t.height !== th) { t.width = tw; t.height = th; }
      const c = t.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, tw, th);
      const scale = p.mPerPx * fit.k * dpr;
      c.setTransform(p.dir * scale, 0, 0, scale, (fit.ox * dpr) - p.dir * scale * p.ax, (fit.floor * dpr) - scale * p.ay);
      c.drawImage(v, 0, 0, p.item.vw, p.item.vh);
      // each video in its own colour
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = 0.42;
      c.fillStyle = COLOR[k];
      c.fillRect(0, 0, tw, th);
      c.globalAlpha = 1;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = k === 'a' ? 1 : cmp.mix;
      g.drawImage(t, 0, 0);
      g.restore();
      drew = true;
    }
    return drew;
  }
  function drawOverlay() {
    const S = sizeCanvas(view);
    if (!S) return;
    const { g, W, H, dpr } = S;
    g.fillStyle = '#10151c';
    g.fillRect(0, 0, W, H);
    if (!side.a.prep || !side.b.prep) return;
    const fit = fitOverlay(W, H);
    drawVideoLayer(g, S, dpr, fit, W, H);
    // a ruler on the floor, from the toes of the moment both are lined up on
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, fit.floor); g.lineTo(W, fit.floor); g.stroke();
    g.font = '10.5px "Zen Kaku Gothic New", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(255,255,255,.75)';
    const step = fit.k > 150 ? 0.25 : 0.5;
    for (let m = Math.ceil(-fit.ox / fit.k / step) * step; fit.ox + m * fit.k <= W; m += step) {
      const x = fit.ox + m * fit.k;
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.moveTo(x, fit.floor); g.lineTo(x, fit.floor + 5); g.stroke();
      if (Math.abs(m % 0.5) < 1e-6 || Math.abs(Math.abs(m % 0.5) - 0.5) < 1e-6) g.fillText(`${Math.round(m * 100)}`, x, fit.floor + 7);
    }
    g.textAlign = 'right';
    g.fillText('cm', W - 6, fit.floor + 7);
    for (const k of ['a', 'b']) {
      const p = side[k].prep, f = p.item.frames[indexAt(p, cmp.t)];
      if (!f || !f.ok) continue;
      const X = j => fit.ox + p.dir * (f.img[j * 2] * p.item.vw - p.ax) * p.mPerPx * fit.k;
      const Y = j => fit.floor + (f.img[j * 2 + 1] * p.item.vh - p.ay) * p.mPerPx * fit.k;
      const bones = () => {
        g.beginPath();
        for (const [u, w] of BONES) { g.moveTo(X(u), Y(u)); g.lineTo(X(w), Y(w)); }
        g.moveTo((X(11) + X(12)) / 2, (Y(11) + Y(12)) / 2); // the neck
        g.lineTo(X(0), Y(0));
        g.stroke();
      };
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,.9)';
      g.lineWidth = 5.5;
      bones();
      g.strokeStyle = COLOR[k];
      g.lineWidth = 3.5;
      bones();
      g.fillStyle = COLOR[k];
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(X(0), Y(0), 7, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#fff';
      g.font = '700 10px "Zen Kaku Gothic New", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(k.toUpperCase(), X(0), Y(0));
    }
    g.font = '700 12px "Zen Kaku Gothic New", sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = '#fff';
    g.fillText(Math.abs(cmp.t) < 0.02 ? `そろえた瞬間（${keyJa(side.a.prep)}）` : `${cmp.t > 0 ? '＋' : '－'}${Math.abs(cmp.t).toFixed(2)}秒`, 10, 8);
  }

  // ---------- the charts ----------
  function chartFrame(c, text) {
    const S = sizeCanvas(c);
    if (!S) return null;
    S.g.clearRect(0, 0, S.W, S.H);
    if (text) {
      S.g.fillStyle = api.tokens()['--muted'];
      S.g.font = '12.5px "Zen Kaku Gothic New", sans-serif';
      S.g.textAlign = 'center';
      S.g.textBaseline = 'middle';
      S.g.fillText(text, S.W / 2, S.H / 2);
    }
    return S;
  }
  function plotLine(g, pts, k) {
    g.strokeStyle = chartColor(k);
    g.lineWidth = 2.4;
    g.lineJoin = 'round';
    g.setLineDash(k === 'b' ? [7, 4] : []);
    g.beginPath();
    let pen = false;
    for (const [x, y] of pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
      if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
    }
    g.stroke();
    g.setLineDash([]);
  }
  function drawAngleChart() {
    const S = chartFrame($('#cmpAngle'));
    const A = side.a.prep, B = side.b.prep, tk = api.tokens();
    if (!S || !A || !B) return;
    const { g, W, H } = S, padL = 34, padR = 8, padT = 8, padB = 22;
    const series = p => { const out = []; for (let i = p.a; i <= p.b; i++) { const near = [i - 1, i, i + 1].map(j => jointAngle(p, j, cmp.joint)); out.push([(i - p.key) / p.fps, median(near)]); } return out; };
    const sa = series(A), sb = series(B), all = [...sa, ...sb].map(p => p[1]).filter(Number.isFinite);
    if (!all.length) return;
    const lo = Math.max(0, Math.floor(Math.min(...all) / 30) * 30), hi = Math.ceil(Math.max(...all) / 30) * 30 || 30;
    const X = t => padL + (t - cmp.t0) / (cmp.t1 - cmp.t0) * (W - padL - padR), Y = v => H - padB - (v - lo) / (hi - lo || 1) * (H - padT - padB);
    g.font = '10px "Zen Kaku Gothic New", sans-serif';
    g.strokeStyle = tk['--line'];
    g.fillStyle = tk['--muted'];
    g.lineWidth = 1;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = lo; v <= hi; v += 30) { g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(W - padR, Y(v)); g.stroke(); g.fillText(`${v}°`, padL - 4, Y(v)); }
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let t = Math.ceil(cmp.t0 * 2) / 2; t <= cmp.t1; t += 0.5) g.fillText(t === 0 ? '0秒' : `${t > 0 ? '+' : ''}${t}`, X(t), H - padB + 5);
    g.strokeStyle = tk['--ink'];
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(X(0), padT); g.lineTo(X(0), H - padB); g.stroke();
    g.setLineDash([]);
    plotLine(g, sa.map(([t, v]) => [X(t), Y(v)]), 'a');
    plotLine(g, sb.map(([t, v]) => [X(t), Y(v)]), 'b');
    cmp.angleGeom = { padL, padR, W };
    g.strokeStyle = tk['--ink'];
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(cmp.t), padT); g.lineTo(X(cmp.t), H - padB); g.stroke();
    for (const [k, p] of [['a', A], ['b', B]]) {
      const v = jointAngle(p, indexAt(p, cmp.t), cmp.joint);
      if (!Number.isFinite(v)) continue;
      g.fillStyle = chartColor(k);
      g.beginPath(); g.arc(X(cmp.t), Y(v), 4, 0, Math.PI * 2); g.fill();
    }
  }
  function comPath(p) {
    const T = p.item.result && p.item.result.traj;
    if (!T || !T.m || !T.m.com) return null;
    const ox = T.m.toe.x[p.key], oy = T.m.toe.y[p.key];
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) return null;
    const pts = [];
    for (let i = p.a; i <= p.b; i++) pts.push([T.m.com.x[i] - ox, T.m.com.y[i] - oy]);
    return pts;
  }
  function drawPathChart() {
    const A = side.a.prep, B = side.b.prep, tk = api.tokens();
    const pa = A && comPath(A), pb = B && comPath(B);
    const S = chartFrame($('#cmpPath'), pa && pb ? '' : '軌跡を比べられません');
    if (!S || !pa || !pb) return;
    const { g, W, H } = S, padL = 30, padR = 8, padT = 8, padB = 22;
    const all = [...pa, ...pb].filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!all.length) return;
    const x0 = Math.min(...all.map(p => p[0]), 0), x1 = Math.max(...all.map(p => p[0]), 0.3), y1 = Math.max(...all.map(p => p[1]), 0.5) * 1.06;
    const k = Math.min((W - padL - padR) / Math.max(x1 - x0, 0.4), (H - padT - padB) / y1);
    const cx = (x0 + x1) / 2, mid = padL + (W - padL - padR) / 2;
    const X = x => mid + (x - cx) * k, Y = y => H - padB - y * k;
    const step = (W - padL - padR) / k > 2.4 ? 0.5 : 0.25;
    g.font = '10px "Zen Kaku Gothic New", sans-serif';
    g.lineWidth = 1;
    g.strokeStyle = tk['--line'];
    g.fillStyle = tk['--muted'];
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let v = Math.ceil(x0 / step) * step; v <= x1 + 1e-9; v += step) { g.beginPath(); g.moveTo(X(v), padT); g.lineTo(X(v), H - padB); g.stroke(); g.fillText(`${Math.round(v * 100)}`, X(v), H - padB + 5); }
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = 0; Y(v) >= padT; v += step) { g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(W - padR, Y(v)); g.stroke(); g.fillText(`${Math.round(v * 100)}`, padL - 4, Y(v)); }
    g.strokeStyle = tk['--ink'];
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(padL, Y(0)); g.lineTo(W - padR, Y(0)); g.stroke();
    plotLine(g, pa.map(([x, y]) => [X(x), Y(y)]), 'a');
    plotLine(g, pb.map(([x, y]) => [X(x), Y(y)]), 'b');
    for (const [c, p, pts] of [['a', A, pa], ['b', B, pb]]) {
      const q = pts[indexAt(p, cmp.t) - p.a];
      if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
      g.fillStyle = chartColor(c);
      g.strokeStyle = tk['--panel'];
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(X(q[0]), Y(q[1]), 5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }

  // ---------- the figures side by side ----------
  // `small`: a difference below this is within what the video can tell
  const JUMP_ROWS = [
    ['meters', '跳んだ距離', ' m', 0.03, 2, d => `${Math.abs(d * 100).toFixed(0)} cm ${d > 0 ? '遠く' : '手前'}まで跳んでいます`],
    ['flight', '滞空時間', ' 秒', 0.02, 2, d => `滞空時間が ${Math.abs(d).toFixed(2)} 秒${d > 0 ? '長い' : '短い'}です`],
    ['rise', '最高点までの上昇', ' cm', 3, 0, d => `重心が ${Math.abs(d)} cm ${d > 0 ? '高く' : '低く'}上がっています`],
    ['angle', '踏み切りの角度', '°', 3, 0, d => `踏み切りの角度が ${Math.abs(d)}° ${d > 0 ? '上向き' : '低め'}です`],
    ['sink', '沈み込みの深さ', ' cm', 3, 0, d => `沈み込みが ${Math.abs(d)} cm ${d > 0 ? '深い' : '浅い'}です`],
    ['kneeDepth', '膝の曲げ', '°', 5, 0, d => `膝を ${Math.abs(d)}° ${d > 0 ? '深く' : '浅く'}曲げています`],
    ['hipDepth', '股関節の曲げ', '°', 5, 0, d => `股関節を ${Math.abs(d)}° ${d > 0 ? '深く' : '浅く'}曲げています`],
    ['arms', '腕の振り上げ', '°', 10, 0, d => `腕を ${Math.abs(d)}° ${d > 0 ? '高く' : '低く'}振り上げています`],
  ];
  const SQUAT_ROWS = [
    ['depth', '膝の曲げ', '°', 5, 0, d => `膝を ${Math.abs(d)}° ${d > 0 ? '深く' : '浅く'}曲げています`],
    ['hipAt', '股関節の曲げ', '°', 5, 0, d => `股関節を ${Math.abs(d)}° ${d > 0 ? '深く' : '浅く'}曲げています`],
    ['secs', '1回の時間', ' 秒', 0.2, 1, d => `1回に ${Math.abs(d).toFixed(1)} 秒${d > 0 ? '長く' : '短く'}かけています`],
  ];
  const GENERAL_ROWS = [
    ['secs', '動きの時間', ' 秒', 0.1, 2, d => `動きの時間が ${Math.abs(d).toFixed(2)} 秒${d > 0 ? '長い' : '短い'}です`],
    ['wristPeak', '手の最高速（胴の長さ/秒）', '', 2, 1, d => `手の最高速が ${d > 0 ? '速い' : '遅い'}です`],
    ['hipPeak', '腰の最高速（胴の長さ/秒）', '', 0.5, 1, d => `腰の動きが ${d > 0 ? '速い' : '遅い'}です`],
    ['rkn', '膝の動く幅', '°', 8, 0, d => `膝の動く幅が ${Math.abs(d)}° ${d > 0 ? '大きい' : '小さい'}です`],
    ['rhip', '股関節の動く幅', '°', 8, 0, d => `股関節の動く幅が ${Math.abs(d)}° ${d > 0 ? '大きい' : '小さい'}です`],
    ['rsh', '肩の動く幅', '°', 8, 0, d => `肩の動く幅が ${Math.abs(d)}° ${d > 0 ? '大きい' : '小さい'}です`],
    ['rel', '肘の動く幅', '°', 8, 0, d => `肘の動く幅が ${Math.abs(d)}° ${d > 0 ? '大きい' : '小さい'}です`],
    ['trunk', '体幹の傾きの幅', '°', 5, 0, d => `体幹の傾きの幅が ${Math.abs(d)}° ${d > 0 ? '大きい' : '小さい'}です`],
  ];
  function figuresOf(p) {
    const o = { ...(p.rep || {}) };
    if (p.rep && p.rep.range) return { ...o, rkn: o.range.kn, rhip: o.range.hip, rsh: o.range.sh, rel: o.range.el };
    if (p.rep) o.secs = p.rep.t1 - p.rep.t0;
    o.hipAt = jointAngle(p, p.key, 'hip');
    return o;
  }
  function renderFigures() {
    const A = side.a.prep, B = side.b.prep, box = $('#cmpFigures'), say = $('#cmpSay');
    if (!A || !B) { box.innerHTML = ''; say.innerHTML = ''; return; }
    const squat = A.item.move === 'squat' && B.item.move === 'squat';
    const anyGeneral = (A.item.result && A.item.result.general) || (B.item.result && B.item.result.general);
    const rows = anyGeneral ? GENERAL_ROWS : squat ? SQUAT_ROWS : JUMP_ROWS, fa = figuresOf(A), fb = figuresOf(B), found = [];
    let compared = 0;
    const body = rows.map(([key, ja, unit, small, digits, words]) => {
      const a = fa[key], b = fb[key];
      if (!Number.isFinite(a) && !Number.isFinite(b)) return '';
      const show = v => (Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : '—');
      let diff = '—';
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const d = Number((b - a).toFixed(digits));
        compared++;
        diff = Math.abs(d) < small ? 'ほぼ同じ' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)}${unit}`;
        if (Math.abs(d) >= small) found.push({ size: Math.abs(d) / small, text: words(d) });
      }
      return `<tr><th scope="row">${ja}</th><td class="ca">${show(a)}</td><td class="cb">${show(b)}</td><td>${diff}</td></tr>`;
    }).join('');
    box.innerHTML = `<table><thead><tr><th></th><th class="ca">A</th><th class="cb">B</th><th>B−A</th></tr></thead><tbody>${body}</tbody></table>`;
    found.sort((x, y) => y.size - x.size);
    const notes = [];
    if (!anyGeneral && A.item.move !== B.item.move) notes.push('違う種類の動きを比べています。');
    if (A.item !== B.item) notes.push('カメラの位置が違う動画どうしでは、長さの差がずれることがあります。');
    say.innerHTML = `${found.length ? `<p class="cmp-lead"><b>AとBの違い</b>（Aと比べたBの動き）</p><ul>${found.slice(0, 3).map(f => `<li>${esc(f.text)}</li>`).join('')}</ul>` : `<p class="cmp-lead">${compared ? '大きな違いは見られません。' : '比べられる数字がありません。図と線で比べてください。'}</p>`}${notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}`;
  }

  // ---------- the videos ----------
  function syncVideos() {
    for (const k of ['a', 'b']) {
      const s = side[k], p = s.prep, v = s.video;
      if (!p || !p.item.url || cmp.layer !== 'video' || v.readyState < 1) { if (!v.paused) v.pause(); continue; }
      const f = p.item.frames[indexAt(p, cmp.t)], inside = cmp.t >= p.t0 && cmp.t <= p.t1;
      if (!f) continue;
      if (cmp.playing && inside) {
        v.playbackRate = cmp.rate;
        if (v.paused) v.play().catch(() => {});
        // if the browser refuses to play it, the picture follows by seeking
        if (Math.abs(v.currentTime - f.t) > (v.paused ? 0.06 : 0.2) && !v.seeking) v.currentTime = f.t;
      } else {
        if (!v.paused) v.pause();
        if (!v.seeking && Math.abs(v.currentTime - f.t) > 0.02) v.currentTime = f.t;
      }
    }
  }
  function setVideo(k) {
    const s = side[k], url = s.prep && s.prep.item.url;
    if (url && s.video.getAttribute('src') !== url) { s.video.src = url; s.video.load(); }
    if (!url && s.video.getAttribute('src')) { s.video.pause(); s.video.removeAttribute('src'); s.video.load(); }
  }

  // ---------- running ----------
  function setTime(t) {
    cmp.t = Math.max(cmp.t0, Math.min(cmp.t1, t));
    $('#cmpSeek').value = String(cmp.t);
    cmp.dirtyCharts = true;
  }
  function setPlaying(on) {
    cmp.playing = on;
    $('#cmpPlay').textContent = on ? '一時停止' : '再生';
    if (on && cmp.t >= cmp.t1 - 0.01) setTime(cmp.t0);
    syncVideos();
  }
  function drawAll() {
    drawOverlay();
    if (cmp.dirtyCharts) {
      cmp.dirtyCharts = false;
      drawAngleChart();
      drawPathChart();
    }
  }
  function step(now) {
    if (!open) { loop = 0; return; }
    loop = requestAnimationFrame(step);
    if (now - cmp.last < 30) return;
    const dt = Math.min(0.1, (now - cmp.last) / 1000);
    cmp.last = now;
    if ($('#cmpView').hidden) return;
    if (cmp.playing) {
      let t = cmp.t + dt * cmp.rate;
      if (t > cmp.t1) t = cmp.t0; // round and round
      setTime(t);
    }
    syncVideos();
    drawAll();
  }

  // ---------- choosing ----------
  function fillReps(k) {
    const s = side[k], reps = s.item && s.item.result && s.item.result.reps ? s.item.result.reps : [];
    const found = s.item ? movementsOf(s.item.result) : null;
    s.rep.innerHTML = found && found.length
      ? found.map((b, i) => `<option value="${i}">${i + 1}つ目（${esc(b.kindJa)}・${b.t0.toFixed(1)}秒）</option>`).join('')
      : reps.length
      ? reps.map((r, i) => `<option value="${i}">${i + 1}回目${Number.isFinite(r.meters) ? `（${r.meters.toFixed(2)} m）` : ''}</option>`).join('')
      : '<option value="0">動画全体</option>';
    s.rep.disabled = (found ? found.length : reps.length) < 2;
  }
  function applyChoice() {
    for (const k of ['a', 'b']) {
      const s = side[k];
      s.prep = s.item ? api.guard(() => prepare(s.item, Number(s.rep.value) || 0)) || null : null;
      setVideo(k);
    }
    const A = side.a.prep, B = side.b.prep, ok = !!(A && B);
    $('#cmpMain').hidden = !ok;
    $('#cmpEmpty').hidden = ok;
    if (!ok) return;
    cmp.t0 = Math.min(A.t0, B.t0);
    cmp.t1 = Math.max(A.t1, B.t1);
    const seek = $('#cmpSeek');
    seek.min = String(cmp.t0);
    seek.max = String(cmp.t1);
    const hasVideo = !!(A.item.url || B.item.url);
    $('#cmpLayer').hidden = !hasVideo;
    $('#cmpMixWrap').hidden = !(A.item.url && B.item.url && cmp.layer === 'video');
    $('#cmpKey').textContent = `${keyJa(A)}でそろえています`;
    $('#cmpNoteA').textContent = A.item.url ? '' : 'Aは動画なし（骨格のみ）';
    $('#cmpNoteB').textContent = B.item.url ? '' : 'Bは動画なし（骨格のみ）';
    setTime(0);
    renderFigures();
    syncVideos();
    drawAll();
  }
  async function choose(k, id) {
    const s = side[k], ticket = ++asked;
    $('#cmpStatus').textContent = '読み込み中…';
    try {
      if (!cache.has(id)) cache.set(id, await api.load(id));
      if (ticket !== asked) return;
      s.item = cache.get(id);
      fillReps(k);
    } catch (err) {
      console.error(err); // said on the page, next to the choice
      s.item = null;
      $('#cmpStatus').textContent = 'この動画を読み込めませんでした。';
      applyChoice();
      return;
    }
    $('#cmpStatus').textContent = '';
    applyChoice();
  }
  function fillSources(preferA, preferB, list) {
    const opts = list.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('');
    side.a.source.innerHTML = opts;
    side.b.source.innerHTML = opts;
    side.a.source.value = preferA;
    side.b.source.value = preferB;
  }
  async function start(preferId) {
    const list = await api.sources();
    open = true;
    cmp.playing = false;
    $('#cmpPlay').textContent = '再生';
    const has = list.length > 0;
    $('#cmpChoose').hidden = !has;
    if (!has) { $('#cmpMain').hidden = true; $('#cmpEmpty').hidden = false; }
    if (has) {
      // A is what was asked for or is open now; B the next saved one, or another repetition of the same video
      const a = preferId && list.some(o => o.id === preferId) ? preferId : list[0].id;
      const other = list.find(o => o.id !== a);
      const b = other ? other.id : a;
      fillSources(a, b, list);
      cache.clear();
      if (!cache.has(a)) cache.set(a, await api.load(a));
      if (!cache.has(b)) cache.set(b, await api.load(b));
      side.a.item = cache.get(a);
      side.b.item = cache.get(b);
      fillReps('a');
      fillReps('b');
      if (a === b && side.b.rep.options.length > 1) side.b.rep.value = String(side.b.rep.options.length - 1);
      const single = a === b && side.a.rep.options.length < 2;
      $('#cmpMain').hidden = single;
      $('#cmpEmpty').hidden = !single;
      if (!single) applyChoice();
    }
    if (!loop) loop = requestAnimationFrame(step);
  }
  function stop() {
    open = false;
    cmp.playing = false;
    for (const k of ['a', 'b']) {
      const s = side[k];
      s.video.pause();
      s.video.removeAttribute('src');
      s.video.load();
      s.prep = null;
      s.item = null;
    }
    for (const item of cache.values()) if (item.ownUrl) URL.revokeObjectURL(item.url);
    cache.clear();
  }

  // ---------- controls ----------
  for (const k of ['a', 'b']) {
    side[k].source.addEventListener('change', () => choose(k, side[k].source.value));
    side[k].rep.addEventListener('change', applyChoice);
    side[k].video.addEventListener('seeked', () => { if (!cmp.playing) drawOverlay(); });
  }
  $('#cmpPlay').addEventListener('click', () => setPlaying(!cmp.playing));
  $('#cmpSeek').addEventListener('input', e => { setPlaying(false); setTime(Number(e.target.value)); });
  $('#cmpRate').addEventListener('change', e => { cmp.rate = Number(e.target.value); });
  $('#cmpMix').addEventListener('input', e => { cmp.mix = Number(e.target.value); if (!cmp.playing) drawOverlay(); });
  $('#cmpLayer').addEventListener('click', e => {
    const b = e.target.closest('[data-layer]');
    if (!b) return;
    cmp.layer = b.dataset.layer;
    $('#cmpLayer').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    applyChoice();
  });
  $('#cmpJoints').addEventListener('click', e => {
    const b = e.target.closest('[data-joint]');
    if (!b) return;
    cmp.joint = b.dataset.joint;
    $('#cmpJoints').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    cmp.dirtyCharts = true;
    drawAll();
  });
  $('#cmpAngle').addEventListener('click', e => {
    const G = cmp.angleGeom;
    if (!G) return;
    const r = e.currentTarget.getBoundingClientRect(), u = (e.clientX - r.left - G.padL) / (G.W - G.padL - G.padR);
    setPlaying(false);
    setTime(cmp.t0 + Math.max(0, Math.min(1, u)) * (cmp.t1 - cmp.t0));
  });
  new ResizeObserver(() => { cmp.dirtyCharts = true; }).observe($('#cmpAngle'));

  return { start, stop, JOINTS, seek: t => { setTime(t); syncVideos(); drawAll(); }, state: () => ({ ...cmp, a: side.a.prep, b: side.b.prep }) };
};
