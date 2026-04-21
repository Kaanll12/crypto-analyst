// routes/admin.js — Admin yönetim paneli API'si
'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Yalnızca admin erişebilir.' });
  }
  next();
}

// Dashboard istatistikleri
router.get('/stats', authenticate, requireAdmin, (_req, res) => {
  try {
    const totalUsers    = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
    const activeUsers   = db.prepare('SELECT COUNT(*) as n FROM users WHERE is_active=1').get().n;
    const vipUsers      = db.prepare("SELECT COUNT(*) as n FROM users WHERE role='vip'").get().n;
    const totalAnalyses = db.prepare('SELECT COUNT(*) as n FROM analyses').get().n;
    const todayAnalyses = db.prepare("SELECT COUNT(*) as n FROM analyses WHERE date(created_at)=date('now')").get().n;
    const totalReports  = db.prepare('SELECT COUNT(*) as n FROM daily_reports').get().n;
    const activeAlerts  = db.prepare('SELECT COUNT(*) as n FROM price_alerts WHERE is_active=1').get().n;

    // Son 30 günlük analiz trendi
    const analysisTrend = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count
      FROM analyses WHERE created_at >= datetime('now','-30 days')
      GROUP BY date(created_at) ORDER BY day ASC
    `).all();

    // Son 30 günlük kullanıcı büyümesi
    const userGrowth = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count
      FROM users WHERE created_at >= datetime('now','-30 days')
      GROUP BY date(created_at) ORDER BY day ASC
    `).all();

    const topCoins = db.prepare(`
      SELECT coin_sym, coin_name, COUNT(*) as count
      FROM analyses GROUP BY coin_id ORDER BY count DESC LIMIT 8
    `).all();

    const recentUsers = db.prepare(`
      SELECT id, username, email, role, created_at, last_login
      FROM users ORDER BY created_at DESC LIMIT 5
    `).all();

    // Log istatistikleri — endpoint bazında istek sayısı
    const logStats = db.prepare(`
      SELECT endpoint, COUNT(*) as total,
        SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as err,
        ROUND(AVG(duration_ms)) as avg_ms
      FROM api_logs
      WHERE created_at >= datetime('now','-1 day')
      GROUP BY endpoint ORDER BY total DESC LIMIT 10
    `).all();

    res.json({ stats: { totalUsers, activeUsers, vipUsers, totalAnalyses, todayAnalyses, totalReports, activeAlerts }, analysisTrend, userGrowth, topCoins, recentUsers, logStats });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'İstatistikler alınamadı.' });
  }
});

// Kullanıcı listesi
router.get('/users', authenticate, requireAdmin, (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = req.query.search ? '%' + req.query.search + '%' : null;

    const where  = search ? 'WHERE username LIKE ? OR email LIKE ?' : '';
    const params = search ? [search, search] : [];

    const total = db.prepare('SELECT COUNT(*) as n FROM users ' + where).get(...params).n;
    const users = db.prepare(
      'SELECT id, username, email, role, is_active, created_at, last_login FROM users ' +
      where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(...params, limit, offset);

    const today = new Date().toISOString().split('T')[0];
    const withUsage = users.map(u => {
      const usage = db.prepare('SELECT count FROM user_daily_usage WHERE user_id=? AND usage_date=?').get(u.id, today);
      return { ...u, todayUsage: usage ? usage.count : 0 };
    });

    res.json({ data: withUsage, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Kullanıcılar alınamadı.' });
  }
});

// Rol değiştir
router.put('/users/:id/role', authenticate, requireAdmin,
  [body('role').isIn(['user', 'vip', 'admin'])],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçersiz rol.' });
    try {
      const user = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
      if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
      db.prepare('UPDATE users SET role=? WHERE id=?').run(req.body.role, req.params.id);
      res.json({ message: 'Rol güncellendi.' });
    } catch (err) { res.status(500).json({ error: 'Rol güncellenemedi.' }); }
  }
);

// Kullanıcı aktif/pasif
router.put('/users/:id/toggle', authenticate, requireAdmin, (req, res) => {
  try {
    const user = db.prepare('SELECT id, is_active FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Kendi hesabını devre dışı bırakamazsın.' });
    const newState = user.is_active ? 0 : 1;
    db.prepare('UPDATE users SET is_active=? WHERE id=?').run(newState, req.params.id);
    res.json({ message: newState ? 'Aktif edildi.' : 'Devre dışı bırakıldı.', is_active: newState });
  } catch (err) { res.status(500).json({ error: 'İşlem başarısız.' }); }
});

// Kullanıcı sil
router.delete('/users/:id', authenticate, requireAdmin, (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Kendi hesabını silemezsin.' });
    const user = db.prepare('SELECT id, username FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    db.prepare('DELETE FROM analyses WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM price_alerts WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM user_daily_usage WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    console.log(`[admin] Kullanıcı silindi: ${user.username} (${req.params.id})`);
    res.json({ message: `${user.username} silindi.` });
  } catch (err) { res.status(500).json({ error: 'Silme başarısız.' }); }
});

// Raporlar listesi
router.get('/reports', authenticate, requireAdmin, (_req, res) => {
  try {
    const reports = db.prepare(
      'SELECT id, report_date, seo_score, perf_score, cont_score, total_analyses, created_at FROM daily_reports ORDER BY report_date DESC LIMIT 30'
    ).all();
    res.json({ data: reports });
  } catch (err) { res.status(500).json({ error: 'Raporlar alınamadı.' }); }
});

// Analiz sil
router.delete('/analyses/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM analyses WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Analiz bulunamadı.' });
    db.prepare('DELETE FROM analyses WHERE id=?').run(req.params.id);
    res.json({ message: 'Analiz silindi.' });
  } catch (err) { res.status(500).json({ error: 'Silme başarısız.' }); }
});

// API logları
router.get('/logs', authenticate, requireAdmin, (_req, res) => {
  try {
    const logs = db.prepare(
      'SELECT endpoint, method, status_code, duration_ms, ip, created_at FROM api_logs ORDER BY created_at DESC LIMIT 200'
    ).all();
    res.json({ data: logs });
  } catch (err) { res.status(500).json({ error: 'Loglar alınamadı.' }); }
});

module.exports = router;
