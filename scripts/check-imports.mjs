// Imports every serverless module so syntax/runtime load errors show up before deploy.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
for (const dir of ['api', 'lib']) {
  for (const f of readdirSync(path.join(root, dir)).filter((x) => x.endsWith('.js'))) {
    const file = path.join(root, dir, f);
    try { await import(pathToFileURL(file).href); console.log('OK  ', dir + '/' + f); }
    catch (e) { bad++; console.log('FAIL', dir + '/' + f, '→', e.message.split('\n')[0]); if (e.stack) console.log(e.stack.split('\n').slice(0, 3).join('\n')); }
  }
}
process.exit(bad ? 1 : 0);
