/* MoodBook — tiny i18n. The English copy in index.html is the source of truth and the dictionary key.
   Dictionaries live in js/lang/<code>.js and only the active one is downloaded.
   initI18n() picks the language (saved → browser → English), loads its dictionary and translates the
   static page once (text nodes, placeholders, aria-labels). Dynamic strings in app.js go through
   t('English text', vars). Switching language stores mb_lang and reloads. */

export const LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'uk', label: 'Українська', short: 'UA' },
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'de', label: 'Deutsch', short: 'DE' },
  { code: 'it', label: 'Italiano', short: 'IT' },
  { code: 'pt', label: 'Português', short: 'PT' },
  { code: 'pl', label: 'Polski', short: 'PL' },
  { code: 'zh', label: '中文', short: '中文' },
  { code: 'ja', label: '日本語', short: 'JA' },
];
const CODES = new Set(LANGS.map((l) => l.code));

let current = 'en';
let dict = {};
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function detectLang() {
  const saved = (() => { try { return localStorage.getItem('mb_lang'); } catch { return null; } })();
  if (saved && CODES.has(saved)) return saved;
  for (const l of (navigator.languages || [navigator.language || 'en'])) {
    const code = String(l).toLowerCase().slice(0, 2);
    if (CODES.has(code)) return code;
  }
  return 'en';
}
export const getLang = () => current;
export function setLang(code) {
  if (!CODES.has(code) || code === current) return;
  try { localStorage.setItem('mb_lang', code); } catch {}
  location.reload();
}

export function t(key, vars) {
  let s = dict[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const HTML_KEYS = { 'hero-title': 'hero_h1', 'how-title': 'how_h2', 'final-title': 'final_h2', 'pay-h2': 'pay_h2' };

/** Translate the static page once. Call before the motion layer mounts. */
export function applyI18n(root = document) {
  document.documentElement.lang = current;
  if (current === 'en') return;
  for (const [id, key] of Object.entries(HTML_KEYS)) { const n = root.getElementById(id); if (n && dict[key]) n.innerHTML = dict[key]; }
  const walker = document.createTreeWalker(root.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest('script,style,[data-i18n-skip],#suggest,#addSuggest,.marq,.tagcloud,.mini-tracks,.dc-tracks,.chip')) return NodeFilter.FILTER_REJECT;
      return norm(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const key = norm(n.nodeValue); const tr = dict[key];
    if (tr) n.nodeValue = n.nodeValue.replace(key, tr);
  }
  for (const attr of ['placeholder', 'aria-label', 'title']) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => { const v = norm(el.getAttribute(attr)); if (dict[v]) el.setAttribute(attr, dict[v]); });
  }
}

/** Detect, load the dictionary (same cache-busting query as app.js) and translate. */
export async function initI18n() {
  current = detectLang();
  if (current !== 'en') {
    try { dict = (await import(`./lang/${current}.js${new URL(import.meta.url).search}`)).default || {}; }
    catch (e) { console.warn('[i18n] dictionary failed to load, staying in English:', e.message); current = 'en'; dict = {}; }
  }
  applyI18n();
  return current;
}
