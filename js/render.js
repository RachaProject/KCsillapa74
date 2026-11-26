/* วาดภาพแสดงความยินดี (จัตุรัส) และภาพสรุปผล (16:9) ลง canvas
 * พิกัดอ้างอิงตามเทมเพลตเดิม: ภาพแสดงความยินดีกว้าง 708.66 หน่วย, ภาพสรุปกว้าง 1280 หน่วย
 * วาดที่ขนาดใดก็ได้ (1080 โพสต์ / 2400 ไวนิล) ตัวหนังสือคมทุกขนาด                       */

const R = (() => {
  const imgCache = {};
  function loadImg(src) {
    if (!imgCache[src]) imgCache[src] = new Promise((res, rej) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => rej(new Error('โหลดรูปไม่ได้: ' + src)); im.src = src;
    });
    return imgCache[src];
  }
  async function fontsReady() {
    await Promise.all([
      document.fonts.load('40px Pattaya', 'ทดสอบ 0123456789 .,:-()'),
      document.fonts.load('700 40px Sarabun', 'ทดสอบ 0123456789 .,:-()'),
      document.fonts.load('700 40px Charm', 'เหรียญทองเงินแดง'),
    ]);
  }

  /* ---------- ตัวช่วยข้อความ ---------- */
  function font(ctx, family, size, weight) { ctx.font = (weight || 400) + ' ' + size + 'px ' + family; }
  function width(ctx, text, family, size, weight) { font(ctx, family, size, weight); return ctx.measureText(text).width; }
  /** ขนาดตัวอักษรที่ใหญ่สุดที่ทุกบรรทัดกว้างไม่เกิน maxW */
  function fitSize(ctx, lines, family, size, weight, maxW, minSize) {
    let s = size;
    const w = Math.max(...lines.map(l => width(ctx, l, family, s, weight)));
    if (w > maxW) s = s * maxW / w;
    return Math.max(s, minSize || 0);
  }
  function drawText(ctx, text, x, y, o) {
    font(ctx, o.family, o.size, o.weight);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (o.shadow) { ctx.save(); ctx.shadowColor = o.shadow; ctx.shadowBlur = o.size * 0.12; ctx.shadowOffsetX = ctx.shadowOffsetY = o.size * 0.06; }
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = o.strokeW; ctx.strokeStyle = o.stroke; ctx.strokeText(text, x, y); }
    if (o.shadow) ctx.restore();
    ctx.fillStyle = o.color; ctx.fillText(text, x, y);
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawCover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, Math.max(0, (img.height - sh) * 0.35), sw, sh, x, y, w, h);
  }
  function joinThai(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(' ') + ' และ' + a[a.length - 1]; }

  /* ---------- ภาพแสดงความยินดี ---------- */
  const T = 708.66;
  const MEDAL = { 'ทอง': 'gold', 'เงิน': 'silver', 'ทองแดง': 'bronze' };

  /** ข้อความรางวัลบนภาพแสดงความยินดี: แสดง "ชนะเลิศ" เฉพาะอันดับ 1 ไม่แสดงอันดับอื่น */
  function awardText(it) {
    if (it.result === 'เข้าร่วม') return 'เกียรติบัตรเข้าร่วมการแข่งขัน';
    if (!it.result) return '';
    return (Number(it.rank) === 1 ? 'ชนะเลิศ ' : '') + 'ระดับเหรียญ' + it.result;
  }
  /** ข้อความผลบนหน้าเว็บ: แสดงอันดับจริง */
  function resultLabel(it) {
    if (!it.result) return '';
    const r = Number(it.rank);
    const base = it.result === 'เข้าร่วม' ? 'เข้าร่วม' : 'เหรียญ' + it.result;
    return base + (r === 1 ? ' · ชนะเลิศ' : r > 1 ? ' · อันดับ ' + r : '');
  }

  /** ป้ายเหรียญ: เหรียญเปล่า + ข้อความฟอนต์ Charm ขอบเข้ม */
  async function drawBadge(ctx, result, x, y, h) {
    const b = MEDAL[result]; if (!b) return;
    const img = await loadImg('assets/badge_' + b + '_blank.png?v=2');
    const w = h * img.width / img.height;
    ctx.drawImage(img, x, y, w, h);
    const cx = x + w / 2;
    const ink = { gold: '#4a1a06', silver: '#1f2a33', bronze: '#3d1405' }[b];
    const L = [['เหรียญ', y + h * 0.295, h * 0.155, w * 0.56], [result, y + h * 0.5, h * 0.18, w * 0.62]]
      .map(([t, cy, size, maxW]) => [t, cy, Math.min(size, size * maxW / width(ctx, t, 'Charm', size, 700))]);
    // วาดขอบทุกบรรทัดก่อน แล้วค่อยเติมสีขาว ขอบจะไม่ทับตัวอักษรบรรทัดอื่น
    L.forEach(([t, cy, s]) => drawText(ctx, t, cx, cy, { family: 'Charm', weight: 700, size: s, color: ink, stroke: ink, strokeW: s * 0.3, shadow: 'rgba(0,0,0,.35)' }));
    L.forEach(([t, cy, s]) => drawText(ctx, t, cx, cy, { family: 'Charm', weight: 700, size: s, color: '#ffffff' }));
  }

  async function congrats(canvas, it, photo, cfg) {
    await fontsReady();
    const S = canvas.width, k = S / T;
    const ctx = canvas.getContext('2d');
    const [bg, fg] = await Promise.all([loadImg('assets/congrats_bg.png'), loadImg('assets/congrats_fg.png')]);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(bg, 0, 0, S, S);
    const u = v => v * k;
    const MAXW = 520;

    // ชื่อนักเรียน: 1-2 คนบรรทัดเดียว / 3 คนขึ้นไป 2 บรรทัด
    const st = it.students || [];
    let nameLines, nameSize;
    if (st.length <= 2) {
      nameLines = [joinThai(st)];
      nameSize = fitSize(ctx, nameLines, 'Pattaya', 25, 400, MAXW, 14);
    } else {
      const h = Math.ceil(st.length / 2);
      nameLines = [st.slice(0, h).join(' '), st.slice(h).join(' ')];
      nameSize = Math.min(25 * 0.72, fitSize(ctx, nameLines, 'Pattaya', 25 * 0.72, 400, MAXW, 12));
    }
    const twoLineNames = nameLines.length > 1;

    // รูป
    const px = 117.3, py = 168, pw = 474, ph = twoLineNames ? 262 : 276, pr = 33;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = u(4); ctx.shadowOffsetX = ctx.shadowOffsetY = u(2.1);
    rrect(ctx, u(px), u(py), u(pw), u(ph), u(pr)); ctx.fillStyle = '#e7efe3'; ctx.fill();
    ctx.restore();
    if (photo) {
      ctx.save(); rrect(ctx, u(px), u(py), u(pw), u(ph), u(pr)); ctx.clip();
      drawCover(ctx, photo, u(px), u(py), u(pw), u(ph)); ctx.restore();
    }
    rrect(ctx, u(px), u(py), u(pw), u(ph), u(pr));
    ctx.lineWidth = u(6); ctx.strokeStyle = '#ffe699'; ctx.stroke();

    // ชั้นบน: ป้าย ขอแสดงความยินดี โลโก้ คลื่นทอง
    ctx.drawImage(fg, 0, 0, S, S);

    // ชื่อโรงเรียนบนป้ายเขียว
    drawText(ctx, cfg.school, u(354.3), u(44), {
      family: 'Pattaya', size: u(fitSize(ctx, [cfg.school], 'Pattaya', 30, 400, 360)),
      color: '#ffffff', stroke: '#005426', strokeW: u(5), shadow: 'rgba(0,0,0,.45)',
    });

    // ป้ายเหรียญ
    await drawBadge(ctx, it.result, u(10), u(12), u(158));

    // ชื่อนักเรียน + รางวัล
    const nameY = twoLineNames ? 456 + 4 : 466;
    const nameLH = nameSize * 1.12;
    nameLines.forEach((l, i) => drawText(ctx, l, u(354.3), u(nameY + (i - (nameLines.length - 1) / 2) * nameLH), {
      family: 'Pattaya', size: u(nameSize), color: '#ff1563', stroke: '#ffffff', strokeW: u(nameSize * 0.2),
    }));
    const aw = 'ได้รับรางวัล ' + awardText(it);
    const awSize = fitSize(ctx, [aw], 'Pattaya', 24, 400, MAXW, 14);
    drawText(ctx, aw, u(354.3), u(503), { family: 'Pattaya', size: u(awSize), color: '#262626', stroke: '#ffffff', strokeW: u(awSize * 0.2) });

    // รายละเอียด: รายการ / งาน / ระดับ / ครู  (วางต่อกันลงมา ไม่มีทางทับ)
    let itemLines = ['ในการแข่งขัน' + it.name];
    const oneLine = width(ctx, itemLines[0], 'Sarabun', 16 * 1.12, 700) <= MAXW;
    if (!oneLine) {
      const m = it.name.match(/^(.*\S)\s+((?:ชั้น|ระดับ)\s*\S.*)$/);
      itemLines = m ? ['ในการแข่งขัน' + m[1], m[2]] : itemLines;
    }
    const G = oneLine ? 1.12 : 1;
    const teach = 'ครูผู้ฝึกซ้อม : ' + joinThai(it.teachers || []);
    const blocks = [
      { lines: itemLines, size: 16 * G, gap: 0 },
      { lines: [cfg.event], size: 14 * G, gap: 6 },
      { lines: [cfg.level], size: 14 * G, gap: 2 },
      { lines: [teach], size: 13.5 * G, gap: 5 },
    ];
    blocks.forEach(bl => { bl.size = fitSize(ctx, bl.lines, 'Sarabun', bl.size, 700, MAXW, 9); });
    // ถ้ายาวเกินขอบคลื่นทอง ย่อทั้งชุด
    const total = bl => bl.reduce((s, x) => s + x.gap + x.lines.length * x.size * 1.3, 0);
    const avail = 652 - 520;
    const sh = Math.min(1, avail / total(blocks));
    let y = 520;
    blocks.forEach(bl => {
      y += bl.gap * sh;
      bl.lines.forEach(l => {
        const s = bl.size * sh, lh = s * 1.3;
        drawText(ctx, l, u(354.3), u(y + lh / 2), { family: 'Sarabun', weight: 700, size: u(s), color: '#262626', stroke: '#ffffff', strokeW: u(Math.max(1.6, s * 0.17)) });
        y += lh;
      });
    });
  }

  /* ---------- ภาพสรุปผล 16:9 ---------- */
  async function summary(canvas, st, cfg, execs) {
    await fontsReady();
    const W = canvas.width, k = W / 1280, u = v => v * k;
    const ctx = canvas.getContext('2d');
    const [bg, logo, mg, ms, mb, tr] = await Promise.all(['assets/summary_bg.jpg', 'assets/logo74.png',
      'assets/medal_gold.png', 'assets/medal_silver.png', 'assets/medal_bronze.png', 'assets/trophy.png'].map(loadImg));
    ctx.drawImage(bg, 0, 0, W, u(720));
    const lw = 128 * logo.width / logo.height;
    ctx.save(); ctx.shadowColor = 'rgba(90,60,10,.3)'; ctx.shadowBlur = u(6); ctx.shadowOffsetY = u(4);
    ctx.drawImage(logo, u(640 - lw / 2), u(10), u(lw), u(128)); ctx.restore();
    const t = (s, x, y, o) => drawText(ctx, s, u(x), u(y), Object.assign({}, o, { size: u(o.size), strokeW: u(o.strokeW || 0) }));
    t(cfg.school, 640, 170, { family: 'Pattaya', size: 60, color: '#0b6b2e', stroke: '#fff', strokeW: 7 });
    t('สรุปผลการแข่งขัน' + cfg.event.replace('งาน', ''), 640, 225, { family: 'Pattaya', size: fitSize(ctx, ['สรุปผลการแข่งขัน' + cfg.event.replace('งาน', '')], 'Pattaya', 29, 400, 900), color: '#8a5a14', stroke: '#fff', strokeW: 5 });
    t(cfg.level, 640, 256, { family: 'Sarabun', weight: 700, size: 18, color: '#444', stroke: '#fff', strokeW: 4 });
    if (execs) { const eh = 452, ew = eh * execs.width / execs.height; ctx.drawImage(execs, u(215), u(262), u(ew), u(eh)); }
    const C = 850;
    t('เข้าร่วมแข่งขัน ' + st.total + ' รายการ', C, 290, { family: 'Pattaya', size: 31, color: '#c2185b', stroke: '#fff', strokeW: 5 });
    [[mg, st.gold, 'เหรียญทอง', '#7a5410'], [ms, st.silver, 'เหรียญเงิน', '#4b555c'], [mb, st.bronze, 'เหรียญทองแดง', '#6e3412']].forEach(([img, n, lab, col], i) => {
      const cx = C - 155 + i * 155;
      ctx.drawImage(img, u(cx - 72), u(312), u(144), u(144 * img.height / img.width));
      t(String(n), cx, 370, { family: 'Pattaya', size: 56, color: col, stroke: 'rgba(255,255,255,.7)', strokeW: 2 });
      t(lab, cx, 472, { family: 'Pattaya', size: 28, color: col, stroke: '#fff', strokeW: 5 });
    });
    const th = 150, tw = th * tr.width / tr.height;
    // ป้ายชนะเลิศ
    ctx.save(); rrect(ctx, u(767), u(517), u(306), u(76), u(38)); ctx.fillStyle = '#fff'; ctx.fill();
    rrect(ctx, u(770), u(520), u(300), u(70), u(35)); ctx.fillStyle = '#0b6b2e'; ctx.fill();
    ctx.lineWidth = u(2.5); ctx.strokeStyle = '#d9b56a'; ctx.stroke(); ctx.restore();
    t('ชนะเลิศ ' + st.first + ' รายการ', 931, 555, { family: 'Pattaya', size: 36, color: '#ffe9a6' });
    ctx.save(); ctx.shadowColor = 'rgba(90,60,10,.3)'; ctx.shadowBlur = u(8); ctx.shadowOffsetY = u(6);
    ctx.drawImage(tr, u(640), u(486), u(tw), u(th)); ctx.restore();
  }

  function stats(items) {
    const r = { total: items.length, gold: 0, silver: 0, bronze: 0, joined: 0, first: 0, done: 0 };
    items.forEach(i => {
      if (i.result) r.done++;
      if (i.result === 'ทอง') r.gold++; else if (i.result === 'เงิน') r.silver++; else if (i.result === 'ทองแดง') r.bronze++; else if (i.result === 'เข้าร่วม') r.joined++;
      if (i.result && Number(i.rank) === 1) r.first++;
    });
    return r;
  }

  function canvasBlob(canvas, type, q) { return new Promise(res => canvas.toBlob(res, type || 'image/png', q)); }

  return { congrats, summary, stats, awardText, resultLabel, loadImg, fontsReady, canvasBlob };
})();
