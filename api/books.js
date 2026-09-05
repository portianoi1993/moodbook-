// GET /api/books?q=...&limit=6        → ranked autocomplete list
// GET /api/books?q=...&best=1         → single best match for a typed title
// Proxies Google Books so the key stays server-side and results get CDN-cached.
import { cors, guard, cacheFor, noCache, str, makeCache, fetchWithTimeout } from '../lib/http.js';

const cache = makeCache(800);
const ACADEMIC = /methodolog|методичк|методичн|підручник|посібник|workbook|curriculum|syllabus|lecture notes|study guide|teacher'?s (guide|manual)|instructor'?s manual|dissertation|\bthesis\b|proceedings|conference paper|summary of|summary & analysis|sparknotes|cliffsnotes|analysis of|companion to|trivia|quiz book|coloring book|activity book|journal|notebook|planner|summary|summarized|key takeaways|book club questions|discussion guide|conversation starters/i;

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9а-яіїєґ\s]/gi, ' ').replace(/\s+/g, ' ').trim();

const cleanTitle = (t) => {
  let s = str(t, 200);
  s = s.replace(/\s*[\(\[][^)\]]*(edition|издание|видання|ebook|e-book|kindle|unabridged|large print|illustrated|annotated|tie-in|boxed|box set)[^)\]]*[\)\]]/gi, '');
  s = s.replace(/\s*:\s*(a novel|the novel|a memoir)$/i, '');
  // trailing "(Series, Book 1)" / "(Imprint)" groups when a real title remains
  const m = /^(.{6,}?)\s*[\(\[][^)\]]{2,40}[\)\]]\s*$/.exec(s);
  if (m && m[1].trim().split(' ').length >= 2) s = m[1];
  return s.trim();
};

function toBook(item) {
  const v = item.volumeInfo || {};
  const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
  return {
    id: item.id,
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
  };
}

function score(b, q, index) {
  const qn = norm(q);
  const tn = norm(b.title);
  const an = norm(b.author);
  const text = `${b.title} ${b.subtitle} ${b.categories} ${b.desc}`;
  let s = Math.max(0, 14 - index) * 1.0; // keep Google's relevance order as a mild prior
  if (ACADEMIC.test(text)) s -= 40;
  if (b.title.length > 6 && b.title === b.title.toUpperCase()) s -= 28; // ALL-CAPS knock-offs
  if (/^[A-Z].s?[A-Z]/.test(b.author) || /(summary|analysis|workbook|publishing|press|books?)/i.test(b.author)) s -= 12; // initial-only / publisher "authors"
  if (b.desc.length < 40) s -= 6;
  if (b.desc.length > 200) s += 5;
  if (b.pages >= 150) s += 4;
  if (b.cover) s += 12;
  if (b.author) s += 6; else s -= 12;
  s += Math.min(20, Math.log10(1 + b.ratingsCount) * 6);
  if (b.pages && b.pages < 60) s -= 8;
  // language affinity: Cyrillic query → uk/ru editions, otherwise prefer English
  const cyr = /[а-яіїєґ]/i.test(q);
  if (b.lang) s += (cyr ? /^(uk|ru)$/.test(b.lang) : b.lang === 'en') ? 6 : -10;
  if (/[\(\[]/.test(b.title)) s -= 4;
  // query ↔ title overlap
  const qTokens = qn.split(' ').filter((t) => t.length > 1);
  const tTokens = new Set(tn.split(' '));
  const aTokens = new Set(an.split(' '));
  let titleHits = 0, authorHits = 0;
  for (const t of qTokens) {
    if (tTokens.has(t)) titleHits += 1;
    else if (aTokens.has(t)) authorHits += 1;
  }
  const coverage = qTokens.length ? (titleHits + authorHits) / qTokens.length : 0;
  s += coverage * 30;
  if (tn === qn) s += 25;
  else if (qn && tn.startsWith(qn + ' ') && tn.split(' ').length - qn.split(' ').length <= 2) s += 8;
  // penalise titles much longer than the query (biographies, companions, "X and the …")
  const extra = tn.split(' ').length - titleHits;
  s -= Math.min(15, Math.max(0, extra - 1) * 3);
  return s;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((b) => {
    const k = `${norm(b.title)}|${norm(b.author)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (guard(req, res, { methods: ['GET'], max: 240 })) return;

  const q = str(req.query?.q, 160);
  const limit = Math.min(10, Math.max(1, parseInt(req.query?.limit, 10) || 6));
  const best = req.query?.best === '1';
  if (q.length < 2) {
    noCache(res);
    return res.status(400).json({ error: 'Query too short' });
  }

  const cacheKey = `${q.toLowerCase()}|${best ? 'best' : limit}`;
  const hit = cache.get(cacheKey);
  if (hit) {
    cacheFor(res, 24 * 3600);
    return res.status(200).json(hit);
  }

  const key = process.env.GOOGLE_BOOKS_KEY || process.env.YT_API_KEY || '';
  const params = new URLSearchParams({
    q,
    maxResults: '15',
    printType: 'books',
    orderBy: 'relevance',
    fields: 'items(id,volumeInfo(title,subtitle,authors,imageLinks,publishedDate,categories,description,ratingsCount,averageRating,pageCount,language))',
  });
  if (key) params.set('key', key);

  try {
    const r = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?${params}`, {}, 8000);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Google Books ${r.status}`);
    const books = dedupe((d.items || []).map(toBook).filter((b) => b.title))
      .map((b, i) => ({ ...b, _s: score(b, q, i) }))
      .sort((a, b) => b._s - a._s);
    const clean = books.map(({ _s, ...b }) => b);
    const payload = best ? { book: clean[0] || null } : { items: clean.slice(0, limit) };
    cache.set(cacheKey, payload, 6 * 3600 * 1000);
    cacheFor(res, 24 * 3600);
    return res.status(200).json(payload);
  } catch (e) {
    console.error('[books] failed:', e.message);
    noCache(res);
    return res.status(502).json({ error: 'Book lookup failed', detail: str(e.message, 200) });
  }
}
