// Evergreen mixes: known long, embeddable YouTube videos per music family.
// Used only when the YouTube Data API quota is exhausted (100 searches/day on the free tier),
// so the reader still hears something that fits instead of silence. Refresh occasionally
// (ids gathered 2026-09-05 through the normal ranked search).
const FAMILIES = [
  { key: 'lofi', match: /lofi|lo-fi|chill ?hop|study beats|focus beats/i, videos: [['lTRiuFIWV54', '1 A.M Study Session [lofi hip hop]'], ['n61ULEU7CO0', 'Best of lofi hip hop [beats to relax/study to]'], ['sF80I-TQiW0', "90's Chill Lofi · Study Music"]] },
  { key: 'space', match: /space|cosmic|galaxy|interstellar|planet|sci-?fi|alien|nebula|zero-?g/i, videos: [['ztVV54sPOns', 'Travel the Universe · Space Ambient Music'], ['gCWaRhNUvfc', 'Space Ambient Music · Pure Cosmic Relaxation'], ['imtPF2b2Q4M', 'Epic Space Music: COSMOS']] },
  { key: 'synth', match: /synth|cyber|neon|techno|electronic|future garage|analog/i, videos: [['T2QZpy07j4s', 'Deep Future Garage Mix for Concentration'], ['KyfvIw48V6g', 'Cyberpunk 2077 Ambient Music · Night Chill'], ['VJtg7pJO3hQ', 'Dark Techno / Industrial Mix']] },
  { key: 'dark', match: /dark|horror|thriller|suspense|eerie|tense|tension|dread|mystery|paranoi|haunt|drone/i, videos: [['CDWtH8eHeEU', 'Dark and Mysterious Ambient Music'], ['EcLZE4JVc_E'.replace('EcLZE4JVc_E', 'EcLZE4KVc_E'), 'Reading music · Thriller and mystery · Atmospheric'], ['wgy_E5JK8gQ', 'Dark Academia Instrumentals']] },
  { key: 'noir', match: /noir|jazz|rain|detective|smoky|saxophone/i, videos: [['c2Cc-6nT0S4', 'Jazz Noir · Soft Jazz for Foggy Nights'], ['JElyhCKzhWI', 'Vintage jazz on a rainy 1940s night'], ['XdRKFWyUsrU', 'Rainy Night & Relaxing Jazz']] },
  { key: 'celtic', match: /celtic|tavern|medieval|folk|irish|bard|viking|nordic/i, videos: [['jiwuQ6UHMQg', 'Celtic Music by Adrian von Ziegler'], ['vyg5jJrZ42s', 'Medieval Fantasy Tavern · Music and Ambience'], ['ipFaubyDUT4', 'Medieval Celtic & Fantasy Celtic Music']] },
  { key: 'orchestral', match: /orchestr|epic|battle|drums|cinematic|fantasy|quest|adventure|heroic|choral|choir|war/i, videos: [['sHA_4wfQhE8', 'Calm Fantasy Music for Adventure and Exploration'], ['mB5rsayMxrg', 'Epic & Powerful Fantasy Music: Legendary'], ['imtPF2b2Q4M', 'Epic Space Music: COSMOS']] },
  { key: 'asian', match: /guzheng|koto|erhu|chinese|japanese|korean|k-?drama|asian|bamboo/i, videos: [['XmBji07OtwA', 'Chinese Bamboo Flute, Guzheng, Erhu · Instrumental'], ['MzgMBrtrFc4', 'Japanese Bamboo Flute, Guzheng, Erhu'], ['3I988A51_4Q', 'Guzheng Music · Chinese Harp']] },
  { key: 'classical', match: /classical|chamber|strings|baroque|mozart|bach|regency|victorian|historical|period/i, videos: [['uk-DSogtQRo', 'Classical Music for Relaxation: Mozart, Bach, Tchaikovsky'], ['R0kl9xFVSnI', 'Classical Study Music Playlist'], ['mdJU5ogrPMY', 'Classical Music for Studying']] },
  { key: 'romance', match: /romantic|romance|love|tender|cello|emotional|bittersweet|melanchol/i, videos: [['6GVgncA9oiw', 'Peaceful Piano, Cello & Guitar Music'], ['HSOtku1j600', 'Beautiful Piano Music for Studying'], ['EaUQbQ2PL-4', 'Relaxing Piano · Studying and Relaxation']] },
  { key: 'acoustic', match: /acoustic|guitar|coffee|cafe|morning|warm|cozy|folk/i, videos: [['GsrIZ1mnOvU', 'Morning Guitar Instrumental Music'], ['BywDOO99Ia0', 'Coffee Shop Music · Jazz Cafe Piano and Guitar'], ['kO1gvHp52l0', 'Relaxing Guitar Music']] },
  { key: 'piano', match: /piano|keys|minimal|gentle|calm|quiet|intimate|reflective/i, videos: [['HSOtku1j600', 'Beautiful Piano Music for Studying'], ['EaUQbQ2PL-4', 'Relaxing Piano · Studying and Relaxation'], ['6GVgncA9oiw', 'Peaceful Piano, Cello & Guitar Music']] },
  { key: 'focus', match: /focus|study|concentrat|productiv|work|self-?help|non-?fiction|business/i, videos: [['oPVte6aMprI', 'Deep Focus · Music For Studying, Concentration and Work'], ['j8L6IvuYGOQ', 'Work Music for Deep Focus'], ['DfSkKYQiwoU', 'Deep Focus Music To Improve Concentration']] },
  { key: 'ambient', match: /ambient|atmospher|drift|vast|wide|desert|wind|soundscape|meditat/i, videos: [['p2zMXSXhZ9M', 'Interstellar soundtrack · Soft Relaxing Ambient'], ['DRFHklnN-SM', 'Tranquility · Deep Relaxing Ambient Music'], ['DfSkKYQiwoU', 'Deep Focus Music · Ambient Study Music']] },
];
const DEFAULT = FAMILIES.find((f) => f.key === 'ambient');

/** Pick a fitting evergreen mix for a track query; `seed` spreads different tracks over the family's videos. */
export function pickEvergreen(query, seed = 0) {
  const fam = FAMILIES.find((f) => f.match.test(query)) || DEFAULT;
  const vids = fam.videos;
  const [videoId, title] = vids[Math.abs(seed) % vids.length];
  return {
    videoId, title, channel: 'Evergreen mix', thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, seconds: 3600, views: 0,
    alternatives: vids.filter((v) => v[0] !== videoId).map(([id, t]) => ({ videoId: id, title: t })),
    fallback: true, family: fam.key,
  };
}
