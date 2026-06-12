export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { book, genre, description, mood, moodsOnly } = req.body || {};
  if (!book) return res.status(400).json({ error: 'Missing book' });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  try {
    let prompt;

    if (moodsOnly) {
      prompt = `For the book "${book}" (genre: ${genre || 'unknown'}), generate 6 specific scene moods that reflect actual emotional moments from THIS story.
${description ? 'Description: ' + description : ''}

Rules:
- Use your knowledge of this book
- Each mood = short evocative phrase (2-4 words)
- Specific to this book's world and characters

Respond ONLY with JSON array of 6 strings:
["mood 1","mood 2","mood 3","mood 4","mood 5","mood 6"]`;
    } else {
      prompt = `You are a music curator. For the book "${book}", create 5 YouTube search queries for INSTRUMENTAL music.

Genre: ${genre || 'unknown'}
${description ? 'Description: ' + description : 'Use your knowledge of this book.'}
${mood ? 'Current scene mood: ' + mood : ''}

RULES:
- Use your deep knowledge of this specific book
- Each query must be UNIQUE and reflect a DIFFERENT mood/energy from the book
- NO lyrics — add "no lyrics instrumental" to every query
- Be SPECIFIC: not "ambient music" but e.g. "epic desert sci-fi orchestral" for Dune
- Vary energy: intense, reflective, mysterious, epic, peaceful
- Match the genre:
  * Epic fantasy → "epic orchestral fantasy battle", "celtic adventure instrumental"
  * Dark thriller → "dark psychological thriller piano", "tense noir suspense"
  * Romance → "romantic piano love theme", "emotional strings romance"
  * Horror → "dark horror ambient atmospheric", "haunting suspense music"
  * Sci-fi → "space ambient electronic futuristic", "cyberpunk synthwave"
  * Korean/Asian fantasy → "korean drama OST instrumental", "asian epic orchestral"

Respond ONLY with JSON array, no markdown:
[{"name":"mood name for THIS book","vibe":"2-3 words","scQuery":"youtube search query no lyrics instrumental","duration":"~1-2 hr"}]`;
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        temperature: 0.9,
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
