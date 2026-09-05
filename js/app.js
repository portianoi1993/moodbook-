import { mountAll, mountMagnetic, mountSpotlight } from './fx.js';
/* MoodBook v2 — vanilla JS, no build step. */

// ═══════════════ config ═══════════════
const FREE_DAILY_LIMIT = 3;
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
    const e = new Error(data?.error || `Request failed (${r.status})`);
    e.detail = data?.detail || (r.status === 429 ? 'Rate limit reached. Try again in a few minutes.' : '');
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
};
const save = () => { ls.set('mb_books', DB.books); ls.set('mb_liked_tracks', DB.liked); };
const isPro = () => ls.raw('mb_pro') === 'true';
const searchesToday = () => ls.get('mb_day_' + todayKey(), 0);
const bumpSearches = () => {
  ls.set('mb_day_' + todayKey(), searchesToday() + 1);
  ls.put('mb_total_searches', String(+(ls.raw('mb_total_searches') || 0) + 1));
};
const freeLeft = () => Math.max(0, FREE_DAILY_LIMIT - searchesToday());

// ═══════════════ toast ═══════════════
let toastTimer, toastUndo;
function toast(msg, { ms = 2800, undo } = {}) {
  const t = $('#toast');
  clearTimeout(toastTimer);
  toastUndo = undo || null;
  t.innerHTML = `<span>${msg}</span>${undo ? '<button type="button" id="undoBtn">Undo</button>' : ''}`;
  t.classList.add('is-on');
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
  if (p === 'library') { renderShelf(); renderLiked(); }
  if (p === 'account') renderAccount();
  if (push && location.hash !== '#' + p) history.replaceState(null, '', p === 'discover' ? location.pathname + location.search : '#' + p);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  document.title = p === 'discover' && S.book ? `${S.book.title} — MoodBook` : 'MoodBook — Instrumental soundtracks for the book you\'re reading';
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
    // keep the whole list on screen (the hero form can sit low on short viewports)
    requestAnimationFrame(() => { const r = list.getBoundingClientRect(); if (r.bottom > innerHeight - 8) window.scrollBy({ top: Math.min(r.bottom - innerHeight + 16, Math.max(0, r.top - 100)), behavior: 'smooth' }); });
  };
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
  if (isPro()) { el.quota.innerHTML = '<b>Pro</b> · unlimited books'; el.quota.classList.remove('is-low'); return; }
  const left = freeLeft();
  el.quota.innerHTML = left > 0 ? `<b>${left} of ${FREE_DAILY_LIMIT}</b> free ${left === 1 ? 'search' : 'searches'} left today` : `<b>0 of ${FREE_DAILY_LIMIT}</b> free searches left today · resets tomorrow`;
  el.quota.classList.toggle('is-low', left <= 1);
  const chip = $('#planChip');
  chip.textContent = isPro() ? 'Pro' : 'Free';
  chip.classList.toggle('is-pro', isPro());
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

async function startSearch(raw, picked = null) {
  const q = String(raw || '').trim();
  if (!q) { el.q.focus(); return; }
  if (!isPro() && freeLeft() <= 0) { showPaywall(); return; }

  // reset view
  S.book = null; S.ai = null; S.mood = ''; S.tracks = [];
  el.hero.hidden = true; el.paywall.hidden = true; el.results.hidden = false;
  el.saveBtn.classList.remove('is-done'); el.saveBtn.textContent = '+ Save to shelf';
  skeletonBook(picked?.title || q); skeletonMoods(); skeletonTracks(); el.tracksMeta.textContent = '';
  setStatus('Identifying the book…');
  history.replaceState(null, '', `${location.pathname}?b=${encodeURIComponent(q)}`);
  window.scrollTo({ top: 0, behavior: 'auto' });

  // 1) catalogue lookup (fast, cached). Only trust it as a hint when it clearly matches the query.
  let book = picked, trusted = !!picked;
  if (!book) {
    let cand = null;
    try { cand = (await api('/api/books', { q, best: '1' })).book; } catch {}
    trusted = candidateMatches(cand, q);
    book = trusted ? cand : { title: q, author: '', cover: '', genre: '', desc: '' };
  }
  S.book = { ...book, genre: book.genre || book.categories || '', trusted };
  renderBookCard();

  // 2) AI identifies the book (its strength) and composes the soundtrack
  bumpSearches(); renderQuota();
  await loadSoundtrack();
}

// After the AI names the book, fetch the right cover/description if the catalogue guess was untrusted or disagrees.
async function reconcileIdentity(aiBook) {
  const b = S.book;
  if (!aiBook?.author || aiBook.known === false) return;
  const agree = b.trusted && normT(b.author) && normT(aiBook.author).split(' ').pop() === normT(b.author).split(' ').pop();
  if (agree) { b.author = b.author || aiBook.author; b.genre = b.genre || aiBook.genre; return; }
  try {
    const better = (await api('/api/books', { q: `${aiBook.title} ${aiBook.author}`, best: '1' })).book;
    if (better && candidateMatches(better, `${aiBook.title} ${aiBook.author}`)) {
      Object.assign(b, { title: better.title, author: better.author || aiBook.author, cover: better.cover, desc: better.desc, genre: better.genre || better.categories || aiBook.genre, trusted: true });
      return;
    }
  } catch {}
  Object.assign(b, { title: aiBook.title || b.title, author: aiBook.author, genre: b.genre || aiBook.genre, trusted: true });
}

async function loadSoundtrack(mood = '') {
  S.mood = mood;
  setStatus(mood ? `Re-tuning for “${mood}”…` : 'Composing the soundtrack…');
  skeletonTracks();
  const b = S.book;
  try {
    const d = await api('/api/analyze', { title: b.title, author: b.author, genre: b.genre, desc: (b.desc || '').slice(0, 600), mood });
    if (!mood || !S.ai) { S.ai = d; renderMoods(); }
    else { S.ai = { ...S.ai, tracks: d.tracks, why: d.why || S.ai.why }; }
    S.tracks = d.tracks || [];
    if (!mood && !d.degraded) await reconcileIdentity(d.book);
    renderBookCard(); renderTracks(); setStatus('');
    if (d.degraded) el.status.classList.add('is-on'), el.status.innerHTML = '<span aria-hidden="true">⚡</span><span>The AI curator is resting, so this soundtrack was matched by genre. Try again in a few minutes for a book-specific mix.</span>';
    el.tracksMeta.textContent = `${S.tracks.length} long instrumental mixes${mood ? ' · ' + mood : ''}`;
    document.title = `${b.title} — MoodBook`;
    // warm the first two searches so the first play is instant
    S.tracks.slice(0, 2).forEach((t) => api('/api/search', { q: t.query }).catch(() => {}));
  } catch (e) {
    setStatus('');
    el.tracks.innerHTML = `<li class="error"><b>Couldn't compose the soundtrack.</b>${esc(e.message)}${e.detail ? `<small>${esc(e.detail)}</small>` : ''}<button type="button" class="ghost" id="retryBtn">Try again</button></li>`;
    $('#retryBtn').onclick = () => loadSoundtrack(mood);
    if (!S.ai) el.moodGrid.innerHTML = '<p class="muted small">Scenes will appear once the soundtrack loads.</p>';
  }
}

function renderBookCard() {
  const b = S.book, ai = S.ai;
  // short, de-duplicated tags: up to 2 genres + setting + tone
  const seen = new Set();
  const genres = String(ai?.book?.genre || b.genre || '').split(/[,/·]/).map((s) => s.trim()).filter((s) => s && s.length <= 26 && !/general|imaginary place/i.test(s) && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase())).slice(0, 2);
  const tags = [...genres, ai?.book?.setting, ai?.book?.tone].filter(Boolean).map((s) => String(s).slice(0, 34)).slice(0, 4);
  el.bookCard.innerHTML = `
    ${b.cover ? `<div class="cover"><img src="${esc(b.cover)}" alt="Cover of ${esc(b.title)}" width="76" height="114"></div>` : '<div class="cover ph" aria-hidden="true">📖</div>'}
    <div>
      <h2>${esc(b.title)}</h2>
      <p class="by">${esc(b.author || (ai ? ai.book.author : '') || 'Unknown author')}</p>
      ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${ai?.why ? `<p class="why">${esc(ai.why)}</p>` : '<p class="why sk" style="width:95%;height:38px">.</p>'}
    </div>`;
}

function renderMoods() {
  const moods = S.ai?.moods || [];
  el.moodGrid.innerHTML = moods.map((m) => `<button type="button" class="mood" aria-pressed="${m === S.mood}">${esc(m)}</button>`).join('');
  $$('.mood', el.moodGrid).forEach((btn) => btn.addEventListener('click', () => {
    const m = btn.textContent;
    const off = btn.getAttribute('aria-pressed') === 'true';
    $$('.mood', el.moodGrid).forEach((x) => x.setAttribute('aria-pressed', 'false'));
    if (!off) btn.setAttribute('aria-pressed', 'true');
    loadSoundtrack(off ? '' : m);
    if (window.innerWidth < 1000) $('#tracks-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

const isLiked = (t) => DB.liked.some((x) => x.query === t.query);
function renderTracks() {
  el.tracks.innerHTML = S.tracks.map((t, i) => `
    <li class="track${S.playingFrom === 'results' && S.playingIdx === i ? ' is-playing' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="Play ${esc(t.name)}">
      <span class="n">${i + 1}</span>
      <span class="info">
        <span class="name">${esc(t.name)}${S.playingFrom === 'results' && S.playingIdx === i ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</span>
        <span class="vibe">${esc(t.vibe)} · ${esc(t.duration || '~1 hr')}</span>
        ${t.ytTitle ? `<span class="yt">▶ ${esc(t.ytTitle)}</span>` : ''}
      </span>
      <span class="acts">
        <button type="button" class="icon-btn like" aria-pressed="${isLiked(t)}" aria-label="Like ${esc(t.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 12C19 16.4 12 21 12 21z"/></svg></button>
        <button type="button" class="icon-btn play" aria-label="Play ${esc(t.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg></button>
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

function toggleLike(t, btn) {
  const idx = DB.liked.findIndex((x) => x.query === t.query);
  if (idx >= 0) { DB.liked.splice(idx, 1); btn?.setAttribute('aria-pressed', 'false'); }
  else {
    DB.liked.unshift({ name: t.name, vibe: t.vibe, query: t.query, duration: t.duration, book: S.book?.title || t.book || '' });
    btn?.setAttribute('aria-pressed', 'true');
    toast('♥ Saved to liked tracks');
  }
  save();
}

function resetSearch() {
  el.results.hidden = true; el.paywall.hidden = true; el.hero.hidden = false;
  history.replaceState(null, '', location.pathname);
  document.title = 'MoodBook — Instrumental soundtracks for the book you\'re reading';
  el.q.value = ''; el.q.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

// save + share
el.saveBtn.addEventListener('click', () => {
  if (!S.book) return;
  if (DB.books.some((b) => b.title.toLowerCase() === S.book.title.toLowerCase())) { toast('Already on your shelf'); return; }
  DB.books.unshift({ id: Date.now(), title: S.book.title, author: S.book.author || '', cover: S.book.cover || '' });
  save();
  el.saveBtn.classList.add('is-done'); el.saveBtn.textContent = '✓ On your shelf';
  toast(`📚 “${esc(S.book.title)}” added to your Library`);
});
el.shareBtn.addEventListener('click', async () => {
  if (!S.book) return;
  const url = `${location.origin}/?b=${encodeURIComponent(S.book.title + (S.book.author ? ' ' + S.book.author : ''))}`;
  const text = `Reading “${S.book.title}”? Here's an instrumental soundtrack for it 🎧`;
  try {
    if (navigator.share) await navigator.share({ title: 'MoodBook', text, url });
    else { await navigator.clipboard.writeText(url); toast('Link copied'); }
  } catch {}
});

// ═══════════════ paywall + promo ═══════════════
function showPaywall() {
  el.hero.hidden = true; el.results.hidden = true; el.paywall.hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function applyPromo(code) {
  if (PROMO_CODES.includes(code.trim().toUpperCase())) {
    ls.put('mb_pro', 'true'); renderQuota(); renderAccount();
    toast('🎉 Pro activated. Unlimited books, enjoy.', { ms: 4000 });
    if (!el.paywall.hidden) { el.paywall.hidden = true; el.hero.hidden = false; }
    return true;
  }
  toast('That code didn\'t work. Check the spelling and try again.');
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
            $('#playBtn').setAttribute('aria-label', st === YT.PlayerState.PLAYING ? 'Pause' : 'Play');
            $$('.eq').forEach((q) => q.classList.toggle('paused', st !== YT.PlayerState.PLAYING));
            if (st === YT.PlayerState.ENDED) nextTrack();
          },
          onError: () => { toast('YouTube refused that video. Skipping…'); nextTrack(true); },
        },
      });
    };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true; document.head.appendChild(s);
  });
  return ytReady;
}
function setDock(t, sub) {
  if (dock.hidden && !dock.classList.contains('is-expanded')) {
    // first play: open the dock with the video visible so pause/seek/YouTube controls are reachable
    dock.classList.add('is-expanded');
    $('#expandBtn').setAttribute('aria-expanded', 'true'); $('#expandBtn').setAttribute('aria-label', 'Hide video');
  }
  dock.hidden = false;
  document.documentElement.style.setProperty('--dock-h', (dock.classList.contains('is-expanded') ? 360 : 96) + 'px');
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
async function playFrom(list, i, from) {
  const t = list[i]; if (!t) return;
  S.queue = list; S.playingIdx = i; S.playingFrom = from;
  setDock(t.name, 'Finding the mix…'); dock.classList.remove('is-paused');
  if (from === 'results') renderTracks(); else renderLiked();
  const p = loadYT();
  let hit;
  try { hit = await api('/api/search', { q: t.query }); } catch (e) { toast(`Search failed: ${e.detail || e.message}`); return; }
  if (!hit?.videoId) { toast('No good mix found for that one. Try another track.'); return; }
  t.videoId = hit.videoId; t.ytTitle = hit.title; t.alts = hit.alternatives || [];
  if (S.queue[S.playingIdx] !== t) return; // user moved on
  const player = await p;
  player.loadVideoById(hit.videoId);
  setDock(t.name, `${hit.title}${hit.channel ? ' · ' + hit.channel : ''}`);
  if (from === 'results') renderTracks(); else renderLiked();
  startProgress();
}
function nextTrack(skipBroken = false) {
  if (!S.queue.length) return;
  const t = S.queue[S.playingIdx];
  if (skipBroken && t?.alts?.length) { const alt = t.alts.shift(); t.videoId = alt.videoId; t.ytTitle = alt.title; yt?.loadVideoById(alt.videoId); setDock(t.name, alt.title); return; }
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
$('#prevBtn').addEventListener('click', prevTrack);
$('#expandBtn').addEventListener('click', () => {
  const on = dock.classList.toggle('is-expanded');
  $('#expandBtn').setAttribute('aria-expanded', String(on));
  $('#expandBtn').setAttribute('aria-label', on ? 'Hide video' : 'Show video');
  document.documentElement.style.setProperty('--dock-h', (on ? 360 : 96) + 'px');
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
  if (DB.books.some((x) => x.title.toLowerCase() === b.title.toLowerCase())) { toast('Already on your shelf'); return; }
  DB.books.unshift({ id: Date.now(), title: b.title, author: b.author || '', cover: b.cover || '' });
  save(); renderShelf();
  toast(`📖 “${esc(b.title)}” added`);
}
function renderShelf() {
  const g = $('#shelf');
  if (!DB.books.length) { g.innerHTML = '<div class="empty"><b>📚</b>Your shelf is empty. Add a book above, or save one from a search.</div>'; return; }
  g.innerHTML = DB.books.map((b, i) => `
    <div class="book">
      <button type="button" class="cvbtn" data-play="${i}" aria-label="Play soundtrack for ${esc(b.title)}" style="all:unset;display:block;cursor:pointer;width:100%">
        <span class="cv">${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" width="120" height="180">` : '📖'}<span class="playo"><svg viewBox="0 0 24 24"><path d="M7 4v16l14-8z"/></svg></span></span>
      </button>
      <div class="t">${esc(b.title)}</div>
      <div class="a">${esc(b.author || '')}</div>
      <button type="button" class="rm" data-rm="${i}" aria-label="Remove ${esc(b.title)} from shelf">✕</button>
    </div>`).join('');
  $('#statBooks').textContent = DB.books.length;
}
$('#shelf').addEventListener('click', (e) => {
  const p = e.target.closest('[data-play]'); const r = e.target.closest('[data-rm]');
  if (p) { const b = DB.books[+p.dataset.play]; showPage('discover'); el.q.value = b.title; startSearch(b.title, { ...b, desc: '' }); }
  if (r) {
    const i = +r.dataset.rm; const [b] = DB.books.splice(i, 1); save(); renderShelf();
    toast(`Removed “${esc(b.title)}”`, { undo: () => { DB.books.splice(i, 0, b); save(); renderShelf(); } });
  }
});
function renderLiked() {
  const o = $('#liked');
  $('#statLiked').textContent = DB.liked.length;
  if (!DB.liked.length) { o.innerHTML = '<li class="empty"><b>♡</b>No liked tracks yet. Tap the heart on any track while listening.</li>'; return; }
  o.innerHTML = DB.liked.map((t, i) => `
    <li class="track${S.playingFrom === 'liked' && S.playingIdx === i ? ' is-playing' : ''}" data-l="${i}" tabindex="0" role="button" aria-label="Play ${esc(t.name)}">
      <span class="info">
        <span class="name">${esc(t.name)}${S.playingFrom === 'liked' && S.playingIdx === i ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</span>
        <span class="vibe">${esc(t.vibe)}${t.book ? ' · ' + esc(t.book) : ''}</span>
      </span>
      <span class="acts">
        <button type="button" class="icon-btn unlike" aria-label="Remove ${esc(t.name)} from liked"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        <button type="button" class="icon-btn play" aria-label="Play ${esc(t.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg></button>
      </span>
    </li>`).join('');
}
$('#liked').addEventListener('click', (e) => {
  const li = e.target.closest('[data-l]'); if (!li) return;
  const i = +li.dataset.l;
  if (e.target.closest('.unlike')) { const [t] = DB.liked.splice(i, 1); save(); renderLiked(); toast(`Removed “${esc(t.name)}”`, { undo: () => { DB.liked.splice(i, 0, t); save(); renderLiked(); } }); return; }
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
  $('#freeBtn').textContent = pro ? 'Included' : 'Current plan';
  $('#proPrice').innerHTML = billing === 'monthly' ? `${PRICE.monthly}<span>/mo</span>` : `${PRICE.annual}<span>/yr</span>`;
  $('#proCta').textContent = pro ? 'You\'re on Pro ✦' : 'Request early access →';
  $$('.bill').forEach((b) => { const on = b.dataset.bill === billing; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
  const lp = $('#landingProPrice'); if (lp) lp.innerHTML = billing === 'monthly' ? `${PRICE.monthly}<span>/mo</span>` : `${PRICE.annual}<span>/yr</span>`;
  $('#payPrice').textContent = billing === 'monthly' ? PRICE.monthly : PRICE.annual;
  $('#payPer').textContent = billing === 'monthly' ? '/month' : '/year';
  $('#payAlt').textContent = billing === 'monthly' ? `or ${PRICE.annual}/year (save 17%)` : `or ${PRICE.monthly}/month`;
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
  const hash = location.hash.slice(1);
  if (params.get('b')) { showPage('discover', { push: false }); el.q.value = params.get('b'); startSearch(params.get('b')); }
  else showPage(PAGES.includes(hash) ? hash : 'discover', { push: false });
})();
