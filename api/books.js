// GET /api/books?q=...&limit=6        → ranked autocomplete list
// GET /api/books?q=...&best=1         → single best match for a typed title
// Sources: Google Books (key server-side) + Open Library (free, no key) queried in parallel,
// merged and ranked. If Google is over quota or slow, Open Library alone still answers.
import { cors, guard, cacheFor, noCache, str, fetchWithTimeout } from '../lib/http.js';
import { layeredCache, getFlag, setFlag } from '../lib/store.js';

const cache = layeredCache('books', { limit: 1500 });
let googleDownUntil = 0; // Google Books quota (1 000/day free) exhausted → Open Library only for a while
const ACADEMIC = /methodolog|методичк|методичн|підручник|посібник|workbook|curriculum|syllabus|lecture notes|study guide|teacher'?s (guide|manual)|instructor'?s manual|dissertation|\bthesis\b|proceedings|conference paper|summary of|summary & analysis|sparknotes|cliffsnotes|analysis of|companion to|trivia|quiz book|coloring book|activity book|journal|notebook|planner|summary|summarized|key takeaways|book club questions|discussion guide|conversation starters/i;

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9а-яіїєґ\s]/gi, ' ').replace(/\s+/g, ' ').trim();

const cleanTitle = (t) => {
  let s = str(t, 200);
  s = s.replace(/\s*[\(\[][^)\]]*(edition|издание|видання|ebook|e-book|kindle|unabridged|large print|illustrated|annotated|tie-in|boxed|box set)[^)\]]*[\)\]]/gi, '');
  s = s.replace(/\s*:\s*(a novel|the novel|a memoir)$/i, '');
  const m = /^(.{6,}?)\s*[\(\[][^)\]]{2,40}[\)\]]\s*$/.exec(s);
  if (m && m[1].trim().split(' ').length >= 2) s = m[1];
  return s.trim();
};

function fromGoogle(item) {
  const v = item.volumeInfo || {};
  const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
  return {
    id: 'g:' + item.id,
    title: cleanTitle(v.title).slice(0, 160),
    subtitle: str(v.subtitle, 160),
    author: str(v.authors?.[0], 80),
    authors: (v.authors || []).slice(0, 3),
    cover: img ? img.replace('http://', 'https://').replace('&edge=curl', '') : '',
    year: str(v.publishedDate, 10).slice(0, 4),
    categories: (v.categories || []).slice(0, 3).join(', '),
    desc: str(v.description, 700),
    ratingsCount: v.ratingsCount || 0,
    rating: v.averageRating || 0,
    pages: v.pageCount || 0,
    lang: v.language || '',
    pop: 0,
    src: 'google',
  };
}

function fromOpenLibrary(d) {
  const l = (d.language || [])[0];
  return {
    id: 'ol:' + (d.key || '').replace('/works/', ''),
    title: cleanTitle(d.title).slice(0, 160),
    subtitle: '',
    author: str(d.author_name?.[0], 80),
    authors: (d.author_name || []).slice(0, 3),
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
    year: d.first_publish_year ? String(d.first_publish_year) : '',
    categories: (d.subject || []).slice(0, 3).join(', '),
    desc: '',
    ratingsCount: d.ratings_count || 0,
    rating: d.ratings_average || 0,
    pages: d.number_of_pages_median || 0,
    lang: l === 'eng' ? 'en' : l === 'ukr' ? 'uk' : l === 'rus' ? 'ru' : '',
    pop: d.edition_count || 0, // a famous novel has dozens of editions
    src: 'openlibrary',
  };
}

function score(b, q, index) {
  const qn = norm(q), tn = norm(b.title), an = norm(b.author);
  const text = `${b.title} ${b.subtitle} ${b.categories} ${b.desc}`;
  let s = Math.max(0, 14 - index) * 1.0;
  if (ACADEMIC.test(text)) s -= 40;
  if (b.title.length > 6 && b.title === b.title.toUpperCase()) s -= 28;
  if (/^[A-Z]\.\s?[A-Z]/.test(b.author) || /\b(summary|analysis|workbook|publishing|press|books?)\b/i.test(b.author)) s -= 12;
  if (b.desc.length < 40 && b.src === 'google') s -= 6;
  if (b.cover) s += 12;
  if (b.author) s += 6; else s -= 12;
  s += Math.min(20, Math.log10(1 + b.ratingsCount) * 6);
  s += Math.min(18, Math.log10(1 + b.pop) * 9);
  if (b.pages && b.pages < 60) s -= 8;
  if (b.desc.length > 200) s += 5;
  if (b.pages >= 150) s += 4;
  const cyr = /[а-яіїєґ]/i.test(q);
  if (b.lang) s += (cyr ? /^(uk|ru)$/.test(b.lang) : b.lang === 'en') ? 6 : -10;
  if (/[\(\[]/.test(b.title)) s -= 4;
  // Readers type "dune", "frank herbert", "herbert dune" or "dune frank herbert": every token may land in the
  // title or in any author name, and the last token may still be half-typed ("stephen ki").
  const qTokens = qn.split(' ').filter((t) => t.length > 1);
  const tTokens = tn.split(' '), aTokens = norm((b.authors || []).join(' ') + ' ' + an).split(' ');
  const hit = (list, t, prefix) => list.some((x) => x === t || (prefix && t.length >= 3 && x.startsWith(t)));
  let titleHits = 0, authorHits = 0;
  qTokens.forEach((t, i) => {
    const last = i === qTokens.length - 1;
    if (hit(tTokens, t, last)) titleHits += 1; else if (hit(aTokens, t, last)) authorHits += 1;
  });
  const coverage = qTokens.length ? (titleHits + authorHits) / qTokens.length : 0;
  s += coverage * 30;
  const authorOnly = qTokens.length > 0 && authorHits === qTokens.length && titleHits === 0;
  const both = titleHits > 0 && authorHits > 0;
  if (both && coverage === 1) s += 14;            // "herbert dune": title and author both named → almost certainly it
  if (authorOnly) s += 8 + Math.min(12, Math.log10(1 + b.ratingsCount + b.pop * 3) * 5); // author search: surface their best-known books
  if (tn === qn) s += 25;
  else if (qn && tn.startsWith(qn + ' ') && tn.split(' ').length - qn.split(' ').length <= 2) s += 8;
  else if (qn && tn.startsWith(qn)) s += 4; // prefix typing: "fourth wi" → "fourth wing"
  if (!authorOnly) {
    const extra = tTokens.length - titleHits;
    s -= Math.min(15, Math.max(0, extra - 1) * 3);
  }
  return s;
}

function dedupe(list) {
  const seen = new Map();
  for (const b of list) {
    const k = `${norm(b.title)}|${norm(b.author).split(' ').pop()}`;
    const prev = seen.get(k);
    if (!prev) { seen.set(k, b); continue; }
    const keep = prev._s >= b._s ? prev : b, other = keep === prev ? b : prev;
    keep.cover = keep.cover || other.cover; keep.desc = keep.desc || other.desc; keep.year = keep.year || other.year;
    keep.categories = keep.categories || other.categories; keep.pop = Math.max(keep.pop, other.pop); keep.ratingsCount = Math.max(keep.ratingsCount, other.ratingsCount);
    keep._s = Math.max(prev._s, b._s) + 3; // both sources agree → good sign
    seen.set(k, keep);
  }
  return [...seen.values()];
}

async function google(q, key) {
  const params = new URLSearchParams({ q, maxResults: '12', printType: 'books', orderBy: 'relevance',
    fields: 'items(id,volumeInfo(title,subtitle,authors,imageLinks,publishedDate,categories,description,ratingsCount,averageRating,pageCount,language))' });
  if (key) params.set('key', key);
  const r = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?${params}`, {}, 4500);
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Google Books ${r.status}`);
  return (d.items || []).map(fromGoogle);
}
async function openLibrary(q) {
  const params = new URLSearchParams({ q, limit: '12', fields: 'key,title,author_name,cover_i,first_publish_year,language,edition_count,ratings_count,ratings_average,number_of_pages_median,subject' });
  const r = await fetchWithTimeout(`https://openlibrary.org/search.json?${params}`, { headers: { 'User-Agent': 'MoodBook/1.0 (moodbook@moodbook.ink)' } }, 4500);
  const d = await r.json();
  if (!r.ok) throw new Error(`Open Library ${r.status}`);
  return (d.docs || []).map(fromOpenLibrary);
}

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (await guard(req, res, { methods: ['GET'], max: 400 })) return;

  const q = str(req.query?.q, 160);
  const limit = Math.min(10, Math.max(1, parseInt(req.query?.limit, 10) || 6));
  const best = req.query?.best === '1';
  if (q.length < 2) { noCache(res); return res.status(400).json({ error: 'Query too short' }); }

  const cacheKey = `${q.toLowerCase()}|${best ? 'best' : limit}`;
  const hit = await cache.get(cacheKey);
  if (hit) { cacheFor(res, 24 * 3600); return res.status(200).json(hit); }

  const key = process.env.GOOGLE_BOOKS_KEY || process.env.YT_API_KEY || '';
  // Three ways people type: a title, an author, or both in any order. Ask both catalogues in every mode
  // and let the scorer sort it out. While a word is still being typed ("intermez", "stephen ki"), add
  // prefix wildcards so partial words resolve too.
  const typing = !best && /[a-zа-яіїєґ]$/i.test(q) && q.length >= 3;
  // Google Books budget (1 000 requests/day free): skip it while a quota error is fresh, ask the author
  // index only for two-word queries (names), and never for very short strings. Open Library has no quota.
  const words = q.split(/\s+/).filter(Boolean).length;
  let gDown = Date.now() < googleDownUntil;
  if (!gDown) { const until = await getFlag('gb-quota-down'); if (until && Date.now() < until) { googleDownUntil = until; gDown = true; } }
  const useGoogle = !!key && !gDown && q.length >= 3;
  const tasks = [
    useGoogle ? google(q, key) : Promise.resolve([]),
    openLibrary(q),
    typing ? openLibrary(`title:${q}*`) : Promise.resolve([]),
    useGoogle && words >= 2 ? google(`inauthor:"${q.replace(/"/g, '')}"`, key) : Promise.resolve([]),
    q.length >= 3 ? openLibrary(`author:${q}${typing ? '*' : ''}`) : Promise.resolve([]),
  ];
  const [g, o, p, ga, oa] = await Promise.allSettled(tasks);
  const errors = [];
  for (const r of [g, ga]) {
    if (r.status !== 'rejected') continue;
    const msg = str(r.reason?.message, 120);
    errors.push(`google: ${msg}`);
    if (/quota|rate ?limit|429|403/i.test(msg)) { googleDownUntil = Date.now() + 15 * 60 * 1000; await setFlag('gb-quota-down', googleDownUntil, 15 * 60); }
  }
  if (o.status === 'rejected') errors.push(`openlibrary: ${str(o.reason?.message, 120)}`);
  const raw = [...(g.value || []), ...(o.value || []), ...(p.value || []), ...(ga.value || []), ...(oa.value || [])].filter((b) => b.title);
  if (!raw.length && errors.length === 2) {
    console.error('[books] both sources failed:', errors.join(' | '));
    noCache(res);
    return res.status(502).json({ error: 'Book lookup failed', detail: errors.join(' | ') });
  }
  const scored = raw.map((b, i) => ({ ...b, _s: score(b, q, i % 12) }));
  const books = dedupe(scored).sort((a, b) => b._s - a._s).map(({ _s, src, pop, ...b }) => b);
  const payload = best ? { book: books[0] || null } : { items: books.slice(0, limit) };
  if (errors.length) payload.warn = errors.join(' | ');
  await cache.set(cacheKey, payload, 7 * 24 * 3600 * 1000);
  cacheFor(res, 24 * 3600);
  return res.status(200).json(payload);
}
