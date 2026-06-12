export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, limit = 5 } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  const SC_CLIENT_ID = process.env.SC_CLIENT_ID || '4UbvQcL0kAzfwbYz4B3TDXzsszlYIW58';

  try {
    const url = `https://api.soundcloud.com/tracks?q=${encodeURIComponent(q)}&client_id=${SC_CLIENT_ID}&limit=${limit}&duration[from]=1800000&filter=public`;
    const r = await fetch(url);
    const data = await r.json();
    
    const tracks = Array.isArray(data) ? data : (data.collection || []);
    
    const results = tracks.map(t => ({
      id: t.id,
      title: t.title,
      user: t.user?.username || '',
      duration: Math.round(t.duration / 60000),
      permalink_url: t.permalink_url,
    }));
    
    return res.status(200).json({ tracks: results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
