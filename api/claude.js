export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { book, genre, description, mood, moodsOnly, identifyOnly } = req.body || {};
  if (!book) return res.status(400).json({ error: 'Missing book' });

  // Just identify the book (translate title, find author)
  if (identifyOnly) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
        body: JSON.stringify({
          model: 'gpt-4o-mini', max_tokens: 100, temperature: 0,
          messages: [{role:'user', content:`What book is "${book}"? Give me the official English title and author.
Respond ONLY with JSON: {"title":"English title","author":"Author name"}
If unknown, respond: {"title":"${book}","author":""}`}]
        })
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content || '{}';
      return res.status(200).json(JSON.parse(text.replace(/```json|```/g,'').trim()));
    } catch(e) {
      return res.status(200).json({title: book, author: ''});
    }
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  try {
    let prompt;

    if (moodsOnly) {
      prompt = `Book: "${book}"
${description ? 'Description: ' + description.slice(0, 500) : ''}

First identify what this book actually is (translate title if needed, identify genre/themes).
Then generate 6 specific scene moods from THIS book's actual plot and atmosphere.

Respond ONLY with JSON array of 6 short phrases (2-4 words each):
["mood 1","mood 2","mood 3","mood 4","mood 5","mood 6"]`;

    } else {
      prompt = `You are a music curator. Book: "${book}"
${description ? 'Description: ' + description.slice(0, 600) : ''}
${mood ? 'Scene: ' + mood : ''}

STEP 1: Identify this book. If the title is in another language, translate it. Determine:
- What is this book actually about?
- Genre: sci-fi / fantasy / horror / romance / thriller / self-help / literary fiction / etc.
- Dominant emotions: epic / tense / romantic / dark / uplifting / contemplative / etc.
- Setting: space / medieval / modern city / fantasy world / etc.

STEP 2: Based on that analysis, create 5 YouTube search queries for INSTRUMENTAL background music.

CRITICAL RULES:
- "Atomic Habits" = self-help → lofi study music, focus beats, NOT epic orchestral
- "Dune" = epic sci-fi desert → cinematic orchestral, NOT pop music
- "Twilight" = teen romance → romantic piano, soft strings, NOT battle music
- "Andy Weir Project Hail Mary" = sci-fi space = space ambient electronic
- "Warhammer 40k" = grimdark sci-fi = dark industrial metal instrumental, heavy orchestral
- Self-help/non-fiction → lofi hip hop, focus music, study beats
- Romance → romantic piano, soft strings, emotional
- Horror → dark ambient, atmospheric horror
- Epic fantasy → orchestral epic, celtic, battle music
- Sci-fi → space ambient, electronic, synthetic
- Thriller → tense suspense, dark noir
- NEVER suggest music that contradicts the genre

Each query MUST:
- End with "no lyrics instrumental"
- Match the ACTUAL genre of the book
- Be specific (not generic "ambient music")
- Target videos 30min-2hr long (add "1 hour" or "2 hours")

Respond ONLY with JSON array, no markdown, no explanation:
[{"name":"descriptive mood name","vibe":"2-3 words","scQuery":"specific youtube query no lyrics instrumental 1 hour","duration":"~1-2 hr"}]`;
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

    const d = await r.json();
    const text = d.choices?.[0]?.message?.content || '[]';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (moodsOnly) {
      return res.status(200).json({ moods: parsed });
    } else {
      return res.status(200).json({ tracks: parsed });
    }

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
