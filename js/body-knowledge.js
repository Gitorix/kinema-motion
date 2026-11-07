// What KINEMA knows about the human body, apart from any sport: which joint moves how, which muscles do it, what holds the
// trunk steady, and how much of this a video can show. The muscles themselves are in muscles.js (ids below refer to them,
// or to EXTRA_MUSCLES here). Nothing reads this yet: it is the base for analysing movements in general.
//
// rom: 参考可動域 in degrees. These are reference values, not limits of normal: they vary with age, sex and the person.
// romChecked: true when the value was confirmed against a source while this file was written; false when it comes from
//   memory of the same table and the original could not be read. Check those before showing them as fact.
// measure: what 33 pose points from one video can show. good = measure it; partly = only from a suitable angle, or roughly;
//   no = do not report a number.
window.KINEMA_BODY = (() => {
  const HAMSTRINGS = ['biceps_femoris', 'semitendinosus', 'semimembranosus'];
  const VASTI = ['vastus_lateralis', 'vastus_medialis', 'vastus_intermedius'];

  // in the 3D atlas (anatomy-data.js, `atlas` is its English name) but missing from the 54 of muscles.js
  const EXTRA_MUSCLES = [
    { id: 'diaphragm', ja: '横隔膜', atlas: ['diaphragm'], action: '呼吸の主役。腹圧を上から高める' },
    { id: 'pelvic_floor', ja: '骨盤底筋群', atlas: ['pubococcygeus', 'iliococcygeus', 'coccygeus'], action: '骨盤の底を支え、腹圧を下から受け止める' },
    { id: 'intercostals', ja: '肋間筋', atlas: ['external intercostal muscle', 'internal intercostal muscle'], action: '肋骨を動かして呼吸を助ける' },
    { id: 'pronator_teres', ja: '円回内筋', atlas: ['humeral head of pronator teres', 'ulnar head of pronator teres'], action: '前腕の回内' },
    { id: 'pronator_quadratus', ja: '方形回内筋', atlas: ['pronator quadratus'], action: '前腕の回内' },
    { id: 'supinator', ja: '回外筋', atlas: ['supinator'], action: '前腕の回外' },
    { id: 'coracobrachialis', ja: '烏口腕筋', action: '肩関節の屈曲・内転' },
    { id: 'levator_scapulae', ja: '肩甲挙筋', action: '肩甲骨の挙上・下方回旋' },
    { id: 'pectineus', ja: '恥骨筋', action: '股関節の屈曲・内転' },
    { id: 'deep_rotators', ja: '深層外旋筋（内閉鎖筋など）', action: '股関節の外旋、大腿骨頭の安定' },
    { id: 'popliteus', ja: '膝窩筋', action: '膝関節の内旋、曲げ始めのロック解除' },
    { id: 'fibularis_brevis', ja: '短腓骨筋', action: '足の外がえし' },
    { id: 'extensor_digitorum_longus', ja: '長趾伸筋', action: '足指の伸展、足関節の背屈' },
  ];

  const mv = (id, ja, plane, rom, romChecked, prime, assist, measure, note = '') => ({ id, ja, plane, rom, romChecked, prime, assist, measure, note });
  const S = '矢状面', F = '前額面', T = '水平面';

  const JOINTS = [
    { id: 'scapula', ja: '肩甲帯', type: '肩甲骨が胸郭の上を滑る（肩甲胸郭関節）', moves: [
      mv('protract', '外転（前に出す）', T, 20, false, ['serratus_anterior', 'pectoralis_minor'], [], 'no', '学会の表では「屈曲」'),
      mv('retract', '内転（寄せる）', T, 20, false, ['trapezius_middle', 'rhomboids'], [], 'no', '学会の表では「伸展」'),
      mv('elevate', '挙上', F, 20, false, ['trapezius_upper', 'levator_scapulae'], ['rhomboids'], 'partly', '耳と肩の距離でおおよそ'),
      mv('depress', '下制', F, 10, false, ['trapezius_lower', 'pectoralis_minor'], ['latissimus_dorsi'], 'partly', '耳と肩の距離でおおよそ'),
      mv('rotate_up', '上方回旋', F, null, false, ['serratus_anterior', 'trapezius_upper', 'trapezius_lower'], [], 'no', '腕を上げるときに起きる'),
      mv('rotate_down', '下方回旋', F, null, false, ['rhomboids', 'levator_scapulae', 'pectoralis_minor'], [], 'no'),
    ] },
    { id: 'shoulder', ja: '肩関節', type: '球関節', moves: [
      mv('flex', '屈曲', S, 180, true, ['deltoid_anterior', 'pectoralis_major'], ['coracobrachialis', 'biceps_brachii'], 'good', '肩甲骨の動きも含む'),
      mv('extend', '伸展', S, 50, true, ['latissimus_dorsi', 'teres_major', 'deltoid_posterior'], ['triceps_brachii'], 'good'),
      mv('abduct', '外転', F, 180, true, ['deltoid_middle', 'supraspinatus'], ['deltoid_anterior'], 'good', '肩甲骨の動きも含む'),
      mv('adduct', '内転', F, 0, true, ['pectoralis_major', 'latissimus_dorsi', 'teres_major'], ['coracobrachialis', 'triceps_brachii'], 'good'),
      mv('rotate_out', '外旋', T, 60, true, ['infraspinatus', 'teres_minor'], ['deltoid_posterior'], 'partly', '肘が曲がっているときだけ読める'),
      mv('rotate_in', '内旋', T, 80, true, ['subscapularis', 'pectoralis_major', 'latissimus_dorsi', 'teres_major'], ['deltoid_anterior'], 'partly', '肘が曲がっているときだけ読める'),
      mv('h_flex', '水平屈曲', T, 135, true, ['pectoralis_major', 'deltoid_anterior'], ['coracobrachialis'], 'partly', '奥行きの精度に左右される'),
      mv('h_extend', '水平伸展', T, 30, true, ['deltoid_posterior', 'infraspinatus', 'teres_minor'], ['rhomboids', 'trapezius_middle'], 'partly', '奥行きの精度に左右される'),
    ] },
    { id: 'elbow', ja: '肘関節', type: '蝶番関節', moves: [
      mv('flex', '屈曲', S, 145, false, ['biceps_brachii', 'brachialis', 'brachioradialis'], [], 'good'),
      mv('extend', '伸展', S, 5, false, ['triceps_brachii'], [], 'good'),
    ] },
    { id: 'forearm', ja: '前腕', type: '車軸関節（橈尺関節）', moves: [
      mv('pronate', '回内', T, 90, false, ['pronator_teres', 'pronator_quadratus'], ['brachioradialis'], 'no', '手首の点だけではひねりが分からない'),
      mv('supinate', '回外', T, 90, false, ['supinator', 'biceps_brachii'], ['brachioradialis'], 'no', '手首の点だけではひねりが分からない'),
    ] },
    { id: 'wrist', ja: '手関節', type: '楕円関節', moves: [
      mv('flex', '屈曲（掌屈）', S, 90, false, ['forearm_flexors'], [], 'partly', '手の点が小さく揺れやすい'),
      mv('extend', '伸展（背屈）', S, 70, false, ['forearm_extensors'], [], 'partly', '手の点が小さく揺れやすい'),
      mv('radial', '橈屈', F, 25, false, ['forearm_flexors', 'forearm_extensors'], [], 'no'),
      mv('ulnar', '尺屈', F, 55, false, ['forearm_flexors', 'forearm_extensors'], [], 'no'),
    ] },
    { id: 'hip', ja: '股関節', type: '球関節', moves: [
      mv('flex', '屈曲', S, 125, true, ['iliopsoas', 'rectus_femoris'], ['tfl', 'sartorius', 'adductor_longus', 'pectineus'], 'good', '骨盤の傾きと区別できない'),
      mv('extend', '伸展', S, 15, true, ['glute_max', ...HAMSTRINGS], ['adductor_magnus'], 'good', '骨盤の傾きと区別できない'),
      mv('abduct', '外転', F, 45, true, ['glute_med', 'glute_min'], ['tfl', 'sartorius'], 'partly', '正面の動画で'),
      mv('adduct', '内転', F, 20, true, ['adductor_magnus', 'adductor_longus'], ['gracilis', 'pectineus'], 'partly', '正面の動画で'),
      mv('rotate_out', '外旋', T, 45, true, ['glute_max', 'piriformis', 'deep_rotators'], ['sartorius', 'biceps_femoris'], 'no'),
      mv('rotate_in', '内旋', T, 45, true, ['glute_min', 'tfl'], ['glute_med', 'semitendinosus', 'semimembranosus'], 'no'),
    ] },
    { id: 'knee', ja: '膝関節', type: '蝶番関節（曲げるとわずかに回旋）', moves: [
      mv('flex', '屈曲', S, 130, false, [...HAMSTRINGS], ['gastrocnemius', 'gracilis', 'sartorius', 'popliteus'], 'good', '正面の動画では少なく読める'),
      mv('extend', '伸展', S, 0, false, [...VASTI, 'rectus_femoris'], [], 'good'),
      mv('rotate_out', '外旋', T, null, false, ['biceps_femoris'], [], 'no', '曲げているときだけ起きる'),
      mv('rotate_in', '内旋', T, null, false, ['semitendinosus', 'semimembranosus', 'popliteus'], ['gracilis', 'sartorius'], 'no', '曲げているときだけ起きる'),
    ] },
    { id: 'ankle', ja: '足関節', type: '蝶番関節（距腿関節）', moves: [
      mv('plantar', '底屈（屈曲）', S, 45, true, ['gastrocnemius', 'soleus'], ['tibialis_posterior', 'fibularis_longus'], 'partly', 'かかと・つま先の点が揺れやすい'),
      mv('dorsi', '背屈（伸展）', S, 20, true, ['tibialis_anterior'], ['extensor_digitorum_longus'], 'partly', 'かかと・つま先の点が揺れやすい'),
    ] },
    { id: 'foot', ja: '足部', type: '距骨下関節など', moves: [
      mv('invert', '内がえし', F, 30, false, ['tibialis_posterior', 'tibialis_anterior'], [], 'no'),
      mv('evert', '外がえし', F, 20, false, ['fibularis_longus'], ['fibularis_brevis'], 'no'),
      mv('arch', 'アーチの保持', '—', null, false, ['foot_intrinsic', 'tibialis_posterior', 'fibularis_longus'], [], 'no', '関節を大きく動かさない働き'),
    ] },
    { id: 'neck', ja: '頸部', type: '背骨の連なり', moves: [
      mv('flex', '屈曲', S, 60, false, ['sternocleidomastoid'], [], 'partly', '耳と鼻の点でおおよそ'),
      mv('extend', '伸展', S, 50, false, ['splenius_capitis'], ['trapezius_upper'], 'partly', '耳と鼻の点でおおよそ'),
      mv('rotate', '回旋（左右）', T, 60, false, ['sternocleidomastoid', 'splenius_capitis'], [], 'partly', '胸鎖乳突筋は反対側へ、頭板状筋は同じ側へ回す'),
      mv('side', '側屈（左右）', F, 50, false, ['sternocleidomastoid', 'splenius_capitis'], ['levator_scapulae'], 'partly'),
    ] },
    { id: 'trunk', ja: '胸腰部', type: '背骨の連なり', moves: [
      mv('flex', '屈曲', S, 45, true, ['rectus_abdominis', 'external_oblique', 'internal_oblique'], [], 'partly', '肩と腰の点だけなので、体幹全体の傾きしか分からず、背骨の曲がりと前傾を区別できない'),
      mv('extend', '伸展', S, 30, true, ['erector_spinae', 'multifidus'], ['quadratus_lumborum'], 'partly', '同上'),
      mv('rotate', '回旋（左右）', T, 40, true, ['external_oblique', 'internal_oblique'], ['multifidus'], 'partly', '肩と腰の向きの差。外腹斜筋は反対側へ、内腹斜筋は同じ側へ回す'),
      mv('side', '側屈（左右）', F, 50, true, ['quadratus_lumborum', 'external_oblique', 'internal_oblique'], ['erector_spinae'], 'partly', '正面の動画で'),
    ] },
    { id: 'pelvis', ja: '骨盤', type: '関節ではなく、腰と股関節の動きの組み合わせ', moves: [
      mv('tilt_front', '前傾', S, null, false, ['iliopsoas', 'erector_spinae'], ['rectus_femoris'], 'no', '腰の点は左右2つだけで、横から見ると1点に重なる'),
      mv('tilt_back', '後傾', S, null, false, ['glute_max', 'rectus_abdominis'], [...HAMSTRINGS], 'no', '腰の点は左右2つだけで、横から見ると1点に重なる'),
      mv('drop', '左右の傾き', F, null, false, ['glute_med', 'glute_min', 'quadratus_lumborum'], [], 'partly', '正面の動画で、左右の腰の高さの差'),
    ] },
  ];

  // Muscles that cross two joints: one contraction does two things at once, and one joint's position changes the other's force.
  const TWO_JOINT = {
    rectus_femoris: ['hip', 'knee'], biceps_femoris: ['hip', 'knee'], semitendinosus: ['hip', 'knee'], semimembranosus: ['hip', 'knee'],
    gastrocnemius: ['knee', 'ankle'], gracilis: ['hip', 'knee'], sartorius: ['hip', 'knee'], biceps_brachii: ['shoulder', 'elbow'], triceps_brachii: ['shoulder', 'elbow'],
  };

  // What moves nothing and still produces force. `evidence`: agreed = broadly accepted; supported = shown in some studies;
  // debated = researchers disagree, so say so if it is ever shown.
  const TRUNK = {
    stabilitySystem: {
      summary: '背骨の安定は、骨や靱帯（受け身の支え）、筋肉（力）、神経（制御）の3つで保たれる。安定に必要な筋肉の働きは動作によって変わる。',
      source: 'panjabi',
      evidence: 'agreed',
      local: { ja: '局所の筋（背骨に直接付き、節ごとの硬さを保つ）', muscles: ['multifidus', 'transversus_abdominis', 'quadratus_lumborum', 'iliopsoas'] },
      global: { ja: '全体の筋（骨盤と胸郭をつなぎ、大きな動きと力を出す）', muscles: ['rectus_abdominis', 'external_oblique', 'internal_oblique', 'erector_spinae'] },
      note: '局所と全体は対立するものではなく、どちらか片方だけでは安定を保てない。',
    },
    pressure: {
      ja: '腹圧（腹腔内圧）',
      chamber: { top: ['diaphragm'], bottom: ['pelvic_floor'], walls: ['transversus_abdominis', 'internal_oblique', 'external_oblique', 'rectus_abdominis'], back: ['multifidus', 'erector_spinae', 'quadratus_lumborum'] },
      effects: [
        { ja: '腹圧が上がると腰椎が硬くなり、安定する', evidence: 'supported', source: ['cholewicki1999', 'hodges2005'] },
        { ja: '腹圧だけで体幹を伸ばす力が増える（横隔膜の電気刺激での実験）', evidence: 'supported', source: ['hodges2001'] },
        { ja: '腹圧が高いと、背骨の圧迫力が減る（計算モデル。5→10 kPaで約21%）', evidence: 'supported', source: ['stokes2010'] },
        { ja: '腹圧を上げると股関節を伸ばす最大トルクが増える（息を吸って止めると約298 N·m、吐いて止めると約266 N·m）。股関節の屈曲、膝の曲げ伸ばしでは差なし', evidence: 'supported', source: ['tayashiki2017', 'tayashiki2018'] },
        { ja: '腹圧が力を生んでいるのか、筋肉が働いた結果として上がるだけなのかは、まだ切り分けられていない', evidence: 'debated', source: ['stokes2010', 'blazek2019'] },
      ],
      byExercise: { ja: '高負荷での腹圧の報告値：スクワットで200 mmHg超、ベンチプレスは79±44 mmHgと最も低い', source: 'blazek2019' },
    },
    anticipation: [
      { ja: '手足を動かす直前に、体幹の筋肉が先に働く', evidence: 'agreed', source: 'hodges1997' },
      { ja: '腹横筋が左右同時に先に働くことが安定の鍵、という説', evidence: 'debated', source: 'allison2008', note: '腕の動きと反対側で強く働くなど、方向によって変わるという報告がある' },
    ],
    breathing: { muscles: ['diaphragm', 'intercostals'], ja: '横隔膜と腹横筋は、手足を動かしている間も姿勢のために働き続け、その上に呼吸のリズムが重なる。骨盤底筋は腹圧そのものより腹部の筋肉の活動に合わせて変化する', evidence: 'supported', source: ['hodgesGandevia2000', 'hodgesPelvicFloor'] },
    techniques: [
      { ja: 'ブレーシング（お腹全体を固める）', detail: 'モデル研究では安定性が約32%上がるが、腰椎の圧迫も約15%増える', evidence: 'debated', source: 'grenier2007' },
      { ja: 'ドローイン（お腹をへこませる）', detail: '軽い負荷で深い筋肉を使う練習には向くという報告があるが、どちらが優れるかは目的と場面によって異なる', evidence: 'debated', source: 'hollowingReview2024' },
    ],
    caution: { ja: '息を止めて力むと血圧が大きく上がり、運動後のふらつきにつながることがある。高血圧の人や医師に止められている人には勧めない。健康上のリスクの大きさ自体は確定していない', source: 'hackett2013' },
    video: {
      canMeasure: ['肩と腰を結ぶ線の傾きとぶれ', '正面の動画での左右の腰の高さの差', '肩と腰の向きの差（ひねり）'],
      cannotMeasure: ['腹圧', '筋肉が働いているかどうか', '呼吸', '肋骨の開き', '背骨の節ごとの動き', '横から見た骨盤の傾き'],
      rule: '腹圧や体幹の筋力を動画から数値で示さない。測ったのは「体幹がどれだけぶれたか」までで、腹圧の代わりになるという根拠は見つかっていない。',
      accuracy: { ja: '2D動画の正面の測定は3Dとの相関が体幹 r=0.81〜0.92、骨盤 r=0.54〜0.73。骨盤は個々の測定の誤差が大きい（一致限界 −12.8〜21.3°）', source: 'video2022' },
    },
  };

  const SOURCES = {
    rom: { ja: '日本整形外科学会・日本リハビリテーション医学会ほか「関節可動域表示ならびに測定法」（2022年4月改訂）', url: 'https://www.jarm.or.jp/member/document/kadou/03.pdf' },
    panjabi: { ja: 'Panjabi 1992（背骨の安定の3つの仕組み）、Bergmark 1989（局所と全体の筋）', url: 'https://www.orthopt.org/uploads/content_files/issue_20_article_28.pdf' },
    cholewicki1999: { ja: 'Cholewicki, Juluru, McGill 1999', url: 'https://vivo.weill.cornell.edu/display/pubid10050947' },
    hodges2001: { ja: 'Hodges et al. 2001', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2949466/' },
    hodges2005: { ja: 'Hodges et al. 2005', url: 'https://manuscript.isc.ac/Inventory/10/452135.htm' },
    stokes2010: { ja: 'Stokes et al. 2010', url: 'https://www.uvm.edu/~istokes/pdfs/abd.pdf' },
    tayashiki2017: { ja: 'Tayashiki et al. 2017', url: 'https://link.springer.com/article/10.1007/s00421-017-3617-x' },
    tayashiki2018: { ja: '腹圧と股・膝関節の筋力の因果関係の研究 2018', url: 'https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_proquest_miscellaneous_2061401677' },
    blazek2019: { ja: 'Blazek et al. 2019（系統的レビュー）', url: 'https://doaj.org/article/95188fd23ce340ca9179dcdf129de1d3' },
    hodges1997: { ja: 'Hodges & Richardson 1997', url: 'https://bjsm.bmj.com/content/42/11/930' },
    allison2008: { ja: 'Allison & Morris 2008', url: 'https://bjsm.bmj.com/content/42/11/930' },
    hodgesGandevia2000: { ja: 'Hodges & Gandevia 2000', url: 'https://typeset.io/pdf/changes-in-intra-abdominal-pressure-during-postural-and-3e5w3tbq52.pdf' },
    hodgesPelvicFloor: { ja: 'Hodges et al.（国際尿禁制学会の抄録）', url: 'https://www.ics.org/Abstracts/Publish/46/000390.pdf' },
    grenier2007: { ja: 'Grenier & McGill 2007', url: 'https://brookbushinstitute.com/article/abdominal-bracing-provides-greater-lumbar-stability-than-hollowing' },
    hollowingReview2024: { ja: 'ブレーシングとドローインのスコーピングレビュー 2024', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11503327/' },
    hackett2013: { ja: 'Hackett & Chow 2013', url: 'https://pubmed.ncbi.nlm.nih.gov/23222073/' },
    video2022: { ja: '2D動画の体幹・骨盤の妥当性の研究 2022', url: 'https://doaj.org/article/f12ab9f81be643da965e432c6585f3d2' },
  };

  // the moves a muscle takes part in, from the table above
  function movesOf(muscleId) {
    const out = [];
    for (const j of JOINTS) for (const m of j.moves) {
      const role = m.prime.includes(muscleId) ? 'prime' : m.assist.includes(muscleId) ? 'assist' : null;
      if (role) out.push({ joint: j.id, jointJa: j.ja, move: m.id, moveJa: m.ja, role });
    }
    return out;
  }
  const move = (jointId, moveId) => {
    const j = JOINTS.find(x => x.id === jointId);
    return j ? j.moves.find(m => m.id === moveId) || null : null;
  };
  return { JOINTS, EXTRA_MUSCLES, TWO_JOINT, TRUNK, SOURCES, movesOf, move };
})();
