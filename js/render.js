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
    if (o.box) {   // จัดกึ่งกลางแนวตั้งตามขอบตัวอักษรจริง (รวมสระบน-ล่าง)
      ctx.textBaseline = 'alphabetic';
      const m = ctx.measureText(text);
      y = y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    }
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
    const [bg, fg] = await Promise.all([loadImg('assets/congrats_bg.png'), loadImg('assets/congrats_fg.png?v=2')]);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(bg, 0, 0, S, S);
    const u = v => v * k;
    const MAXW = 540, CX = 354.3, BOTTOM = 640;

    // ---------- เตรียมข้อความทั้งหมดก่อน แล้วค่อยจัดวางจากบนลงล่าง ----------
    const st = it.students || [];
    // 1-2 คน 1 บรรทัด / 3-6 คน 2 บรรทัด / 7-9 คน 3 บรรทัด / 10 คนขึ้นไป 4 บรรทัด
    const nL = st.length <= 2 ? 1 : st.length <= 6 ? 2 : st.length <= 9 ? 3 : 4;
    const per = Math.ceil(st.length / nL);
    const nameLines = nL === 1 ? [joinThai(st)] : Array.from({ length: nL }, (_, i) => st.slice(i * per, (i + 1) * per).join(' ')).filter(Boolean);
    const aw = 'ได้รับรางวัล ' + awardText(it);
    let itemLines = ['ในการแข่งขัน' + it.name];
    if (width(ctx, itemLines[0], 'Sarabun', 19, 700) > MAXW) {
      const m = it.name.match(/^(.*\S)\s+((?:ชั้น|ระดับ)\s*\S.*)$/);
      if (m) itemLines = ['ในการแข่งขัน' + m[1], m[2]];
    }
    const tc = it.teachers || [];
    let teachLines = ['ครูผู้ฝึกซ้อม : ' + joinThai(tc)];
    if (tc.length > 2 && width(ctx, teachLines[0], 'Sarabun', 16, 700) > MAXW * 1.15) {
      const h = Math.ceil(tc.length / 2);
      teachLines = ['ครูผู้ฝึกซ้อม : ' + tc.slice(0, h).join(' '), joinThai(tc.slice(h)).replace(/^และ/, '')];
      teachLines[1] = tc.slice(h, -1).concat(['และ' + tc[tc.length - 1]]).join(' ');
    }
    // ขนาดที่ต้องการ (หน่วยอ้างอิง 708.66) ระยะห่างก่อนบล็อก และระยะบรรทัด
    const blocks = [
      { lines: nameLines, fam: 'Pattaya', w: 400, size: nameLines.length === 1 ? 29 : nameLines.length === 2 ? 22 : 19, lh: 1.38, gap: 0, color: '#ff1563', name: 1 },
      { lines: [aw], fam: 'Pattaya', w: 400, size: 26, lh: 1.3, gap: 2, color: '#262626' },
      { lines: itemLines, fam: 'Sarabun', w: 700, size: itemLines.length > 1 ? 17.5 : 19, lh: 1.5, gap: 4, color: '#262626' },
      { lines: [cfg.event], fam: 'Sarabun', w: 700, size: 16, lh: 1.5, gap: 4, color: '#262626' },
      { lines: [cfg.level], fam: 'Sarabun', w: 700, size: 16, lh: 1.5, gap: 0, color: '#262626' },
      { lines: teachLines, fam: 'Sarabun', w: 700, size: 16, lh: 1.5, gap: 5, color: '#262626' },
    ];
    blocks.forEach(bl => { bl.size = fitSize(ctx, bl.lines, bl.fam, bl.size, bl.w, MAXW, 9); });
    const textH = k2 => blocks.reduce((h, bl) => h + bl.gap * k2 + bl.lines.length * bl.size * k2 * bl.lh, 0);

    // รูป: สูงสุด 276 ลดลงได้ถึง 236 เพื่อให้ตัวหนังสือมีที่ / เว้นจากกรอบรูปอย่างน้อย 16
    const px = 117.3, py = 168, pw = 474, pr = 33, GAP = 16;
    let ph = Math.min(276, BOTTOM - textH(1) - GAP - py);
    let sh = 1;
    if (ph < 220) { ph = 220; sh = (BOTTOM - py - ph - GAP) / textH(1); }

    // ---------- รูป ----------
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
    drawText(ctx, cfg.school, u(CX), u(50), { box: true,
      family: 'Pattaya', size: u(fitSize(ctx, [cfg.school], 'Pattaya', 30, 400, 360)),
      color: '#ffffff', stroke: '#005426', strokeW: u(5), shadow: 'rgba(0,0,0,.45)',
    });

    // ป้ายเหรียญ
    await drawBadge(ctx, it.result, u(10), u(12), u(158));

    // ---------- ข้อความ: วางต่อกันลงมาจากใต้กรอบรูป ไม่มีทางทับกัน ----------
    let y = py + ph + 3 + GAP;   // 3 = ครึ่งหนึ่งของเส้นกรอบ
    blocks.forEach(bl => {
      y += bl.gap * sh;
      bl.lines.forEach(l => {
        const sz = bl.size * sh, lh = sz * bl.lh;
        drawText(ctx, l, u(CX), u(y + lh / 2), {
          family: bl.fam, weight: bl.w, size: u(sz), color: bl.color, stroke: '#ffffff',
          strokeW: u(bl.name ? sz * 0.2 : bl.fam === 'Pattaya' ? sz * 0.2 : Math.max(1.6, sz * 0.17)),
        });
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
