import { mountAll, mountMagnetic, mountSpotlight } from './fx.js';
import { t, initI18n, getLang, setLang, LANGS } from './i18n.js';
/* MoodBook v2 — vanilla JS, no build step. */
await initI18n(); // load the dictionary and translate static copy before anything measures or splits it

// ═══════════════ config ═══════════════
const FREE_TOTAL = 5; // five books to try, ever (not per day); then Pro. Books already on the shelf replay for free.
const PROMO_CODES = ['MOODBOOK2024', 'BLOGGER2024', 'PROMOBOOK', 'READERPRO', 'MBREADER'];
const PRICE = { monthly: '$9.99', annual: '$99.99' };

// ═══════════════ tiny helpers ═══════════════
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayKey = () => new Date().toISOString().slice(0, 10);
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  raw(k) { try { return localStorage.getItem(k); } catch { return null; } },
  put(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
async function api(path, params = {}) {
  const u = new URL(path, location.origin);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  const r = await fetch(u);
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const e = new Error(data?.error || t('Request failed ({status})', { status: r.status }));
    e.detail = data?.detail || (r.status === 429 ? t('Rate limit reached. Try again in a few minutes.') : '');
    e.status = r.status;
    throw e;
  }
  return data;
}

// ═══════════════ state ═══════════════
const S = {
  book: null,          // {title, author, cover, genre, desc, ...}
  ai: null,            // {book, why, moods, tracks}
  mood: '',
  tracks: [],
  playingIdx: -1,
  queue: [],           // tracks currently loaded into the player context
  playingFrom: 'results',
};
const DB = {
  books: ls.get('mb_books', []),
  liked: ls.get('mb_liked_tracks', []),
  history: ls.get('mb_history', []), // recently played: {name, vibe, query, book, cover, at}
};
const save = () => { ls.set('mb_books', DB.books); ls.set('mb_liked_tracks', DB.liked); ls.set('mb_history', DB.history.slice(0, 30)); };
const timeAgo = (ts) => {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return t('{m} min ago', { m });
  const h = Math.round(m / 60); if (h < 24) return t('{h} h ago', { h });
  const d = Math.round(h / 24); return d === 1 ? t('yesterday') : t('{d} days ago', { d });
};
const isPro = () => ls.raw('mb_pro') === 'true';
const totalSearches = () => +(ls.raw('mb_total_searches') || 0);
const bumpSearches = () => {
  ls.set('mb_day_' + todayKey(), ls.get('mb_day_' + todayKey(), 0) + 1); // kept for stats
  ls.put('mb_total_searches', String(totalSearches() + 1));
};
const freeLeft = () => Math.max(0, FREE_TOTAL - totalSearches());

// ═══════════════ toast ═══════════════
let toastTimer, toastUndo;
function toast(msg, { ms = 2800, undo } = {}) {
  const box = $('#toast');
  clearTimeout(toastTimer);
  toastUndo = undo || null;
  box.innerHTML = `<span>${msg}</span>${undo ? `<button type="button" id="undoBtn">${t('Undo')}</button>` : ''}`;
  box.classList.add('is-on');
  if (undo) $('#undoBtn').onclick = () => { toastUndo?.(); hideToast(); };
  toastTimer = setTimeout(hideToast, undo ? 5200 : ms);
}
function hideToast() { $('#toast').classList.remove('is-on'); toastUndo = null; }

// ═══════════════ router ═══════════════
const PAGES = ['discover', 'library', 'account'];
function showPage(p, { push = true } = {}) {
  if (!PAGES.includes(p)) p = 'discover';
  PAGES.forEach((n) => {
    const on = n === p;
    $('#page-' + n).hidden = !on;
    $('#page-' + n).classList.toggle('is-active', on);
  });
  $$('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === p && a.matches('.tab-top,.tab-bottom');
    a.classList.toggle('is-active', on);
    if (a.matches('.tab-top,.tab-bottom')) a.setAttribute('aria-current', on ? 'page' : 'false');
  });
  if (p === 'library') { renderShelf(); renderLiked(); renderHistory(); hydrateCovers(); }
  if (p === 'account') renderAccount();
  if (push && location.hash !== '#' + p) history.replaceState(null, '', p === 'discover' ? location.pathname + location.search : '#' + p);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  document.title = p === 'discover' && S.book ? `${S.book.title} — MoodBook` : t("MoodBook — A soundtrack for the book you're reading");
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-nav]');
  if (!a) return;
  e.preventDefault();
  showPage(a.dataset.nav);
});
window.addEventListener('hashchange', () => showPage(location.hash.slice(1) || 'discover', { push: false }));

// ═══════════════ autocomplete ═══════════════
function attachAutocomplete(input, list, onPick) {
  let timer, items = [], active = -1, reqId = 0;
  const close = () => { list.hidden = true; list.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const render = () => {
    if (!items.length) return close();
    list.innerHTML = items.map((b, i) => `
      <li role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="${i === active}">
        ${b.cover ? `<img src="${esc(b.cover)}" alt="" width="32" height="46" loading="lazy">` : '<span class="ph"></span>'}
        <span class="w"><span class="t">${esc(b.title)}</span><span class="a">${esc(b.author || 'Unknown author')}${b.year ? ' · ' + esc(b.year) : ''}</span></span>
      </li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    place();
  };
  // Never let the list run off screen: flip it above the field when there is more room there,
  // and always cap its height to the space actually available.
  const place = () => {
    if (list.hidden) return;
    const anchor = input.getBoundingClientRect();
    const below = innerHeight - anchor.bottom - 16;
    const above = anchor.top - 16;
    const up = below < 220 && above > below;
    list.classList.toggle('is-up', up);
    list.style.maxHeight = Math.max(150, Math.min(380, up ? above : below)) + 'px';
  };
  addEventListener('resize', place, { passive: true });
  addEventListener('scroll', place, { passive: true });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      const my = ++reqId;
      try {
        const d = await api('/api/books', { q, limit: 6 });
        if (my !== reqId) return;
        items = d.items || []; active = -1; render();
      } catch { close(); }
    }, 260);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      $$('li', list).forEach((li, i) => li.setAttribute('aria-selected', i === active));
      input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault(); const b = items[active]; close(); onPick(b);
    } else if (e.key === 'Escape') close();
  });
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    e.preventDefault(); const b = items[+li.dataset.i]; close(); onPick(b);
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  return { close };
}

// ═══════════════ discover / search ═══════════════
const el = {
  q: $('#q'), form: $('#searchForm'), hero: $('#hero'), results: $('#results'), paywall: $('#paywall'),
  bookCard: $('#bookCard'), moodGrid: $('#moodGrid'), tracks: $('#tracks'), status: $('#status'), tracksMeta: $('#tracksMeta'),
  quota: $('#quota'), saveBtn: $('#saveBtn'), shareBtn: $('#shareBtn'),
};
const mainAC = attachAutocomplete(el.q, $('#suggest'), (b) => { el.q.value = b.title; startSearch(b.title, b); });

el.form.addEventListener('submit', (e) => { e.preventDefault(); mainAC.close(); startSearch(el.q.value); });
$$('.chip').forEach((c) => c.addEventListener('click', () => { el.q.value = c.dataset.q; startSearch(c.dataset.q); }));
$('#backBtn').addEventListener('click', resetSearch);

function renderQuota() {
  const chip = $('#planChip');
  chip.textContent = isPro() ? 'Pro' : 'Free';
  chip.classList.toggle('is-pro', isPro());
  if (isPro()) { el.quota.innerHTML = t('<b>Pro</b> · unlimited books'); el.quota.classList.remove('is-low'); return; }
  const left = freeLeft();
  el.quota.innerHTML = left > 0 ? t('<b>{n} of {max}</b> free {word} left', { n: left, max: FREE_TOTAL, word: left === 1 ? 'book' : 'books' }) : t('<b>Your {max} free books are used</b> · Pro continues where you left off', { max: FREE_TOTAL });
  el.quota.classList.toggle('is-low', left <= 1);
}

function setStatus(msg) {
  el.status.classList.toggle('is-on', !!msg);
  el.status.innerHTML = msg ? `<span class="dots"><i></i><i></i><i></i></span><span>${esc(msg)}</span>` : '';
}
function skeletonTracks(n = 6) {
  el.tracks.innerHTML = Array.from({ length: n }, () => `<li class="track sk-row" aria-hidden="true"><span class="n sk">0</span><span class="info"><span class="name sk" style="width:${45 + Math.random() * 35}%">.</span><span class="vibe sk" style="width:${30 + Math.random() * 20}%;margin-top:6px">.</span></span><span class="acts"><span class="icon-btn sk" style="border-radius:50%"></span><span class="icon-btn sk" style="border-radius:50%"></span></span></li>`).join('');
}
function skeletonMoods() { el.moodGrid.innerHTML = Array.from({ length: 6 }, () => '<span class="mood sk"></span>').join(''); }
function skeletonBook(title) {
  el.bookCard.innerHTML = `<div class="cover ph sk"></div><div><h2>${esc(title)}</h2><p class="by sk" style="width:60%">.</p><div class="tags"><span class="tag sk" style="width:70px">.</span><span class="tag sk" style="width:90px">.</span></div><p class="why sk" style="width:95%;height:38px">.</p></div>`;
}

const normT = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
// Does the catalogue candidate plausibly *be* what the user typed? (guards against "Dune" → "The Science of Dune")
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'by', 'книга', 'роман']);
function candidateMatches(cand, q) {
  if (!cand) return false;
  const t = normT(cand.title), n = normT(q), a = normT(cand.author);
  if (!t || !n) return false;
  if (t === n || n === `${t} ${a}`.trim()) return true;
  const tw = t.split(' '), nw = n.split(' ');
  if (n.includes(t) && tw.length >= 2) return true;                                 // typed "dune frank herbert", title "dune frank"
  if (t.startsWith(n + ' ') && tw.length - nw.length <= 1) return true;               // "fourth wing" → "fourth wing: a novel"
  const qt = nw.filter((x) => x.length > 2 && !STOP.has(x));
  const hits = qt.filter((x) => tw.includes(x) || a.includes(x)).length;
  return qt.length >= 2 && hits === qt.length && tw.length <= qt.length + 2;         // all meaningful words present, title not much longer
}

// Every meaningful word of the query is part of the author's name(s) and none is in the title → an author search.
function authorMatches(cand, q) {
  if (!cand?.author) return false;
  const a = normT([cand.author, ...(cand.authors || [])].join(' ')).split(' '), tl = normT(cand.title).split(' ');
  const words = normT(q).split(' ').filter((x) => x.length > 1 && !STOP.has(x));
  return words.length > 0 && words.every((w) => a.some((x) => x === w || x.startsWith(w))) && !words.some((w) => tl.includes(w));
}

async function startSearch(raw, picked = null, { free = false } = {}) {
  const q = String(raw || '').trim();
  if (!q) { el.q.focus(); return; }
  // Books already on the shelf were paid for with a free credit once; replaying them never costs another.
  const onShelf = free || DB.books.some((b) => b.title.toLowerCase() === (picked?.title || q).toLowerCase());
  if (!isPro() && !onShelf && freeLeft() <= 0) { showPaywall(); return; }

  // reset view
  S.book = null; S.ai = null; S.mood = ''; S.style = ''; S.tracks = [];
  el.hero.hidden = true; el.paywall.hidden = true; el.results.hidden = false;
  el.saveBtn.classList.remove('is-done'); el.saveBtn.textContent = t('+ Save to shelf');
  skeletonBook(picked?.title || q); skeletonMoods(); skeletonTracks(); el.tracksMeta.textContent = '';
  setStatus(t('Identifying the book…'));
  history.replaceState(null, '', `${location.pathname}?b=${encodeURIComponent(q)}`);
  window.scrollTo({ top: 0, behavior: 'auto' });

  // 1) catalogue lookup (fast, cached). Only trust it as a hint when it clearly matches the query.
  let book = picked, trusted = !!picked;
  if (!book) {
    let cand = null;
    try { cand = (await api('/api/books', { q, best: '1' })).book; } catch {}
    trusted = candidateMatches(cand, q);
    if (!trusted && authorMatches(cand, q)) {
      // The reader typed an author's name: open their best-known book and say so.
      trusted = true;
      toast(t('Showing the best-known book by {author}. Pick another one from the suggestions.', { author: esc(cand.author) }), { ms: 4200 });
    }
    book = trusted ? cand : { title: q, author: '', cover: '', genre: '', desc: '' };
  }
  S.book = { ...book, genre: book.genre || book.categories || '', trusted };
  renderBookCard();

  // 2) AI identifies the book (its strength) and composes the soundtrack
  if (!onShelf) bumpSearches();
  renderQuota();
  await loadSoundtrack();
}

// After the AI names the book, fetch the right cover/description if the catalogue guess was untrusted or disagrees.
async function reconcileIdentity(aiBook) {
  const b = S.book;
  if (!aiBook?.author || aiBook.known === false) return;
  // A book the reader picked from the list (or that the catalogue matched confidently) is the truth:
  // only fill in blanks, never let the model swap it for a different book.
  if (b.trusted) { b.author = b.author || aiBook.author; b.genre = b.genre || aiBook.genre; return; }
  try {
    const better = (await api('/api/books', { q: `${aiBook.title} ${aiBook.author}`, best: '1' })).book;
    if (better && candidateMatches(better, `${aiBook.title} ${aiBook.author}`)) {
      Object.assign(b, { title: better.title, author: better.author || aiBook.author, cover: better.cover, desc: better.desc, genre: better.genre || better.categories || aiBook.genre, trusted: true });
      return;
    }
  } catch {}
  Object.assign(b, { title: aiBook.title || b.title, author: aiBook.author, genre: b.genre || aiBook.genre, trusted: true });
}

async function loadSoundtrack(mood = S.mood || '', style = S.style || '', { fresh = false } = {}) {
  S.mood = mood; S.style = style;
  const what = [mood, style].filter(Boolean).join(' · ');
  setStatus(what ? t('Re-tuning for “{what}”…', { what }) : t('Composing the soundtrack…'));
  skeletonTracks();
  const b = S.book;
  try {
    const d = await api('/api/analyze', { title: b.title, author: b.author, genre: b.genre, desc: (b.desc || '').slice(0, 600), mood, style, lang: getLang(), fresh: fresh ? '1' : '', r: fresh ? Date.now() : '' });
    if (!what || !S.ai) { S.ai = d; renderMoods(); }
    else { S.ai = { ...S.ai, tracks: d.tracks, why: d.why || S.ai.why }; }
    S.tracks = d.tracks || [];
    if (!mood && !d.degraded) await reconcileIdentity(d.book);
    renderBookCard(); renderTracks(); setStatus('');
    showCoach();
    if (d.degraded) {
      el.status.classList.add('is-on');
      el.status.innerHTML = `<span aria-hidden="true">⚡</span><span>${t('Our AI is busy right now, so this soundtrack was matched by genre, not by this exact book.')}</span><button type="button" class="ghost" id="retryAi">${t('Try again')}</button>`;
      $('#retryAi').onclick = () => loadSoundtrack(mood, style, { fresh: true });
    }
    el.tracksMeta.textContent = t('{n} long mixes', { n: S.tracks.length }) + (mood ? ' · ' + mood : '');
    document.title = `${b.title} — MoodBook`;
    // warm the first search so the first play is instant (each YouTube search costs quota, so only one)
    S.tracks.slice(0, 1).forEach((tr) => api('/api/search', { q: tr.query }).catch(() => {}));
  } catch (e) {
    setStatus('');
    el.tracks.innerHTML = `<li class="error"><b>${t("Couldn't compose the soundtrack.")}</b>${esc(e.message)}${e.detail ? `<small>${esc(e.detail)}</small>` : ''}<button type="button" class="ghost" id="retryBtn">${t('Try again')}</button></li>`;
    $('#retryBtn').onclick = () => loadSoundtrack(mood, style);
    if (!S.ai) el.moodGrid.innerHTML = `<p class="muted small">${t('Scenes will appear once the soundtrack loads.')}</p>`;
  }
}

function renderBookCard() {
  const b = S.book, ai = S.ai;
  // short, de-duplicated tags: up to 2 genres + setting + tone
  const seen = new Set();
  const parts = (v, n) => String(v || '').split(/[,/·]/).map((s) => s.trim()).filter((s) => s && s.length <= 26 && !/general|imaginary place/i.test(s) && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase())).slice(0, n);
  const tags = [...parts(ai?.book?.genre || b.genre, 2), ...parts(ai?.book?.setting, 1), ...parts(ai?.book?.tone, 2)].slice(0, 5);
  el.bookCard.innerHTML = `
    ${b.cover ? `<div class="cover"><img src="${esc(b.cover)}" alt="${esc(t('Cover of {title}', { title: b.title }))}" width="76" height="114"></div>` : '<div class="cover ph" aria-hidden="true">📖</div>'}
    <div>
      <h2>${esc(b.title)}</h2>
      <p class="by">${esc(b.author || (ai ? ai.book.author : '') || t('Unknown author'))}</p>
      ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${ai?.why ? `<p class="why">${esc(ai.why)}</p>` : '<p class="why sk" style="width:95%;height:38px">.</p>'}
    </div>`;
}

function renderMoods() {
  const scenes = S.ai?.scenes || S.ai?.moods || [];
  const styles = S.ai?.styles || [];
  const pills = (list, cur) => list.map((m) => `<button type="button" class="mood" aria-pressed="${m === cur}">${esc(m)}</button>`).join('');
  el.moodGrid.innerHTML = pills(scenes, S.mood);
  const sg = $('#styleGrid'); if (sg) sg.innerHTML = pills(styles, S.style);
  const wire = (grid, key) => grid && $$('.mood', grid).forEach((btn) => btn.addEventListener('click', () => {
    const m = btn.textContent;
    const off = btn.getAttribute('aria-pressed') === 'true';
    $$('.mood', grid).forEach((x) => x.setAttribute('aria-pressed', 'false'));
    if (!off) btn.setAttribute('aria-pressed', 'true');
    if (key === 'mood') loadSoundtrack(off ? '' : m, S.style); else loadSoundtrack(S.mood, off ? '' : m);
    if (window.innerWidth < 1000) $('#tracks-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  wire(el.moodGrid, 'mood'); wire(sg, 'style');
}

const isLiked = (t) => DB.liked.some((x) => x.query === t.query);
function renderTracks() {
  el.tracks.innerHTML = S.tracks.map((tr, i) => `
    <li class="track${S.playingFrom === 'results' && S.playingIdx === i ? ' is-playing' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(t('Play {name}', { name: tr.name }))}">
      <span class="n">${i + 1}</span>
      <span class="info">
        <span class="name">${esc(tr.name)}${S.playingFrom === 'results' && S.playingIdx === i ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</span>
        <span class="vibe">${esc(tr.vibe)} · ${esc(tr.duration || '~1 hr')}</span>
        ${tr.ytTitle ? `<span class="yt">▶ ${esc(tr.ytTitle)}</span>` : ''}
      </span>
      <span class="acts">
        <button type="button" class="icon-btn like" aria-pressed="${isLiked(tr)}" aria-label="${esc(t('Like {name}', { name: tr.name }))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 12C19 16.4 12 21 12 21z"/></svg></button>
        <button type="button" class="icon-btn play" aria-label="${esc(t('Play {name}', { name: tr.name }))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg></button>
      </span>
    </li>`).join('');
}
el.tracks.addEventListener('click', (e) => {
  const li = e.target.closest('.track[data-i]'); if (!li) return;
  const i = +li.dataset.i;
  if (e.target.closest('.like')) return toggleLike(S.tracks[i], e.target.closest('.like'));
  playFrom(S.tracks, i, 'results');
});
el.tracks.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.track')) { e.preventDefault(); playFrom(S.tracks, +e.target.dataset.i, 'results'); }
});

function toggleLike(tr, btn) {
  const idx = DB.liked.findIndex((x) => x.query === tr.query);
  if (idx >= 0) { DB.liked.splice(idx, 1); btn?.setAttribute('aria-pressed', 'false'); }
  else {
    DB.liked.unshift({ name: tr.name, vibe: tr.vibe, query: tr.query, duration: tr.duration, book: S.book?.title || tr.book || '', cover: S.book?.cover || tr.cover || '' });
    btn?.setAttribute('aria-pressed', 'true');
    toast(t('♥ Saved to liked tracks'));
  }
  save();
}

// First-result coach card: three steps, shown once, dismissed by hand or by the first play.
function showCoach() {
  const box = $('#coach');
  if (!box || ls.raw('mb_seen_coach') === '1') return;
  box.hidden = false;
  box.innerHTML = `<div class="core">
    <p class="mono accent">${t('First time here?')}</p>
    <ol class="coach-steps">
      <li><b>${t('Press play')}</b> ${t('on any mix. The player stays with you while you browse.')}</li>
      <li><b>${t('Switch the scene')}</b> ${t('or the music style when the chapter changes mood.')}</li>
      <li><b>${t('Save to shelf')}</b> ${t('to come back to this book in one tap.')}</li>
    </ol>
    <button type="button" class="ghost" id="coachClose">${t('Got it')}</button>
  </div>`;
  $('#coachClose').onclick = hideCoach;
}
function hideCoach() { const box = $('#coach'); if (!box) return; box.hidden = true; ls.put('mb_seen_coach', '1'); }

function resetSearch() {
  el.results.hidden = true; el.paywall.hidden = true; el.hero.hidden = false;
  history.replaceState(null, '', location.pathname);
  document.title = t("MoodBook — A soundtrack for the book you're reading");
  el.q.value = ''; el.q.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

// save + share
el.saveBtn.addEventListener('click', () => {
  if (!S.book) return;
  if (DB.books.some((b) => b.title.toLowerCase() === S.book.title.toLowerCase())) { toast(t('Already on your shelf')); return; }
  DB.books.unshift({ id: Date.now(), title: S.book.title, author: S.book.author || '', cover: S.book.cover || '' });
  save();
  el.saveBtn.classList.add('is-done'); el.saveBtn.textContent = t('✓ On your shelf');
  toast('📚 ' + t('“{title}” added to your Library', { title: esc(S.book.title) }));
});
// ═══════════════ Reading Card (share) ═══════════════
const shareUrl = () => `${location.origin}/?b=${encodeURIComponent(S.book.title + (S.book.author ? ' ' + S.book.author : ''))}`;
const shareText = () => t("Reading “{title}”? Here's a soundtrack composed for it 🎧", { title: S.book.title });
let cardBlob = null, cardObjUrl = null;
function closeCard() {
  const m = $('#cardModal'); m.hidden = true; document.body.classList.remove('modal-open');
  if (cardObjUrl) { URL.revokeObjectURL(cardObjUrl); cardObjUrl = null; }
}
$('#cardModal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeCard(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#cardModal').hidden) closeCard(); });
$('#cardCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareUrl()); toast(t('Link copied')); } catch { toast(t('Copy failed. The link is in your address bar.')); }
});
$('#cardShare').addEventListener('click', async () => {
  if (!cardBlob) return;
  const file = new File([cardBlob], 'moodbook-reading-card.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'MoodBook', text: `${shareText()} ${shareUrl()}` });
    else await navigator.share({ title: 'MoodBook', text: shareText(), url: shareUrl() });
  } catch {}
});
el.shareBtn.addEventListener('click', async () => {
  if (!S.book) return;
  const m = $('#cardModal'), prev = $('#cardPreview');
  m.hidden = false; document.body.classList.add('modal-open');
  cardBlob = null; $('#cardShare').hidden = true; $('#cardDownload').hidden = true;
  prev.innerHTML = `<div class="card-loading"><span class="dots"><i></i><i></i><i></i></span> ${t('Drawing your card…')}</div>`;
  try {
    const { renderReadingCard } = await import('./card.js' + new URL(import.meta.url).search);
    cardBlob = await renderReadingCard({
      book: { title: S.book.title, author: S.book.author || S.ai?.book?.author || '', cover: S.book.cover, genre: (S.ai?.book?.genre || S.book.genre || '').split(/[,/·]/)[0].trim() },
      why: S.ai?.why || '', tracks: S.tracks, scene: S.mood, style: S.style, url: shareUrl(), host: location.host,
    });
    if (cardObjUrl) URL.revokeObjectURL(cardObjUrl);
    cardObjUrl = URL.createObjectURL(cardBlob);
    prev.innerHTML = `<img src="${cardObjUrl}" alt="Reading Card for ${esc(S.book.title)}" width="540" height="675">`;
    const dl = $('#cardDownload'); dl.href = cardObjUrl; dl.download = `moodbook-${S.book.title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.png`; dl.hidden = false;
    const file = new File([cardBlob], 'moodbook-reading-card.png', { type: 'image/png' });
    $('#cardShare').hidden = !(navigator.share && (navigator.canShare?.({ files: [file] }) || true));
  } catch (e) {
    prev.innerHTML = `<div class="card-loading">${t("Couldn't draw the card ({msg}). You can still copy the link below.", { msg: esc(e.message) })}</div>`;
  }
});

// ═══════════════ paywall + promo ═══════════════
function showPaywall() {
  el.hero.hidden = true; el.results.hidden = true; el.paywall.hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function applyPromo(code) {
  if (PROMO_CODES.includes(code.trim().toUpperCase())) {
    ls.put('mb_pro', 'true'); renderQuota(); renderAccount();
    toast(t('🎉 Pro activated. Unlimited books, enjoy.'), { ms: 4000 });
    if (!el.paywall.hidden) { el.paywall.hidden = true; el.hero.hidden = false; }
    return true;
  }
  toast(t("That code didn't work. Check the spelling and try again."));
  return false;
}
$('#promoForm').addEventListener('submit', (e) => { e.preventDefault(); applyPromo($('#promoInput').value); });
$('#promoFormAcct').addEventListener('submit', (e) => { e.preventDefault(); if (applyPromo($('#promoInputAcct').value)) $('#promoInputAcct').value = ''; });

// ═══════════════ player (YouTube IFrame API) ═══════════════
const dock = $('#dock');
let yt = null, ytReady = null, progressTimer = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => {
      yt = new YT.Player('yt', {
        width: '100%', height: '100%', videoId: '',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, origin: location.origin },
        events: {
          onReady: () => resolve(yt),
          onStateChange: (e) => {
            const st = e.data;
            dock.classList.toggle('is-paused', st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.BUFFERING);
            $('#playBtn').setAttribute('aria-label', st === YT.PlayerState.PLAYING ? t('Pause') : t('Play'));
            $$('.eq').forEach((q) => q.classList.toggle('paused', st !== YT.PlayerState.PLAYING));
            if (st === YT.PlayerState.ENDED) nextTrack();
          },
          onError: () => { toast(t('YouTube refused that video. Skipping…')); nextTrack(true); },
        },
      });
    };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true; document.head.appendChild(s);
  });
  return ytReady;
}
// Dock has three sizes: expanded (big video), compact bar, and mini (corner card; music keeps playing).
function setDockHeight() {
  const h = dock.hidden ? 0 : dock.classList.contains('is-mini') ? 84 : dock.classList.contains('is-expanded') ? 360 : 96;
  document.documentElement.style.setProperty('--dock-h', h + 'px');
}
function syncDockButtons() {
  const ex = dock.classList.contains('is-expanded'), mini = dock.classList.contains('is-mini');
  $('#expandBtn').setAttribute('aria-expanded', String(ex)); $('#expandBtn').setAttribute('aria-label', ex ? t('Hide video') : t('Show video'));
  $('#miniBtn').setAttribute('aria-pressed', String(mini)); $('#miniBtn').setAttribute('aria-label', mini ? t('Restore player') : t('Minimize player'));
}
function setDock(t, sub) {
  if (dock.hidden && !dock.classList.contains('is-expanded') && !dock.classList.contains('is-mini')) {
    // first play: open the dock with the video visible so pause/seek/YouTube controls are reachable
    dock.classList.add('is-expanded');
  }
  dock.hidden = false;
  syncDockButtons(); setDockHeight();
  $('#dockTitle').textContent = t; $('#dockSub').textContent = sub || '';
}
const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(x).padStart(2, '0'); };
$('#dockProgress').addEventListener('click', (e) => {
  if (!yt?.getDuration) return;
  const r = e.currentTarget.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  yt.seekTo(pct * yt.getDuration(), true);
});
$('#dockProgress').addEventListener('keydown', (e) => {
  if (!yt?.getDuration) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); yt.seekTo(yt.getCurrentTime() + 30, true); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); yt.seekTo(Math.max(0, yt.getCurrentTime() - 30), true); }
});
function rerenderPlaying() {
  if (S.playingFrom === 'results') renderTracks();
  else if (S.playingFrom === 'liked') renderLiked();
  else renderHistory();
}
function remember(tr) {
  const bookTitle = S.playingFrom === 'results' ? (S.book?.title || '') : (tr.book || '');
  const cover = S.playingFrom === 'results' ? (S.book?.cover || '') : (tr.cover || '');
  DB.history = DB.history.filter((x) => x.query !== tr.query);
  DB.history.unshift({ name: tr.name, vibe: tr.vibe, query: tr.query, duration: tr.duration, book: bookTitle, cover, at: Date.now() });
  save();
}
async function playFrom(list, i, from) {
  const tr = list[i]; if (!tr) return;
  S.queue = list; S.playingIdx = i; S.playingFrom = from;
  setDock(tr.name, t('Finding the mix…')); dock.classList.remove('is-paused');
  $('#dockTime').textContent = '0:00'; $('#dockProgress span').style.width = '0%';
  rerenderPlaying(); hideCoach();
  const p = loadYT();
  let hit;
  try { hit = await api('/api/search', { q: tr.query }); } catch (e) { toast(t('Search failed: {msg}', { msg: e.detail || e.message })); return; }
  if (!hit?.videoId) { toast(t('No good mix found for that one. Try another track.')); return; }
  if (hit.fallback && !S.toldFallback) { S.toldFallback = true; toast(t('YouTube search is rate-limited right now, so this is a matching evergreen mix instead of a book-specific one.'), { ms: 5000 }); }
  tr.videoId = hit.videoId; tr.ytTitle = hit.title; tr.alts = hit.alternatives || [];
  if (S.queue[S.playingIdx] !== tr) return; // user moved on
  const player = await p;
  player.loadVideoById(hit.videoId);
  setDock(tr.name, `${hit.title}${hit.channel ? ' · ' + hit.channel : ''}`);
  remember(tr);
  rerenderPlaying();
  startProgress();
}
function nextTrack(skipBroken = false) {
  if (!S.queue.length) return;
  const tr = S.queue[S.playingIdx];
  if (skipBroken && tr?.alts?.length) { const alt = tr.alts.shift(); tr.videoId = alt.videoId; tr.ytTitle = alt.title; yt?.loadVideoById(alt.videoId); setDock(tr.name, alt.title); return; }
  playFrom(S.queue, (S.playingIdx + 1) % S.queue.length, S.playingFrom);
}
function prevTrack() { if (S.queue.length) playFrom(S.queue, (S.playingIdx - 1 + S.queue.length) % S.queue.length, S.playingFrom); }
function startProgress() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!yt?.getDuration) return;
    const d = yt.getDuration() || 0, c = yt.getCurrentTime() || 0;
    const pct = d ? Math.min(100, (c / d) * 100) : 0;
    $('#dockProgress span').style.width = pct + '%';
    $('#dockProgress').setAttribute('aria-valuenow', Math.round(pct));
    const tl = $('#dockTime'); if (tl) tl.textContent = d ? `${fmtTime(c)} / ${fmtTime(d)}` : '';
  }, 1000);
}
$('#playBtn').addEventListener('click', () => {
  if (!yt?.getPlayerState) return;
  const st = yt.getPlayerState();
  if (st === YT.PlayerState.PLAYING) yt.pauseVideo(); else yt.playVideo();
});
$('#nextBtn').addEventListener('click', () => nextTrack());
$('#closeDock')?.addEventListener('click', () => {
  try { yt?.stopVideo?.(); } catch {}
  clearInterval(progressTimer);
  dock.hidden = true; dock.classList.remove('is-expanded', 'is-mini');
  syncDockButtons(); setDockHeight();
  S.playingIdx = -1; rerenderPlaying();
});
$('#prevBtn').addEventListener('click', prevTrack);
$('#expandBtn').addEventListener('click', () => {
  dock.classList.remove('is-mini');
  dock.classList.toggle('is-expanded');
  syncDockButtons(); setDockHeight();
});
let dockWasExpanded = false;
$('#miniBtn').addEventListener('click', () => {
  const on = dock.classList.toggle('is-mini');
  if (on) { dockWasExpanded = dock.classList.contains('is-expanded'); dock.classList.remove('is-expanded'); }
  else if (dockWasExpanded) dock.classList.add('is-expanded');
  syncDockButtons(); setDockHeight();
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea') || !yt) return;
  if (e.key === ' ' && e.target === document.body) { e.preventDefault(); $('#playBtn').click(); }
});

// ═══════════════ library ═══════════════
const addAC = attachAutocomplete($('#addInput'), $('#addSuggest'), (b) => { addBook(b); $('#addInput').value = ''; });
$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault(); addAC.close();
  const q = $('#addInput').value.trim(); if (!q) return;
  $('#addInput').value = '';
  let b = null;
  try { b = (await api('/api/books', { q, best: '1' })).book; } catch {}
  addBook(b || { title: q, author: '', cover: '' });
});
function addBook(b) {
  if (DB.books.some((x) => x.title.toLowerCase() === b.title.toLowerCase())) { toast(t('Already on your shelf')); return; }
  DB.books.unshift({ id: Date.now(), title: b.title, author: b.author || '', cover: b.cover || '' });
  save(); renderShelf();
  toast('📖 ' + t('“{title}” added', { title: esc(b.title) }));
}
function renderShelf() {
  const g = $('#shelf');
  if (!DB.books.length) { g.innerHTML = `<div class="empty"><b>📚</b>${t('Your shelf is empty. Add a book above, or save one from a search.')}</div>`; return; }
  g.innerHTML = DB.books.map((b, i) => `
    <div class="book">
      <button type="button" class="cvbtn" data-play="${i}" aria-label="${esc(t('Play soundtrack for {title}', { title: b.title }))}" style="all:unset;display:block;cursor:pointer;width:100%">
        <span class="cv">${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" width="120" height="180">` : '📖'}<span class="playo"><svg viewBox="0 0 24 24"><path d="M7 4v16l14-8z"/></svg></span></span>
      </button>
      <div class="t">${esc(b.title)}</div>
      <div class="a">${esc(b.author || '')}</div>
      <button type="button" class="rm" data-rm="${i}" aria-label="${esc(t('Remove {title} from shelf', { title: b.title }))}">✕</button>
    </div>`).join('');
  $('#statBooks').textContent = DB.books.length;
}
$('#shelf').addEventListener('click', (e) => {
  const p = e.target.closest('[data-play]'); const r = e.target.closest('[data-rm]');
  if (p) { const b = DB.books[+p.dataset.play]; showPage('discover'); el.q.value = b.title; startSearch(b.title, { ...b, desc: '' }, { free: true }); }
  if (r) {
    const i = +r.dataset.rm; const [b] = DB.books.splice(i, 1); save(); renderShelf();
    toast(t('Removed “{name}”', { name: esc(b.title) }), { undo: () => { DB.books.splice(i, 0, b); save(); renderShelf(); } });
  }
});
let likedQuery = '';
function renderLiked() {
  const o = $('#liked');
  $('#statLiked').textContent = DB.liked.length;
  const tools = $('#likedTools'); if (tools) tools.hidden = DB.liked.length < 6;
  if (!DB.liked.length) { o.innerHTML = `<li class="empty"><b>♡</b>${t('No liked tracks yet. Tap the heart on any track while listening.')}</li>`; return; }
  const q = normT(likedQuery);
  const rows = DB.liked.map((tr, i) => ({ tr, i })).filter(({ tr }) => !q || normT(`${tr.name} ${tr.book} ${tr.vibe}`).includes(q));
  if (!rows.length) { o.innerHTML = `<li class="empty"><b>🔍</b>${t('Nothing matches “{q}”.', { q: esc(likedQuery) })}</li>`; return; }
  o.innerHTML = rows.map(({ tr, i }) => `
    <li class="track${S.playingFrom === 'liked' && S.playingIdx === i ? ' is-playing' : ''}" data-l="${i}" tabindex="0" role="button" aria-label="${esc(t('Play {name}', { name: tr.name }))}">
      <span class="info">
        <span class="name">${esc(tr.name)}${S.playingFrom === 'liked' && S.playingIdx === i ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</span>
        <span class="vibe">${esc(tr.vibe)}${tr.book ? ' · ' + esc(tr.book) : ''}</span>
      </span>
      <span class="acts">
        <button type="button" class="icon-btn unlike" aria-label="${esc(t('Remove {name} from liked', { name: tr.name }))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        <button type="button" class="icon-btn play" aria-label="${esc(t('Play {name}', { name: tr.name }))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg></button>
      </span>
    </li>`).join('');
}
$('#likedFilter')?.addEventListener('input', (e) => { likedQuery = e.target.value; renderLiked(); });

function renderHistory() {
  const o = $('#history'); if (!o) return;
  if (!DB.history.length) { o.innerHTML = `<li class="empty"><b>🕰</b>${t('Nothing played yet. Your last 30 mixes will appear here.')}</li>`; return; }
  o.innerHTML = DB.history.map((tr, i) => `
    <li class="track${S.playingFrom === 'history' && S.playingIdx === i ? ' is-playing' : ''}" data-h="${i}" tabindex="0" role="button" aria-label="${esc(t('Play {name}', { name: tr.name }))}">
      ${tr.cover ? `<img class="hcv" src="${esc(tr.cover)}" alt="" width="30" height="44" loading="lazy">` : '<span class="hcv ph"></span>'}
      <span class="info">
        <span class="name">${esc(tr.name)}${S.playingFrom === 'history' && S.playingIdx === i ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</span>
        <span class="vibe">${tr.book ? esc(tr.book) + ' · ' : ''}${esc(timeAgo(tr.at))}</span>
      </span>
      <span class="acts">
        ${tr.book ? `<button type="button" class="icon-btn openbook" aria-label="${esc(t('Open {book}', { book: tr.book }))}" title="${esc(t('Open this book'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/></svg></button>` : ''}
        <button type="button" class="icon-btn play" aria-label="${esc(t('Play {name}', { name: tr.name }))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg></button>
      </span>
    </li>`).join('');
}
$('#history')?.addEventListener('click', (e) => {
  const li = e.target.closest('[data-h]'); if (!li) return;
  const i = +li.dataset.h; const tr = DB.history[i];
  if (e.target.closest('.openbook')) { showPage('discover'); el.q.value = tr.book; startSearch(tr.book); return; }
  playFrom(DB.history, i, 'history');
});
$('#history')?.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-h]')) { e.preventDefault(); playFrom(DB.history, +e.target.dataset.h, 'history'); } });

// Shelf entries saved before covers existed: look the cover up once, quietly.
let hydrating = false;
async function hydrateCovers() {
  if (hydrating) return; hydrating = true;
  try {
    for (const b of DB.books.filter((x) => !x.cover && !x.coverTried).slice(0, 6)) {
      try {
        const best = (await api('/api/books', { q: `${b.title} ${b.author || ''}`.trim(), best: '1' })).book;
        if (best?.cover && candidateMatches(best, b.title)) { b.cover = best.cover; if (!b.author && best.author) b.author = best.author; }
      } catch {}
      b.coverTried = true; save();
    }
    renderShelf();
  } finally { hydrating = false; }
}
$('#liked').addEventListener('click', (e) => {
  const li = e.target.closest('[data-l]'); if (!li) return;
  const i = +li.dataset.l;
  if (e.target.closest('.unlike')) { const [tr] = DB.liked.splice(i, 1); save(); renderLiked(); toast(t('Removed “{name}”', { name: esc(tr.name) }), { undo: () => { DB.liked.splice(i, 0, tr); save(); renderLiked(); } }); return; }
  playFrom(DB.liked, i, 'liked');
});
$('#liked').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-l]')) { e.preventDefault(); playFrom(DB.liked, +e.target.dataset.l, 'liked'); } });

// ═══════════════ account ═══════════════
let billing = 'monthly';
function renderAccount() {
  const pro = isPro();
  const badge = $('#acctBadge'); badge.textContent = pro ? '✦ Pro' : 'Free'; badge.classList.toggle('is-pro', pro);
  $('#statBooks').textContent = DB.books.length;
  $('#statLiked').textContent = DB.liked.length;
  $('#statSearches').textContent = ls.raw('mb_total_searches') || '0';
  $('#freeBtn').textContent = pro ? t('Included') : t('Current plan');
  const per = billing === 'monthly' ? t('/mo') : t('/yr');
  $('#proPrice').innerHTML = `${billing === 'monthly' ? PRICE.monthly : PRICE.annual}<span>${per}</span>`;
  const cta = $('#proCta'); cta.textContent = pro ? t("You're on Pro ✦") : t('Payments open soon'); cta.classList.toggle('is-soon', !pro);
  $$('.bill').forEach((b) => { const on = b.dataset.bill === billing; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
  const lp = $('#landingProPrice'); if (lp) lp.innerHTML = `${billing === 'monthly' ? PRICE.monthly : PRICE.annual}<span>${per}</span>`;
  $('#payPrice').textContent = billing === 'monthly' ? PRICE.monthly : PRICE.annual;
  $('#payPer').textContent = billing === 'monthly' ? t('/month') : t('/year');
  $('#payAlt').textContent = billing === 'monthly' ? t('or {price}/year (save 17%)', { price: PRICE.annual }) : t('or {price}/month', { price: PRICE.monthly });
}
$$('.bill').forEach((b) => b.addEventListener('click', () => { billing = b.dataset.bill; renderAccount(); }));


// ═══════════════ landing: motion layer + final CTA ═══════════════
mountAll();
$('#finalCta')?.addEventListener('click', (e) => {
  e.preventDefault();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  setTimeout(() => el.q.focus({ preventScroll: true }), reduce ? 0 : 500);
});

// ═══════════════ boot ═══════════════
(function boot() {
  // one-time migration from v1 keys
  if (!DB.books.length && ls.raw('mb_books')) { try { DB.books = JSON.parse(ls.raw('mb_books')) || []; } catch {} }
  renderQuota(); renderAccount();
  const params = new URLSearchParams(location.search);
  // Owner / tester switch: open the site once with ?pro=1 and this browser stays on Pro (no daily limit).
  if (params.get('pro') === '1') { ls.put('mb_pro', 'true'); renderQuota(); renderAccount(); toast(t('Pro unlocked in this browser')); }
  // theme: auto (system) by default; the header button toggles night/day and remembers it
  const themeBtn = $('#themeBtn');
  const applyTheme = () => {
    const saved = ls.raw('mb_theme');
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#themeColor')?.setAttribute('content', dark ? '#1B1720' : '#F7F0E6');
    if (themeBtn) { const label = dark ? t('Day mode') : t('Night mode'); themeBtn.setAttribute('aria-label', label); themeBtn.title = label; themeBtn.setAttribute('aria-pressed', String(dark)); }
  };
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!ls.raw('mb_theme')) applyTheme(); });
  themeBtn?.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    ls.put('mb_theme', dark ? 'light' : 'dark'); applyTheme();
  });
  // language switch: header chip cycles, footer lists all
  const cur = getLang();
  const lb = $('#langBtn');
  if (lb) {
    lb.innerHTML = LANGS.map((l) => `<option value="${l.code}" lang="${l.code}"${l.code === cur ? ' selected' : ''}>${l.label}</option>`).join('');
    lb.title = t('Language'); lb.setAttribute('aria-label', t('Language'));
    lb.onchange = () => setLang(lb.value);
  }
  const fl = $('#footLangs'); if (fl) { fl.innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l.code}" aria-current="${l.code === cur}" lang="${l.code}">${l.label}</button>`).join(''); fl.onclick = (e) => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); }; }
  const hash = location.hash.slice(1);
  if (params.get('b')) { showPage('discover', { push: false }); el.q.value = params.get('b'); startSearch(params.get('b')); }
  else showPage(PAGES.includes(hash) ? hash : 'discover', { push: false });
})();
