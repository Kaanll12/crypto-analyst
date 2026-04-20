// routes/alerts.js — Fiyat alarm sistemi
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, param, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { alertsLimiter } = require('../middleware/security');

const router = express.Router();

// ─── TÜM ALARMLAR ────────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM price_alerts WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user.id);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Alarmlar alınamadı.' });
  }
});

// ─── ALARM EKLE ───────────────────────────────────────────────────────────
router.post('/',
  alertsLimiter,
  authenticate,
  [
    body('coinId').isString().notEmpty(),
    body('coinSym').isString().isLength({ min: 2, max: 10 }),
    body('condition').isIn(['above', 'below']),
    body('targetPrice').isFloat({ min: 0 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // Kullanıcı başına max 10 aktif alarm
    const activeCount = db.prepare(
      'SELECT COUNT(*) as n FROM price_alerts WHERE user_id = ? AND is_active = 1'
    ).get(req.user.id).n;

    if (activeCount >= 10) {
      return res.status(429).json({ error: 'Maksimum 10 aktif alarm oluşturabilirsiniz.' });
    }

    const { coinId, coinSym, condition, targetPrice } = req.body;
    const id = uuidv4();

    try {
      db.prepare(`
        INSERT INTO price_alerts (id, user_id, coin_id, coin_sym, condition, target_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, req.user.id, coinId, coinSym.toUpperCase(), condition, targetPrice);

      res.status(201).json({
        message: 'Alarm oluşturuldu.',
        data: { id, coinId, coinSym, condition, targetPrice, is_active: 1 },
      });
    } catch (err) {
      res.status(500).json({ error: 'Alarm oluşturulamadı.' });
    }
  }
);

// ─── ALARM SİL ────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, [param('id').isUUID()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçersiz ID.' });

  const row = db.prepare('SELECT id FROM price_alerts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Alarm bulunamadı.' });

  db.prepare('DELETE FROM price_alerts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Alarm silindi.' });
});

// ─── ALARM KONTROL (scheduler tarafından her 5 dk çağrılır) ─────────────
async function checkAlerts() {
  const activeAlerts = db.prepare(`
    SELECT pa.*, u.username FROM price_alerts pa
    JOIN users u ON pa.user_id = u.id
    WHERE pa.is_active = 1
  `).all();

  if (!activeAlerts.length) return;

  // Fiyatları backend cache'den çek (rate-limit yok)
  const coinIds = [...new Set(activeAlerts.map(a => a.coin_id))].join(',');
  let prices = {};
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const data = await r.json();
      data.forEach(c => { prices[c.id] = c.current_price; });
    }
  } catch(_) { return; }

  // Push bildirim modülünü lazy-load et
  let sendPushToUser = null;
  try {
    const notifyMod = require('./notifications');
    sendPushToUser = notifyMod.sendPushToUser;
  } catch(_) {}

  // Telegram modülünü lazy-load et
  let sendTelegramMessage = null;
  try {
    const telegramMod = require('./telegram');
    sendTelegramMessage = telegramMod.sendTelegramMessage;
  } catch(_) {}

  // Her alarm için kontrol et
  for (const alert of activeAlerts) {
    const price = prices[alert.coin_id];
    if (!price) continue;

    const triggered =
      (alert.condition === 'above' && price >= alert.target_price) ||
      (alert.condition === 'below' && price <= alert.target_price);

    if (triggered) {
      // Alarmı kapat
      db.prepare(`UPDATE price_alerts SET is_active = 0, triggered_at = datetime('now') WHERE id = ?`).run(alert.id);

      const dirTR = alert.condition === 'above' ? 'üstüne çıktı' : 'altına düştü';
      const msg   = `${alert.coin_sym} $${price.toLocaleString('en-US',{maximumFractionDigits:2})} ile $${alert.target_price.toLocaleString('en-US',{maximumFractionDigits:2})} hedef fiyatın ${dirTR}!`;

      console.log(`🔔 Alarm tetiklendi — ${alert.username}: ${msg}`);

      // Push bildirimi gönder
      if (sendPushToUser) {
        try {
          await sendPushToUser(alert.user_id, {
            title: `⚡ ${alert.coin_sym} Fiyat Alarmı`,
            body:  msg,
            icon:  '/icons/icon-192.png',
            url:   '/',
            tag:   `alarm-${alert.id}`,
          });
        } catch(pushErr) {
          console.warn('Push bildirimi gönderilemedi:', pushErr.message);
        }
      }

      // Telegram bildirimi gönder
      if (sendTelegramMessage) {
        try {
          const userRow = db.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').get(alert.user_id);
          if (userRow?.telegram_chat_id) {
            const dirEmoji = alert.condition === 'above' ? '⬆️' : '⬇️';
            await sendTelegramMessage(userRow.telegram_chat_id,
              `🔔 <b>Fiyat Alarmı Tetiklendi!</b>\n\n` +
              `${dirEmoji} <b>${alert.coin_sym}</b>\n` +
              `Güncel Fiyat: <b>$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>\n` +
              `Hedef Fiyat: <b>$${alert.target_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>\n\n` +
              `<a href="https://crypto-analyst.app">📊 Analiz Yap →</a>`
            );
          }
        } catch(tgErr) {
          console.warn('Telegram bildirimi gönderilemedi:', tgErr.message);
        }
      }
    }
  }
}

router.checkAlerts = checkAlerts;
module.exports = router;
