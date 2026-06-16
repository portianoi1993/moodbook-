// In-memory rate limiter (resets on cold start, but effective for most abuse)
const rateLimit = new Map();

function checkRateLimit(ip, maxRequests = 20, windowMs = 60 * 60 * 1000) {
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
  
  const limit = checkRateLimit(ip, 20, 60 * 60 * 1000); // 20 req/hour
  
  res.setHeader('X-RateLimit-Remaining', limit.remaining);
  
  if (!limit.allowed) {
    return res.status(429).json({ 
      error: 'Too many requests. Please try again later.',
      retryAfter: limit.retryAfter 
    });
  }

  const { book, genre, description, mood, moodsOnly, identifyOnly } = req.body || {};
  if (!book) return res.status(400).json({ error: 'Missing book' });

  // Sanitize inputs
  const safeBook = String(book).slice(0, 200);
  const safeGenre = String(genre || '').slice(0, 100);
  const safeDesc = String(description || '').slice(0, 800);
  const safeMood = String(mood || '').slice(0, 100);

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Just identify the book (translate title, find author)
  if (identifyOnly) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {'Content-Type':'application/json','Authorization':`Bearer ${OPENAI_KEY}`},
        body: JSON.stringify({
          model: 'gpt-4o-mini', max_tokens: 100, temperature: 0,
          messages: [{role:'user', content:`What book is "${safeBook}"? Give me the official English title and author.
Respond ONLY with JSON: {"title":"English title","author":"Author name"}
If unknown, respond: {"title":"${safeBook}","author":""}`}]
        })
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content || '{}';
      return res.status(200).json(JSON.parse(text.replace(/```json|```/g,'').trim()));
    } catch(e) {
      return res.status(200).json({title: safeBook, author: ''});
    }
  }

  try {
    let prompt;

    if (moodsOnly) {
      prompt = `Book: "${safeBook}"
${safeDesc ? 'Description: ' + safeDesc : ''}

First identify what this book actually is (translate title if needed, identify genre/themes).
Then generate 6 specific scene moods from THIS book's actual plot and atmosphere.

Respond ONLY with JSON array of 6 short phrases (2-4 words each):
["mood 1","mood 2","mood 3","mood 4","mood 5","mood 6"]`;
    } else {
      prompt = `You are a music curator. Book: "${safeBook}"
Genre: ${safeGenre || 'unknown'}
${safeDesc ? 'Description: ' + safeDesc : 'Use your knowledge of this book.'}
${safeMood ? 'Scene: ' + safeMood : ''}

STEP 1: Identify this book. Translate title if not in English. Determine:
- Genre: sci-fi / fantasy / horror / romance / thriller / self-help / literary fiction / etc.
- Dominant emotions and atmosphere
- Setting and era

STEP 2: Create 5 YouTube search queries for INSTRUMENTAL background music.

RULES:
- "Atomic Habits" = self-help → lofi study music, focus beats, NOT epic orchestral
- "Dune" = epic sci-fi desert → cinematic orchestral, NOT pop music  
- "Twilight" = teen romance → romantic piano, soft strings
- Self-help/non-fiction → lofi hip hop, focus music, study beats
- Romance → romantic piano, soft strings, emotional
- Horror → dark ambient, atmospheric horror
- Epic fantasy → orchestral epic, celtic, battle music
- Sci-fi → space ambient, electronic, synthetic
- Korean/Asian fantasy → korean drama OST instrumental
- NEVER suggest music that contradicts the genre

ALWAYS include at least ONE lofi track matching the genre:
- Fantasy → "fantasy lofi hip hop instrumental"
- Horror → "dark lofi ambient study music"
- Romance → "romantic lofi chill beats"
- Sci-fi → "space lofi beats instrumental"
- Self-help → "focus lofi concentration beats no lyrics"

Each query MUST end with "no lyrics instrumental" and target 30min+ videos.

Respond ONLY with JSON array, no markdown:
[{"name":"mood name","vibe":"2-3 words","scQuery":"specific youtube query no lyrics instrumental 1 hour","duration":"~1-2 hr"}]`;
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 900,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const err = await r.json();
      console.error('OpenAI error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const d = await r.json();
    const text = d.choices?.[0]?.message?.content || '[]';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (moodsOnly) {
      return res.status(200).json({ moods: parsed });
    } else {
      return res.status(200).json({ tracks: parsed });
    }

  } catch(e) {
    console.error('Claude handler error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
