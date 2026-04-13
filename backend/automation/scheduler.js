// automation/scheduler.js
const cron = require('node-cron');
const { generateDailyReport } = require('./dailyReport');
let sendWeeklyDigest;
try { ({ sendWeeklyDigest } = require('./emailDigest')); } catch(e) { console.error('⚠️  emailDigest yüklenemedi:', e.message); }

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

  // ─── HAFTALIK TEMİZLİK (Her Pazar 02:00) ─────────────────────────────
  cron.schedule('0 2 * * 0', () => {
    const db = require('../config/database');
    // 90 günden eski API loglarını temizle
    const deleted = db.prepare(`
      DELETE FROM api_logs WHERE created_at < datetime('now', '-90 days')
    `).run();
    console.log(`🧹 Haftalık temizlik: ${deleted.changes} eski log silindi`);
  }, { timezone: 'Europe/Istanbul' });

  console.log('✅ Tüm zamanlayıcılar aktif (günlük rapor + haftalık özet + temizlik)\n');
}

module.exports = { startScheduler };
