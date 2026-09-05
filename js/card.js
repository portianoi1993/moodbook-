/* MoodBook — Reading Card: a shareable 1080×1350 image of a book and its soundtrack.
   Drawn on a <canvas> with the site's own palette and fonts. No dependencies. */

const W = 1080, H = 1350;
const C = {
  cream: '#F7F0E6', paper: '#FFFBF4', ink: '#2C2430', ink2: '#655A66', ink3: '#948896',
  pastel: ['#D3C8F0', '#F2CDB5', '#C4E6D6', '#F1E0B0', '#C9DDEE', '#EFC9D3'],
  deep: ['#6B5AA8', '#B5643A', '#2E7D63', '#9A6E1F', '#3A6C93', '#A94A6C'],
};

const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = last.replace(/\s*\S+$/, '');
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `/api/cover?u=${encodeURIComponent(src)}`;
  });
}

async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load('600 64px Fraunces'), document.fonts.load('italic 400 34px Fraunces'),
      document.fonts.load('600 34px Figtree'), document.fonts.load('400 28px Figtree'),
    ]);
  } catch {}
}

function drawLogo(ctx, x, y, s) {
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, '#EDAE8A'); g.addColorStop(.55, '#B3A2E6'); g.addColorStop(1, '#8CCDB4');
  ctx.fillStyle = g; rr(ctx, x, y, s, s, s * .28); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  const bars = [.38, .62, .84, .5];
  bars.forEach((h, i) => { const bw = s * .1, gap = s * .07, total = bars.length * bw + (bars.length - 1) * gap; const bx = x + (s - total) / 2 + i * (bw + gap); const bh = s * h * .8; rr(ctx, bx, y + (s - bh) / 2, bw, bh, bw / 2); ctx.fill(); });
}

/**
 * @param {{book:{title,author,cover,genre}, why:string, tracks:Array<{name,vibe}>, scene?:string, style?:string, url:string, host:string}} data
 * @returns {Promise<Blob>} PNG
 */
export async function renderReadingCard(data) {
  await ensureFonts();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const cover = await loadImage(data.book.cover);

  // paper + two soft blobs
  ctx.fillStyle = C.cream; ctx.fillRect(0, 0, W, H);
  const blob = (x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
  blob(160, 220, 520, 'rgba(211,200,240,.75)'); blob(960, 380, 560, 'rgba(242,205,181,.7)'); blob(520, 1250, 620, 'rgba(196,230,214,.6)');

  // inner paper sheet
  ctx.save(); ctx.shadowColor = 'rgba(60,40,70,.18)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  ctx.fillStyle = C.paper; rr(ctx, 56, 56, W - 112, H - 112, 44); ctx.fill(); ctx.restore();

  // brand
  drawLogo(ctx, 100, 100, 56);
  ctx.fillStyle = C.ink; ctx.font = '600 40px Fraunces, Georgia, serif'; ctx.textBaseline = 'middle'; ctx.fillText('MoodBook', 172, 128);
  ctx.fillStyle = C.ink3; ctx.font = '600 22px Figtree, sans-serif'; ctx.letterSpacing = '3px';
  const tag = 'READING CARD'; ctx.fillText(tag, W - 100 - ctx.measureText(tag).width, 128); ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';

  // cover (tilted, white frame) or placeholder
  const cx = 110, cy = 216, cw = 300, ch = 450;
  ctx.save(); ctx.translate(cx + cw / 2, cy + ch / 2); ctx.rotate(-3 * Math.PI / 180);
  ctx.shadowColor = 'rgba(44,36,48,.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 22;
  ctx.fillStyle = '#fff'; rr(ctx, -cw / 2 - 8, -ch / 2 - 8, cw + 16, ch + 16, 14); ctx.fill(); ctx.shadowColor = 'transparent';
  rr(ctx, -cw / 2, -ch / 2, cw, ch, 10); ctx.clip();
  if (cover) {
    const s = Math.max(cw / cover.width, ch / cover.height); const dw = cover.width * s, dh = cover.height * s;
    ctx.drawImage(cover, -dw / 2, -dh / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2); g.addColorStop(0, C.pastel[1]); g.addColorStop(.6, C.pastel[0]); g.addColorStop(1, C.pastel[2]);
    ctx.fillStyle = g; ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    ctx.fillStyle = C.ink; ctx.font = '600 34px Fraunces, Georgia, serif'; ctx.textAlign = 'center';
    wrap(ctx, data.book.title, cw - 60, 4).forEach((l, i) => ctx.fillText(l, 0, -40 + i * 42)); ctx.textAlign = 'left';
  }
  ctx.restore();

  // title / author / genre
  const tx = 460, tw = W - tx - 100;
  ctx.fillStyle = C.ink; ctx.font = '600 58px Fraunces, Georgia, serif';
  let y = 290;
  for (const l of wrap(ctx, data.book.title, tw, 3)) { ctx.fillText(l, tx, y); y += 66; }
  ctx.fillStyle = C.ink2; ctx.font = '500 30px Figtree, sans-serif'; y += 6; ctx.fillText(wrap(ctx, data.book.author || '', tw, 1)[0] || '', tx, y); y += 30;
  const chips = [data.book.genre, data.scene, data.style].filter(Boolean).slice(0, 3);
  let chipX = tx; y += 26;
  ctx.font = '600 22px Figtree, sans-serif';
  chips.forEach((c, i) => {
    const label = wrap(ctx, c, 300, 1)[0]; const w = ctx.measureText(label).width + 40;
    if (chipX + w > tx + tw) return;
    ctx.fillStyle = C.pastel[i % 6]; rr(ctx, chipX, y - 24, w, 44, 22); ctx.fill();
    ctx.fillStyle = C.deep[i % 6]; ctx.fillText(label, chipX + 20, y + 6); chipX += w + 12;
  });
  y += 70;
  ctx.fillStyle = C.ink2; ctx.font = 'italic 400 31px Fraunces, Georgia, serif';
  for (const l of wrap(ctx, data.why, tw, 4)) { ctx.fillText(l, tx, y); y += 42; }

  // tracklist
  let ly = Math.max(y + 40, 740);
  ctx.fillStyle = C.ink3; ctx.font = '600 20px Figtree, sans-serif'; ctx.letterSpacing = '3px'; ctx.fillText('THE SOUNDTRACK', 110, ly); ctx.letterSpacing = '0px';
  ly += 34;
  const tracks = (data.tracks || []).slice(0, 6);
  const rowH = Math.min(84, Math.floor((H - 150 - ly) / Math.max(1, tracks.length)));
  tracks.forEach((t, i) => {
    const ry = ly + i * rowH;
    ctx.fillStyle = C.pastel[i % 6]; ctx.beginPath(); ctx.arc(136, ry + rowH / 2, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.deep[i % 6]; ctx.font = '700 22px Figtree, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), 136, ry + rowH / 2 + 8); ctx.textAlign = 'left';
    ctx.fillStyle = C.ink; ctx.font = '600 31px Figtree, sans-serif'; ctx.fillText(wrap(ctx, t.name, 620, 1)[0], 184, ry + rowH / 2 + 2);
    ctx.fillStyle = C.ink3; ctx.font = '400 24px Figtree, sans-serif'; ctx.fillText(wrap(ctx, `${t.vibe || ''}`, 560, 1)[0], 184, ry + rowH / 2 + 32);
    ctx.fillStyle = C.ink3; ctx.font = '500 22px Figtree, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('~1 hr', W - 110, ry + rowH / 2 + 8); ctx.textAlign = 'left';
    if (i < tracks.length - 1) { ctx.fillStyle = 'rgba(44,36,48,.08)'; ctx.fillRect(184, ry + rowH - 1, W - 294, 1); }
  });

  // footer
  ctx.fillStyle = 'rgba(44,36,48,.1)'; ctx.fillRect(110, H - 132, W - 220, 1);
  ctx.fillStyle = C.ink2; ctx.font = 'italic 400 26px Fraunces, Georgia, serif'; ctx.fillText('Every book has a sound.', 110, H - 88);
  ctx.fillStyle = C.ink; ctx.font = '600 26px Figtree, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(data.host, W - 110, H - 88); ctx.textAlign = 'left';

  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Card render failed'))), 'image/png'));
}
