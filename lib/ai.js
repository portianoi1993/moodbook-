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
  'generativelanguage.googleapis.com': { name: 'gemini', model: 'gemini-flash-latest' },
  'api.groq.com': { name: 'groq', model: 'llama-3.3-70b-versatile' },
  'openrouter.ai': { name: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  'api.openai.com': { name: 'openai', model: 'gpt-4o-mini' },
};

function hostOf(url) { try { return new URL(url).host; } catch { return url; } }

const migrated = new Map(); // baseUrl → model that replaced a retired one (per warm instance)

export function getProviders(env = process.env) {
  const list = [];
  if (env.AI_PROVIDERS) {
    try { for (const p of JSON.parse(env.AI_PROVIDERS)) if (p?.key && p?.baseUrl) list.push(p); } catch (e) { console.error('[ai] AI_PROVIDERS is not valid JSON'); }
  }
  const add = (key, baseUrl, model) => {
    if (!key) return;
    const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const preset = PRESETS[hostOf(url)] || { name: hostOf(url), model: 'gpt-4o-mini' };
    list.push({ name: preset.name, baseUrl: url, model: migrated.get(url) || model || preset.model, key });
  };
  add(env.AI_API_KEY || env.OPENAI_API_KEY, env.AI_BASE_URL, env.AI_MODEL);
  add(env.AI_FALLBACK_API_KEY, env.AI_FALLBACK_BASE_URL, env.AI_FALLBACK_MODEL);
  add(env.AI_FALLBACK2_API_KEY, env.AI_FALLBACK2_BASE_URL, env.AI_FALLBACK2_MODEL);
  return list;
}

async function callOnce(p, messages, { json, maxTokens, temperature, timeoutMs, drop = new Set() }) {
  const body = { model: p.model, messages, temperature, max_tokens: maxTokens };
  if (json && !drop.has('response_format')) body.response_format = { type: 'json_object' };
  // Thinking models (Gemini 3.x, o-series) spend the token budget on reasoning and return empty content
  // unless reasoning is kept low and the budget is generous.
  if (p.name === 'gemini' && !drop.has('reasoning_effort')) { body.reasoning_effort = 'low'; body.max_tokens = Math.max(maxTokens, 6000); }
  const r = await fetchWithTimeout(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
    body: JSON.stringify(body),
  }, timeoutMs);
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try { msg = JSON.parse(text)?.error?.message || text; } catch {}
    const err = new Error(`${p.name} ${r.status}: ${str(msg, 300)}`);
    err.status = r.status;
    // Provider retired the model and names its successor ("use models/gemini-x-y") → migrate automatically.
    const m = /use (?:models\/)?([a-z0-9][\w.-]*)/i.exec(msg);
    if ((r.status === 404 || r.status === 400) && /no longer available|deprecated|not found|retired/i.test(msg) && m) err.migrateTo = m[1];
    err.jsonModeUnsupported = json && r.status === 400 && /response_format|json_object|json mode/i.test(msg);
    err.unsupportedParam = r.status === 400 ? (/reasoning_effort/i.test(msg) ? 'reasoning_effort' : /response_format/i.test(msg) ? 'response_format' : null) : null;
    throw err;
  }
  const data = JSON.parse(text);
  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';
  if (!content) {
    const err = new Error(`${p.name}: empty content (finish_reason=${choice?.finish_reason || '?'}${data.usage ? `, completion_tokens=${data.usage.completion_tokens}` : ''})`);
    err.status = 502; err.empty = true; throw err;
  }
  return content;
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
      let content;
      try { content = await callOnce(p, messages, { json, maxTokens, temperature, timeoutMs }); }
      catch (e0) {
        // Transient overload (503) or burst limit (429): one short pause and a second attempt before moving on.
        if (e0.status !== 503 && e0.status !== 429) throw e0;
        console.warn(`[ai] ${p.name} ${e0.status}, retrying once in 1.5s`);
        await new Promise((r) => setTimeout(r, 1500));
        content = await callOnce(p, messages, { json, maxTokens, temperature, timeoutMs });
      }
      return { content, provider: p.name, model: p.model };
    } catch (e) {
      if (e.migrateTo && e.migrateTo !== p.model) {
        console.warn(`[ai] ${p.name}: model ${p.model} retired → retrying with ${e.migrateTo}`);
        p.model = e.migrateTo; migrated.set(p.baseUrl, e.migrateTo);
        try {
          const content = await callOnce(p, messages, { json, maxTokens, temperature, timeoutMs });
          return { content, provider: p.name, model: p.model };
        } catch (e2) { errors.push(e2.name === 'AbortError' ? `${p.name} timeout` : e2.message); continue; }
      }
      if (e.unsupportedParam || e.jsonModeUnsupported) {
        const drop = new Set([e.unsupportedParam || 'response_format']);
        try {
          const content = await callOnce(p, messages, { json, maxTokens, temperature, timeoutMs, drop });
          return { content, provider: p.name, model: p.model };
        } catch (e2) {
          if (e2.unsupportedParam && !drop.has(e2.unsupportedParam)) {
            drop.add(e2.unsupportedParam);
            try { const content = await callOnce(p, messages, { json, maxTokens, temperature, timeoutMs, drop }); return { content, provider: p.name, model: p.model }; } catch (e3) { errors.push(e3.message); continue; }
          }
          errors.push(e2.name === 'AbortError' ? `${p.name} timeout` : e2.message); continue;
        }
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
      const content = await callOnce(p, [{ role: 'user', content: 'Reply with OK' }], { json: false, maxTokens: 64, temperature: 0, timeoutMs: 15000 });
      out.push({ provider: p.name, model: p.model, ok: true, ms: Date.now() - t0, reply: str(content, 40) });
    } catch (e) {
      if (e.migrateTo) {
        try {
          const content = await callOnce({ ...p, model: e.migrateTo }, [{ role: 'user', content: 'Reply with OK' }], { json: false, maxTokens: 64, temperature: 0, timeoutMs: 15000 });
          migrated.set(p.baseUrl, e.migrateTo);
          out.push({ provider: p.name, model: e.migrateTo, ok: true, ms: Date.now() - t0, reply: str(content, 40), note: `auto-migrated from ${p.model}` });
          continue;
        } catch (e2) { e = e2; }
      }
      out.push({ provider: p.name, model: p.model, ok: false, ms: Date.now() - t0, status: e.status || 0, error: e.name === 'AbortError' ? 'timeout' : str(e.message, 300) });
    }
  }
  return out;
}
