export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  const YT_KEY = 'AIzaSyD_GXtmqfc_rRVc7xa3v2g8tNoh-a4yR3o';

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoDuration=long&videoEmbeddable=true&maxResults=5&key=${YT_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    const item = d.items?.[0];
    if (!item) return res.status(200).json({ videoId: null });
    return res.status(200).json({ videoId: item.id.videoId, title: item.snippet?.title });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
