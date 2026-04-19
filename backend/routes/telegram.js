// routes/telegram.js — Telegram Bot Entegrasyonu
// Kullanıcılar hesaplarını Telegram'a bağlayarak fiyat alertları alabilir.
'use strict';

const express = require('express');
const crypto  = require('crypto');
const db      = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'CryptoAnalystBot';

const ENABLED = !!BOT_TOKEN;
if (!ENABLED) {
  console.warn('⚠️  TELEGRAM_BOT_TOKEN tanımlı değil — Telegram entegrasyonu pasif.');
}

// ─── Telegram'a mesaj gönder ──────────────────────────────────────────────
async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
  if (!ENABLED) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (err) {
    console.error('[Telegram] Mesaj gönderilemedi:', err.message);
    return false;
  }
}
module.exports.sendTelegramMessage = sendTelegramMessage;

// ─── Bağlantı Kodu Oluştur (kullanıcı için) ──────────────────────────────
router.post('/generate-code', authenticate, (req, res) => {
  if (!ENABLED) return res.status(503).json({ error: 'Telegram entegrasyonu aktif değil.' });

  try {
    // 6 karakterli büyük harf kod üret
    const code    = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 char
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 dk

    db.prepare('UPDATE users SET telegram_code = ?, telegram_code_expires = ? WHERE id = ?')
      .run(code, expires, req.user.id);

    res.json({
      code,
      botUsername: BOT_USERNAME,
      deepLink: `https://t.me/${BOT_USERNAME}?start=${code}`,
      expiresIn: 15, // dakika
    });
  } catch (err) {
    console.error('[Telegram] Code generate hatası:', err);
    res.status(500).json({ error: 'Kod üretilemedi.' });
  }
});

// ─── Telegram Durumunu Getir ──────────────────────────────────────────────
router.get('/status', authenticate, (req, res) => {
  try {
    const user = db.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').get(req.user.id);
    res.json({
      enabled: ENABLED,
      connected: !!user?.telegram_chat_id,
      botUsername: ENABLED ? BOT_USERNAME : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Durum alınamadı.' });
  }
});

// ─── Telegram Bağlantısını Kes ───────────────────────────────────────────
router.delete('/disconnect', authenticate, (req, res) => {
  try {
    db.prepare('UPDATE users SET telegram_chat_id = NULL, telegram_code = NULL WHERE id = ?')
      .run(req.user.id);
    res.json({ message: 'Telegram bağlantısı kesildi.' });
  } catch (err) {
    res.status(500).json({ error: 'Bağlantı kesilemedi.' });
  }
});

// ─── Telegram Webhook (Bot'tan gelen mesajlar) ────────────────────────────
// Bu endpoint Telegram sunucularından gelen güncellemeleri alır.
// Telegram Dashboard'dan: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://crypto-analyst.app/api/telegram/webhook
router.post('/webhook', express.json(), async (req, res) => {
  if (!ENABLED) return res.json({ ok: true });

  // Güvenlik: opsiyonel secret token
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers['x-telegram-bot-api-secret-token'];
    if (header !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const update  = req.body;
    const message = update?.message;

    if (!message) return res.json({ ok: true });

    const chatId = message.chat?.id;
    const text   = (message.text || '').trim();
    const from   = message.from;

    if (!chatId) return res.json({ ok: true });

    // /start <KOD> komutu
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const code  = parts[1]?.trim().toUpperCase();

      if (!code) {
        await sendTelegramMessage(chatId,
          `👋 <b>CryptoAnalyst Bot'una Hoş Geldin!</b>\n\n` +
          `Hesabını bağlamak için:\n` +
          `1. crypto-analyst.app'e giriş yap\n` +
          `2. Profilindeki "Telegram Bağla" butonuna tıkla\n` +
          `3. Oluşturulan kodu buraya /start <KOD> formatında gönder`
        );
        return res.json({ ok: true });
      }

      // Kodu veritabanında bul
      const user = db.prepare(
        `SELECT id, username FROM users WHERE telegram_code = ? AND telegram_code_expires > datetime('now')`
      ).get(code);

      if (!user) {
        await sendTelegramMessage(chatId,
          `❌ <b>Geçersiz veya süresi dolmuş kod.</b>\n\n` +
          `Lütfen profilinden yeni bir kod oluştur.`
        );
        return res.json({ ok: true });
      }

      // Hesabı bağla
      db.prepare('UPDATE users SET telegram_chat_id = ?, telegram_code = NULL, telegram_code_expires = NULL WHERE id = ?')
        .run(String(chatId), user.id);

      await sendTelegramMessage(chatId,
        `✅ <b>Hesabın başarıyla bağlandı!</b>\n\n` +
        `Merhaba ${user.username}! 🎉\n\n` +
        `Artık fiyat alarmların ve önemli bildirimler Telegram üzerinden sana ulaşacak.\n\n` +
        `📊 <b>Kullanılabilir komutlar:</b>\n` +
        `/btc — Bitcoin fiyatı\n` +
        `/eth — Ethereum fiyatı\n` +
        `/fiyatlar — Tüm fiyatlar\n` +
        `/disconnect — Hesap bağlantısını kes`
      );

      return res.json({ ok: true });
    }

    // /btc komutu
    if (text === '/btc' || text === '/bitcoin') {
      const userRow = db.prepare('SELECT id FROM users WHERE telegram_chat_id = ?').get(String(chatId));
      if (!userRow) {
        await sendTelegramMessage(chatId, '❌ Hesabın bağlı değil. crypto-analyst.app üzerinden bağla.');
        return res.json({ ok: true });
      }
      // Fiyat bilgisini son analizden al
      const analysis = db.prepare(
        `SELECT price_usd, change_24h FROM analyses WHERE coin_id='bitcoin' ORDER BY created_at DESC LIMIT 1`
      ).get();
      if (analysis) {
        const ch = (analysis.change_24h || 0).toFixed(2);
        const emoji = ch >= 0 ? '📈' : '📉';
        await sendTelegramMessage(chatId,
          `₿ <b>Bitcoin (BTC)</b>\n\n` +
          `💵 Fiyat: <b>$${analysis.price_usd?.toLocaleString('en-US')}</b>\n` +
          `${emoji} 24s Değişim: <b>${ch >= 0 ? '+' : ''}${ch}%</b>`
        );
      } else {
        await sendTelegramMessage(chatId, '₿ BTC fiyatı şu an alınamıyor. Daha sonra dene.');
      }
      return res.json({ ok: true });
    }

    // /eth komutu
    if (text === '/eth' || text === '/ethereum') {
      const userRow = db.prepare('SELECT id FROM users WHERE telegram_chat_id = ?').get(String(chatId));
      if (!userRow) {
        await sendTelegramMessage(chatId, '❌ Hesabın bağlı değil. crypto-analyst.app üzerinden bağla.');
        return res.json({ ok: true });
      }
      const analysis = db.prepare(
        `SELECT price_usd, change_24h FROM analyses WHERE coin_id='ethereum' ORDER BY created_at DESC LIMIT 1`
      ).get();
      if (analysis) {
        const ch = (analysis.change_24h || 0).toFixed(2);
        const emoji = ch >= 0 ? '📈' : '📉';
        await sendTelegramMessage(chatId,
          `Ξ <b>Ethereum (ETH)</b>\n\n` +
          `💵 Fiyat: <b>$${analysis.price_usd?.toLocaleString('en-US')}</b>\n` +
          `${emoji} 24s Değişim: <b>${ch >= 0 ? '+' : ''}${ch}%</b>`
        );
      } else {
        await sendTelegramMessage(chatId, 'Ξ ETH fiyatı şu an alınamıyor. Daha sonra dene.');
      }
      return res.json({ ok: true });
    }

    // /fiyatlar komutu
    if (text === '/fiyatlar' || text === '/prices') {
      const userRow = db.prepare('SELECT id FROM users WHERE telegram_chat_id = ?').get(String(chatId));
      if (!userRow) {
        await sendTelegramMessage(chatId, '❌ Hesabın bağlı değil. crypto-analyst.app üzerinden bağla.');
        return res.json({ ok: true });
      }
      const analyses = db.prepare(
        `SELECT coin_sym, price_usd, change_24h FROM analyses
         WHERE id IN (SELECT MAX(id) FROM analyses GROUP BY coin_id)
         ORDER BY price_usd DESC`
      ).all();
      if (analyses.length) {
        const lines = analyses.map(a => {
          const ch = (a.change_24h || 0).toFixed(2);
          const e = ch >= 0 ? '🟢' : '🔴';
          return `${e} <b>${a.coin_sym}</b>: $${Number(a.price_usd).toLocaleString('en-US')} (${ch >= 0 ? '+' : ''}${ch}%)`;
        }).join('\n');
        await sendTelegramMessage(chatId, `📊 <b>Güncel Fiyatlar</b>\n\n${lines}`);
      } else {
        await sendTelegramMessage(chatId, '📊 Fiyat verisi şu an alınamıyor.');
      }
      return res.json({ ok: true });
    }

    // /disconnect komutu
    if (text === '/disconnect') {
      const userRow = db.prepare('SELECT id, username FROM users WHERE telegram_chat_id = ?').get(String(chatId));
      if (userRow) {
        db.prepare('UPDATE users SET telegram_chat_id = NULL WHERE id = ?').run(userRow.id);
        await sendTelegramMessage(chatId, `👋 ${userRow.username}, Telegram bağlantın kesildi. İstediğin zaman tekrar bağlanabilirsin.`);
      } else {
        await sendTelegramMessage(chatId, '❌ Zaten bağlı bir hesap yok.');
      }
      return res.json({ ok: true });
    }

    // Bilinmeyen komut
    if (text.startsWith('/')) {
      await sendTelegramMessage(chatId,
        `❓ <b>Bilinmeyen komut.</b>\n\n` +
        `📊 <b>Kullanılabilir komutlar:</b>\n` +
        `/btc — Bitcoin fiyatı\n` +
        `/eth — Ethereum fiyatı\n` +
        `/fiyatlar — Tüm fiyatlar\n` +
        `/disconnect — Hesap bağlantısını kes`
      );
    }

  } catch (err) {
    console.error('[Telegram webhook] Hata:', err);
  }

  res.json({ ok: true });
});

// ─── Webhook URL'yi Telegram'a Kaydet ────────────────────────────────────
// Bu endpoint'i çağırarak bot webhook'unu otomatik kur
router.post('/setup-webhook', authenticate, async (req, res) => {
  if (!ENABLED) return res.status(503).json({ error: 'Telegram bot token eksik.' });

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Sadece admin yapabilir.' });

  const appUrl = process.env.APP_URL || 'https://crypto-analyst.app';
  const webhookUrl = `${appUrl}/api/telegram/webhook`;

  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    const body = { url: webhookUrl, allowed_updates: ['message'] };
    if (secret) body.secret_token = secret;

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await tgRes.json();
    res.json({ ok: data.ok, description: data.description, webhookUrl });
  } catch (err) {
    res.status(500).json({ error: 'Webhook kurulamadı: ' + err.message });
  }
});

module.exports = router;
module.exports.sendTelegramMessage = sendTelegramMessage;
