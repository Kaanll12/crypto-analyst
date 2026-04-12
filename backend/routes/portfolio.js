// routes/portfolio.js — Portföy takip sistemi
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, param, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const VALID_COINS = {
  bitcoin:     { sym: 'BTC', name: 'Bitcoin'  },
  ethereum:    { sym: 'ETH', name: 'Ethereum' },
  solana:      { sym: 'SOL', name: 'Solana'   },
  binancecoin: { sym: 'BNB', name: 'BNB'      },
  ripple:      { sym: 'XRP', name: 'XRP'      },
  cardano:     { sym: 'ADA', name: 'Cardano'  },
};

// ─── TÜM PORTFÖY ─────────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM portfolio WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user.id);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Portföy alınamadı.' });
  }
});

// ─── PORTFÖY ÖZETİ (toplam değer, kar/zarar) ─────────────────────────────
router.get('/summary', authenticate, async (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM portfolio WHERE user_id = ?`).all(req.user.id);
    if (!rows.length) return res.json({ totalInvested: 0, totalValue: 0, pnl: 0, pnlPct: 0, coins: [] });

    // CoinGecko'dan güncel fiyatları çek
    const coinIds = [...new Set(rows.map(r => r.coin_id))].join(',');
    let prices = {};
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds}&order=market_cap_desc`
      );
      if (r.ok) {
        const data = await r.json();
        data.forEach(c => { prices[c.id] = c; });
      }
    } catch(_) {}

    // Coin bazında hesapla
    const coinMap = {};
    rows.forEach(row => {
      if (!coinMap[row.coin_id]) {
        coinMap[row.coin_id] = {
          coinId: row.coin_id, coinSym: row.coin_sym, coinName: row.coin_name,
          totalAmount: 0, totalInvested: 0,
          currentPrice: prices[row.coin_id]?.current_price || 0,
          change24h: prices[row.coin_id]?.price_change_percentage_24h || 0,
          entries: [],
        };
      }
      coinMap[row.coin_id].totalAmount    += row.amount;
      coinMap[row.coin_id].totalInvested  += row.amount * row.buy_price;
      coinMap[row.coin_id].entries.push(row);
    });

    const coins = Object.values(coinMap).map(c => ({
      ...c,
      currentValue: c.totalAmount * c.currentPrice,
      pnl:    (c.totalAmount * c.currentPrice) - c.totalInvested,
      pnlPct: c.totalInvested > 0
        ? (((c.totalAmount * c.currentPrice) - c.totalInvested) / c.totalInvested) * 100
        : 0,
      avgBuyPrice: c.totalInvested / c.totalAmount,
    }));

    const totalInvested = coins.reduce((s, c) => s + c.totalInvested, 0);
    const totalValue    = coins.reduce((s, c) => s + c.currentValue, 0);
    const pnl           = totalValue - totalInvested;
    const pnlPct        = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

    res.json({ totalInvested, totalValue, pnl, pnlPct, coins });
  } catch (err) {
    console.error('Portfolio summary error:', err);
    res.status(500).json({ error: 'Portföy özeti hesaplanamadı.' });
  }
});

// ─── POZİSYON EKLE ────────────────────────────────────────────────────────
router.post('/',
  authenticate,
  [
    body('coinId').isIn(Object.keys(VALID_COINS)),
    body('amount').isFloat({ min: 0.000001 }),
    body('buyPrice').isFloat({ min: 0 }),
    body('buyDate').isISO8601(),
    body('notes').optional().isString().isLength({ max: 500 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { coinId, amount, buyPrice, buyDate, notes } = req.body;
    const coin = VALID_COINS[coinId];
    const id   = uuidv4();

    try {
      db.prepare(`
        INSERT INTO portfolio (id, user_id, coin_id, coin_sym, coin_name, amount, buy_price, buy_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.user.id, coinId, coin.sym, coin.name, amount, buyPrice, buyDate, notes || null);

      res.status(201).json({
        message: 'Pozisyon eklendi.',
        data: { id, coinId, coinSym: coin.sym, coinName: coin.name, amount, buyPrice, buyDate },
      });
    } catch (err) {
      res.status(500).json({ error: 'Pozisyon eklenemedi.' });
    }
  }
);

// ─── POZİSYON SİL ────────────────────────────────────────────────────────
router.delete('/:id', authenticate, [param('id').isUUID()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçersiz ID.' });

  const row = db.prepare('SELECT id FROM portfolio WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Pozisyon bulunamadı.' });

  db.prepare('DELETE FROM portfolio WHERE id = ?').run(req.params.id);
  res.json({ message: 'Pozisyon silindi.' });
});

module.exports = router;
