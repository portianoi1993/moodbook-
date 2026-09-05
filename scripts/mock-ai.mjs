// Mock OpenAI-compatible server for local UI testing without an AI key.
// node scripts/mock-ai.mjs  → http://localhost:3940/v1/chat/completions
import http from 'node:http';
const PORT = +(process.env.MOCK_PORT || 3940);
http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  let title = 'Unknown', mood = '';
  try { const b = JSON.parse(raw); const u = b.messages?.at(-1)?.content || ''; title = /Book: "([^"]+)"/.exec(u)?.[1] || title; mood = /Scene mood requested by the reader: "([^"]+)"/.exec(u)?.[1] || ''; } catch {}
  const t = (n, v, q) => ({ name: n, vibe: v, query: `${q} 1 hour instrumental no lyrics`, duration: '~1 hr' });
  const tag = mood ? ` (${mood})` : '';
  const out = {
    book: (() => { const k = title.toLowerCase(); const known = k.includes('dune') ? ['Dune', 'Frank Herbert'] : k.includes('hail mary') ? ['Project Hail Mary', 'Andy Weir'] : k.includes('women') ? ['The Women', 'Kristin Hannah'] : null; return known ? { title: known[0], author: known[1], genre: 'Epic sci-fi', setting: 'Desert planet, far future', tone: 'vast, tense, mystical', known: true } : { title, author: '', genre: 'Fiction', setting: '', tone: 'unknown', known: false }; })(),
    why: `A slow-burning desert epic asks for wide, wind-swept textures with a pulse underneath${tag}.`,
    moods: ['Desert Dawn Drift', 'Spice Vision Trance', 'Sietch Night Calm', 'Sandworm Surge', 'Court Intrigue Tension', 'Deep Focus Lofi'],
    tracks: [
      t('Arrakeen Sunrise' + tag, 'vast · warm', 'arrakis desert ambient music'),
      t('The Spice Must Flow', 'hypnotic · pulsing', 'dune inspired dark ambient'),
      t('Sietch Tabr Nights', 'calm · intimate', 'desert night ambient duduk'),
      t('Shai-Hulud Rising', 'epic · tense', 'epic cinematic percussion desert'),
      t('Bene Gesserit Whisper', 'mystical · eerie', 'mystical choir ambient drone'),
      t('Study on Caladan', 'lofi · focus', 'space lofi beats'),
    ],
  };
  const json = JSON.stringify({ id: 'mock', choices: [{ message: { role: 'assistant', content: JSON.stringify(out) } }] });
  setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(json); }, 900);
}).listen(PORT, () => console.log(`mock AI → http://localhost:${PORT}/v1`));
