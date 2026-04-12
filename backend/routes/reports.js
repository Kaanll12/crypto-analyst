// routes/reports.js
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { generateDailyReport } = require('../automation/dailyReport');
const db = require('../config/database');

const router = express.Router();

// Tüm raporları listele
router.get('/', (req, res) => {
  const reports = db.prepare(`
    SELECT id, report_date, seo_score, perf_score, cont_score, total_analyses, top_coins, created_at
    FROM daily_reports ORDER BY report_date DESC LIMIT 30
  `).all();
  res.json({ data: reports });
});

// Tek rapor
router.get('/:date', (req, res) => {
  const report = db.prepare('SELECT * FROM daily_reports WHERE report_date = ?').get(req.params.date);
  if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });
  res.json({ data: report });
});

// Elle rapor oluştur (admin)
router.post('/generate', authenticate, requireAdmin, async (req, res) => {
  const report = await generateDailyReport();
  if (!report) return res.status(500).json({ error: 'Rapor oluşturulamadı veya zaten mevcut.' });
  res.status(201).json({ message: 'Rapor oluşturuldu.', data: report });
});

module.exports = router;
