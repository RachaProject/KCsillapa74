/**
 * หลังบ้าน (API) ระบบรายงานภาพ งานศิลปหัตถกรรมนักเรียน ครั้งที่ 74 โรงเรียนกุดชุมวิทยาคม
 * -------------------------------------------------------------------------------
 * หน้าเว็บอยู่บน GitHub Pages แล้วเรียกไฟล์นี้ผ่าน fetch (ไม่ใช้ google.script.run)
 * ดังนั้นเปิดได้ทุกเครื่อง แม้ล็อกอิน Google หลายบัญชี
 *
 * ติดตั้ง: ดู apps-script/ติดตั้ง.md
 * รายการแข่งขันอ่านจากชีตรายการของโรงเรียน (ใส่ ID ที่ SOURCE_SHEET_ID) ไม่เก็บรายชื่อนักเรียนไว้ในโค้ด
 */

const CFG = {
  SCHOOL: 'โรงเรียนกุดชุมวิทยาคม',
  EVENT: 'งานศิลปหัตถกรรมนักเรียน ครั้งที่ 74 ปีการศึกษา 2569',
  LEVEL: 'ระดับเขตพื้นที่การศึกษา สพม.ศรีสะเกษ ยโสธร',
  SHEET_ITEMS: 'รายการแข่งขัน',
  SHEET_PHOTOS: 'รูปรายงาน',
  ROOT_FOLDER: 'KCsillapa74 รูปรายงาน',
  TZ: 'Asia/Bangkok',
  RESULTS: ['ทอง', 'เงิน', 'ทองแดง', 'เข้าร่วม'],
  AI_PER_RUN: 6,           // ตรวจรูปสูงสุดกี่รูปต่อรอบ (รอบละ 5 นาที)
  AI_MAX_TRIES: 5,         // ลองตรวจไม่สำเร็จเกินนี้ -> "ตรวจไม่ได้" ให้แอดมินดูเอง
  MAX_UPLOAD_B64: 30 * 1024 * 1024,
  // รูปผ่านเมื่อเห็นนักเรียน: ทีม 1-3 คน ต้องครบ / ทีม 4 คนขึ้นไป อย่างน้อย 70%
  SMALL_TEAM: 3, MIN_RATIO: 0.7,
  // หน้าประกาศผลของเขต (สรุปเหรียญรางวัลของโรงเรียน)
  RESULTS_URL: 'https://mskyt.ssk.in.th/sm74/p_list.php?scid=153',
};

const ITEM_COLS = ['รหัส', 'ลำดับที่', 'รายการแข่งขัน', 'กลุ่มสาระ', 'วันแข่ง', 'สถานที่',
  'นักเรียน (บรรทัดละคน)', 'ครู (บรรทัดละคน)', 'ผล', 'อันดับ', 'คะแนน', 'ตัวแทน', 'หมายเหตุ'];
const PHOTO_COLS = ['เวลา', 'photoId', 'รหัสรายการ', 'fileId (ภาพเว็บ)', 'fileId (ต้นฉบับ)', 'ผู้ส่ง',
  'AI สถานะ', 'AI นับนักเรียน', 'AI หมายเหตุ', 'แอดมิน', 'AI ลองแล้ว'];
const AI = { WAIT: 'รอตรวจ', PASS: 'ผ่าน', WARN: 'เตือน', FAIL: 'ตรวจไม่ได้' };

/* ============================ ติดตั้ง ============================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏅 ศิลปหัตถกรรม 74')
    .addItem('1) ตั้งค่าครั้งแรก', 'setup')
    .addItem('2) ตั้งรหัสผ่านแอดมิน', 'setAdminPasswordPrompt')
    .addItem('3) ใส่ Gemini API key', 'setGeminiKeyPrompt')
    .addSeparator()
    .addItem('ให้ AI ตรวจรูปที่ค้างตอนนี้', 'processAiQueue')
    .addItem('ดูโมเดล AI ที่ใช้ได้', 'showModels')
    .addSeparator()
    .addItem('ดึงผลจากเว็บเขตตอนนี้', 'syncResultsNow')
    .addItem('เปิดดึงผลอัตโนมัติ (ทุก 30 นาที)', 'startAutoSync')
    .addItem('ปิดดึงผลอัตโนมัติ', 'stopAutoSync')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CFG.SHEET_ITEMS);
  if (!sh) {
    sh = ss.insertSheet(CFG.SHEET_ITEMS);
    sh.getRange(1, 1, 1, ITEM_COLS.length).setValues([ITEM_COLS]);
    sh.getRange('E:E').setNumberFormat('@');
    const rows = seedItems_().map(r => ['K' + String(r[0]).padStart(3, '0'), r[0], r[1], r[2], r[3], r[4], r[5], r[6], '', '', '', '', '']);
    sh.getRange(2, 1, rows.length, ITEM_COLS.length).setValues(rows);
    sh.getRange(2, 7, rows.length, 2).setWrap(true);
  }
  header_(sh, ITEM_COLS.length);
  const n = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, 9, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CFG.RESULTS, true).setAllowInvalid(false).build());
  sh.getRange(2, 10, n, 1).clearDataValidations();   // อันดับ: ใส่ตัวเลขได้ทุกค่า

  let ph = ss.getSheetByName(CFG.SHEET_PHOTOS);
  if (!ph) { ph = ss.insertSheet(CFG.SHEET_PHOTOS); ph.getRange(1, 1, 1, PHOTO_COLS.length).setValues([PHOTO_COLS]); }
  header_(ph, PHOTO_COLS.length);

  root_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'processAiQueue').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processAiQueue').timeBased().everyMinutes(5).create();
  ui_('ตั้งค่าเรียบร้อย\n\nขั้นต่อไป: เมนู 2) ตั้งรหัสผ่านแอดมิน และ 3) ใส่ Gemini API key\nแล้ว Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)');
}

function setAdminPasswordPrompt() {
  const r = SpreadsheetApp.getUi().prompt('ตั้งรหัสผ่านแอดมิน (อย่างน้อย 6 ตัว)');
  const pw = r.getResponseText().trim();
  if (r.getSelectedButton() !== SpreadsheetApp.getUi().Button.OK || pw.length < 6) return ui_('ยกเลิก หรือรหัสสั้นเกินไป');
  PropertiesService.getScriptProperties().setProperty('ADMIN_HASH', hash_(pw));
  ui_('ตั้งรหัสผ่านแอดมินแล้ว');
}

function setGeminiKeyPrompt() {
  const r = SpreadsheetApp.getUi().prompt('วาง Gemini API key (จาก Google AI Studio)');
  const k = r.getResponseText().trim();
  if (r.getSelectedButton() !== SpreadsheetApp.getUi().Button.OK || !k) return ui_('ยกเลิก');
  const p = PropertiesService.getScriptProperties();
  p.setProperty('GEMINI_KEY', k); p.deleteProperty('GEMINI_MODELS_CACHE');
  ui_('บันทึก key แล้ว\nโมเดลที่จะใช้: ' + models_().join(', '));
}

function showModels() { ui_('โมเดลที่ระบบจะลองตามลำดับ:\n' + models_().join('\n')); }

/* ============================ API ============================ */

function doGet(e) {
  const a = (e && e.parameter && e.parameter.a) || 'data';
  try {
    if (a === 'data') return json_(publicData_());
    if (a === 'photo') return json_(photoData_(e.parameter.id, e.parameter.size));
    if (a === 'asset') return json_(assetData_(e.parameter.name));
    return json_({ error: 'unknown action' });
  } catch (err) { return json_({ error: String(err.message || err) }); }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad json' }); }
  try {
    switch (b.a) {
      case 'upload': return json_(upload_(b));
      case 'uploadOrig': return json_(uploadOrig_(b));
      case 'login': return json_({ ok: isAdmin_(b.pw) });
    }
    if (!isAdmin_(b.pw)) { Utilities.sleep(800); return json_({ error: 'รหัสผ่านแอดมินไม่ถูกต้อง' }); }
    switch (b.a) {
      case 'setResult': return json_(setResult_(b));
      case 'review': return json_(review_(b));
      case 'aiNow': processAiQueue(); return json_({ ok: true });
      case 'importPreview': return json_(importPreview_(b));
      case 'importApply': return json_(importApply_(b));
    }
    return json_({ error: 'unknown action' });
  } catch (err) { return json_({ error: String(err.message || err) }); }
}

/* ---------- อ่านข้อมูล ---------- */

function publicData_() {
  const items = readItems_().map(i => ({
    id: i.id, no: i.no, name: i.name, subject: i.subject, date: i.date, venue: i.venue,
    students: i.students, teachers: i.teachers, result: i.result, rank: i.rank, score: i.score,
  }));
  const photos = {};
  readPhotos_().forEach(p => {
    (photos[p.itemId] = photos[p.itemId] || []).push({
      id: p.photoId, time: p.time, hasOrig: !!p.origId, sender: p.sender,
      ai: p.ai, aiCount: p.aiCount, aiNote: p.aiNote, admin: p.admin,
    });
  });
  const pending = readPhotos_().filter(p => p.ai === AI.WAIT).length;
  return {
    config: { school: CFG.SCHOOL, event: CFG.EVENT, level: CFG.LEVEL, aiReady: !!key_(), aiLast: PropertiesService.getScriptProperties().getProperty('AI_LAST') || '',
      syncLast: PropertiesService.getScriptProperties().getProperty('SYNC_LAST') || '' },
    items, photos, aiPending: pending, now: new Date().getTime(),
  };
}

function photoData_(photoId, size) {
  const p = readPhotos_().find(x => x.photoId === photoId);
  if (!p) throw new Error('ไม่พบรูป');
  const id = (size === 'orig' && p.origId) ? p.origId : p.fileId;
  const blob = DriveApp.getFileById(id).getBlob();
  return { mime: blob.getContentType(), b64: Utilities.base64Encode(blob.getBytes()) };
}

/** ไฟล์ภาพประกอบที่ไม่ควรอยู่ใน GitHub สาธารณะ (เช่น ภาพคณะผู้บริหาร)
 *  วางไฟล์ไว้ในโฟลเดอร์ "KCsillapa74 รูปรายงาน" ชื่อ executives.png */
function assetData_(name) {
  const allowed = { executives: 'executives.png' };
  if (!allowed[name]) throw new Error('ไม่พบไฟล์');
  const it = root_().getFilesByName(allowed[name]);
  if (!it.hasNext()) throw new Error('ยังไม่ได้วางไฟล์ ' + allowed[name] + ' ในโฟลเดอร์รูป');
  const blob = it.next().getBlob();
  return { mime: blob.getContentType(), b64: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------- รับรูป ---------- */

function upload_(b) {
  const item = readItems_().find(i => i.id === b.itemId);
  if (!item) throw new Error('ไม่พบรายการแข่งขัน');
  if (!b.b64 || b.b64.length > CFG.MAX_UPLOAD_B64) throw new Error('ไฟล์รูปไม่ถูกต้องหรือใหญ่เกินไป');
  const photoId = b.clientId || Utilities.getUuid();
  // ส่งซ้ำ (เน็ตหลุดตอนรอคำตอบ) -> คืนค่าเดิม ไม่สร้างรูปซ้ำ
  const dup = readPhotos_().find(p => p.photoId === photoId);
  if (dup) return { photoId, dup: true };
  const folder = itemFolder_(item);
  const stamp = Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd-HHmmss');
  const name = item.id + '_' + stamp + '_web.jpg';
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b.b64), 'image/jpeg', name));
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    photosSheet_().appendRow([new Date(), photoId, item.id, file.getId(), '', String(b.sender || '').slice(0, 60), AI.WAIT, '', '', '', 0]);
  } finally { lock.releaseLock(); }
  return { photoId };
}

function uploadOrig_(b) {
  const sh = photosSheet_();
  const row = findPhotoRow_(sh, b.photoId);
  if (!row) throw new Error('ไม่พบรูป');
  if (sh.getRange(row, 5).getValue()) return { ok: true, dup: true };
  if (!b.b64 || b.b64.length > CFG.MAX_UPLOAD_B64) throw new Error('ไฟล์ต้นฉบับใหญ่เกินไป');
  const itemId = sh.getRange(row, 3).getValue();
  const item = readItems_().find(i => i.id === itemId);
  const folder = itemFolder_(item);
  const stamp = Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd-HHmmss');
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b.b64), 'image/jpeg', item.id + '_' + stamp + '_original.jpg'));
  sh.getRange(row, 5).setValue(file.getId());
  return { ok: true };
}

/* ---------- แอดมิน ---------- */

function setResult_(b) {
  const sh = sheet_(CFG.SHEET_ITEMS);
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(b.itemId);
  if (i < 0) throw new Error('ไม่พบรายการ');
  if (b.result && CFG.RESULTS.indexOf(b.result) < 0) throw new Error('ผลไม่ถูกต้อง');
  const rank = String(b.rank || '').trim();
  if (rank && !/^\d{1,3}$/.test(rank)) throw new Error('อันดับต้องเป็นตัวเลข');
  sh.getRange(i + 2, 9, 1, 3).setValues([[b.result || '', rank, b.score || '']]);
  return { ok: true };
}

/* ============================ ดึงผลจากเว็บเขต ============================ */
/*  หน้าประกาศผล: ตาราง เหรียญ | กิจกรรม | กลุ่มสาระ | ชื่อผู้เข้าแข่งขัน | ผู้ฝึกสอน | คะแนน | หมายเหตุ
 *  รายการทีม = หลายแถว (แถวต่อมาช่องเหรียญ/กิจกรรมว่าง)  หมายเหตุ "ชนะเลิศ" = อันดับ 1
 *  จับคู่กับรายการของเราด้วยชื่อนักเรียนเป็นหลัก + ความคล้ายของชื่อรายการ             */

function fetchResultsHtml_() {
  const r = UrlFetchApp.fetch(CFG.RESULTS_URL, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error('เปิดเว็บเขตไม่ได้ (รหัส ' + r.getResponseCode() + ')');
  return r.getContentText('UTF-8');
}

/** แปลง HTML หรือข้อความที่คัดลอกจากตาราง เป็นรายการผล */
function parseResults_(src) {
  let rows = [];
  if (/<tr[\s>]/i.test(src)) {
    const strip = s => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const html = src.replace(/<!--[\s\S]*?-->/g, '');
    (html.match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(tr => {
      const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(strip);
      if (cells.length >= 6) rows.push(cells);
    });
  } else {
    rows = String(src).split(/\r?\n/).map(l => l.split('\t').map(c => c.replace(/\s+/g, ' ').trim())).filter(c => c.length >= 6);
  }
  const out = [];
  rows.forEach(c => {
    if (c[1] === 'กิจกรรม (ช่วงชั้น)' || c[0] === 'เหรียญ') return;
    const [medal, name, subject, student, , score, note] = c;
    if (name) out.push({ medal: medal, name: name, subject: subject, students: [], score: score || '', first: false });
    const cur = out[out.length - 1];
    if (!cur) return;
    if (student) cur.students.push(student);
    if (!cur.score && score) cur.score = score;
    if (/ชนะเลิศ/.test(note || '') && !/รอง/.test(note || '')) cur.first = true;
  });
  out.forEach(o => {
    if (CFG.RESULTS.indexOf(o.medal) < 0) {
      const s = parseFloat(o.score);
      o.medal = isNaN(s) ? '' : s >= 80 ? 'ทอง' : s >= 70 ? 'เงิน' : s >= 60 ? 'ทองแดง' : 'เข้าร่วม';
    }
  });
  return out.filter(o => o.medal);
}

const normPerson_ = s => String(s).replace(/^(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นางสาว|น\.ส\.|นาย|นาง)/, '').replace(/\s+/g, '');
const normItem_ = s => String(s).replace(/ชั้น|ระดับ/g, '').replace(/[\s().\-–_]/g, '').toLowerCase();
function dice_(a, b) {
  if (a === b) return 1;
  const bg = s => { const m = {}; for (let i = 0; i < s.length - 1; i++) { const k = s.substr(i, 2); m[k] = (m[k] || 0) + 1; } return m; };
  const A = bg(a), B = bg(b); let n = 0, t = 0;
  Object.keys(A).forEach(k => { t += A[k]; if (B[k]) n += Math.min(A[k], B[k]); });
  Object.keys(B).forEach(k => { t += B[k]; });
  return t ? 2 * n / t : 0;
}
const level_ = s => { const m = String(s).match(/ม\.\s*(\d)\s*-\s*(\d)/); return m ? m[1] + m[2] : ''; };

/** จับคู่ผลจากเว็บกับรายการของเรา */
function matchResults_(res, items) {
  const used = {}, matches = [], unmatched = [];
  res.forEach(r => {
    const rs = r.students.map(normPerson_), rn = normItem_(r.name), rl = level_(r.name);
    let best = null, bestScore = 0;
    items.forEach(it => {
      if (used[it.id]) return;
      const ov = it.students.map(normPerson_).filter(x => rs.indexOf(x) >= 0).length;
      const d = dice_(rn, normItem_(it.name));
      const sameLv = !rl || !level_(it.name) || rl === level_(it.name);
      if (!sameLv) return;
      const ok = ov > 0 || d >= 0.85;
      const sc = ov * 2 + d;
      if (ok && sc > bestScore) { best = it; bestScore = sc; }
    });
    if (best) {
      used[best.id] = 1;
      matches.push({ itemId: best.id, no: best.no, name: best.name, webName: r.name, result: r.medal, rank: r.first ? '1' : '', score: r.score,
        cur: { result: best.result, rank: best.rank, score: best.score } });
    } else unmatched.push(r.name + ' (' + r.medal + (r.score ? ' ' + r.score : '') + ')');
  });
  return { matches: matches, unmatched: unmatched };
}

function importPreview_(b) {
  const src = b.text && String(b.text).trim() ? String(b.text) : fetchResultsHtml_();
  const res = parseResults_(src);
  if (!res.length) throw new Error(b.text ? 'อ่านตารางผลจากข้อความที่วางไม่ได้' : 'เว็บเขตยังไม่มีผลประกาศของโรงเรียน');
  const m = matchResults_(res, readItems_());
  m.total = res.length;
  return m;
}

/** บันทึกผลที่แอดมินยืนยัน: [{itemId,result,rank,score}] */
function importApply_(b) {
  const sh = sheet_(CFG.SHEET_ITEMS);
  const last = sh.getLastRow();
  const vals = sh.getRange(2, 1, last - 1, 11).getValues();
  const idx = {}; vals.forEach((r, i) => idx[String(r[0])] = i);
  let n = 0;
  (b.list || []).forEach(x => {
    const i = idx[x.itemId];
    if (i === undefined || CFG.RESULTS.indexOf(x.result) < 0) return;
    vals[i][8] = x.result;
    if (x.rank) vals[i][9] = String(x.rank);
    if (x.score) vals[i][10] = String(x.score);
    n++;
  });
  sh.getRange(2, 9, vals.length, 3).setValues(vals.map(r => [r[8], r[9], r[10]]));
  return { ok: true, saved: n };
}

/** ดึงอัตโนมัติ: เติมเฉพาะรายการที่ยังไม่มีผล ไม่ทับที่แอดมินกรอกไว้ */
function syncResults() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const res = parseResults_(fetchResultsHtml_());
    const m = matchResults_(res, readItems_().filter(i => !i.result));
    if (m.matches.length) importApply_({ list: m.matches });
    PropertiesService.getScriptProperties().setProperty('SYNC_LAST', JSON.stringify({ t: new Date().toISOString(), web: res.length, added: m.matches.length, unmatched: m.unmatched.length }));
    Logger.log('ผลบนเว็บ %s รายการ เติมใหม่ %s จับคู่ไม่ได้ %s', res.length, m.matches.length, m.unmatched.length);
    if (m.unmatched.length) Logger.log('จับคู่ไม่ได้: ' + m.unmatched.join(' | '));
  } finally { lock.releaseLock(); }
}
function syncResultsNow() {
  try { syncResults(); } catch (e) { return ui_('ดึงผลไม่สำเร็จ: ' + e.message); }
  const s = JSON.parse(PropertiesService.getScriptProperties().getProperty('SYNC_LAST') || '{}');
  ui_('ผลบนเว็บเขต ' + (s.web || 0) + ' รายการ\nเติมผลใหม่ ' + (s.added || 0) + ' รายการ\nจับคู่ไม่ได้ ' + (s.unmatched || 0) + ' รายการ (ดูรายละเอียดในหน้าเว็บ ปุ่มดึงผล)');
}
function startAutoSync() {
  stopAutoSync(true);
  ScriptApp.newTrigger('syncResults').timeBased().everyMinutes(30).create();
  try { syncResults(); } catch (e) { return ui_('เปิดดึงอัตโนมัติแล้ว แต่ดึงครั้งแรกไม่สำเร็จ: ' + e.message); }
  ui_('เปิดดึงผลอัตโนมัติแล้ว (ทุก 30 นาที) เติมเฉพาะรายการที่ยังไม่มีผล');
}
function stopAutoSync(silent) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncResults').forEach(t => ScriptApp.deleteTrigger(t));
  if (silent !== true) ui_('ปิดดึงผลอัตโนมัติแล้ว');
}

function review_(b) {
  const sh = photosSheet_();
  const row = findPhotoRow_(sh, b.photoId);
  if (!row) throw new Error('ไม่พบรูป');
  if (['ผ่าน', 'ให้ส่งใหม่', ''].indexOf(b.admin) < 0) throw new Error('สถานะไม่ถูกต้อง');
  sh.getRange(row, 10).setValue(b.admin);
  return { ok: true };
}

/* ============================ AI ตรวจรูป (คิว) ============================ */
/*  หลัก: รูปถูกบันทึกก่อนเสมอ AI เป็นแค่ตัวเสริม
 *  - ทำงานจาก trigger ทุก 5 นาที ทีละไม่กี่รูป
 *  - โควตาหมด (429) -> หยุดรอบนี้ รูปยังรออยู่ในคิว รอบหน้าลองใหม่เอง
 *  - ลองเกิน AI_MAX_TRIES -> "ตรวจไม่ได้" แอดมินกดผ่านเองได้                    */

function processAiQueue() {
  if (!key_()) return;
  if (!PropertiesService.getScriptProperties().getProperty('MODELS_V2')) { PropertiesService.getScriptProperties().deleteProperty('GEMINI_MODELS_CACHE'); PropertiesService.getScriptProperties().setProperty('MODELS_V2', '1'); }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const sh = photosSheet_();
    const items = readItems_();
    const queue = readPhotos_().filter(p => p.ai === AI.WAIT).slice(0, CFG.AI_PER_RUN);
    const started = Date.now();
    for (const p of queue) {
      if (Date.now() - started > 240000) break;
      const item = items.find(i => i.id === p.itemId);
      const row = findPhotoRow_(sh, p.photoId);
      if (!item || !row) continue;
      const res = checkPhoto_(p, item);
      if (res.quota) break;                       // โควตาหมดทุกโมเดล -> รอรอบหน้า
      if (res.error) {
        const tries = (Number(sh.getRange(row, 11).getValue()) || 0) + 1;
        sh.getRange(row, 11).setValue(tries);
        if (tries >= CFG.AI_MAX_TRIES) sh.getRange(row, 7, 1, 3).setValues([[AI.FAIL, '', res.error.slice(0, 200)]]);
        continue;
      }
      sh.getRange(row, 7, 1, 3).setValues([[res.status, res.count, res.note]]);
    }
  } finally { lock.releaseLock(); }
}

function need_(n) { return n <= CFG.SMALL_TEAM ? n : Math.ceil(n * CFG.MIN_RATIO); }

function checkPhoto_(p, item) {
  const expected = item.students.length, need = need_(expected);
  const prompt =
    'นี่คือรูปหมู่หลังการแข่งขันงานศิลปหัตถกรรมนักเรียนของโรงเรียนในประเทศไทย\n' +
    'รายการ: ' + item.name + '\n' +
    'นักเรียนในทีมทั้งหมด: ' + expected + ' คน (อาจไม่ได้อยู่ในรูปครบทุกคน ให้นับตามที่เห็นจริง)\n' +
    'งานของคุณ: นับจำนวน "นักเรียน" ในรูป (เด็กหรือวัยรุ่น ส่วนใหญ่ใส่ชุดนักเรียน ชุดพละ หรือชุดการแสดง) แยกจาก "ผู้ใหญ่" (ครู ผู้ปกครอง กรรมการ มักใส่ชุดข้าราชการหรือชุดสุภาพ)\n' +
    'นับเฉพาะคนที่เห็นหน้าชัดพอจะนับได้ ไม่นับคนที่อยู่ไกลเป็นฉากหลัง\n' +
    'ตอบเป็น JSON เท่านั้น: {"students": จำนวนนักเรียน, "adults": จำนวนผู้ใหญ่, "clear": รูปชัดไม่เบลอไม่มืดเกินไป true/false, ' +
    '"group_photo": เป็นรูปหมู่ของคนจริง (ไม่ใช่ภาพหน้าจอ เอกสาร หรือรูปที่ไม่มีคน) true/false, "note": คำอธิบายสั้นภาษาไทยไม่เกิน 1 ประโยค}';
  const img = DriveApp.getFileById(p.fileId).getBlob();
  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: Utilities.base64Encode(img.getBytes()) } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 400 },
  };
  let lastErr = '';
  for (const model of models_()) {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
      headers: { 'x-goog-api-key': key_() }, muteHttpExceptions: true,
    });
    const code = r.getResponseCode();
    Logger.log(model + ' -> HTTP ' + code + ' ' + (code === 200 ? '' : r.getContentText().slice(0, 300)));
    aiStatus_(model + ' HTTP ' + code + (code === 200 ? '' : ' ' + r.getContentText().slice(0, 160)));
    if (code === 429 || code === 503) { lastErr = 'quota'; continue; }     // ลองโมเดลถัดไป
    if (code === 404) { PropertiesService.getScriptProperties().deleteProperty('GEMINI_MODELS_CACHE'); lastErr = 'model'; continue; }
    if (code !== 200) { lastErr = 'HTTP ' + code + ' ' + r.getContentText().slice(0, 120); continue; }
    try {
      const txt = JSON.parse(r.getContentText()).candidates[0].content.parts.map(x => x.text || '').join('');
      const j = JSON.parse(txt.replace(/^```json|```$/g, '').trim());
      const n = Number(j.students) || 0;
      const problems = [];
      if (!j.group_photo) problems.push('ไม่ใช่รูปหมู่');
      if (!j.clear) problems.push('รูปไม่ชัด');
      if (n < need) problems.push('พบนักเรียน ' + n + ' คน ต้องมีอย่างน้อย ' + need + ' จาก ' + expected + ' คน');
      return {
        status: problems.length ? AI.WARN : AI.PASS, count: n,
        note: problems.length ? problems.join(' / ') + (j.note ? ' — ' + j.note : '') : ((n >= expected ? 'นักเรียนครบ ' + n + ' คน' : 'พบนักเรียน ' + n + ' จาก ' + expected + ' คน (ผ่านเกณฑ์ ' + need + ' คน)') + (j.note ? ' — ' + j.note : '')),
      };
    } catch (err) { lastErr = 'อ่านผล AI ไม่ได้'; }
  }
  if (lastErr === 'quota') return { quota: true };
  return { error: lastErr || 'ไม่ทราบสาเหตุ' };
}

/** หาโมเดลที่ใช้ได้จริงจาก API (ชื่อโมเดลเปลี่ยนบ่อย) เก็บไว้ 1 วัน
 *  ตั้งเองได้ที่ Script property GEMINI_MODELS เช่น "gemini-3-flash,gemini-3.1-flash-lite" */
function models_() {
  const p = PropertiesService.getScriptProperties();
  const manual = p.getProperty('GEMINI_MODELS');
  if (manual) return manual.split(',').map(s => s.trim()).filter(Boolean);
  const c = p.getProperty('GEMINI_MODELS_CACHE');
  if (c) { const o = JSON.parse(c); if (Date.now() - o.t < 86400000) return o.m; }
  let list = [];
  try {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key_() }, muteHttpExceptions: true });
    list = (JSON.parse(r.getContentText()).models || [])
      .filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
      .map(m => m.name.replace('models/', ''))
      .filter(n => /flash/.test(n) && !/(image|tts|audio|live|embed|native|thinking|exp|preview-tts)/.test(n));
  } catch (e) { /* ใช้ค่าสำรอง */ }
  // รุ่นเล็ก/เร็ว โควตาฟรีเยอะ เรียงก่อน (รุ่นใหม่ล่าสุดบางรุ่นตอบช้ามากจนค้าง)
  const PREF = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  const m = PREF.filter(n => !list.length || list.indexOf(n) >= 0);
  if (!m.length) m.push('gemini-flash-lite-latest');
  p.setProperty('GEMINI_MODELS_CACHE', JSON.stringify({ t: Date.now(), m }));
  return m;
}

/* ============================ ตัวช่วย ============================ */

function readItems_() {
  const sh = sheet_(CFG.SHEET_ITEMS);
  if (sh.getLastRow() < 2) return [];
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, ITEM_COLS.length).getValues();
  const split = s => String(s || '').split(/\n|,/).map(x => x.trim()).filter(Boolean);
  return v.filter(r => r[0] && r[2]).map(r => ({
    id: String(r[0]), no: r[1], name: String(r[2]).trim(), subject: String(r[3] || 'อื่น ๆ'),
    date: String(r[4] || ''), venue: String(r[5] || ''), students: split(r[6]), teachers: split(r[7]),
    result: String(r[8] || ''), rank: String(r[9] || ''), score: String(r[10] || ''), rep: r[11] === true,
  }));
}

function readPhotos_() {
  const sh = photosSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, PHOTO_COLS.length).getValues().filter(r => r[1]).map(r => ({
    time: r[0] instanceof Date ? r[0].getTime() : 0, photoId: String(r[1]), itemId: String(r[2]),
    fileId: String(r[3]), origId: String(r[4] || ''), sender: String(r[5] || ''),
    ai: String(r[6] || AI.WAIT), aiCount: r[7] === '' ? null : Number(r[7]), aiNote: String(r[8] || ''), admin: String(r[9] || ''),
  }));
}

function findPhotoRow_(sh, photoId) {
  if (sh.getLastRow() < 2) return 0;
  const ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(photoId)) return i + 2;
  return 0;
}

function photosSheet_() { return sheet_(CFG.SHEET_PHOTOS); }
function sheet_(n) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n);
  if (!sh) throw new Error('ไม่พบชีต ' + n + ' (รันเมนู ตั้งค่าครั้งแรก)');
  return sh;
}

function root_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('ROOT_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  const f = DriveApp.createFolder(CFG.ROOT_FOLDER);
  p.setProperty('ROOT_ID', f.getId());
  return f;
}

function itemFolder_(item) {
  const p = PropertiesService.getScriptProperties();
  const key = 'F_' + item.id;
  const id = p.getProperty(key);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const again = p.getProperty(key);
    if (again) { try { return DriveApp.getFolderById(again); } catch (e) { } }
    const name = String(item.no).padStart(3, '0') + ' ' + item.name;
    const it = root_().getFoldersByName(name);
    const f = it.hasNext() ? it.next() : root_().createFolder(name);
    p.setProperty(key, f.getId());
    return f;
  } finally { lock.releaseLock(); }
}

function key_() { return PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || ''; }
function isAdmin_(pw) {
  const h = PropertiesService.getScriptProperties().getProperty('ADMIN_HASH');
  return !!(h && pw && hash_(String(pw)) === h);
}
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'kc74:' + s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function header_(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#0b6b2e').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ui_(m) { try { SpreadsheetApp.getUi().alert(m); } catch (e) { Logger.log(m); } }


/* ============================ นำเข้ารายการแข่งขัน ============================ */
/** ใส่ ID ของชีตรายการแข่งขันเดิมของโรงเรียน (ส่วนกลางของลิงก์ docs.google.com/spreadsheets/d/<ID>/edit) */
const SOURCE_SHEET_ID = '';
function seedItems_() {
  if (!SOURCE_SHEET_ID) throw new Error('ใส่ SOURCE_SHEET_ID ก่อนรัน setup');
  const v = SpreadsheetApp.openById(SOURCE_SHEET_ID).getSheets()[0].getDataRange().getDisplayValues();
  const out = []; let cur = null;
  v.forEach(r => {
    const no = String(r[0]).trim();
    if (/^\d+$/.test(no)) { cur = [Number(no), String(r[1]).trim(), String(r[2]).trim() || 'อื่น ๆ', String(r[7]).trim(), String(r[8]).trim(), [], []]; out.push(cur); }
    else if (!cur) return;
    else if (String(r[1]).trim()) cur[1] += ' ' + String(r[1]).trim();
    if (String(r[5]).trim()) cur[5].push(String(r[5]).trim());
    if (String(r[6]).trim()) cur[6].push(String(r[6]).trim());
  });
  return out.filter(x => !/^กรรมการ/.test(x[1]))
    .map(x => [x[0], x[1].replace(/\s+/g, ' ').trim(), x[2], x[3], x[4], x[5].join('\n'), x[6].join('\n')]);
}

/** แก้วันแข่งที่ชีตแปลงเป็นวันที่ (ปี 1969) ให้กลับเป็นข้อความ เช่น "9 ธ.ค.69" */
function fixDates() {
  const sh = sheet_(CFG.SHEET_ITEMS);
  const r = sh.getRange(2, 5, sh.getLastRow() - 1, 1);
  const TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const v = r.getValues().map(x => [x[0] instanceof Date ? x[0].getDate() + ' ' + TH[x[0].getMonth()] + String(x[0].getFullYear() % 100).padStart(2, '0') : x[0]]);
  r.setNumberFormat('@'); r.setValues(v);
}

function aiStatus_(s) {
  PropertiesService.getScriptProperties().setProperty('AI_LAST', Utilities.formatDate(new Date(), CFG.TZ, 'HH:mm') + ' ' + String(s).slice(0, 220));
}

/** ทดสอบ AI 1 ครั้ง ดูผลใน "บันทึกการดำเนินการ" */
function testAi() {
  PropertiesService.getScriptProperties().deleteProperty('GEMINI_MODELS_CACHE');
  Logger.log('models: ' + models_().join(', '));
  const p = readPhotos_().filter(x => x.ai === AI.WAIT)[0];
  if (!p) { Logger.log('ไม่มีรูปรอตรวจ'); return; }
  const item = readItems_().find(i => i.id === p.itemId);
  Logger.log(JSON.stringify(checkPhoto_(p, item)));
}

/** แสดงรายชื่อโมเดล Gemini ทั้งหมดที่ key นี้ใช้ได้ */
function listModels() {
  const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=300', { headers: { 'x-goog-api-key': key_() }, muteHttpExceptions: true });
  const ms = (JSON.parse(r.getContentText()).models || []).filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0);
  Logger.log(ms.map(m => m.name.replace('models/', '') + (m.thinking ? ' [think]' : '')).join('\n'));
}
