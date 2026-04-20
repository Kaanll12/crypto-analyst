// routes/prices.js — CoinGecko fiyatları için backend proxy
// Tüm client istekleri buradan geçer → Railway IP'si rate-limit'e takılmaz
'use strict';

const express = require('express');
const router  = express.Router();
const { pricesLimiter } = require('../middleware/security');

const COINS = ['bitcoin','ethereum','solana','binancecoin','ripple','cardano','dogecoin','avalanche-2','polkadot'];

// ─── IN-MEMORY CACHE (60 saniye) ─────────────────────────────────────────────
let cache = { data: null, ts: 0 };
const CACHE_TTL = 60 * 1000; // 60 sn

async function fetchFromCoinGecko() {
  const ids = COINS.join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&ids=${ids}&order=market_cap_desc` +
    `&sparkline=false&price_change_percentage=24h,7d`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (res.status === 429) throw Object.assign(new Error('rate_limit'), { status: 429 });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);

  return res.json();
}

// ─── GET /api/prices ─────────────────────────────────────────────────────────
router.get('/', pricesLimiter, async (_req, res) => {
  try {
    const now = Date.now();

    // Cache geçerliyse direkt dön (normalize edilmiş obje)
    if (cache.data && (now - cache.ts) < CACHE_TTL) {
      return res.json({ data: cache.data, cached: true, age: Math.floor((now - cache.ts) / 1000) });
    }


    const raw = await fetchFromCoinGecko();

    // Normalize — frontend'in beklediği format (id → obje)
    const prices = {};
    raw.forEach(c => {
      prices[c.id] = {
        id:                          c.id,
        symbol:                      c.symbol.toUpperCase(),
        name:                        c.name,
        current_price:               c.current_price,
        price_change_percentage_24h: c.price_change_percentage_24h,
        price_change_percentage_7d:  c.price_change_percentage_7d_in_currency,
        market_cap:                  c.market_cap,
        total_volume:                c.total_volume,
        high_24h:                    c.high_24h,
        low_24h:                     c.low_24h,
        ath:                         c.ath,
        image:                       c.image,
      };
    });

    // Cache'i normalize edilmiş obje olarak sakla
    cache = { data: prices, raw, ts: Date.now() };

    res.json({ data: prices, cached: false, age: 0 });

  } catch (err) {
    // Cache doluysa eski veriyi dön (grace period)
    if (cache.data) {
      console.warn('[prices] CoinGecko hata, eski cache kullanılıyor:', err.message);
      return res.json({
        data: cache.data,
        cached: true,
        stale: true,
        age: Math.floor((Date.now() - cache.ts) / 1000),
      });
    }

    const status = err.status === 429 ? 429 : 503;
    res.status(status).json({ error: 'Fiyat verileri alınamadı.', detail: err.message });
  }
});

// ─── GET /api/prices/:coinId ──────────────────────────────────────────────────
router.get('/:coinId', pricesLimiter, async (req, res) => {
  const coinId = req.params.coinId.toLowerCase();
  if (!COINS.includes(coinId)) {
    return res.status(404).json({ error: 'Desteklenmeyen coin.' });
  }

  try {
    const now = Date.now();
    if (!cache.data || (now - cache.ts) >= CACHE_TTL) {
      const raw = await fetchFromCoinGecko();
      const prices = {};
      raw.forEach(c => { prices[c.id] = c; });
      cache = { data: prices, raw, ts: Date.now() };
    }
    const coin = cache.data[coinId];
    if (!coin) return res.status(404).json({ error: 'Coin bulunamadı.' });
    res.json({ data: coin });
  } catch (err) {
    res.status(503).json({ error: 'Fiyat alınamadı.' });
  }
});

// ─── GET /api/prices/history/:coinId/:days ────────────────────────────────────
// CoinGecko market_chart proxy — 5 dakika cache
const historyCache = {};
const HISTORY_TTL  = 5 * 60 * 1000;

router.get('/history/:coinId/:days', pricesLimiter, async (req, res) => {
  const coinId = req.params.coinId.toLowerCase();
  const days   = parseInt(req.params.days) || 7;

  if (!COINS.includes(coinId)) {
    return res.status(404).json({ error: 'Desteklenmeyen coin.' });
  }
  if (![1, 7, 14, 30, 90].includes(days)) {
    return res.status(400).json({ error: 'Geçerli gün: 1, 7, 14, 30, 90.' });
  }

  const key = `${coinId}_${days}`;
  const now  = Date.now();
  const hit  = historyCache[key];
  if (hit && (now - hit.ts) < HISTORY_TTL) {
    return res.json({ data: hit.data, cached: true });
  }

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart` +
                `?vs_currency=usd&days=${days}&interval=${days <= 1 ? 'hourly' : days <= 30 ? 'daily' : 'weekly'}`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 429) {
      if (hit) return res.json({ data: hit.data, cached: true, stale: true });
      return res.status(429).json({ error: 'Rate limit. Kısa süre sonra tekrar deneyin.' });
    }
    if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);

    const raw = await r.json();
    // Sadece [timestamp, price] dizisini normalize et
    const prices = (raw.prices || []).map(([ts, price]) => ({
      t: ts,
      p: +price.toFixed(4),
    }));

    historyCache[key] = { data: prices, ts: Date.now() };
    res.json({ data: prices, cached: false });
  } catch (err) {
    if (hit) return res.json({ data: hit.data, cached: true, stale: true });
    res.status(503).json({ error: 'Geçmiş veri alınamadı.', detail: err.message });
  }
});

// ─── GET /api/prices/rates ────────────────────────────────────────────────────
// USD/TRY kuru — 1 saatlik cache
let ratesCache = { data: null, ts: 0 };
const RATES_TTL = 60 * 60 * 1000; // 1 saat

router.get('/rates', async (_req, res) => {
  const now = Date.now();
  if (ratesCache.data && (now - ratesCache.ts) < RATES_TTL) {
    return res.json({ data: ratesCache.data, cached: true });
  }
  try {
    // ExchangeRate-API ücretsiz tier
    const r = await fetch(
      'https://open.er-api.com/v6/latest/USD',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) throw new Error(`ExchangeRate-API HTTP ${r.status}`);
    const json = await r.json();
    const rates = { TRY: json.rates?.TRY || 38.5, EUR: json.rates?.EUR || 0.92 };
    ratesCache = { data: rates, ts: Date.now() };
    res.json({ data: rates, cached: false });
  } catch (err) {
    // Cache varsa stale dön
    if (ratesCache.data) return res.json({ data: ratesCache.data, cached: true, stale: true });
    res.json({ data: { TRY: 38.5, EUR: 0.92 }, cached: false, fallback: true });
  }
});

module.exports = router;
