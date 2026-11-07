// Analysed videos kept on this device only (IndexedDB in the browser): nothing here ever leaves it.
// "meta" holds what the list shows and "data" the poses and the video itself, so listing never loads a video.
window.KinemaStore = (() => {
  let dbPromise = null;
  const opened = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const ask = indexedDB.open('kinema', 1);
        ask.onupgradeneeded = () => {
          ask.result.createObjectStore('meta', { keyPath: 'id' });
          ask.result.createObjectStore('data', { keyPath: 'id' });
        };
        ask.onsuccess = () => {
          const db = ask.result;
          db.onclose = () => { dbPromise = null; };
          db.onversionchange = () => { db.close(); dbPromise = null; };
          resolve(db);
        };
        ask.onerror = () => reject(ask.error);
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  };
  const request = r => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const finished = tx => new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });

  // Safari can lose its connection to the database for no reason of ours ("Connection to Indexed Database server lost"):
  // a new connection a moment later works, so everything gets a second try. Lack of space does not improve on trying again.
  async function withDb(work) {
    try {
      return await work(await opened());
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') throw err;
      dbPromise = null;
      await new Promise(r => setTimeout(r, 300));
      return work(await opened());
    }
  }
  const list = () => withDb(async db => {
    const all = await request(db.transaction('meta').objectStore('meta').getAll());
    return all.sort((a, b) => b.savedAt - a.savedAt);
  });
  const get = id => withDb(db => request(db.transaction('data').objectStore('data').get(id)));
  const write = (meta, data) => withDb(async db => {
    const tx = db.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('meta').put(meta);
    tx.objectStore('data').put(data);
    await finished(tx);
  });
  // A video may not fit on the device: the poses alone still open and compare, without the picture.
  async function save(meta, data) {
    // browsers clear a site's storage less readily once this is granted (nothing happens if they decline)
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* optional */ }
    try {
      await write(meta, data);
      return { video: !!data.video };
    } catch (err) {
      if (!data.video) throw err;
      await write({ ...meta, hasVideo: false }, { ...data, video: null });
      return { video: false };
    }
  }
  const remove = id => withDb(async db => {
    const tx = db.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('meta').delete(id);
    tx.objectStore('data').delete(id);
    await finished(tx);
  });

  // ---------- as a file: the poses only, for keeping elsewhere or passing to someone ----------
  const FORMAT = 1;
  const rounded = (values, digits) => Array.from(values, v => Number(v.toFixed(digits)));
  function toFile(meta, data) {
    return JSON.stringify({
      kinema: FORMAT, name: meta.name, move: meta.move, general: !!data.general, fps: data.fps, vw: data.vw, vh: data.vh, duration: data.duration, total: data.total, analyzed: data.analyzed,
      heightCm: data.heightCm || 0, weightKg: data.weightKg || 0,
      frames: data.frames.map(f => (f.ok ? { t: Number(f.t.toFixed(4)), img: rounded(f.img, 5), w: rounded(f.w, 5), vis: rounded(f.vis, 3) } : { t: Number(f.t.toFixed(4)) })),
    });
  }
  // A file can come from anyone: only plain numbers of the right shape get through.
  function fromFile(text) {
    const bad = () => new Error('KINEMAの保存ファイルではありません');
    let o;
    try { o = JSON.parse(text); } catch { throw bad(); }
    const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
    if (!o || o.kinema !== FORMAT || !Array.isArray(o.frames) || !o.frames.length || o.frames.length > 40000) throw bad();
    if (!num(o.fps, 1, 240) || !num(o.vw, 1, 20000) || !num(o.vh, 1, 20000) || !['squat', 'jump', 'broad'].includes(o.move)) throw bad();
    const numbers = (a, n, lo, hi) => Array.isArray(a) && a.length === n && a.every(v => num(v, lo, hi));
    const frames = o.frames.map(f => {
      if (!f || !num(f.t, 0, 1e6)) throw bad();
      if (f.img === undefined) return { t: f.t, ok: false, w: null, img: null, vis: null };
      if (!numbers(f.img, 66, -100, 100) || !numbers(f.w, 99, -100, 100) || !numbers(f.vis, 33, -100, 100)) throw bad();
      return { t: f.t, ok: true, img: Float32Array.from(f.img), w: Float32Array.from(f.w), vis: Float32Array.from(f.vis) };
    });
    return {
      name: String(o.name || '読み込んだ動画').slice(0, 120), move: o.move, general: o.general === true, fps: o.fps, vw: o.vw, vh: o.vh, frames,
      duration: num(o.duration, 0, 1e6) ? o.duration : frames[frames.length - 1].t, total: frames.length, analyzed: frames.length,
      heightCm: num(o.heightCm, 100, 230) ? o.heightCm : 0, weightKg: num(o.weightKg, 20, 200) ? o.weightKg : 0,
    };
  }
  return { list, get, save, remove, toFile, fromFile };
})();
