// routes/payments.js — Paddle ödeme entegrasyonu
const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const PADDLE_ENABLED = !!(
  process.env.PADDLE_API_KEY &&
  process.env.PADDLE_PRICE_MONTHLY &&
  process.env.PADDLE_PRICE_YEARLY
);

if (!PADDLE_ENABLED) {
  console.warn('⚠️  Paddle yapılandırılmamış — ödeme sistemi demo modunda.');
}

// ─── PLAN BİLGİLERİ ──────────────────────────────────────────────────────
router.get('/plans', (_req, res) => {
  res.json({
    paddleEnabled: PADDLE_ENABLED,
    clientToken: process.env.PADDLE_CLIENT_TOKEN || null,
    paddleEnv: process.env.PADDLE_ENV || 'production',
    plans: [
      {
        key: 'monthly',
        name: 'VIP Aylık',
        price: 9.99,
        currency: 'USD',
        interval: 'month',
        priceId: process.env.PADDLE_PRICE_MONTHLY || null,
        badge: '🔥 Popüler',
      },
      {
        key: 'yearly',
        name: 'VIP Yıllık',
        price: 79.99,
        pricePerMonth: 6.67,
        currency: 'USD',
        interval: 'year',
        priceId: process.env.PADDLE_PRICE_YEARLY || null,
        badge: '💎 %33 İndirim',
      },
    ],
  });
});

// ─── PADDLE WEBHOOK ───────────────────────────────────────────────────────
router.post('/webhook', express.json(), async (req, res) => {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;

  // GÜVENLİK: Secret yoksa (production'da tanımlanmamışsa) webhook'u reddet.
  // Bu sayede PADDLE_WEBHOOK_SECRET olmadan sahte webhook'larla VIP aktivasyonu engellenmiş olur.
  if (!secret) {
    console.warn('⚠️  PADDLE_WEBHOOK_SECRET tanımlı değil — webhook reddedildi.');
    return res.status(401).json({ error: 'Webhook secret yapılandırılmamış.' });
  }

  const crypto = require('crypto');
  const ts = req.headers['paddle-signature']?.match(/ts=(\d+)/)?.[1];
  const h1 = req.headers['paddle-signature']?.match(/h1=([a-f0-9]+)/)?.[1];

  if (!ts || !h1) {
    return res.status(401).json({ error: 'Paddle-Signature header eksik.' });
  }

  const payload  = `${ts}:${JSON.stringify(req.body)}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (expected !== h1) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  const type  = event?.event_type || event?.alert_name;
  console.log('Paddle webhook:', type);

  if (type === 'transaction.completed' || type === 'payment_succeeded') {
    const customData = event?.data?.custom_data || event?.passthrough;
    let userId = null;
    try {
      const parsed = typeof customData === 'string' ? JSON.parse(customData) : customData;
      userId = parsed?.userId;
    } catch (_) {}

    if (userId) {
      try {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run('vip', userId);
        const cid = event?.data?.customer_id || event?.user_id;
        if (cid) db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(String(cid), userId);
        console.log('✅ VIP aktivasyon: user', userId);
      } catch (err) { console.error('VIP aktivasyon hatası:', err); }
    }
  }

  if (type === 'subscription.canceled' || type === 'subscription_cancelled') {
    const cid = event?.data?.customer_id || event?.user_id;
    if (cid) {
      try {
        db.prepare('UPDATE users SET role = ? WHERE stripe_customer_id = ?').run('user', String(cid));
        console.log('⚠️ VIP iptal: customer', cid);
      } catch (err) { console.error('VIP iptal hatası:', err); }
    }
  }

  res.json({ received: true });
});

// ─── ÖDEME DOĞRULA ────────────────────────────────────────────────────────
router.post('/verify', authenticate, async (req, res) => {
  if (!PADDLE_ENABLED) return res.status(503).json({ error: 'Paddle aktif değil.' });

  const { transactionId } = req.body;
  if (!transactionId) return res.status(400).json({ error: 'transactionId gerekli.' });

  try {
    const response = await fetch(`https://api.paddle.com/transactions/${transactionId}`, {
      headers: { 'Authorization': `Bearer ${process.env.PADDLE_API_KEY}` },
    });
    if (!response.ok) return res.status(400).json({ error: 'Transaction doğrulanamadı.' });

    const data = await response.json();
    const status = data?.data?.status;

    if (status === 'completed' || status === 'paid') {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run('vip', req.user.id);
      const cid = data?.data?.customer_id;
      if (cid) db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(cid, req.user.id);
      return res.json({ success: true, message: 'VIP aktivasyonu başarılı!' });
    }

    res.status(400).json({ error: 'Ödeme tamamlanmamış.' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Doğrulama başarısız.' });
  }
});

// ─── DEMO VIP ────────────────────────────────────────────────────────────
router.post('/upgrade-demo', authenticate, (req, res) => {
  if (PADDLE_ENABLED) return res.status(400).json({ error: 'Paddle aktif, gerçek ödeme gerekli.' });
  try {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('vip', req.user.id);
    res.json({ message: 'Demo VIP aktivasyonu başarılı!' });
  } catch (err) {
    res.status(500).json({ error: 'Aktivasyon başarısız.' });
  }
});

module.exports = router;
