// node scripts/check-i18n.mjs — every dictionary must have exactly the Ukrainian key set
// and keep the same {placeholders} as the English key. Exit 1 on any mismatch.
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.resolve('js/lang');
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
const dicts = {};
for (const f of files) dicts[f.replace('.js', '')] = (await import(pathToFileURL(path.join(dir, f)).href)).default;

const ref = new Set(Object.keys(dicts.uk));
// A translation may drop a placeholder (e.g. the English {word} singular/plural helper) but never invent one.
const ph = (s) => new Set(String(s).match(/\{[a-z]+\}/g) || []);
const phOk = (key, val) => [...ph(val)].every((p) => ph(key).has(p));
let bad = 0;
for (const [code, d] of Object.entries(dicts)) {
  const keys = new Set(Object.keys(d));
  const missing = [...ref].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !ref.has(k));
  const phBad = [...keys].filter((k) => ref.has(k) && !/^[a-z_0-9]+$/.test(k) && !phOk(k, d[k]));
  const empty = [...keys].filter((k) => !String(d[k]).trim());
  const ok = !missing.length && !extra.length && !phBad.length && !empty.length;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${code}: ${keys.size} keys` + (missing.length ? ` · missing ${missing.length}: ${missing.slice(0, 3).join(' | ')}` : '') + (extra.length ? ` · extra ${extra.length}: ${extra.slice(0, 3).join(' | ')}` : '') + (phBad.length ? ` · placeholder mismatch: ${phBad.slice(0, 3).join(' | ')}` : '') + (empty.length ? ` · empty: ${empty.slice(0, 3).join(' | ')}` : ''));
  if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
