/* หน้าเว็บหลัก: ส่งรูป / สรุปผล / การส่งรูป */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { } }, del: k => { try { sessionStorage.removeItem(k); } catch (e) { } } };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };

  let D = null;              // ข้อมูลจากหลังบ้าน
  let localQ = [];           // คิวรูปที่ยังส่งไม่เสร็จในเครื่องนี้
  let admin = ss.get('kc74pw') || '';
  let busy = false;          // กำลังส่งรูปจากหน้ารายการ
  const state = { page: 'results', day: 'all', q: '', item: null, rDay: 'all', rSub: 'all', rMed: 'all', pDay: 'all' };

  /* ================= โหลดข้อมูล ================= */
  async function load(silent) {
    try {
      if (!silent) setStatus('กำลังโหลดข้อมูล…');
      D = await API.get({ a: 'data' });
      setStatus('');
      render();
    } catch (e) { setStatus('โหลดข้อมูลไม่สำเร็จ: ' + e.message + ' — แตะเพื่อลองใหม่', true); }
  }
  async function refreshQueue() {
    localQ = await API.queue();
    const n = localQ.length, b = $('#qbar');
    if (!n) { b.hidden = true; return; }
    const err = localQ.find(x => x.error);
    b.hidden = false;
    b.innerHTML = `⏳ มีรูปรอส่งในเครื่องนี้ ${n} รูป ${err ? '— ' + esc(err.error) + ' (ระบบจะลองส่งใหม่เอง)' : '— กำลังส่ง…'} <button id="qretry">ส่งตอนนี้</button>`;
    $('#qretry').onclick = flush;
  }
  async function flush() { await API.flush(refreshQueue); await refreshQueue(); if (!busy) load(true); }

  function setStatus(t, err) { const s = $('#status'); s.textContent = t; s.hidden = !t; s.className = err ? 'status err' : 'status'; s.onclick = err ? () => load() : null; }

  /* ================= ตัวช่วยข้อมูล ================= */
  const days = () => [...new Set(D.items.map(i => i.date))];
  const photosOf = id => (D.photos[id] || []);
  function photoState(it) {
    const ps = photosOf(it.id).filter(p => p.admin !== 'ให้ส่งใหม่');
    const pend = localQ.some(q => q.itemId === it.id && q.stage === 'web');
    if (!ps.length) return pend ? 'queue' : (photosOf(it.id).length ? 'redo' : 'none');
    if (ps.some(p => p.admin === 'ผ่าน' || p.ai === 'ผ่าน')) return 'pass';
    if (ps.some(p => p.ai === 'เตือน' || p.ai === 'ตรวจไม่ได้')) return 'warn';
    return 'wait';
  }
  const STATE = {
    none: ['ยังไม่ส่ง', 'gray'], queue: ['รอส่งจากเครื่องนี้', 'blue'], redo: ['ให้ส่งใหม่', 'red'],
    wait: ['ส่งแล้ว · รอ AI ตรวจ', 'blue'], warn: ['ส่งแล้ว · AI เตือน', 'amber'], pass: ['ส่งแล้ว ✓', 'green'],
  };
  const chip = st => `<span class="chip ${STATE[st][1]}">${STATE[st][0]}</span>`;
  const medalChip = it => it.result ? `<span class="chip m-${esc(it.result)}">${esc(R.resultLabel(it))}</span>` : '<span class="chip gray">ยังไม่กรอกผล</span>';
  function bestPhoto(it) {
    const ps = photosOf(it.id).filter(p => p.admin !== 'ให้ส่งใหม่');
    return ps.find(p => p.admin === 'ผ่าน') || ps.slice().reverse().find(p => p.ai === 'ผ่าน') || ps[ps.length - 1] || null;
  }
  let execsP = null;
  function execsImage() {
    if (!execsP) execsP = API.get({ a: 'asset', name: 'executives' })
      .then(d => R.loadImg('data:' + d.mime + ';base64,' + d.b64)).catch(() => null);
    return execsP;
  }
  async function photoImage(p, size) {
    const d = await API.get({ a: 'photo', id: p.id, size: size || 'web' });
    return await R.loadImg('data:' + d.mime + ';base64,' + d.b64);
  }

  /* ================= หน้า ================= */
  function render() {
    if (!D) return;
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.p === state.page));
    $('#adminBtn').textContent = admin ? 'ออกจากแอดมิน' : 'แอดมิน';
    document.body.classList.toggle('is-admin', !!admin);
    ({ send: state.item ? pageItem : pageSend, results: pageResults, progress: pageProgress })[state.page]();
  }
  const dayChips = (key) => `<div class="chips">${['all', ...days()].map(d => `<button class="${state[key] === d ? 'on' : ''}" data-${key}="${esc(d)}">${d === 'all' ? 'ทุกวัน' : esc(d)}</button>`).join('')}</div>`;
  function bindChips(key) { document.querySelectorAll(`[data-${key}]`).forEach(b => b.onclick = () => { state[key] = b.dataset[key]; render(); }); }

  /* ---------- ส่งรูป: เลือกรายการ ---------- */
  function pageSend() {
    $('#main').innerHTML = `
      <h2>ส่งรูปรายงาน</h2>
      <p class="muted">เลือกรายการแข่งขัน แล้วส่ง <b>รูปรวมนักเรียนให้ครบทุกคน</b> 1 รูป</p>
      ${dayChips('day')}
      <input id="q" class="search" type="search" placeholder="ค้นหา: ชื่อรายการ เลขที่ ชื่อนักเรียน หรือครู" value="${esc(state.q)}">
      <div class="list" id="itemList"></div>`;
    bindChips('day');
    const qi = $('#q'); qi.oninput = () => { state.q = qi.value; drawList(); };
    drawList();
  }
  function drawList() {
    const q = state.q.trim();
    const list = D.items.filter(i => (state.day === 'all' || i.date === state.day) &&
      (!q || (i.name + ' ' + i.no + ' ' + i.students.join(' ') + ' ' + i.teachers.join(' ')).includes(q)));
    $('#itemList').innerHTML = list.map(i => `
        <button class="row" data-id="${esc(i.id)}">
          <span class="no">${esc(i.no)}</span>
          <span class="grow"><b>${esc(i.name)}</b><small>${esc(i.subject)} · ${esc(i.date)} · นักเรียน ${i.students.length} คน</small></span>
          ${chip(photoState(i))}
        </button>`).join('') || '<p class="muted">ไม่พบรายการ</p>';
    document.querySelectorAll('.row[data-id]').forEach(b => b.onclick = () => { state.item = b.dataset.id; render(); window.scrollTo(0, 0); });
  }

  /* ---------- ส่งรูป: รายการเดียว ---------- */
  function pageItem() {
    const it = D.items.find(i => i.id === state.item);
    if (!it) { state.item = null; return render(); }
    const ps = photosOf(it.id), mine = localQ.filter(x => x.itemId === it.id);
    $('#main').innerHTML = `
      <button class="back" id="back">← กลับไปเลือกรายการ</button>
      <div class="card">
        <div class="no big">${esc(it.no)}</div>
        <h2>${esc(it.name)}</h2>
        <p class="muted">${esc(it.subject)} · ${esc(it.date)} · ${esc(it.venue)}</p>
        <h3>นักเรียน ${it.students.length} คน</h3><ol>${it.students.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <h3>ครูผู้ฝึกซ้อม</h3><ul>${it.teachers.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      </div>
      <div class="card">
        <h3>ส่งรูปรวม</h3>
        <p class="muted">ถ่ายให้เห็น<b>นักเรียนครบ ${it.students.length} คน</b> หน้าชัด ไม่ย้อนแสง (มีครูอยู่ในรูปได้)</p>
        <label class="pick">📷 ถ่ายรูป / เลือกรูป<input type="file" id="file" accept="image/*"></label>
        <div id="prev"></div>
        <input id="sender" class="search" placeholder="ชื่อผู้ส่ง (ไม่บังคับ)" value="${esc(ls.get('kc74sender') || '')}">
        <button class="primary" id="send" disabled>ส่งรูป</button>
      </div>
      <div class="card">
        <h3>รูปที่ส่งแล้ว</h3>
        ${mine.map(m => `<div class="ph"><span>⏳ รอส่งจากเครื่องนี้</span><small>${esc(m.error || 'กำลังส่ง…')}</small></div>`).join('')}
        ${ps.map(p => `<div class="ph">
            <span>${new Date(p.time).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}${p.sender ? ' · ' + esc(p.sender) : ''}</span>
            ${aiLine(p)}
            <span class="adminonly"><button class="sm" data-view="${esc(p.id)}">ดูรูป</button>
              <button class="sm" data-rev="${esc(p.id)}" data-v="ผ่าน">ผ่าน</button>
              <button class="sm" data-rev="${esc(p.id)}" data-v="ให้ส่งใหม่">ให้ส่งใหม่</button></span>
          </div>`).join('') || (mine.length ? '' : '<p class="muted">ยังไม่มีรูป</p>')}
      </div>`;
    $('#back').onclick = () => { if (busy) return; state.item = null; render(); };
    let file = null;
    $('#file').onchange = e => {
      file = e.target.files[0] || null; $('#send').disabled = !file;
      $('#prev').innerHTML = file ? `<img src="${URL.createObjectURL(file)}" alt="">` : '';
    };
    $('#send').onclick = async () => {
      $('#send').disabled = true;
      ls.set('kc74sender', $('#sender').value.trim());
      startSend(() => API.enqueue(file, it.id, $('#sender').value.trim()));
    };
    bindAdminPhotoButtons();
  }
  /* ---------- ป็อปอัพการส่งรูป (เต็มจอ) ---------- */
  function pop(kind, html, buttons) {
    let el = $('#sendPop');
    if (!el) { el = document.createElement('div'); el.id = 'sendPop'; document.body.appendChild(el); }
    el.className = 'pop ' + kind; el.hidden = false;
    el.innerHTML = `<div class="popbox">${html}<div class="popbtns">${(buttons || []).map((b, k) => `<button class="${k ? '' : 'primary'}" data-pb="${k}">${b[0]}</button>`).join('')}</div></div>`;
    (buttons || []).forEach((b, k) => el.querySelector(`[data-pb="${k}"]`).onclick = b[1]);
  }
  function closePop() { const el = $('#sendPop'); if (el) el.hidden = true; }
  const steps = (n, note) => `<div class="spin big"></div>
    <h2>กำลังบันทึกรูป</h2>
    <ol class="steps"><li class="${n > 1 ? 'done' : 'now'}">ส่งรูป</li><li class="${n === 2 ? 'now' : ''}">บันทึกไฟล์ต้นฉบับ (ความละเอียดเต็ม)</li></ol>
    ${note ? `<p class="popnote">${note}</p>` : ''}
    <p class="dont">อย่าเพิ่งปิดหน้านี้</p>`;
  async function startSend(makeQ) {
    const guard = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    busy = true;
    let qid = null, tick = null;
    try {
      pop('busy', `<div class="spin big"></div><h2>กำลังเตรียมรูป…</h2><p class="dont">อย่าเพิ่งปิดหน้านี้</p>`);
      qid = await makeQ();
      await refreshQueue();
      tick = setInterval(async () => {
        const e = (await API.queue()).find(x => x.id === qid);
        if (!e) return;
        pop('busy', steps(e.stage === 'web' ? 1 : 2, e.error ? 'ส่งไม่ผ่าน (' + esc(e.error) + ') กำลังลองใหม่…' : ''));
      }, 700);
      let left = true;
      for (let k = 0; k < 3 && left; k++) {
        await API.flush(refreshQueue);
        left = (await API.queue()).some(x => x.id === qid);
        if (left && k < 2) await new Promise(r => setTimeout(r, 3000));
      }
      clearInterval(tick); tick = null; await refreshQueue();
      if (left) {
        pop('warn', `<div class="popicon">!</div><h2>ยังบันทึกไม่ครบ</h2>
          <p>รูปเก็บไว้ในเครื่องนี้แล้ว <b>ไม่ต้องถ่ายใหม่</b><br>ระบบจะส่งต่อเองเมื่อเน็ตดีขึ้น กรุณาเปิดหน้านี้ค้างไว้ หรือกลับมาเปิดใหม่ด้วยเบราว์เซอร์เดิม</p>`,
          [['ลองส่งอีกครั้ง', () => startSend(async () => qid)], ['ปิด', () => { closePop(); load(true); }]]);
      } else {
        try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch (e) { }
        pop('ok', `<div class="popicon">✓</div><h2>บันทึกครบแล้ว</h2><p class="big">ปิดหน้านี้ได้เลย</p><p class="muted">AI จะตรวจรูปภายในไม่กี่นาที</p>`,
          [['ตกลง', () => { closePop(); load(true); }]]);
      }
    } catch (e) {
      if (tick) clearInterval(tick);
      pop('err', `<div class="popicon">✕</div><h2>ส่งรูปไม่สำเร็จ</h2><p>${esc(e.message)}</p>`, [['ตกลง', () => { closePop(); load(true); }]]);
    } finally { window.removeEventListener('beforeunload', guard); busy = false; }
  }

  function aiLine(p) {
    const c = { 'รอตรวจ': 'blue', 'ผ่าน': 'green', 'เตือน': 'amber', 'ตรวจไม่ได้': 'gray' }[p.ai] || 'gray';
    const ad = p.admin ? ` <span class="chip ${p.admin === 'ผ่าน' ? 'green' : 'red'}">แอดมิน: ${esc(p.admin)}</span>` : '';
    return `<span><span class="chip ${c}">AI: ${esc(p.ai)}</span>${ad}</span>${p.aiNote ? `<small>${esc(p.aiNote)}</small>` : ''}`;
  }
  function bindAdminPhotoButtons() {
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'กำลังโหลด…';
      try { const img = await photoImage({ id: b.dataset.view }); openModal(`<img src="${img.src}" style="max-width:100%">`); }
      catch (e) { alertMsg(e.message); }
      b.disabled = false; b.textContent = 'ดูรูป';
    });
    document.querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await API.post({ a: 'review', pw: admin, photoId: b.dataset.rev, admin: b.dataset.v }); await load(true); }
      catch (e) { alertMsg(e.message); b.disabled = false; }
    });
  }

  /* ---------- สรุปผล ---------- */
  function pageResults() {
    const s = R.stats(D.items);
    const subs = [...new Set(D.items.map(i => i.subject))];
    const bySub = subs.map(sub => { const its = D.items.filter(i => i.subject === sub); return Object.assign({ sub, n: its.length }, R.stats(its)); })
      .sort((a, b) => b.gold - a.gold || b.n - a.n);
    const maxN = Math.max(...bySub.map(x => x.n));
    const list = D.items.filter(i => (state.rDay === 'all' || i.date === state.rDay) && (state.rSub === 'all' || i.subject === state.rSub) &&
      (state.rMed === 'all' || (state.rMed === 'none' ? !i.result : i.result === state.rMed)));
    $('#main').innerHTML = `
      <h2>สรุปผลการแข่งขัน</h2>
      <div class="poster169"><canvas id="sumCanvas" width="1280" height="720"></canvas></div>
      <div class="adminonly btnrow">
        <button class="sm" id="dlSum">ดาวน์โหลดภาพสรุป (1920×1080)</button>
        <button class="sm" id="dlSumV">ไฟล์ไวนิลภาพสรุป (4000×2250)</button>
      </div>
      <div class="stats">
        ${stat('เข้าร่วม', s.total, 'รายการ')}${stat('🥇 ทอง', s.gold)}${stat('🥈 เงิน', s.silver)}${stat('🥉 ทองแดง', s.bronze)}
        ${stat('🏆 ชนะเลิศ', s.first)}
      </div>
      <p class="muted">กรอกผลแล้ว ${s.done} จาก ${s.total} รายการ</p>
      ${compareCard(s)}
      <div class="card adminonly"><h3>ดึงผลจากเว็บเขต</h3>
        <p class="muted">อ่านผลจากหน้าประกาศผลของเขต แล้วให้ตรวจก่อนบันทึก${syncInfo()}</p>
        <button class="primary" id="impWeb">ดึงผลจากเว็บเขต</button>
        <details><summary>ดึงไม่ได้? คัดลอกตารางจากหน้าเว็บมาวางเอง</summary>
          <p class="muted">เปิดหน้าประกาศผลบนคอม ลากคลุมทั้งตาราง กด Ctrl+C แล้ววางในช่องนี้</p>
          <textarea id="impText" rows="5" placeholder="วางตารางผลที่นี่"></textarea>
          <button class="sm" id="impPaste">อ่านจากข้อความที่วาง</button>
        </details>
        <div id="impMsg" class="muted"></div>
      </div>
      <div class="card"><h3>แยกตามกลุ่มสาระ</h3>
        <table class="t"><thead><tr><th>กลุ่มสาระ</th><th>รายการ</th><th>ทอง</th><th>เงิน</th><th>ทองแดง</th><th>ชนะเลิศ</th></tr></thead><tbody>
        ${bySub.map(x => `<tr><td>${esc(x.sub)}<div class="bar">${seg(x.gold, maxN, 'g')}${seg(x.silver, maxN, 's')}${seg(x.bronze, maxN, 'b')}${seg(x.n - x.gold - x.silver - x.bronze, maxN, 'n')}</div></td>
          <td>${x.n}</td><td>${x.gold}</td><td>${x.silver}</td><td>${x.bronze}</td><td>${x.first}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="card"><h3>ผลรายการ</h3>
        ${dayChips('rDay')}
        <div class="filters">
          <select id="rSub"><option value="all">ทุกกลุ่มสาระ</option>${subs.map(x => `<option ${state.rSub === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
          <select id="rMed"><option value="all">ทุกผล</option>${['ทอง', 'เงิน', 'ทองแดง', 'เข้าร่วม'].map(x => `<option ${state.rMed === x ? 'selected' : ''}>${x}</option>`).join('')}<option value="none" ${state.rMed === 'none' ? 'selected' : ''}>ยังไม่กรอกผล</option></select>
        </div>
        <div class="adminonly btnrow">
          <button class="sm" id="zipPost">ภาพโพสต์ทั้งหมด (ZIP)</button>
          <button class="sm" id="zipVinyl">ไฟล์ไวนิลทั้งหมด (ZIP, 2400 px)</button>
          <span id="zipMsg" class="muted"></span>
        </div>
        <div class="list">${list.map(i => resultRow(i)).join('') || '<p class="muted">ไม่มีรายการ</p>'}</div>
      </div>`;
    execsImage().then(ex => R.summary($('#sumCanvas'), s, D.config, ex)).catch(e => console.error(e));
    bindChips('rDay');
    $('#rSub').onchange = e => { state.rSub = e.target.value; render(); };
    $('#rMed').onchange = e => { state.rMed = e.target.value; render(); };
    if (admin) bindResultAdmin(s);
  }
  const stat = (l, n, u) => `<div class="stat"><small>${l}</small><b>${n}</b>${u ? `<small>${u}</small>` : ''}</div>`;
  const seg = (n, max, c) => n ? `<i class="${c}" style="width:${(n / max * 100).toFixed(1)}%"></i>` : '';
  function resultRow(i) {
    const canPoster = ['ทอง', 'เงิน', 'ทองแดง'].includes(i.result);
    return `<div class="rrow">
      <div class="grow"><span class="no">${esc(i.no)}</span> <b>${esc(i.name)}</b>
        <small>${esc(i.students.join(', '))}</small></div>
      <div>${medalChip(i)}${i.score ? ` <small class="muted">${esc(i.score)} คะแนน</small>` : ''}</div>
      <div class="adminonly edit" data-id="${esc(i.id)}">
        <select class="e-res"><option value="">— ผล —</option>${['ทอง', 'เงิน', 'ทองแดง', 'เข้าร่วม'].map(x => `<option ${i.result === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <input class="e-rank" placeholder="อันดับ" value="${esc(i.rank)}" inputmode="numeric" title="1 = ชนะเลิศ">
        <input class="e-score" placeholder="คะแนน" value="${esc(i.score)}" inputmode="decimal">
        <button class="sm e-save">บันทึก</button>
        ${canPoster ? `<button class="sm e-post">ภาพโพสต์</button><button class="sm e-vinyl">ไวนิล</button>` : ''}
      </div></div>`;
  }
  function bindResultAdmin(s) {
    $('#dlSum').onclick = () => dlSummary(1920, 'สรุปผล_1920.png');
    $('#dlSumV').onclick = () => dlSummary(4000, 'สรุปผล_ไวนิล_4000.png');
    document.querySelectorAll('.edit').forEach(box => {
      const id = box.dataset.id, it = D.items.find(x => x.id === id);
      box.querySelector('.e-save').onclick = async e => {
        const b = e.target; b.disabled = true; b.textContent = 'กำลังบันทึก…';
        try {
          const rank = box.querySelector('.e-rank').value.replace(/\D/g, '');
          const body = { a: 'setResult', pw: admin, itemId: id, result: box.querySelector('.e-res').value, rank, score: box.querySelector('.e-score').value.trim() };
          await API.post(body); Object.assign(it, { result: body.result, rank: body.rank, score: body.score });
          b.textContent = '✓ บันทึกแล้ว'; setTimeout(render, 600);
        } catch (err) { alertMsg(err.message); b.disabled = false; b.textContent = 'บันทึก'; }
      };
      const p = box.querySelector('.e-post'), v = box.querySelector('.e-vinyl');
      if (p) p.onclick = () => dlPoster(it, 1080, p);
      if (v) v.onclick = () => dlPoster(it, 2400, v);
    });
    $('#impWeb').onclick = () => importPreview('');
    $('#impPaste').onclick = () => { const t = $('#impText').value.trim(); if (!t) return alertMsg('ยังไม่ได้วางตาราง'); importPreview(t); };
    $('#zipPost').onclick = () => zipAll(1080, 'ภาพโพสต์');
    $('#zipVinyl').onclick = () => zipAll(2400, 'ไวนิล');
  }

  function compareCard(s) {
    const P = (window.KC_CONFIG || {}).PREV;
    if (!P) return '';
    const d = (now, prev) => { const x = now - prev; return `<small class="${x >= 0 ? 'up' : 'down'}">${x > 0 ? '▲ ' + x : x < 0 ? '▼ ' + (-x) : 'เท่าเดิม'}</small>`; };
    return `<div class="card"><h3>เทียบกับปีที่แล้ว (${esc(P.label)})</h3>
      <table class="t"><thead><tr><th></th><th>ปีที่แล้ว</th><th>ปีนี้</th><th>ต่าง</th></tr></thead><tbody>
      <tr><td>🥇 เหรียญทอง</td><td>${P.gold}</td><td><b>${s.gold}</b></td><td>${d(s.gold, P.gold)}</td></tr>
      <tr><td>🏆 ชนะเลิศ</td><td>${P.first}</td><td><b>${s.first}</b></td><td>${d(s.first, P.first)}</td></tr>
      </tbody></table>${s.done < s.total ? `<p class="muted">ปีนี้กรอกผลแล้ว ${s.done} จาก ${s.total} รายการ</p>` : ''}</div>`;
  }
  function syncInfo() {
    try { const x = JSON.parse(D.config.syncLast || '{}'); if (!x.t) return '';
      return `<br>ดึงอัตโนมัติล่าสุด ${new Date(x.t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} · บนเว็บ ${x.web} รายการ · เติมใหม่ ${x.added}${x.unmatched ? ' · จับคู่ไม่ได้ ' + x.unmatched : ''}`;
    } catch (e) { return ''; }
  }
  async function importPreview(text) {
    const m = $('#impMsg'); m.className = 'muted'; m.innerHTML = '<span class="spin"></span> กำลังอ่านผล…';
    let r;
    try { r = await API.post({ a: 'importPreview', pw: admin, text }, 120000); }
    catch (e) { m.className = 'msg err'; m.textContent = e.message + (text ? '' : ' — ลองคัดลอกตารางมาวางเองด้านล่าง'); return; }
    m.textContent = '';
    const same = x => x.cur.result === x.result && String(x.cur.score || '') === String(x.score || '') && (!x.rank || String(x.cur.rank) === x.rank);
    const rows = r.matches.map((x, k) => `<tr class="${same(x) ? 'same' : x.cur.result ? 'chg' : ''}">
        <td><input type="checkbox" data-k="${k}" ${same(x) ? '' : 'checked'}></td>
        <td><b>${esc(x.no)}</b> ${esc(x.name)}${x.webName !== x.name ? `<br><small class="muted">เว็บ: ${esc(x.webName)}</small>` : ''}</td>
        <td>${esc(R.resultLabel(x))}<br><small>${esc(x.score)}</small></td>
        <td><small>${x.cur.result ? esc(R.resultLabel(x.cur)) + (x.cur.score ? ' ' + esc(x.cur.score) : '') : '—'}</small></td></tr>`).join('');
    const found = new Set(r.matches.map(x => x.itemId));
    const notOnWeb = D.items.filter(i => !found.has(i.id));
    openModal(`<h3>ผลจากเว็บเขต ${r.total} รายการ</h3>
      <p class="muted">ติ๊กรายการที่จะบันทึก · สีเหลือง = ทับผลเดิม · สีเทา = ตรงกับที่มีแล้ว</p>
      <div class="tscroll"><table class="t imp"><thead><tr><th></th><th>รายการของเรา</th><th>ผลจากเว็บ</th><th>ผลเดิม</th></tr></thead><tbody>${rows || '<tr><td colspan="4">ไม่มี</td></tr>'}</tbody></table></div>
      ${r.unmatched.length ? `<h4>จับคู่ไม่ได้ ${r.unmatched.length} รายการ (กรอกเอง)</h4><ul>${r.unmatched.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${notOnWeb.length ? `<details><summary>ยังไม่พบในประกาศ ${notOnWeb.length} รายการ</summary><ul>${notOnWeb.map(i => `<li>${esc(i.no)} ${esc(i.name)}${i.result ? ' (' + esc(R.resultLabel(i)) + ')' : ''}</li>`).join('')}</ul></details>` : ''}
      <button class="primary" id="impGo">บันทึกรายการที่เลือก</button><div id="impGoMsg" class="msg"></div>`);
    $('#impGo').onclick = async () => {
      const list = [...document.querySelectorAll('.imp [data-k]:checked')].map(c => r.matches[+c.dataset.k]).map(x => ({ itemId: x.itemId, result: x.result, rank: x.rank, score: x.score }));
      if (!list.length) return ($('#impGoMsg').textContent = 'ยังไม่ได้เลือกรายการ');
      $('#impGo').disabled = true; $('#impGoMsg').innerHTML = '<span class="spin"></span> กำลังบันทึก…';
      try {
        const res = await API.post({ a: 'importApply', pw: admin, list }, 120000);
        $('#modal').hidden = true; await load(true);
        $('#impMsg').className = 'msg ok'; $('#impMsg').textContent = '✓ บันทึกผลแล้ว ' + res.saved + ' รายการ';
      } catch (e) { $('#impGo').disabled = false; $('#impGoMsg').className = 'msg err'; $('#impGoMsg').textContent = e.message; }
    };
  }

  /* ---------- สร้างไฟล์ภาพ ---------- */
  const fname = (it, tag) => `${String(it.no).padStart(3, '0')}_${it.name.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60)}_${tag}.png`;
  async function posterBlob(it, size) {
    const p = bestPhoto(it);
    const img = p ? await photoImage(p, size > 1200 ? 'orig' : 'web') : null;
    const c = document.createElement('canvas'); c.width = c.height = size;
    await R.congrats(c, it, img, D.config);
    return { blob: await R.canvasBlob(c), noPhoto: !p };
  }
  async function dlPoster(it, size, btn) {
    const t = btn.textContent; btn.disabled = true; btn.textContent = 'กำลังสร้าง…';
    try {
      const r = await posterBlob(it, size);
      saveBlob(r.blob, fname(it, size > 1200 ? 'ไวนิล' : 'โพสต์'));
      if (r.noPhoto) alertMsg('รายการนี้ยังไม่มีรูป ภาพจึงเว้นกรอบรูปว่างไว้');
    } catch (e) { alertMsg(e.message); }
    btn.disabled = false; btn.textContent = t;
  }
  async function zipAll(size, tag) {
    const its = D.items.filter(i => ['ทอง', 'เงิน', 'ทองแดง'].includes(i.result));
    if (!its.length) return alertMsg('ยังไม่มีรายการที่ได้เหรียญ');
    const m = $('#zipMsg'); const zip = new JSZip(); const miss = [];
    for (let k = 0; k < its.length; k++) {
      m.textContent = `กำลังสร้าง ${k + 1}/${its.length}…`;
      try { const r = await posterBlob(its[k], size); zip.file(fname(its[k], tag), r.blob); if (r.noPhoto) miss.push(its[k].no); }
      catch (e) { miss.push(its[k].no + '(ผิดพลาด)'); }
    }
    m.textContent = 'กำลังรวมไฟล์…';
    saveBlob(await zip.generateAsync({ type: 'blob' }), `${tag}_ศิลปหัตถกรรม74_${new Date().toISOString().slice(0, 10)}.zip`);
    m.textContent = miss.length ? 'เสร็จแล้ว · ไม่มีรูป/ผิดพลาด: รายการที่ ' + miss.join(', ') : 'เสร็จแล้ว';
  }
  async function dlSummary(w, name) {
    const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * 9 / 16);
    await R.summary(c, R.stats(D.items), D.config, await execsImage());
    saveBlob(await R.canvasBlob(c), name);
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  /* ---------- การส่งรูป ---------- */
  function pageProgress() {
    const its = D.items.filter(i => state.pDay === 'all' || i.date === state.pDay);
    const g = { none: [], redo: [], queue: [], wait: [], warn: [], pass: [] };
    its.forEach(i => g[photoState(i)].push(i));
    const sent = g.wait.length + g.warn.length + g.pass.length;
    const pct = its.length ? Math.round(sent / its.length * 100) : 0;
    const sec = (title, arr, extra) => arr.length ? `<div class="card"><h3>${title} (${arr.length})</h3>${arr.map(i => `
      <div class="prow" data-open="${esc(i.id)}"><span class="no">${esc(i.no)}</span><span class="grow"><b>${esc(i.name)}</b>
      <small>ครู: ${esc(i.teachers.join(', '))}</small>${extra ? extra(i) : ''}</span>${chip(photoState(i))}</div>`).join('')}</div>` : '';
    const lastNote = i => { const p = photosOf(i.id).slice(-1)[0]; return p && p.aiNote ? `<small class="warnt">${esc(p.aiNote)}</small>` : ''; };
    $('#main').innerHTML = `
      <h2>สรุปการส่งรูปรายงาน</h2>
      ${dayChips('pDay')}
      <div class="progress"><i style="width:${pct}%"></i><span>ส่งแล้ว ${sent} / ${its.length} รายการ (${pct}%)</span></div>
      <div class="stats">${stat('ยังไม่ส่ง', g.none.length + g.redo.length)}${stat('รอ AI ตรวจ', g.wait.length)}${stat('AI เตือน', g.warn.length)}${stat('ผ่าน', g.pass.length)}</div>
      ${D.aiPending ? `<p class="muted">รูปในคิวรอ AI ตรวจทั้งหมด ${D.aiPending} รูป (ตรวจทุก 5 นาที ถ้าโควตา AI หมดจะตรวจต่อเองเมื่อโควตากลับมา)</p>` : ''}
      ${D.config.aiReady ? '' : '<p class="muted">ยังไม่ได้ตั้งค่า AI ตรวจรูป — รูปจะรอให้แอดมินตรวจเอง</p>'}
      <div class="adminonly btnrow"><button class="sm" id="copyMissing">คัดลอกรายการที่ยังไม่ส่ง (วางใน LINE)</button>
        <button class="sm" id="aiNow">สั่ง AI ตรวจตอนนี้</button><span id="pmsg" class="muted"></span></div>
      ${sec('❗ ให้ส่งใหม่', g.redo)}${sec('ยังไม่ส่ง', g.none)}${sec('⚠ AI เตือน', g.warn, lastNote)}${sec('⏳ รอ AI ตรวจ', g.wait)}${sec('⏳ รอส่งจากเครื่องนี้', g.queue)}${sec('✓ ผ่าน', g.pass)}`;
    bindChips('pDay');
    document.querySelectorAll('[data-open]').forEach(r => r.onclick = () => { state.page = 'send'; state.item = r.dataset.open; render(); window.scrollTo(0, 0); });
    if (admin) {
      $('#copyMissing').onclick = async () => {
        const miss = g.none.concat(g.redo);
        const txt = `📷 รายการที่ยังไม่ส่งรูปรายงาน${state.pDay === 'all' ? '' : ' (' + state.pDay + ')'} ${miss.length} รายการ\n` +
          miss.map(i => `• ${i.no} ${i.name} — ${i.teachers.join(', ')}${photoState(i) === 'redo' ? ' (ให้ส่งใหม่)' : ''}`).join('\n') +
          `\n\nส่งรูปได้ที่ ${location.href.split('#')[0]}`;
        try { await navigator.clipboard.writeText(txt); $('#pmsg').textContent = '✓ คัดลอกแล้ว'; }
        catch (e) { openModal(`<textarea style="width:100%;height:50vh">${esc(txt)}</textarea>`); }
      };
      $('#aiNow').onclick = async e => {
        e.target.disabled = true; $('#pmsg').textContent = 'กำลังตรวจ…';
        try { await API.post({ a: 'aiNow', pw: admin }, 330000); await load(true); } catch (err) { alertMsg(err.message); }
      };
    }
  }

  /* ================= แอดมิน / modal ================= */
  function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
  function alertMsg(t) { openModal(`<p>${esc(t)}</p>`); }
  $('#modalClose').onclick = () => { $('#modal').hidden = true; };
  $('#adminBtn').onclick = async () => {
    if (admin) { admin = ''; ss.del('kc74pw'); return render(); }
    openModal(`<h3>เข้าสู่ระบบแอดมิน</h3><input id="pw" type="password" class="search" placeholder="รหัสผ่าน"><button class="primary" id="pwGo">เข้าสู่ระบบ</button><div id="pwMsg" class="msg"></div>`);
    const go = async () => {
      const pw = $('#pw').value; $('#pwMsg').textContent = 'กำลังตรวจสอบ…';
      try { const r = await API.post({ a: 'login', pw }); if (!r.ok) throw new Error('รหัสผ่านไม่ถูกต้อง'); admin = pw; ss.set('kc74pw', pw); $('#modal').hidden = true; render(); }
      catch (e) { $('#pwMsg').className = 'msg err'; $('#pwMsg').textContent = e.message; }
    };
    $('#pwGo').onclick = go; $('#pw').onkeydown = e => { if (e.key === 'Enter') go(); };
  };
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
    if (busy) return; state.page = b.dataset.p; if (b.dataset.p === 'send') state.item = null; location.hash = b.dataset.p; render(); window.scrollTo(0, 0); });
  const h = location.hash.replace('#', ''); if (['send', 'results', 'progress'].includes(h)) state.page = h;

  window.addEventListener('online', flush);
  setInterval(() => { if (localQ.length) flush(); }, 30000);
  setInterval(() => { if (!document.hidden && !busy && !state.item && !document.querySelector('.edit select:focus, input:focus')) load(true); }, 60000);
  refreshQueue().then(() => { load(); if (localQ.length) flush(); });
})();
