// LiqPay server_url callback: LiqPay POSTs form fields `data` (base64 JSON) and `signature` for every status
// change of an order. We verify the signature, and on a paid status issue (or, for a renewal, extend) the
// reader's restore code — lib/license.js — plus keep the sales log and the Founding Reader seat count.
//
// Statuses that mean "paid": success, subscribed (subscription created and first charge done), sandbox (test
// keys), wait_accept (charged, funds held until the shop finishes verification). Anything else is logged only.
// Renewals of a subscription arrive with the same order_id, so subscriptionId = order_id keeps one code per reader.
import { verify, decode } from '../lib/liqpay.js';
import { kvGet, kvSet, kvIncr, kvEnabled, kvMemory } from '../lib/store.js';
import { issueLicense } from '../lib/license.js';

const PAID = new Set(['success', 'subscribed', 'sandbox', 'wait_accept']);
const hasStore = () => kvEnabled() || kvMemory(); // Upstash on Vercel, in-process map in local dev

function readRawBody(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  if (req.body && typeof req.body === 'object') return Promise.resolve(new URLSearchParams(req.body).toString());
  return new Promise((resolve, reject) => {
    let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => resolve(s)); req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const form = new URLSearchParams(await readRawBody(req));
  const data = form.get('data'), signature = form.get('signature');
  if (!verify(data, signature)) {
    console.warn('[liqpay-webhook] bad signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  let ev;
  try { ev = decode(data); } catch { return res.status(400).json({ error: 'Bad data' }); }

  const orderId = String(ev.order_id || '');
  const status = String(ev.status || '');
  console.log('[liqpay-webhook]', { orderId, status, action: ev.action, amount: ev.amount, currency: ev.currency, paymentId: ev.payment_id });
  if (!orderId.startsWith('mb_')) return res.status(200).json({ ok: true, ignored: 'foreign order' });

  // At-least-once delivery: one payment id + status is processed once.
  if (hasStore()) {
    const seenKey = `mb:liqpay:seen:${ev.payment_id || ev.transaction_id || 'x'}:${status}`;
    if (await kvGet(seenKey)) return res.status(200).json({ ok: true, deduped: true });
    await kvSet(seenKey, true, 30 * 24 * 3600);
  }

  if (!PAID.has(status)) return res.status(200).json({ ok: true, noted: status });

  const order = (await kvGet(`mb:order:${orderId}`)) || null;
  const plan = order?.plan || (orderId.match(/^mb_(monthly|annual|lifetime)_/) || [])[1] || 'annual';
  if (order && Number(ev.amount) + 0.01 < Number(order.amount)) {
    console.warn('[liqpay-webhook] amount below expected', { orderId, got: ev.amount, expected: order.amount });
    return res.status(200).json({ ok: true, ignored: 'amount' });
  }

  try {
    const lic = await issueLicense({ txId: orderId, subscriptionId: ev.action === 'subscribe' ? orderId : null, plan });
    console.log('[liqpay-webhook] restore code issued', { plan: lic.plan, until: lic.until });
  } catch (e) { console.error('[liqpay-webhook] license failed:', e.message); }

  if (hasStore()) {
    const list = (await kvGet('mb:sales')) || [];
    list.push({ at: new Date().toISOString(), provider: 'liqpay', orderId, plan, status, amount: ev.amount, currency: ev.currency, paymentId: ev.payment_id });
    await kvSet('mb:sales', list.slice(-500), 3 * 365 * 24 * 3600);
    if (plan === 'lifetime' && status !== 'sandbox') {
      const n = await kvIncr('mb:founding:count', 3 * 365 * 24 * 3600);
      console.log('[liqpay-webhook] Founding Reader seat', n, '/ 100');
    }
  }
  return res.status(200).json({ ok: true });
}
