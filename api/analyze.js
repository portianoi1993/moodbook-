// GET /api/analyze?title=...&author=...&genre=...&desc=...&mood=...
// One AI call → book identity + 6 mood scenes + 6 instrumental track queries.
// Works with any OpenAI-compatible endpoint (Gemini free tier, Groq, OpenRouter, OmniRoute, OpenAI)
// with an automatic fallback chain — see lib/ai.js for the env variables.
// If every provider fails, lib/fallback.js composes a genre-based soundtrack offline.
import { cors, guard, cacheFor, noCache, str, makeCache } from '../lib/http.js';
import { chat, getProviders } from '../lib/ai.js';
import { composeOffline } from '../lib/fallback.js';

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

  const configured = getProviders().length > 0;

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
      const bare = [messages[0], { role: 'user', content: buildUser({ title: input.title, mood: input.mood }) }];
      ({ content, provider, model } = await chat(bare, { json: true, maxTokens: 2200, temperature: 0.5, timeoutMs: 25000 }));
      result = normalise(extractJson(content), input.title);
    }
    result.provider = provider; result.model = model;
    cache.set(cacheKey, result, DAY);
    cacheFor(res, 7 * 24 * 3600);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);
  } catch (e) {
    // Every provider failed (no credits, rate limit, outage, bad JSON) → offline composer keeps the product alive.
    console.error('[analyze] AI unavailable:', e.message);
    const offline = composeOffline(input);
    offline.reason = str(e.message, 220);
    cache.set(cacheKey, offline, 10 * 60 * 1000); // short cache so we retry the AI soon
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Degraded', '1');
    return res.status(200).json(offline);
  }
}
