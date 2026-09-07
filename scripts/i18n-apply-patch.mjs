// node scripts/i18n-apply-patch.mjs <patch.json>
// Applies a translation patch to every dictionary in js/lang: removes obsolete keys, appends new ones.
// Dictionaries are rewritten as one key per line (stable diffs). Run scripts/check-i18n.mjs afterwards.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const patchFile = process.argv[2];
if (!patchFile) { console.error('usage: node scripts/i18n-apply-patch.mjs <patch.json>'); process.exit(1); }
const patch = JSON.parse(readFileSync(patchFile, 'utf8'));
const langs = Object.keys(Object.values(patch.add)[0]);
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

for (const code of langs) {
  const file = path.resolve('js/lang', `${code}.js`);
  const dict = (await import(pathToFileURL(file).href + `?t=${Date.now()}`)).default;
  for (const k of patch.remove) delete dict[k];
  for (const [k, tr] of Object.entries(patch.add)) if (tr[code]) dict[k] = tr[code];
  const header = readFileSync(file, 'utf8').split('\n')[0];
  const body = Object.entries(dict).map(([k, v]) => `  ${/^[a-z_0-9]+$/.test(k) ? k : q(k)}: ${q(v)},`).join('\n');
  writeFileSync(file, `${header}\nexport default {\n${body}\n};\n`);
  console.log(code, 'keys', Object.keys(dict).length);
}
