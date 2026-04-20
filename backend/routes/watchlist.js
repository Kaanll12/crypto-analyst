// routes/watchlist.js — Favori coinler
'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const VALID_COINS = ['bitcoin','ethereum','solana','binancecoin','ripple',
                     'cardano','dogecoin','avalanche-2','polkadot'];

// ─── TÜM FAVORİLER ───────────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT coin_id FROM watchlist WHERE user_id = ? ORDER BY created_at ASC'
    ).all(req.user.id);
    res.json({ data: rows.map(r => r.coin_id) });
  } catch (err) {
    res.status(500).json({ error: 'Favoriler alınamadı.' });
  }
});

// ─── FAVORİ EKLE ─────────────────────────────────────────────────────────────
router.post('/:coinId',
  authenticate,
  [param('coinId').isString().notEmpty()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçersiz istek.' });

    const coinId = req.params.coinId.toLowerCase();
    if (!VALID_COINS.includes(coinId)) {
      return res.status(400).json({ error: 'Desteklenmeyen coin.' });
    }

    // Kullanıcı başına max 9 favori (tüm coinler)
    const count = db.prepare(
      'SELECT COUNT(*) as n FROM watchlist WHERE user_id = ?'
    ).get(req.user.id).n;
    if (count >= 9) {
      return res.status(400).json({ error: 'Tüm coinler zaten favorilerde.' });
    }

    try {
      db.prepare(
        'INSERT OR IGNORE INTO watchlist (user_id, coin_id) VALUES (?, ?)'
      ).run(req.user.id, coinId);
      res.json({ message: 'Favorilere eklendi.', coinId });
    } catch (err) {
      res.status(500).json({ error: 'Eklenemedi.' });
    }
  }
);

// ─── FAVORİ SİL ─────────────────────────────────────────────────────────────
router.delete('/:coinId',
  authenticate,
  [param('coinId').isString().notEmpty()],
  (req, res) => {
    const coinId = req.params.coinId.toLowerCase();
    try {
      db.prepare(
        'DELETE FROM watchlist WHERE user_id = ? AND coin_id = ?'
      ).run(req.user.id, coinId);
      res.json({ message: 'Favorilerden çıkarıldı.', coinId });
    } catch (err) {
      res.status(500).json({ error: 'Silinemedi.' });
    }
  }
);

module.exports = router;
