// Offline soundtrack composer: used when every AI provider is down or rate-limited.
// Picks a genre profile from the catalogue category / title and returns the same
// shape as the AI answer, so the UI keeps working (marked `degraded: true`).

const PROFILES = [
  { key: 'selfhelp', match: /self[- ]help|productivity|business|psychology|habit|motivat|success|leadership|finance|money|mindset|philosophy|health|wellness|non-?fiction|biography|memoir|science\b|history/i,
    genre: 'Non-fiction', moods: ['Deep Focus Flow', 'Morning Motivation', 'Calm Concentration', 'Late Night Study', 'Clear Mind Piano', 'Rainy Window Lofi'],
    tracks: [['Deep Focus Flow', 'lofi · steady', 'lofi hip hop study beats 1 hour'], ['Clear Mind', 'piano · minimal', 'minimal piano focus music 1 hour'], ['Morning Pages', 'warm · acoustic', 'acoustic guitar morning coffee instrumental 1 hour'], ['Quiet Library', 'ambient · soft', 'library ambience soft piano 1 hour'], ['Rainy Window', 'lofi · cozy', 'rainy day lofi chill beats 1 hour'], ['Slow Thinking', 'ambient · spacious', 'calm ambient music for concentration 1 hour']] },
  { key: 'fantasy', match: /fantasy|dragon|magic|wizard|witch|kingdom|quest|sword|elf|fae|throne|court of|wing/i,
    genre: 'Fantasy', moods: ['Epic Quest Theme', 'Tavern Firelight', 'Enchanted Forest', 'Battle Surge', 'Royal Court Intrigue', 'Dragon Rider Dawn'],
    tracks: [['Call to the Quest', 'epic · orchestral', 'epic fantasy orchestral adventure music 1 hour'], ['Tavern Firelight', 'celtic · warm', 'medieval tavern celtic music 1 hour'], ['Enchanted Forest', 'mystical · airy', 'enchanted forest ambient fantasy music 1 hour'], ['Battle at Dawn', 'intense · drums', 'epic battle drums orchestral 1 hour'], ['Court Intrigue', 'strings · tense', 'dark fantasy strings tension music 1 hour'], ['Fantasy Lofi', 'lofi · dreamy', 'fantasy lofi hip hop 1 hour']] },
  { key: 'scifi', match: /science fiction|sci-?fi|space|galaxy|planet|robot|android|cyber|dystopi|future|mars|star/i,
    genre: 'Science fiction', moods: ['Deep Space Drift', 'Neon City Pulse', 'Alien Horizon', 'Station Night Shift', 'Hyperdrive Tension', 'Zero-G Calm'],
    tracks: [['Deep Space Drift', 'ambient · vast', 'deep space ambient music 1 hour'], ['Neon City', 'synth · pulsing', 'cyberpunk synthwave downtempo 1 hour'], ['Alien Horizon', 'atmospheric · eerie', 'alien planet atmospheric ambient 1 hour'], ['Night Shift', 'analog · steady', 'analog synth ambient focus music 1 hour'], ['Hyperdrive', 'cinematic · tense', 'sci-fi cinematic tension music 1 hour'], ['Space Lofi', 'lofi · floating', 'space lofi beats 1 hour']] },
  { key: 'horror', match: /horror|thriller|suspense|crime|murder|mystery|detective|dark|haunt|ghost|serial/i,
    genre: 'Thriller / Mystery', moods: ['Creeping Dread', 'Rainy Noir Streets', 'Locked Room Tension', 'Midnight Investigation', 'Chase Through Shadows', 'Uneasy Calm'],
    tracks: [['Creeping Dread', 'dark · ambient', 'dark ambient horror atmosphere 1 hour'], ['Rainy Noir', 'jazz · smoky', 'noir jazz rainy night 1 hour'], ['Locked Room', 'tense · minimal', 'suspense thriller tension music 1 hour'], ['Midnight Case', 'piano · eerie', 'eerie piano mystery music 1 hour'], ['Through Shadows', 'pulse · driving', 'dark cinematic pulse music 1 hour'], ['Dark Lofi', 'lofi · moody', 'dark lofi ambient study 1 hour']] },
  { key: 'romance', match: /romance|love|wedding|heart|kiss|bride|affair|passion|boyfriend|girlfriend/i,
    genre: 'Romance', moods: ['First Spark', 'Slow Dance Kitchen', 'Summer Afternoon', 'Tender Confession', 'Bittersweet Goodbye', 'Cozy Sunday Lofi'],
    tracks: [['First Spark', 'piano · tender', 'romantic piano instrumental 1 hour'], ['Slow Dance', 'strings · warm', 'soft strings romantic music 1 hour'], ['Summer Afternoon', 'acoustic · light', 'acoustic guitar love songs instrumental 1 hour'], ['Tender Confession', 'emotional · slow', 'emotional piano and cello 1 hour'], ['Bittersweet', 'melancholy · gentle', 'melancholic piano instrumental 1 hour'], ['Cozy Lofi', 'lofi · warm', 'romantic lofi chill beats 1 hour']] },
  { key: 'historical', match: /historical|war\b|century|victorian|regency|empire|king|queen|revolution|ancient|greek|roman|myth/i,
    genre: 'Historical / Mythic', moods: ['Marble Halls', 'Battlefield Dawn', 'Candlelit Letters', 'Harbour at Dusk', 'Ancient Rite', 'Winter March'],
    tracks: [['Marble Halls', 'chamber · stately', 'chamber strings classical ambient 1 hour'], ['Battlefield Dawn', 'orchestral · solemn', 'solemn orchestral war music 1 hour'], ['Candlelit Letters', 'piano · intimate', 'classical piano nocturnes 1 hour'], ['Harbour at Dusk', 'folk · lyrical', 'mediterranean folk instrumental 1 hour'], ['Ancient Rite', 'ancient · drums', 'ancient greek lyre music 1 hour'], ['Winter March', 'cinematic · slow', 'epic historical cinematic music 1 hour']] },
];
const DEFAULT = {
  genre: 'Fiction', moods: ['Opening Chapter', 'Rising Tension', 'Quiet Reflection', 'Turning Point', 'Late Night Reading', 'Final Pages'],
  tracks: [['Opening Chapter', 'ambient · gentle', 'ambient reading music 1 hour'], ['Rising Tension', 'cinematic · building', 'cinematic ambient tension 1 hour'], ['Quiet Reflection', 'piano · calm', 'peaceful piano instrumental 1 hour'], ['Turning Point', 'strings · emotional', 'emotional strings cinematic 1 hour'], ['Late Night', 'lofi · mellow', 'late night lofi reading 1 hour'], ['Final Pages', 'atmospheric · warm', 'warm atmospheric ambient 1 hour']],
};

export function composeOffline({ title, author, genre, desc, mood, style }) {
  const hay = `${genre} ${title} ${desc}`.slice(0, 1200);
  const prof = PROFILES.find((p) => p.match.test(hay)) || DEFAULT;
  const tracks = prof.tracks.map(([name, vibe, q]) => ({
    name, vibe, duration: '~1 hr',
    query: `${mood ? mood.toLowerCase() + ' ' : ''}${style ? style.toLowerCase() + ' ' : ''}${q} instrumental no lyrics`.replace(/\s+/g, ' ').trim(),
  }));
  return {
    book: { title, author: author || '', genre: genre || prof.genre, setting: '', tone: '', known: true },
    why: `A ${prof.genre.toLowerCase()} pace calls for long, steady instrumental mixes — composed offline while the AI curator is unavailable.`,
    scenes: prof.moods.slice(0, 5),
    styles: ['Lofi Beats', 'Ambient', 'Piano', 'Acoustic Guitar', 'Cinematic'],
    moods: prof.moods.slice(0, 5),
    tracks,
    degraded: true,
  };
}
