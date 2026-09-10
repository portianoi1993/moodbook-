// Offline soundtrack composer: used when every AI provider is down or rate-limited.
// Picks a genre profile from the catalogue category / title and returns the same
// shape as the AI answer, so the UI keeps working (marked `degraded: true`).

const PROFILES = [
  { key: 'selfhelp', match: /self[- ]help|productivity|business|psychology|habit|motivat|success|leadership|finance|money|mindset|philosophy|health|wellness|non-?fiction|biography|memoir|science\b(?!\s*fiction)|history/i, // "science fiction" is not popular science
    genre: 'Non-fiction', moods: ['Deep Focus Flow', 'Morning Motivation', 'Calm Concentration', 'Late Night Study', 'Clear Mind Piano', 'Rainy Window Lofi'],
    tracks: [['Deep Focus Flow', 'lofi · steady', 'lofi hip hop study beats 1 hour'], ['Clear Mind', 'piano · minimal', 'minimal piano focus music 1 hour'], ['Morning Pages', 'warm · acoustic', 'acoustic guitar morning coffee instrumental 1 hour'], ['Quiet Library', 'ambient · soft', 'library ambience soft piano 1 hour'], ['Rainy Window', 'lofi · cozy', 'rainy day lofi chill beats 1 hour'], ['Slow Thinking', 'ambient · spacious', 'calm ambient music for concentration 1 hour']],
    sounds: ['Quiet Library', 'Rain on the Study Window', 'Morning Café Murmur', 'Fireplace and Page Turns', 'Garden Birds at Dawn'],
    soundTracks: [['Quiet Library', 'hush · pages', 'quiet library ambience'], ['Rain on the Window', 'rain · glass', 'rain on window ambience'], ['Morning Café', 'cups · murmur', 'coffee shop ambience'], ['Fireplace and Pages', 'fire · paper', 'fireplace page turning ambience'], ['Garden at Dawn', 'birds · breeze', 'morning garden birds ambience'], ['Study Clock', 'tick · still', 'ticking clock quiet room ambience']] },
  { key: 'fantasy', match: /fantasy|dragon|magic|wizard|witch|kingdom|quest|sword|elf|fae|throne|court of|wing/i,
    genre: 'Fantasy', moods: ['Epic Quest Theme', 'Tavern Firelight', 'Enchanted Forest', 'Battle Surge', 'Royal Court Intrigue', 'Dragon Rider Dawn'],
    tracks: [['Call to the Quest', 'epic · orchestral', 'epic fantasy orchestral adventure music 1 hour'], ['Tavern Firelight', 'celtic · warm', 'medieval tavern celtic music 1 hour'], ['Enchanted Forest', 'mystical · airy', 'enchanted forest ambient fantasy music 1 hour'], ['Battle at Dawn', 'intense · drums', 'epic battle drums orchestral 1 hour'], ['Court Intrigue', 'strings · tense', 'dark fantasy strings tension music 1 hour'], ['Fantasy Lofi', 'lofi · dreamy', 'fantasy lofi hip hop 1 hour']],
    sounds: ['Tavern Fire and Chatter', 'Rain on Castle Stone', 'Enchanted Forest Night', 'Mountain Wind and Snow', 'Distant War Drums'],
    soundTracks: [['Tavern Fire and Chatter', 'fire · voices', 'medieval tavern fireplace crowd ambience'], ['Rain on Castle Stone', 'rain · stone', 'rain on stone castle courtyard ambience'], ['Enchanted Forest Night', 'owls · crickets', 'night forest owls crickets ambience'], ['Mountain Wind and Snow', 'wind · cold', 'mountain wind snowstorm ambience'], ['Distant War Drums', 'drums · wind', 'distant war drums battlefield wind ambience'], ['Campfire Under Stars', 'fire · night', 'campfire crackling night ambience']] },
  { key: 'scifi', match: /science fiction|sci-?fi|space|galaxy|planet|robot|android|cyber|dystopi|future|mars|star/i,
    genre: 'Science fiction', moods: ['Deep Space Drift', 'Neon City Pulse', 'Alien Horizon', 'Station Night Shift', 'Hyperdrive Tension', 'Zero-G Calm'],
    tracks: [['Deep Space Drift', 'ambient · vast', 'deep space ambient music 1 hour'], ['Neon City', 'synth · pulsing', 'cyberpunk synthwave downtempo 1 hour'], ['Alien Horizon', 'atmospheric · eerie', 'alien planet atmospheric ambient 1 hour'], ['Night Shift', 'analog · steady', 'analog synth ambient focus music 1 hour'], ['Hyperdrive', 'cinematic · tense', 'sci-fi cinematic tension music 1 hour'], ['Space Lofi', 'lofi · floating', 'space lofi beats 1 hour']],
    sounds: ['Starship Engine Hum', 'Airlock Hiss and Vents', 'Alien Wind on Bare Rock', 'Space Station Night Shift', 'Comms Static and Beeps'],
    soundTracks: [['Starship Engine Hum', 'hum · deep', 'spaceship engine room hum ambience'], ['Airlock Hiss and Vents', 'hiss · vents', 'spaceship interior air vents ambience'], ['Alien Wind on Bare Rock', 'wind · alien', 'alien planet wind ambience'], ['Space Station Night Shift', 'hum · still', 'space station ambient hum ambience'], ['Comms Static and Beeps', 'static · beeps', 'radio static computer beeps ambience'], ['Cryo Bay', 'cold · hum', 'cryogenic chamber hum ambience']] },
  { key: 'horror', match: /horror|thriller|suspense|crime|murder|mystery|detective|dark|haunt|ghost|serial/i,
    genre: 'Thriller / Mystery', moods: ['Creeping Dread', 'Rainy Noir Streets', 'Locked Room Tension', 'Midnight Investigation', 'Chase Through Shadows', 'Uneasy Calm'],
    tracks: [['Creeping Dread', 'dark · ambient', 'dark ambient horror atmosphere 1 hour'], ['Rainy Noir', 'jazz · smoky', 'noir jazz rainy night 1 hour'], ['Locked Room', 'tense · minimal', 'suspense thriller tension music 1 hour'], ['Midnight Case', 'piano · eerie', 'eerie piano mystery music 1 hour'], ['Through Shadows', 'pulse · driving', 'dark cinematic pulse music 1 hour'], ['Dark Lofi', 'lofi · moody', 'dark lofi ambient study 1 hour']],
    sounds: ['Old House Creaks', 'Rain and Distant Sirens', 'Wind in the Chimney', 'Basement Drip and Hum', 'Night Street Footsteps'],
    soundTracks: [['Old House Creaks', 'creak · dark', 'creaking old house night ambience'], ['Rain and Distant Sirens', 'rain · city', 'rain city night distant sirens ambience'], ['Wind in the Chimney', 'howl · draft', 'howling wind chimney ambience'], ['Basement Drip and Hum', 'drip · echo', 'dripping basement echo ambience'], ['Night Street Footsteps', 'steps · wet', 'footsteps wet street night ambience'], ['Clock in a Dark Room', 'tick · hollow', 'ticking clock dark room ambience']] },
  { key: 'romance', match: /romance|love|wedding|heart|kiss|bride|affair|passion|boyfriend|girlfriend/i,
    genre: 'Romance', moods: ['First Spark', 'Slow Dance Kitchen', 'Summer Afternoon', 'Tender Confession', 'Bittersweet Goodbye', 'Cozy Sunday Lofi'],
    tracks: [['First Spark', 'piano · tender', 'romantic piano instrumental 1 hour'], ['Slow Dance', 'strings · warm', 'soft strings romantic music 1 hour'], ['Summer Afternoon', 'acoustic · light', 'acoustic guitar love songs instrumental 1 hour'], ['Tender Confession', 'emotional · slow', 'emotional piano and cello 1 hour'], ['Bittersweet', 'melancholy · gentle', 'melancholic piano instrumental 1 hour'], ['Cozy Lofi', 'lofi · warm', 'romantic lofi chill beats 1 hour']],
    sounds: ['Café on a Rainy Afternoon', 'Summer Garden Bees', 'Seaside Evening Waves', 'Fireplace and Soft Rain', 'City Balcony at Night'],
    soundTracks: [['Café on a Rainy Afternoon', 'rain · cups', 'rainy day cafe ambience'], ['Summer Garden Bees', 'bees · breeze', 'summer garden bees birds ambience'], ['Seaside Evening Waves', 'waves · soft', 'gentle ocean waves evening ambience'], ['Fireplace and Soft Rain', 'fire · rain', 'fireplace soft rain ambience'], ['City Balcony at Night', 'traffic · far', 'city balcony night ambience'], ['Kitchen on Sunday', 'kettle · hush', 'quiet kitchen morning ambience']] },
  { key: 'historical', match: /historical|war\b|century|victorian|regency|empire|king|queen|revolution|ancient|greek|roman|myth/i,
    genre: 'Historical / Mythic', moods: ['Marble Halls', 'Battlefield Dawn', 'Candlelit Letters', 'Harbour at Dusk', 'Ancient Rite', 'Winter March'],
    tracks: [['Marble Halls', 'chamber · stately', 'chamber strings classical ambient 1 hour'], ['Battlefield Dawn', 'orchestral · solemn', 'solemn orchestral war music 1 hour'], ['Candlelit Letters', 'piano · intimate', 'classical piano nocturnes 1 hour'], ['Harbour at Dusk', 'folk · lyrical', 'mediterranean folk instrumental 1 hour'], ['Ancient Rite', 'ancient · drums', 'ancient greek lyre music 1 hour'], ['Winter March', 'cinematic · slow', 'epic historical cinematic music 1 hour']],
    sounds: ['Marble Hall Echoes', 'Harbour Gulls and Ropes', 'Candlelit Study Quill', 'Market Square Crowd', 'Carriage on Cobblestones'],
    soundTracks: [['Marble Hall Echoes', 'echo · stone', 'marble hall footsteps echo ambience'], ['Harbour Gulls and Ropes', 'gulls · creak', 'old harbour seagulls ropes ambience'], ['Candlelit Study Quill', 'quill · candle', 'quill writing candle crackle ambience'], ['Market Square Crowd', 'crowd · bells', 'medieval market crowd ambience'], ['Carriage on Cobblestones', 'hooves · wheels', 'horse carriage cobblestones ambience'], ['Winter Camp Wind', 'wind · fire', 'winter camp wind fire ambience']] },
];
const DEFAULT = {
  genre: 'Fiction', moods: ['Opening Chapter', 'Rising Tension', 'Quiet Reflection', 'Turning Point', 'Late Night Reading', 'Final Pages'],
  tracks: [['Opening Chapter', 'ambient · gentle', 'ambient reading music 1 hour'], ['Rising Tension', 'cinematic · building', 'cinematic ambient tension 1 hour'], ['Quiet Reflection', 'piano · calm', 'peaceful piano instrumental 1 hour'], ['Turning Point', 'strings · emotional', 'emotional strings cinematic 1 hour'], ['Late Night', 'lofi · mellow', 'late night lofi reading 1 hour'], ['Final Pages', 'atmospheric · warm', 'warm atmospheric ambient 1 hour']],
  sounds: ['Rain on the Window', 'Crackling Fireplace', 'Forest After Dark', 'Café Murmur', 'Wind over Open Fields'],
  soundTracks: [['Rain on the Window', 'rain · glass', 'rain on window ambience'], ['Crackling Fireplace', 'fire · warm', 'crackling fireplace ambience'], ['Forest After Dark', 'wind · crickets', 'night forest ambience crickets wind'], ['Café Murmur', 'cups · voices', 'coffee shop ambience'], ['Wind over Open Fields', 'wind · vast', 'wind over fields ambience'], ['Ocean at Night', 'waves · slow', 'ocean waves at night ambience']],
};

export function composeOffline({ title, author, genre, desc, mood, style, sound }) {
  const hay = `${genre} ${title} ${desc}`.slice(0, 1200);
  const prof = PROFILES.find((p) => p.match.test(hay)) || DEFAULT;
  const source = sound ? (prof.soundTracks || DEFAULT.soundTracks) : prof.tracks;
  const tracks = source.map(([name, vibe, q]) => ({
    name, vibe, duration: '~1 hr',
    query: sound
      ? `${sound.toLowerCase()} ${q}`.replace(/\s+/g, ' ').trim()
      : `${mood ? mood.toLowerCase() + ' ' : ''}${style ? style.toLowerCase() + ' ' : ''}${q} instrumental no lyrics`.replace(/\s+/g, ' ').trim(),
  }));
  return {
    book: { title, author: author || '', genre: genre || prof.genre, setting: '', tone: '', known: true },
    why: sound
      ? 'Pure atmosphere while the AI curator is unavailable — raw ambience rather than music.'
      : `A ${prof.genre.toLowerCase()} pace calls for long, steady instrumental mixes — composed offline while the AI curator is unavailable.`,
    scenes: prof.moods.slice(0, 5),
    styles: ['Lofi Beats', 'Ambient', 'Piano', 'Acoustic Guitar', 'Cinematic'],
    sounds: prof.sounds || DEFAULT.sounds,
    moods: prof.moods.slice(0, 5),
    tracks,
    degraded: true,
  };
}
