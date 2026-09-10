// Paddle webhook: records completed sales, tracks the Founding Reader seat count and issues the buyer's
// restore code (lib/license.js). Pro is switched on client-side right after checkout (grantPro() in
// js/app.js); the restore code is what brings it back on another device and follows renewals.
//
// Setup: Paddle dashboard → Developer tools → Notifications → add a destination pointing here,
// subscribe to transaction.completed, and put its signing secret in Vercel as PADDLE_WEBHOOK_SECRET.
//
// Verification: https://developer.paddle.com/webhooks/signature-verification
//   header "paddle-signature": "ts=<unix>;h1=<hex>"
//   signed payload = `${ts}:${rawBody}`, HMAC-SHA256 with the endpoint's signing secret, hex digest.
import crypto from 'node:crypto';
import { kvGet, kvSet, kvIncr, kvEnabled } from '../lib/store.js';
import { issueLicense } from '../lib/license.js';

const FOUNDING_PRICE_ID = 'pri_01m20mn4r67t468bkfk7z09k6k';
const MAX_SKEW_SEC = 5 * 60; // generous vs Paddle's own 5s default — network/clock jitter shouldn't cause false rejects

function readRawBody(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

function verify(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(';').map((kv) => kv.split('=')));
  const ts = parts.ts, h1 = parts.h1;
  if (!ts || !h1) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_SEC) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'hex'), b = Buffer.from(h1, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.PADDLE_WEBHOOK_SECRET || '';
  const rawBody = await readRawBody(req);
  if (!verify(rawBody, req.headers['paddle-signature'], secret)) {
    console.warn('[paddle-webhook] bad signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return res.status(400).json({ error: 'Bad JSON' }); }

  // Deliveries are at-least-once — dedupe on the event id so a retry never double-counts.
  if (kvEnabled()) {
    const seenKey = `mb:paddle:seen:${event.event_id}`;
    if (await kvGet(seenKey)) return res.status(200).json({ ok: true, deduped: true });
    await kvSet(seenKey, true, 7 * 24 * 3600);
  }

  if (event.event_type === 'transaction.completed') {
    const items = event.data?.items || [];
    const priceId = items[0]?.price?.id || items[0]?.price_id || '';
    const total = event.data?.details?.totals?.total;
    const currency = event.data?.currency_code;
    console.log('[paddle-webhook] sale', { priceId, total, currency, txId: event.data?.id });

    if (kvEnabled()) {
      const rec = { at: new Date().toISOString(), priceId, total, currency, txId: event.data?.id, email: event.data?.customer_id };
      const list = (await kvGet('mb:paddle:sales')) || [];
      list.push(rec);
      await kvSet('mb:paddle:sales', list.slice(-500), 3 * 365 * 24 * 3600);

      // Issue the reader's restore code, or push its date forward when this is a renewal.
      try {
        const lic = await issueLicense({ txId: event.data?.id, subscriptionId: event.data?.subscription_id || null, priceId });
        console.log('[paddle-webhook] restore code issued', { plan: lic.plan, until: lic.until });
      } catch (e) { console.error('[paddle-webhook] license failed:', e.message); }

      if (priceId === FOUNDING_PRICE_ID) {
        const n = await kvIncr('mb:paddle:founding:count', 3 * 365 * 24 * 3600);
        console.log('[paddle-webhook] Founding Reader seat', n, '/ 100');
        // Paddle does not enforce the 100-seat cap on its own — once this count reaches 100,
        // archive the Founding Reader price in the Paddle dashboard to stop further sales.
      }
    }
  }

  return res.status(200).json({ ok: true });
}
