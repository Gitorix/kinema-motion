// Main app. Classic script; the page's module bootstrap passes in three.js and calls start().
window.KinemaApp = {
  start({ THREE, OrbitControls, RoomEnvironment, RoundedBoxGeometry }) {
    // ---------- constants ----------
    const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
    const LM = {
      nose: 0, lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
      lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28, lHeel: 29, rHeel: 30, lFt: 31, rFt: 32,
    };
    const LM_NAMES = [
      'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer',
      'left_ear', 'right_ear', 'mouth_left', 'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow',
      'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky', 'left_index', 'right_index',
      'left_thumb', 'right_thumb', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
      'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index',
    ];
    const ANGLES = [
      { k: 'rSh', side: 'r', ja: '肩', en: '右肩', g: 'sh', joint: LM.rSh, limb: 'rArm', csv: 'right_shoulder_elevation_deg' },
      { k: 'lSh', side: 'l', ja: '肩', en: '左肩', g: 'sh', joint: LM.lSh, limb: 'lArm', csv: 'left_shoulder_elevation_deg' },
      { k: 'rEl', side: 'r', ja: '肘', en: '右肘', g: 'el', joint: LM.rEl, limb: 'rArm', csv: 'right_elbow_flexion_deg' },
      { k: 'lEl', side: 'l', ja: '肘', en: '左肘', g: 'el', joint: LM.lEl, limb: 'lArm', csv: 'left_elbow_flexion_deg' },
      { k: 'rHip', side: 'r', ja: '股関節', en: '右股関節', g: 'hip', joint: LM.rHip, limb: 'rLeg', csv: 'right_hip_flexion_deg' },
      { k: 'lHip', side: 'l', ja: '股関節', en: '左股関節', g: 'hip', joint: LM.lHip, limb: 'lLeg', csv: 'left_hip_flexion_deg' },
      { k: 'rKn', side: 'r', ja: '膝', en: '右膝', g: 'kn', joint: LM.rKn, limb: 'rLeg', csv: 'right_knee_flexion_deg' },
      { k: 'lKn', side: 'l', ja: '膝', en: '左膝', g: 'kn', joint: LM.lKn, limb: 'lLeg', csv: 'left_knee_flexion_deg' },
    ];
    const GROUP_KEY = { kn: 'Kn', hip: 'Hip', el: 'El', sh: 'Sh' };
    const DASH = { kn: [], hip: [7, 4], el: [2, 3], sh: [10, 3, 2, 3] };
    const SYM = [
      { ja: '肩', l: 'lSh', r: 'rSh', parts: ['lArm', 'rArm'] },
      { ja: '肘', l: 'lEl', r: 'rEl', parts: ['lArm', 'rArm'] },
      { ja: '股関節', l: 'lHip', r: 'rHip', parts: ['lLeg', 'rLeg'] },
      { ja: '膝', l: 'lKn', r: 'rKn', parts: ['lLeg', 'rLeg'] },
    ];
    const PARTS = [
      { k: 'head', ja: '頭', idx: [0, 2, 5, 7, 8] },
      { k: 'torso', ja: '胴体', idx: [11, 12, 23, 24] },
      { k: 'rArm', ja: '右腕', idx: [12, 14, 16] },
      { k: 'lArm', ja: '左腕', idx: [11, 13, 15] },
      { k: 'rLeg', ja: '右脚', idx: [24, 26, 28] },
      { k: 'lLeg', ja: '左脚', idx: [23, 25, 27] },
    ];
    const PHASES = {
      STAND: { ja: '立っている', color: '--ink' },
      SQUAT: { ja: 'しゃがんでいる', color: '--accent' },
      BEND: { ja: '前かがみ', color: '--warn' },
      ARMSUP: { ja: '両腕を上げている', color: '--left' },
      ARMUP: { ja: '片腕を上げている', color: '--left' },
      ONELEG: { ja: '片脚立ち', color: '--bad' },
      MOVING: { ja: '移動中', color: '--ok' },
      NOPOSE: { ja: '人物を検出できません', color: '--muted' },
    };
    const BONES_2D = [
      [11, 13], [13, 15], [12, 14], [14, 16], [11, 12], [11, 23], [12, 24], [23, 24],
      [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
    ];
    const MUSCLES = window.KINEMA_MUSCLES;
    const MUSCLE = Object.fromEntries(MUSCLES.map(m => [m.id, m]));

    // ---------- helpers ----------
    const $ = sel => document.querySelector(sel);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    const fmtTime = t => {
      const m = Math.floor(t / 60);
      return `${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
    };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const len = a => Math.hypot(a[0], a[1], a[2]);
    const pt = (w, i) => [w[i * 3], w[i * 3 + 1], w[i * 3 + 2]];
    const midPt = (w, a, b) => [(w[a * 3] + w[b * 3]) / 2, (w[a * 3 + 1] + w[b * 3 + 1]) / 2, (w[a * 3 + 2] + w[b * 3 + 2]) / 2];
    function angleAt(w, a, b, c) {
      const u = sub(pt(w, a), pt(w, b)), v = sub(pt(w, c), pt(w, b));
      const d = len(u) * len(v);
      return d < 1e-9 ? 0 : Math.acos(clamp(dot(u, v) / d, -1, 1)) * 180 / Math.PI;
    }
    // Nothing that goes wrong while showing a result may stop the rest of the page: each part runs guarded, and what
    // happened is shown once on the page, so that a screenshot is enough to tell what it was.
    const problems = [];
    function reportProblem(err) {
      console.error(err);
      const text = String((err && err.message) || err);
      if (problems.some(p => p.text === text)) return;
      const at = String((err && err.stack) || '').split('\n').slice(1, 4)
        .map(s => s.trim().replace(/^at /, '').replace(/(https?|file):\/\/[^ )]*\//g, '').replace(/\?v=\d+/g, '')).join(' ← ');
      problems.push({ text, at });
      if (window.showPageError) window.showPageError(at ? `${text}（${at}）` : text);
    }
    const guard = (fn, ...args) => {
      try { return fn(...args); } catch (err) { reportProblem(err); return undefined; }
    };
    const tokens = {};
    function readTokens() {
      const cs = getComputedStyle(document.documentElement);
      for (const k of ['--ink', '--muted', '--line', '--accent', '--left', '--right', '--ok', '--warn', '--bad', '--info', '--panel', '--sunk', '--stage-a',
        '--tr-com', '--tr-sh', '--tr-hip', '--tr-kn', '--tr-ft', '--tr-wr']) tokens[k] = cs.getPropertyValue(k).trim();
    }
    readTokens();
    function once(target, okEvent, errEvent) {
      return new Promise((resolve, reject) => {
        const ok = () => { cleanup(); resolve(); };
        const err = () => { cleanup(); reject(new Error(errEvent)); };
        const cleanup = () => { target.removeEventListener(okEvent, ok); target.removeEventListener(errEvent, err); };
        target.addEventListener(okEvent, ok);
        target.addEventListener(errEvent, err);
      });
    }
    // iPhones can hold back a video's first picture until something asks it to play: ask after a moment, and never wait forever
    function loadVideo(v) {
      const nudge = setTimeout(() => { const p = v.play(); if (p) p.then(() => v.pause()).catch(() => {}); }, 2500);
      const limit = new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 30000));
      return Promise.race([once(v, 'loadeddata', 'error'), limit]).finally(() => clearTimeout(nudge));
    }
    // a phone must not go to sleep during a long analysis; browsers without this just carry on
    let wakeLock = null;
    async function keepAwake(on) {
      try {
        if (on && !wakeLock && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
        else if (!on && wakeLock) { const held = wakeLock; wakeLock = null; await held.release(); }
      } catch { wakeLock = null; }
    }
    function seekVideo(v, t) {
      return new Promise(resolve => {
        const done = () => { clearTimeout(timer); v.removeEventListener('seeked', done); resolve(); };
        const timer = setTimeout(done, 4000);
        v.addEventListener('seeked', done);
        v.currentTime = t;
      });
    }

    // ---------- state ----------
    const state = {
      source: 'demo', name: '', move: 'squat', fps: 30, duration: 10, total: 0, analyzed: 0,
      frames: [], events: [], rom: {}, vw: 600, vh: 800, result: null,
      idx: -1, playing: false, rate: 1, clock: 0, analyzing: false, aborted: false, runId: 0,
      range: [0, Infinity], // the frames being analysed and played (the whole video unless narrowed)
    };
    function rangeNow() {
      const last = Math.max(0, state.analyzed - 1), a = clamp(state.range[0], 0, last);
      return [a, clamp(state.range[1], a, last)];
    }
    function wholeRange() {
      const [a, b] = rangeNow();
      return a === 0 && b === Math.max(0, state.analyzed - 1);
    }
    // how many frames of the range have a detected person
    function detectionRate() {
      const [a, b] = rangeNow();
      let found = 0;
      for (let i = a; i <= b; i++) if (state.frames[i] && state.frames[i].ok) found++;
      return found / Math.max(1, b - a + 1);
    }
    // what is on screen: the rest is not drawn until it comes back
    const seen = { stage: true, angle: true, traj: true, kin: true, more: false };
    const ui = { labels: true, trails: true, turntable: false, muscles: false, pip: true, atlas: false, output: false, show: 'roles' };
    // What is drawn over the video and the 3D view, item by item ("表示の設定"). Kept in this browser only.
    const JOINT_KEYS = ['sh', 'el', 'hip', 'kn'];
    const DISP_GROUPS = [
      { ja: '角度の数字', items: [['sh', '肩'], ['el', '肘'], ['hip', '股関節'], ['kn', '膝'], ['sideL', '左側'], ['sideR', '右側']] },
      { ja: '文字', items: [['dist', '距離と重心の高さ'], ['force', '力と速さの数字'], ['moment', '場面の名前'], ['guideText', '理想の方向の説明'], ['phase', '動きの状態'], ['notes', '色の説明'], ['muscleNames', '筋肉の名前'], ['pipTag', '動画の名札']] },
      { ja: '線と矢印', items: [['skeleton', '骨格の線（元動画）'], ['grf', '押す力の矢印'], ['vel', '動く方向の矢印'], ['guideLine', '理想の方向の線'], ['ruler', '床の距離の線'], ['marks', '軌跡の上の印'], ['floor', '床のマス目']] },
    ];
    const disp = Object.fromEntries(DISP_GROUPS.flatMap(g => g.items.map(([k]) => [k, true])));
    // the charts beside the 3D view carry the angles and the distances: it starts with the body in view, not figures over it
    for (const k of [...JOINT_KEYS, 'dist', 'force', 'guideText']) disp[k] = false;
    try {
      const saved = JSON.parse(localStorage.getItem('kinema.display2') || '{}');
      for (const k of Object.keys(disp)) if (typeof saved[k] === 'boolean') disp[k] = saved[k];
      if (typeof saved.trails === 'boolean') ui.trails = saved.trails;
    } catch { /* storage unavailable */ }
    ui.labels = JOINT_KEYS.some(k => disp[k]);
    const angleOn = a => disp[a.g] && disp[a.side === 'l' ? 'sideL' : 'sideR'];

    // ---------- DOM ----------
    const stage = $('#stage');
    const video = $('#video');
    const overlay = $('#overlay');
    const pip = $('#pip');
    const pipTag = $('#pipTag');
    const hint = $('#hint');
    const stageRead = $('.stage-read');
    const calloutsEl = $('#callouts');
    const calloutSvg = $('#calloutLines');
    const tagsEl = $('#muscleTags');
    const progressEl = $('#progress');
    const progressText = $('#progressText');
    const progressFill = progressEl.querySelector('.bar-track i');
    const progressBtn = $('#progressBtn');
    const phaseEn = $('#phaseEn');
    const phaseJa = $('#phaseJa');
    const repsEl = $('#reps');
    const repsLabel = $('#repsLabel');
    const logEl = $('#log');
    const pill = $('#statusPill');
    const metaSource = $('#metaSource');
    const metaTime = $('#metaTime');
    const metaFrame = $('#metaFrame');
    const metaMove = $('#metaMove');
    const playBtn = $('#playBtn');
    const backBtn = $('#backBtn');
    const fwdBtn = $('#fwdBtn');
    const rateSel = $('#rate');
    const slowBtn = $('#slowBtn');
    const seekBar = $('#seekBar');
    const playTimeEl = $('#playTime');
    const rangeLabel = $('#rangeLabel');
    const rangeFromBtn = $('#rangeFrom');
    const rangeToBtn = $('#rangeTo');
    const rangeAllBtn = $('#rangeAll');
    const repBox = $('#pRep');
    const repLabel = $('#repLabel');
    const repAllBtn = $('#repAll'), repPrevBtn = $('#repPrev'), repNextBtn = $('#repNext');
    const csvBtn = $('#csvBtn');
    const fileInput = $('#file');
    const chartEl = $('#chart');
    const sparkEl = $('#spark');
    const trailTagsEl = $('#trailTags');
    const markTagsEl = $('#markTags');
    const heightIn = $('#heightCm');
    const weightIn = $('#weightKg');

    // ---------- HUD ----------
    const hud = { angle: {}, sym: [], part: {} };
    function buildHud() {
      const angles = $('#angles');
      ANGLES.forEach((a, i) => {
        const row = document.createElement('div');
        row.className = `arow ${a.side}${i > 0 && a.side === 'r' ? ' gap' : ''}`;
        row.innerHTML = `<span class="side">${a.side === 'l' ? '左' : '右'}</span><span class="jname">${a.ja}</span>` +
          '<span class="track"><i class="rom" hidden></i><i class="fill"></i></span><span class="val">—</span>';
        angles.append(row);
        hud.angle[a.k] = { row, fill: row.querySelector('.fill'), rom: row.querySelector('.rom'), val: row.querySelector('.val') };
      });
      for (const [list, host, target] of [[SYM, '#sym', hud.sym], [PARTS, '#parts', null]]) {
        for (const item of list) {
          const row = document.createElement('div');
          row.className = 'srow';
          row.innerHTML = `<span>${item.ja}</span><span class="val">—</span><span class="chip">—</span>`;
          $(host).append(row);
          const ref = { val: row.querySelector('.val'), chip: row.querySelector('.chip') };
          if (target) target.push({ ...item, ...ref });
          else hud.part[item.k] = ref;
        }
      }
    }
    buildHud();
    const setChip = (el, kind, text) => { el.className = `chip ${kind}`; el.textContent = text; };

    // ---------- per-frame metrics ----------
    function resetData(source, name, fps, duration) {
      Object.assign(state, { source, saved: false, general: false, quality: null, name, fps, duration, total: 0, analyzed: 0, frames: [], events: [], idx: -1, clock: 0, result: null, autoMove: false, range: [0, Infinity] });
      state.rom = Object.fromEntries(ANGLES.map(a => [a.k, [Infinity, -Infinity]]));
      poseIdx = -1;
      repFocus = -1;
      logEl.textContent = '';
      logged = 0;
      chart.dirty = true;
    }
    function bodyShift(f, g) {
      if (!f.img || !g.img) return 0;
      const W = state.vw, H = state.vh;
      const hipX = img => (img[LM.lHip * 2] + img[LM.rHip * 2]) / 2 * W;
      const sx = (f.img[LM.lSh * 2] + f.img[LM.rSh * 2] - f.img[LM.lHip * 2] - f.img[LM.rHip * 2]) / 2 * W;
      const sy = (f.img[LM.lSh * 2 + 1] + f.img[LM.rSh * 2 + 1] - f.img[LM.lHip * 2 + 1] - f.img[LM.rHip * 2 + 1]) / 2 * H;
      const torsoPx = Math.hypot(sx, sy);
      if (torsoPx < 1) return 0;
      const torsoM = len(sub(midPt(f.w, LM.lSh, LM.rSh), midPt(f.w, LM.lHip, LM.rHip)));
      return Math.abs(hipX(f.img) - hipX(g.img)) * torsoM / torsoPx;
    }
    function rawPhase(m, f) {
      if (!f.ok) return 'NOPOSE';
      const a = m.ang;
      const knee = (a.lKn + a.rKn) / 2, hip = (a.lHip + a.rHip) / 2;
      if (knee > 55 && hip > 45) return 'SQUAT';
      if (hip > 50) return 'BEND';
      if (a.lSh > 140 && a.rSh > 140) return 'ARMSUP';
      if (a.lSh > 140 || a.rSh > 140) return 'ARMUP';
      if (Math.abs(f.w[LM.lAn * 3 + 1] - f.w[LM.rAn * 3 + 1]) > 0.12) return 'ONELEG';
      if (m.spd.body > 0.35 && knee < 40) return 'MOVING';
      return 'STAND';
    }
    function computeMetrics(i) {
      const f = state.frames[i];
      const p = i > 0 ? state.frames[i - 1].m : null;
      const m = { ok: f.ok, ang: null, vis: null, spd: { lWr: 0, rWr: 0, body: 0 }, cand: p ? p.cand : null, candN: p ? p.candN : 0, phase: 'NOPOSE', reps: p ? p.reps : 0, down: p ? p.down : false };
      if (f.ok) {
        const w = f.w;
        m.ang = {
          lSh: angleAt(w, LM.lHip, LM.lSh, LM.lEl), rSh: angleAt(w, LM.rHip, LM.rSh, LM.rEl),
          lEl: 180 - angleAt(w, LM.lSh, LM.lEl, LM.lWr), rEl: 180 - angleAt(w, LM.rSh, LM.rEl, LM.rWr),
          lHip: 180 - angleAt(w, LM.lSh, LM.lHip, LM.lKn), rHip: 180 - angleAt(w, LM.rSh, LM.rHip, LM.rKn),
          lKn: 180 - angleAt(w, LM.lHip, LM.lKn, LM.lAn), rKn: 180 - angleAt(w, LM.rHip, LM.rKn, LM.rAn),
        };
        const back = state.frames[i - 2];
        if (back && back.ok && f.t > back.t) {
          const dt = f.t - back.t;
          const raw = { lWr: len(sub(pt(w, LM.lWr), pt(back.w, LM.lWr))) / dt, rWr: len(sub(pt(w, LM.rWr), pt(back.w, LM.rWr))) / dt };
          const prev = p && p.ok ? p.spd : raw;
          for (const k of Object.keys(raw)) m.spd[k] = prev[k] + 0.35 * (raw[k] - prev[k]);
        }
        const sec = state.frames[i - Math.round(state.fps)];
        if (sec && sec.ok && f.t > sec.t) m.spd.body = bodyShift(f, sec) / (f.t - sec.t);
        m.vis = {};
        for (const part of PARTS) m.vis[part.k] = part.idx.reduce((s, j) => s + f.vis[j], 0) / part.idx.length;
        for (const a of ANGLES) {
          const r = state.rom[a.k];
          r[0] = Math.min(r[0], m.ang[a.k]);
          r[1] = Math.max(r[1], m.ang[a.k]);
        }
      }
      const raw = rawPhase(m, f);
      if (raw === m.cand) m.candN++;
      else { m.cand = raw; m.candN = 1; }
      const hold = Math.max(3, Math.round(0.2 * state.fps));
      m.phase = !p || m.candN >= hold ? m.cand : p.phase;
      if (m.ok) {
        const knee = (m.ang.lKn + m.ang.rKn) / 2;
        if (!m.down && knee > 70) m.down = true;
        else if (m.down && knee < 30) { m.down = false; m.reps++; }
      }
      if (!p || m.phase !== p.phase) state.events.push({ t: f.t, phase: m.phase });
      return m;
    }

    // ---------- 3D scene ----------
    // phones: fewer pixels and a smaller shadow, so that scrolling stays smooth
    const touchy = matchMedia('(pointer: coarse)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, touchy ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = touchy ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    $('#view3d').append(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.88, 0);
    controls.enableDamping = true;
    controls.minDistance = 0.8;
    controls.maxDistance = 9;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.autoRotateSpeed = 1.2;
    // a finger moving up or down over the figure scrolls the page; sideways it turns the figure
    if (touchy) renderer.domElement.style.touchAction = 'pan-y';
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(-2.0, 4.0, 3.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(touchy ? 1024 : 2048, touchy ? 1024 : 2048);
    Object.assign(keyLight.shadow.camera, { left: -2, right: 2, top: 2.6, bottom: -1.4, near: 0.5, far: 12 });
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0xdfeeff, 0.6);
    rim.position.set(2.5, 2.0, -3.0);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9096, 0.4));
    const shadowFloor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.14 }));
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);
    // floor: squares of 25 cm with every metre drawn darker, a ruler for how far the body travels
    // (once a movement is analysed the figure stands at the person's real size, see buildPlan)
    const floorGrid = new THREE.GridHelper(6, 24);
    const floorMetre = new THREE.GridHelper(6, 6);
    for (const [g, opacity, y] of [[floorGrid, 0.16, 0.002], [floorMetre, 0.42, 0.003]]) {
      g.material.transparent = true;
      g.material.opacity = opacity;
      g.position.y = y;
      scene.add(g);
    }

    const figure = window.createKinemaFigure(THREE, { RoundedBoxGeometry });
    scene.add(figure.group);
    const atlas = window.createKinemaAtlas(THREE);
    scene.add(atlas.group);
    const ANAT = window.KINEMA_ANATOMY || { muscles: [], missing: [] };

    function applyThemeTo3D() {
      floorGrid.material.color.set(tokens['--muted']);
      floorMetre.material.color.set(tokens['--muted']);
    }
    applyThemeTo3D();

    // Scene coordinates: y up, z toward the camera, feet on y = 0.
    const P3 = Array.from({ length: 33 }, () => new THREE.Vector3());
    const levelQ = new THREE.Quaternion();
    const Y_AXIS = new THREE.Vector3(0, 1, 0);
    let footLevel = null;
    // The frame whose pose is on the figure. A frame without a detected person borrows its nearest neighbour across a
    // short gap, so the figure does not flicker; over a longer gap it disappears.
    let poseIdx = -1;
    function nearestPose(i) {
      const F = state.frames, reach = Math.round(0.4 * state.fps);
      if (F[i] && F[i].ok) return i;
      for (let d = 1; d <= reach; d++) {
        if (F[i - d] && F[i - d].ok) return i - d;
        if (i + d < state.analyzed && F[i + d] && F[i + d].ok) return i + d;
      }
      return -1;
    }
    // A tilted camera tilts the skeleton: rotate so the average upright ankle-to-shoulder line points up.
    function updateLevel() {
      const sum = new THREE.Vector3(), v = new THREE.Vector3();
      let n = 0;
      for (let i = 0; i < state.analyzed; i++) {
        const f = state.frames[i];
        if (!f.ok) continue;
        const a = f.m.ang;
        if (a.lKn > 25 || a.rKn > 25 || a.lHip > 30 || a.rHip > 30) continue;
        const w = f.w;
        const d = k => (w[LM.lSh * 3 + k] + w[LM.rSh * 3 + k] - w[LM.lAn * 3 + k] - w[LM.rAn * 3 + k]) / 2;
        v.set(d(0), -d(1), -d(2));
        if (v.lengthSq() < 1e-6) continue;
        sum.add(v.normalize());
        n++;
      }
      if (n < 5 || sum.normalize().angleTo(Y_AXIS) > Math.PI / 4) levelQ.identity();
      else levelQ.setFromUnitVectors(sum, Y_AXIS);
    }
    // Placing the figure. Once a movement is analysed, each frame gets: the feet's height (smoothed without lag),
    // the lift off the floor during a jump and the travel along the floor (both measured in the video).
    // While a video is still being analysed, the feet simply follow the floor.
    const TP = window.KinemaTrajectory;
    let plan = null;
    function rawPose(f, out) {
      for (let k = 0; k < 33; k++) out[k].set(f.w[k * 3], -f.w[k * 3 + 1], -f.w[k * 3 + 2]).applyQuaternion(levelQ);
      return out;
    }
    const lowestFoot = P => Math.min(P[LM.lHeel].y, P[LM.rHeel].y, P[LM.lFt].y, P[LM.rFt].y, P[LM.lAn].y - 0.06, P[LM.rAn].y - 0.06);
    function buildPlan() {
      const r = state.result, T = r && r.traj, n = state.analyzed;
      plan = null;
      if (!T || T.n !== n) return;
      const foot = new Float64Array(n).fill(NaN), lift = new Float32Array(n), shift = new Float32Array(n);
      const tmp = Array.from({ length: 33 }, () => new THREE.Vector3());
      for (let i = 0; i < n; i++) if (state.frames[i].ok) foot[i] = lowestFoot(rawPose(state.frames[i], tmp));
      TP.fillGaps(foot, Math.round(0.5 * state.fps));
      TP.smooth(foot, state.fps, 4);
      // real metres: the figure is scaled from the AI's body model to the person's size (height, gravity or the
      // model itself), so the floor squares measure true distances
      const s = Number.isFinite(T.mPerPx) ? T.mPerPx : 0, sl = T.floor.slope, k1 = 1 / Math.hypot(1, sl);
      const k = T.mPerPx / T.mPerPxPose > 0 && Number.isFinite(T.mPerPx / T.mPerPxPose) ? T.mPerPx / T.mPerPxPose : 1;
      for (const fl of r.flights || []) {
        for (let i = Math.max(0, fl.takeoff - 3); i <= Math.min(n - 1, fl.land + 2); i++) {
          const x = T.px.toe.x[i], y = T.px.toe.y[i];
          if (Number.isFinite(y)) lift[i] = Math.max(0, (T.floor.local[i] + sl * x - y) * k1 * s - 0.01);
        }
      }
      // travel along the floor: the hips in the video, centred on the middle of the movement
      const along = i => (T.px.hip.x[i] + sl * T.px.hip.y[i]) * k1;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = along(i);
        if (Number.isFinite(a)) { lo = Math.min(lo, a); hi = Math.max(hi, a); }
      }
      for (let i = 0; i < n; i++) {
        const a = along(i);
        shift[i] = Number.isFinite(a) ? (a - (lo + hi) / 2) * s : 0;
      }
      // where the movement starts on the floor (the take-off line of a long jump), and the standing height of the
      // centre of mass, for the floor ruler
      const i0 = r.trajView.i0, ox = T.origin;
      const startRaw = ((ox + sl * (T.floor.local[i0] + sl * ox)) * k1 - (lo + hi) / 2) * s;
      const startX = Number.isFinite(startRaw) ? startRaw : 0;
      const base = (r.ground && r.ground.base) || [];
      const ys = base.map(i => T.m.com.y[i]).filter(Number.isFinite).sort((a, b) => a - b);
      plan = { n, foot, lift, shift, k, startX, stand: ys.length ? ys[Math.floor(ys.length / 2)] : NaN };
    }
    function placePose(f, i, out, jump) {
      rawPose(f, out);
      let foot, lift = 0, shift = 0, k = 1;
      if (plan && i < plan.n && Number.isFinite(plan.foot[i])) {
        foot = plan.foot[i]; lift = plan.lift[i]; shift = plan.shift[i]; k = plan.k;
      } else {
        const lf = lowestFoot(out);
        footLevel = footLevel === null || jump ? lf : footLevel + 0.3 * (lf - footLevel);
        foot = footLevel;
      }
      for (const p of out) {
        p.y = (p.y - foot) * k + lift;
        p.x = p.x * k + shift;
        p.z *= k;
      }
      return out;
    }

    // ---------- trajectories in 3D ----------
    // Paths of the chosen body points over the stretch the analysis picked, fixed to the floor (not to the body).
    // Each is a thin tube: faint for the whole stretch, solid up to the current frame, with a dot where the point is now.
    const TRAJ_DEFAULT = { squat: ['com'], jump: ['com'], broad: ['com'] };
    const trajUi = { points: new Set(TRAJ_DEFAULT.squat) };
    // A video with several repetitions shows its paths one repetition at a time: the one being played, or the one the
    // viewer picked (then playback goes round within it). Other movements have the one stretch the analysis chose.
    let repFocus = -1;
    const segments = () => {
      const v = state.result && state.result.trajView;
      return v && v.perRep && v.segments && v.segments.length ? v.segments : null;
    };
    function segNow() {
      const segs = segments();
      if (!segs) return -1;
      if (repFocus >= 0 && repFocus < segs.length) return repFocus;
      let best = 0, gap = Infinity;
      segs.forEach(([a, b], j) => {
        const d = state.idx < a ? a - state.idx : state.idx > b ? state.idx - b : 0;
        if (d < gap) { gap = d; best = j; }
      });
      return best;
    }
    const spanOf = ([a, b]) => {
      const pad = Math.round(0.25 * state.fps);
      return [Math.max(0, a - pad), Math.min(state.analyzed - 1, b + pad)];
    };
    // the stretch of frames whose paths are drawn
    function traceSpan() {
      const v = state.result && state.result.trajView, segs = segments();
      if (!segs) return v ? { i0: v.i0, i1: v.i1, seg: -1, start: v.i0 } : null;
      const seg = segNow(), [i0, i1] = spanOf(segs[seg]);
      return { i0, i1, seg, start: segs[seg][0] };
    }
    const trailGroup = new THREE.Group();
    scene.add(trailGroup);
    const dotGeo = new THREE.SphereGeometry(1, 16, 12);
    const coneGeo = new THREE.ConeGeometry(0.016, 0.045, 10);
    let trails3d = [];
    let trailSpan = null; // the stretch the 3D paths were built for (see traceSpan)
    let trailStart = null; // where the movement starts: in the scene (x) and in metres (mx, my)
    const evMarks = [];
    // a tube through points in time order (null = gap); counts[n]: indices up to point n, to reveal it as time passes
    function tubeGeometry(pts, radius, radial = 6) {
      const pos = [], idx = [], counts = new Uint32Array(pts.length);
      const tan = new THREE.Vector3(), nrm = new THREE.Vector3(0, 1, 0), bin = new THREE.Vector3(), v = new THREE.Vector3();
      let prev = -1;
      for (let n = 0; n < pts.length; n++) {
        const p = pts[n];
        if (!p) { prev = -1; counts[n] = idx.length; continue; }
        tan.subVectors(pts[n + 1] || p, pts[n - 1] || p);
        if (tan.lengthSq() < 1e-12) tan.set(1, 0, 0);
        tan.normalize();
        // carry the ring's orientation along the path so the tube does not twist
        nrm.addScaledVector(tan, -nrm.dot(tan));
        if (nrm.lengthSq() < 1e-8) nrm.set(0, 0, 1).addScaledVector(tan, -tan.z);
        nrm.normalize();
        bin.crossVectors(tan, nrm);
        const base = pos.length / 3;
        for (let k = 0; k < radial; k++) {
          const a = (k / radial) * Math.PI * 2;
          v.copy(p).addScaledVector(nrm, Math.cos(a) * radius).addScaledVector(bin, Math.sin(a) * radius);
          pos.push(v.x, v.y, v.z);
        }
        if (prev >= 0) {
          for (let k = 0; k < radial; k++) {
            const k2 = (k + 1) % radial;
            idx.push(prev + k, base + k, prev + k2, prev + k2, base + k, base + k2);
          }
        }
        prev = base;
        counts[n] = idx.length;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return { g, counts };
    }
    function clearTrails() {
      for (const group of [trailGroup, guideGroup]) {
        group.traverse(o => { if (o.isMesh || o.isLine) { if (o.geometry !== dotGeo && o.geometry !== coneGeo) o.geometry.dispose(); o.material.dispose(); } });
        group.clear();
      }
      trails3d = [];
      guideInfo = null;
      for (const m of evMarks) m.el.remove();
      evMarks.length = 0;
    }
    function buildTrails() {
      clearTrails();
      trailSpan = null;
      trailStart = null;
      const r = state.result, T = r && r.traj;
      if (!plan || !T || !r.trajView) return;
      trailSpan = traceSpan();
      const { i0, i1 } = trailSpan, len = i1 - i0 + 1;
      const keys = [...trajUi.points].flatMap(p => TP.seriesOf(p, r.side));
      const xyz = Object.fromEntries(keys.map(k => [k, [0, 1, 2].map(() => new Float64Array(len).fill(NaN))]));
      const tmp = Array.from({ length: 33 }, () => new THREE.Vector3());
      for (let i = i0; i <= i1; i++) {
        const f = state.frames[i];
        if (!f.ok) continue;
        placePose(f, i, tmp);
        const P = j => [tmp[j].x, tmp[j].y, tmp[j].z];
        for (const k of keys) TP.SERIES[k](P).forEach((v, a) => { xyz[k][a][i - i0] = v; });
      }
      for (const k of keys) {
        for (const a of xyz[k]) { TP.fillGaps(a, Math.round(0.25 * state.fps)); TP.smooth(a, state.fps); }
        const [xs, ys, zs] = xyz[k];
        const pts = Array.from(xs, (x, n) => (Number.isFinite(x) ? new THREE.Vector3(x, ys[n], zs[n]) : null));
        const color = tokens[`--tr-${k.replace(/[LR]$/, '')}`];
        const tube = tubeGeometry(pts, 0.008);
        const faint = new THREE.Mesh(tube.g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
        const solid = new THREE.Mesh(tube.g.clone(), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.5 }));
        const dot = new THREE.Mesh(dotGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
        dot.scale.setScalar(0.022);
        trailGroup.add(faint, solid, dot);
        // which way the point travels: small cones along the path (none where it hardly moves)
        for (let m = 3; disp.marks && m < pts.length - 3; m += 5) {
          const a = pts[m - 1], b = pts[m + 1];
          if (!a || !b || !pts[m]) continue;
          const d = new THREE.Vector3().subVectors(b, a);
          if (d.lengthSq() < 4e-6) continue;
          const cone = new THREE.Mesh(coneGeo, solid.material);
          cone.position.copy(pts[m]);
          cone.quaternion.setFromUnitVectors(Y_AXIS, d.normalize());
          trailGroup.add(cone);
        }
        trails3d.push({ key: k, solid, dot, counts: tube.counts, pts });
      }
      // key moments, marked on the centre-of-mass path (or the first path drawn)
      const ref = trails3d.find(t => t.key === 'com') || trails3d[0];
      if (ref) {
        for (const ev of r.trajView.events) {
          const p = ref.pts[ev.i - i0];
          if (!p) continue;
          const mark = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: tokens['--ink'] }));
          mark.scale.setScalar(0.014);
          mark.position.copy(p);
          mark.visible = disp.marks;
          trailGroup.add(mark);
          const el = document.createElement('span');
          el.className = 'evtag';
          el.textContent = ev.ja;
          trailTagsEl.append(el);
          evMarks.push({ el, pos: p, ev });
        }
      }
      buildGuides(r, tmp);
      updateTrails();
    }
    // the ideal direction: straight down and up over where the movement started (squat, jump),
    // or the range of good take-off angles from the centre of mass at take-off (long jump)
    function buildGuides(r, tmp) {
      const dashed = (pts, color) => {
        const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.04 }));
        l.computeLineDistances();
        return l;
      };
      const color = tokens['--ok'];
      if (r.move === 'broad') {
        const ev = r.trajView.events.find(e => e.ja === '踏み切り' && e.i >= trailSpan.i0 && e.i <= trailSpan.i1), fi = ev ? ev.i - 1 : -1;
        const anchor = (r.trajView.anchors || [])[trailSpan.seg], ti = anchor ? anchor.i : fi;
        if (fi < 0 || ti < 0 || !state.frames[fi].ok || !state.frames[ti].ok) return;
        // the take-off line of this jump: the toes where the distance is measured from, as in the plot
        const part = r.side === 'r' ? LM.rFt : LM.lFt;
        trailStart = { x: placePose(state.frames[ti], ti, tmp)[part].x, mx: r.traj.m.toe.x[ti], my: r.traj.m.com.y[trailSpan.start] };
        const { fwd, com } = bodyAxes(placePose(state.frames[fi], fi, tmp));
        const ray = deg => fwd.clone().multiplyScalar(Math.cos(deg * Math.PI / 180)).add(new THREE.Vector3(0, Math.sin(deg * Math.PI / 180), 0)).multiplyScalar(1.0).add(com);
        const fan = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([com, ray(25), ray(45)]),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
        guideGroup.add(fan, dashed([com, ray(25), com, ray(45)], color));
        guideInfo = { pos: ray(35), text: '踏み切りの目安の角度（25〜45°）' };
      } else {
        // straight down and up from where the centre of mass is when this movement starts
        const first = nearestPose(trailSpan.start);
        if (first < 0) return;
        const { com } = bodyAxes(placePose(state.frames[first], first, tmp));
        trailStart = { x: com.x, mx: r.traj.m.com.x[first], my: r.traj.m.com.y[first] };
        guideGroup.add(dashed([new THREE.Vector3(com.x, 0, com.z), new THREE.Vector3(com.x, 1.9, com.z)], color));
        guideInfo = { pos: new THREE.Vector3(com.x, 1.8, com.z), text: r.move === 'squat' ? '理想：重心はこの線に沿って真下・真上へ' : '理想：この線に沿って真上へ跳ぶ' };
      }
    }
    function updateTrails() {
      // the next repetition has come round: its paths replace these (buildTrails ends by coming back here)
      if (trailSpan && trailSpan.seg !== segNow()) { buildTrails(); return; }
      const show = ui.trails && !ui.atlas && trails3d.length > 0;
      trailGroup.visible = show;
      trailTagsEl.hidden = !show || !disp.moment;
      if (!show) return;
      const n = state.idx - trailSpan.i0;
      for (const t of trails3d) {
        t.solid.geometry.setDrawRange(0, n < 0 ? 0 : t.counts[Math.min(n, t.counts.length - 1)]);
        const p = n >= 0 && n < t.pts.length ? t.pts[n] : null;
        t.dot.visible = !!p;
        if (p) t.dot.position.copy(p);
      }
    }
    // of the moments with the same name (each squat's bottom), the one nearest to frame `now`
    function nearestEvents(events, now) {
      const best = {};
      for (const ev of events) if (!best[ev.ja] || Math.abs(ev.i - now) < Math.abs(best[ev.ja].i - now)) best[ev.ja] = ev;
      return new Set(Object.values(best));
    }
    function updateEventTags() {
      if (trailTagsEl.hidden || !evMarks.length) return;
      const W = stage.clientWidth, H = stage.clientHeight;
      // in 3D only the moment being passed is named (they would pile up on a straight up-and-down path)
      const near = evMarks.reduce((b, m) => (!b || Math.abs(m.ev.i - state.idx) < Math.abs(b.ev.i - state.idx) ? m : b), null);
      const named = near && Math.abs(near.ev.i - state.idx) <= 0.6 * state.fps ? near : null;
      for (const m of evMarks) {
        const [x, y, z] = toScreen(m.pos, W, H);
        m.el.hidden = z > 1 || m !== named;
        m.el.style.transform = `translate(${clamp(x + 8, 4, W - 80).toFixed(1)}px, ${clamp(y - 24, 4, H - 24).toFixed(1)}px)`;
      }
    }

    // ---------- floor ruler, push and direction ----------
    // On the floor: where the movement started and how far the centre of mass has travelled from there (squares of
    // 25 cm). Arrows: the push on the floor (estimated) and the direction the body moves. Guides: see buildGuides.
    const markGroup = new THREE.Group();
    const guideGroup = new THREE.Group();
    let guideInfo = null;
    scene.add(markGroup);
    markGroup.add(guideGroup);
    const flatMat = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const startRing = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.095, 40), flatMat());
    const nowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.05, 32), flatMat());
    startRing.rotation.x = nowDisc.rotation.x = -Math.PI / 2;
    const ruler = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineDashedMaterial({ dashSize: 0.06, gapSize: 0.04 }));
    function makeArrow() {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.4 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 12), m), head = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.09, 16), m);
      const g = new THREE.Group();
      g.add(shaft, head);
      return { g, m, shaft, head };
    }
    const grfArrow = makeArrow(), velArrow = makeArrow();
    markGroup.add(startRing, nowDisc, ruler, grfArrow.g, velArrow.g);
    function markTag(cls, dx, dy) {
      const el = document.createElement('span');
      el.className = `marktag ${cls}`;
      el.hidden = true;
      markTagsEl.append(el);
      return { el, pos: new THREE.Vector3(), dx, dy };
    }
    const mtags = { start: markTag('start', -24, 10), now: markTag('now', 12, 10), grf: markTag('grf', 10, -12), vel: markTag('vel', 10, -26), guide: markTag('guide', 8, -10) };
    function showTag(t, pos, text) {
      t.el.textContent = text;
      t.el.hidden = false;
      t.pos.copy(pos);
    }
    function setArrow(a, from, dir, len) {
      a.g.visible = len > 0.03;
      if (!a.g.visible) return;
      a.g.position.copy(from);
      a.g.quaternion.setFromUnitVectors(Y_AXIS, dir.clone().normalize());
      const shaft = Math.max(0.01, len - 0.09);
      a.shaft.scale.set(1, shaft, 1);
      a.shaft.position.set(0, shaft / 2, 0);
      a.head.position.set(0, shaft + 0.045, 0);
    }
    function applyMarkTheme() {
      startRing.material.color.set(tokens['--ink']);
      nowDisc.material.color.set(tokens['--tr-com']);
      ruler.material.color.set(tokens['--tr-com']);
      grfArrow.m.color.set(tokens['--warn']);
      grfArrow.m.emissive.set(tokens['--warn']).multiplyScalar(0.3);
      velArrow.m.color.set(tokens['--ink']);
      velArrow.m.emissive.set(tokens['--ink']).multiplyScalar(0.15);
    }
    applyMarkTheme();
    const lenJa = m => (Math.abs(m) < 1 ? `${Math.round(Math.abs(m) * 100)} cm` : `${Math.abs(m).toFixed(2)} m`);
    const signedCm = m => {
      const cm = Math.round(m * 100);
      return cm === 0 ? '±0 cm' : `${cm > 0 ? '+' : '−'}${Math.abs(cm)} cm`;
    };
    // the way a placed pose faces (along the floor) and its centre of mass
    function bodyAxes(P) {
      const fwd = new THREE.Vector3().subVectors(P[LM.lSh], P[LM.rSh]).add(new THREE.Vector3().subVectors(P[LM.lHip], P[LM.rHip]));
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-8) fwd.set(1, 0, 0);
      fwd.normalize().cross(Y_AXIS); // left-to-right turned a quarter: forward
      return { fwd, com: new THREE.Vector3(...TP.com(j => [P[j].x, P[j].y, P[j].z])) };
    }
    function updateMarks() {
      const r = state.result, T = r && r.traj, K = r && r.kin, i = poseIdx, f = state.frames[i];
      // between repetitions (walking to another place, say) there is nothing to measure
      const between = !!segments() && !!trailSpan && (state.idx < trailSpan.i0 || state.idx > trailSpan.i1);
      const show = !ui.atlas && !!plan && !!T && !!f && f.ok && !between;
      markGroup.visible = show;
      for (const t of Object.values(mtags)) t.el.hidden = true;
      $('#floorNote').hidden = !(disp.notes && !ui.atlas);
      if (!show) return;
      const { fwd, com } = bodyAxes(P3);
      const broad = r.move === 'broad', front = T.view === 'front', from = broad ? '踏み切り線' : 'スタート';
      startRing.visible = nowDisc.visible = ruler.visible = disp.ruler;
      guideGroup.visible = disp.guideLine;
      // floor ruler: from where this movement started (the take-off line of a long jump) to under the centre of mass now
      const st = trailStart, startX = st ? st.x : plan.startX;
      startRing.position.set(startX, 0.004, com.z);
      nowDisc.position.set(com.x, 0.005, com.z);
      ruler.geometry.setFromPoints([new THREE.Vector3(startX, 0.006, com.z), new THREE.Vector3(com.x, 0.006, com.z)]);
      ruler.computeLineDistances();
      if (disp.dist) showTag(mtags.start, startRing.position, from);
      const dx = T.m.com.x[i] - (st ? st.mx : 0), hy = T.m.com.y[i], stand = st ? st.my : plan.stand;
      if (disp.dist && Number.isFinite(dx) && Number.isFinite(hy)) {
        const way = front ? (dx >= 0 ? '画面の右へ' : '画面の左へ') : dx >= 0 ? '前へ' : '後ろへ';
        showTag(mtags.now, nowDisc.position, `重心の位置：${from}から ${way} ${lenJa(dx)}（${(Math.abs(dx) / 0.25).toFixed(1)}マス）\n重心の高さ ${Math.round(hy * 100)} cm${Number.isFinite(stand) ? `（立った姿勢より ${signedCm(hy - stand)}）` : ''}`);
      }
      if (guideInfo && disp.guideLine && disp.guideText) showTag(mtags.guide, guideInfo.pos, guideInfo.text);
      // the push on the floor, on the line through the centre of mass and within the feet
      const fvN = K ? K.Fv[i] : NaN;
      if (disp.grf && Number.isFinite(fvN) && fvN > 0.5) {
        const fv = fvN / 9.81, fu = (K.Fu[i] || 0) / 9.81, bw = Math.hypot(fu, fv);
        const u = p => p.x * fwd.x + p.z * fwd.z, feet = [LM.lHeel, LM.rHeel, LM.lFt, LM.rFt].map(j => u(P3[j]));
        const cu = u(com), pu = clamp(cu - com.y * fu / fv, Math.min(...feet), Math.max(...feet));
        const at = new THREE.Vector3(com.x, 0.01, com.z).addScaledVector(fwd, pu - cu);
        const dir = fwd.clone().multiplyScalar(fu).add(new THREE.Vector3(0, fv, 0)).normalize();
        setArrow(grfArrow, at, dir, 0.35 * bw);
        if (disp.force) showTag(mtags.grf, at.clone().addScaledVector(dir, 0.35 * bw), `床を押す力：体重の${bw.toFixed(1)}倍`);
      } else {
        grfArrow.g.visible = false;
      }
      // the direction (and speed) of the centre of mass
      let v = null;
      if (K && Number.isFinite(K.vUp[i])) {
        v = new THREE.Vector3(0, K.vUp[i], 0);
        if (front) {
          const a = T.m.com.x[i - 1], b = T.m.com.x[i + 1];
          if (Number.isFinite(a) && Number.isFinite(b)) v.x += (b - a) * state.fps / 2;
        } else {
          v.addScaledVector(fwd, K.vFwd[i] || 0);
        }
      }
      const speed = v ? v.length() : 0;
      if (disp.vel && speed > 0.15) {
        setArrow(velArrow, com, v, 0.3 * speed);
        if (disp.force) showTag(mtags.vel, com.clone().addScaledVector(v.clone().normalize(), 0.3 * speed), `動く方向：${speed.toFixed(1)} m/s`);
      } else {
        velArrow.g.visible = false;
      }
    }
    function updateMarkTags() {
      if (!markGroup.visible) return;
      const W = stage.clientWidth, H = stage.clientHeight;
      for (const t of Object.values(mtags)) {
        if (t.el.hidden) continue;
        const [x, y, z] = toScreen(t.pos, W, H);
        t.el.style.visibility = z > 1 ? 'hidden' : '';
        t.el.style.transform = `translate(${clamp(x + t.dx, 4, W - t.el.offsetWidth - 4).toFixed(1)}px, ${clamp(y + t.dy, 4, H - t.el.offsetHeight - 4).toFixed(1)}px)`;
      }
    }
    // estimated output of each muscle at frame i, as colours on the figure: how hard its joint works (up to the
    // level shown as full colour), the bigger muscles of the group more; red while pushing, blue while braking
    function outputAt(i) {
      const K = state.result.kin, KN = window.KinemaKinetics, map = {};
      for (const [g, grp] of Object.entries(KN.GROUPS)) {
        const m = K.M[g][i];
        if (!(m > 0)) continue;
        const level = Math.min(1, m / KN.REF[g]), p = K.P[g] ? K.P[g][i] : 1;
        const top = Math.max(...Object.values(grp.members));
        for (const [id, share] of Object.entries(grp.members)) map[id] = { level: level * Math.sqrt(share / top), mode: p < 0 ? 'brake' : 'push' };
      }
      return map;
    }

    // ---------- angle callouts ----------
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const callouts = ANGLES.map(a => {
      const line = document.createElementNS(SVG_NS, 'polyline');
      const dotEl = document.createElementNS(SVG_NS, 'circle');
      dotEl.setAttribute('r', '2.5');
      calloutSvg.append(line, dotEl);
      const el = document.createElement('div');
      el.className = `callout ${a.side}`;
      el.innerHTML = `${a.en}<b>—</b>`;
      calloutsEl.append(el);
      return { a, line, dotEl, el, val: el.querySelector('b') };
    });
    const projV = new THREE.Vector3();
    const toScreen = (v, W, H) => { projV.copy(v).project(camera); return [(projV.x + 1) / 2 * W, (1 - projV.y) / 2 * H, projV.z]; };

    function updateCallouts() {
      const f = state.frames[poseIdx];
      const show = ui.labels && !ui.atlas && f && f.ok;
      calloutsEl.hidden = !show;
      if (!show) return;
      const W = stage.clientWidth, H = stage.clientHeight;
      const leftDir = toScreen(P3[LM.lSh], W, H)[0] >= toScreen(P3[LM.rSh], W, H)[0] ? 1 : -1;
      const narrow = W < 480;
      for (const c of callouts) {
        const off = !angleOn(c.a) || (narrow && (c.a.g === 'sh' || c.a.g === 'hip'));
        c.el.hidden = off;
        c.line.style.display = c.dotEl.style.display = off ? 'none' : '';
      }
      const items = callouts.filter(c => !c.el.hidden).map(c => {
        const [sx, sy] = toScreen(P3[c.a.joint], W, H);
        return { c, sx, sy, ay: sy - 20, w: c.el.offsetWidth || 70, dir: c.a.side === 'l' ? leftDir : -leftDir };
      });
      const top = 18, bottom = H - stageRead.offsetHeight - 28, rowH = 36;
      for (const dir of [-1, 1]) {
        const col = items.filter(it => it.dir === dir).sort((a, b) => a.ay - b.ay);
        for (let k = 0; k < col.length; k++) col[k].ay = Math.max(col[k].ay, k ? col[k - 1].ay + rowH : top);
        const over = col.length ? col[col.length - 1].ay - bottom : 0;
        if (over > 0) for (const it of col) it.ay = Math.max(top, it.ay - over);
      }
      for (const { c, sx, sy, ay, w, dir } of items) {
        let ex = sx + dir * 56;
        ex = dir < 0 ? Math.max(ex, w + 6) : Math.min(ex, W - w - 6);
        const ax = ex - dir * 10;
        c.line.setAttribute('points', `${sx.toFixed(1)},${sy.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${ay.toFixed(1)}`);
        c.dotEl.setAttribute('cx', sx.toFixed(1));
        c.dotEl.setAttribute('cy', sy.toFixed(1));
        c.el.style.transform = `translate(${(dir < 0 ? ex - w : ex).toFixed(1)}px, ${(ay - 14).toFixed(1)}px)`;
        c.val.textContent = `${Math.round(f.m.ang[c.a.k])}°`;
      }
    }

    // ---------- muscles shown in 3D ----------
    // focusMap: main-muscle ids the advice points at ('weak' / 'tight').
    // selection: muscles the viewer picked, any number, in the order picked: main-muscle ids ('glute_max') or
    // full-body atlas indices (numbers). infoKey is the one whose details are shown.
    let focusMap = {};
    const selection = [];
    let infoKey = null;
    const tags = [];
    const atlasNote = $('#atlasNote');
    const sideJa = s => (s === 'L' ? '左' : '右');
    const nameOf = e => (typeof e === 'number' ? `${ANAT.muscles[e].ja}（${sideJa(ANAT.muscles[e].side)}）` : MUSCLE[e] ? MUSCLE[e].ja : e);
    function addTag(label, role, where) {
      const el = document.createElement('span');
      el.className = `mtag ${role}`;
      el.textContent = label;
      tagsEl.append(el);
      tags.push({ el, where, role });
    }
    let quietFocus = false; // the muscles of the movement as a whole: coloured, without a name on each
    function setFocus(map) {
      focusMap = map || {};
      applyMuscles();
    }
    function toggleSelect(e) {
      const i = selection.indexOf(e);
      if (i >= 0) {
        selection.splice(i, 1);
        if (infoKey === e) infoKey = selection.length ? selection[selection.length - 1] : null;
      } else {
        selection.push(e);
        infoKey = e;
      }
      applyMuscles();
    }
    function clearSelection() {
      selection.length = 0;
      infoKey = null;
      applyMuscles();
    }
    // the advice's muscles in their colours, the picked ones in blue, on the moving figure and on the anatomy view
    function applyMuscles() {
      const onFigure = { ...focusMap }, onAtlas = { ...focusMap }, picked = new Set();
      for (const e of selection) {
        if (typeof e === 'number') {
          picked.add(e);
          if (ANAT.muscles[e].link) onFigure[ANAT.muscles[e].link] = 'select';
        } else {
          onFigure[e] = 'select';
          onAtlas[e] = 'select';
        }
      }
      figure.setFocus(onFigure);
      atlas.setFocus(onAtlas, picked);
      tagsEl.textContent = '';
      tags.length = 0;
      for (const e of selection) {
        if (typeof e === 'number') {
          const m = ANAT.muscles[e];
          addTag(nameOf(e), 'select', () => (ui.atlas ? [atlas.centerOf(e)] : m.link ? figure.centers(m.link).filter(c => c.side === m.side).map(c => c.pos) : []));
        } else {
          addTag(nameOf(e), 'select', () => (ui.atlas ? atlas.centersFor(e) : figure.centers(e).map(c => c.pos)));
        }
      }
      for (const [id, role] of quietFocus ? [] : Object.entries(focusMap)) {
        if (!selection.includes(id)) addTag(nameOf(id), role, () => (ui.atlas ? atlas.centersFor(id) : figure.centers(id).map(c => c.pos)));
      }
      renderInfo();
      markLists();
      updateAtlasNote();
    }
    // muscles that one of the two views cannot show
    function updateAtlasNote() {
      const mains = [...Object.keys(focusMap), ...selection.filter(e => typeof e !== 'number')];
      const missing = [...new Set(mains.filter(id => ANAT.missing.includes(id)))];
      const unplaced = selection.filter(e => typeof e === 'number' && !ANAT.muscles[e].link);
      let text = '';
      if (ui.atlas && missing.length) text = `${missing.map(nameOf).join('・')}は全身データ（BodyParts3D）に含まれていません。「動く人型に戻る」で確認できます。`;
      else if (!ui.atlas && unplaced.length) text = `${unplaced.map(nameOf).join('・')}は動く人型にはない筋肉です。「全身の解剖図を見る」で確認できます。`;
      atlasNote.hidden = !text;
      atlasNote.textContent = text;
      syncHint();
    }
    // the sample's guide: until closed, and out of the way of the anatomy view's credit and note
    let hintClosed = false;
    function syncHint() {
      hint.hidden = hintClosed || state.source !== 'demo' || ui.atlas || !atlasNote.hidden;
    }
    function updateTags() {
      if (!tags.length) return;
      const f = state.frames[poseIdx];
      tagsEl.hidden = !disp.muscleNames || (!ui.atlas && !(f && f.ok));
      if (tagsEl.hidden) return;
      const W = stage.clientWidth, H = stage.clientHeight;
      const placed = [];
      for (const { el, where, role } of tags) {
        // The advice's muscle names can be read on a still figure: while it moves they would only fly around and cover
        // it, and while it shows the output colours they would read as part of them. The colours stay on the muscles.
        if (!ui.atlas && role !== 'select' && (ui.output || state.playing)) { el.hidden = true; continue; }
        // label the copy nearest the camera, usually the side facing it
        const pts = where().filter(Boolean);
        if (!pts.length) { el.hidden = true; continue; }
        const best = pts.reduce((a, b) => (camera.position.distanceTo(a) < camera.position.distanceTo(b) ? a : b));
        let [x, y, z] = toScreen(best, W, H);
        if (z > 1) { el.hidden = true; continue; }
        el.hidden = false;
        for (const p of placed) if (Math.abs(p[0] - x) < 90 && Math.abs(p[1] - y) < 20) y = p[1] + 22;
        placed.push([x, y]);
        el.style.transform = `translate(${clamp(x, 4, W - 120).toFixed(1)}px, ${clamp(y, 4, H - 24).toFixed(1)}px)`;
      }
    }

    // ---------- 2D overlay on the source video ----------
    function layoutPip() {
      const W = stage.clientWidth, H = stage.clientHeight, big = pip.classList.contains('big');
      if (!W || !H) return; // the 3D view is hidden: it keeps its size for when it comes back
      const s = Math.min(Math.min(big ? 480 : 220, W * (big ? 0.6 : 0.28)) / state.vw, (H * (big ? 0.72 : 0.42)) / state.vh);
      const w = Math.round(state.vw * s), h = Math.round(state.vh * s);
      pip.style.width = `${w}px`;
      pip.style.height = `${h}px`;
      const dpr = Math.min(devicePixelRatio, 2);
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
    }
    function drawOverlay(f) {
      const g = overlay.getContext('2d');
      const W = overlay.width, H = overlay.height, dpr = W / (pip.clientWidth || 1);
      if (!W || !H) return; // nothing to draw on, and the grid below would never end
      g.clearRect(0, 0, W, H);
      if (state.source === 'demo') { // also poses saved without their video
        g.fillStyle = '#1b2733';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.06)';
        for (let x = 0; x <= W; x += W / 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
        for (let y = 0; y <= H; y += H / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      }
      if (ui.trails) drawVideoTrails(g, W, H, dpr);
      if (!f || !f.ok || !f.img) return;
      const P = i => [f.img[i * 2] * W, f.img[i * 2 + 1] * H];
      g.lineCap = 'round';
      if (disp.skeleton) {
        for (const [a, b] of BONES_2D) {
          const [x0, y0] = P(a), [x1, y1] = P(b);
          g.strokeStyle = 'rgba(0,0,0,0.5)';
          g.lineWidth = 4.5 * dpr;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
          g.strokeStyle = '#ffffff';
          g.lineWidth = 2.2 * dpr;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        }
        for (const a of ANGLES) {
          const [x, y] = P(a.joint);
          g.fillStyle = tokens[a.side === 'l' ? '--left' : '--right'];
          g.beginPath(); g.arc(x, y, 3.6 * dpr, 0, Math.PI * 2); g.fill();
        }
      }
      // the numbers: knees and elbows on the small picture, every joint once it is enlarged
      const big = pip.classList.contains('big');
      g.font = `600 ${10 * dpr}px "Zen Kaku Gothic New", sans-serif`;
      for (const a of ANGLES) {
        if (!angleOn(a) || (!big && a.g !== 'kn' && a.g !== 'el')) continue;
        const [x, y] = P(a.joint);
        const label = `${Math.round(f.m.ang[a.k])}°`;
        const tx = x + (a.side === 'l' ? 6 : -6) * dpr;
        g.textAlign = a.side === 'l' ? 'left' : 'right';
        g.lineWidth = 3 * dpr;
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.strokeText(label, tx, y - 4 * dpr);
        g.fillStyle = '#ffffff';
        g.fillText(label, tx, y - 4 * dpr);
      }
    }
    // the chosen trajectories drawn on the video itself (cleaned-up pixel positions): faint for the whole stretch,
    // solid up to now, a dot where each point is now
    function drawVideoTrails(g, W, H, dpr) {
      const r = state.result, T = r && r.traj;
      if (!T || !r.trajView || T.n !== state.analyzed) return;
      const { i0, i1 } = trailSpan || traceSpan(), now = state.idx, sx = W / state.vw, sy = H / state.vh;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const p of trajUi.points) {
        for (const k of TP.seriesOf(p, r.side)) {
          const s = T.px[k];
          g.strokeStyle = g.fillStyle = tokens[`--tr-${p}`];
          for (const [a, b, alpha, width] of [[i0, i1, 0.35, 1.5], [i0, Math.min(now, i1), 1, 2.4]]) {
            g.globalAlpha = alpha;
            g.lineWidth = width * dpr;
            g.beginPath();
            let pen = false;
            for (let i = a; i <= b; i++) {
              const x = s.x[i] * sx, y = s.y[i] * sy;
              if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
              if (pen) g.lineTo(x, y);
              else { g.moveTo(x, y); pen = true; }
            }
            g.stroke();
          }
          g.globalAlpha = 1;
          if (now >= i0 && now <= i1 && Number.isFinite(s.x[now])) {
            g.beginPath();
            g.arc(s.x[now] * sx, s.y[now] * sy, 3.4 * dpr, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }

    // ---------- timeline chart ----------
    const chart = { dirty: true, base: document.createElement('canvas'), geom: null, lastBase: 0, lastIdx: -1, groups: { kn: true, hip: true, el: false, sh: false }, whole: false, seg: null };
    // what the body is doing, along the top of a chart over time; the chosen phase stands out, down the chart too.
    // X takes a frame number.
    function paintBands(g, r, X, left, right, top, bottom, chosen) {
      if (!r || !r.phases) return;
      const names = kinWords(KIN_BAND, r);
      const bands = r.phases.map(p => ({ a: p.i0, b: p.i1, ja: names[p.kind], kd: p.kind }));
      for (const f of r.flights || []) bands.push({ a: f.takeoff, b: f.land, ja: '空中', kd: 'air' });
      // (the chosen one last, and wide enough for its name even when it is over in a moment)
      bands.sort((p, q) => (p.kd === chosen) - (q.kd === chosen));
      g.font = '700 10.5px "Zen Kaku Gothic New", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const band of bands) {
        const xa = Math.max(left, X(band.a)), xb = Math.min(right, X(band.b));
        if (!band.ja || xb <= xa) continue;
        const on = band.kd === chosen, need = g.measureText(band.ja).width + 8;
        if (on) { g.fillStyle = tokens['--sunk']; g.fillRect(xa, top, xb - xa, bottom - top); }
        let from = xa + 0.5, wide = Math.max(1, xb - xa - 1);
        if (on && wide < need) { wide = need; from = clamp((xa + xb - need) / 2, left, right - need); }
        g.fillStyle = on ? tokens['--ink'] : tokens['--sunk'];
        g.fillRect(from, 5, wide, 15);
        // (too narrow for the whole name: its first two characters, 沈み for 沈み込み)
        const shown = wide >= need - 4 ? band.ja : band.ja.slice(0, 2);
        if (g.measureText(shown).width + 2 <= wide) {
          g.fillStyle = on ? tokens['--panel'] : tokens['--muted'];
          g.fillText(shown, from + wide / 2, 13);
        }
      }
    }
    // the frame of a key moment in the repetition in view
    function momentIdx(moment) {
      const r = state.result, segs = segments();
      const name = { bottom: '最下点', takeoff: '踏み切り', apex: '最高点', land: '着地' }[moment];
      if (!name || !r || !r.trajView || !r.trajView.events) return -1;
      const [a, b] = segs ? segs[segNow()] : [0, state.analyzed - 1];
      const ev = r.trajView.events.find(e => e.ja === name && e.i >= a && e.i <= b);
      return ev ? ev.i : -1;
    }
    // A name on a line at its highest point, instead of a legend to look up.
    function nameLine(g, ja, color, x, y, placed, top) {
      y = Math.max(y, top);
      while (placed.some(p => Math.abs(p[0] - x) < 42 && Math.abs(p[1] - y) < 12)) y += 12;
      placed.push([x, y]);
      g.lineWidth = 3;
      g.strokeStyle = tokens['--panel'];
      g.strokeText(ja, x, y);
      g.fillStyle = color;
      g.fillText(ja, x, y);
    }
    // Angles over time. One repetition at a time, large, with the side the camera sees and the jitter of the AI smoothed
    // away; the whole video is a button away. A finding picked in the analysis brings its joints, its target and its
    // moment forward here.
    const CHART_JOINT = { hip: ['股関節', '--tr-hip'], kn: ['膝', '--tr-kn'], sh: ['肩', '--tr-sh'], el: ['肘', '--tr-wr'] };
    function drawChartBase() {
      const W = chartEl.clientWidth, H = chartEl.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(devicePixelRatio, 2);
      const c = chart.base;
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      chart.dirty = false;
      chart.lastIdx = -1;
      chart.geom = null;
      if (!state.analyzed) return;
      const r = state.result && !state.result.error ? state.result : null, segs = segments(), whole = chart.whole || !segs;
      chart.seg = segs ? segNow() : -1;
      const [i0, i1] = whole ? [0, state.analyzed - 1] : spanOf(segs[chart.seg]);
      const t0 = whole ? 0 : state.frames[i0].t, t1 = Math.max(t0 + 0.001, whole ? state.duration : state.frames[i1].t);
      $('#chartRep').textContent = whole ? '動画全体' : `${chart.seg + 1}回目`;
      const wholeBtn = $('#chartWhole');
      wholeBtn.textContent = whole ? '今の回だけ' : '動画全体';
      wholeBtn.disabled = !segs;
      const padL = 32, padR = 10, padT = r && !whole ? 24 : 8, padB = 18;
      const x = t => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
      const xi = i => x(state.frames[Math.min(i, state.analyzed - 1)].t);
      const link = focusLink && focusLink.angle, emph = link ? link.joints : null;
      const sides = r && r.side === 'l' ? ['l'] : r && r.side === 'r' ? ['r'] : ['l', 'r'];
      const show = ['sh', 'el', 'hip', 'kn'].filter(j => chart.groups[j] || (emph && emph.includes(j)));
      const values = {};
      let hi = 90;
      for (const j of show) {
        const raw = [];
        for (let i = i0; i <= i1; i++) {
          const f = state.frames[i];
          raw.push(f.ok && f.m && f.m.ang ? sides.reduce((sum, side) => sum + f.m.ang[side + GROUP_KEY[j]], 0) / sides.length : NaN);
        }
        const reach = whole ? 0 : 1;
        values[j] = raw.map((_, n) => {
          let sum = 0, count = 0;
          for (let q = n - reach; q <= n + reach; q++) if (Number.isFinite(raw[q])) { sum += raw[q]; count++; }
          return count ? sum / count : NaN;
        });
        for (const v of values[j]) if (v > hi) hi = v;
      }
      const target = link && link.target ? link.target : {};
      for (const v of Object.values(target)) if (v > hi) hi = v;
      hi = Math.ceil((hi + 8) / 30) * 30;
      const plotB = H - padB;
      const y = v => padT + (1 - v / hi) * (plotB - padT);
      if (whole) {
        g.fillStyle = tokens['--sunk'];
        (r ? r.reps : []).forEach(rep => g.fillRect(x(rep.t0), padT, Math.max(2, x(rep.t1) - x(rep.t0)), plotB - padT));
      } else {
        const chosen = focusLink ? { bottom: 'ecc', takeoff: 'con', land: 'land', apex: 'air' }[focusLink.moment] : null;
        paintBands(g, r, xi, padL, W - padR, padT, plotB, chosen);
      }
      g.font = '10px "Zen Kaku Gothic New", sans-serif';
      g.lineWidth = 1;
      g.textBaseline = 'middle';
      g.textAlign = 'right';
      for (let v = 0; v <= hi; v += 30) {
        const yy = Math.round(y(v)) + 0.5;
        g.strokeStyle = v === 0 ? tokens['--ink'] : tokens['--line'];
        g.beginPath(); g.moveTo(padL, yy); g.lineTo(W - padR, yy); g.stroke();
        g.fillStyle = tokens['--muted'];
        g.fillText(`${v}°`, padL - 5, yy);
      }
      g.textBaseline = 'alphabetic';
      if (whole) {
        g.textAlign = 'center';
        const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find(st => (t1 - t0) / st <= 10) || 300;
        for (let t = 0; t <= t1 + 1e-6; t += step) g.fillText(`${Number(t.toFixed(1))}秒`, clamp(x(t), padL + 10, W - padR - 12), H - 5);
      } else {
        g.textAlign = 'left';
        g.fillText(`${t0.toFixed(1)}秒`, padL, H - 5);
        g.textAlign = 'right';
        g.fillText(`${t1.toFixed(1)}秒`, W - padR, H - 5);
        g.textAlign = 'center';
        if (W >= 480) g.fillText('0°＝まっすぐ　大きいほど深く曲がっている', (padL + W - padR) / 2, H - 5); // a phone has no room beside the time
      }
      // the target, dashed, for what is being looked at
      g.setLineDash([5, 4]);
      for (const [j, v] of Object.entries(target)) {
        const yy = Math.round(y(v)) + 0.5;
        g.strokeStyle = tokens[CHART_JOINT[j][1]];
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(padL, yy); g.lineTo(W - padR, yy); g.stroke();
      }
      g.setLineDash([]);
      g.font = '700 10.5px "Zen Kaku Gothic New", sans-serif';
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      for (const [j, v] of Object.entries(target)) {
        g.fillStyle = tokens[CHART_JOINT[j][1]];
        g.fillText(`目安 ${v}°`, W - padR - 2, y(v) - 2);
      }
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const j of show) {
        const on = emph && emph.includes(j);
        g.globalAlpha = emph && !on ? 0.3 : 1;
        g.lineWidth = on ? 3 : 2;
        g.strokeStyle = tokens[CHART_JOINT[j][1]];
        g.beginPath();
        let pen = false;
        values[j].forEach((v, n) => {
          if (!Number.isFinite(v)) { pen = false; return; }
          const xx = xi(i0 + n), yy = y(v);
          if (pen) g.lineTo(xx, yy);
          else { g.moveTo(xx, yy); pen = true; }
        });
        g.stroke();
      }
      g.globalAlpha = 1;
      // each line named at its highest point (not across a whole video, where the name would mean little)
      if (!whole) {
        g.font = '700 11px "Zen Kaku Gothic New", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        const placed = [];
        for (const j of show) {
          let best = -1, top = -Infinity;
          values[j].forEach((v, n) => { if (v > top) { top = v; best = n; } });
          if (best >= 0) nameLine(g, CHART_JOINT[j][0], tokens[CHART_JOINT[j][1]], clamp(xi(i0 + best), padL + 20, W - padR - 20), y(top) - 3, placed, padT + 12);
        }
      }
      // the moment being looked at, and the angle there
      const at = focusLink ? momentIdx(focusLink.moment) : -1;
      if (emph && at >= i0 && at <= i1) {
        for (const j of emph) {
          const v = values[j] && values[j][at - i0];
          if (!Number.isFinite(v)) continue;
          const xx = xi(at), yy = y(v);
          g.fillStyle = tokens['--panel'];
          g.strokeStyle = '#f5a524';
          g.lineWidth = 3;
          g.beginPath(); g.arc(xx, yy, 5, 0, Math.PI * 2); g.fill(); g.stroke();
          g.font = '700 12px "Zen Kaku Gothic New", sans-serif';
          g.textAlign = 'left';
          g.textBaseline = 'middle';
          g.lineWidth = 3;
          g.strokeStyle = tokens['--panel'];
          g.strokeText(`${Math.round(v)}°`, xx + 8, yy);
          g.fillStyle = tokens['--ink'];
          g.fillText(`${Math.round(v)}°`, xx + 8, yy);
        }
      }
      // what lies outside the analysed range is dimmed
      if (whole && !wholeRange()) {
        const [ra, rb] = rangeNow(), xa = x(state.frames[ra].t), xb = x(state.frames[rb].t + 1 / state.fps);
        g.fillStyle = tokens['--panel'];
        g.globalAlpha = 0.72;
        g.fillRect(padL, padT, Math.max(0, xa - padL), plotB - padT);
        g.fillRect(xb, padT, Math.max(0, W - padR - xb), plotB - padT);
        g.globalAlpha = 1;
      }
      chart.geom = { W, H, dpr, x, t0, t1, padL, padR, plotB };
    }
    function drawChart() {
      if (segments() && segNow() !== chart.seg && !chart.whole) chart.dirty = true;
      if (!chart.geom) return;
      const { W, H, dpr, x, t0, t1, padT = 4, plotB } = chart.geom;
      if (chartEl.width !== chart.base.width || chartEl.height !== chart.base.height) {
        chartEl.width = chart.base.width;
        chartEl.height = chart.base.height;
      }
      const g = chartEl.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, chartEl.width, chartEl.height);
      g.drawImage(chart.base, 0, 0);
      const f = state.frames[state.idx];
      if (!f) return;
      chart.lastIdx = state.idx;
      if (f.t < t0 || f.t > t1) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const xx = Math.round(x(f.t)) + 0.5;
      g.strokeStyle = tokens['--ink'];
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(xx, padT); g.lineTo(xx, plotB); g.stroke();
      const label = fmtTime(f.t);
      g.font = '600 10px "Zen Kaku Gothic New", sans-serif';
      const tw = g.measureText(label).width + 8, bx = clamp(xx - tw / 2, 0, W - tw);
      g.fillStyle = tokens['--ink'];
      g.fillRect(bx, H - 15, tw, 15);
      g.fillStyle = tokens['--panel'];
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(label, bx + 4, H - 7);
    }
    function drawSpark() {
      const W = sparkEl.clientWidth, H = sparkEl.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(devicePixelRatio, 2);
      if (sparkEl.width !== Math.round(W * dpr)) { sparkEl.width = Math.round(W * dpr); sparkEl.height = Math.round(H * dpr); }
      const g = sparkEl.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const n = Math.round(3 * state.fps);
      const end = state.idx, start = Math.max(0, end - n + 1);
      let max = 1;
      for (let i = start; i <= end; i++) {
        const m = state.frames[i]?.m;
        if (m && m.ok) max = Math.max(max, m.spd.lWr, m.spd.rWr, m.spd.body);
      }
      max *= 1.15;
      g.strokeStyle = tokens['--line'];
      g.lineWidth = 1;
      const y1 = Math.round(H - 2 - (1 / max) * (H - 6)) + 0.5;
      g.beginPath(); g.moveTo(0, y1); g.lineTo(W, y1); g.stroke();
      g.fillStyle = tokens['--muted'];
      g.font = '9.5px "Zen Kaku Gothic New", sans-serif';
      g.textAlign = 'right';
      g.fillText('1 m/s', W - 2, y1 - 3);
      for (const [k, color, dash] of [['body', '--ink', [3, 3]], ['lWr', '--left', []], ['rWr', '--right', []]]) {
        g.strokeStyle = tokens[color];
        g.setLineDash(dash);
        g.lineWidth = 1.5;
        g.beginPath();
        let pen = false;
        for (let i = start; i <= end; i++) {
          const m = state.frames[i]?.m;
          if (!m || !m.ok) { pen = false; continue; }
          const xx = ((i - (end - n + 1)) / (n - 1)) * W, yy = H - 2 - (m.spd[k] / max) * (H - 6);
          if (pen) g.lineTo(xx, yy);
          else { g.moveTo(xx, yy); pen = true; }
        }
        g.stroke();
      }
      g.setLineDash([]);
    }

    // ---------- event log ----------
    let logged = 0;
    let logNow = null;
    function renderLog() {
      const frag = document.createDocumentFragment();
      for (; logged < state.events.length; logged++) {
        const ev = state.events[logged];
        const li = document.createElement('li');
        li.dataset.t = ev.t;
        const ph = PHASES[ev.phase];
        li.innerHTML = `<button type="button"><time>${fmtTime(ev.t)}</time><b style="color: var(${ph.color})">●</b><span>${ph.ja}</span></button>`;
        li.firstChild.addEventListener('click', () => seekTime(ev.t));
        frag.append(li);
      }
      logEl.append(frag);
    }
    function highlightLog(t) {
      let pick = null;
      for (const li of logEl.children) {
        if (Number(li.dataset.t) <= t + 1e-6) pick = li;
        else break;
      }
      if (pick === logNow) return;
      logNow?.classList.remove('now');
      pick?.classList.add('now');
      logNow = pick;
      if (pick && state.playing) {
        const top = pick.offsetTop - logEl.offsetTop;
        if (top < logEl.scrollTop || top > logEl.scrollTop + logEl.clientHeight - pick.offsetHeight) logEl.scrollTop = top - 40;
      }
    }

    // ---------- frame display ----------
    function showFrame(i, jump) {
      const f = state.frames[i];
      if (!f) return;
      poseIdx = nearestPose(i);
      figure.group.visible = poseIdx >= 0 && !ui.atlas;
      const onStage = seen.stage || mirrorOn;
      if (poseIdx >= 0 && onStage) {
        placePose(state.frames[poseIdx], poseIdx, P3, jump);
        figure.update(P3);
      }
      const output = ui.output && !ui.atlas && !!state.result && !!state.result.kin && state.result.kin.n === state.analyzed;
      figure.setOutput(output && poseIdx >= 0 ? outputAt(poseIdx) : null);
      $('#outNote').hidden = !(output && disp.notes);
      if (onStage) {
        updateTrails();
        updateMarks();
        drawOverlay(f);
      }
      updateHud(i);
      if (seen.more) {
        drawSpark();
        highlightLog(f.t);
      }
      followGeneral();
      metaTime.textContent = fmtTime(f.t);
      metaFrame.textContent = `${i + 1} / ${state.total}`;
      seekBar.max = String(Math.max(0, state.analyzed - 1));
      seekBar.value = String(i);
      playTimeEl.textContent = `${fmtTime(f.t)} / ${fmtTime(state.duration)}`;
      updateRepUi();
    }
    // "◀︎ 3回目 / 13回 ▶︎" in the player
    function updateRepUi() {
      const segs = segments();
      repBox.hidden = !segs || segs.length < 2;
      if (repBox.hidden) return;
      const now = segNow();
      const rep = state.result && state.result.reps ? state.result.reps[now] : null;
      repLabel.textContent = `${now + 1}回目 / ${segs.length}回${rep && Number.isFinite(rep.meters) ? `・${rep.meters.toFixed(2)} m` : ''}`;
      repPrevBtn.disabled = now <= 0;
      repNextBtn.disabled = now >= segs.length - 1;
      repAllBtn.disabled = repFocus < 0;
    }
    let repToldOnce = false;
    function setRep(j) {
      const segs = segments();
      if (!segs) return;
      repFocus = j;
      updateRangeUi();
      if (j >= 0) seekIndex(spanOf(segs[j])[0]);
      updateRepUi();
      if (j >= 0 && !repToldOnce) {
        repToldOnce = true;
        toast(`${j + 1}回目だけを繰り返し再生します。動画全体に戻すときは「全部の回」を押してください。`);
      }
    }
    // Inside a repetition the analysis knows what this moment is; elsewhere only the pose can be named.
    function stageAt(i) {
      const r = state.result;
      if (!r || !r.phases) return null;
      if ((r.flights || []).some(f => i >= f.takeoff && i < f.land)) return '空中';
      const ph = r.phases.find(p => i >= p.i0 && i < p.i1);
      if (!ph) return null;
      return r.move === 'squat' ? { ecc: 'しゃがむ', con: '立ち上がる' }[ph.kind] : { ecc: '沈み込み', con: '踏み切り', land: '着地' }[ph.kind];
    }
    function repsAt(t, m) {
      if (state.analyzing) return '—'; // the movement and its repetitions are decided when the analysis ends
      if (state.result && state.result.general) return (state.result.quality && state.result.quality.bouts || []).filter(b => b.kind !== 'walk' && b.t1 <= t + 1e-6).length;
      if (state.result && state.result.reps) return state.result.reps.filter(r => r.t1 <= t + 1e-6).length;
      return state.move === 'squat' ? m.reps : 0;
    }
    function updateHud(i) {
      const f = state.frames[i], m = f.m;
      if (seen.more) {
      for (const a of ANGLES) {
        const row = hud.angle[a.k];
        row.row.classList.toggle('low', m.ok && m.vis[a.limb] < 0.5);
        if (m.ok) {
          const v = m.ang[a.k];
          row.val.textContent = `${Math.round(v)}°`;
          row.fill.style.width = `${clamp(v / 180, 0, 1) * 100}%`;
        } else {
          row.val.textContent = '—';
          row.fill.style.width = '0%';
        }
        const [lo, hi] = state.rom[a.k];
        row.rom.hidden = !(hi >= lo);
        if (hi >= lo) {
          row.rom.style.left = `${clamp(lo / 180, 0, 1) * 100}%`;
          row.rom.style.width = `${clamp((hi - lo) / 180, 0, 1) * 100}%`;
        }
      }
      for (const s of hud.sym) {
        if (!m.ok) { s.val.textContent = '—'; setChip(s.chip, '', '—'); continue; }
        if (Math.min(m.vis[s.parts[0]], m.vis[s.parts[1]]) < 0.5) { s.val.textContent = '—'; setChip(s.chip, '', '判定不可'); continue; }
        const d = Math.abs(m.ang[s.l] - m.ang[s.r]);
        s.val.textContent = `${Math.round(d)}°`;
        if (d < 10) setChip(s.chip, 'ok', 'そろっている');
        else if (state.general) setChip(s.chip, '', '差あり'); // one hand swinging: a difference is not a fault
        else if (d < 20) setChip(s.chip, 'warn', 'やや差あり');
        else setChip(s.chip, 'bad', '差が大きい');
      }
      for (const p of PARTS) {
        const row = hud.part[p.k];
        if (!m.ok) { row.val.textContent = '—'; setChip(row.chip, 'bad', '未検出'); continue; }
        const v = m.vis[p.k];
        row.val.textContent = `${Math.round(v * 100)}%`;
        if (v >= 0.8) setChip(row.chip, 'ok', '良好');
        else if (v >= 0.5) setChip(row.chip, 'warn', 'やや不安定');
        else setChip(row.chip, 'bad', '見えにくい');
      }
      $('#spdR').textContent = m.ok ? m.spd.rWr.toFixed(2) : '—';
      $('#spdL').textContent = m.ok ? m.spd.lWr.toFixed(2) : '—';
      $('#spdB').textContent = m.ok ? m.spd.body.toFixed(2) : '—';
      }
      const ph = PHASES[m.phase], stage = stageAt(i);
      phaseEn.querySelector('span').textContent = stage || ph.ja;
      phaseEn.style.color = `var(${stage ? '--accent' : ph.color})`;
      phaseJa.textContent = state.general ? '全般の分析' : state.analyzing && !moveChosen ? '動きの種類は解析の最後に判定します' : window.KinemaAnalysis.MOVES[state.move].ja;
      repsEl.textContent = repsAt(f.t, m);
    }
    function setIndex(i, jump = false) {
      if (i === state.idx && !jump) return;
      const j = jump || i < state.idx || i - state.idx > 3;
      state.idx = i;
      showFrame(i, j);
    }

    // ---------- playback ----------
    // the frames playback goes round within: the repetition picked, or else the range being analysed
    function playSpan() {
      const segs = segments();
      return segs && repFocus >= 0 && repFocus < segs.length ? spanOf(segs[repFocus]) : rangeNow();
    }
    // the same in seconds, the end just past its last frame
    function rangeTimes() {
      const [a, b] = playSpan();
      return [state.frames[a].t, state.frames[b].t + 1 / state.fps];
    }
    function setPlaying(on) {
      if (state.analyzing || state.analyzed === 0) on = false;
      state.playing = on;
      playBtn.textContent = on ? '一時停止' : '再生';
      playBtn.setAttribute('aria-label', on ? '一時停止' : '再生');
      if (state.source === 'video') {
        if (on) {
          const [t0, t1] = rangeTimes();
          if (video.currentTime < t0 - 0.05 || video.currentTime >= Math.min(t1, state.duration) - 0.03) video.currentTime = t0;
          video.playbackRate = state.rate;
          video.play().catch(err => { if (err.name !== 'AbortError') setPlaying(false); });
        } else {
          video.pause();
        }
      }
      // in slow motion the figure sits between two frames: settle on the frame on screen
      if (!on && state.rate < 1 && state.idx >= 0) guard(showFrame, state.idx, false);
    }
    function stepPlayback(dt) {
      if (state.analyzing || !state.analyzed) return;
      const [t0, t1] = rangeTimes();
      let pos;
      if (state.source === 'demo') {
        const c = state.clock + dt * state.rate;
        state.clock = c >= t1 || c < t0 ? t0 : c;
        pos = state.clock * state.fps;
        setIndex(clamp(Math.floor(pos), 0, state.analyzed - 1));
      } else {
        if (video.currentTime >= t1 || video.currentTime < t0 - 0.05) video.currentTime = t0;
        pos = video.currentTime * state.fps;
        setIndex(clamp(Math.round(pos), 0, state.analyzed - 1));
      }
      if (state.rate < 1) smoothPose(pos);
    }
    // Slow motion: 30 frames a second at 1/8 speed would make the figure jump about four times a second, so it glides
    // from frame to frame instead. pos is a position in frames with a fraction.
    const poseA = Array.from({ length: 33 }, () => new THREE.Vector3()), poseB = Array.from({ length: 33 }, () => new THREE.Vector3());
    function smoothPose(pos) {
      if (!plan || ui.atlas) return;
      const a = Math.floor(pos), b = a + 1, u = pos - a;
      if (b >= state.analyzed || !state.frames[a] || !state.frames[a].ok || !state.frames[b].ok) return;
      placePose(state.frames[a], a, poseA);
      placePose(state.frames[b], b, poseB);
      for (let k = 0; k < 33; k++) P3[k].lerpVectors(poseA[k], poseB[k], u);
      figure.update(P3);
      updateMarks();
      const n = pos - (trailSpan ? trailSpan.i0 : 0), m = Math.floor(n);
      for (const t of trails3d) {
        const p = t.pts[m], q = t.pts[m + 1];
        if (p && q) t.dot.position.lerpVectors(p, q, n - m);
      }
    }
    // slow motion remembers the last slow speed chosen
    let slowRate = 0.25;
    function setRate(r) {
      state.rate = r;
      if (r < 1) slowRate = r;
      rateSel.value = String(r);
      slowBtn.setAttribute('aria-pressed', String(r < 1));
      if (state.source === 'video') video.playbackRate = r;
    }
    rateSel.addEventListener('change', () => setRate(Number(rateSel.value)));
    slowBtn.addEventListener('click', () => {
      const on = state.rate >= 1;
      setRate(on ? slowRate : 1);
      if (on && !state.playing) setPlaying(true);
    });
    // the analysed stretch of the video goes round and round, like the sample
    video.addEventListener('ended', () => {
      if (!state.playing || state.source !== 'video') return;
      video.currentTime = rangeTimes()[0];
      video.play().catch(err => { if (err.name !== 'AbortError') setPlaying(false); });
    });
    function seekTime(t) {
      if (state.analyzing || state.analyzed === 0) return;
      seekIndex(clamp(Math.round(t * state.fps), 0, state.analyzed - 1));
    }
    function seekIndex(i) {
      if (state.analyzing || state.analyzed === 0) return;
      i = clamp(i, 0, state.analyzed - 1);
      // going elsewhere ends the repeating of one repetition: 再生 must carry on from where the viewer went
      const segs = repFocus >= 0 ? segments() : null;
      if (segs) {
        const [a, b] = spanOf(segs[Math.min(repFocus, segs.length - 1)]);
        if (i < a || i > b) { repFocus = -1; updateRangeUi(); }
      }
      const t = state.frames[i].t;
      if (state.source === 'video') video.currentTime = t;
      else state.clock = t;
      setIndex(i, true);
    }
    function updateControls() {
      const idle = !state.analyzing && state.analyzed > 0;
      for (const el of [playBtn, backBtn, fwdBtn, rateSel, slowBtn, csvBtn, seekBar, rangeFromBtn, rangeToBtn]) el.disabled = !idle;
      updateRangeUi();
      renderSessions();
      syncLabButtons();
    }
    function updateRangeUi() {
      const n = Math.max(1, state.analyzed - 1), [a, b] = rangeNow(), [pa, pb] = playSpan(), whole = wholeRange();
      // the thumb's centre travels between half a thumb from each end: the band lines up with it (the thumb is 16 px)
      const onTrack = k => (k <= 0 ? '0%' : k >= n ? '100%' : `calc(8px + (100% - 16px) * ${k / n})`);
      seekBar.style.setProperty('--a', onTrack(pa));
      seekBar.style.setProperty('--b', onTrack(pb));
      rangeLabel.textContent = whole ? '全体' : `${state.frames[a].t.toFixed(1)}〜${state.frames[b].t.toFixed(1)}秒`;
      rangeAllBtn.disabled = whole || state.analyzing;
    }
    function setStatus(kind, text) {
      pill.className = `pill ${kind}`;
      pill.textContent = text;
    }
    // the box over the 3D view: progress (with a button to stop) or a problem (with a button to close it)
    function showProgress(text, frac, isError = false, canStop = false) {
      progressEl.hidden = false;
      progressEl.classList.toggle('error', isError);
      progressText.textContent = text;
      progressFill.style.width = `${clamp(frac, 0, 1) * 100}%`;
      progressBtn.hidden = !(isError || canStop);
      progressBtn.textContent = isError ? '閉じる' : '中止する';
    }
    progressBtn.addEventListener('click', () => {
      if (state.analyzing) {
        state.aborted = true;
        progressBtn.hidden = true;
        progressText.textContent = '中止しています…';
      } else {
        progressEl.hidden = true;
        if (state.source === 'demo') setStatus('', 'サンプル');
      }
    });
    // a short message above the player, for things that happen out of view
    const toastEl = $('#toast');
    let toastTimer = 0;
    function toast(text) {
      toastEl.textContent = text;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4500);
    }

    // ---------- pose estimation ----------
    let landmarkerPromise = null;
    function getLandmarker() {
      if (!landmarkerPromise) {
        landmarkerPromise = (async () => {
          const { FilesetResolver, PoseLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
          const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
          const options = delegate => ({
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: 'VIDEO', numPoses: 1,
            minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
          });
          try { return await PoseLandmarker.createFromOptions(fileset, options('GPU')); }
          catch (err) { console.warn('GPU delegate unavailable, falling back to CPU', err); return await PoseLandmarker.createFromOptions(fileset, options('CPU')); }
        })();
        landmarkerPromise.catch(() => { landmarkerPromise = null; });
      }
      return landmarkerPromise;
    }
    let mpClock = 0; // VIDEO mode needs strictly increasing timestamps across runs
    function detect(landmarker, ts) {
      mpClock = Math.max(mpClock + 1, ts);
      let out = null;
      landmarker.detectForVideo(video, mpClock, res => {
        const lm = res.landmarks && res.landmarks[0], wl = res.worldLandmarks && res.worldLandmarks[0];
        if (!lm || !wl) return;
        const img = new Float32Array(66), w = new Float32Array(99), vis = new Float32Array(33);
        for (let i = 0; i < 33; i++) {
          img[i * 2] = lm[i].x; img[i * 2 + 1] = lm[i].y;
          w[i * 3] = wl[i].x; w[i * 3 + 1] = wl[i].y; w[i * 3 + 2] = wl[i].z;
          vis[i] = lm[i].visibility ?? 1;
        }
        out = { img, w, vis };
      });
      return out;
    }

    // ---------- videos ----------
    // Every video analysed since the page was opened stays in memory with its poses, so going back to one, or choosing
    // the same file again, takes no time. Nothing is stored or sent anywhere, and it is gone when the page closes.
    const MAX_SESSIONS = 6;
    const sessions = [];
    let currentSession = null, currentUrl = null, currentKey = null, currentFile = null, currentSaved = null;
    let moveChosen = false; // the viewer picked a movement while the video was being analysed
    const sessionEl = $('#session'), sessionNameEl = $('#sessionName'), sessionInfoEl = $('#sessionInfo'), rerunBtn = $('#rerunBtn');
    const sessionListWrap = $('#sessionListWrap'), sessionListEl = $('#sessionList');
    function dropUnusedUrl() {
      if (currentUrl && !sessions.some(s => s.url === currentUrl)) URL.revokeObjectURL(currentUrl);
      currentUrl = null;
      currentKey = null;
      currentFile = null;
      currentSaved = null;
    }
    function rememberSession() {
      let s = sessions.find(x => x.key === currentKey);
      if (!s) {
        s = { key: currentKey };
        sessions.unshift(s);
        while (sessions.length > MAX_SESSIONS) {
          const old = sessions.pop();
          if (old.url !== currentUrl) URL.revokeObjectURL(old.url);
        }
      }
      Object.assign(s, {
        url: currentUrl, file: currentFile, savedId: currentSaved, general: !!state.general, name: state.name, fps: state.fps, duration: state.duration, total: state.total, analyzed: state.analyzed, vw: state.vw, vh: state.vh,
        frames: state.frames, events: state.events, rom: state.rom, range: state.range, move: state.move, summary: '',
      });
      currentSession = s;
    }
    function renderSessions() {
      const onVideo = state.source === 'video' || state.saved;
      sessionEl.hidden = !onVideo;
      $('#dropTitle').textContent = onVideo ? '別の動画を選ぶ' : '動画を選ぶ';
      if (onVideo) {
        sessionNameEl.textContent = state.name;
        const part = state.analyzed < state.total ? `（${(state.analyzed / state.fps).toFixed(1)}秒まで解析）` : '';
        sessionInfoEl.textContent = state.analyzing ? '解析中です…' : `${state.duration.toFixed(1)}秒${part}・人物を検出できたコマ ${Math.round(detectionRate() * 100)}%`;
        rerunBtn.disabled = state.analyzing || !currentUrl;
      }
      const list = sessions.length > 1 || (sessions.length === 1 && sessions[0] !== currentSession);
      sessionListWrap.hidden = !list;
      sessionListEl.innerHTML = list ? sessions.map((s, i) => `<li><button type="button" data-i="${i}"${s === currentSession ? ' class="now" aria-current="true"' : ''}><b>${esc(s.name)}</b><span>${esc(s.summary)}</span></button></li>`).join('') : '';
      sessionListEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const s = sessions[Number(b.dataset.i)];
        if (s !== currentSession) reopenSession(s);
      }));
    }
    // Going back to a video analysed earlier: the AI's work is kept, so only the analysis runs again.
    async function reopenSession(s) {
      const run = ++state.runId;
      setPlaying(false);
      state.analyzing = true;
      currentSession = null;
      updateControls();
      progressEl.hidden = true;
      if (currentUrl !== s.url) dropUnusedUrl();
      currentUrl = s.url;
      currentKey = s.key;
      currentFile = s.file || null;
      currentSaved = s.savedId || null;
      video.src = s.url;
      try {
        await loadVideo(video);
      } catch {
        if (run === state.runId) giveUp('この動画を開き直せませんでした。もう一度「動画を選ぶ」から選んでください。');
        return;
      }
      if (run !== state.runId) return;
      Object.assign(state, {
        source: 'video', saved: false, general: !!s.general, name: s.name, fps: s.fps, duration: s.duration, total: s.total, analyzed: s.analyzed, vw: s.vw, vh: s.vh,
        frames: s.frames, events: s.events, rom: s.rom, range: s.range, move: s.move, idx: -1, clock: 0, result: null, analyzing: false, autoMove: false,
      });
      currentSession = s;
      poseIdx = -1;
      repFocus = -1;
      logEl.textContent = '';
      logged = 0;
      footLevel = null;
      plan = null;
      clearTrails();
      guard(updateLevel);
      trajUi.points = new Set(TRAJ_DEFAULT[s.move]);
      if (s.general) showGeneralViews();
      syncMoveButtons();
      metaSource.textContent = s.name;
      pipTag.textContent = '元の動画';
      video.hidden = false;
      hint.hidden = true;
      layoutPip();
      renderLog();
      setStatus('ok', '解析完了');
      updateControls();
      showResults(true);
    }
    // what follows every analysis: the results, then the movement plays from its start, round and round
    function showResults(found, partial = false) {
      runAnalysis();
      guard(seekIndex, rangeNow()[0]);
      if (!found) return;
      setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
      const r = state.result;
      if (r && r.general) toast(`種目を問わない「全般の分析」で、動きの質を測りました${state.autoMove ? '（スクワット・ジャンプ・立ち幅跳びには当てはまらないと判定）' : ''}。`);
      else if (r && r.error) toast('動きを見つけられませんでした。「動作の分析」の欄に、次に試せることを表示しています。');
      else if (r) toast(`${partial ? '途中までの動画で' : ''}${state.autoMove ? `動画の動きから「${window.KinemaAnalysis.MOVES[r.move].ja}」と判定して分析しました（${r.reps.length}回）。` : `分析しました：${window.KinemaAnalysis.MOVES[r.move].ja}（${r.reps.length}回）。`}結果は「動作の分析」「軌跡」「筋肉の出力」で見られます。`);
    }
    // What the video shows decides the movement, unless the viewer picked one while it was being analysed: "スクワット"
    // is only what the page starts with, and analysing a jump as a squat gives nonsense. The buttons can still change it.
    function chooseMoveFromVideo() {
      state.autoMove = false;
      if (moveChosen) return;
      const F = state.frames.slice(0, state.analyzed);
      const found = guard(() => window.KinemaAnalysis.detect(F, state.vw, state.vh));
      // not one of the movements KINEMA can judge: say what was measured, and judge nothing
      const fits = !!found && guard(() => !window.KinemaAnalysis.analyze(found.move, F, state.vw, state.vh, {}).error);
      const Q = guard(() => window.KinemaQuality.analyze(F, state.vw, state.vh, state.fps));
      if (Q && !Q.error && window.KinemaQuality.notOneOfThree(Q, found, fits)) {
        state.general = true;
        state.autoMove = true;
        showGeneralViews();
        syncMoveButtons();
        return;
      }
      if (!found) return;
      state.autoMove = true; // said on the page even when it stays the same: what was analysed must never be left unsaid
      if (found.move === state.move) return;
      state.move = found.move;
      trajUi.points = new Set(TRAJ_DEFAULT[found.move]);
      syncMoveButtons();
    }
    // back to the sample with a message, when a video could not be analysed at all
    function giveUp(message) {
      state.analyzing = false;
      restoreDemo();
      setStatus('bad', 'エラー');
      showProgress(message, 0, true);
    }

    async function openVideo(src, name, limitSeconds = Infinity) {
      const run = ++state.runId;
      // whatever goes wrong, the page must not stay stuck in "analysing"
      try {
        await readVideo(run, src, name, limitSeconds);
      } catch (err) {
        reportProblem(err);
        if (run === state.runId) giveUp('動画の解析の途中で問題が起きました。もう一度試すか、別の動画を選んでください。');
      } finally {
        if (!state.analyzing) keepAwake(false); // otherwise a newer analysis is running and needs it
      }
    }
    async function readVideo(run, src, name, limitSeconds) {
      const stale = () => run !== state.runId;
      setPlaying(false);
      currentSession = null;
      state.analyzing = true;
      state.aborted = false;
      moveChosen = false;
      toastEl.hidden = true;
      updateControls();
      hint.hidden = true;
      setStatus('busy', '読み込み中');
      showProgress('動画を読み込み中…', 0);
      video.src = src;
      try {
        await loadVideo(video);
      } catch {
        if (!stale()) giveUp('この動画は開けませんでした。iPhoneの場合は「設定 → カメラ → フォーマット → 互換性優先」で撮り直すと、MP4形式で保存されて開けるようになります。');
        return;
      }
      if (stale()) return;
      // some recordings (WebM) tell their real length only after a seek to the end: at first it reads as unknown or
      // as a tiny value
      if (!Number.isFinite(video.duration) || video.duration < 0.5) {
        await seekVideo(video, 1e7);
        await seekVideo(video, 0);
        if (stale()) return;
      }
      if (!Number.isFinite(video.duration) || !(video.duration > 0)) {
        giveUp('この動画は長さを読み取れませんでした。MP4かMOVの動画を選んでください。');
        return;
      }
      if (video.duration < 0.5) {
        giveUp(`この動画は短すぎて解析できません（${video.duration.toFixed(1)}秒）。動きの前後も含めて、数秒以上撮ってください。`);
        return;
      }
      const dur = Math.min(video.duration, limitSeconds);
      const fps = dur <= 60 ? 30 : dur <= 180 ? 15 : 10;
      resetData('video', name, fps, dur);
      Object.assign(state, { vw: video.videoWidth, vh: video.videoHeight, total: Math.max(1, Math.floor(dur * fps)), analyzing: true });
      footLevel = null;
      plan = null;
      clearTrails();
      levelQ.identity();
      metaSource.textContent = name;
      pipTag.textContent = '元の動画';
      video.hidden = false;
      layoutPip();
      drawOverlay(null);
      // nothing of the previous movement may stay on screen: its cards would point at the wrong moments
      clearAdvice('解析が終わると、ここに改善のアドバイスが表示されます。');
      renderTraj();
      renderKin();
      updateControls();
      showProgress('AIモデルを準備中…（初回は数秒〜十数秒）', 0, false, true);
      let landmarker;
      try {
        landmarker = await getLandmarker();
      } catch (err) {
        console.error(err);
        if (!stale()) giveUp('AIモデルを読み込めませんでした。インターネット接続を確かめて、もう一度動画を選んでください。');
        return;
      }
      if (stale()) return;
      keepAwake(true);
      const base = mpClock + 1000, began = performance.now();
      for (let i = 0; i < state.total && !state.aborted; i++) {
        const t = Math.min(i / fps, dur - 0.001);
        await seekVideo(video, t);
        if (stale()) return;
        if (state.aborted) break;
        let r = null;
        try { r = detect(landmarker, base + Math.round(t * 1000)); } catch (err) { reportProblem(err); }
        state.frames.push(r ? { t, ok: true, ...r } : { t, ok: false, w: null, img: null, vis: null });
        state.frames[i].m = computeMetrics(i);
        state.analyzed = i + 1;
        guard(() => {
          if (i % 30 === 29) updateLevel();
          setIndex(i);
          renderLog();
        });
        chart.dirty = true;
        const done = i + 1, pct = Math.round(done / state.total * 100);
        const left = (((performance.now() - began) / done) * (state.total - done)) / 1000;
        const eta = done >= 15 && left >= 1 ? `・残り約${left < 60 ? `${Math.ceil(left)}秒` : `${Math.ceil(left / 60)}分`}` : '';
        if (!state.aborted) showProgress(`動きを解析中 ${pct}%（${done} / ${state.total} コマ${eta}）`, done / state.total, false, true);
        setStatus('busy', `解析中 ${pct}%`);
      }
      state.analyzing = false;
      progressEl.hidden = true;
      // stopped too early to analyse anything: back to the earlier result of this video if it has one, else the sample
      if (state.aborted && state.analyzed < 15) {
        const earlier = sessions.find(s => s.key === currentKey);
        if (earlier) await reopenSession(earlier);
        else backToSample();
        toast('解析を中止しました。');
        return;
      }
      guard(updateLevel);
      const found = state.frames.some(f => f.ok);
      setStatus(found ? 'ok' : 'bad', !found ? '人物なし' : state.aborted ? '途中まで解析' : '解析完了');
      if (found) chooseMoveFromVideo();
      if (found) rememberSession();
      updateControls();
      showResults(found, state.aborted);
      if (!found) showProgress('人物を検出できませんでした。全身が明るく映っている動画で試してください。', 0, true);
    }

    // the synthetic sample for the selected movement
    function loadDemo() {
      const D = window.KinemaDemo.samples[state.move] || window.KinemaDemo.samples.squat;
      resetData('demo', `サンプル（${window.KinemaAnalysis.MOVES[state.move].ja}・合成データ）`, D.fps, D.duration);
      Object.assign(state, { vw: D.width, vh: D.height, total: D.duration * D.fps });
      footLevel = null;
      for (let i = 0; i < state.total; i++) {
        const t = i / state.fps;
        state.frames.push({ t, ok: true, ...D.frame(t) });
        state.frames[i].m = computeMetrics(i);
      }
      state.analyzed = state.total;
      updateLevel();
    }
    function showDemo() {
      setPlaying(false);
      loadDemo();
      metaSource.textContent = state.name;
      pipTag.textContent = 'サンプル';
      layoutPip();
      renderLog();
      updateControls();
      runAnalysis();
      setIndex(0, true);
      syncHint();
      setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    function restoreDemo() {
      currentSession = null;
      dropUnusedUrl();
      video.removeAttribute('src');
      video.load();
      video.hidden = true;
      showDemo();
    }
    // the viewer's way back to the sample; also stops an analysis under way
    function backToSample() {
      state.runId++;
      state.analyzing = false;
      progressEl.hidden = true;
      restoreDemo();
      setStatus('', 'サンプル');
    }
    async function openFile(file) {
      const okType = file && (file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name));
      if (!okType) { showProgress('動画ファイル（MOV・MP4など）を選んでください。', 0, true); return; }
      // the same file again: the AI's work is already done (the button "もう一度AIで解析" repeats it)
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      const known = sessions.find(s => s.key === key);
      if (known) {
        await reopenSession(known);
        toast('この動画は解析済みなので、すぐに開きました。AI解析からやり直すときは「もう一度AIで解析」を押してください。');
        return;
      }
      dropUnusedUrl();
      currentUrl = URL.createObjectURL(file);
      currentKey = key;
      currentFile = file;
      openVideo(currentUrl, file.name);
    }

    // ---------- movement choice ----------
    const moveBtns = [...document.querySelectorAll('#moves button[data-move]')], generalBtn = $('#generalBtn');
    function syncMoveButtons() {
      for (const b of moveBtns) b.setAttribute('aria-pressed', String(!state.general && b.dataset.move === state.move));
      generalBtn.setAttribute('aria-pressed', String(!!state.general));
      const info = window.KinemaAnalysis.MOVES[state.move];
      metaMove.textContent = state.general ? '全般の分析' : info.ja;
      $('#tips').innerHTML = [...info.tips, 'スロー撮影ではなく普通の動画で撮る（時間の長さから高さや距離を計算するため）'].map(t => `<li>${esc(t)}</li>`).join('');
      repsLabel.textContent = state.general ? '動きの回数' : state.move === 'squat' ? '回数' : '跳んだ回数';
    }
    for (const b of moveBtns) {
      b.addEventListener('click', () => {
        const changed = state.move !== b.dataset.move || !!state.general;
        if (changed) trajUi.points = new Set(TRAJ_DEFAULT[b.dataset.move]);
        state.move = b.dataset.move;
        state.general = false;
        state.autoMove = false;
        syncMoveButtons();
        if (state.analyzing) { // the running analysis picks up the new choice when it finishes
          moveChosen = true;
          return;
        }
        if (state.source === 'demo' && !state.saved) showDemo();
        else if (state.analyzed) {
          runAnalysis();
          showFrame(state.idx, true);
          if (changed) toast(state.result && state.result.error ? `${window.KinemaAnalysis.MOVES[state.move].ja}の動きは見つかりませんでした。` : `${window.KinemaAnalysis.MOVES[state.move].ja}として分析し直しました。`);
        }
      });
    }

    generalBtn.addEventListener('click', () => {
      state.general = true;
      state.autoMove = false;
      showGeneralViews();
      syncMoveButtons();
      if (state.analyzing) { moveChosen = true; return; }
      if (state.analyzed) {
        runAnalysis();
        showFrame(state.idx, true);
        toast('種目を問わない「全般の分析」に切り替えました。');
      }
    });

    // ---------- advice ----------
    const adviceEl = $('#advice');
    const STATUS = { bad: ['bad', '改善'], warn: ['warn', '注意'], good: ['ok', '良い'], info: ['info', '計測'] };
    const ORDER = { bad: 0, warn: 1, info: 2, good: 3 };
    let focusOwner = null; // the check whose muscles are highlighted
    function clearAdvice(text) {
      adviceEl.innerHTML = `<p class="empty">${esc(text)}</p>`;
      focusOwner = null;
      setFocus({});
    }
    // the frames as the analysis sees them: outside the chosen range, as if nobody had been detected
    function framesInRange() {
      const F = state.frames.slice(0, state.analyzed);
      if (wholeRange()) return F;
      const [a, b] = rangeNow();
      return F.map((f, i) => (i >= a && i <= b ? f : { t: f.t, ok: false, w: null, img: null, vis: null, m: { ok: false, ang: null, vis: null } }));
    }
    // The general analysis keeps the paths and the floor, and everything that judges a movement is left out: the
    // muscle output and the advice assume a squat or a jump. `error` is what the parts that need a movement look at.
    function asGeneral(base, quality, F, fps) {
      const moving = quality && quality.bouts ? quality.bouts.filter(b => b.kind !== 'walk') : [];
      const output = guard(() => window.KinemaOutput.compute(F, quality, fps, base.kin)) || null;
      return { ...base, general: true, quality, output, checks: [], trajChecks: [], kinChecks: [], kin: null, reps: [], flights: [], phases: [], skipped: 0,
        trajView: { i0: 0, i1: Math.max(0, F.length - 1), segments: moving.map(b => [b.a, b.b]), perRep: moving.length > 0, events: moving.map(b => ({ i: b.peak, ja: b.kind === 'swing' ? '手首が最速' : '動きの中心' })) },
        error: '全般の分析では、種目としての評価はしていません。' };
    }
    const generalPhases = Q => (Q && Q.bouts ? Q.bouts.filter(b => b.kind !== 'walk').map(b => ({ kind: 'con', i0: b.a, i1: b.b })) : []);
    // what a swing is about: the hands' paths, and the arms on the angle chart
    function showGeneralViews() {
      trajUi.points = new Set(['com', 'wr']);
      for (const g of Object.keys(chart.groups)) chart.groups[g] = true;
      document.querySelectorAll('#legend button').forEach(b => b.setAttribute('aria-pressed', String(!!chart.groups[b.dataset.g])));
      chart.dirty = true;
    }
    // Each part runs on its own: a failure in one still leaves the others on screen.
    function runAnalysis() {
      if (!state.analyzed) return;
      repFocus = -1; // the repetitions may come out differently
      updateRangeUi();
      state.quality = guard(() => window.KinemaQuality.analyze(framesInRange(), state.vw, state.vh, state.fps)) || null;
      try {
        const F = framesInRange();
        state.result = window.KinemaAnalysis.analyze(state.move, F, state.vw, state.vh, { heightCm: userHeight(), weightKg: userWeight(), ...(state.general ? { generalPhases: generalPhases(state.quality) } : {}) });
        state.result = state.general ? asGeneral(state.result, state.quality, F, state.fps) : { ...state.result, quality: state.quality };
      } catch (err) {
        reportProblem(err);
        state.result = {
          move: state.move, view: 'oblique', side: 'both', checks: [], reps: [], trajChecks: [], flights: [], kin: null, kinChecks: [], trajView: null, problems: [],
          error: '分析の途中で問題が起きました。動きの種類や分析する範囲を変えると、分析できることがあります。',
        };
      }
      for (const p of state.result.problems || []) reportProblem(p);
      guard(buildPlan);
      guard(buildTrails);
      if (!userMoved) guard(frameCamera);
      chart.dirty = true;
      guard(renderAdvice);
      guard(renderTraj);
      guard(renderKin);
      if (currentSession) {
        const r = state.result, n = s => r.checks.filter(c => c.status === s).length;
        Object.assign(currentSession, {
          move: state.move, range: state.range, general: !!state.general,
          summary: r.general ? `全般の分析・動きの区切り ${(r.quality && r.quality.bouts || []).length}か所` : `${window.KinemaAnalysis.MOVES[state.move].ja}・${r.error ? '動きが見つからない' : `${r.reps.length}回・改善${n('bad')} 注意${n('warn')}`}`,
        });
      }
      renderSessions();
    }
    // the movements other than the chosen one that this video can be analysed as
    function otherMoves() {
      const F = framesInRange();
      return Object.keys(window.KinemaAnalysis.MOVES).filter(m => m !== state.move && guard(() => !window.KinemaAnalysis.analyze(m, F, state.vw, state.vh, {}).error));
    }
    // no movement found: say what can be tried next
    function renderNoMovement(r) {
      focusOwner = null;
      setFocus({});
      const others = otherMoves(), rate = detectionRate();
      adviceEl.innerHTML = `
        <p class="adv-err">${esc(r.error)}</p>
        ${others.length ? `<p class="adv-try">この動画は、別の動きとして分析できそうです：</p>
          <div class="adv-tryb">${others.map(m => `<button type="button" class="btn small" data-move="${m}">${esc(window.KinemaAnalysis.MOVES[m].ja)}として分析する</button>`).join('')}</div>` : ''}
        <div class="adv-tryb"><button type="button" class="btn small" id="toGeneral">全般の分析に切り替える</button></div>
        <ul class="adv-tips">
          ${rate < 0.8 ? `<li>人物を検出できたコマは ${Math.round(rate * 100)}% でした。全身が明るく映るように撮ると、検出しやすくなります。</li>` : ''}
          ${r.skipped ? `<li>${r.move === 'squat' ? `膝が曲がる動きが ${r.skipped} か所ありましたが、足が動いている（歩いているなど）か腰が下がっていないため、スクワットには数えていません。` : `両足が床から離れて見える場面が ${r.skipped} か所ありましたが、跳ぶ前に両膝が曲がって腰が沈む動きがないため、ジャンプには数えていません。`}</li>` : ''}
          <li>動きの種類（左上のスクワット・ジャンプ・立ち幅跳び）が動画と合っているか確かめてください。</li>
          <li>動いていない部分が長いときは、画面下の「ここから」「ここまで」で動いている部分だけを選ぶと、見つかることがあります。</li>
        </ul>`;
      adviceEl.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => moveBtns.find(x => x.dataset.move === b.dataset.move).click()));
      $('#toGeneral').addEventListener('click', () => generalBtn.click());
    }
    const chipList = (ids, role) => ids.map(id => `<button type="button" class="mchip ${role}" data-id="${id}">${esc(MUSCLE[id] ? MUSCLE[id].ja : id)}</button>`).join('');
    const list = items => `<ul>${items.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
    // from the paths and the work of the muscles to what to keep in mind: posture first, then what helps, then the force
    function planHtml(r) {
      const P = guard(() => window.KinemaCoach.plan(r, userWeight()));
      if (!P) return '';
      const STEP = { stabilizer: '① まず固める', synergist: '② 力を足す', prime: '③ 強く押す' };
      return `<section class="plan">
        <h3>パフォーマンス向上プラン <span>軌跡と筋肉の働きから</span></h3>
        ${P.note ? `<p class="adv-warn">${esc(P.note)}</p>` : ''}
        ${P.points.length ? `<ul class="plan-points">${P.points.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
        ${P.tiers.map(t => `<div class="plan-tier ${t.role}">
          <h4><em>${STEP[t.role]}</em>${esc(t.title)}</h4>
          <p class="plan-why">${esc(t.why)}${t.now.map(s => esc(s)).join('')}</p>
          <div class="mchips">${chipList(t.muscles, '')}</div>
          <h5>意識すること</h5>
          ${list(t.cues)}
          <h5>練習</h5>
          <p class="plan-drills">${t.drills.map(esc).join('・')}</p>
        </div>`).join('')}
        <p class="plan-note">筋肉を直接測ったものではなく、動きからの見立てです。練習は無理のない回数から始め、痛みが出たら中止してください。成長期は重りを使わず、体重だけで行うことをおすすめします。</p>
      </section>`;
    }
    // The analysis reads from what was measured, through its cause and what to do, to what it brings. Picking a finding
    // brings forward, on each chart at once, where the evidence for it is.
    let finding = null, findingByViewer = false, focusLink = null;
    const FINDING_ORDER = { bad: 0, warn: 1, info: 2, good: 3 };
    const findingsOf = r => [...(r.checks || []), ...(r.trajChecks || []), ...(r.kinChecks || [])].filter(c => c.id !== 'view').sort((a, b) => FINDING_ORDER[a.status] - FINDING_ORDER[b.status]);
    const STATUS_JA = { bad: ['bad', '改善'], warn: ['warn', '注意'], good: ['ok', '良い'], info: ['info', '計測'] };
    const setSee = (id, text) => {
      const el = $(id);
      el.hidden = !text;
      el.innerHTML = text ? `<b>見る所</b>${esc(text)}` : '';
    };
    // the muscles on the figure: all that this movement uses, by their part in it, or those of the finding picked
    let generalSeg = -2;
    // the movement in view changed: its muscles and its figures
    function followGeneral() {
      const r = state.result;
      if (!r || !r.general || !segments() || segNow() === generalSeg) return;
      showMusclesNow();
      renderKin();
    }
    function showMusclesNow() {
      const r = state.result, map = {};
      let quiet = true;
      if (ui.show === 'roles' && r && r.general) {
        const out = r.output, j = segments() ? segNow() : -1;
        Object.assign(map, out && j >= 0 ? window.KinemaOutput.musclesOf(out.bouts[j]) : {});
        generalSeg = j;
      } else if (ui.show === 'roles' && r && !r.error) {
        const own = findingByViewer && focusLink ? focusLink.muscles : null;
        const has = own && Object.values(own).some(list => list.length);
        const set = has ? own : window.KinemaKinetics.ROLES[r.move];
        quiet = !has;
        for (const [k, role] of [['stabilizer', 'stab'], ['synergist', 'tight'], ['prime', 'weak']]) for (const id of set[k] || []) map[id] = role;
      }
      quietFocus = quiet;
      focusOwner = null;
      setFocus(map);
    }
    function chainHtml(c, L) {
      const [cls, ja] = STATUS_JA[c.status] || STATUS_JA.info, good = c.status === 'good', info = c.status === 'info';
      const tier = (name, ids, role) => (ids && ids.length ? `<div class="ctier"><small>${name}</small><div class="mchips">${chipList(ids, role)}</div></div>` : '');
      const m = L.muscles || {};
      const tiers = tier('主動作筋', m.prime, 'weak') + tier('補助筋', m.synergist, 'tight') + tier('安定筋', m.stabilizer, 'stab');
      const steps = [...(c.cues || []), ...(c.form || [])];
      return `<h3 class="chain-title"><span class="chip ${cls}">${ja}</span> ${esc(c.title)}</h3>
        <div class="clink a"><h4>分析</h4><p><b>${esc(c.value)}</b>${c.target ? `　目安：${esc(c.target)}` : ''}</p>${good || info ? '' : `<p>${esc(c.detail)}</p>`}</div>
        <div class="clink b"><h4>原因</h4><p>${esc(good ? '目安に入っています。' : L.why || c.detail)}</p></div>
        <div class="clink c"><h4>プロセス</h4>${good ? '<p>今の形を保ちます。</p>' : steps.length ? list(steps) : ''}${!good && c.drills && c.drills.length ? `<p>練習：${c.drills.map(esc).join('・')}</p>` : ''}${tiers}</div>
        <div class="clink d"><h4>向上</h4><p>${esc(L.gain || (good ? '今の形を保つと、ほかの項目を伸ばしやすくなります。' : ''))}</p></div>`;
    }
    function selectFinding(id, byViewer) {
      const r = state.result;
      if (!r || r.error) return;
      const c = findingsOf(r).find(x => x.id === id);
      if (!c) return;
      finding = id;
      findingByViewer = byViewer;
      const L = window.KinemaCoach.link(r.move, id);
      // targets that the movement's check states
      if (L.angle && (id === 'depth' || id === 'landing')) {
        const n = /(\d+)°/.exec(c.target || '');
        if (n) L.angle.target = { kn: Number(n[1]) };
      }
      focusLink = L;
      adviceEl.querySelectorAll('.frow').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      const chain = $('#chain');
      chain.innerHTML = chainHtml(c, L);
      chain.querySelectorAll('.mchip').forEach(b => b.addEventListener('click', () => toggleSelect(b.dataset.id)));
      setSee('#seeAngle', L.angle && L.angle.note);
      setSee('#seeTraj', L.traj && L.traj.note);
      setSee('#seeKin', L.kin && L.kin.note);
      if (L.kin && r.kin && r.kin.summary[L.kin.kind]) kinKind = L.kin.kind;
      chart.dirty = true;
      trajPlotDirty = true;
      kinChartDirty = true;
      if (byViewer) {
        renderKin();
        if (!state.analyzing) {
          setPlaying(false);
          const at = momentIdx(L.moment);
          if (at >= 0) seekIndex(at);
          else if (c.t != null) seekTime(c.t);
        }
      }
      showMusclesNow();
      markLists();
    }
    // the six measures, in any movement
    const Q_MARK = { good: ['ok', '良い'], mid: ['warn', '差あり'], warn: ['bad', '注意'], info: ['info', '計測'], none: ['', '評価なし'] };
    function qualityHtml(Q) {
      if (!Q || !Q.items) return '';
      return `<div class="q-items">${Object.values(Q.items).map(it => {
        const [cls, ja] = Q_MARK[it.status] || Q_MARK.info;
        return `<section class="q-item${it.status === 'none' ? ' off' : ''}">
          <h4>${esc(it.ja)} <span class="chip ${cls}">${ja}</span></h4>
          <p class="q-value">${esc(it.status === 'none' ? it.detail : it.value)}</p>
          ${(it.rows || []).length ? `<dl class="q-rows">${it.rows.map(row => `<div><dt>${esc(row.ja)}</dt><dd>${esc(row.text)}${row.note ? `<small>${esc(row.note)}</small>` : ''}</dd></div>`).join('')}</dl>` : ''}
          ${it.status === 'none' ? '' : `<p class="q-note">${esc(it.detail)}</p>`}
          ${Number.isInteger(it.at) ? `<button type="button" class="btn small" data-at="${it.at}">その場面を見る</button>` : ''}
        </section>`;
      }).join('')}</div>`;
    }
    const wireQuality = host => host.querySelectorAll('[data-at]').forEach(b => b.addEventListener('click', () => { setPlaying(false); seekIndex(Number(b.dataset.at)); }));
    function renderGeneral(r) {
      const Q = r.quality, VIEW = { side: '横から撮影', front: '正面から撮影', oblique: '斜めから撮影' };
      const body = window.KINEMA_BODY, rate = detectionRate();
      if (!Q || Q.error) {
        adviceEl.innerHTML = `<p class="adv-err">${esc(Q && Q.error || '動きの質を分析できませんでした。')}</p>`;
        return;
      }
      const others = otherMoves(), T = Q.type, moving = Q.bouts.filter(b => b.kind !== 'walk');
      adviceEl.innerHTML = `
        <p class="adv-meta">全般の分析 ・ ${VIEW[Q.view] || ''} ・ 動きの区切り ${Q.bouts.length}か所${state.source === 'demo' && !state.saved ? ' ・ サンプル' : ''}</p>
        ${state.autoMove ? '<p class="adv-auto">スクワット・ジャンプ・立ち幅跳びには当てはまらないと判定し、測れることだけを示しています。</p>' : ''}
        <p class="adv-warn">種目としての良し悪しは評価していません。比べるときは、本人の別の回や保存した動画と見比べてください。</p>
        ${rate < 0.85 ? `<p class="adv-warn">人物を検出できたのは ${Math.round(rate * 100)}% のコマです。結果がずれている可能性があります。</p>` : ''}
        <p class="q-type"><b>動きの型</b>${T.id === 'unknown' ? ' 判定できませんでした' : ` ${esc(T.ja)}${T.sure ? '' : '（候補）'}`}${T.others.length ? `<small>ほかに：${T.others.map(esc).join('、')}</small>` : ''}</p>
        ${others.length ? `<div class="adv-tryb">${others.map(m => `<button type="button" class="btn small" data-move="${m}">${esc(window.KinemaAnalysis.MOVES[m].ja)}として分析する</button>`).join('')}</div>` : ''}
        <h3 class="flow-h">動きの質（種目を問わない6項目）</h3>
        ${qualityHtml(Q)}
        ${moving.length ? `<details class="q-bouts"><summary>見つかった動き（${moving.length}か所）</summary><ol>${moving.map(b => `<li><button type="button" class="btn small" data-at="${b.a}">${b.t0.toFixed(1)}秒</button> ${esc(b.kindJa)}（${b.secs.toFixed(1)}秒）</li>`).join('')}</ol></details>` : ''}
        <p class="adv-note">${esc(body ? body.TRUNK.video.rule : '')} 動きの判定と各項目の目安は、まだ多くの実際の動画では検証していません。</p>`;
      adviceEl.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => moveBtns.find(x => x.dataset.move === b.dataset.move).click()));
      wireQuality(adviceEl);
    }
    function renderAdvice() {
      const r = state.result;
      if (!r) return;
      if (r.general) {
        finding = null;
        focusLink = null;
        for (const id of ['#seeAngle', '#seeTraj', '#seeKin']) setSee(id, '');
        renderGeneral(r);
        showMusclesNow();
        return;
      }
      if (r.error) {
        finding = null;
        focusLink = null;
        for (const id of ['#seeAngle', '#seeTraj', '#seeKin']) setSee(id, '');
        renderNoMovement(r);
        showMusclesNow();
        return;
      }
      const VIEW = { side: '横から撮影', front: '正面から撮影', oblique: '斜めから撮影' };
      const all = findingsOf(r), problems = all.filter(c => c.status === 'bad' || c.status === 'warn'), rest = all.filter(c => !problems.includes(c));
      const unit = state.move === 'squat' ? '回' : '回のジャンプ';
      const rate = detectionRate();
      const row = c => `<li><button type="button" class="frow" data-id="${c.id}" aria-pressed="false"><i class="fdot ${c.status}"></i><span>${esc(c.title)}</span><small>${esc(c.value)}</small></button></li>`;
      adviceEl.innerHTML = `
        <p class="adv-meta">${esc(window.KinemaAnalysis.MOVES[r.move].ja)} ・ ${VIEW[r.view]} ・ ${r.reps.length}${unit}${state.source === 'demo' && !state.saved ? ' ・ サンプル' : ''}${wholeRange() ? '' : ` ・ ${rangeLabel.textContent}`}</p>
        ${rate < 0.85 ? `<p class="adv-warn">人物を検出できたのは ${Math.round(rate * 100)}% のコマです。検出できなかった場面があるため、結果がずれることがあります。</p>` : ''}
        ${state.autoMove ? `<p class="adv-auto">動画の動きから「${esc(window.KinemaAnalysis.MOVES[r.move].ja)}」と判定しました。違うときは、上のボタンで切り替えられます。</p>` : ''}
        ${r.skipped ? `<p class="adv-meta">歩いている場面など、${r.move === 'squat' ? 'スクワット' : 'ジャンプ'}ではない動きを ${r.skipped} か所除いて分析しました。</p>` : ''}
        ${r.view !== 'side' && state.source !== 'demo' ? `<p class="adv-warn">${VIEW[r.view]}した動画です。奥行きの動きを読み取りにくいため、曲げた角度が小さめに出ることがあります。深さや筋肉の出力を正確に見るには、真横から撮ってください。</p>` : ''}
        <h3 class="flow-h">① 分析の結果（押すと右の図が連動します）</h3>
        ${problems.length ? `<ol class="frows">${problems.map(row).join('')}</ol>` : '<p class="adv-meta">目立つ課題はありません。</p>'}
        ${rest.length ? `<details${problems.length ? '' : ' open'}><summary>良い項目・計測値（${rest.length}）</summary><ol class="frows">${rest.map(row).join('')}</ol></details>` : ''}
        <h3 class="flow-h">② 原因 → プロセス → 向上</h3>
        <div class="chain" id="chain"></div>
        <details class="plan-wrap"><summary>③ 全体のまとめ：パフォーマンス向上プラン</summary>${planHtml(r)}</details>
        <details class="plan-wrap"><summary>動きの質（種目を問わない6項目）</summary>${qualityHtml(state.quality)}</details>
        <p class="adv-note">動画の動きから推定した結果です。筋力を直接測ったものではなく、医学的な診断でもありません。痛みがある場合は医師や理学療法士に相談してください。</p>`;
      wireQuality(adviceEl);
      adviceEl.querySelectorAll('.frow').forEach(b => b.addEventListener('click', () => selectFinding(b.dataset.id, true)));
      adviceEl.querySelectorAll('.plan .mchip').forEach(b => b.addEventListener('click', () => toggleSelect(b.dataset.id)));
      const keep = all.find(c => c.id === finding) || problems[0] || all[0];
      if (keep) {
        const wasViewer = findingByViewer && finding === keep.id;
        selectFinding(keep.id, false);
        findingByViewer = wasViewer;
        if (wasViewer) showMusclesNow();
      } else {
        showMusclesNow();
      }
    }
    // a button that shows something in 3D brings the 3D view on screen if it has been scrolled away
    function showStage() {
      const r = stage.getBoundingClientRect();
      if (r.bottom < 120 || r.top > innerHeight - 160) $('#stagePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // expandable cards, shared by the advice and the trajectory hints
    function checkCards(checks) {
      return `<ol class="checks">${checks.map((c, i) => `
          <li class="check ${STATUS[c.status][0]}">
            <button type="button" class="check-head" aria-expanded="false" data-i="${i}">
              <span class="st">${STATUS[c.status][1]}</span><b>${esc(c.title)}</b><span class="cv">${esc(c.value)}</span>
            </button>
            <div class="check-body" hidden>
              <p>${esc(c.detail)}</p>
              <p class="target">目安：${esc(c.target)}</p>
              ${c.muscles.weak.length ? `<h4>出力が足りない可能性がある筋肉</h4><div class="mchips">${chipList(c.muscles.weak, 'weak')}</div>` : ''}
              ${c.muscles.tight.length ? `<h4>硬い・使いすぎの可能性がある筋肉</h4><div class="mchips">${chipList(c.muscles.tight, 'tight')}</div>` : ''}
              ${c.cues.length && c.status !== 'good' ? `<h4>意識すること</h4>${list(c.cues)}` : ''}
              ${c.form.length && c.status !== 'good' ? `<h4>フォームのポイント</h4>${list(c.form)}` : ''}
              ${c.drills.length && c.status !== 'good' ? `<h4>おすすめの練習</h4>${list(c.drills)}` : ''}
              <div class="check-actions">
                ${c.t != null ? '<button type="button" class="btn small" data-act="seek">この場面を見る</button>' : ''}
                ${c.muscles.weak.length + c.muscles.tight.length ? '<button type="button" class="btn small" data-act="focus">筋肉を3Dで見る</button>' : ''}
              </div>
            </div>
          </li>`).join('')}
        </ol>`;
    }
    function wireChecks(host, checks) {
      host.querySelectorAll('.check').forEach((li, i) => {
        const c = checks[i];
        const head = li.querySelector('.check-head'), body = li.querySelector('.check-body');
        head.addEventListener('click', () => openCheck(head, body, c, true));
        li.querySelector('[data-act="seek"]')?.addEventListener('click', () => { setPlaying(false); seekTime(c.t); showStage(); });
        li.querySelector('[data-act="focus"]')?.addEventListener('click', () => { setPlaying(false); focusCheck(c); showStage(); });
      });
      host.querySelectorAll('.mchip').forEach(b => b.addEventListener('click', () => toggleSelect(b.dataset.id)));
      markLists();
    }
    // opening a card shows its muscles; opened by the viewer, it also jumps to the moment it is about.
    // Closing the card whose muscles are shown clears them.
    function openCheck(head, body, c, byViewer) {
      const open = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
      if (open) {
        focusCheck(c);
        if (byViewer && c.t != null && !state.analyzing) { setPlaying(false); seekTime(c.t); }
      } else if (focusOwner === c) {
        focusOwner = null;
        setFocus({});
      }
    }
    function focusCheck(c) {
      const map = {};
      for (const id of c.muscles.tight) map[id] = 'tight';
      for (const id of c.muscles.weak) map[id] = 'weak';
      focusOwner = c;
      setFocus(map);
    }

    // ---------- trajectory panel ----------
    // The paths seen the way the camera saw them, in centimetres with the floor at zero, plus what they show.
    const trajPtsEl = $('#trajPts'), trajPlotEl = $('#trajPlot'), trajHintsEl = $('#trajHints'), trajLegendEl = $('#trajLegend');
    const trajReadEl = $('#trajRead'), trajScaleEl = $('#trajScale');
    const SCALE_NOTE = {
      height: '長さの基準：入力した身長',
      gravity: '長さの基準：空中での重心の落ち方（重力）から自動で補正',
      pose: '長さの基準：AIが推定した体の大きさ（身長を入力すると、より正確になります）',
    };
    let trajPlotDirty = true, trajPlotIdx = -1, trajGeom = null;
    // the buttons choosing which paths are drawn, above the plot and in "表示の設定"
    function renderTrajChips() {
      for (const host of [trajPtsEl, $('#dispPts')]) {
        host.innerHTML = TP.POINTS.map(p => `<button type="button" class="tpt" data-p="${p.k}" aria-pressed="${trajUi.points.has(p.k)}" style="--c: var(--tr-${p.k})"${p.note ? ` title="${esc(p.note)}"` : ''}><i></i>${esc(p.ja)}</button>`).join('');
        host.querySelectorAll('.tpt').forEach(b => b.addEventListener('click', () => {
          const k = b.dataset.p;
          if (trajUi.points.has(k)) trajUi.points.delete(k);
          else trajUi.points.add(k);
          document.querySelectorAll(`.tpt[data-p="${k}"]`).forEach(x => x.setAttribute('aria-pressed', String(trajUi.points.has(k))));
          buildTrails();
          trajPlotDirty = true;
          drawOverlay(state.frames[state.idx]);
        }));
      }
    }
    // In words and in a few figures, for the repetition in view against the middle of them all: the plot then shows the shape.
    let trajSeg = null;
    function renderTrajStats() {
      const r = state.result, T = r && r.traj, sayEl = $('#trajSay'), box = $('#trajStats'), segs = segments();
      trajSeg = segs ? segNow() : -1;
      const rep = r && !r.error && r.reps ? r.reps[Math.max(trajSeg, 0)] : null;
      if (!rep || !T) { sayEl.hidden = true; box.innerHTML = ''; return; }
      const n = r.reps.length, no = n > 1 ? `${trajSeg + 1}回目は` : '';
      const midOf = get => {
        const v = r.reps.map(get).filter(Number.isFinite).sort((a, b) => a - b);
        return v.length ? v[Math.floor(v.length / 2)] : NaN;
      };
      const vs = (get, fmt) => (n > 1 && Number.isFinite(midOf(get)) ? `真ん中 ${fmt(midOf(get))}` : '');
      const tile = (ja, value, sub) => `<div class="tstat"><span>${ja}</span><b>${value}</b><small>${sub}</small></div>`;
      const cm = v => `${Math.round(v)} cm`, plus = v => `+${Math.round(v)} cm`;
      const known = v => Number.isFinite(v);
      let say = '', tiles = [];
      if (r.move === 'broad') {
        const order = r.reps.map(x => x.meters).filter(known).sort((a, b) => b - a), rank = order.indexOf(rep.meters) + 1;
        const range = !known(rep.angle) ? '' : rep.angle < 25 ? '（低め）' : rep.angle > 45 ? '（高め）' : '（範囲内）';
        say = `${no}${known(rep.angle) ? `${rep.angle}° で踏み切り、` : ''}${known(rep.rise) ? `最高点は踏み切りの姿勢より ${rep.rise} cm 高く、` : ''}${known(rep.meters) ? `${rep.meters.toFixed(2)} m 跳びました。` : ''}${n > 1 && rank ? `${n}回の中で ${rank} 番目に遠いジャンプです。` : ''}`;
        tiles = [
          known(rep.meters) ? tile('跳んだ距離', `${rep.meters.toFixed(2)} m`, vs(x => x.meters, v => `${v.toFixed(2)} m`) || 'つま先からかかとまで') : '',
          known(rep.angle) ? tile('踏み切りの角度', `${rep.angle}°`, `目安 25〜45°${range}`) : '',
          known(rep.rise) ? tile('最高点の高さ', plus(rep.rise), vs(x => x.rise, plus) || '踏み切りの姿勢から') : '',
          known(rep.sink) ? tile('沈み込み', cm(rep.sink), vs(x => x.sink, cm) || '立った姿勢から') : '',
        ];
      } else if (r.move === 'jump') {
        const high = x => (known(x.flight) ? 9.81 * x.flight * x.flight / 8 * 100 : NaN);
        say = `${no}高さ約 ${Math.round(high(rep))} cm（空中 ${rep.flight} 秒）${known(rep.sink) ? `、沈み込みは ${rep.sink} cm ` : ''}でした。`;
        tiles = [
          tile('跳んだ高さ', cm(high(rep)), vs(high, cm) || '空中の時間から'),
          tile('空中の時間', `${rep.flight} 秒`, vs(x => x.flight, v => `${v} 秒`) || ''),
          known(rep.sink) ? tile('沈み込み', cm(rep.sink), vs(x => x.sink, cm) || '立った姿勢から') : '',
        ];
      } else {
        const com = T.m.com, side = T.view === 'front' ? '左右のぶれ' : '前後のぶれ';
        const drop = x => (com.y[x.start] - com.y[x.bottom]) * 100;
        const sway = x => {
          let far = 0;
          for (let i = x.start; i <= x.end; i++) { const d = Math.abs(com.x[i] - com.x[x.start]); if (known(d)) far = Math.max(far, d); }
          return far * 100;
        };
        say = `${no}重心が ${Math.round(drop(rep))} cm 下がり、${side}は ${Math.round(sway(rep))} cm でした。`;
        tiles = [
          known(rep.depth) ? tile('膝の深さ', `${rep.depth}°`, vs(x => x.depth, v => `${v}°`) || '') : '',
          tile('重心の下がり', cm(drop(rep)), vs(drop, cm) || '立った姿勢から'),
          tile(side, cm(sway(rep)), vs(sway, cm) || '小さいほどまっすぐ'),
          tile('かかった時間', `${(rep.t1 - rep.t0).toFixed(1)} 秒`, vs(x => x.t1 - x.t0, v => `${v.toFixed(1)} 秒`) || ''),
        ];
      }
      sayEl.hidden = !say;
      sayEl.textContent = say;
      const rankJa = r.move === 'broad' && n > 1 && known(rep.meters) ? `・${n}回の中で${r.reps.map(x => x.meters).filter(known).sort((a, b) => b - a).indexOf(rep.meters) + 1}番目に遠い` : '';
      box.innerHTML = `<h3 class="flow-h stats-h">${n > 1 ? `${trajSeg + 1}回目の数字${rankJa}` : 'この動きの数字'}</h3>${tiles.join('')}`;
    }
    function renderTraj() {
      const r = state.result, T = r && r.traj;
      renderTrajChips();
      renderTrajStats();
      trajScaleEl.textContent = T ? SCALE_NOTE[T.scaleSource] || '' : '';
      const hints = r && !r.error ? r.trajChecks || [] : [];
      if (hints.length) {
        trajHintsEl.innerHTML = checkCards(hints);
        wireChecks(trajHintsEl, hints);
      } else {
        trajHintsEl.innerHTML = `<p class="empty">${r && r.general ? '全般の分析では、軌跡から良し悪しは判定しません。線の形を回どうしで見比べてください。' : r && r.error ? '動きを見つけられなかったため、軌跡からわかることはありません。' : '解析が終わると、ここに表示されます。'}</p>`;
      }
      trajPlotDirty = true;
    }
    function drawTrajPlot() {
      trajPlotDirty = false;
      trajPlotIdx = state.idx;
      trajGeom = null;
      const W = trajPlotEl.clientWidth, H = trajPlotEl.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(devicePixelRatio, 2);
      if (trajPlotEl.width !== Math.round(W * dpr) || trajPlotEl.height !== Math.round(H * dpr)) {
        trajPlotEl.width = Math.round(W * dpr);
        trajPlotEl.height = Math.round(H * dpr);
      }
      const g = trajPlotEl.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      trajReadEl.textContent = '';
      const message = text => {
        g.fillStyle = tokens['--muted'];
        g.font = '12.5px "Zen Kaku Gothic New", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, W / 2, H / 2);
      };
      const r = state.result, T = r && r.traj;
      const moveNow = r && r.general ? 'general' : r && r.move; // the general analysis judges nothing: no ideal line, no take-off line
      if (!T || !r.trajView || T.n !== state.analyzed) { message(state.analyzing ? '解析が終わると、ここに軌跡が表示されます' : '軌跡はまだありません'); return; }
      if ((segments() ? segNow() : -1) !== trajSeg) renderTrajStats();
      // Repetitions are drawn one at a time, the others faintly behind it, all from the same place: the middle of the
      // foot and the floor where each one starts. So they can be compared, wherever in the room each was done.
      const segs = segments() || [[r.trajView.i0, r.trajView.i1]], aligned = !!segments(), cur = aligned ? segNow() : 0;
      const orZero = v => (Number.isFinite(v) ? v : 0);
      const shift = segs.map(([a], j) => {
        if (!aligned) return [0, 0];
        const anchor = r.trajView.anchors && r.trajView.anchors[j], i = anchor ? anchor.i : a;
        const x = anchor && anchor.part === 'toe' ? T.m.toe.x[i] : (T.m.toe.x[i] + T.m.heel.x[i]) / 2;
        return [orZero(x), orZero(T.m.toe.y[i])];
      });
      const series = [...trajUi.points].flatMap(p => TP.seriesOf(p, r.side).map(k => ({ k, p, s: T.m[k] })));
      if (!series.length) { message('上の色のボタンで、描く部分を選んでください'); return; }
      // on a phone every centimetre of width counts: the scale follows this repetition alone
      const narrow = W < 480;
      trajLegendEl.hidden = !narrow;
      let x0 = Infinity, x1 = -Infinity, y1 = 0;
      segs.forEach(([a, b], j) => {
        if (narrow && j !== cur) return;
        for (const { s } of series) {
          for (let i = a; i <= b; i++) {
            const x = s.x[i] - shift[j][0], y = s.y[i] - shift[j][1];
            if (Number.isFinite(x) && Number.isFinite(y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
          }
        }
      });
      if (!Number.isFinite(x0)) { message('この区間では体を検出できませんでした'); return; }
      // same scale across and up, floor at the bottom
      const padL = narrow ? 30 : 46, padR = narrow ? 8 : 14, padT = 14, padB = narrow ? 32 : 36;
      // room above for the arrow of this jump's angle and its label
      const rep0 = r.reps && r.reps[cur], leave0 = moveNow === 'broad' && rep0 && Number.isFinite(rep0.angle) ? r.trajView.events.find(e => e.ja === '踏み切り' && e.i >= segs[cur][0] && e.i <= segs[cur][1]) : null;
      if (leave0 && Number.isFinite(T.m.com.y[leave0.i - 1])) y1 = Math.max(y1, T.m.com.y[leave0.i - 1] - shift[cur][1] + 0.55 * Math.sin(rep0.angle * Math.PI / 180) + 0.1);
      const k = Math.min((W - padL - padR) / Math.max(x1 - x0, 0.4), (H - padT - padB) / Math.max(y1 * 1.06, 0.4));
      // a path of over a kilometre means the scale could not be read (the grid below would never end)
      if (!(k > 0) || x1 - x0 > 1000 || y1 > 1000 || Math.abs(x0) > 1e4) { message('この動画では、軌跡の長さを正しく計算できませんでした'); return; }
      const cx = (x0 + x1) / 2, midX = padL + (W - padL - padR) / 2;
      const X = x => midX + (x - cx) * k, Y = y => H - padB - y * k, xAt = px => cx + (px - midX) / k;
      // squares of 5, 10, 25, 50 cm or 1 m (25 cm, like the floor in 3D, once the movement is wide)
      const span = Math.max(W - padL - padR, H - padT - padB) / k;
      const most = narrow ? 7 : 12;
      let step = [0.05, 0.1, 0.25, 0.5, 1].find(s => span / s <= most);
      if (!step) { step = 1; while (span / step > most) step *= 2; }
      g.lineWidth = 1;
      g.font = '10px "Zen Kaku Gothic New", sans-serif';
      g.strokeStyle = tokens['--line'];
      g.fillStyle = tokens['--muted'];
      g.textAlign = 'center';
      g.textBaseline = 'top';
      for (let v = Math.ceil(xAt(padL) / step) * step; v <= xAt(W - padR) + 1e-9; v += step) {
        const xx = Math.round(X(v)) + 0.5;
        g.beginPath(); g.moveTo(xx, padT); g.lineTo(xx, H - padB); g.stroke();
        g.fillText(`${Math.round(v * 100)}`, xx, H - padB + 4);
      }
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let v = 0; Y(v) >= padT - 0.5; v += step) {
        const yy = Math.round(Y(v)) + 0.5;
        g.beginPath(); g.moveTo(padL, yy); g.lineTo(W - padR, yy); g.stroke();
        g.fillText(`${Math.round(v * 100)}`, padL - 6, yy);
      }
      g.strokeStyle = tokens['--ink'];
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(padL, Y(0)); g.lineTo(W - padR, Y(0)); g.stroke();
      g.fillStyle = tokens['--muted'];
      g.font = '10.5px "Zen Kaku Gothic New", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      const across = !aligned ? (T.view === 'front' ? '左右（cm）' : '前後（cm）') : moveNow === 'broad' ? '踏み切り線からの距離（cm）' : '足の真ん中からの距離（cm）';
      const acrossNow = narrow ? '距離（cm）' : across;
      g.fillText(T.view === 'front' ? `← ${narrow ? '左' : '画面の左'}　　${acrossNow}　　${narrow ? '右' : '画面の右'} →` : `← 後ろ　　${acrossNow}　　前 →`, midX, H - 2);
      if (narrow) {
        // the legend sits under the chart: over it, the words would lie on top of the path
        trajLegendEl.innerHTML = `<i style="color:${tokens['--warn']}">━</i> 床を押す力　<i style="color:${tokens['--ink']}">━</i> 動く方向${moveNow === 'general' ? '' : `　<i style="color:${tokens['--ok']}">┅</i> ${moveNow === 'broad' ? '目安の角度（25〜45°）' : '理想の線'}`}　縦は高さ（cm）・1マス ${Math.round(step * 100)}cm`;
      } else {
        g.save();
        g.translate(12, padT + (H - padT - padB) / 2);
        g.rotate(-Math.PI / 2);
        g.textBaseline = 'middle';
        g.fillText('高さ（cm）', 0, 0);
        g.restore();
        g.textAlign = 'right';
        g.textBaseline = 'top';
        g.fillText(`1マス＝${Math.round(step * 100)}cm`, W - padR - 4, padT + 4);
        g.textAlign = 'left';
        let lx = padL + 6;
        for (const [text, color] of [['━ 床を押す力', '--warn'], ['━ 動く方向', '--ink'], ...(moveNow === 'broad' || moveNow === 'general' ? [] : [['┅ 理想の線', '--ok']])]) {
          g.fillStyle = tokens[color];
          g.fillText(text, lx, padT + 4);
          lx += g.measureText(text).width + 12;
        }
      }
      // words never lie on top of one another: each takes the first free place around its point
      const taken = [];
      const placeLabel = (text, x, y, gap = 6) => {
        const w = g.measureText(text).width, h = 13;
        const spots = [[x + gap, y - 4], [x + gap, y + 4 + h], [x - gap - w, y - 4], [x - gap - w, y + 4 + h], [x - w / 2, y - 10], [x - w / 2, y + 12 + h]];
        const free = ([sx, sy]) => sx >= padL && sx + w <= W - 2 && sy - h >= 0 && sy <= H - padB && !taken.some(b => sx < b[0] + b[2] && sx + w > b[0] && sy - h < b[1] + b[3] && sy > b[1]);
        const at = spots.find(free) || spots[0];
        taken.push([at[0], at[1] - h, w, h]);
        return at;
      };
      // the ideal direction (dashed): straight down and up over the start, or the range of good take-off angles
      const com = T.m.com, now = state.idx;
      const [ox, oy] = shift[cur], [a0, b0] = segs[cur];
      const thisRep = r.reps && r.reps[cur], flew = (r.flights || []).find(f => f.takeoff >= a0 && f.takeoff <= b0);
      let launch = null;
      g.save();
      g.beginPath();
      g.rect(padL, 0, W - padL - padR, H - padB);
      g.clip();
      g.strokeStyle = tokens['--ok'];
      g.lineWidth = 1.5;
      g.setLineDash([6, 4]);
      g.beginPath();
      if (moveNow === 'broad') {
        const ev = r.trajView.events.find(e => e.ja === '踏み切り' && e.i >= a0 && e.i <= b0), fi = ev ? ev.i - 1 : -1;
        const x0 = fi >= 0 ? com.x[fi] - ox : NaN, y0 = fi >= 0 ? com.y[fi] - oy : NaN;
        if (Number.isFinite(x0) && Number.isFinite(y0)) {
          launch = [x0, y0];
          for (const deg of [25, 45]) {
            g.moveTo(X(x0), Y(y0));
            g.lineTo(X(x0 + Math.cos(deg * Math.PI / 180)), Y(y0 + Math.sin(deg * Math.PI / 180)));
          }
        }
      } else if (moveNow !== 'general') {
        g.moveTo(X(0), Y(0));
        g.lineTo(X(0), padT);
      }
      g.stroke();
      g.setLineDash([]);
      g.restore();
      if (launch && !narrow) {
        g.fillStyle = tokens['--ok'];
        g.textAlign = 'left';
        g.textBaseline = 'bottom';
        g.fillText('目安の角度（25〜45°）', X(launch[0] + Math.cos(Math.PI / 4)) + 4, Math.max(padT + 26, Y(launch[1] + Math.sin(Math.PI / 4))));
      }
      // paths: the other repetitions faintly; this one faint for the whole stretch, solid up to now, with small
      // arrowheads for the way it travels
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const pathOf = (s, a, b, [sx, sy]) => {
        g.beginPath();
        let pen = false;
        for (let i = a; i <= b; i++) {
          const x = s.x[i] - sx, y = s.y[i] - sy;
          if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
          if (pen) g.lineTo(X(x), Y(y));
          else { g.moveTo(X(x), Y(y)); pen = true; }
        }
        g.stroke();
      };
      // this repetition: a solid line while on the floor, dots while in the air
      const pathNow = (s, to) => {
        if (!flew) { pathOf(s, a0, to, shift[cur]); return; }
        pathOf(s, a0, Math.min(flew.takeoff, to), shift[cur]);
        if (to > flew.takeoff) {
          g.setLineDash([0.5, g.lineWidth * 2.6]);
          pathOf(s, flew.takeoff, Math.min(flew.land, to), shift[cur]);
          g.setLineDash([]);
        }
        if (to > flew.land) pathOf(s, flew.land, to, shift[cur]);
      };
      for (const { p, s } of series) {
        g.strokeStyle = g.fillStyle = tokens[`--tr-${p}`];
        g.globalAlpha = 0.14;
        g.lineWidth = 1;
        segs.forEach(([a, b], j) => { if (j !== cur) pathOf(s, a, b, shift[j]); });
        g.globalAlpha = 0.3;
        g.lineWidth = 1.5;
        pathNow(s, b0);
        if (now >= a0) {
          g.globalAlpha = 1;
          g.lineWidth = 2.6;
          pathNow(s, Math.min(now, b0));
        }
        g.globalAlpha = 0.75;
        for (let i = a0 + 3; i < b0 - 3; i += 6) {
          const dx = X(s.x[i + 1]) - X(s.x[i - 1]), dy = Y(s.y[i + 1]) - Y(s.y[i - 1]);
          if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1.5) continue;
          arrowHead(g, X(s.x[i] - ox), Y(s.y[i] - oy), Math.atan2(dy, dx), 5);
        }
        g.globalAlpha = 1;
      }
      // the way this jump actually left the floor, against the range of good angles
      if (launch && thisRep && Number.isFinite(thisRep.angle)) {
        const rad = thisRep.angle * Math.PI / 180, tipX = launch[0] + 0.55 * Math.cos(rad), tipY = launch[1] + 0.55 * Math.sin(rad);
        arrow2D(g, X(launch[0]), Y(launch[1]), X(tipX), Y(tipY), tokens['--accent']);
        g.font = '700 11.5px "Zen Kaku Gothic New", sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'bottom';
        g.lineWidth = 3;
        g.strokeStyle = tokens['--stage-a'];
        const [tx, ty] = placeLabel(`この回 ${thisRep.angle}°`, X(tipX), Y(tipY), 5);
        g.strokeText(`この回 ${thisRep.angle}°`, tx, ty);
        g.fillStyle = tokens['--accent'];
        g.fillText(`この回 ${thisRep.angle}°`, tx, ty);
      }
      // key moments on the centre of mass (or the first path)
      const ref = series.find(o => o.k === 'com') || series[0];
      const moments = r.trajView.events.filter(ev => ev.i >= a0 && ev.i <= b0);
      const named = nearestEvents(moments, now);
      g.font = '700 10.5px "Zen Kaku Gothic New", sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'bottom';
      for (const ev of moments) {
        const x = ref.s.x[ev.i] - ox, y = ref.s.y[ev.i] - oy;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        g.fillStyle = tokens['--panel'];
        g.strokeStyle = tokens['--ink'];
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(X(x), Y(y), 4, 0, Math.PI * 2); g.fill(); g.stroke();
        const looked = focusLink && focusLink.traj && focusLink.traj.event === ev.ja;
        if (looked) {
          g.strokeStyle = '#f5a524';
          g.lineWidth = 3;
          g.beginPath(); g.arc(X(x), Y(y), 8, 0, Math.PI * 2); g.stroke();
        }
        if (named.has(ev)) {
          g.lineWidth = 3;
          g.strokeStyle = tokens['--stage-a'];
          const [tx, ty] = placeLabel(ev.ja, X(x), Y(y));
          g.strokeText(ev.ja, tx, ty);
          g.fillStyle = tokens['--ink'];
          g.fillText(ev.ja, tx, ty);
        }
      }
      const inside =!aligned || (now >= spanOf(segs[cur])[0] && now <= spanOf(segs[cur])[1]);
      for (const { p, s } of series) {
        const x = s.x[now] - ox, y = s.y[now] - oy;
        if (now < a0 || now > b0 || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        g.fillStyle = tokens[`--tr-${p}`];
        g.beginPath(); g.arc(X(x), Y(y), 4.5, 0, Math.PI * 2); g.fill();
      }
      // now: the push on the floor (from under the feet, 35 cm per body weight) and the direction of the centre
      // of mass (30 cm per m/s)
      const K = r.kin, cx0 = com.x[now] - ox, cy0 = com.y[now] - oy;
      if (inside && K && K.n === T.n && Number.isFinite(cx0) && Number.isFinite(cy0)) {
        const fv = K.Fv[now] / 9.81, fu = (K.Fu[now] || 0) / 9.81;
        if (fv > 0.05) {
          const a = T.m.toe.x[now] - ox, b = T.m.heel.x[now] - ox;
          const px = Number.isFinite(a) && Number.isFinite(b) ? clamp(cx0 - cy0 * fu / fv, Math.min(a, b), Math.max(a, b)) : cx0;
          arrow2D(g, X(px), Y(0), X(px + 0.35 * fu), Y(0.35 * fv), tokens['--warn']);
        }
        const vx = (com.x[now + 1] - com.x[now - 1]) * state.fps / 2, vy = K.vUp[now];
        if (Number.isFinite(vx) && Number.isFinite(vy) && Math.hypot(vx, vy) > 0.15) {
          arrow2D(g, X(cx0), Y(cy0), X(cx0 + 0.3 * vx), Y(cy0 + 0.3 * vy), tokens['--ink']);
        }
      }
      if (inside && Number.isFinite(cx0) && Number.isFinite(cy0)) {
        const from = moveNow === 'broad' ? '踏み切り線' : aligned ? '足の真ん中' : 'スタート';
        const way = T.view === 'front' ? (cx0 >= 0 ? '画面の右へ' : '画面の左へ') : cx0 >= 0 ? '前へ' : '後ろへ';
        const stand = aligned ? com.y[a0] - oy : plan ? plan.stand : NaN;
        const sink = Number.isFinite(stand) ? `（立った姿勢より ${signedCm(cy0 - stand)}）` : '';
        trajReadEl.textContent = `${aligned && segs.length > 1 ? `${cur + 1}回目　` : ''}いまの重心：${from}から ${way} ${lenJa(cx0)}（${(Math.abs(cx0) / 0.25).toFixed(1)}マス）・高さ ${Math.round(cy0 * 100)} cm${sink}`;
      } else if (aligned) {
        trajReadEl.textContent = `図は${cur + 1}回目です。いまの場面は動作の合間なので、軌跡を描いていません。`;
      }
      // how far this jump went, on the floor: from the toes at take-off (0 here) to the heels on landing
      const rep = r.reps && r.reps[cur];
      if (aligned && moveNow === 'broad' && rep && Number.isFinite(rep.meters)) {
        const x0 = X(0), x1 = X(rep.meters), y = Y(0) - 6, label = `跳んだ距離 ${rep.meters.toFixed(2)} m`;
        g.strokeStyle = tokens['--accent'];
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x0, y); g.lineTo(x1, y);
        g.moveTo(x0, y - 5); g.lineTo(x0, y + 5);
        g.moveTo(x1, y - 5); g.lineTo(x1, y + 5);
        g.stroke();
        g.font = '700 13px "Zen Kaku Gothic New", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.lineWidth = 4;
        g.strokeStyle = tokens['--stage-a'];
        g.strokeText(label, (x0 + x1) / 2, y - 8);
        g.fillStyle = tokens['--accent'];
        g.fillText(label, (x0 + x1) / 2, y - 8);
      }
      trajGeom = { X, Y, series, segs, shift };
    }
    function arrowHead(g, x, y, ang, size) {
      g.beginPath();
      g.moveTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
      g.lineTo(x + Math.cos(ang + 2.5) * size, y + Math.sin(ang + 2.5) * size);
      g.lineTo(x + Math.cos(ang - 2.5) * size, y + Math.sin(ang - 2.5) * size);
      g.closePath();
      g.fill();
    }
    function arrow2D(g, x0, y0, x1, y1, color) {
      g.strokeStyle = g.fillStyle = color;
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      arrowHead(g, x1, y1, Math.atan2(y1 - y0, x1 - x0), 7);
    }
    // a click on the plot jumps to the moment of the nearest point on a path
    trajPlotEl.addEventListener('click', e => {
      if (!trajGeom || state.analyzing) return;
      const rect = trajPlotEl.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best = null;
      trajGeom.segs.forEach(([a, b], j) => {
        const [ox, oy] = trajGeom.shift[j];
        for (const { s } of trajGeom.series) {
          for (let i = a; i <= b; i++) {
            const x = s.x[i] - ox, y = s.y[i] - oy;
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const d = Math.hypot(trajGeom.X(x) - mx, trajGeom.Y(y) - my);
            if (!best || d < best.d) best = { d, i, j };
          }
        }
      });
      if (best && best.d < 24) {
        setPlaying(false);
        if (repFocus >= 0) setRep(best.j);
        seekIndex(best.i);
      }
    });

    // ---------- muscle output panel ----------
    // per phase of the movement: how the work is shared between the joints, every muscle involved (prime movers,
    // synergists, stabilizers) with its estimated output, the turning forces over time, and what they show
    const kinPhasesEl = $('#kinPhases'), kinJointsEl = $('#kinJoints'), kinMusclesEl = $('#kinMuscles'), kinHintsEl = $('#kinHints');
    const kinChartEl = $('#kinChart'), kinLegendEl = $('#kinLegend');
    const JOINT_JA = { hip: '股関節（お尻・太もも裏）', knee: '膝（太もも前）', ankle: '足首（ふくらはぎ）', trunk: '背中（姿勢を保つ）' };
    const JOINT_COLOR = { hip: '--tr-hip', knee: '--tr-kn', ankle: '--tr-ft', trunk: '--muted' };
    const JOINT_PLAIN = { hip: 'お尻・太もも裏（股関節）', knee: '太もも前（膝）', ankle: 'ふくらはぎ（足首）' };
    const KIN_WORK = {
      squat: { con: '立ち上がるときの仕事', ecc: 'しゃがむときに受け止めた仕事' },
      jump: { con: '踏み切りで床を押した仕事', ecc: '沈み込みで受け止めた仕事', land: '着地で受け止めた仕事' },
    };
    const KIN_BAND = { squat: { ecc: 'しゃがむ', con: '立ち上がる' }, jump: { ecc: '沈み込み', con: '踏み切り', land: '着地' } };
    const kinWords = (table, r) => table[r.move === 'squat' ? 'squat' : 'jump'];
    let kinKind = 'con', kinChartDirty = true, kinChartIdx = -1, kinGeom = null, kinSeg = null;
    const userWeight = () => {
      const v = Number(weightIn.value);
      return v >= 20 && v <= 200 ? v : 0;
    };
    // which of this phase's repetitions is in view (none while there is only one)
    function kinRepIndex(s) {
      const segs = segments();
      if (!segs || s.count < 2) return -1;
      const [a, b] = segs[segNow()];
      return s.phases.findIndex(p => p.i1 >= a && p.i0 <= b);
    }
    // In words first, then who did the work (adding up to 100%), then how strong each was, in the terms of something
    // that can be pictured. What the figures are compared with is said where they stand.
    function renderKinJoints() {
      const r = state.result, K = r && r.kin, s = K && K.summary[kinKind];
      if (!s) return;
      kinSeg = segments() ? segNow() : -1;
      const kg = userWeight(), rep = kinRepIndex(s), repJa = rep >= 0 ? `${kinSeg + 1}回目` : '';
      const force = v => (kg ? `${Math.round(v * kg)} N·m` : `${v.toFixed(2)} N·m/kg`);
      const part = j => Math.round(s.share[j] * 100);
      const joints = ['hip', 'knee', 'ankle'], order = [...joints].sort((a, b) => s.share[b] - s.share[a]);
      const say = s.totalWork > 0
        ? `${kinWords(KIN_WORK, r)[kinKind]}のうち、<b>${part(order[0])}%</b> は${JOINT_PLAIN[order[0]]}です。次が${JOINT_PLAIN[order[1]]} ${part(order[1])}%、${JOINT_PLAIN[order[2]]} ${part(order[2])}%です。`
        : 'この区間の仕事はほとんどありません。';
      const most = Math.max(1e-6, ...[...joints, 'trunk'].map(j => Math.max(s.peak[j], rep >= 0 ? s.tops[j][rep] : 0)));
      const row = j => {
        const v = s.peak[j], now = rep >= 0 ? s.tops[j][rep] : null;
        return `<div class="jrow"><span>${esc(JOINT_JA[j])}</span>
          <span class="jbar"><i style="width: ${(v / most * 100).toFixed(1)}%; background: var(${JOINT_COLOR[j]})"></i>${now != null ? `<em style="left: ${(now / most * 100).toFixed(1)}%"></em>` : ''}</span>
          <span class="jval"><b>${force(v)}</b>${kg ? `<br>約${Math.round(v * kg / 9.81)}kg分` : ''}${now != null ? `<br>${repJa} ${force(now)}` : ''}</span></div>`;
      };
      kinJointsEl.innerHTML = `${r.view === 'side' ? '' : '<p class="adv-warn">正面や斜めからの動画です。前後の動きを読み取りにくいため、ここの数字は大まかな目安です。筋肉の出力を正確に見るには、真横から撮ってください。</p>'}
        <p class="kin-say">${say}</p>
        <h4 class="kin-sub">どこが働いたか <span>合計100%${s.count > 1 ? `・${s.count}回をならした値` : ''}</span></h4>
        <div class="kshare">${joints.map(j => `<i style="flex: ${(s.share[j] * 100).toFixed(1)} 1 0; background: var(${JOINT_COLOR[j]})">${s.share[j] >= 0.1 ? `${part(j)}%` : ''}</i>`).join('')}</div>
        <div class="kkey">${joints.map(j => `<span><i style="background: var(${JOINT_COLOR[j]})"></i>${esc(JOINT_PLAIN[j])} ${part(j)}%</span>`).join('')}</div>
        <h4 class="kin-sub">どれくらいの力か <span>${kg ? `体重${kg}kg` : '体重1kgあたり'}・両脚の合計${s.count > 1 ? `。棒は${s.count}回の真ん中の値${rep >= 0 ? `、黒い線は${repJa}` : ''}` : ''}</span></h4>
        ${[...joints, 'trunk'].map(row).join('')}
        <p class="note tight">${kg ? '「約10kg分」は、1mの棒の先で10kgの重りを支えるのと同じ強さです。' : '体重を入れると、N·m（回す力の単位）と、重りに置きかえた目安でも表示します。'}足首は動画から読み取りにくく、実際より小さく出ることがあります。良い悪いの基準ではなく、同じ撮り方の自分の記録と比べるための数字です。</p>`;
      $('#kinChartTitle').textContent = kinSeg >= 0 ? `${kinSeg + 1}回目` : '';
      $('#kinMini').innerHTML = `<div class="kshare">${joints.map(j => `<i style="flex: ${(s.share[j] * 100).toFixed(1)} 1 0; background: var(${JOINT_COLOR[j]})">${s.share[j] >= 0.12 ? `${part(j)}%` : ''}</i>`).join('')}</div>
        <div class="kkey">${joints.map(j => `<span><i style="background: var(${JOINT_COLOR[j]})"></i>${{ hip: '股関節', knee: '膝', ankle: '足首' }[j]} ${part(j)}%</span>`).join('')}<span>仕事の割合${s.count > 1 ? `（${s.count}回をならした値）` : ''}</span></div>`;
    }
    const KIN_METHOD = $('#kinMethod').textContent;
    const GEN_COLOR = { shoulder: '--tr-sh', elbow: '--tr-wr', hip: '--tr-hip', knee: '--tr-kn', ankle: '--tr-ft', trunk: '--muted' };
    const GEN_VIEW = { arms: ['shoulder', 'elbow'], legs: ['hip', 'knee', 'ankle', 'trunk'] };
    let genView = null;
    const genBout = r => (r.output.bouts.length ? r.output.bouts[Math.max(0, segments() ? segNow() : 0)] : null);
    const muscleNames = ids => ids.map(id => (MUSCLE[id] ? `<button type="button" class="mchip" data-id="${id}">${esc(MUSCLE[id].ja)}</button>` : `<span class="mchip plain">${esc(window.KINEMA_BODY.EXTRA_MUSCLES.find(m => m.id === id)?.ja || id)}</span>`)).join('');
    function renderGeneralOutput(r) {
      const b = genBout(r), kg = userWeight();
      $('#kinMethod').textContent = '計算の方法：腕は、体重に対する部位の重さの比率（de Leva 1996）と動きの加速から肩と肘の力を計算しています。脚と体幹は、重心の加速から床を押す力を求め、関節との距離から計算しています。筋肉は、関節と力の向きから考えられるものを示しています。';
      kinLegendEl.textContent = '線は関節にかかる力の大きさです。腕は振っている側だけ、脚は両脚の合計です。縦の線がいまの場面で、押すとその場面へ移動します。';
      kinHintsEl.innerHTML = '';
      if (!b) {
        kinPhasesEl.innerHTML = '';
        $('#kinChartTitle').textContent = '';
        $('#kinMini').innerHTML = '';
        kinJointsEl.innerHTML = '<p class="empty">動いている場面が見つからなかったため、出力は計算できません。</p>';
        kinMusclesEl.innerHTML = '';
        return;
      }
      const hasLegs = !!r.output.legs;
      if (!genView) genView = 'arms';
      if (!hasLegs) genView = 'arms';
      $('#kinChartTitle').textContent = `${Math.max(0, segments() ? segNow() : 0) + 1}つ目・${b.hand === 'r' ? '右手' : '左手'}側`;
      kinPhasesEl.innerHTML = `<button type="button" data-v="arms" aria-pressed="${genView === 'arms'}">腕</button>${hasLegs ? `<button type="button" data-v="legs" aria-pressed="${genView === 'legs'}">脚と体幹</button>` : ''}`;
      kinPhasesEl.querySelectorAll('button').forEach(x => x.addEventListener('click', () => { genView = x.dataset.v; renderKin(); }));
      const worked = b.joints.filter(j => j.joint !== 'trunk' && j.share > 0).sort((x, y) => y.share - x.share);
      const part = j => Math.round(j.share * 100);
      const shareHtml = worked.length ? `<div class="kshare">${worked.map(j => `<i style="flex: ${(j.share * 100).toFixed(1)} 1 0; background: var(${GEN_COLOR[j.joint]})">${j.share >= 0.12 ? `${part(j)}%` : ''}</i>`).join('')}</div>
        <div class="kkey">${worked.map(j => `<span><i style="background: var(${GEN_COLOR[j.joint]})"></i>${esc(j.ja)} ${part(j)}%</span>`).join('')}<span>仕事の割合</span></div>` : '';
      $('#kinMini').innerHTML = shareHtml;
      const size = j => (kg ? `${(j.peak * kg).toFixed(j.peak * kg < 10 ? 1 : 0)} N·m` : `${j.peak.toFixed(2)} N·m/kg`);
      kinJointsEl.innerHTML = `${shareHtml}<table class="gen-table"><thead><tr><th>関節</th><th>力の向き</th><th>最大の力</th></tr></thead><tbody>${b.joints.map(j => `<tr><th scope="row">${esc(j.ja)}</th><td>${esc(j.moveJa)}${j.brake ? '（ブレーキ）' : ''}</td><td>${j.unsure ? '読み取りが不安定' : size(j)}</td></tr>`).join('')}</tbody></table>
        <p class="note tight">${kg ? '' : '体重を入れるとN·mで表示します。'}ラケットや重りの重さ、腕のひねりの力は入っていません。速い動きの最大値は、動画の速さの都合で少なめに出ます。</p>`;
      const stab = window.KINEMA_BODY.TRUNK.stabilitySystem.local.muscles;
      kinMusclesEl.innerHTML = `<p class="note tight">関節と力の向きから考えられる筋肉です。筋肉ごとの力の割合は、動画からは分かりません。</p>
        ${b.joints.map(j => `<div class="mrole"><h4>${esc(j.ja)} <span>${esc(j.moveJa)}の力</span></h4><div class="mchips">${muscleNames(j.prime)}</div>${j.assist.length ? `<div class="mchips assist"><small>補助</small>${muscleNames(j.assist)}</div>` : ''}</div>`).join('')}
        <div class="mrole"><h4>体幹を安定させる筋肉 <span>動いている間に働くと考えられます。腹圧は動画からは測れません</span></h4><div class="mchips">${muscleNames(stab)}</div></div>`;
      kinMusclesEl.querySelectorAll('button[data-id]').forEach(x => x.addEventListener('click', () => toggleSelect(x.dataset.id)));
      markLists();
    }
    function drawGeneralOutput(g, W, H, r) {
      const b = genBout(r);
      if (!b) { g.fillStyle = tokens['--muted']; g.font = '12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('動いている場面がありません', W / 2, H / 2); return; }
      const S = r.output.series(b.hand), joints = GEN_VIEW[genView || 'arms'].filter(j => S[j]);
      const pad = Math.round(0.25 * state.fps), i0 = Math.max(0, b.a - pad), i1 = Math.min(state.analyzed - 1, b.b + pad);
      let top = 0.05;
      for (const j of joints) for (let i = i0; i <= i1; i++) if (Number.isFinite(S[j][i])) top = Math.max(top, Math.abs(S[j][i]));
      top *= 1.12;
      const padL = 38, padR = 10, padT = 14, padB = 18;
      const X = i => padL + ((i - i0) / Math.max(1, i1 - i0)) * (W - padL - padR), Y = v => padT + (1 - (v + top) / (2 * top)) * (H - padT - padB);
      const step = [0.05, 0.1, 0.2, 0.5, 1, 2, 5].find(v => top / v <= 3) || 10;
      g.font = '10px "Zen Kaku Gothic New", sans-serif';
      g.lineWidth = 1;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let v = -Math.floor(top / step) * step; v <= top + 1e-9; v += step) {
        g.strokeStyle = Math.abs(v) < 1e-9 ? tokens['--ink'] : tokens['--line'];
        g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(W - padR, Y(v)); g.stroke();
        g.fillStyle = tokens['--muted'];
        g.fillText(String(Number(v.toFixed(2))), padL - 5, Y(v));
      }
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText('N·m/kg', 4, 0);
      g.textAlign = 'center';
      for (const i of [i0, i1]) g.fillText(`${state.frames[i].t.toFixed(1)}秒`, clamp(X(i), padL + 12, W - padR - 14), H - 13);
      const placed = [];
      g.textBaseline = 'alphabetic';
      for (const j of joints) {
        g.strokeStyle = tokens[GEN_COLOR[j]] || tokens['--muted'];
        g.lineWidth = 2.2;
        g.setLineDash(j === 'trunk' ? [4, 3] : []);
        g.beginPath();
        let pen = false, best = -1, most = 0;
        for (let i = i0; i <= i1; i++) {
          const v = S[j][i];
          if (!Number.isFinite(v)) { pen = false; continue; }
          if (Math.abs(v) > most) { most = Math.abs(v); best = i; }
          if (pen) g.lineTo(X(i), Y(v)); else { g.moveTo(X(i), Y(v)); pen = true; }
        }
        g.stroke();
        g.setLineDash([]);
        if (best >= 0) {
          g.font = '700 11px "Zen Kaku Gothic New", sans-serif';
          g.textAlign = 'center';
          nameLine(g, r.output.JA[j], tokens[GEN_COLOR[j]] || tokens['--muted'], clamp(X(best), padL + 20, W - padR - 20), Y(Math.abs(S[j][best])) - 3, placed, padT + 12);
        }
      }
      if (state.idx >= i0 && state.idx <= i1) {
        g.strokeStyle = tokens['--ink'];
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(X(state.idx), padT); g.lineTo(X(state.idx), H - padB); g.stroke();
      }
      kinGeom = { i0, i1, padL, padR, W };
    }
    function renderKin() {
      const r = state.result, K = r && r.kin;
      kinChartDirty = true;
      kinLegendEl.textContent = '山が高いほど強い力です。0より上は関節を伸ばす向き、下は曲げる向きです。空中は床を押せないので0になります。縦の線がいまの場面で、クリックするとその場面へ移動します。';
      if (r && r.general && r.output) { renderGeneralOutput(r); return; }
      $('#kinMethod').textContent = KIN_METHOD;
      if (!K || !Object.keys(K.summary).length) {
        kinPhasesEl.innerHTML = '';
        kinJointsEl.innerHTML = `<p class="empty">${r && r.general ? '動いている場面が見つからなかったため、出力は計算できません。' : r && r.error ? '動きを見つけられなかったため、出力は計算できません。' : '解析が終わると、ここに表示されます。'}</p>`;
        $('#kinMini').innerHTML = '';
        kinMusclesEl.innerHTML = '';
        kinHintsEl.innerHTML = '';
        return;
      }
      if (!K.summary[kinKind]) kinKind = K.summary.con ? 'con' : Object.keys(K.summary)[0];
      kinPhasesEl.innerHTML = ['con', 'ecc', 'land'].filter(kd => K.summary[kd]).map(kd => `<button type="button" data-k="${kd}" aria-pressed="${kd === kinKind}">${esc(K.summary[kd].ja)}</button>`).join('');
      kinPhasesEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { kinKind = b.dataset.k; renderKin(); }));
      const s = K.summary[kinKind], kg = userWeight(), braking = kinKind !== 'con';
      const num = (v, perKg, abs) => (kg ? `${Math.round(v * kg)} ${abs}` : `${v.toFixed(2)} ${perKg}`);
      renderKinJoints();
      // Each muscle: its part of all the work in this phase, so they add up to 100% with the joints above. Those that
      // only hold the back steady do no work: theirs is the force they hold with, on a bar of its own.
      const rows = K.muscles.map(m => {
        if (!m.group) return { m };
        const peak = m.share * s.peak[m.group];
        return m.group === 'trunk' ? { m, peak, hold: true } : { m, peak, part: m.share * s.share[m.group], work: m.share * s.work[m.group] };
      });
      const topPart = Math.max(1e-6, ...rows.filter(x => x.part != null).map(x => x.part));
      const topHold = Math.max(1e-6, ...rows.filter(x => x.hold).map(x => x.peak));
      const topWork = Math.max(0, ...rows.filter(x => x.work != null).map(x => x.work));
      const liftJa = kg && topWork * kg >= 1 ? `J（ジュール）は仕事の単位で、${Math.round(topWork * kg)} J は約${Math.max(1, Math.round(topWork * kg / 9.81))}kgを1m持ち上げる量です。腕の振りなどが入らないので、実際より少なめに出ます。` : '';
      const size = x => (x.part != null ? x.part : x.hold ? x.peak / 1e3 : -1);
      kinMusclesEl.innerHTML = `<p class="note tight">％は、この区間の仕事全体のうち、その筋肉が担った割合の目安です。関節の値を筋肉の太さで分けたもので、1つずつ測ったものではありません。棒は一番大きい筋肉を基準にしています。${liftJa}</p>` + ['prime', 'synergist', 'stabilizer'].map(role => {
        const list = rows.filter(x => x.m.role === role).sort((a, b) => size(b) - size(a));
        const R = window.KinemaKinetics.ROLE[role];
        return list.length ? `<div class="mrole"><h4>${esc(R.ja)} <span>${esc(R.note)}</span></h4>${list.map(x => (x.peak == null
          ? `<div class="mrow nonum"><button type="button" data-id="${x.m.id}">${esc(nameOf(x.m.id))}</button><span class="mval">${esc(x.m.note)}（数値は出せません）</span></div>`
          : x.hold
            ? `<div class="mrow"><button type="button" data-id="${x.m.id}">${esc(nameOf(x.m.id))}</button><span class="mbar"><i class="hold" style="width: ${(x.peak / topHold * 100).toFixed(1)}%"></i></span><span class="mval">支える力 ${num(x.peak, 'N·m/kg', 'N·m')}</span></div>`
            : `<div class="mrow"><button type="button" data-id="${x.m.id}">${esc(nameOf(x.m.id))}</button><span class="mbar"><i class="${braking ? 'brake' : ''}" style="width: ${(x.part / topPart * 100).toFixed(1)}%"></i></span><span class="mval"><b>${Math.round(x.part * 100)}%</b>　力 ${num(x.peak, 'N·m/kg', 'N·m')}・仕事 ${num(x.work, 'J/kg', 'J')}</span></div>`)).join('')}</div>` : '';
      }).join('');
      kinMusclesEl.querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', () => toggleSelect(b.dataset.id)));
      if (K.checks.length) {
        kinHintsEl.innerHTML = checkCards(K.checks);
        wireChecks(kinHintsEl, K.checks);
      } else {
        kinHintsEl.innerHTML = '<p class="empty">この動きでは、出力からの注意点は見つかりませんでした。</p>';
        markLists();
      }
    }
    function drawKinChart() {
      kinChartDirty = false;
      kinChartIdx = state.idx;
      kinGeom = null;
      const W = kinChartEl.clientWidth, H = kinChartEl.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(devicePixelRatio, 2);
      if (kinChartEl.width !== Math.round(W * dpr) || kinChartEl.height !== Math.round(H * dpr)) {
        kinChartEl.width = Math.round(W * dpr);
        kinChartEl.height = Math.round(H * dpr);
      }
      const g = kinChartEl.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const r = state.result, K = r && r.kin;
      if (r && r.general && r.output) { drawGeneralOutput(g, W, H, r); return; }
      if (!K || K.n !== state.analyzed) {
        g.fillStyle = tokens['--muted'];
        g.font = '12px "Zen Kaku Gothic New", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(state.analyzing ? '解析が終わると表示されます' : '出力のデータはまだありません', W / 2, H / 2);
        return;
      }
      // the repetition in view may have changed: the figures above follow it
      if (Object.keys(K.summary).length && (segments() ? segNow() : -1) !== kinSeg) renderKinJoints();
      const { i0, i1 } = traceSpan(), joints = ['trunk', 'ankle', 'knee', 'hip'];
      // in the unit of the figures above
      const kg = userWeight(), unit = kg || 1, force = (j, i) => K.M[j][i] * unit;
      let hi = 0.5 * unit, lo = 0;
      for (const j of joints) for (let i = i0; i <= i1; i++) { const v = force(j, i); if (Number.isFinite(v)) { hi = Math.max(hi, v); lo = Math.min(lo, v); } }
      lo = Math.max(lo, -0.4 * hi);
      const padL = 38, padR = 10, padT = 24, padB = 18;
      const X = i => padL + ((i - i0) / Math.max(1, i1 - i0)) * (W - padL - padR);
      const Y = v => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);
      const s = K.summary[kinKind];
      paintBands(g, r, X, padL, W - padR, padT, H - padB, kinKind);
      g.font = '10px "Zen Kaku Gothic New", sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillStyle = tokens['--muted'];
      g.fillText(kg ? 'N·m' : 'N·m/kg', 4, 16);
      g.lineWidth = 1;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      let step = [0.5, 1, 2, 5].find(v => (hi - lo) / v <= 6);
      if (!step) { step = 10; while ((hi - lo) / step > 6) step *= 2; }
      for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
        const yy = Math.round(Y(v)) + 0.5;
        g.strokeStyle = v === 0 ? tokens['--ink'] : tokens['--line'];
        g.beginPath(); g.moveTo(padL, yy); g.lineTo(W - padR, yy); g.stroke();
        g.fillStyle = tokens['--muted'];
        g.fillText(String(Number(v.toFixed(1))), padL - 5, yy);
      }
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      for (const i of [i0, i1]) g.fillText(`${state.frames[i].t.toFixed(1)}秒`, clamp(X(i), padL + 12, W - padR - 14), H - 6);
      g.lineJoin = 'round';
      g.save();
      g.beginPath();
      g.rect(padL, padT, W - padL - padR, H - padT - padB);
      g.clip();
      const looked = focusLink && focusLink.kin ? focusLink.kin.joint : null;
      for (const j of joints) {
        g.strokeStyle = tokens[JOINT_COLOR[j]];
        g.globalAlpha = looked && j !== looked ? 0.32 : 1;
        g.lineWidth = j === looked ? 3 : j === 'trunk' ? 1.4 : 2;
        g.setLineDash(j === 'trunk' ? [4, 3] : []);
        g.beginPath();
        let pen = false;
        for (let i = i0; i <= i1; i++) {
          const v = force(j, i);
          if (!Number.isFinite(v)) { pen = false; continue; }
          if (pen) g.lineTo(X(i), Y(v));
          else { g.moveTo(X(i), Y(v)); pen = true; }
        }
        g.stroke();
      }
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.restore();
      // each line named at its highest point, instead of a legend to look up
      const placed = [];
      g.font = '700 11px "Zen Kaku Gothic New", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      for (const j of ['hip', 'knee', 'ankle', 'trunk']) {
        let best = -1, top = 0;
        for (let i = i0; i <= i1; i++) { const v = force(j, i); if (v > top) { top = v; best = i; } }
        if (best < 0) continue;
        const x = clamp(X(best), padL + 20, W - padR - 20);
        nameLine(g, { hip: '股関節', knee: '膝', ankle: '足首', trunk: '背中' }[j], tokens[JOINT_COLOR[j]], x, Y(top) - 3, placed, padT + 12);
      }
      if (state.idx >= i0 && state.idx <= i1) {
        const xx = Math.round(X(state.idx)) + 0.5;
        g.strokeStyle = tokens['--ink'];
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(xx, padT); g.lineTo(xx, H - padB); g.stroke();
      }
      kinGeom = { i0, i1, padL, padR, W };
    }
    kinChartEl.addEventListener('click', e => {
      if (!kinGeom || state.analyzing) return;
      const rect = kinChartEl.getBoundingClientRect(), u = (e.clientX - rect.left - kinGeom.padL) / (kinGeom.W - kinGeom.padL - kinGeom.padR);
      setPlaying(false);
      seekIndex(Math.round(kinGeom.i0 + clamp(u, 0, 1) * (kinGeom.i1 - kinGeom.i0)));
    });

    // ---------- muscle info and list ----------
    // the picked muscles as chips (name: show its details, ×: remove it), then the details of one of them
    const infoEl = $('#muscleInfo');
    const keyOf = e => (typeof e === 'number' ? `a${e}` : e);
    const fromKey = k => (/^a\d+$/.test(k) ? Number(k.slice(1)) : k);
    const details = m => `<dl>
          <dt>付着部（起始）</dt><dd>${esc(m.origin)}</dd>
          <dt>付着部（停止）</dt><dd>${esc(m.insertion)}</dd>
          <dt>働き</dt><dd>${esc(m.action)}</dd>
          <dt>意識の仕方</dt><dd>${esc(m.cue)}</dd>
          <dt>鍛え方・ほぐし方</dt><dd>${esc(m.train)}</dd>
        </dl>`;
    function detailHtml(e) {
      if (typeof e === 'number') {
        const m = ANAT.muscles[e], linked = m.link && MUSCLE[m.link];
        return `<h3 class="m-name">${esc(nameOf(e))} <span>${esc(m.en)}</span></h3>
          <p class="m-region">${esc(ATLAS_REGIONS[m.region] || '')} ・ 全身の解剖図</p>
          ${linked ? `<p class="m-region">主要な筋肉「${esc(linked.ja)}」の一部です。</p>${details(linked)}` : '<p class="m-region">この筋肉の詳しい説明（付着部・働き・鍛え方）は、今後追加していきます。</p>'}`;
      }
      const m = MUSCLE[e];
      return `<h3 class="m-name">${esc(m.ja)} <span>${esc(m.en)}</span></h3>
        <p class="m-region">${esc(window.KINEMA_REGIONS[m.region])}${m.deep ? ' ・ 深いところにある筋肉' : ''}</p>${details(m)}`;
    }
    function renderInfo() {
      if (!selection.length) { infoEl.hidden = true; return; }
      infoEl.hidden = false;
      const shown = selection.includes(infoKey) ? infoKey : selection[selection.length - 1];
      infoEl.innerHTML = `
        <h2>選んだ筋肉 <span>${selection.length}個</span></h2>
        <div class="selbar">${selection.map(e => `<span class="selchip${e === shown ? ' on' : ''}"><button type="button" class="selname" data-k="${keyOf(e)}" title="説明を見る">${esc(nameOf(e))}</button><button type="button" class="selx" data-k="${keyOf(e)}" aria-label="${esc(nameOf(e))}を外す" title="外す">×</button></span>`).join('')}</div>
        <div class="selact"><button type="button" class="btn small" id="clearSel">すべて外す</button><span class="note">体や一覧の筋肉をクリックすると追加、もう一度クリックで外れます（Escキーでも全部外れます）</span></div>
        ${detailHtml(shown)}`;
      infoEl.querySelectorAll('.selname').forEach(b => b.addEventListener('click', () => { infoKey = fromKey(b.dataset.k); renderInfo(); }));
      infoEl.querySelectorAll('.selx').forEach(b => b.addEventListener('click', () => toggleSelect(fromKey(b.dataset.k))));
      $('#clearSel').addEventListener('click', clearSelection);
    }
    // chips of picked muscles look pressed in every list
    function markLists() {
      for (const host of [listEl, adviceEl, trajHintsEl, kinHintsEl]) host.querySelectorAll('.mchip').forEach(b => b.classList.toggle('active', selection.includes(b.dataset.id)));
      kinMusclesEl.querySelectorAll('button[data-id]').forEach(b => b.classList.toggle('active', selection.includes(b.dataset.id)));
      atlasListEl.querySelectorAll('.mchip').forEach(b => b.classList.toggle('active', selection.includes(Number(b.dataset.i))));
    }
    const listEl = $('#muscleList');
    function buildMuscleList() {
      const byRegion = {};
      for (const m of MUSCLES) (byRegion[m.region] ||= []).push(m);
      listEl.innerHTML = Object.entries(byRegion).map(([r, ms]) => `
        <div class="mregion"><h4>${esc(window.KINEMA_REGIONS[r])}</h4>
          <div class="mchips">${ms.map(m => `<button type="button" class="mchip" data-id="${m.id}" data-q="${esc(`${m.ja} ${m.en}`.toLowerCase())}">${esc(m.ja)}</button>`).join('')}</div>
        </div>`).join('');
      listEl.querySelectorAll('.mchip').forEach(b => b.addEventListener('click', () => toggleSelect(b.dataset.id)));
      $('#muscleCount').textContent = `${MUSCLES.length}`;
    }
    let activeList = 'core';
    $('#muscleSearch').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      const host = activeList === 'core' ? listEl : atlasListEl;
      host.querySelectorAll('.mchip').forEach(b => { b.hidden = q && !b.dataset.q.includes(q); });
      host.querySelectorAll('.mregion').forEach(r => { r.hidden = ![...r.querySelectorAll('.mchip')].some(b => !b.hidden); });
    });
    buildMuscleList();

    // ---------- full-body anatomy view (BodyParts3D) ----------
    const ATLAS_REGIONS = {
      head: '頭（眼・舌・のど）', neck: '首', shoulder: '肩', back: '背中', chest: '胸', trunk: '体幹（お腹・腰）', arm: '上腕',
      forearm: '前腕', hand: '手', hip: '股関節・お尻', thigh: '太もも', leg: 'すね・ふくらはぎ', foot: '足', pelvis: '骨盤の底',
    };
    const atlasListEl = $('#atlasList');
    let atlasListBuilt = false;
    function buildAtlasList() {
      if (atlasListBuilt) return;
      atlasListBuilt = true;
      const groups = {};
      ANAT.muscles.forEach((m, i) => (groups[m.region] ||= []).push([m, i]));
      atlasListEl.innerHTML = Object.keys(ATLAS_REGIONS).filter(r => groups[r]).map(r => `
        <div class="mregion"><h4>${esc(ATLAS_REGIONS[r])}（${groups[r].length}）</h4>
          <div class="mchips">${groups[r].map(([m, i]) => `<button type="button" class="mchip" data-i="${i}" data-q="${esc(`${m.ja} ${m.en}`.toLowerCase())}">${esc(m.ja)}・${m.side === 'L' ? '左' : '右'}</button>`).join('')}</div>
        </div>`).join('');
      atlasListEl.querySelectorAll('.mchip').forEach(b => b.addEventListener('click', () => selectAtlas(Number(b.dataset.i))));
      markLists();
    }
    function setAtlas(on) {
      ui.atlas = on;
      const btn = document.querySelector('.tog[data-ui="atlas"]');
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? '動く人型に戻る' : '全身の解剖図を見る';
      atlas.setVisible(on);
      $('#atlasCredit').hidden = !on;
      setHover(null);
      updateAtlasNote();
      showFrame(state.idx, true);
    }
    // picking from the full-body list opens the anatomy view (removing one does not)
    function selectAtlas(i) {
      if (!ui.atlas && !selection.includes(i)) setAtlas(true);
      toggleSelect(i);
    }
    document.querySelectorAll('.listtabs button').forEach(b => b.addEventListener('click', () => {
      activeList = b.dataset.list;
      document.querySelectorAll('.listtabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      if (activeList === 'atlas') buildAtlasList();
      listEl.hidden = activeList !== 'core';
      atlasListEl.hidden = activeList !== 'atlas';
      $('#muscleCount').textContent = String(activeList === 'core' ? MUSCLES.length : ANAT.muscles.length);
      $('#muscleSearch').dispatchEvent(new Event('input'));
    }));
    if (!atlas.available) document.querySelector('.tog[data-ui="atlas"]').hidden = true;

    // the muscle under the pointer in the 3D view: named on hover, picked or removed with a click
    // (drags that rotate the camera are not clicks)
    const raycaster = new THREE.Raycaster();
    function muscleAt(cx, cy) {
      const r = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      if (ui.atlas) {
        const i = atlas.pick(raycaster);
        return i === null ? null : { key: i, label: nameOf(i) };
      }
      if (!figure.group.visible) return null;
      const hit = figure.pick(raycaster);
      return hit ? { key: hit.id, label: `${nameOf(hit.id)}（${sideJa(hit.side)}）` } : null;
    }
    let downAt = null;
    renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
      const hit = muscleAt(e.clientX, e.clientY);
      if (hit) toggleSelect(hit.key);
      hoverAt = [e.clientX, e.clientY];
    });
    const tip = document.createElement('div');
    tip.className = 'hover-tip';
    tip.hidden = true;
    stage.append(tip);
    let hoverAt = null, hoverKey = null;
    renderer.domElement.addEventListener('pointermove', e => { hoverAt = e.buttons ? null : [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerleave', () => { hoverAt = null; setHover(null); });
    function setHover(key) {
      if (key === hoverKey) return;
      hoverKey = key;
      figure.setHover(typeof key === 'string' ? key : null);
      atlas.setHover(typeof key === 'number' ? key : null);
      if (key === null) {
        tip.hidden = true;
        renderer.domElement.style.cursor = '';
      }
    }
    // once per frame at most, where the pointer last moved
    function updateHover() {
      if (!hoverAt) return;
      const [cx, cy] = hoverAt;
      hoverAt = null;
      const hit = muscleAt(cx, cy);
      setHover(hit ? hit.key : null);
      if (!hit) return;
      renderer.domElement.style.cursor = 'pointer';
      tip.innerHTML = `<b>${esc(hit.label)}</b><span>${selection.includes(hit.key) ? 'クリックで外す' : 'クリックで選ぶ'}</span>`;
      tip.hidden = false;
      const sr = stage.getBoundingClientRect();
      tip.style.transform = `translate(${clamp(cx - sr.left + 14, 4, sr.width - tip.offsetWidth - 4).toFixed(0)}px, ${clamp(cy - sr.top + 16, 4, sr.height - tip.offsetHeight - 4).toFixed(0)}px)`;
    }

    // ---------- CSV ----------
    function exportCsv() {
      const head = ['time_s', 'detected', 'phase', ...ANGLES.map(a => a.csv), 'left_wrist_speed_mps', 'right_wrist_speed_mps', 'body_travel_1s_mps',
        'center_of_mass_along_floor_m', 'center_of_mass_height_m',
        'floor_push_vertical_bodyweights', 'floor_push_forward_bodyweights', 'hip_moment_nm_per_kg', 'knee_moment_nm_per_kg', 'ankle_moment_nm_per_kg', 'back_moment_nm_per_kg',
        'hip_power_w_per_kg', 'knee_power_w_per_kg', 'ankle_power_w_per_kg'];
      for (const n of LM_NAMES) head.push(`${n}_x_m`, `${n}_y_m`, `${n}_z_m`, `${n}_visibility`);
      // where each point is in the picture, as a part of its width and height (no pixels of the video itself)
      head.push('video_width_px', 'video_height_px');
      for (const n of LM_NAMES) head.push(`${n}_image_x`, `${n}_image_y`);
      const lines = [head.join(',')];
      const T = state.result && state.result.traj && state.result.traj.n === state.analyzed ? state.result.traj : null;
      const num = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');
      for (let i = 0; i < state.analyzed; i++) {
        const f = state.frames[i], m = f.m;
        const row = [f.t.toFixed(3), f.ok ? 1 : 0, m.phase];
        for (const a of ANGLES) row.push(m.ok ? m.ang[a.k].toFixed(1) : '');
        row.push(m.ok ? m.spd.lWr.toFixed(3) : '', m.ok ? m.spd.rWr.toFixed(3) : '', m.ok ? m.spd.body.toFixed(3) : '');
        row.push(T ? num(T.m.com.x[i], 4) : '', T ? num(T.m.com.y[i], 4) : '');
        // estimated push on the floor, turning forces and powers (both legs, per kg), when the movement was analysed
        const K = state.result && state.result.kin && state.result.kin.n === state.analyzed ? state.result.kin : null;
        if (K) {
          row.push(num(K.Fv[i] / 9.81, 3), num(K.Fu[i] / 9.81, 3), num(K.M.hip[i], 3), num(K.M.knee[i], 3), num(K.M.ankle[i], 3), num(K.M.trunk[i], 3),
            num(K.P.hip[i], 3), num(K.P.knee[i], 3), num(K.P.ankle[i], 3));
        } else {
          row.push('', '', '', '', '', '', '', '', '');
        }
        for (let j = 0; j < 33; j++) {
          if (f.ok) row.push(f.w[j * 3].toFixed(4), f.w[j * 3 + 1].toFixed(4), f.w[j * 3 + 2].toFixed(4), f.vis[j].toFixed(3));
          else row.push('', '', '', '');
        }
        row.push(state.vw, state.vh);
        for (let j = 0; j < 33; j++) {
          if (f.ok) row.push(f.img[j * 2].toFixed(5), f.img[j * 2 + 1].toFixed(5));
          else row.push('', '');
        }
        lines.push(row.join(','));
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
      a.download = `${(state.source === 'demo' ? 'sample' : state.name).replace(/\.[^.]+$/, '')}_kinema.csv`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    // ---------- events ----------
    fileInput.addEventListener('change', () => { openFile(fileInput.files[0]); fileInput.value = ''; });
    const drop = $('#drop');
    document.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    document.addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('over'); });
    document.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); openFile(e.dataTransfer.files[0]); });
    csvBtn.addEventListener('click', exportCsv);
    playBtn.addEventListener('click', () => setPlaying(!state.playing));
    backBtn.addEventListener('click', () => { setPlaying(false); seekIndex(state.idx - 1); });
    fwdBtn.addEventListener('click', () => { setPlaying(false); seekIndex(state.idx + 1); });
    seekBar.addEventListener('input', () => { setPlaying(false); seekIndex(Number(seekBar.value)); });
    // the stretch to analyse and play: the frame on screen becomes its start or its end
    $('#repPrev').addEventListener('click', () => { const segs = segments(); if (segs) setRep(clamp(segNow() - 1, 0, segs.length - 1)); });
    $('#repNext').addEventListener('click', () => { const segs = segments(); if (segs) setRep(clamp(segNow() + 1, 0, segs.length - 1)); });
    repAllBtn.addEventListener('click', () => setRep(-1));
    function setRange(a, b) {
      state.range = [a, b >= state.analyzed - 1 ? Infinity : b];
      runAnalysis();
      seekIndex(a);
      const r = state.result;
      toast(wholeRange() ? '動画全体を分析しました。' : `${rangeLabel.textContent}を分析しました${r && r.error ? '。この範囲では動きを見つけられませんでした。' : `（${r ? r.reps.length : 0}回）。`}`);
    }
    const shortest = () => Math.round(0.5 * state.fps);
    rangeFromBtn.addEventListener('click', () => {
      const i = state.idx, b = rangeNow()[1], end = i < b ? b : state.analyzed - 1;
      if (end - i < shortest()) { toast('範囲が短すぎます。もう少し前の場面を選んでください。'); return; }
      setRange(i, end);
    });
    rangeToBtn.addEventListener('click', () => {
      const i = state.idx, a = rangeNow()[0], start = i > a ? a : 0;
      if (i - start < shortest()) { toast('範囲が短すぎます。もう少し後の場面を選んでください。'); return; }
      setRange(start, i);
    });
    rangeAllBtn.addEventListener('click', () => setRange(0, Infinity));
    document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
      $(`#${b.dataset.goto}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    rerunBtn.addEventListener('click', () => {
      if (!currentUrl || state.analyzing) return;
      openVideo(currentUrl, state.name);
    });
    $('#sampleBtn').addEventListener('click', backToSample);
    // the player is fixed to the bottom of the window: keep the page clear of it
    const playerEl = $('#player');
    new ResizeObserver(() => document.documentElement.style.setProperty('--player-h', `${playerEl.offsetHeight}px`)).observe(playerEl);
    // ---------- what is shown ("表示の設定") ----------
    const dispPanel = $('#dispPanel'), dispBtn = $('#dispBtn');
    const TEXT_KEYS = DISP_GROUPS[1].items.map(([k]) => k);
    const DISP_PRESETS = [
      ['すべて表示', '文字も線も全部表示します', () => { for (const k of Object.keys(disp)) disp[k] = true; ui.trails = true; }],
      ['軌跡だけ', '体と軌跡と床のマス目だけにします', () => {
        for (const k of Object.keys(disp)) disp[k] = false;
        disp.sideL = disp.sideR = disp.marks = disp.floor = true;
        ui.trails = true;
      }],
      ['文字と数字を消す', '線や矢印は残して、文字と角度の数字だけ消します', () => { for (const k of [...JOINT_KEYS, ...TEXT_KEYS]) disp[k] = false; }],
    ];
    function saveDisplay() {
      try { localStorage.setItem('kinema.display2', JSON.stringify({ ...disp, trails: ui.trails })); } catch { /* storage unavailable */ }
    }
    // brings the whole page in line with the choices
    function applyDisplay() {
      ui.labels = JOINT_KEYS.some(k => disp[k]);
      for (const key of ['labels', 'trails']) document.querySelector(`.tog[data-ui="${key}"]`).setAttribute('aria-pressed', String(ui[key]));
      dispPanel.querySelectorAll('.opt').forEach(b => b.setAttribute('aria-pressed', String(disp[b.dataset.k])));
      floorGrid.visible = floorMetre.visible = disp.floor;
      $('.phase').hidden = !disp.phase;
      pipTag.hidden = !disp.pipTag;
      guard(buildTrails);
      if (state.idx >= 0) guard(showFrame, state.idx, false);
      saveDisplay();
    }
    $('#dispPresets').innerHTML = DISP_PRESETS.map(([ja, note], i) => `<button type="button" class="btn small" data-i="${i}" title="${esc(note)}">${esc(ja)}</button>`).join('');
    $('#dispPresets').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { DISP_PRESETS[Number(b.dataset.i)][2](); applyDisplay(); }));
    $('#dispGroups').innerHTML = DISP_GROUPS.map(g => `<h4>${esc(g.ja)}</h4><div class="opts">${g.items.map(([k, ja]) => `<button type="button" class="opt" data-k="${k}" aria-pressed="${disp[k]}">${esc(ja)}</button>`).join('')}</div>`).join('');
    $('#dispGroups').querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => { disp[b.dataset.k] = !disp[b.dataset.k]; applyDisplay(); }));
    function openDisplayPanel(on) {
      dispPanel.hidden = !on;
      dispBtn.setAttribute('aria-pressed', String(on));
    }
    dispBtn.addEventListener('click', () => openDisplayPanel(dispPanel.hidden));
    $('#dispClose').addEventListener('click', () => openDisplayPanel(false));
    document.querySelectorAll('.tog[data-ui]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.ui;
        ui[key] = !ui[key];
        btn.setAttribute('aria-pressed', String(ui[key]));
        if (key === 'pip') pip.hidden = !ui.pip;
        // the "角度" button turns every joint's number on or off, in 3D and on the video
        if (key === 'labels') {
          for (const k of JOINT_KEYS) disp[k] = ui.labels;
          if (ui.labels) disp.sideL = disp.sideR = true;
          applyDisplay();
        }
        if (key === 'trails') { updateTrails(); drawOverlay(state.frames[state.idx]); saveDisplay(); }
        if (key === 'output') showFrame(state.idx, false);
        if (key === 'muscles') { figure.setMuscles(ui.muscles); showFrame(state.idx, false); }
        if (key === 'atlas') setAtlas(ui.atlas);
      });
    });
    function setShow(mode) {
      ui.show = mode;
      document.querySelectorAll('#shows button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.show === mode)));
      ui.output = mode === 'output';
      const lookup = mode === 'atlas';
      if (ui.atlas !== lookup) setAtlas(lookup);
      $('#dash').classList.toggle('lookup', lookup);
      $('#advicePanel').hidden = lookup;
      $('#musclePanel').hidden = !lookup;
      $('#roleNote').hidden = mode !== 'roles';
      if (lookup && activeList !== 'atlas') document.querySelector('.listtabs button[data-list="atlas"]').click();
      if (mode === 'roles') findingByViewer = false;
      showMusclesNow();
      layoutCells();
      showFrame(state.idx, false);
    }
    // The four views: each can be shown or hidden, made larger or smaller, or shown alone, so that the one being looked at
    // can be large. They keep their places, two by two; a view next to a hidden one takes its room. In this browser only.
    const CELL = { stage: ['#stagePanel', '3D'], angle: ['#anglePanel', '角度'], traj: ['#trajCell', '軌跡'], kin: ['#kinCell', '出力'] };
    const CELL_SLOT = { stage: [0, 0], angle: [1, 0], traj: [0, 1], kin: [1, 1] };
    const CELL_SIZES = [0.5, 1, 2, 4];
    const cellKeys = Object.keys(CELL);
    const CELLS_AS_MADE = () => ({ size: { stage: 1, angle: 1, traj: 1, kin: 1 }, off: {}, solo: null, flow: true });
    let cells = CELLS_AS_MADE();
    try {
      const saved = JSON.parse(localStorage.getItem('kinema.cells') || 'null');
      if (saved && saved.size && saved.off) cells = { ...CELLS_AS_MADE(), ...saved };
    } catch { /* storage unavailable */ }
    const cellShown = k => (cells.solo ? cells.solo === k : !cells.off[k]);
    function syncCellButtons() {
      const count = cellKeys.filter(cellShown).length;
      document.querySelectorAll('.cell-ctl').forEach(box => {
        const k = box.dataset.cell, at = CELL_SIZES.indexOf(cells.size[k]);
        box.querySelector('[data-a="less"]').disabled = !!cells.solo || at <= 0;
        box.querySelector('[data-a="more"]').disabled = !!cells.solo || at >= CELL_SIZES.length - 1;
        const solo = box.querySelector('[data-a="solo"]');
        solo.setAttribute('aria-pressed', String(cells.solo === k));
        solo.title = cells.solo === k ? '元の表示に戻します' : `${CELL[k][1]}だけを表示します`;
        box.querySelector('[data-a="off"]').disabled = !!cells.solo || count <= 1;
      });
      document.querySelectorAll('#viewBar button[data-cell]').forEach(b => {
        const k = b.dataset.cell;
        b.setAttribute('aria-pressed', String(k === 'flow' ? cells.flow : cellShown(k)));
      });
    }
    function layoutCells() {
      const dash = $('#dash'), lookup = ui.show === 'atlas', narrow = matchMedia('(max-width: 1100px)').matches;
      const flow = $('#advicePanel');
      dash.style.gridTemplateColumns = '';
      dash.style.gridTemplateRows = '';
      flow.style.gridRow = '';
      flow.classList.toggle('off', !cells.flow && !lookup);
      for (const k of cellKeys) {
        const el = $(CELL[k][0]);
        el.classList.toggle('off', !lookup && !cellShown(k));
        el.classList.toggle('wide', narrow && !lookup && cells.size[k] > 1);
        el.style.gridColumn = '';
        el.style.gridRow = '';
        el.style.height = narrow && !lookup && k !== 'stage' && cells.size[k] > 1 ? `${300 * Math.min(cells.size[k], 2)}px` : '';
      }
      syncCellButtons();
      if (lookup || narrow) return;
      const at = (c, r) => cellKeys.find(k => CELL_SLOT[k][0] === c && CELL_SLOT[k][1] === r && cellShown(k));
      const colsUsed = [0, 1].filter(c => at(c, 0) || at(c, 1)), rowsUsed = [0, 1].filter(r => at(0, r) || at(1, r));
      // alone in its column: it takes the whole height
      const tall = k => rowsUsed.length === 2 && !at(CELL_SLOT[k][0], 1 - CELL_SLOT[k][1]);
      // a column and a row are as wide as their views on average: making one view smaller or larger always shows
      const mean = v => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 1);
      const colFr = c => mean([0, 1].map(r => at(c, r)).filter(Boolean).map(k => cells.size[k]));
      const rowFr = r => mean([0, 1].map(c => at(c, r)).filter(k => k && !tall(k)).map(k => cells.size[k]));
      dash.style.gridTemplateColumns = `${cells.flow ? 'minmax(300px, 25%) ' : ''}${colsUsed.map(c => `minmax(0, ${colFr(c)}fr)`).join(' ')}`;
      dash.style.gridTemplateRows = rowsUsed.map(r => `minmax(0, ${rowFr(r)}fr)`).join(' ');
      flow.style.gridRow = '1 / -1';
      const first = cells.flow ? 2 : 1;
      for (const k of cellKeys.filter(cellShown)) {
        const el = $(CELL[k][0]);
        el.style.gridColumn = String(first + colsUsed.indexOf(CELL_SLOT[k][0]));
        el.style.gridRow = tall(k) ? '1 / -1' : String(1 + rowsUsed.indexOf(CELL_SLOT[k][1]));
      }
    }
    function changeCells(fn) {
      fn();
      try { localStorage.setItem('kinema.cells', JSON.stringify(cells)); } catch { /* storage unavailable */ }
      layoutCells();
    }
    for (const k of cellKeys) {
      const box = document.createElement('div');
      box.className = 'cell-ctl';
      box.dataset.cell = k;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', `${CELL[k][1]}の大きさと表示`);
      box.innerHTML = `<button type="button" data-a="less" title="${CELL[k][1]}を小さくします" aria-label="小さくする">－</button><button type="button" data-a="more" title="${CELL[k][1]}を大きくします" aria-label="大きくする">＋</button><button type="button" data-a="solo" aria-pressed="false" aria-label="これだけ表示">⤢</button><button type="button" data-a="off" title="${CELL[k][1]}を隠します（上のバーで戻せます）" aria-label="隠す">×</button>`;
      box.addEventListener('click', e => {
        const act = e.target.dataset && e.target.dataset.a;
        if (!act || e.target.disabled) return;
        changeCells(() => {
          const i = CELL_SIZES.indexOf(cells.size[k]);
          if (act === 'less') cells.size[k] = CELL_SIZES[Math.max(0, i - 1)];
          if (act === 'more') cells.size[k] = CELL_SIZES[Math.min(CELL_SIZES.length - 1, i + 1)];
          if (act === 'solo') cells.solo = cells.solo === k ? null : k;
          if (act === 'off') cells.off[k] = true;
        });
      });
      (k === 'stage' ? $('.stage-foot .toolbar') : $(`${CELL[k][0]} .cell-head`)).append(box);
    }
    {
      const bar = $('#viewBar');
      bar.innerHTML = `<span>表示</span>${[['flow', '分析'], ...cellKeys.map(k => [k, CELL[k][1]])].map(([k, ja]) => `<button type="button" data-cell="${k}" aria-pressed="true" title="${ja}の表示と非表示を切り替えます">${ja}</button>`).join('')}<button type="button" data-reset title="表示と大きさを最初の状態に戻します">元に戻す</button>`;
      bar.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        changeCells(() => {
          if ('reset' in b.dataset) { cells = CELLS_AS_MADE(); return; }
          const k = b.dataset.cell;
          if (k === 'flow') { cells.flow = !cells.flow; return; }
          if (cells.solo) { cells.solo = cells.solo === k ? null : k; return; }
          // the last one on the screen stays
          if (!cells.off[k] && cellKeys.filter(cellShown).length <= 1) return;
          cells.off[k] = !cells.off[k];
        });
      });
    }
    matchMedia('(max-width: 1100px)').addEventListener('change', layoutCells);
    layoutCells();
    document.querySelectorAll('#shows button').forEach(b => b.addEventListener('click', () => setShow(b.dataset.show)));
    if (!atlas.available) document.querySelector('#shows button[data-show="atlas"]').hidden = true;
    $('#chartWhole').addEventListener('click', () => {
      chart.whole = !chart.whole;
      $('#chartWhole').setAttribute('aria-pressed', String(chart.whole));
      chart.dirty = true;
    });
    // the dashboard fills the window between the top bars and the player
    const setTopHeight = () => document.documentElement.style.setProperty('--top-h', `${$('.bar').offsetHeight + $('#setup').offsetHeight + 8}px`);
    new ResizeObserver(setTopHeight).observe($('#setup'));
    new ResizeObserver(setTopHeight).observe($('.bar'));
    document.querySelectorAll('.tog[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
    pip.addEventListener('click', () => { pip.classList.toggle('big'); layoutPip(); drawOverlay(state.frames[state.idx]); });
    $('#hintClose').addEventListener('click', () => { hintClosed = true; syncHint(); });
    // the person's height, kept in this browser only, makes lengths exact
    try { const v = localStorage.getItem('kinema.heightCm'); if (v) heightIn.value = v; } catch { /* storage unavailable */ }
    function userHeight() {
      const v = Number(heightIn.value);
      return v >= 100 && v <= 230 ? v : 0;
    }
    heightIn.addEventListener('change', () => {
      try { localStorage.setItem('kinema.heightCm', userHeight() ? String(userHeight()) : ''); } catch { /* storage unavailable */ }
      if (!state.analyzing && state.analyzed) { runAnalysis(); showFrame(state.idx, true); }
    });
    // the weight turns outputs per kilogram into newton-metres and watts
    try { const v = localStorage.getItem('kinema.weightKg'); if (v) weightIn.value = v; } catch { /* storage unavailable */ }
    weightIn.addEventListener('change', () => {
      try { localStorage.setItem('kinema.weightKg', userWeight() ? String(userWeight()) : ''); } catch { /* storage unavailable */ }
      if (!state.analyzing && state.analyzed) { runAnalysis(); showFrame(state.idx, true); }
    });
    document.querySelectorAll('#legend button').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.dataset.g;
        chart.groups[g] = !chart.groups[g];
        btn.setAttribute('aria-pressed', String(chart.groups[g]));
        chart.dirty = true;
      });
    });
    let scrubbing = false;
    function chartSeek(e) {
      if (!chart.geom) return;
      const r = chartEl.getBoundingClientRect();
      const { padL, padR, W, t0, t1 } = chart.geom;
      seekTime(t0 + clamp((e.clientX - r.left - padL) / (W - padL - padR), 0, 1) * (t1 - t0));
    }
    let touchAt = null; // a finger on the chart: a tap or a sideways drag moves the position, up and down scrolls the page
    const startScrub = e => {
      scrubbing = true;
      touchAt = null;
      chartEl.setPointerCapture(e.pointerId);
      setPlaying(false);
      chartSeek(e);
    };
    chartEl.addEventListener('pointerdown', e => {
      if (state.analyzing) return;
      if (e.pointerType === 'touch') touchAt = e.clientX;
      else startScrub(e);
    });
    chartEl.addEventListener('pointermove', e => {
      if (scrubbing) chartSeek(e);
      else if (touchAt !== null && Math.abs(e.clientX - touchAt) > 8) startScrub(e);
    });
    chartEl.addEventListener('pointerup', e => {
      if (touchAt !== null) { setPlaying(false); chartSeek(e); }
      scrubbing = false;
      touchAt = null;
    });
    chartEl.addEventListener('pointercancel', () => { scrubbing = false; touchAt = null; });
    // space: play / pause (a focused button keeps its own space), arrows: one frame, Esc: remove every picked muscle
    document.addEventListener('keydown', e => {
      const el = e.target instanceof Element ? e.target : document.body;
      if (el.closest('input, select, textarea')) return;
      if (e.key === 'Escape') {
        if (!dispPanel.hidden) { openDisplayPanel(false); return; }
        clearSelection();
        setHover(null);
      }
      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey && !slowBtn.disabled) slowBtn.click();
      if (e.key === ' ' && !el.closest('button')) { e.preventDefault(); setPlaying(!state.playing); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); seekIndex(state.idx - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); seekIndex(state.idx + 1); }
    });

    // Frame the whole body until the viewer moves the camera themselves.
    let userMoved = false;
    controls.addEventListener('start', () => { userMoved = true; camTween = null; });
    function resize() {
      const W = stage.clientWidth, H = stage.clientHeight;
      if (!W || !H) return; // the 3D view is hidden: the camera keeps its shape for when it comes back
      renderer.setSize(W, H, false);
      camera.aspect = W / Math.max(H, 1);
      camera.updateProjectionMatrix();
      if (!userMoved && W > 0) frameCamera();
      layoutPip();
      drawOverlay(state.frames[state.idx]);
      chart.dirty = true;
    }
    new ResizeObserver(resize).observe(stage);
    new ResizeObserver(() => { chart.dirty = true; }).observe(chartEl);
    new ResizeObserver(() => { trajPlotDirty = true; }).observe(trajPlotEl);
    new ResizeObserver(() => { kinChartDirty = true; }).observe(kinChartEl);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      readTokens();
      applyThemeTo3D();
      applyMarkTheme();
      buildTrails();
      chart.dirty = true;
      trajPlotDirty = true;
      kinChartDirty = true;
      drawOverlay(state.frames[state.idx]);
    });

    // ---------- viewpoints ----------
    // glide to the camera's view in the video, or to the body's front / side / back (the side facing that camera)
    let camTween = null;
    function setView(kind) {
      let dir;
      if (kind === 'video') dir = new THREE.Vector3(0, 0.12, 1);
      else {
        // which way the body faces (the anatomy view stands facing the camera)
        const lr = new THREE.Vector3(1, 0, 0);
        if (!ui.atlas) lr.subVectors(P3[LM.lSh], P3[LM.rSh]).add(new THREE.Vector3().subVectors(P3[LM.lHip], P3[LM.rHip]));
        lr.y = 0;
        if (lr.lengthSq() < 1e-8) lr.set(1, 0, 0);
        lr.normalize();
        const fwd = new THREE.Vector3().crossVectors(lr, Y_AXIS);
        dir = kind === 'front' ? fwd : kind === 'back' ? fwd.negate() : lr.z >= 0 ? lr : lr.negate();
        dir.y = 0.12;
      }
      const from = camera.position.clone().sub(controls.target);
      camTween = { from, to: dir.normalize().multiplyScalar(from.length()), t: 0 };
      userMoved = true;
    }
    function stepView(dt) {
      if (!camTween) return;
      camTween.t = Math.min(1, camTween.t + dt / 0.6);
      const k = camTween.t * camTween.t * (3 - 2 * camTween.t);
      const off = camTween.from.clone().lerp(camTween.to, k);
      off.setLength(camTween.from.length());
      camera.position.copy(controls.target).add(off);
      if (camTween.t >= 1) camTween = null;
    }
    // Until the viewer moves the camera, the whole movement is in view: the body plus how far it travels along
    // the floor (centred, see buildPlan). After that, the camera follows the body when it travels (long jump).
    function frameCamera() {
      const half = Math.tan((camera.fov * Math.PI) / 360);
      let reach = 0.75;
      if (plan) {
        let lo = Infinity, hi = -Infinity;
        for (const s of plan.shift) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
        // the camera follows the body, so wide movement needs little more room: the muscles stay large enough to read
        if (hi > lo) reach = Math.min(1.5, Math.max(reach, (hi - lo) / 2 + 1.0));
      }
      const dist = Math.max(1.0 / half, reach / (half * camera.aspect));
      controls.target.x = 0;
      camera.position.copy(controls.target).add(new THREE.Vector3(-0.42, 0.18, 1).normalize().multiplyScalar(dist));
    }
    let cameraFixed = false; // for tests: a fixed camera, as when filming a person
    function followFigure(dt) {
      const f = state.frames[poseIdx];
      const tx = cameraFixed || ui.atlas || !f || !f.ok ? 0 : (P3[LM.lHip].x + P3[LM.rHip].x) / 2;
      const dx = (tx - controls.target.x) * Math.min(1, dt * 5);
      if (Math.abs(dx) < 1e-5) return;
      controls.target.x += dx;
      camera.position.x += dx;
    }

    // ---------- saved videos and the comparison ----------
    const Store = window.KinemaStore, labSheet = $('#labSheet'), saveBtn = $('#saveBtn'), libList = $('#libList');
    let savedList = [];
    const emptyRom = () => Object.fromEntries(ANGLES.map(a => [a.k, [Infinity, -Infinity]]));
    const moveJa = m => window.KinemaAnalysis.MOVES[m].ja;
    const bareFrames = frames => frames.map(f => (f.ok ? { t: f.t, ok: true, w: f.w, img: f.img, vis: f.vis } : { t: f.t, ok: false, w: null, img: null, vis: null }));
    // the per-frame figures of frames that are not on screen (computeMetrics reads the state, nothing here waits)
    function hydrate(rec) {
      const keep = { frames: state.frames, rom: state.rom, events: state.events, fps: state.fps, vw: state.vw, vh: state.vh };
      Object.assign(state, { frames: rec.frames, rom: emptyRom(), events: [], fps: rec.fps, vw: rec.vw, vh: rec.vh });
      try {
        rec.frames.forEach((f, i) => { f.m = computeMetrics(i); });
        return { rom: state.rom, events: state.events };
      } finally {
        Object.assign(state, keep);
      }
    }
    function syncLabButtons() {
      const can = state.source === 'video' && !state.analyzing && state.analyzed > 0;
      saveBtn.disabled = !can || !!currentSaved;
      saveBtn.textContent = currentSaved ? '保存済み' : '保存';
    }
    async function refreshSaved() {
      try { savedList = await Store.list(); } catch (err) { savedList = []; reportProblem(err); }
      $('#libCount').textContent = savedList.length ? String(savedList.length) : '';
    }
    const figuresLine = rec => [rec.general ? '全般の分析' : moveJa(rec.move), rec.general ? `動き${rec.reps}か所` : rec.reps ? `${rec.reps}回` : '', Number.isFinite(rec.best) ? `最長 ${rec.best.toFixed(2)} m` : ''].filter(Boolean).join('・');
    const newId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const metaOf = (id, name, move, r, hasVideo, sizeMB) => {
      const dist = (r && r.reps || []).map(x => x.meters).filter(Number.isFinite);
      const general = !!(r && r.general);
      return { id, name, move, general, savedAt: Date.now(), reps: general ? (r.quality && r.quality.bouts || []).filter(b => b.kind !== 'walk').length : r && r.reps ? r.reps.length : 0, best: dist.length ? Math.max(...dist) : null, hasVideo, sizeMB };
    };
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
      const id = newId(), file = currentFile;
      const meta = metaOf(id, state.name, state.move, state.result, !!file, file ? file.size / 1048576 : 0);
      const data = { id, general: !!state.general, fps: state.fps, vw: state.vw, vh: state.vh, duration: state.duration, total: state.total, analyzed: state.analyzed, frames: bareFrames(state.frames.slice(0, state.analyzed)), heightCm: userHeight(), weightKg: userWeight(), video: file || null };
      try {
        const done = await Store.save(meta, data);
        currentSaved = id;
        if (currentSession) currentSession.savedId = id;
        toast(done.video || !file ? '保存しました。「保存した動画」から開いたり、重ねて比較したりできます。' : '端末の空きが足りず動画は保存できなかったので、動きのデータだけ保存しました。');
      } catch (err) {
        reportProblem(err);
        toast('保存できませんでした。ブラウザのプライベートモードでは保存できないことがあります。');
      }
      await refreshSaved();
      syncLabButtons();
    });
    function renderLibrary() {
      $('#libEmpty').hidden = savedList.length > 0;
      libList.innerHTML = savedList.map(rec => `<li>
        <div class="lib-info"><b>${esc(rec.name)}</b><small>${new Date(rec.savedAt).toLocaleDateString('ja-JP')}・${esc(figuresLine(rec))}・${rec.hasVideo ? `動画つき（${Math.max(1, Math.round(rec.sizeMB))} MB）` : '動きのデータのみ'}</small></div>
        <div class="lib-acts" data-id="${esc(rec.id)}">
          <button class="btn small" type="button" data-do="open">開く</button>
          <button class="btn small" type="button" data-do="compare">重ねて比較</button>
          <button class="btn small" type="button" data-do="export">ファイルに書き出す</button>
          <button class="btn small" type="button" data-do="delete">削除</button>
        </div></li>`).join('');
      const usage = $('#libUsage');
      usage.textContent = '';
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { usage.textContent = `使用量 約${Math.round((e.usage || 0) / 1048576)} MB`; }).catch(() => {});
    }
    libList.addEventListener('click', async e => {
      const b = e.target.closest('[data-do]');
      if (!b) return;
      const id = b.parentElement.dataset.id, rec = savedList.find(x => x.id === id), act = b.dataset.do;
      if (!rec) return;
      if (act === 'open') { closeSheet(); await openSaved(id); }
      if (act === 'compare') await showSheet('compare', id);
      if (act === 'export') {
        try {
          const data = await Store.get(id);
          const a = document.createElement('a'), url = URL.createObjectURL(new Blob([Store.toFile(rec, data)], { type: 'application/json' }));
          a.href = url;
          a.download = `${rec.name.replace(/\.[^.]+$/, '')}.kinema.json`;
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (err) { reportProblem(err); toast('書き出せませんでした。'); }
      }
      if (act === 'delete') {
        // removing cannot be undone: the button asks once more
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '本当に削除'; return; }
        try {
          await Store.remove(id);
          if (currentSaved === id) currentSaved = null;
          for (const s of sessions) if (s.savedId === id) s.savedId = null;
        } catch (err) { reportProblem(err); toast('削除できませんでした。'); }
        await refreshSaved();
        renderLibrary();
        syncLabButtons();
      }
    });
    $('#libImport').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        if (file.size > 200 * 1048576) throw new Error('too large');
        const rec = Store.fromFile(await file.text()), id = newId();
        const frames = rec.frames;
        const copy = { frames: frames.map(f => ({ ...f })), fps: rec.fps, vw: rec.vw, vh: rec.vh };
        hydrate(copy);
        let r = window.KinemaAnalysis.analyze(rec.move, copy.frames, rec.vw, rec.vh, { heightCm: rec.heightCm, weightKg: rec.weightKg });
        if (rec.general) r = asGeneral(r, window.KinemaQuality.analyze(copy.frames, rec.vw, rec.vh, rec.fps), copy.frames, rec.fps);
        await Store.save(metaOf(id, rec.name, rec.move, r, false, 0), { ...rec, id, video: null });
        await refreshSaved();
        renderLibrary();
        toast('読み込みました。動画は含まれないので、動きのデータで表示します。');
      } catch {
        toast('このファイルは読み込めませんでした。KINEMAで書き出したファイルを選んでください。');
      }
    });
    // back to a saved video: the AI's work is kept, so only the analysis runs again
    async function openSaved(id) {
      let data, rec;
      try {
        data = await Store.get(id);
        rec = savedList.find(x => x.id === id);
        if (!data || !rec) throw new Error('missing');
      } catch (err) { reportProblem(err); toast('この動画を開けませんでした。'); return; }
      const run = ++state.runId;
      setPlaying(false);
      progressEl.hidden = true;
      dropUnusedUrl();
      let url = null;
      if (data.video) {
        url = URL.createObjectURL(data.video);
        video.src = url;
        try { await loadVideo(video); } catch { URL.revokeObjectURL(url); url = null; toast('動画を開けなかったので、動きのデータだけ表示します。'); }
        if (run !== state.runId) return;
      }
      if (!url) { video.removeAttribute('src'); video.load(); }
      currentUrl = url;
      currentKey = `saved:${id}`;
      currentFile = data.video || null;
      currentSaved = id;
      resetData(url ? 'video' : 'demo', rec.name, data.fps, data.duration);
      Object.assign(state, { saved: !url, general: !!data.general, vw: data.vw, vh: data.vh, total: data.total, move: rec.move });
      if (data.heightCm) heightIn.value = String(data.heightCm);
      if (data.weightKg) weightIn.value = String(data.weightKg);
      footLevel = null;
      plan = null;
      clearTrails();
      levelQ.identity();
      data.frames.forEach((f, i) => { state.frames.push(f); f.m = computeMetrics(i); });
      state.analyzed = data.analyzed;
      trajUi.points = new Set(TRAJ_DEFAULT[rec.move]);
      if (data.general) showGeneralViews();
      syncMoveButtons();
      metaSource.textContent = rec.name;
      pipTag.textContent = url ? '元の動画' : '保存データ';
      video.hidden = !url;
      hint.hidden = true;
      layoutPip();
      logEl.textContent = '';
      logged = 0;
      guard(updateLevel);
      if (url) rememberSession();
      renderLog();
      setStatus('ok', '保存した動画');
      updateControls();
      showResults(true);
    }
    // what can be compared: what is open now, and everything saved
    const compare = window.createKinemaCompare({
      esc, guard, report: reportProblem, tokens: () => tokens,
      async sources() {
        await refreshSaved();
        const list = [];
        if (state.analyzed && !state.analyzing && (state.source === 'video' || state.saved) && !currentSaved) list.push({ id: 'now', label: `いま開いている動画（${state.name}）` });
        for (const rec of savedList) list.push({ id: rec.id, label: `${rec.name}（${new Date(rec.savedAt).toLocaleDateString('ja-JP')}）` });
        // the sample comes last: enough to try out comparing the repetitions of a squat
        if (state.analyzed && !state.analyzing && state.source === 'demo' && !state.saved) list.push({ id: 'now', label: `サンプル（${moveJa(state.move)}）` });
        return list;
      },
      async load(id) {
        if (id === 'now') {
          return { label: state.name, move: state.move, fps: state.fps, vw: state.vw, vh: state.vh, frames: state.frames.slice(0, state.analyzed), result: state.result, url: state.source === 'video' ? currentUrl : null, ownUrl: false };
        }
        const data = await Store.get(id), rec = savedList.find(x => x.id === id);
        if (!data || !rec) throw new Error('saved video missing');
        hydrate(data);
        const Q = data.general ? window.KinemaQuality.analyze(data.frames, data.vw, data.vh, data.fps) : null;
        let result = window.KinemaAnalysis.analyze(rec.move, data.frames, data.vw, data.vh, { heightCm: data.heightCm || 0, weightKg: data.weightKg || 0, ...(Q ? { generalPhases: generalPhases(Q) } : {}) });
        if (Q) result = asGeneral(result, Q, data.frames, data.fps);
        return { label: rec.name, move: rec.move, fps: data.fps, vw: data.vw, vh: data.vh, frames: data.frames, result, url: data.video ? URL.createObjectURL(data.video) : null, ownUrl: !!data.video };
      },
    });
    async function showSheet(mode, preferId) {
      setPlaying(false);
      sheetOpen = true;
      labSheet.hidden = false;
      document.documentElement.style.overflow = 'hidden'; // only the sheet scrolls
      const list = mode === 'list';
      $('#labTitle').textContent = list ? '保存した動画' : '重ねて比較';
      $('#libView').hidden = !list;
      $('#cmpView').hidden = list;
      $('#labToCompare').hidden = !list;
      $('#labToList').hidden = list;
      labSheet.scrollTop = 0;
      if (list) {
        compare.stop();
        await refreshSaved();
        renderLibrary();
      } else {
        const preferNow = !currentSaved && state.analyzed && (state.source === 'video' || state.saved) ? 'now' : currentSaved;
        try { await compare.start(preferId || preferNow); } catch (err) { reportProblem(err); toast('比較を開けませんでした。'); }
      }
    }
    function closeSheet() {
      compare.stop();
      labSheet.hidden = true;
      sheetOpen = false;
      document.documentElement.style.overflow = '';
    }
    $('#libBtn').addEventListener('click', () => showSheet('list'));
    $('#cmpBtn').addEventListener('click', () => showSheet('compare'));
    $('#labToCompare').addEventListener('click', () => showSheet('compare'));
    $('#labToList').addEventListener('click', () => showSheet('list'));
    $('#labClose').addEventListener('click', closeSheet);
    $('#rangeToggle').addEventListener('click', e => {
      const on = $('#player').classList.toggle('range-open');
      e.currentTarget.setAttribute('aria-expanded', String(on));
    });
    refreshSaved();

    // ---------- loop ----------
    let lastNow = performance.now();
    // the video and the 3D view again, beside the data lower down the page, only while they are on screen
    const mirrorVideo = $('#mirrorVideo'), mirror3d = $('#mirror3d');
    let mirrorOn = false;
    new IntersectionObserver(list => { mirrorOn = list.some(e => e.isIntersecting); }).observe($('#mirrorPanel'));
    const seenOf = [['stage', '#stagePanel'], ['angle', '#anglePanel'], ['traj', '#trajCell'], ['kin', '#kinCell'], ['more', '#moreData']];
    for (const [k, sel] of seenOf) {
      new IntersectionObserver(list => {
        const on = list[list.length - 1].isIntersecting, back = on && !seen[k];
        seen[k] = on;
        if (back && (k === 'stage' || k === 'more') && state.idx >= 0) guard(showFrame, state.idx, k === 'stage');
      }).observe($(sel));
    }
    $('#mirrorPanel').addEventListener('click', () => $('#dash').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    function mirrorCanvas(cv) {
      const dpr = Math.min(devicePixelRatio, 1.5), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (!w || !h) return null;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const g = cv.getContext('2d');
      g.clearRect(0, 0, w, h);
      return { g, w, h };
    }
    // the whole picture inside the frame, whichever way the video was filmed
    function fitIn(m, sw, sh) {
      const k = Math.min(m.w / sw, m.h / sh), w = sw * k, h = sh * k;
      return [(m.w - w) / 2, (m.h - h) / 2, w, h];
    }
    function drawMirror() {
      if (!mirrorOn) return;
      const a = mirrorCanvas(mirrorVideo);
      if (a) {
        const box = fitIn(a, state.vw || 16, state.vh || 9);
        if (state.source === 'video' && video.readyState >= 2) a.g.drawImage(video, ...box);
        if (overlay.width && overlay.height) a.g.drawImage(overlay, ...box);
      }
      const b = mirrorCanvas(mirror3d), view = renderer.domElement;
      if (b && view.width && view.height) b.g.drawImage(view, ...fitIn(b, view.width, view.height));
    }
    function frame(now) {
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      if (state.playing) guard(stepPlayback, dt);
      controls.autoRotate = ui.turntable;
      if (seen.stage || mirrorOn) {
        guard(stepView, dt);
        guard(followFigure, dt);
        guard(() => {
          controls.update();
          figure.tick(now / 1000);
          atlas.tick(now / 1000);
          renderer.render(scene, camera);
        });
        guard(drawMirror);
      }
      if (seen.stage) {
        guard(updateCallouts);
        guard(updateTags);
        guard(updateEventTags);
        guard(updateMarkTags);
        guard(updateHover);
      }
      if (touchy && now - lastCharts < 80) return; // the charts follow a little less often on a phone
      lastCharts = now;
      if (seen.angle) {
        if (chart.dirty && now - chart.lastBase > 120) { guard(drawChartBase); chart.lastBase = now; }
        if (chart.lastIdx !== state.idx) guard(drawChart);
      }
      if (seen.traj && (trajPlotDirty || trajPlotIdx !== state.idx)) guard(drawTrajPlot);
      if (seen.kin && (kinChartDirty || kinChartIdx !== state.idx)) guard(drawKinChart);
    }
    // While a finger scrolls the page nothing is drawn: the page gets the whole of the phone's attention.
    let scrollingUntil = 0, lastFrame = 0, lastCharts = 0, sheetOpen = false;
    addEventListener('scroll', () => { scrollingUntil = performance.now() + 180; }, { passive: true });
    function tick(now) {
      requestAnimationFrame(tick); // asked for first: one bad frame must never stop the 3D view
      if (sheetOpen) { lastNow = now; return; } // the saved videos and the comparison cover the page
      if (touchy && (now < scrollingUntil || now - lastFrame < 28)) { if (now < scrollingUntil) lastNow = now; return; }
      lastFrame = now;
      frame(now);
    }

    // ---------- start ----------
    trajUi.points = new Set(TRAJ_DEFAULT[state.move]);
    syncMoveButtons();
    loadDemo();
    metaSource.textContent = state.name;
    resize();
    renderLog();
    updateControls();
    runAnalysis();
    setIndex(0, true);
    applyDisplay();
    setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
    requestAnimationFrame(tick);

    // For testing from the console: kinema.openUrl('https://…/clip.webm')
    window.kinema = {
      state,
      seek: seekTime,
      select: toggleSelect,
      selection: () => [...selection],
      clear: () => { setFocus({}); clearSelection(); },
      atlas: on => setAtlas(on),
      selectAtlas: i => selectAtlas(i),
      view: setView,
      setMove: m => moveBtns.find(b => b.dataset.move === m)?.click(),
      openUrl: (url, limitSeconds) => {
        dropUnusedUrl();
        currentUrl = url;
        currentKey = url;
        return openVideo(url, decodeURIComponent(url.split('/').pop().split('?')[0]), limitSeconds);
      },
      // for tests: poses from anywhere, shown as the sample is (no picture, playback by the clock)
      loadFrames: (frames, { name = 'テスト', fps = 30, vw = 1280, vh = 720 } = {}) => {
        setPlaying(false);
        state.runId++;
        state.analyzing = false;
        resetData('demo', name, fps, frames.length / fps);
        Object.assign(state, { vw, vh, total: frames.length });
        footLevel = null;
        frames.forEach((f, i) => { state.frames.push(f); f.m = computeMetrics(i); });
        state.analyzed = frames.length;
        updateLevel();
        layoutPip();
        renderLog();
        updateControls();
        runAnalysis();
        setIndex(0, true);
      },
      problems,
      seen,
      compare,
      showSheet,
      closeSheet,
      saved: () => savedList,
      display: disp,
      frame: () => frame(performance.now()),
      // for tests: film from a fixed direction, without counting as the viewer moving the camera
      cameraFrom: (x, y, z, away) => {
        cameraFixed = true;
        controls.target.x = 0;
        const dist = away || camera.position.distanceTo(controls.target);
        camera.position.copy(controls.target).add(new THREE.Vector3(x, y, z).normalize().multiplyScalar(dist));
      },
    };
  },
};
