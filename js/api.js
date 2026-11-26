/* เชื่อมต่อหลังบ้าน Apps Script + คิวส่งรูปที่เก็บในเครื่อง (ส่งไม่ผ่านก็ไม่หาย) */

const API = (() => {
  const url = () => window.KC_CONFIG.API_URL;

  async function get(params) {
    const q = new URLSearchParams(params).toString();
    const r = await fetch(url() + '?' + q, { credentials: 'omit' });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  }
  // text/plain = ไม่มี preflight (CORS) กับ Apps Script
  async function post(body, timeoutMs) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs || 120000);
    try {
      const r = await fetch(url(), { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', signal: ctl.signal });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      return j;
    } finally { clearTimeout(t); }
  }

  /* ---------- IndexedDB ---------- */
  let dbp;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('kc74', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('queue', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function store(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('queue', mode); const s = tx.objectStore('queue');
      const out = fn(s); tx.oncomplete = () => res(out && out.result); tx.onerror = () => rej(tx.error);
    });
  }
  const qAll = () => store('readonly', s => s.getAll());
  const qPut = v => store('readwrite', s => s.put(v));
  const qDel = id => store('readwrite', s => s.delete(id));

  /* ---------- เตรียมรูป ---------- */
  async function decode(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      try { return await createImageBitmap(file); }
      catch (e2) {
        // เผื่อเบราว์เซอร์เก่า
        return await new Promise((res, rej) => {
          const im = new Image(); const u = URL.createObjectURL(file);
          im.onload = () => { URL.revokeObjectURL(u); res(im); };
          im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('เครื่องนี้เปิดไฟล์รูปนี้ไม่ได้ (อาจเป็น HEIC) กรุณาถ่ายด้วยกล้องอีกครั้ง หรือเลือกรูปแบบ JPG')); };
          im.src = u;
        });
      }
    }
  }
  async function toJpeg(img, maxSide, q) {
    const s = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, 'image/jpeg', q));
  }
  const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

  async function enqueue(file, itemId, sender) {
    const img = await decode(file);
    const web = await toJpeg(img, 1600, 0.85);
    const orig = await toJpeg(img, 4000, 0.92);
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await qPut({ id, itemId, sender, web, orig, stage: 'web', created: Date.now(), error: '' });
    return id;
  }

  let running = false;
  async function flush(onChange) {
    if (running) return; running = true;
    try {
      for (const e of await qAll()) {
        try {
          if (e.stage === 'web') {
            await post({ a: 'upload', clientId: e.id, itemId: e.itemId, sender: e.sender, b64: await b64(e.web) }, 120000);
            e.stage = 'orig'; e.error = ''; await qPut(e); onChange && onChange();
          }
          if (e.stage === 'orig') {
            await post({ a: 'uploadOrig', photoId: e.id, b64: await b64(e.orig) }, 240000);
            await qDel(e.id); onChange && onChange();
          }
        } catch (err) {
          const m = String(err.message || err);
          e.error = !navigator.onLine ? 'ไม่มีอินเทอร์เน็ต' : (/fetch|network|abort|load failed/i.test(m) ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' : m);
          e.tries = (e.tries || 0) + 1; await qPut(e); onChange && onChange();
        }
      }
    } finally { running = false; }
  }

  return { get, post, enqueue, flush, queue: qAll };
})();
