// middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../config/database');

function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkisiz erişim. Token gerekli.' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, email, username, role, is_active FROM users WHERE id = ?').get(decoded.id);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Hesap bulunamadı veya devre dışı.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token süresi dolmuş. Yeniden giriş yapın.' });
    }
    return res.status(401).json({ error: 'Geçersiz token.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bu işlem için admin yetkisi gerekli.' });
  }
  next();
}

function optionalAuth(req, _res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return next();

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, email, username, role FROM users WHERE id = ?').get(decoded.id);
    if (user) req.user = user;
  } catch (_) {}
  next();
}

module.exports = { authenticate, requireAdmin, optionalAuth };
