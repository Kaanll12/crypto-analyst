// routes/prices.js — CoinGecko fiyatları için backend proxy
// Tüm client istekleri buradan geçer → Railway IP'si rate-limit'e takılmaz
'use strict';

const express = require('express');
const router  = express.Router();

const COINS = ['bitcoin','ethereum','solana','binancecoin','ripple','cardano'];

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
router.get('/', async (_req, res) => {
  try {
    const now = Date.now();

    // Cache geçerliyse direkt dön
    if (cache.data && (now - cache.ts) < CACHE_TTL) {
      return res.json({ data: cache.data, cached: true, age: Math.floor((now - cache.ts) / 1000) });
    }

    const data = await fetchFromCoinGecko();

    // Cache güncelle
    cache = { data, ts: Date.now() };

    // Normalize — frontend'in beklediği format
    const prices = {};
    data.forEach(c => {
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

    res.json({ data: prices, cached: false, age: 0 });

  } catch (err) {
    // Cache doluysa eski veriyi dön (grace period)
    if (cache.data) {
      console.warn('[prices] CoinGecko hata, eski cache kullanılıyor:', err.message);
      return res.json({
        data: (() => {
          const p = {};
          cache.data.forEach(c => { p[c.id] = c; });
          return p;
        })(),
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
router.get('/:coinId', async (req, res) => {
  const coinId = req.params.coinId.toLowerCase();
  if (!COINS.includes(coinId)) {
    return res.status(404).json({ error: 'Desteklenmeyen coin.' });
  }

  try {
    const now = Date.now();
    if (!cache.data || (now - cache.ts) >= CACHE_TTL) {
      const data = await fetchFromCoinGecko();
      cache = { data, ts: Date.now() };
    }
    const coin = cache.data.find(c => c.id === coinId);
    if (!coin) return res.status(404).json({ error: 'Coin bulunamadı.' });
    res.json({ data: coin });
  } catch (err) {
    res.status(503).json({ error: 'Fiyat alınamadı.' });
  }
});

module.exports = router;
