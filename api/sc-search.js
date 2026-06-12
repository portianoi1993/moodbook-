export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  // For now use one verified working URL to test embed works
  // Will expand to full catalogue once confirmed working
  const url = 'https://soundcloud.com/borothin/dnd-tavern-ambience';

  return res.status(200).json({ 
    tracks: [{ permalink_url: url, title: q }] 
  });
}
