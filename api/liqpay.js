// LiqPay checkout for the paid plans.
//
//   POST /api/liqpay  body {plan:'monthly'|'annual'|'lifetime', lang}
//        → {url, data, signature, orderId}: the browser posts data+signature to `url` (hosted LiqPay page).
//        Currency: UAH for visitors from Ukraine (x-vercel-ip-country), USD elsewhere (lib/liqpay.js).
//   GET  /api/liqpay?admin=TOKEN&status=ORDER_ID       → ask LiqPay about an order (owner only)
//   GET  /api/liqpay?admin=TOKEN&unsubscribe=ORDER_ID  → cancel a subscription (owner only; the reader keeps
//        Pro until the `until` date on their restore code)
//
// The order is remembered at mb:order:<id> so the webhook can check plan and amount when LiqPay calls back.
import { cors, guard, noCache, str } from '../lib/http.js';
import { kvSet } from '../lib/store.js';
import { liqpayEnabled, isPlan, currencyFor, checkoutParams, apiRequest, PLANS } from '../lib/liqpay.js';

function mintOrderId(plan) {
  const bytes = new Uint8Array(6); crypto.getRandomValues(bytes);
  const rnd = [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  return `mb_${plan}_${Date.now().toString(36)}${rnd}`;
}
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(typeof req.body === 'string' ? req.body : await new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); })); } catch { return {}; }
}

export default async function handler(req, res) {
  if (cors(req, res, 'GET, POST, OPTIONS')) return;
  if (await guard(req, res, { methods: ['GET', 'POST'], max: 40 })) return;
  noCache(res);
  if (!liqpayEnabled()) return res.status(503).json({ error: 'unconfigured', message: 'Payments are not open yet.' });

  if (req.method === 'GET') {
    const q = req.query || {};
    const token = process.env.ADMIN_TOKEN || '';
    if (!token || String(q.admin || '') !== token) return res.status(403).json({ error: 'Forbidden' });
    const orderId = str(q.status || q.unsubscribe, 120);
    if (!orderId) return res.status(400).json({ error: 'Use status=ORDER_ID or unsubscribe=ORDER_ID' });
    try {
      const out = await apiRequest({ action: q.unsubscribe ? 'unsubscribe' : 'status', order_id: orderId });
      return res.status(200).json({ ok: true, liqpay: out });
    } catch (e) { return res.status(502).json({ error: 'liqpay', message: e.message }); }
  }

  const body = await readJson(req);
  const plan = str(body.plan, 20);
  if (!isPlan(plan)) return res.status(400).json({ error: 'invalid', message: 'Unknown plan.' });
  const lang = /^[a-z]{2}$/.test(String(body.lang || '')) ? body.lang : 'en';
  const currency = currencyFor(req.headers['x-vercel-ip-country']);
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${req.headers.host}`;
  const orderId = mintOrderId(plan);

  const co = checkoutParams({ plan, currency, orderId, lang, origin });
  await kvSet(`mb:order:${orderId}`, { plan, currency, amount: PLANS[plan][currency], createdAt: new Date().toISOString() }, 3 * 24 * 3600);
  return res.status(200).json({ ok: true, url: co.url, data: co.data, signature: co.signature, orderId, currency, amount: PLANS[plan][currency] });
}
