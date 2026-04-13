// automation/scheduler.js
const cron = require('node-cron');
const { generateDailyReport } = require('./dailyReport');
const { sendWeeklyDigest }    = require('./emailDigest');

function startScheduler() {
  const cronExpression = process.env.DAILY_REPORT_CRON || '0 9 * * *';

  console.log(`⏰ Zamanlayıcı başlatıldı | Günlük rapor: her gün saat 09:00`);

  // ─── GÜNLÜK RAPOR (Her gün saat 09:00) ───────────────────────────────
  cron.schedule(cronExpression, async () => {
    console.log(`\n🚀 [${new Date().toLocaleString('tr-TR')}] Günlük otomasyon başladı`);
    await generateDailyReport();
  }, {
    timezone: 'Europe/Istanbul',
  });

  // ─── HAFTALIK E-POSTA ÖZETİ (Her Pazartesi 08:00) ────────────────────
  cron.schedule(process.env.WEEKLY_DIGEST_CRON || '0 8 * * 1', async () => {
    console.log(`\n📧 [${new Date().toLocaleString('tr-TR')}] Haftalık e-posta özeti başlatıldı`);
    try {
      await sendWeeklyDigest();
    } catch (err) {
      console.error('Haftalık özet hatası:', err.message);
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

  console.log('✅ Tüm zamanlayıcılar aktif (günlük rapor + haftalık özet + temizlik)\n');
}

module.exports = { startScheduler };
