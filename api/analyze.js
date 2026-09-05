// GET /api/analyze?title=...&author=...&genre=...&desc=...&mood=...
// One AI call → book identity + 6 mood scenes + 6 instrumental track queries.
// Works with any OpenAI-compatible endpoint (Gemini free tier, Groq, OpenRouter, OmniRoute, OpenAI)
// with an automatic fallback chain — see lib/ai.js for the env variables.
// If every provider fails, lib/fallback.js composes a genre-based soundtrack offline.
import { cors, guard, cacheFor, noCache, str } from '../lib/http.js';
import { layeredCache } from '../lib/store.js';
import { chat, getProviders } from '../lib/ai.js';
import { composeOffline } from '../lib/fallback.js';

const cache = layeredCache('ai', { limit: 400 });
const DAY = 24 * 60 * 60 * 1000;

const SYSTEM = `You are MoodBook, an expert music curator for readers. Given a book, you design an instrumental reading soundtrack.

Return ONLY a JSON object with this exact shape:
{
  "book": {"title": "title as the reader knows it (keep the original language if the input is not English)", "author": "author", "genre": "short genre", "setting": "place/era in a few words", "tone": "3-5 mood words", "known": true},
  "why": "one sentence (max 22 words) explaining the sonic direction for this book",
  "scenes": ["5 scene-mood labels"],
  "styles": ["5 music-style labels"],
  "tracks": [{"name": "track name", "vibe": "2-3 words", "query": "youtube search query", "duration": "~1 hr"}]
}

IDENTITY RULES:
- If the user supplies an author and/or a catalogue description, that IS the book. Never swap it for a better-known book with a similar title. Compose for the described book even if you have never heard of it, and keep the given title and author verbatim.
- Only when nothing but a title is given may you resolve it to the best-known work with that title.
- If you do not recognise the book, set "known": false, infer the genre from the title and description, and still produce a sensible soundtrack.

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

RULES FOR SCENES (exactly 5): scene moods that exist IN THIS BOOK, 2-4 words, Title Case, covering different energies — e.g. a tense/suspense moment, a calm or intimate moment, an action or climax moment, a melancholic or emotional moment, a wondrous or atmospheric moment. Name them after the book's own places, events or feelings ("Sietch Night Calm", "Sandworm Surge", "Court Intrigue Tension").

RULES FOR STYLES (exactly 5): music styles that suit THIS book, 1-3 words, Title Case, always including "Lofi Beats" and at least one of "Ambient", "Piano" — the rest chosen for the book (e.g. "Epic Orchestral", "Celtic Folk", "Dark Synth", "Noir Jazz", "Acoustic Guitar", "Choral", "Space Ambient", "Guzheng & Koto").

If the reader supplies a scene mood and/or a music style, ALL 6 tracks must serve that scene in that style while staying inside the book's world.`;

const LANG_NAMES = { uk: 'Ukrainian', en: 'English', pl: 'Polish', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', tr: 'Turkish', ja: 'Japanese', ko: 'Korean', zh: 'Simplified Chinese' };

function buildUser({ title, author, genre, desc, mood, style, lang }) {
  const lines = [`Book: "${title}"${author ? ` by ${author}` : ''}`];
  if (author || desc) lines.push('This identity is confirmed by the reader. Do not substitute another book.');
  if (lang && lang !== 'en' && LANG_NAMES[lang]) lines.push(`Write "why", scene labels, style labels, track names and vibes in ${LANG_NAMES[lang]}. Keep the book title as given and keep every "query" in English.`);
  if (genre) lines.push(`Catalogue genre: ${genre}`);
  if (desc) lines.push(`Catalogue description: ${desc}`);
  if (mood) lines.push(`Scene mood requested by the reader: "${mood}". Curate all 6 tracks for this scene.`);
  if (style) lines.push(`Music style requested by the reader: "${style}". Every track must be in this style.`);
  lines.push('Respond with the JSON object only.');
  return lines.join('\n');
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  const body = cleaned.slice(a, b === -1 ? undefined : b + 1);
  try { return JSON.parse(body); } catch (e1) {
    // Repair pass: strip control chars, trailing commas, and close an unterminated object/array (truncated output).
    let fixed = [...body].filter((ch) => ch.charCodeAt(0) >= 32 || ch === '\n' || ch === '\t').join('').replace(/,\s*([}\]])/g, '$1');
    const opens = (fixed.match(/[{[]/g) || []).length, closes = (fixed.match(/[}\]]/g) || []).length;
    if (opens > closes) {
      fixed = fixed.replace(/,\s*"[^"]*$/, '').replace(/,\s*\{[^}]*$/, '');
      const stack = [];
      for (const ch of fixed) { if (ch === '{' || ch === '[') stack.push(ch); else if (ch === '}' || ch === ']') stack.pop(); }
      fixed += stack.reverse().map((c) => (c === '{' ? '}' : ']')).join('');
    }
    try { return JSON.parse(fixed); } catch {
      const err = new Error(`${e1.message} · snippet: ${str(body.slice(0, 160), 160)}`);
      err.parse = true; throw err;
    }
  }
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
  const list = (v, n) => (Array.isArray(v) ? v : []).map((m) => str(m, 40)).filter(Boolean).slice(0, n);
  const scenes = list(raw.scenes || raw.moods, 5);
  const styles = list(raw.styles, 5);
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
    scenes,
    styles,
    moods: scenes, // backwards compatibility
    tracks,
  };
}

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (await guard(req, res, { methods: ['GET'], max: 40 })) return;

  const q = req.query || {};
  const input = {
    title: str(q.title || q.book, 160),
    author: str(q.author, 80),
    genre: str(q.genre, 80),
    desc: str(q.desc || q.description, 600),
    mood: str(q.mood, 60),
    style: str(q.style, 40),
    lang: /^[a-z]{2}$/.test(String(q.lang || '')) ? String(q.lang) : 'en',
  };
  if (!input.title) {
    noCache(res);
    return res.status(400).json({ error: 'Missing title' });
  }

  const configured = getProviders().length > 0;

  const cacheKey = [input.title, input.author, input.mood, input.style, input.lang].join('|').toLowerCase();
  // `fresh=1` = the reader pressed "try again" after a degraded answer → skip the short-lived memory cache.
  const hit = q.fresh === '1' ? null : await cache.get(cacheKey);
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
    if (!configured) throw Object.assign(new Error('No AI provider configured'), { status: 500 });
    let { content, provider, model } = await chat(messages, { json: true, maxTokens: 2200, temperature: 0.6, timeoutMs: 25000 });
    let parsed;
    try { parsed = extractJson(content); } catch (pe) {
      // One strict retry: lower temperature, explicit escaping rule.
      console.warn('[analyze] JSON parse failed, retrying strictly:', pe.message);
      const strict = [messages[0], { role: 'user', content: messages[1].content + ' STRICT: output must be valid RFC 8259 JSON. Escape any double quotes inside strings. No comments, no trailing commas, no text outside the object.' }];
      ({ content, provider, model } = await chat(strict, { json: true, maxTokens: 2200, temperature: 0.2, timeoutMs: 25000 }));
      parsed = extractJson(content);
    }
    let result;
    try { result = normalise(parsed, input.title); } catch (ne) {
      // Catalogue hints (wrong author / knock-off edition) can confuse the model → retry with the title alone.
      if (!input.author && !input.genre && !input.desc) throw ne;
      console.warn('[analyze] weak answer with hints, retrying title-only:', ne.message);
      const bare = [messages[0], { role: 'user', content: buildUser({ title: input.title, mood: input.mood, style: input.style, lang: input.lang }) }];
      ({ content, provider, model } = await chat(bare, { json: true, maxTokens: 2200, temperature: 0.5, timeoutMs: 25000 }));
      result = normalise(extractJson(content), input.title);
    }
    result.provider = provider; result.model = model;
    await cache.set(cacheKey, result, 7 * DAY); // shared store: a book composed once is composed for everyone, for a week
    cacheFor(res, 7 * 24 * 3600);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);
  } catch (e) {
    // Every provider failed (no credits, rate limit, outage, bad JSON) → offline composer keeps the product alive.
    console.error('[analyze] AI unavailable:', e.message);
    const offline = composeOffline(input);
    offline.reason = str(e.message, 400);
    await cache.set(cacheKey, offline, 3 * 60 * 1000, { shared: false }); // memory only, retry the AI soon
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120');
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Degraded', '1');
    return res.status(200).json(offline);
  }
}
