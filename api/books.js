// GET /api/books?q=...&limit=6        → ranked autocomplete list
// GET /api/books?q=...&best=1         → single best match for a typed title
// Sources: Google Books (key server-side) + Open Library (free, no key) queried in parallel,
// merged and ranked. If Google is over quota or slow, Open Library alone still answers.
import { cors, guard, cacheFor, noCache, str, makeCache, fetchWithTimeout } from '../lib/http.js';

const cache = makeCache(1500);
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
  const qTokens = qn.split(' ').filter((t) => t.length > 1);
  const tTokens = new Set(tn.split(' ')), aTokens = new Set(an.split(' '));
  let titleHits = 0, authorHits = 0;
  for (const t of qTokens) { if (tTokens.has(t)) titleHits += 1; else if (aTokens.has(t)) authorHits += 1; }
  const coverage = qTokens.length ? (titleHits + authorHits) / qTokens.length : 0;
  s += coverage * 30;
  if (tn === qn) s += 25;
  else if (qn && tn.startsWith(qn + ' ') && tn.split(' ').length - qn.split(' ').length <= 2) s += 8;
  else if (qn && tn.startsWith(qn)) s += 4; // prefix typing: "fourth wi" → "fourth wing"
  const extra = tn.split(' ').length - titleHits;
  s -= Math.min(15, Math.max(0, extra - 1) * 3);
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
  if (guard(req, res, { methods: ['GET'], max: 400 })) return;

  const q = str(req.query?.q, 160);
  const limit = Math.min(10, Math.max(1, parseInt(req.query?.limit, 10) || 6));
  const best = req.query?.best === '1';
  if (q.length < 2) { noCache(res); return res.status(400).json({ error: 'Query too short' }); }

  const cacheKey = `${q.toLowerCase()}|${best ? 'best' : limit}`;
  const hit = cache.get(cacheKey);
  if (hit) { cacheFor(res, 24 * 3600); return res.status(200).json(hit); }

  const key = process.env.GOOGLE_BOOKS_KEY || process.env.YT_API_KEY || '';
  // While the user is still typing a word ("intermez"), add a title-prefix wildcard query so partial words resolve.
  const partial = !best && /[a-zа-яіїєґ]$/i.test(q) && q.length >= 3 ? openLibrary(`title:${q}*`) : Promise.resolve([]);
  const [g, o, p] = await Promise.allSettled([google(q, key), openLibrary(q), partial]);
  const errors = [];
  if (g.status === 'rejected') errors.push(`google: ${str(g.reason?.message, 120)}`);
  if (o.status === 'rejected') errors.push(`openlibrary: ${str(o.reason?.message, 120)}`);
  const raw = [...(g.value || []), ...(o.value || []), ...(p.value || [])].filter((b) => b.title);
  if (!raw.length && errors.length === 2) {
    console.error('[books] both sources failed:', errors.join(' | '));
    noCache(res);
    return res.status(502).json({ error: 'Book lookup failed', detail: errors.join(' | ') });
  }
  const scored = raw.map((b, i) => ({ ...b, _s: score(b, q, i % 12) }));
  const books = dedupe(scored).sort((a, b) => b._s - a._s).map(({ _s, src, pop, ...b }) => b);
  const payload = best ? { book: books[0] || null } : { items: books.slice(0, limit) };
  if (errors.length) payload.warn = errors.join(' | ');
  cache.set(cacheKey, payload, 6 * 3600 * 1000);
  cacheFor(res, 24 * 3600);
  return res.status(200).json(payload);
}
