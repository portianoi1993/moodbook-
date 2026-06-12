export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { book, genre, description, mood } = req.body;
  const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `You are a music curator for readers. Find 5 YouTube search queries for INSTRUMENTAL music for the book "${book}".
Genre: ${genre || 'unknown'}
Description: ${description || 'Use your knowledge of this book'}
${mood ? 'Scene mood: ' + mood : ''}

Rules:
- Use your knowledge of this specific book even if description is empty
- Each query must be UNIQUE and specific to this book's atmosphere
- NO lyrics - instrumental only
- Vary energy levels across 5 tracks
- Make queries specific: not "ambient music" but "epic fantasy orchestral battle" or "dark thriller suspense piano"

Respond ONLY with JSON array:
[{"name":"mood name","vibe":"2-3 words","scQuery":"youtube search query no lyrics instrumental","duration":"~1-2 hr"}]`
        }]
      })
    });
    const d = await r.json();
    const text = d.content?.[0]?.text || '[]';
    const tracks = JSON.parse(text.replace(/```json|```/g, '').trim());
    return res.status(200).json({ tracks });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
