// 3D figure: a white articulated mannequin with a stylized muscle layer that follows the pose.
// Classic script so the page also works when opened straight from disk; THREE is passed in.
window.createKinemaFigure = function createKinemaFigure(THREE, { RoundedBoxGeometry }) {
  const LM = {
    lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lIdx: 19, rIdx: 20,
    lThumb: 21, rThumb: 22, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28,
    lHeel: 29, rHeel: 30, lFt: 31, rFt: 32,
  };
  const SIDES = [
    { s: 'L', sgn: 1, sh: LM.lSh, el: LM.lEl, wr: LM.lWr, idx: LM.lIdx, th: LM.lThumb, hip: LM.lHip, kn: LM.lKn, an: LM.lAn, heel: LM.lHeel, ft: LM.lFt },
    { s: 'R', sgn: -1, sh: LM.rSh, el: LM.rEl, wr: LM.rWr, idx: LM.rIdx, th: LM.rThumb, hip: LM.rHip, kn: LM.rKn, an: LM.rAn, heel: LM.rHeel, ft: LM.rFt },
  ];

  const group = new THREE.Group();
  const mat = {
    skin: new THREE.MeshStandardMaterial({ color: 0xf3f0e9, roughness: 0.62, metalness: 0, transparent: true }),
    joint: new THREE.MeshStandardMaterial({ color: 0xd6d0c4, roughness: 0.5, metalness: 0, transparent: true }),
    L: new THREE.MeshStandardMaterial({ color: 0x12a594, roughness: 0.45 }),
    R: new THREE.MeshStandardMaterial({ color: 0x6e56cf, roughness: 0.45 }),
    muscle: new THREE.MeshStandardMaterial({ color: 0xd98b84, roughness: 0.55, transparent: true }),
    faded: new THREE.MeshStandardMaterial({ color: 0xd98b84, roughness: 0.55, transparent: true, opacity: 0.14, depthWrite: false }),
    hover: new THREE.MeshStandardMaterial({ color: 0x8ab8ff, emissive: 0x2f7cf6, emissiveIntensity: 0.2, roughness: 0.45 }),
  };
  const roleMat = {
    weak: new THREE.MeshStandardMaterial({ color: 0xe5484d, emissive: 0xe5484d, emissiveIntensity: 0.35, roughness: 0.45 }),
    tight: new THREE.MeshStandardMaterial({ color: 0xf5a524, emissive: 0xf5a524, emissiveIntensity: 0.3, roughness: 0.45 }),
    select: new THREE.MeshStandardMaterial({ color: 0x2f7cf6, emissive: 0x2f7cf6, emissiveIntensity: 0.35, roughness: 0.45 }),
    stab: new THREE.MeshStandardMaterial({ color: 0x12a594, emissive: 0x12a594, emissiveIntensity: 0.3, roughness: 0.45 }),
  };

  // ---------- geometry helpers ----------
  const v2 = (r, y) => new THREE.Vector2(Math.max(0, r), y);
  function capsuleProfile(r0, r1, L, bulge) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push(v2(Math.cos(a) * r0, Math.sin(a) * r0 * 0.9)); }
    for (let i = 1; i < 14; i++) { const t = i / 14; pts.push(v2((r0 + (r1 - r0) * t) * (bulge ? bulge(t) : 1), t * L)); }
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push(v2(Math.cos(a) * r1, L + Math.sin(a) * r1 * 0.9)); }
    return new THREE.LatheGeometry(pts, 28);
  }
  const lathe = pts => new THREE.LatheGeometry(pts.map(([r, y]) => v2(r, y)), 32);
  const spindle = (() => {
    const pts = [v2(0, -0.02)];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(v2(0.14 + 0.86 * Math.pow(Math.sin(Math.PI * t), 0.8), t)); }
    pts.push(v2(0, 1.02));
    return new THREE.LatheGeometry(pts, 20);
  })();
  const sphere = new THREE.SphereGeometry(1, 28, 18);
  const torus = new THREE.TorusGeometry(1, 0.09, 8, 36);
  const box = new RoundedBoxGeometry(1, 1, 1, 3, 0.32);
  const mesh = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; group.add(o); return o; };

  // ---------- body ----------
  const chest = mesh(lathe([[0, -0.04], [0.62, 0], [0.86, 0.16], [0.96, 0.46], [1, 0.74], [0.9, 0.94], [0.55, 1.04], [0, 1.07]]), mat.skin);
  const abdomen = mesh(lathe([[0, -0.08], [0.72, 0], [0.96, 0.3], [0.96, 0.7], [0.72, 1], [0, 1.08]]), mat.skin);
  const pelvis = mesh(lathe([[0, -0.12], [0.62, -0.04], [0.95, 0.3], [1, 0.62], [0.86, 0.95], [0, 1.04]]), mat.skin);
  const neck = mesh(capsuleProfile(0.056, 0.047, 0.1), mat.skin);
  const head = new THREE.Group();
  {
    const skull = new THREE.Mesh(sphere, mat.skin); skull.scale.set(0.9, 1.1, 0.98);
    const nose = new THREE.Mesh(sphere, mat.skin); nose.scale.set(0.12, 0.2, 0.14); nose.position.set(0, -0.05, 0.95);
    const brow = new THREE.Mesh(sphere, mat.skin); brow.scale.set(0.62, 0.14, 0.2); brow.position.set(0, 0.18, 0.82);
    const jaw = new THREE.Mesh(sphere, mat.skin); jaw.scale.set(0.62, 0.42, 0.62); jaw.position.set(0, -0.52, 0.28);
    head.add(skull, nose, brow, jaw);
    for (const x of [-0.9, 0.9]) { const ear = new THREE.Mesh(sphere, mat.skin); ear.scale.set(0.1, 0.24, 0.16); ear.position.set(x, 0, -0.02); head.add(ear); }
    head.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(head);
  }
  const limbs = [];
  const joints = [];
  const cuffs = [];
  const hands = [];
  const feet = [];
  const calf = t => 1 + 0.2 * Math.sin(Math.PI * Math.min(1, t / 0.62));
  for (const S of SIDES) {
    limbs.push({ a: S.sh, b: S.el, L0: 0.29, inA: 0.035, inB: 0.026, m: mesh(capsuleProfile(0.05, 0.039, 0.29), mat.skin) });
    limbs.push({ a: S.el, b: S.wr, L0: 0.26, inA: 0.028, inB: 0.02, m: mesh(capsuleProfile(0.042, 0.029, 0.26), mat.skin) });
    limbs.push({ a: S.hip, b: S.kn, L0: 0.43, inA: 0.045, inB: 0.036, m: mesh(capsuleProfile(0.08, 0.052, 0.43), mat.skin) });
    limbs.push({ a: S.kn, b: S.an, L0: 0.42, inA: 0.036, inB: 0.026, m: mesh(capsuleProfile(0.054, 0.034, 0.42, calf), mat.skin) });
    for (const [idx, r] of [[S.sh, 0.054], [S.el, 0.036], [S.wr, 0.026], [S.hip, 0.056], [S.kn, 0.047], [S.an, 0.033]]) {
      const j = mesh(sphere, mat.joint); j.scale.setScalar(r); joints.push({ idx, j });
    }
    for (const [a, b, r] of [[S.el, S.wr, 0.031], [S.kn, S.an, 0.037]]) {
      cuffs.push({ a, b, r, m: mesh(torus, mat[S.s]) });
    }
    hands.push({ S, palm: mesh(box, mat.skin), thumb: mesh(capsuleProfile(0.012, 0.01, 0.045), mat.skin) });
    feet.push({ S, m: mesh(box, mat.skin) });
  }
  // the body's surface, to tell whether a muscle hit by a click lies just under the skin
  const surface = [];
  group.traverse(o => { if (o.isMesh) surface.push(o); });

  // ---------- muscles ----------
  // Each belly runs from point A to point B. Points are [frame, a, b, c]:
  //  limb frames (thigh, shank, uarm, farm, foot): a = fraction along the bone, b = lateral m, c = anterior m
  //  tor: a = lateral m, b = fraction from shoulders (0) to hips (1), c = anterior m
  //  pel / head: a = lateral m, b = up m, c = anterior m
  // w, t = belly width and thickness (m); rot turns the width from lateral (0) toward anterior (90).
  const SPEC = {
    glute_max: [[['pel', 0.05, 0.03, -0.1], ['thigh', 0.22, 0.05, -0.045], 0.15, 0.06, 0]],
    glute_med: [[['pel', 0.13, 0.08, -0.03], ['thigh', 0.02, 0.085, 0], 0.1, 0.035, 90]],
    glute_min: [[['pel', 0.12, 0.05, 0], ['thigh', 0.02, 0.07, 0.02], 0.07, 0.025, 90]],
    tfl: [[['pel', 0.13, 0.04, 0.06], ['thigh', 0.25, 0.075, 0.03], 0.035, 0.025, 70]],
    piriformis: [[['pel', 0.03, 0, -0.09], ['thigh', 0.02, 0.06, -0.02], 0.03, 0.02, 0]],
    iliopsoas: [[['pel', 0.04, 0.16, -0.02], ['thigh', 0.08, -0.02, 0.03], 0.045, 0.035, 0]],
    rectus_femoris: [[['thigh', 0.04, 0, 0.065], ['thigh', 0.98, 0, 0.055], 0.05, 0.035, 0]],
    vastus_lateralis: [[['thigh', 0.1, 0.05, 0.02], ['thigh', 0.95, 0.035, 0.03], 0.055, 0.04, 70]],
    vastus_medialis: [[['thigh', 0.45, -0.035, 0.03], ['thigh', 0.95, -0.04, 0.035], 0.05, 0.04, -60]],
    vastus_intermedius: [[['thigh', 0.15, 0, 0.035], ['thigh', 0.9, 0, 0.035], 0.045, 0.03, 0]],
    sartorius: [[['pel', 0.13, 0.03, 0.07], ['thigh', 0.5, -0.02, 0.07], 0.022, 0.012, 0], [['thigh', 0.5, -0.02, 0.07], ['shank', 0.06, -0.05, 0], 0.022, 0.012, 0]],
    adductor_magnus: [[['pel', 0.03, -0.09, -0.03], ['thigh', 0.85, -0.045, -0.01], 0.06, 0.04, -90]],
    adductor_longus: [[['pel', 0.02, -0.06, 0.04], ['thigh', 0.55, -0.035, 0], 0.04, 0.03, -70]],
    gracilis: [[['pel', 0.015, -0.09, 0.02], ['shank', 0.08, -0.045, -0.005], 0.022, 0.015, -90]],
    biceps_femoris: [[['thigh', 0.05, 0.02, -0.06], ['shank', 0.03, 0.045, -0.02], 0.045, 0.035, 30]],
    semitendinosus: [[['thigh', 0.05, -0.01, -0.065], ['shank', 0.07, -0.045, -0.01], 0.035, 0.03, -20]],
    semimembranosus: [[['thigh', 0.15, -0.02, -0.055], ['shank', 0.03, -0.04, -0.03], 0.04, 0.03, 0]],
    gastrocnemius: [[['thigh', 0.95, -0.03, -0.035], ['shank', 0.55, -0.01, -0.05], 0.04, 0.035, 0], [['thigh', 0.95, 0.03, -0.035], ['shank', 0.5, 0.012, -0.05], 0.04, 0.035, 0]],
    soleus: [[['shank', 0.15, 0, -0.03], ['shank', 0.85, 0, -0.03], 0.055, 0.03, 0]],
    tibialis_anterior: [[['shank', 0.08, 0.025, 0.03], ['shank', 0.8, 0, 0.035], 0.028, 0.025, 30]],
    fibularis_longus: [[['shank', 0.05, 0.045, 0], ['shank', 0.75, 0.04, -0.005], 0.024, 0.02, 90]],
    tibialis_posterior: [[['shank', 0.15, 0, -0.01], ['shank', 0.85, -0.02, -0.01], 0.025, 0.02, 0]],
    foot_intrinsic: [[['foot', 0.15, 0, 0], ['foot', 0.85, 0, 0], 0.05, 0.015, 0]],
    rectus_abdominis: [[['tor', 0.04, 0.38, 0.1], ['pel', 0.02, -0.04, 0.085], 0.055, 0.02, 0]],
    external_oblique: [[['tor', 0.12, 0.45, 0.06], ['pel', 0.07, 0.04, 0.09], 0.07, 0.02, 50]],
    internal_oblique: [[['pel', 0.13, 0.07, 0], ['tor', 0.08, 0.6, 0.085], 0.06, 0.018, 50]],
    transversus_abdominis: [[['tor', 0.13, 0.62, 0], ['tor', 0.03, 0.75, 0.09], 0.12, 0.015, 0]],
    erector_spinae: [[['pel', 0.035, 0, -0.09], ['tor', 0.035, 0, -0.08], 0.04, 0.035, 0]],
    multifidus: [[['pel', 0.015, 0, -0.09], ['tor', 0.015, 0.45, -0.085], 0.02, 0.02, 0]],
    quadratus_lumborum: [[['pel', 0.07, 0.07, -0.05], ['tor', 0.06, 0.78, -0.05], 0.035, 0.025, 0]],
    latissimus_dorsi: [[['pel', 0.06, 0.1, -0.09], ['tor', 0.13, 0.55, -0.08], 0.1, 0.02, 0], [['tor', 0.13, 0.55, -0.08], ['uarm', 0.1, -0.02, -0.01], 0.06, 0.02, 0]],
    trapezius_upper: [[['head', 0.02, -0.06, -0.06], ['tor', 0.13, -0.02, -0.01], 0.05, 0.025, 0]],
    trapezius_middle: [[['tor', 0.02, 0.12, -0.1], ['tor', 0.15, 0.03, -0.06], 0.06, 0.018, 0]],
    trapezius_lower: [[['tor', 0.02, 0.6, -0.095], ['tor', 0.08, 0.15, -0.095], 0.06, 0.016, 0]],
    rhomboids: [[['tor', 0.02, 0.15, -0.095], ['tor', 0.075, 0.3, -0.09], 0.045, 0.015, 0]],
    teres_major: [[['tor', 0.11, 0.38, -0.085], ['uarm', 0.12, -0.015, -0.01], 0.03, 0.025, 0]],
    pectoralis_major: [[['tor', 0.04, 0.18, 0.11], ['uarm', 0.1, 0.015, 0.02], 0.1, 0.025, 0]],
    pectoralis_minor: [[['tor', 0.07, 0.32, 0.1], ['tor', 0.12, 0.04, 0.06], 0.04, 0.015, 0]],
    serratus_anterior: [[['tor', 0.14, 0.45, 0.04], ['tor', 0.12, 0.2, -0.04], 0.05, 0.015, 90]],
    deltoid_anterior: [[['tor', 0.14, 0.02, 0.05], ['uarm', 0.42, 0.03, 0.02], 0.04, 0.03, 0]],
    deltoid_middle: [[['tor', 0.19, 0, 0], ['uarm', 0.42, 0.04, 0], 0.04, 0.03, 90]],
    deltoid_posterior: [[['tor', 0.15, 0.03, -0.06], ['uarm', 0.42, 0.03, -0.02], 0.04, 0.03, 0]],
    supraspinatus: [[['tor', 0.07, 0.06, -0.08], ['uarm', 0, 0.04, 0], 0.03, 0.02, 0]],
    infraspinatus: [[['tor', 0.08, 0.22, -0.095], ['uarm', 0.03, 0.03, -0.03], 0.06, 0.02, 0]],
    teres_minor: [[['tor', 0.11, 0.3, -0.09], ['uarm', 0.05, 0.03, -0.03], 0.025, 0.02, 0]],
    subscapularis: [[['tor', 0.08, 0.2, -0.07], ['uarm', 0.03, -0.02, 0.02], 0.05, 0.02, 0]],
    biceps_brachii: [[['uarm', 0.1, 0, 0.035], ['farm', 0.12, 0, 0.02], 0.04, 0.035, 0]],
    brachialis: [[['uarm', 0.5, 0, 0.02], ['farm', 0.1, 0, 0.015], 0.04, 0.025, 0]],
    triceps_brachii: [[['uarm', 0.05, 0, -0.035], ['farm', 0, 0, -0.03], 0.045, 0.035, 0]],
    brachioradialis: [[['uarm', 0.75, 0.035, 0], ['farm', 0.95, 0.025, 0.01], 0.025, 0.02, 60]],
    forearm_flexors: [[['farm', 0.05, -0.03, 0.01], ['farm', 0.85, -0.005, 0.015], 0.035, 0.025, -30]],
    forearm_extensors: [[['farm', 0.05, 0.03, -0.005], ['farm', 0.85, 0.01, -0.015], 0.035, 0.025, 30]],
    sternocleidomastoid: [[['tor', 0.02, -0.02, 0.07], ['head', 0.06, -0.05, -0.01], 0.025, 0.02, 0]],
    splenius_capitis: [[['tor', 0, 0.06, -0.06], ['head', 0.05, -0.04, -0.05], 0.03, 0.015, 0]],
  };
  const deepIds = new Set((window.KINEMA_MUSCLES || []).filter(m => m.deep).map(m => m.id));
  const bellies = [];
  for (const [id, list] of Object.entries(SPEC)) {
    for (const S of SIDES) {
      list.forEach((spec, k) => {
        const m = new THREE.Mesh(spindle, mat.muscle);
        m.userData = { id, side: S.s, deep: deepIds.has(id), k };
        m.visible = false;
        group.add(m);
        bellies.push({ m, spec, side: S.s });
      });
    }
  }

  // ---------- frames ----------
  const V = () => new THREE.Vector3();
  const limbFrame = () => ({ o: V(), y: V(), z: V(), lat: V(), len: 1 });
  const frames = {};
  for (const S of SIDES) frames[S.s] = { latRef: V(), latHead: V(), thigh: limbFrame(), shank: limbFrame(), foot: limbFrame(), uarm: limbFrame(), farm: limbFrame() };
  const T = { hipMid: V(), shMid: V(), headC: V(), up: V(), pelX: V(), fwd: V(), hx: V(), hup: V(), hz: V(), torsoLen: 0.5, shW: 0.36, hipW: 0.2, earW: 0.15 };
  const tA = V(), tB = V(), tC = V(), tD = V(), tW = V(), tN = V(), tZ = V(), tL = V();
  const Y_AXIS = new THREE.Vector3(0, 1, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
  const M4 = new THREE.Matrix4();

  function orient(F, origin, end, zRef, latRef) {
    F.o.copy(origin);
    F.y.subVectors(end, origin);
    F.len = F.y.length() || 1e-3;
    F.y.divideScalar(F.len);
    F.z.copy(zRef).addScaledVector(F.y, -zRef.dot(F.y));
    if (F.z.lengthSq() < 1e-8) F.z.copy(T.fwd).addScaledVector(F.y, -T.fwd.dot(F.y));
    F.z.normalize();
    F.lat.crossVectors(F.y, F.z).normalize();
    if (F.lat.dot(latRef) < 0) F.lat.negate();
  }

  function computeFrames(P) {
    T.hipMid.addVectors(P[LM.lHip], P[LM.rHip]).multiplyScalar(0.5);
    T.shMid.addVectors(P[LM.lSh], P[LM.rSh]).multiplyScalar(0.5);
    T.headC.addVectors(P[LM.lEar], P[LM.rEar]).multiplyScalar(0.5);
    T.up.subVectors(T.shMid, T.hipMid);
    T.torsoLen = T.up.length() || 0.5;
    T.up.normalize();
    T.shW = P[LM.lSh].distanceTo(P[LM.rSh]);
    T.hipW = P[LM.lHip].distanceTo(P[LM.rHip]);
    T.pelX.subVectors(P[LM.lSh], P[LM.rSh]).add(tA.subVectors(P[LM.lHip], P[LM.rHip]));
    T.pelX.addScaledVector(T.up, -T.pelX.dot(T.up)).normalize();
    T.fwd.crossVectors(T.pelX, T.up).normalize();
    T.hx.subVectors(P[LM.lEar], P[LM.rEar]);
    T.earW = T.hx.length();
    T.hx.normalize();
    T.hup.subVectors(T.headC, T.shMid).normalize();
    T.hz.crossVectors(T.hx, T.hup).normalize();
    T.hup.crossVectors(T.hz, T.hx).normalize();
    for (const S of SIDES) {
      const F = frames[S.s];
      F.latRef.copy(T.pelX).multiplyScalar(S.sgn);
      F.latHead.copy(T.hx).multiplyScalar(S.sgn);
      tA.subVectors(P[S.ft], P[S.heel]).normalize();
      orient(F.shank, P[S.kn], P[S.an], tA, F.latRef);
      // the thigh's front follows the knee bend once the knee is flexed, otherwise the shin
      tB.subVectors(P[S.kn], P[S.hip]).normalize();
      tC.copy(F.shank.y).addScaledVector(tB, -F.shank.y.dot(tB));
      const w = Math.min(1, tC.length() * 2);
      tC.normalize().negate().multiplyScalar(w).addScaledVector(F.shank.z, 1 - w);
      orient(F.thigh, P[S.hip], P[S.kn], tC, F.latRef);
      tD.copy(F.shank.y).negate();
      orient(F.foot, P[S.heel], P[S.ft], tD, F.latRef);
      // the upper arm's front is where the forearm bends to; with a straight elbow use the chest
      tB.subVectors(P[S.el], P[S.sh]).normalize();
      tC.subVectors(P[S.wr], P[S.el]).normalize();
      tC.addScaledVector(tB, -tC.dot(tB));
      const wa = Math.min(1, tC.length() * 2);
      tC.normalize().multiplyScalar(wa).addScaledVector(T.fwd, 1 - wa);
      orient(F.uarm, P[S.sh], P[S.el], tC, F.latRef);
      orient(F.farm, P[S.el], P[S.wr], F.uarm.z, F.latRef);
    }
  }

  function pointAt(out, side, [fr, a, b, c]) {
    const F = frames[side];
    if (fr === 'pel') return out.copy(T.hipMid).addScaledVector(F.latRef, a).addScaledVector(T.up, b).addScaledVector(T.fwd, c);
    if (fr === 'tor') return out.copy(T.shMid).addScaledVector(F.latRef, a).addScaledVector(T.up, -b * T.torsoLen).addScaledVector(T.fwd, c);
    if (fr === 'head') return out.copy(T.headC).addScaledVector(F.latHead, a).addScaledVector(T.hup, b).addScaledVector(T.hz, c);
    const L = F[fr];
    return out.copy(L.o).addScaledVector(L.y, a * L.len).addScaledVector(L.lat, b).addScaledVector(L.z, c);
  }
  function anteriorOf(side, fr) {
    if (fr === 'pel' || fr === 'tor') return T.fwd;
    if (fr === 'head') return T.hz;
    return frames[side][fr].z;
  }

  function placeBelly(m, A, B, refZ, lat, w, t, rot) {
    tD.subVectors(B, A);
    const L = tD.length();
    if (L < 1e-4) { m.visible = false; return; }
    tD.divideScalar(L);
    tZ.copy(refZ).addScaledVector(tD, -refZ.dot(tD));
    if (tZ.lengthSq() < 1e-8) tZ.copy(T.fwd);
    tZ.normalize();
    tL.copy(lat).addScaledVector(tD, -lat.dot(tD)).normalize();
    const r = rot * Math.PI / 180;
    tW.copy(tL).multiplyScalar(Math.cos(r)).addScaledVector(tZ, Math.sin(r)).normalize();
    tN.crossVectors(tW, tD);
    M4.makeBasis(tW, tD, tN);
    m.quaternion.setFromRotationMatrix(M4);
    m.position.copy(A);
    m.scale.set(w / 2, L, t / 2);
  }

  function placeTorsoPart(m, bottom, height, halfW, halfD) {
    M4.makeBasis(T.pelX, T.up, T.fwd);
    m.quaternion.setFromRotationMatrix(M4);
    m.position.copy(bottom);
    m.scale.set(halfW, height, halfD);
  }

  function placeLimb(m, A, B, L0, inA, inB) {
    tD.subVectors(B, A);
    const L = tD.length();
    if (L < 1e-4) return;
    tD.divideScalar(L);
    const span = Math.max(0.01, L - inA - inB);
    m.position.copy(A).addScaledVector(tD, inA);
    m.quaternion.setFromUnitVectors(Y_AXIS, tD);
    m.scale.set(1, span / L0, 1);
  }

  // ---------- public ----------
  let showMuscles = false;
  let focus = {};
  let hoverId = null;
  // estimated output per muscle, { id: { level 0–1, mode 'push' | 'brake' } }, shown as colour; null = off
  let output = null;
  const heat = {};
  const HEAT = { rest: new THREE.Color(0xe8c7c2), push: new THREE.Color(0xff4d1a), brake: new THREE.Color(0x2f6fff) };
  const heatMat = id => (heat[id] ||= new THREE.MeshStandardMaterial({ roughness: 0.45, transparent: true }));
  function refresh() {
    const any = Object.keys(focus).length > 0;
    const muscles = showMuscles || any || !!output;
    // keep the body readable around highlighted muscles; go fainter only when every muscle is shown
    mat.skin.opacity = !muscles ? 1 : any || output ? 0.4 : 0.22;
    mat.skin.depthWrite = !muscles;
    mat.joint.opacity = muscles ? 0.45 : 1;
    mat.joint.depthWrite = !muscles;
    for (const { m } of bellies) {
      const role = focus[m.userData.id];
      // output colours take over from the advice's colours; picked muscles stay blue
      if (output && role !== 'select') {
        const o = output[m.userData.id];
        m.visible = !m.userData.deep || !!o;
        m.castShadow = false;
        if (o && o.level > 0.02) {
          const hm = heatMat(m.userData.id);
          hm.color.copy(HEAT.rest).lerp(o.mode === 'brake' ? HEAT.brake : HEAT.push, Math.min(1, 0.25 + 0.75 * o.level));
          hm.emissive.copy(hm.color).multiplyScalar(0.15 + 0.45 * o.level);
          hm.opacity = 0.55 + 0.45 * o.level;
          m.material = hm;
        } else {
          m.material = mat.faded;
        }
        continue;
      }
      m.visible = muscles && (!m.userData.deep || !!role);
      m.material = role ? roleMat[role] : m.userData.id === hoverId ? mat.hover : any ? mat.faded : mat.muscle;
      m.castShadow = !!role || (muscles && !any);
    }
  }
  refresh();

  function update(P) {
    computeFrames(P);
    placeTorsoPart(chest, tA.copy(T.shMid).addScaledVector(T.up, -T.torsoLen * 0.68), T.torsoLen * 0.64, Math.max(0.13, T.shW * 0.47), 0.105);
    placeTorsoPart(abdomen, tA.copy(T.hipMid).addScaledVector(T.up, T.torsoLen * 0.17), T.torsoLen * 0.2, 0.122, 0.088);
    placeTorsoPart(pelvis, tA.copy(T.hipMid).addScaledVector(T.up, -0.085), 0.17, Math.max(0.14, T.hipW * 0.82), 0.1);
    const hr = Math.min(0.115, Math.max(0.085, T.earW * 0.62));
    // MediaPipe's ear line sits high; drop the head a little so the neck doesn't look stretched
    tC.copy(T.headC).addScaledVector(T.hup, -hr * 0.22);
    tB.copy(tC).addScaledVector(T.hup, -hr * 0.55);
    placeLimb(neck, tA.copy(T.shMid).addScaledVector(T.up, -0.03), tB, 0.1, 0, 0);
    M4.makeBasis(T.hx, T.hup, T.hz);
    head.quaternion.setFromRotationMatrix(M4);
    head.position.copy(tC);
    head.scale.setScalar(hr);
    for (const l of limbs) placeLimb(l.m, P[l.a], P[l.b], l.L0, l.inA, l.inB);
    for (const { idx, j } of joints) j.position.copy(P[idx]);
    for (const c of cuffs) {
      tD.subVectors(P[c.b], P[c.a]).normalize();
      c.m.position.copy(P[c.a]).lerp(P[c.b], 0.86);
      c.m.quaternion.setFromUnitVectors(Z_AXIS, tD);
      c.m.scale.setScalar(c.r);
    }
    for (const h of hands) {
      const F = frames[h.S.s];
      tD.subVectors(P[h.S.idx], P[h.S.wr]);
      const len = Math.max(0.05, tD.length());
      tD.normalize();
      tW.copy(F.farm.lat).addScaledVector(tD, -F.farm.lat.dot(tD)).normalize();
      tN.crossVectors(tW, tD);
      M4.makeBasis(tW, tD, tN);
      h.palm.quaternion.setFromRotationMatrix(M4);
      h.palm.position.copy(P[h.S.wr]).addScaledVector(tD, len * 0.62);
      h.palm.scale.set(0.072, len * 1.15, 0.032);
      tA.copy(P[h.S.wr]).addScaledVector(tD, 0.02).addScaledVector(tW, -0.022);
      placeLimb(h.thumb, tA, P[h.S.th], 0.045, 0, 0);
    }
    for (const f of feet) {
      const F = frames[f.S.s].foot;
      tW.copy(F.lat);
      tN.crossVectors(tW, F.y); // keep the basis right-handed on both sides
      M4.makeBasis(tW, F.y, tN);
      f.m.quaternion.setFromRotationMatrix(M4);
      f.m.scale.set(0.085, F.len * 1.18, 0.07);
      f.m.position.copy(F.o).addScaledVector(F.y, F.len * 0.5).addScaledVector(F.z, 0.03);
    }
    // hidden bellies are placed too, so a click can find the muscle under the skin
    for (const b of bellies) {
      const [A, B, w, t, rot] = b.spec;
      pointAt(tA, b.side, A);
      pointAt(tB, b.side, B);
      placeBelly(b.m, tA, tB, anteriorOf(b.side, A[0]), frames[b.side].latRef, w, t, rot);
    }
  }

  return {
    group,
    update,
    ids: Object.keys(SPEC),
    setMuscles(on) { showMuscles = on; refresh(); },
    setFocus(map) { focus = map || {}; refresh(); },
    tick(time) {
      const k = 0.28 + 0.22 * Math.sin(time * 4);
      for (const m of Object.values(roleMat)) m.emissiveIntensity = k;
    },
    // the muscle under the pointer: any surface muscle, highlighted, faded or hidden, as long as it lies just under
    // the skin the ray meets first (not on the far side of the body); a highlighted one can be picked through the body
    pick(raycaster) {
      const hits = raycaster.intersectObjects(bellies.filter(b => !b.m.userData.deep || b.m.visible).map(b => b.m), false);
      const skin = raycaster.intersectObjects(surface, false);
      const near = skin.length ? skin[0].distance + 0.06 : Infinity;
      const hit = hits.find(h => h.distance <= near || focus[h.object.userData.id]);
      return hit ? hit.object.userData : null;
    },
    setHover(id) {
      if (id === hoverId) return;
      hoverId = id;
      refresh();
    },
    setOutput(map) {
      if (!map && !output) return;
      output = map;
      refresh();
    },
    // centre of a muscle's first belly on each side, for labels
    centers(id) {
      return bellies.filter(b => b.m.userData.id === id && b.m.userData.k === 0).map(b => {
        const [A, B] = b.spec;
        return { side: b.side, pos: pointAt(V(), b.side, A).lerp(pointAt(V(), b.side, B), 0.5) };
      });
    },
  };
};
