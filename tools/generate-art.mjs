#!/usr/bin/env node
/**
 * MoodBook — Phase 4 art generation
 * Generates hand-drawn "storybook library" plates with OpenAI gpt-image-1,
 * saving PNGs into assets/art/ for the Three.js scene to use as textures/plates.
 *
 * USAGE (PowerShell):
 *   $env:OPENAI_API_KEY = "sk-...."      # your key — this script reads it from env
 *   node tools/generate-art.mjs          # generate all assets
 *   node tools/generate-art.mjs back window   # generate only named assets
 *
 * The key is read ONLY from the environment variable and is never printed.
 * Each image costs a small amount on your OpenAI account.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'assets', 'art');

const STYLE = 'cozy cinematic hand-drawn 2D storybook illustration, bold black ink outlines, ' +
  'organic imperfect linework, flat colors, subtle cel shading, muted warm earthy palette, ' +
  'vintage animated-film aesthetic, editorial illustration, graphic-novel influence, ' +
  'warm directional lighting, nostalgic cozy mood, tactile hand-drawn texture, no photorealism, no text';

// Each asset: what the 3D scene needs, framed as a flat illustration.
const ASSETS = [
  { name: 'wall-back',  size: '1536x1024',
    prompt: 'A tall wall of a cozy old library completely filled with bookshelves, seen straight-on, flat frontal view, rows of colorful book spines in muted earthy jewel tones, warm wooden shelves, a warm glowing window near the top. ' + STYLE },
  { name: 'wall-side',  size: '1024x1536',
    prompt: 'A tall single bookshelf against a wall of a cozy library, seen straight-on, flat frontal view, packed with colorful book spines in muted earthy tones, warm wood, soft shadows. ' + STYLE },
  { name: 'floor',      size: '1024x1024',
    prompt: 'Seamless warm wooden plank floor of a cozy old library with a soft patterned rug, top-down flat texture. ' + STYLE },
  { name: 'window',     size: '1024x1024',
    prompt: 'A cozy library window with warm golden late-afternoon light and soft clouds outside, wooden frame, flat frontal view, isolated on plain dark background. ' + STYLE },
  { name: 'book-cover', size: '1024x1024',
    prompt: 'A single closed hardcover book lying flat, seen from directly above, top-down, rich earthy cover with subtle ornament, no title text, isolated on plain background. ' + STYLE },
  { name: 'book-spread',size: '1536x1024',
    prompt: 'An open book seen from directly above, top-down, two blank cream pages with a center gutter and a ribbon bookmark, no text, isolated on plain background. ' + STYLE },
  { name: 'plant',      size: '1024x1536',
    prompt: 'A single potted leafy plant for a cozy reading nook, full plant, flat frontal view, isolated on plain white background, clean silhouette for cutout. ' + STYLE },
  { name: 'cat',        size: '1024x1024',
    prompt: 'A calm sleeping cat curled up, flat side view, isolated on plain white background, clean silhouette for cutout. ' + STYLE },
];

async function generate(a) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.error('Missing OPENAI_API_KEY environment variable.'); process.exit(1); }
  process.stdout.write(`• ${a.name} (${a.size}) … `);
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: a.prompt, size: a.size, n: 1 })
  });
  if (!r.ok) { console.error('FAILED', r.status, await r.text().catch(()=> '')); return; }
  const d = await r.json();
  const b64 = d.data?.[0]?.b64_json;
  if (!b64) { console.error('no image returned'); return; }
  await writeFile(join(OUT, a.name + '.png'), Buffer.from(b64, 'base64'));
  console.log('saved');
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const list = only.length ? ASSETS.filter(a => only.includes(a.name)) : ASSETS;
  if (!list.length) { console.error('No matching assets. Names:', ASSETS.map(a=>a.name).join(', ')); process.exit(1); }
  for (const a of list) { try { await generate(a); } catch (e) { console.error(a.name, 'error:', e.message); } }
  console.log('\nDone. Files in assets/art/');
})();
