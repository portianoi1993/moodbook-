// GET /api/seats → {sold, left, total} for the Founding Reader plan.
// The counter is written by api/liqpay-webhook.js on every completed Founding Reader purchase.
// Public and cheap: cached for a few minutes at the edge so the landing page can show it freely.
import { cors, guard, cacheFor } from '../lib/http.js';
import { kvGet } from '../lib/store.js';

const TOTAL = 100;

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (await guard(req, res, { methods: ['GET'], max: 120 })) return;

  let sold = 0;
  try {
    const raw = await kvGet('mb:founding:count');
    sold = Math.max(0, Math.min(TOTAL, parseInt(raw, 10) || 0));
  } catch { /* store down → show the full 100, never block the page */ }

  cacheFor(res, 300);
  return res.status(200).json({ sold, left: Math.max(0, TOTAL - sold), total: TOTAL });
}
