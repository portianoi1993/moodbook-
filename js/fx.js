/* MoodBook — motion & atmosphere layer (vanilla, no deps).
   Skills applied: mesh-gradient-dark-blue-clean + atmosphere-background (canvas light field),
   soft-skill (magnetic button-in-button, blur-rise reveals), animation-systems (choreography, easing),
   reveal/spotlight borders, marquee-loop, emil-design-eng (durations, press feedback),
   optimize-web-animations (DPR cap, pause when hidden, transform/opacity only). */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
document.documentElement.classList.add('js');

/* ───────── 1. Mesh / light-field canvas ───────── */
export function mountMesh(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const orbs = [
    { c: [124, 109, 255], r: 0.55, x: 0.22, y: 0.35, dx: 0.00011, dy: 0.00007, a: 0.55 },
    { c: [45, 212, 191], r: 0.42, x: 0.78, y: 0.30, dx: -0.00009, dy: 0.00012, a: 0.38 },
    { c: [167, 139, 250], r: 0.48, x: 0.60, y: 0.85, dx: 0.00008, dy: -0.0001, a: 0.32 },
    { c: [56, 189, 248], r: 0.30, x: 0.15, y: 0.9, dx: 0.00013, dy: -0.00006, a: 0.22 },
  ];
  let w = 0, h = 0, raf = 0, t0 = performance.now(), running = false;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.25) * 0.5; // render at half res, blur hides it
  function size() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * DPR)); h = Math.max(1, Math.round(r.height * DPR));
    canvas.width = w; canvas.height = h;
  }
  function frame(now) {
    const t = now - t0;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const o of orbs) {
      const x = (o.x + Math.sin(t * o.dx * 6) * 0.08) * w;
      const y = (o.y + Math.cos(t * o.dy * 6) * 0.08) * h;
      const rad = o.r * Math.max(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${o.c},${o.a})`); g.addColorStop(0.45, `rgba(${o.c},${o.a * 0.35})`); g.addColorStop(1, `rgba(${o.c},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    // vertical light folds (atmosphere-background)
    for (let i = 0; i < 3; i++) {
      const cx = ((0.2 + i * 0.3) + Math.sin(t * 0.00005 + i) * 0.06) * w;
      const g = ctx.createLinearGradient(cx - w * 0.12, 0, cx + w * 0.12, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.045)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (running && !reduce) raf = requestAnimationFrame(frame);
  }
  function start() { if (running) return; running = true; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  size(); frame(performance.now()); if (!reduce) start();
  addEventListener('resize', () => { size(); if (reduce) frame(performance.now()); }, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if ('IntersectionObserver' in window) new IntersectionObserver((e) => e[0].isIntersecting ? start() : stop(), { threshold: 0 }).observe(canvas);
}

/* ───────── 2. Scroll reveals (blur-rise, staggered children) ───────── */
export function mountReveals() {
  const els = document.querySelectorAll('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
  els.forEach((el) => io.observe(el));
  setTimeout(() => els.forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in'); }), 1200); // background tabs
}

/* ───────── 3. Word reveal for headlines (accessible split) ───────── */
export function splitWords(el) {
  if (!el || el.dataset.split) return;
  el.dataset.split = '1';
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  const frag = document.createDocumentFragment();
  let i = 0;
  text.split(/(\s+)/).forEach((part) => {
    if (!part) return;
    if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
    const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span'); inner.textContent = part; inner.style.setProperty('--i', i++);
    w.appendChild(inner); frag.appendChild(w);
  });
  el.textContent = ''; el.appendChild(frag);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  setTimeout(() => el.classList.add('is-in'), 1400);
}

/* ───────── 4. Magnetic buttons + press physics ───────── */
export function mountMagnetic(root = document) {
  if (!finePointer || reduce) return;
  root.querySelectorAll('[data-magnetic]').forEach((btn) => {
    if (btn.dataset.magneticReady) return; btn.dataset.magneticReady = '1';
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    const tick = () => { cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18; btn.style.transform = `translate3d(${cx}px,${cy}px,0)`; if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) raf = requestAnimationFrame(tick); else raf = 0; };
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * 0.22; ty = (e.clientY - (r.top + r.height / 2)) * 0.22;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    btn.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
  });
}

/* ───────── 5. Cursor spotlight on glass cards (border + sheen follow the pointer) ───────── */
export function mountSpotlight(root = document) {
  if (!finePointer) return;
  root.querySelectorAll('[data-spot]').forEach((card) => {
    if (card.dataset.spotReady) return; card.dataset.spotReady = '1';
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  });
}

/* ───────── 6. Seamless marquee (duplicate track once) ───────── */
export function mountMarquee() {
  document.querySelectorAll('[data-marquee]').forEach((m) => {
    const track = m.firstElementChild; if (!track || m.dataset.ready) return;
    m.dataset.ready = '1';
    track.setAttribute('aria-hidden', 'false');
    const clone = track.cloneNode(true); clone.setAttribute('aria-hidden', 'true'); m.appendChild(clone);
  });
}

/* ───────── 7. Parallax tilt for the hero demo card (subtle, pointer only) ───────── */
export function mountTilt(el) {
  if (!el || !finePointer || reduce) return;
  const zone = el.parentElement;
  let raf = 0, rx = 0, ry = 0, tx = 0, ty = 0;
  const tick = () => { rx += (tx - rx) * 0.12; ry += (ty - ry) * 0.12; el.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg)`; if (Math.abs(tx - rx) > 0.02 || Math.abs(ty - ry) > 0.02) raf = requestAnimationFrame(tick); else raf = 0; };
  zone.addEventListener('pointermove', (e) => { const r = zone.getBoundingClientRect(); ty = ((e.clientX - r.left) / r.width - 0.5) * 8; tx = -((e.clientY - r.top) / r.height - 0.5) * 8; if (!raf) raf = requestAnimationFrame(tick); });
  zone.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
}

export function mountAll() {
  mountMesh(document.getElementById('mesh'));
  mountReveals();
  document.querySelectorAll('[data-words]').forEach(splitWords);
  mountMagnetic();
  mountSpotlight();
  mountMarquee();
  mountTilt(document.querySelector('[data-tilt]'));
}
