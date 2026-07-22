// In-memory rate limiter (resets on cold start, but effective for most abuse)
const rateLimit = new Map();

function checkRateLimit(ip, maxRequests = 40, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const key = ip;

  if (!rateLimit.has(key)) {
    rateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  const record = rateLimit.get(key);

  // Reset window if expired
  if (now > record.resetAt) {
    rateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  // Increment and check
  record.count++;
  if (record.count > maxRequests) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: maxRequests - record.count };
}

// Model always replies with a JSON object; strip fences defensively anyway.
function parseJSON(text) {
  return JSON.parse(String(text || '{}').replace(/```json|```/g, '').trim());
}

async function callOpenAI(key, { prompt, maxTokens, temperature }) {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      temperature,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limiting by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.socket?.remoteAddress ||
             'unknown';

  const limit = checkRateLimit(ip, 40, 60 * 60 * 1000); // 40 req/hour

  res.setHeader('X-RateLimit-Remaining', limit.remaining);

  if (!limit.allowed) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: limit.retryAfter
    });
  }

  const { book, genre, description, mood, author, unverified, moodsOnly, identifyOnly } = req.body || {};
  if (!book) return res.status(400).json({ error: 'Missing book' });

  // Sanitize inputs
  const safeBook = String(book).slice(0, 200);
  const safeGenre = String(genre || '').slice(0, 100);
  const safeDesc = String(description || '').slice(0, 800);
  const safeMood = String(mood || '').slice(0, 100);
  const safeAuthor = String(author || '').slice(0, 120);

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ══ STEP A1 — IDENTIFY THE BOOK FROM A TITLE IN ANY LANGUAGE ══
  if (identifyOnly) {
    const prompt = `You identify books from a title written in ANY language.

Query: "${safeBook}"

RULES:
1. TRANSLATIONS FIRST — A title written in Cyrillic, or in any script or
   language other than English, is very often a TRANSLATION of a foreign book.
   Do NOT infer the author's nationality from the language of the query.
   Always consider first whether this is a translated foreign title.

2. ADMIT IGNORANCE — If you are not certain this is a real, published book that
   you actually know, set "confidence" to "low" and leave "author" EMPTY.
   Inventing a plausible-sounding author is a FAILURE. An empty author with low
   confidence is the CORRECT answer when you are unsure. Never guess an author
   just because the title looks like it belongs to a particular country.

3. LANGUAGE INTEGRITY — Never resolve a query written in one language to an
   edition, title, or author transliteration belonging to a DIFFERENT language
   than the user used. Specifically: a Ukrainian query must NEVER be resolved
   to a Russian title, a Russian edition, or a Russian-based transliteration.
   The same rule applies to every language pair.

4. ADAPTED TITLES — Book titles are ADAPTED per market, not translated
   word-by-word. Identify the book by its real published identity in that
   market, not by literal word-for-word translation of the query.

5. AUTHOR TRANSLITERATION — Transliterate the author from the book's ORIGINAL
   language, never through Russian.
   Example: "Іван Багряний" -> "Ivan Bahriany" (NOT "Bagryany").

6. ORIGINAL LANGUAGE — "originalLanguage" is the language the book was WRITTEN
   in, which is frequently NOT the language of the query.

Respond ONLY with this JSON object:
{
  "titleEn": "canonical English or international title used for lookup",
  "titleOriginal": "title as published in the query's language",
  "author": "author name in Latin script, transliterated from the original language",
  "originalLanguage": "ISO 639-1 code of the language the book was WRITTEN in",
  "queryLanguage": "ISO 639-1 code of the language the query is written in",
  "confidence": "high or low"
}`;

    try {
      const r = await callOpenAI(OPENAI_KEY, { prompt, maxTokens: 200, temperature: 0 });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const d = await r.json();
      const parsed = parseJSON(d.choices?.[0]?.message?.content);
      return res.status(200).json({
        titleEn: parsed.titleEn || safeBook,
        titleOriginal: parsed.titleOriginal || safeBook,
        author: parsed.author || '',
        originalLanguage: parsed.originalLanguage || '',
        queryLanguage: parsed.queryLanguage || '',
        confidence: parsed.confidence === 'high' ? 'high' : 'low'
      });
    } catch (e) {
      console.error('identify error:', e);
      // Graceful degradation: echo the query, flag it as unidentified
      return res.status(200).json({
        titleEn: safeBook, titleOriginal: safeBook, author: '',
        originalLanguage: '', queryLanguage: '', confidence: 'low',
        failed: true
      });
    }
  }

  try {
    let prompt, maxTokens, temperature;

    if (moodsOnly) {
      temperature = 0.5;
      maxTokens = 300;
      prompt = `Book: "${safeBook}"
${safeAuthor ? 'Author: ' + safeAuthor : ''}
Genre: ${safeGenre || 'unknown — infer from the book'}
${safeDesc ? 'Description: ' + safeDesc : 'Use your knowledge of this book.'}

Generate 6 mood/scene labels tied to real moments or themes in THIS specific book.

RULES:
- Ground every label in the book's actual plot, setting and era — never generic
- Each label must imply a musical direction when read
- Write the labels in ENGLISH even when the book is not English
- Cover a spread of energies: one intense, one calm/reflective, one atmospheric,
  one emotional, one focus-friendly, one matching the book's signature theme
- Format: 2-4 words, Title Case

Respond ONLY with this JSON object:
{"moods":["label 1","label 2","label 3","label 4","label 5","label 6"]}`;
    } else {
      temperature = 0.3;
      maxTokens = 900;
      // When the catalogue could not confirm the book, the model must not
      // reconstruct a culture from the script the title happens to be in —
      // that is what turned a Ukrainian-titled space opera into folk music.
      const unverifiedNote = unverified ? `
IMPORTANT — THIS BOOK COULD NOT BE VERIFIED.
The title below was not confirmed against any book catalogue and may be a book
you do not know. Therefore:
- Do NOT infer culture, nationality, setting or era from the language or script
  the title is written in. A non-English title is usually a TRANSLATION.
- If you do not genuinely recognise this book, do NOT invent a cultural
  tradition. Choose neutral, widely-appealing instrumental reading music
  (calm piano, ambient, cinematic strings, gentle focus music) instead.
- Put "unknown" in any analysis field you cannot determine honestly.
` : '';
      prompt = `You are a music curator selecting instrumental background music for reading.
${unverifiedNote}
BOOK
Title: "${safeBook}"
${safeAuthor ? 'Author: ' + safeAuthor : ''}
Genre: ${safeGenre || 'unknown'}
${safeDesc ? 'Description: ' + safeDesc : 'Use your knowledge of this book.'}
${safeMood ? 'Scene focus: ' + safeMood : ''}

STEP 1 — ANALYSE THE BOOK.
Fill the "analysis" object from your knowledge of THIS specific book.
Be concrete and factual, never generic:
- setting: the actual place(s) the book takes place in
- era: the actual historical period
- culture: the cultural and musical tradition that setting belongs to
- emotions: the dominant emotional tones of the book
- energy: the overall intensity

STEP 2 — DERIVE 5 SEARCH QUERIES from the analysis you just wrote.

QUERY RULES:
- Every query must follow from your analysis. If the analysis says feudal Japan,
  the queries must reflect Japanese instrumentation, not generic ambient.
- Write every query in ENGLISH — YouTube's music catalogue is indexed in English
  — even when the book is not an English book.
- Prefer culturally specific instrumentation when the setting calls for it
  (for example koto, shakuhachi, bandura, duduk, oud, sitar, gamelan, erhu).
- Cover a spread: one signature theme, one calm/reflective, one tense/intense,
  one emotional, one focus-friendly.
- Include a lofi or study-beats query ONLY if it genuinely suits this book.
  Do NOT force lofi onto historical, literary or classical works.
- Never suggest music that contradicts the book's setting, era or culture.
- Every query must end with "no lyrics instrumental" and target long videos.

Respond ONLY with this JSON object, with exactly 5 tracks:
{
  "analysis": {
    "genre": "...",
    "setting": "...",
    "era": "...",
    "culture": "...",
    "emotions": ["...", "..."],
    "energy": "..."
  },
  "tracks": [
    {"name":"mood name","vibe":"2-3 words","scQuery":"english youtube query no lyrics instrumental","duration":"~1-2 hr"}
  ]
}`;
    }

    const r = await callOpenAI(OPENAI_KEY, { prompt, maxTokens, temperature });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.error('OpenAI error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const d = await r.json();
    const parsed = parseJSON(d.choices?.[0]?.message?.content);

    if (moodsOnly) {
      const moods = Array.isArray(parsed.moods) ? parsed.moods : [];
      if (!moods.length) return res.status(502).json({ error: 'AI returned no moods' });
      return res.status(200).json({ moods });
    }

    const tracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
    if (!tracks.length) return res.status(502).json({ error: 'AI returned no tracks' });
    return res.status(200).json({ tracks, analysis: parsed.analysis || null });

  } catch(e) {
    console.error('Claude handler error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
