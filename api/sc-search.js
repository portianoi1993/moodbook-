export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  const YT_KEY = process.env.YT_API_KEY || 'AIzaSyD_GXtmqfc_rRVc7xa3v2g8tNoh-a4yR3o';

  try {
    // Search YouTube for long instrumental tracks
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoDuration=long&videoEmbeddable=true&maxResults=10&key=${YT_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.items?.length) {
      return res.status(200).json({ videoId: null, error: 'No results' });
    }

    // Get video IDs
    const ids = searchData.items.map(v => v.id.videoId).join(',');

    // Check which ones are actually embeddable
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${ids}&key=${YT_KEY}`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    // Find first truly embeddable public video
    const good = detailData.items?.find(v =>
      v.status?.embeddable === true &&
      v.status?.privacyStatus === 'public'
    );

    if (good) {
      return res.status(200).json({
        videoId: good.id,
        title: good.snippet?.title || q,
      });
    }

    // Fallback: return first result anyway
    const first = searchData.items[0];
    return res.status(200).json({
      videoId: first.id.videoId,
      title: first.snippet?.title || q,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
