export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  const catalogue = {
    epic:      'https://soundcloud.com/brunuhville/fantasy-music-mix',
    fantasy:   'https://soundcloud.com/brunuhville/fantasy-music-mix',
    battle:    'https://soundcloud.com/epicmusicworld/epic-battle-music-mix',
    adventure: 'https://soundcloud.com/vindsvept/another-world',
    dark:      'https://soundcloud.com/petergundry/dark-matter',
    horror:    'https://soundcloud.com/petergundry/dark-matter',
    thriller:  'https://soundcloud.com/secession-studios/the-gathering-darkness',
    suspense:  'https://soundcloud.com/secession-studios/the-gathering-darkness',
    mystery:   'https://soundcloud.com/petergundry/the-old-tower',
    romance:   'https://soundcloud.com/petergundry/elegy-of-a-lost-soul',
    romantic:  'https://soundcloud.com/petergundry/elegy-of-a-lost-soul',
    piano:     'https://soundcloud.com/relaxdaily/relaxdaily-n-102',
    lofi:      'https://soundcloud.com/chillhopmusic/chillhop-essentials-spring-2020',
    chill:     'https://soundcloud.com/chillhopmusic/chillhop-essentials-spring-2020',
    space:     'https://soundcloud.com/secession-studios/cosmos',
    scifi:     'https://soundcloud.com/secession-studios/cosmos',
    celtic:    'https://soundcloud.com/brunuhville/nature-spirit',
    medieval:  'https://soundcloud.com/brunuhville/nature-spirit',
    asian:     'https://soundcloud.com/petergundry/ancient-lands',
    korean:    'https://soundcloud.com/petergundry/ancient-lands',
    orchestral:'https://soundcloud.com/secession-studios/imaginary-world',
    cinematic: 'https://soundcloud.com/secession-studios/imaginary-world',
    peaceful:  'https://soundcloud.com/relaxdaily/b-105',
    nature:    'https://soundcloud.com/relaxdaily/b-105',
    jazz:      'https://soundcloud.com/relaxdaily/b-101',
    classical: 'https://soundcloud.com/relaxdaily/relaxing-music-n-106',
  };

  const query = q.toLowerCase().replace(/[-_]/g, '');
  let url = null;
  for (const [key, val] of Object.entries(catalogue)) {
    if (query.includes(key)) { url = val; break; }
  }
  if (!url) url = catalogue.cinematic;

  try {
    const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const r = await fetch(oembedUrl);
    const data = await r.json();
    return res.status(200).json({ 
      tracks: [{ permalink_url: url, title: data.title || q }] 
    });
  } catch(e) {
    return res.status(200).json({ 
      tracks: [{ permalink_url: url, title: q }] 
    });
  }
}
