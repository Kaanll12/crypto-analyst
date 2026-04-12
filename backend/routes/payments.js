// routes/payments.js — Stripe ödeme entegrasyonu
const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Stripe sadece STRIPE_SECRET_KEY varsa yüklenir
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('⚠️  STRIPE_SECRET_KEY bulunamadı — ödeme sistemi devre dışı.');
}

// ─── VIP PLAN FİYATLARI ───────────────────────────────────────────────────
const PLANS = {
  monthly: {
    name: 'VIP Aylık',
    price: 9.99,
    currency: 'usd',
    interval: 'month',
    // Stripe Dashboard'dan oluşturduğun Price ID buraya gelecek
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY || null,
    analyses: 'Sınırsız',
    badge: '🔥 Popüler',
  },
  yearly: {
    name: 'VIP Yıllık',
    price: 79.99,
    currency: 'usd',
    interval: 'year',
    stripePriceId: process.env.STRIPE_PRICE_YEARLY || null,
    analyses: 'Sınırsız',
    badge: '💎 En İyi Değer',
  },
};

// ─── PLAN BİLGİLERİ (public) ─────────────────────────────────────────────
router.get('/plans', (_req, res) => {
  res.json({
    plans: Object.entries(PLANS).map(([key, p]) => ({
      key,
      name: p.name,
      price: p.price,
      currency: p.currency,
      interval: p.interval,
      analyses: p.analyses,
      badge: p.badge,
      stripeEnabled: !!stripe && !!p.stripePriceId,
    })),
    stripeEnabled: !!stripe,
  });
});

// ─── STRIPE CHECKOUT SESSION OLUŞTUR ─────────────────────────────────────
router.post('/create-checkout', authenticate, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: 'Ödeme sistemi henüz aktif değil.',
      code: 'STRIPE_NOT_CONFIGURED',
    });
  }

  const { planKey } = req.body;
  const plan = PLANS[planKey];
  if (!plan) return res.status(400).json({ error: 'Geçersiz plan.' });
  if (!plan.stripePriceId) return res.status(503).json({ error: 'Bu plan henüz yapılandırılmamış.' });

  try {
    const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get(req.user.id);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      customer_email: user.email,
      metadata: { userId: req.user.id, planKey },
      success_url: `${process.env.FRONTEND_URL || process.env.ALLOWED_ORIGIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.FRONTEND_URL || process.env.ALLOWED_ORIGIN}/payment-cancel`,
      locale: 'auto',
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Ödeme oturumu oluşturulamadı.' });
  }
});

// ─── STRIPE WEBHOOK (ödeme başarılı → VIP yap) ───────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET eksik!');
    return res.status(500).send('Webhook secret missing');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook imza hatası:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Ödeme tamamlandı → kullanıcıyı VIP yap
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;

    if (userId) {
      try {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run('vip', userId);

        // Stripe müşteri ID'sini kaydet (iptal için lazım)
        db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?')
          .run(session.customer, userId);

        console.log(`✅ VIP aktivasyon: user ${userId}`);
      } catch (err) {
        console.error('VIP aktivasyon hatası:', err);
      }
    }
  }

  // Abonelik iptal → normal kullanıcıya düşür
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    try {
      db.prepare('UPDATE users SET role = ? WHERE stripe_customer_id = ?')
        .run('user', subscription.customer);
      console.log(`⚠️ VIP iptal: customer ${subscription.customer}`);
    } catch (err) {
      console.error('VIP iptal hatası:', err);
    }
  }

  res.json({ received: true });
});

// ─── MANUEL VIP (Stripe yokken demo için) ────────────────────────────────
router.post('/upgrade-demo', authenticate, (req, res) => {
  if (stripe) {
    return res.status(400).json({ error: 'Stripe aktif, gerçek ödeme gerekli.' });
  }
  try {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('vip', req.user.id);
    res.json({ message: 'Demo VIP aktivasyonu başarılı!' });
  } catch (err) {
    res.status(500).json({ error: 'Aktivasyon başarısız.' });
  }
});

module.exports = router;
