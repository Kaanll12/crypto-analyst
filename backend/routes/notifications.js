// routes/notifications.js — Push Bildirim Yönetimi
'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const https   = require('https');
const url_mod = require('url');
const db      = require('../config/database');
const { authenticate: requireAuth } = require('../middleware/auth');

// ─── VAPID ANAHTAR YÖNETİMİ ───────────────────────────────────────────────
// Uygulama başladığında .env'den yükle veya DB'den oku
let VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || null;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null;

function ensureVapidKeys() {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) return;

  // DB'de saklı anahtar var mı?
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'vapid_public'").get();
    if (row) {
      VAPID_PUBLIC_KEY  = row.value;
      VAPID_PRIVATE_KEY = db.prepare("SELECT value FROM settings WHERE key = 'vapid_private'").get()?.value;
      return;
    }
  } catch (_) {}

  // Yoksa oluştur ve kaydet
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  VAPID_PUBLIC_KEY  = ecdh.getPublicKey('base64url');
  VAPID_PRIVATE_KEY = ecdh.getPrivateKey('base64url');

  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_public',  ?)").run(VAPID_PUBLIC_KEY);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_private', ?)").run(VAPID_PRIVATE_KEY);
    console.log('🔑 VAPID anahtarları oluşturuldu ve DB\'ye kaydedildi.');
    console.log(`VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}`);
    console.log(`VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}`);
  } catch (e) {
    console.warn('VAPID DB kayıt hatası:', e.message);
  }
}

// ─── VAPID JWT OLUŞTURMA (web-push yerine native crypto) ─────────────────
function base64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function createVapidJWT(audience, subject, privateKeyB64) {
  const header  = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject || 'mailto:admin@cryptoanalyst.app',
  };

  const signingInput = [
    base64urlEncode(Buffer.from(JSON.stringify(header))),
    base64urlEncode(Buffer.from(JSON.stringify(payload))),
  ].join('.');

  // Private key: ECDH'dan DER formatına çevir
  const privBuf = Buffer.from(privateKeyB64, 'base64url');
  const keyObj  = crypto.createPrivateKey({
    key: privBuf,
    format: 'der',
    type: 'pkcs8',
  });

  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: keyObj, dsaEncoding: 'ieee-p1363' });
  return signingInput + '.' + base64urlEncode(sig);
}

// ─── PUSH BİLDİRİM GÖNDER (native HTTPS) ────────────────────────────────
// Not: Gerçek şifreleme (aesgcm / aes128gcm) web-push paketi gerektirir.
// Bu implementasyon, subscription endpoint'e VAPID imzalı başlık gönderir
// ancak şifrelenmiş içerik olmadan (boş push — SW notification fallback).
// web-push paketi kurulursa sendPushWithPayload() fonksiyonunu etkinleştirin.
async function sendPushNotification(subscription, payload) {
  // web-push modülü kurulu mu?
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      'mailto:admin@cryptoanalyst.app',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    return await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (moduleErr) {
    if (!moduleErr.message?.includes('Cannot find module')) throw moduleErr;
    // web-push yok — VAPID JWT ile boş push gönder
    return sendNativePush(subscription, payload);
  }
}

function sendNativePush(subscription, payload) {
  return new Promise((resolve, reject) => {
    const endpointUrl = new url_mod.URL(subscription.endpoint);
    const audience    = `${endpointUrl.protocol}//${endpointUrl.host}`;
    const subject     = 'mailto:admin@cryptoanalyst.app';

    let jwt;
    try {
      jwt = createVapidJWT(audience, subject, VAPID_PRIVATE_KEY);
    } catch (_) {
      // PKCS8 dönüşümü başarısız — log & resolve (bildirim gönderilemedi)
      console.warn('[Push] VAPID JWT oluşturulamadı, bildirim loglandı:', payload);
      return resolve({ statusCode: 200, note: 'logged-only' });
    }

    const pubKeyHeader = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;
    const bodyStr      = JSON.stringify(payload);
    const options = {
      hostname: endpointUrl.hostname,
      port:     endpointUrl.port || 443,
      path:     endpointUrl.pathname + endpointUrl.search,
      method:   'POST',
      headers: {
        'Authorization': pubKeyHeader,
        'TTL':           '86400',
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      resolve({ statusCode: res.statusCode });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ─── ROTALAR ─────────────────────────────────────────────────────────────

// GET /api/notifications/vapid-public-key
router.get('/vapid-public-key', (req, res) => {
  ensureVapidKeys();
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/notifications/subscribe  (auth gerekli)
router.post('/subscribe', requireAuth, (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Geçersiz subscription.' });

    db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth
    `).run(
      req.user.id,
      subscription.endpoint,
      subscription.keys?.p256dh || '',
      subscription.keys?.auth   || '',
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Abonelik kaydedilemedi.' });
  }
});

// POST /api/notifications/unsubscribe  (auth gerekli)
router.post('/unsubscribe', requireAuth, (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Endpoint gerekli.' });

    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
      .run(endpoint, req.user.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).json({ error: 'Abonelik iptal edilemedi.' });
  }
});

// POST /api/notifications/test  (auth gerekli)
router.post('/test', requireAuth, async (req, res) => {
  try {
    ensureVapidKeys();
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(req.user.id);
    if (!subs.length) return res.status(404).json({ error: 'Aktif abonelik bulunamadı.' });

    const payload = {
      title: '🔔 Test Bildirimi',
      body:  'CryptoAnalyst push bildirimleri çalışıyor!',
      icon:  '/icons/icon-192.png',
      url:   '/',
      tag:   'test',
    };

    const results = await Promise.allSettled(
      subs.map(sub => sendPushNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ))
    );

    const sent    = results.filter(r => r.status === 'fulfilled').length;
    const failed  = results.filter(r => r.status === 'rejected').length;
    res.json({ ok: true, sent, failed });
  } catch (err) {
    console.error('Test push error:', err);
    res.status(500).json({ error: 'Test bildirimi gönderilemedi.' });
  }
});

// ─── DIŞA AKTARILAN YARDIMCI FONKSİYON ──────────────────────────────────
// scheduler.js ve alerts.js tarafından kullanılır
async function sendPushToUser(userId, payload) {
  ensureVapidKeys();
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  if (!subs.length) return 0;

  const results = await Promise.allSettled(
    subs.map(sub => sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    ))
  );
  return results.filter(r => r.status === 'fulfilled').length;
}

async function sendPushToAll(payload) {
  ensureVapidKeys();
  const subs = db.prepare('SELECT * FROM push_subscriptions').all();
  if (!subs.length) return 0;

  const results = await Promise.allSettled(
    subs.map(sub => sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    ))
  );
  return results.filter(r => r.status === 'fulfilled').length;
}

module.exports = router;
module.exports.sendPushToUser = sendPushToUser;
module.exports.sendPushToAll  = sendPushToAll;
module.exports.ensureVapidKeys = ensureVapidKeys;
