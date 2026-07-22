const rateLimit = new Map();

function checkRateLimit(ip, maxRequests = 50, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  const record = rateLimit.get(ip);
  if (now > record.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  record.count++;
  return record.count <= maxRequests;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip, 50)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });
  
  // Sanitize query
  const safeQ = String(q).slice(0, 200);

  const YT_KEY = process.env.YT_API_KEY || 'AIzaSyD_GXtmqfc_rRVc7xa3v2g8tNoh-a4yR3o';

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(safeQ)}&type=video&videoDuration=long&maxResults=10&key=${YT_KEY}`;
    const r = await fetch(url);
    const d = await r.json();

    if (!d.items?.length) {
      return res.status(200).json({ videoId: null });
    }

    // Get video details to check embeddable
    const ids = d.items.map(v => v.id.videoId).join(',');
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&id=${ids}&key=${YT_KEY}`;
    const dr = await fetch(detailUrl);
    const dd = await dr.json();

    // Keep every embeddable candidate, then pick one at random so repeat
    // searches of the same book surface different tracks from the same pool.
    const candidates = (dd.items || []).filter(v =>
      v.status?.embeddable === true &&
      v.status?.privacyStatus === 'public'
    );

    if (candidates.length) {
      const good = candidates[Math.floor(Math.random() * candidates.length)];
      return res.status(200).json({
        videoId: good.id,
        title: d.items.find(i => i.id.videoId === good.id)?.snippet?.title || safeQ,
        poolSize: candidates.length
      });
    }

    const first = d.items[0];
    return res.status(200).json({
      videoId: first.id.videoId,
      title: first.snippet?.title || safeQ
    });

  } catch(e) {
    return res.status(500).json({ error: 'Search failed' });
  }
}
