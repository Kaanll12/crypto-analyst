// routes/email.js — E-posta Yönetimi (Admin)
'use strict';

const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendWeeklyDigest, buildEmailHtml, sendEmail, collectWeeklyStats } = require('../automation/emailDigest');

// POST /api/email/digest/send — Haftalık özeti manuel tetikle (admin)
router.post('/digest/send', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await sendWeeklyDigest();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Manual digest error:', err);
    res.status(500).json({ error: 'Özet gönderilemedi: ' + err.message });
  }
});

// GET /api/email/digest/preview — HTML önizleme (admin)
router.get('/digest/preview', authenticate, requireAdmin, async (req, res) => {
  try {
    const stats  = collectWeeklyStats();
    const prices = {};
    try {
      const r = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple&vs_currencies=usd&include_24hr_change=true'
      );
      if (r.ok) Object.assign(prices, await r.json());
    } catch (_) {}

    const html = buildEmailHtml(req.user.username || 'Admin', stats, prices);
    res.type('html').send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/email/test — Tek kullanıcıya test e-postası (admin)
router.post('/test', authenticate, requireAdmin, async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'to alanı zorunlu.' });

    const stats  = collectWeeklyStats();
    const prices = {};
    try {
      const r = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'
      );
      if (r.ok) Object.assign(prices, await r.json());
    } catch (_) {}

    const html   = buildEmailHtml('Test Kullanıcısı', stats, prices);
    const result = await sendEmail(to, '🧪 [TEST] CryptoAnalyst Haftalık Özet', html);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
