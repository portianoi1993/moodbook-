// Provider-agnostic chat completion with an automatic fallback chain.
// Any OpenAI-compatible endpoint works: Google Gemini (free tier), Groq (free),
// OpenRouter (:free models), OmniRoute, OpenAI, …
//
// Env (primary):   AI_API_KEY | OPENAI_API_KEY, AI_BASE_URL, AI_MODEL
// Env (fallbacks): AI_FALLBACK_API_KEY, AI_FALLBACK_BASE_URL, AI_FALLBACK_MODEL
//                  AI_FALLBACK2_API_KEY, AI_FALLBACK2_BASE_URL, AI_FALLBACK2_MODEL
// Or one JSON list: AI_PROVIDERS='[{"name":"gemini","baseUrl":"…","model":"…","key":"…"}, …]'
import { fetchWithTimeout, str } from './http.js';

const PRESETS = {
  'generativelanguage.googleapis.com': { name: 'gemini', model: 'gemini-2.5-flash' },
  'api.groq.com': { name: 'groq', model: 'llama-3.3-70b-versatile' },
  'openrouter.ai': { name: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  'api.openai.com': { name: 'openai', model: 'gpt-4o-mini' },
};

function hostOf(url) { try { return new URL(url).host; } catch { return url; } }

export function getProviders(env = process.env) {
  const list = [];
  if (env.AI_PROVIDERS) {
    try { for (const p of JSON.parse(env.AI_PROVIDERS)) if (p?.key && p?.baseUrl) list.push(p); } catch (e) { console.error('[ai] AI_PROVIDERS is not valid JSON'); }
  }
  const add = (key, baseUrl, model) => {
    if (!key) return;
    const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const preset = PRESETS[hostOf(url)] || { name: hostOf(url), model: 'gpt-4o-mini' };
    list.push({ name: preset.name, baseUrl: url, model: model || preset.model, key });
  };
  add(env.AI_API_KEY || env.OPENAI_API_KEY, env.AI_BASE_URL, env.AI_MODEL);
  add(env.AI_FALLBACK_API_KEY, env.AI_FALLBACK_BASE_URL, env.AI_FALLBACK_MODEL);
  add(env.AI_FALLBACK2_API_KEY, env.AI_FALLBACK2_BASE_URL, env.AI_FALLBACK2_MODEL);
  return list;
}

async function callOnce(p, messages, { json, maxTokens, temperature, timeoutMs }) {
  const body = { model: p.model, messages, temperature, max_tokens: maxTokens };
  if (json) body.response_format = { type: 'json_object' };
  const r = await fetchWithTimeout(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
    body: JSON.stringify(body),
  }, timeoutMs);
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try { msg = JSON.parse(text)?.error?.message || text; } catch {}
    const err = new Error(`${p.name} ${r.status}: ${str(msg, 160)}`);
    err.status = r.status;
    err.jsonModeUnsupported = json && r.status === 400 && /response_format|json_object|json mode/i.test(msg);
    throw err;
  }
  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Try each provider in order. Returns { content, provider } or throws with
 * `errors` (one line per provider) when every provider failed.
 */
export async function chat(messages, { json = true, maxTokens = 1100, temperature = 0.6, timeoutMs = 25000 } = {}) {
  const providers = getProviders();
  if (!providers.length) {
    const e = new Error('No AI provider configured (set AI_API_KEY + AI_BASE_URL)');
    e.status = 500;
    throw e;
  }
  const errors = [];
  for (const p of providers) {
    try {
      const content = await callOnce(p, messages, { json, maxTokens, temperature, timeoutMs });
      return { content, provider: p.name, model: p.model };
    } catch (e) {
      if (e.jsonModeUnsupported) {
        try {
          const content = await callOnce(p, messages, { json: false, maxTokens, temperature, timeoutMs });
          return { content, provider: p.name, model: p.model };
        } catch (e2) { errors.push(e2.name === 'AbortError' ? `${p.name} timeout` : e2.message); continue; }
      }
      errors.push(e.name === 'AbortError' ? `${p.name} timeout` : e.message);
    }
  }
  const err = new Error(errors.join(' | '));
  err.status = 502;
  err.errors = errors;
  throw err;
}

/** Cheap connectivity probe per provider (used by /api/health). */
export async function probeAll() {
  const out = [];
  for (const p of getProviders()) {
    const t0 = Date.now();
    try {
      const content = await callOnce(p, [{ role: 'user', content: 'Reply with OK' }], { json: false, maxTokens: 5, temperature: 0, timeoutMs: 15000 });
      out.push({ provider: p.name, model: p.model, ok: true, ms: Date.now() - t0, reply: str(content, 40) });
    } catch (e) {
      out.push({ provider: p.name, model: p.model, ok: false, ms: Date.now() - t0, status: e.status || 0, error: e.name === 'AbortError' ? 'timeout' : str(e.message, 200) });
    }
  }
  return out;
}
