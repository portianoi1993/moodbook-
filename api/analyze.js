// GET /api/analyze?title=...&author=...&genre=...&desc=...&mood=...
// One AI call → book identity + 6 mood scenes + 6 instrumental track queries.
// Works with any OpenAI-compatible endpoint (OpenAI, OmniRoute, OpenRouter…):
//   AI_API_KEY (falls back to OPENAI_API_KEY), AI_BASE_URL, AI_MODEL
import { cors, guard, cacheFor, noCache, str, makeCache, fetchWithTimeout } from '../lib/http.js';

const cache = makeCache(400);
const DAY = 24 * 60 * 60 * 1000;

const SYSTEM = `You are MoodBook, an expert music curator for readers. Given a book, you design an instrumental reading soundtrack.

Return ONLY a JSON object with this exact shape:
{
  "book": {"title": "official English title", "author": "author", "genre": "short genre", "setting": "place/era in a few words", "tone": "3-5 mood words", "known": true},
  "why": "one sentence (max 22 words) explaining the sonic direction for this book",
  "moods": ["6 scene labels"],
  "tracks": [{"name": "track name", "vibe": "2-3 words", "query": "youtube search query", "duration": "~1 hr"}]
}

RULES FOR TRACKS (exactly 6):
- Instrumental only. Every query MUST end with "instrumental no lyrics" and should target long mixes (1 hour+), e.g. "arrakis desert ambient music 1 hour instrumental no lyrics".
- Match the book's real genre and setting. Never contradict it:
  self-help / non-fiction → lofi study beats, focus piano, calm concentration
  epic fantasy → cinematic orchestral, celtic, medieval tavern, battle drums
  sci-fi → space ambient, analog synth, cyberpunk downtempo
  horror / thriller → dark ambient, tense drones, eerie piano
  romance → romantic piano, soft strings, warm acoustic guitar
  literary / historical → period-appropriate: chamber strings, jazz, folk, piano
  mystery / crime → noir jazz, rainy night piano, slow-burn suspense
  East-Asian settings → guzheng, koto, k-drama OST instrumental
- Spread the energy: 1 high-energy, 1 calm/reflective, 1 atmospheric/mysterious, 1 emotional, 1 lofi/focus, 1 signature theme of the book.
- Track names are evocative and specific to the book's world (place names, motifs, characters), never generic like "Track 1".
- If the user supplies a scene mood, ALL 6 tracks serve that scene while staying inside the genre.

RULES FOR MOODS (exactly 6): 2-4 words, Title Case, each tied to a real moment or theme in the book and clearly implying a music style ("Epic Battle Surge", "Quiet Night Reading", "Dark Mystery Ambient", "Heartfelt Reunion", "Deep Focus Lofi", "Desert Dawn Drift").

If you do not recognise the book, set "known": false, infer the genre from the title, and still produce a sensible soundtrack.`;

function buildUser({ title, author, genre, desc, mood }) {
  const lines = [`Book: "${title}"${author ? ` by ${author}` : ''}`];
  if (genre) lines.push(`Catalogue genre: ${genre}`);
  if (desc) lines.push(`Catalogue description: ${desc}`);
  if (mood) lines.push(`Scene mood requested by the reader: "${mood}". Curate all 6 tracks for this scene.`);
  lines.push('Respond with the JSON object only.');
  return lines.join('\n');
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  return JSON.parse(cleaned.slice(a, b + 1));
}

function normalise(raw, fallbackTitle) {
  const book = raw.book || {};
  const tracks = (Array.isArray(raw.tracks) ? raw.tracks : [])
    .map((t) => ({
      name: str(t.name, 80),
      vibe: str(t.vibe, 40),
      query: str(t.query || t.scQuery, 140),
      duration: str(t.duration, 12) || '~1 hr',
    }))
    .filter((t) => t.name && t.query)
    .slice(0, 6);
  const moods = (Array.isArray(raw.moods) ? raw.moods : [])
    .map((m) => str(m, 40))
    .filter(Boolean)
    .slice(0, 6);
  if (tracks.length < 3) throw new Error('AI returned too few tracks');
  return {
    book: {
      title: str(book.title, 120) || fallbackTitle,
      author: str(book.author, 80),
      genre: str(book.genre, 60),
      setting: str(book.setting, 80),
      tone: str(book.tone, 80),
      known: book.known !== false,
    },
    why: str(raw.why, 200),
    moods,
    tracks,
  };
}

async function callAI(messages, { key, baseUrl, model }, useJsonMode) {
  const body = { model, messages, temperature: 0.6, max_tokens: 1100 };
  if (useJsonMode) body.response_format = { type: 'json_object' };
  const r = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }, 25000);
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try { msg = JSON.parse(text)?.error?.message || text; } catch {}
    const err = new Error(`upstream ${r.status}: ${str(msg, 200)}`);
    err.status = r.status;
    err.retryWithoutJsonMode = useJsonMode && r.status === 400 && /response_format|json_object/i.test(msg);
    throw err;
  }
  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (guard(req, res, { methods: ['GET'], max: 40 })) return;

  const q = req.query || {};
  const input = {
    title: str(q.title || q.book, 160),
    author: str(q.author, 80),
    genre: str(q.genre, 80),
    desc: str(q.desc || q.description, 600),
    mood: str(q.mood, 60),
  };
  if (!input.title) {
    noCache(res);
    return res.status(400).json({ error: 'Missing title' });
  }

  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  if (!key) {
    noCache(res);
    return res.status(500).json({ error: 'Server configuration error', detail: 'AI_API_KEY / OPENAI_API_KEY is not set' });
  }

  const cacheKey = [input.title, input.author, input.mood].join('|').toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit) {
    cacheFor(res, 7 * 24 * 3600);
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(hit);
  }

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildUser(input) },
  ];

  try {
    let content;
    try {
      content = await callAI(messages, { key, baseUrl, model }, true);
    } catch (e) {
      if (!e.retryWithoutJsonMode) throw e;
      content = await callAI(messages, { key, baseUrl, model }, false);
    }
    const result = normalise(extractJson(content), input.title);
    result.model = model;
    cache.set(cacheKey, result, DAY);
    cacheFor(res, 7 * 24 * 3600);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);
  } catch (e) {
    console.error('[analyze] failed:', e.message);
    noCache(res);
    const status = e.name === 'AbortError' ? 504 : 502;
    return res.status(status).json({
      error: 'AI service error',
      detail: e.name === 'AbortError' ? 'upstream timeout' : str(e.message, 220),
    });
  }
}
