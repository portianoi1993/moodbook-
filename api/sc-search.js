export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    // Search SoundCloud via their search page URL
    const searchUrl = `https://soundcloud.com/search/sounds?q=${encodeURIComponent(q)}`;
    const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(searchUrl)}`;
    const r = await fetch(oembedUrl);
    const data = await r.json();
    
    // Extract track URL from oEmbed response
    const match = data.html?.match(/url=([^&"]+)/);
    const trackUrl = match ? decodeURIComponent(match[1]) : null;
    
    return res.status(200).json({ 
      tracks: [{ permalink_url: trackUrl || searchUrl, title: data.title || q }] 
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
