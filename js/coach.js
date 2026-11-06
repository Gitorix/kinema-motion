// What to work on next, from what the analysis measured: where the movement's paths and the work of the muscles point,
// and for each kind of muscle what to keep in mind. Prime movers make the force, synergists add to it, and stabilizers
// hold the posture still so that it is not lost. Nothing here measures a muscle: the figures are those of the analysis,
// and what they suggest is put as something to try.
window.KinemaCoach = (() => {
  const median = a => {
    const s = a.filter(Number.isFinite).sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : NaN;
  };
  const pct = v => Math.round(v * 100);
  const ROLE_JA = {
    prime: { title: '主動作筋', why: '力を生み出す筋肉です。' },
    synergist: { title: '補助筋', why: '主動作筋を助けて、力を足す筋肉です。' },
    stabilizer: { title: '安定筋', why: '姿勢を固めて、生んだ力を逃がさない筋肉です。ここが安定すると、主動作筋と補助筋が力を出しやすくなります。' },
  };

  // what the better repetitions do differently, by the same person with the same camera
  function whatTheBestDo(r, key, better) {
    const reps = r.reps.filter(x => Number.isFinite(x[key]));
    if (reps.length < 4) return null;
    const n = Math.max(2, Math.floor(reps.length / 3));
    const sorted = [...reps].sort((a, b) => b[key] - a[key]), top = sorted.slice(0, n), low = sorted.slice(-n);
    // Only what would help anyone: a few repetitions cannot overturn that, and one misread arm in three would seem to
    // say that lower arms jump further. The middle value of each group, so that one odd repetition does not decide.
    const SAY = [
      { k: 'hipDepth', least: 8, text: d => `沈み込みで股関節を約 ${d}° 深く曲げています` },
      { k: 'kneeDepth', least: 8, text: d => `沈み込みで膝を約 ${d}° 深く曲げています` },
      { k: 'sink', least: 4, text: d => `重心を約 ${d} cm 深く沈めています` },
      { k: 'arms', least: 15, text: d => `踏み切りで腕を約 ${d}° 高く振り上げています` },
    ];
    let best = null;
    for (const m of SAY) {
      const d = median(top.map(x => x[m.k])) - median(low.map(x => x[m.k]));
      if (d >= m.least && (!best || d / m.least > best.score)) best = { score: d / m.least, text: m.text(Math.round(d)) };
    }
    return best ? `${better}${n}回は、そうでない${n}回より、${best.text}（${reps.length}回の中での傾向で、原因とまでは言えません）。` : null;
  }

  function tiers(r, kg) {
    const K = r.kin, con = K && K.summary.con;
    const all = [...(r.checks || []), ...(r.trajChecks || []), ...(K ? K.checks : [])];
    const check = id => all.find(c => c.id === id);
    const bad = id => { const c = check(id); return !!c && (c.status === 'bad' || c.status === 'warn'); };
    const shares = con && con.totalWork > 0 && r.view === 'side' ? `${r.move === 'squat' ? '立ち上がる' : '踏み切り'}の仕事は、股関節 ${pct(con.share.hip)}%・膝 ${pct(con.share.knee)}%・足首 ${pct(con.share.ankle)}% です。` : '';
    const hold = con ? (kg ? `${Math.round(con.peak.trunk * kg)} N·m` : `${con.peak.trunk.toFixed(1)} N·m/kg`) : '';
    const back = con && r.view === 'side' ? `背中は最大 ${hold} の力で上半身を支えています。` : '';
    const arms = median(r.reps.map(x => x.arms));
    const armsNow = Number.isFinite(arms) ? `踏み切りの腕の高さは ${arms}° で、${bad('arms') ? 'まだ振り上げる余地があります' : '腕の振りを使えています'}。` : '';
    const absorb = bad('k_absorb') && check('k_absorb') ? `着地は${check('k_absorb').value.replace('着地後に曲げた角度：', '')}で、膝に頼りやすい形です。` : '';
    const only = list => list.filter(Boolean);

    if (r.move === 'squat') {
      return {
        prime: {
          now: only([shares, bad('depth') && check('depth') ? `しゃがむ深さは ${check('depth').value} で、まだ深くできます。` : '']),
          cues: only(['お尻を後ろへ引きながらしゃがむ', '立つときは足の裏全体で床を押す', bad('k_balance') ? 'お尻と太もも前の両方で立ち上がる' : '']),
          drills: ['ボックススクワット', 'ヒップリフト', 'ゴブレットスクワット（軽く）'],
        },
        synergist: {
          now: only([bad('heel') ? 'かかとが浮きやすくなっています。足首の硬さも関係します。' : 'かかとは床についています。']),
          cues: only(['内ももを意識して、膝を外へ開く（大内転筋）', '太もも裏で体を支えながら下りる（ハムストリングス）', bad('heel') ? 'かかとで床を押し続ける（ふくらはぎ）' : '']),
          drills: ['ワイドスタンスのスクワット', 'ふくらはぎのストレッチ'],
        },
        stabilizer: {
          now: only([back, bad('lean') ? '上半身が前に倒れやすくなっています。' : '', bad('t_ap') ? '重心が前後に動いています。' : '', bad('valgus') ? '膝が内側に入りやすくなっています。' : '']),
          cues: ['下りる前に軽く息を吐いて、お腹を固める（腹横筋・内腹斜筋）', '背中を丸めず、まっすぐ保つ（脊柱起立筋・多裂筋）', '膝とつま先を同じ向きに保つ（中殿筋）', '足首がぐらつかないよう、すねの前で支える（前脛骨筋）'],
          drills: ['プランク', 'バードドッグ', 'クラムシェル（横向きで膝を開く）'],
        },
      };
    }
    if (r.move === 'jump') {
      return {
        prime: {
          now: only([shares, bad('extension') ? '踏み切りで体が伸び切る前に床を離れています。' : '', bad('transition') ? '一番下で止まってから跳んでいます。' : '']),
          cues: only(['床を真下へ強く押す', bad('transition') ? 'しゃがんだら止まらず一気に跳ぶ' : '', '股関節 → 膝 → 足首の順に伸ばし、最後はつま先で押し切る']),
          drills: ['スクワットジャンプ（低めから）', 'カーフレイズ（つま先立ち）', 'ポゴジャンプ（足首で弾む）'],
        },
        synergist: {
          now: only([armsNow]),
          cues: ['腕を前上へ一気に振り上げ、上で止める（三角筋前部）', 'お尻と同時に太もも裏でも股関節を伸ばす（ハムストリングス）', '足の裏全体で床をとらえる（後脛骨筋・長腓骨筋）'],
          drills: ['腕振りだけのジャンプ練習', 'ランジ'],
        },
        stabilizer: {
          now: only([back, bad('t_drift') ? '空中で重心が流れています。真上に跳ぶと高さに変わります。' : '', bad('landvalgus') ? '着地で膝が内側に入りやすくなっています。' : '', absorb]),
          cues: ['跳ぶ前に軽く息を吐いて、お腹を固める（腹横筋）', '背中を丸めず、胸を起こしたまま跳ぶ（脊柱起立筋・多裂筋）', '膝とつま先を同じ向きに保つ（中殿筋）', '足の指で床をつかむ（足底筋群）'],
          drills: ['プランク', 'バードドッグ', 'タオルギャザー（足の指でタオルを寄せる）'],
        },
      };
    }
    const hip = median(r.reps.map(x => x.hipDepth));
    return {
      prime: {
        now: only([shares, bad('counter') && Number.isFinite(hip) ? `沈み込みの股関節は ${hip}° で、目安の 90° より浅めです。` : '', bad('extension') ? '踏み切りで体が伸び切る前に床を離れています。' : '', con && r.view === 'side' && con.share.knee < 0.25 ? '太もも前の割合は少なめです（動画からの推定には幅があります）。' : '']),
        cues: only([
          bad('counter') ? 'お辞儀をするように、お尻を後ろへ引いて沈む（太もも裏が伸びる感じ）' : '',
          '「前へ跳ぶ」より「床を後ろへ押す」（大殿筋・ハムストリングス）',
          bad('extension') ? '股関節 → 膝 → 足首の順に伸ばし、最後はつま先で押し切る（ふくらはぎ）' : '',
          con && con.share.knee < 0.25 ? '沈んだ位置から、膝も伸ばして太もも前でも床を押す（広筋群）' : '',
        ]),
        drills: bad('counter') ? ['ヒップヒンジ（棒を背中に当てて、お尻を引く練習）', 'ヒップリフト', 'スクワットジャンプ（低めから）'] : ['ヒップリフト', 'スクワットジャンプ（低めから）', 'カーフレイズ（つま先立ち）'],
      },
      synergist: {
        now: only([armsNow]),
        cues: ['腕を後ろへ大きく引き（広背筋）、押すのに合わせて前上へ振り上げる（三角筋前部）', '内ももで床を寄せるように押し、膝を内側に入れない（大内転筋）', '最後は親指の付け根で床を押す（後脛骨筋）'],
        drills: ['腕振りだけのジャンプ練習', 'サイドランジ（内もも）', 'ランジ'],
      },
      stabilizer: {
        now: only([back, bad('balance') && check('balance') ? `着地で${check('balance').value}です。` : '', absorb]),
        cues: ['沈む前に軽く息を吐いて、お腹を固める（腹横筋）', '背中を丸めず、頭からお尻まで一直線のまま前へ倒す（脊柱起立筋・多裂筋）', '膝とつま先を同じ向きに、体が左右へ流れないように（中殿筋）', '着地の瞬間もお腹を固め、上半身を前に残す（腹直筋）'],
        drills: ['プランク', 'バードドッグ', 'サイドプランク'],
      },
    };
  }

  function points(r) {
    const out = [], all = r.trajChecks || [];
    if (r.move === 'broad') {
      const m = r.reps.map(x => x.meters).filter(Number.isFinite);
      if (m.length) {
        const mid = median(m), top = Math.max(...m), low = Math.min(...m);
        out.push(m.length > 1
          ? `跳んだ距離は真ん中の値で ${mid.toFixed(2)} m、最長 ${top.toFixed(2)} m です。毎回最長の回に近づければ、約 ${Math.round((top - mid) * 100)} cm 伸びる計算です（一番短い回との差は ${Math.round((top - low) * 100)} cm）。`
          : `跳んだ距離は ${mid.toFixed(2)} m です。`);
      }
      const angle = median(r.reps.map(x => x.angle)), angles = r.reps.map(x => x.angle).filter(Number.isFinite);
      if (Number.isFinite(angle)) {
        const spread = angles.length > 1 && Math.max(...angles) - Math.min(...angles) >= 20 ? `回ごとの差は大きめです（${Math.min(...angles)}〜${Math.max(...angles)}°）。` : '';
        out.push(`${angle < 25 ? `軌跡：踏み切りの角度は真ん中の値で ${angle}° と低めです。斜め上の遠くを見ると、空中の時間が伸びて距離に変わります。`
          : angle > 45 ? `軌跡：踏み切りの角度は真ん中の値で ${angle}° と高めです。上への力を前へ回すと、距離に変わります。視線を少し低く、遠くへ向けてみてください。`
            : angle >= 40 ? `軌跡：踏み切りの角度は真ん中の値で ${angle}° です。目安の中ですが上限の 45° に近めなので、視線を少し低く、遠くへ向けると、前への力が増えるかもしれません。`
              : `軌跡：踏み切りの角度は真ん中の値で ${angle}° で、目安（25〜45°）の中です。`}${spread}`);
      }
      const best = whatTheBestDo(r, 'meters', '遠くへ跳べた');
      if (best) out.push(best);
    } else if (r.move === 'jump') {
      const drift = all.find(c => c.id === 't_drift');
      if (drift) out.push(`軌跡：空中でのずれは ${drift.value} です。${drift.status === 'good' ? '真上に跳べています。' : '真上に跳ぶほど、力が高さに変わります。'}`);
      const best = whatTheBestDo(r, 'flight', '高く跳べた');
      if (best) out.push(best);
    } else {
      const ap = all.find(c => c.id === 't_ap');
      if (ap) out.push(`軌跡：重心の前後のぶれは ${ap.value} です。${ap.status === 'good' ? '真下・真上に動けています。' : 'ぶれが小さいほど、力が上下に伝わります。'}`);
    }
    return out;
  }

  // For each thing measured: what lies behind it, what improving it brings, the moment to look at, and where to look on
  // each chart, so that a finding and the evidence for it can be seen side by side. Joints: hip, kn, el, sh.
  const M = (prime, synergist, stabilizer) => ({ prime, synergist, stabilizer });
  const CORE = ['transversus_abdominis', 'erector_spinae', 'multifidus'];
  const HAM = ['biceps_femoris', 'semimembranosus', 'semitendinosus'];
  const QUAD = ['vastus_lateralis', 'vastus_medialis'];
  const CALF = ['gastrocnemius', 'soleus'];
  const LINKS = {
    counter: move => ({
      moment: 'bottom',
      why: move === 'broad' ? 'お尻を後ろへ引く動きが少なく、膝から沈んでいます。お尻と太もも裏が伸ばされないので、力をためにくくなります。' : '沈み込みの深さが、力をためやすい範囲から外れています。',
      gain: 'お尻・太もも裏の大きな力を踏み切りに使えるようになり、押す力が増えます。',
      angle: { joints: ['hip', 'kn'], target: move === 'broad' ? { hip: 90 } : {}, note: move === 'broad' ? '一番沈んだところで、股関節の線が目安の90°まで届いているか' : '一番沈んだところの、股関節と膝の曲がり具合' },
      traj: { event: '最下点', note: '「最下点」の高さ。ここが沈み込みの深さです' },
      kin: { kind: 'ecc', joint: 'hip', note: '「沈み込み」の帯の中で、股関節の線がしっかり上がっているか（力をためている）' },
      muscles: M(['glute_max', ...HAM], ['adductor_magnus'], CORE),
    }),
    extension: () => ({
      moment: 'takeoff',
      why: '床を押し切る前に足が離れています。沈み込みから踏み切りの間に、体を伸ばし切る時間や力が足りていない可能性があります。',
      gain: '最後まで押し切ると、踏み切りのスピードが上がり、そのまま距離や高さに変わります。',
      angle: { joints: ['hip', 'kn'], note: '踏み切りの瞬間に、股関節と膝の線が0°近くまで下がっているか' },
      traj: { event: '踏み切り', note: '「踏み切り」の点の高さ。伸び切るほど高くなります' },
      kin: { kind: 'con', joint: 'hip', note: '「踏み切り」の帯の終わりまで、力が続いているか' },
      muscles: M(['glute_max', ...QUAD, ...CALF], ['rectus_femoris', 'tibialis_posterior'], CORE),
    }),
    angle: () => ({
      moment: 'takeoff',
      why: '踏み切りの角度は、上へ押す力と前へ押す力の配分で決まります。体を倒す量や、視線の高さが影響します。',
      gain: '目安の範囲に入ると、同じ力でも遠くへ跳びやすくなります。',
      angle: { joints: ['hip', 'kn'], note: '踏み切りに向かって、股関節と膝の線が同時に下がっているか' },
      traj: { event: '踏み切り', note: '「この回」の矢印が、緑の目安の範囲に入っているか' },
      kin: { kind: 'con', joint: 'hip', note: '「踏み切り」の帯の中の、股関節の山' },
      muscles: M(['glute_max', ...QUAD], ['deltoid_anterior', 'latissimus_dorsi'], CORE),
    }),
    arms: () => ({
      moment: 'takeoff',
      why: '腕の振りが小さいか、足で押すタイミングと合っていない可能性があります。',
      gain: '腕の勢いが加わると、距離や高さが伸びます。',
      angle: { joints: ['sh'], note: '踏み切りに向かって、肩の線が一気に上がっているか' },
      muscles: M([], ['deltoid_anterior', 'latissimus_dorsi'], ['transversus_abdominis', 'erector_spinae']),
    }),
    landing: () => ({
      moment: 'land',
      why: '着地で膝や股関節を十分に曲げられず、衝撃を受け止めきれていません。',
      gain: '衝撃を筋肉で受け止められると、けがの予防になり、次の動作にもつながります。',
      angle: { joints: ['kn', 'hip'], note: '「着地」の帯の中で、膝の線がなめらかに上がっているか' },
      traj: { event: '着地', note: '「着地」のあと、重心がなめらかに下がっているか' },
      kin: { kind: 'land', joint: 'kn', note: '「着地」の帯の中の、膝と股関節の山' },
      muscles: M([...QUAD, 'glute_max'], ['rectus_femoris'], ['rectus_abdominis', 'glute_med']),
    }),
    balance: () => ({
      moment: 'land',
      why: '空中で足を前に出したあと、着地で体が後ろに残っていると起こります。',
      gain: '後ろに倒れなくなると、跳んだ距離がそのまま記録に残ります。',
      traj: { event: '着地', note: '「着地」のあと、重心がかかとより前へ進んでいるか' },
      muscles: M([], ['deltoid_anterior'], ['rectus_abdominis', 'transversus_abdominis']),
    }),
    distance: () => ({
      moment: 'land',
      why: '距離は、踏み切りの速さと角度で決まります。沈み込み、押し切り、腕の振りがそれを左右します。',
      gain: '最長の回に毎回近づけることが、一番の近道です。',
      traj: { note: '床の上の「跳んだ距離」の線。◀ ▶ で回を変えて比べられます' },
      muscles: M(['glute_max', ...HAM], [], []),
    }),
    height: () => ({
      moment: 'apex',
      why: '高さは、踏み切りの上向きの速さで決まります。沈み込み、切り返し、押し切りがそれを左右します。',
      gain: '空中の時間が伸びるほど、高く跳べています。',
      traj: { event: '最高点', note: '「最高点」の高さ' },
      muscles: M(['glute_max', ...QUAD, ...CALF], [], []),
    }),
    transition: () => ({
      moment: 'bottom',
      why: '一番下で止まると、筋肉のバネ（伸ばされた反動）が逃げてしまいます。',
      gain: '切り返しが速いと、同じ力でも高く跳べます。',
      angle: { joints: ['kn', 'hip'], note: '一番深いところから、線がすぐに下がり始めているか（止まっていないか）' },
      kin: { kind: 'con', joint: 'kn', note: '「沈み込み」から「踏み切り」へ、力の山が続いているか' },
      muscles: M([...CALF, 'rectus_femoris', 'glute_max'], [], CORE),
    }),
    t_arc: () => ({
      moment: 'apex',
      why: '放物線の形は、踏み切りの速さと角度で決まり、空中では変えられません。',
      gain: '踏み切りの角度と速さを変えると、形が変わります。',
      traj: { event: '最高点', note: '点線の山の形。高すぎず低すぎない放物線か' },
      muscles: M(['glute_max'], [], []),
    }),
    t_sink: () => ({
      moment: 'bottom',
      why: '重心の沈みの深さは、股関節と膝をどれだけ曲げたかで決まります。',
      gain: '自分の遠くへ跳べた回の深さに揃えると、安定します。',
      angle: { joints: ['hip', 'kn'], note: '一番沈んだところの股関節と膝' },
      traj: { event: '最下点', note: '「最下点」の高さ' },
      kin: { kind: 'ecc', joint: 'hip', note: '「沈み込み」の帯の中の力' },
      muscles: M(['glute_max', ...QUAD], [], CORE),
    }),
    t_path: () => ({ moment: 'apex', why: '上下の動きは、沈み込みの深さと踏み切りの強さで決まります。', gain: '沈み込みと高さの関係が分かると、自分に合う深さを探せます。', traj: { event: '最高点', note: '「最下点」から「最高点」までの高さ' }, muscles: M(['glute_max', ...QUAD], [], []) }),
    t_drift: () => ({ moment: 'apex', why: '上半身の傾きや、かかと寄り・つま先寄りの体重で、力が前後へ逃げています。', gain: '真上に跳ぶほど、力がそのまま高さに変わります。', traj: { event: '最高点', note: '踏み切りから最高点まで、重心が真上へ向かっているか' }, muscles: M([], [], [...CORE, 'glute_med', 'foot_intrinsic']) }),
    landvalgus: () => ({ moment: 'land', why: 'お尻の横の筋肉が働かないと、着地で膝が内側へ入りやすくなります。', gain: '膝の向きが揃うと、膝のけがを防げます。', muscles: M(['glute_max'], ['adductor_magnus'], ['glute_med']) }),
    valgus: () => ({ moment: 'bottom', why: 'お尻の横の筋肉が働かないと、しゃがんだときに膝が内側へ入りやすくなります。', gain: '膝の向きが揃うと、力が逃げず、膝も守れます。', muscles: M(['glute_max'], ['adductor_magnus'], ['glute_med']) }),
    k_balance: move => ({
      moment: 'takeoff',
      why: '関節ごとの割合は、体の倒し方と、どこから力を出すかで変わります。上半身を倒すほど股関節、起こすほど膝の割合が増えます。',
      gain: '股関節と膝の両方を使えると、大きな力を出せて、一部の関節の負担も減ります。',
      angle: { joints: ['hip', 'kn'], note: '股関節と膝の線が、同時に下がっているか' },
      kin: { kind: 'con', joint: 'hip', note: `上の棒の割合と、「${move === 'squat' ? '立ち上がる' : '踏み切り'}」の帯の中の山の高さ` },
      muscles: M(['glute_max', ...QUAD], HAM, []),
    }),
    k_power: () => ({ moment: 'takeoff', why: '体全体のパワーは、床を押す力と体の速さの掛け算です。', gain: '同じ撮り方で比べると、トレーニングの伸びが分かります。', kin: { kind: 'con', joint: 'hip', note: '押す動きの帯の中の山' }, muscles: M(['glute_max', ...QUAD, ...CALF], [], []) }),
    k_absorb: () => ({
      moment: 'land',
      why: '着地で股関節をあまり曲げないと、膝だけで受け止める形になります。',
      gain: 'お尻も使って受け止めると、膝の負担が減り、次の動きにもつなげられます。',
      angle: { joints: ['hip', 'kn'], note: '「着地」の帯の中で、股関節の線も膝と同じくらい上がっているか' },
      kin: { kind: 'land', joint: 'hip', note: '「着地」の帯の中の、股関節と膝の山' },
      muscles: M(['glute_max', ...HAM], QUAD, ['rectus_abdominis', 'glute_med']),
    }),
    k_back: () => ({ moment: 'bottom', why: '上半身を前に倒すほど、背中の筋肉が重さを支える力は大きくなります。', gain: '胸を起こすと、腰の負担が減ります。', angle: { joints: ['hip'], note: '股関節の線。深いほど上半身が倒れやすくなります' }, kin: { kind: 'ecc', joint: 'trunk', note: '背中（点線）の山の高さ' }, muscles: M([], [], CORE) }),
    depth: () => ({
      moment: 'bottom',
      why: '足首や股関節の硬さ、お尻を引く動きの不足で、深くしゃがめないことがあります。',
      gain: '深くしゃがめると、お尻と太ももをより大きく使えます。',
      angle: { joints: ['kn', 'hip'], note: '一番下で、膝と股関節の線がどこまで上がっているか' },
      traj: { event: '最下点', note: '「最下点」の高さ' },
      kin: { kind: 'ecc', joint: 'kn', note: '「しゃがむ」帯の中の力' },
      muscles: M(['glute_max', ...QUAD], ['adductor_magnus', ...HAM], CORE),
    }),
    tempo: () => ({ moment: 'bottom', why: '下ろす速さは、筋肉でブレーキをかけられているかで変わります。', gain: 'ゆっくり下ろせると、筋肉を長く使えます。', angle: { joints: ['kn'], note: '線の上り坂（しゃがむ）と下り坂（立つ）の長さ' }, muscles: M([...QUAD, 'glute_max'], [], CORE) }),
    consistency: () => ({ moment: 'bottom', why: '回ごとの深さがそろわないのは、疲れや意識の向け方が変わるためです。', gain: 'そろうと、フォームが安定して比べやすくなります。', angle: { joints: ['kn'], note: '「動画全体」で見たときの、山の高さのそろい方' }, muscles: M([], [], CORE) }),
    lean: () => ({ moment: 'bottom', why: '足首が硬いか、体幹を固められないと、上半身が倒れやすくなります。', gain: '上半身が安定すると、腰の負担が減り、脚の力を使えます。', angle: { joints: ['hip'], note: '一番下での股関節の線' }, kin: { kind: 'ecc', joint: 'trunk', note: '背中（点線）の山' }, muscles: M(['glute_max'], [], CORE) }),
    heel: () => ({ moment: 'bottom', why: '足首の硬さや、重心が前に寄ることで、かかとが浮きやすくなります。', gain: 'かかとで押せると、お尻の力を使えます。', traj: { event: '最下点', note: '「最下点」で、重心が足の真ん中の上にあるか' }, muscles: M(['glute_max'], CALF, ['tibialis_anterior']) }),
    symmetry: () => ({ moment: 'bottom', why: '左右の筋力や柔らかさの差で、片側に寄りやすくなります。', gain: '左右が揃うと、片側の負担が減ります。', muscles: M([], ['adductor_magnus'], ['glute_med', 'internal_oblique']) }),
    t_ap: () => ({ moment: 'bottom', why: '体重がかかとやつま先に寄ると、重心が前後に動きます。', gain: '真下・真上に動けると、力が逃げません。', traj: { event: '最下点', note: '重心の線が、緑の理想の線に沿っているか' }, muscles: M([], [], [...CORE, 'tibialis_anterior']) }),
    t_ml: () => ({ moment: 'bottom', why: '片側の脚に体重が寄っています。', gain: '左右に動かないと、両脚に均等に力が入ります。', traj: { event: '最下点', note: '重心の線が左右に振れていないか' }, muscles: M([], [], ['glute_med', 'internal_oblique']) }),
    t_drop: () => ({ moment: 'bottom', why: '重心の下がりは、しゃがむ深さで決まります。', gain: '自分の良い回の深さに揃えると、安定します。', traj: { event: '最下点', note: '「最下点」の高さ' }, muscles: M(['glute_max', ...QUAD], [], []) }),
    t_rise: () => ({ moment: 'bottom', why: 'お尻が先に上がると、上半身が倒れて腰に負担がかかります。', gain: 'お尻と肩が一緒に上がると、脚の力が上に伝わります。', angle: { joints: ['hip', 'kn'], note: '立ち上がるとき、股関節と膝の線が同時に下がっているか' }, muscles: M(['glute_max', ...QUAD], [], CORE) }),
  };
  function link(move, id) {
    const make = LINKS[id];
    return make ? make(move) : { muscles: M([], [], []) };
  }

  // r: the analysis of a movement. kg: the body weight, if given.
  function plan(r, kg) {
    if (!r || r.error || !r.reps || !r.reps.length || !r.kin) return null;
    const by = tiers(r, kg), ROLES = window.KinemaKinetics.ROLES[r.move];
    return {
      points: points(r),
      tiers: ['stabilizer', 'synergist', 'prime'].map(role => ({ role, ...ROLE_JA[role], ...by[role], muscles: ROLES[role] })),
      note: r.view === 'side' ? '' : '正面や斜めからの動画なので、数字は大まかな目安です。',
    };
  }
  return { plan, link };
})();
