// node scripts/check-untranslated.mjs — lists visible English text in index.html that has no key in js/lang/uk.js.
// Book titles, sample track names and prices are expected to stay untranslated and are skipped.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const uk = (await import(pathToFileURL(path.resolve('js/lang/uk.js')).href)).default;
const html = readFileSync('index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const texts = [...html.matchAll(/>([^<>]{4,})</g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
// The first group are pieces of headings translated via HTML keys (hero_h1, how_h2, final_h2, pay_h2) or filled by JS.
const skip = /^(MoodBook — Every book has a sound|Every book has|a sound\.|From title to|soundtrack|in one breath\.|about \$5 a month|Pick up your book\.|We'll set the mood\.|Keep the music going with|or \$9\.99\/month|Plan &amp; usage|Dune|Frank Herbert|Arrakeen Sunrise|The Spice Must Flow|Sietch Tabr Nights|Fourth Wing|Project Hail Mary|The Song of Achilles|Atomic Habits|Intermezzo|The Hobbit|It Ends with Us|Дюна|1984|The Women|Circe|MoodBook|Pro|Free|EN|\+3|0[123]|vast · warm · 1 hr|hypnotic · pulsing · 1 hr|calm · intimate · 1 hr|\$[\d.,]+|₴[\d ]+|Desert Dawn Drift|Spice Vision Trance|Sietch Night Calm|Sandworm Surge|Court Intrigue|Deep Focus Lofi)$/;
const seen = new Set();
const missing = texts.filter((s) => /[A-Za-z]{3}/.test(s) && !skip.test(s) && !uk[s] && !seen.has(s) && seen.add(s));
if (missing.length) { console.log('Untranslated (' + missing.length + '):'); missing.forEach((s) => console.log('  - ' + s)); process.exit(1); }
console.log('OK   every visible string in index.html has a translation key');
