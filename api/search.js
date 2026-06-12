export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  const YT_KEY = process.env.YT_API_KEY || 'AIzaSyD_GXtmqfc_rRVc7xa3v2g8tNoh-a4yR3o';

  try {
    // videoDuration=long filters videos over 20 minutes
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoDuration=long&maxResults=10&key=${YT_KEY}`;
    const r = await fetch(url);
    const d = await r.json();

    if (!d.items?.length) {
      return res.status(200).json({ videoId: null });
    }

    // Get video details to check embeddable status
    const ids = d.items.map(v => v.id.videoId).join(',');
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&id=${ids}&key=${YT_KEY}`;
    const dr = await fetch(detailUrl);
    const dd = await dr.json();

    // Find first embeddable public video
    const good = dd.items?.find(v =>
      v.status?.embeddable === true &&
      v.status?.privacyStatus === 'public'
    );

    if (good) {
      return res.status(200).json({
        videoId: good.id,
        title: d.items.find(i => i.id.videoId === good.id)?.snippet?.title || q
      });
    }

    // Fallback to first result
    const first = d.items[0];
    return res.status(200).json({
      videoId: first.id.videoId,
      title: first.snippet?.title || q
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
