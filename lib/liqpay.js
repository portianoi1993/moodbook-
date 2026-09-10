// LiqPay (PrivatBank) — cards, Apple Pay, Google Pay, Privat24; subscriptions for Pro, one-time for Founding Reader.
// Hosted checkout: the browser POSTs {data, signature} to https://www.liqpay.ua/api/3/checkout; LiqPay then
// calls our server_url (api/liqpay-webhook.js) with the same {data, signature} shape for every status change.
//   data      = base64(JSON params)
//   signature = base64(sha1(private_key + data + private_key))
// Env (Vercel): LIQPAY_PUBLIC_KEY, LIQPAY_PRIVATE_KEY. Keys that start with "sandbox_" make every payment a test.
// Optional LIQPAY_CURRENCY_MODE=uah → everyone pays the hryvnia prices (use if USD is not enabled for the shop).
import crypto from 'node:crypto';
import { fetchWithTimeout } from './http.js';

const PUB = process.env.LIQPAY_PUBLIC_KEY || '';
const PRIV = process.env.LIQPAY_PRIVATE_KEY || '';
export const CHECKOUT_URL = 'https://www.liqpay.ua/api/3/checkout';
const API_URL = 'https://www.liqpay.ua/api/request';

export const liqpayEnabled = () => !!(PUB && PRIV);
export const isSandbox = () => PUB.startsWith('sandbox_');

// Owner-approved prices (docs/PRICING.md). UAH for Ukraine, USD elsewhere.
export const PLANS = {
  monthly: { action: 'subscribe', periodicity: 'month', UAH: 249, USD: 9.99, name: 'MoodBook Pro, monthly' },
  annual: { action: 'subscribe', periodicity: 'year', UAH: 1490, USD: 59.99, name: 'MoodBook Pro, yearly' },
  lifetime: { action: 'pay', UAH: 1990, USD: 79, name: 'MoodBook Founding Reader, lifetime' },
};
export const isPlan = (p) => Object.prototype.hasOwnProperty.call(PLANS, p);

export function currencyFor(country) {
  if (process.env.LIQPAY_CURRENCY_MODE === 'uah') return 'UAH';
  return String(country || '').toUpperCase() === 'UA' ? 'UAH' : 'USD';
}

export function sign(data) {
  return crypto.createHash('sha1').update(PRIV + data + PRIV).digest('base64');
}
export function encode(params) {
  return Buffer.from(JSON.stringify({ version: 3, public_key: PUB, ...params })).toString('base64');
}
export function decode(data) {
  return JSON.parse(Buffer.from(String(data), 'base64').toString('utf8'));
}
export function verify(data, signature) {
  if (!data || !signature || !PRIV) return false;
  const a = Buffer.from(sign(String(data))), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** "YYYY-MM-DD HH:MM:SS" in UTC — the format LiqPay wants for subscribe_date_start. */
export function liqpayDate(d = new Date()) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Everything the hosted checkout needs for one order. */
export function checkoutParams({ plan, currency, orderId, lang, origin }) {
  const p = PLANS[plan];
  const params = {
    action: p.action,
    amount: p[currency],
    currency,
    description: `${p.name} · moodbook.ink`,
    order_id: orderId,
    language: lang === 'uk' ? 'uk' : 'en',
    paytypes: 'apay,gpay,card,privat24',
    result_url: `${origin}/?paid=${encodeURIComponent(orderId)}`,
    server_url: `${origin}/api/liqpay-webhook`,
  };
  if (p.action === 'subscribe') {
    params.subscribe_date_start = liqpayDate(); // charge now, then every period
    params.subscribe_periodicity = p.periodicity;
  }
  if (isSandbox()) params.sandbox = 1;
  const data = encode(params);
  return { url: CHECKOUT_URL, data, signature: sign(data), params };
}

/** Server-to-server call (status, unsubscribe, …). */
export async function apiRequest(params) {
  const data = encode(params);
  const body = new URLSearchParams({ data, signature: sign(data) });
  const r = await fetchWithTimeout(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 15000);
  return r.json();
}
