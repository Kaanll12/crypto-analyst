// automation/scheduler.js
const cron = require('node-cron');
const { generateDailyReport } = require('./dailyReport');
let sendWeeklyDigest;
try { ({ sendWeeklyDigest } = require('./emailDigest')); } catch(e) { console.error('⚠️  emailDigest yüklenemedi:', e.message); }

// ─── FİYAT ALARMLARINI KONTROL ET ────────────────────────────────────────
// Her 5 dakikada bir çalışır, aktif alarmları CoinGecko'dan çekilen
// güncel fiyatlarla karşılaştırır; hedef aşılınca push bildirimi gönderir.
async function checkPriceAlerts() {
  let db, sendPushToUser;

  try {
    db = require('../config/database');
  } catch (e) {
    console.error('[PriceAlert] DB yüklenemedi:', e.message);
    return;
  }

  // sendPushToUser helper'ını dışa aktar
  try {
    ({ sendPushToUser } = require('../routes/notifications'));
  } catch (_) {
    sendPushToUser = null;
  }

  const activeAlerts = db.prepare(`
    SELECT * FROM price_alerts WHERE is_active = 1
  `).all();

  if (!activeAlerts.length) return;

  // Benzersiz coin ID'lerini topla
  const coinIds = [...new Set(activeAlerts.map(a => a.coin_id))].join(',');

  // CoinGecko'dan fiyatları çek (simple/price endpoint — daha hızlı)
  let prices = {};
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`
    );
    if (r.ok) {
      const data = await r.json();
      // { bitcoin: { usd: 95000 }, ethereum: { usd: 3500 }, ... }
      Object.entries(data).forEach(([id, vals]) => {
        prices[id] = vals.usd;
      });
    }
  } catch (e) {
    console.warn('[PriceAlert] CoinGecko isteği başarısız:', e.message);
    return;
  }

  // Her aktif alarm için kontrol et
  for (const alert of activeAlerts) {
    const currentPrice = prices[alert.coin_id];
    if (currentPrice == null) continue;

    const triggered =
      (alert.condition === 'above' && currentPrice >= alert.target_price) ||
      (alert.condition === 'below' && currentPrice <= alert.target_price);

    if (!triggered) continue;

    // Alarmı tetiklenmiş olarak güncelle
    try {
      db.prepare(`
        UPDATE price_alerts
        SET is_active = 0, triggered_at = datetime('now')
        WHERE id = ?
      `).run(alert.id);
    } catch (e) {
      console.error('[PriceAlert] Alarm güncellenemedi:', e.message);
    }

    const condLabel = alert.condition === 'above' ? 'üzerine çıktı' : 'altına düştü';
    const fmtPrice  = currentPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const tgtPrice  = Number(alert.target_price).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    console.log(`🔔 [${new Date().toLocaleString('tr-TR')}] Alarm tetiklendi: ${alert.coin_sym} ${condLabel} ${tgtPrice} (şu an: ${fmtPrice})`);

    // Push bildirimi gönder (mümkünse)
    if (sendPushToUser) {
      try {
        await sendPushToUser(alert.user_id, {
          title: `🔔 ${alert.coin_sym} Alarmı Tetiklendi!`,
          body:  `${alert.coin_sym} ${tgtPrice} hedefinin ${condLabel}. Güncel: ${fmtPrice}`,
          icon:  '/icons/icon-192.png',
          url:   '/portfolio.html',
          tag:   `alert-${alert.id}`,
        });
      } catch (pushErr) {
        console.warn('[PriceAlert] Push gönderilemedi:', pushErr.message);
      }
    }
  }
}

function startScheduler() {
  const cronExpression = process.env.DAILY_REPORT_CRON || '0 9 * * *';

  console.log(`⏰ Zamanlayıcı başlatıldı | Günlük rapor: her gün saat 09:00`);

  // ─── ANLИК BAŞLATMA: Bugünkü rapor yoksa hemen oluştur ───────────────────
  setTimeout(async () => {
    try {
      const db = require('../config/database');
      const today = new Date().toISOString().split('T')[0];
      const existing = db.prepare(
        `SELECT id FROM daily_reports WHERE report_date = ?`
      ).get(today);
      if (!existing) {
        console.log(`\n📊 [${new Date().toLocaleString('tr-TR')}] Bugünkü rapor bulunamadı, anlık oluşturuluyor...`);
        await generateDailyReport();
      } else {
        console.log(`✅ Bugünkü rapor zaten mevcut (${today}), atlandı.`);
      }
    } catch (err) {
      console.error('Anlık rapor oluşturma hatası:', err.message);
    }
  }, 5000); // Sunucu tam ayağa kalksın diye 5 sn bekle

  // ─── GÜNLÜK RAPOR (Her gün saat 09:00) ───────────────────────────────
  cron.schedule(cronExpression, async () => {
    console.log(`\n🚀 [${new Date().toLocaleString('tr-TR')}] Günlük otomasyon başladı`);
    await generateDailyReport();
  }, {
    timezone: 'Europe/Istanbul',
  });

  // ─── HAFTALIK E-POSTA ÖZETİ (Her Pazartesi 08:00) ────────────────────
  if (sendWeeklyDigest) {
    cron.schedule(process.env.WEEKLY_DIGEST_CRON || '0 8 * * 1', async () => {
      console.log(`\n📧 [${new Date().toLocaleString('tr-TR')}] Haftalık e-posta özeti başlatıldı`);
      try {
        await sendWeeklyDigest();
      } catch (err) {
        console.error('Haftalık özet hatası:', err.message);
      }
    }, { timezone: 'Europe/Istanbul' });
  }

  // ─── FİYAT ALARM KONTROLÜ (Her 5 dakika) ────────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkPriceAlerts();
    } catch (err) {
      console.error('[PriceAlert] Cron hatası:', err.message);
    }
  }, { timezone: 'Europe/Istanbul' });

  // ─── HAFTALIK TEMİZLİK (Her Pazar 02:00) ─────────────────────────────
  cron.schedule('0 2 * * 0', () => {
    const db = require('../config/database');
    // 90 günden eski API loglarını temizle
    const deleted = db.prepare(`
      DELETE FROM api_logs WHERE created_at < datetime('now', '-90 days')
    `).run();
    console.log(`🧹 Haftalık temizlik: ${deleted.changes} eski log silindi`);
  }, { timezone: 'Europe/Istanbul' });

  console.log('✅ Tüm zamanlayıcılar aktif (günlük rapor + haftalık özet + fiyat alarmı + temizlik)\n');
}

module.exports = { startScheduler };
