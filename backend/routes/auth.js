// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

const router = express.Router();

// ─── KAYIT ────────────────────────────────────────────────────────────────
router.post('/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Geçerli bir e-posta girin.'),
    body('password')
      .isLength({ min: 8 }).withMessage('Şifre en az 8 karakter olmalı.')
      .matches(/[A-Z]/).withMessage('Şifre en az bir büyük harf içermeli.')
      .matches(/[0-9]/).withMessage('Şifre en az bir rakam içermeli.'),
    body('username')
      .isLength({ min: 3, max: 30 }).withMessage('Kullanıcı adı 3-30 karakter arası olmalı.')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Kullanıcı adı sadece harf, rakam ve _ içerebilir.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, username } = req.body;

    try {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) return res.status(409).json({ error: 'Bu e-posta adresi zaten kullanımda.' });

      const hash = await bcrypt.hash(password, 12);
      const id = uuidv4();

      db.prepare(`
        INSERT INTO users (id, email, password, username, role)
        VALUES (?, ?, ?, ?, 'user')
      `).run(id, email, hash, username);

      const token = jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      });

      // Kullanım bilgisini dahil et
      const usage = db.checkUsageLimit(id, 'user');

      res.status(201).json({
        message: 'Hesap başarıyla oluşturuldu.',
        token,
        user: { id, email, username, role: 'user' },
        usage: { used: 0, limit: usage.limit, remaining: usage.limit },
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Sunucu hatası. Lütfen tekrar deneyin.' });
    }
  }
);

// ─── GİRİŞ ────────────────────────────────────────────────────────────────
router.post('/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçersiz e-posta veya şifre.' });

    const { email, password } = req.body;

    try {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      const hash = user?.password || '$2a$12$invalidhashtopreventtimingattack';
      const valid = await bcrypt.compare(password, hash);

      if (!user || !valid || !user.is_active) {
        return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
      }

      db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id);

      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      });

      const usage = db.checkUsageLimit(user.id, user.role);

      res.json({
        message: 'Giriş başarılı.',
        token,
        user: { id: user.id, email: user.email, username: user.username, role: user.role },
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.limit === '∞' ? '∞' : Math.max(0, usage.limit - usage.used),
          isVip: user.role === 'vip' || user.role === 'admin',
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Sunucu hatası.' });
    }
  }
);

// ─── PROFİL ───────────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(
    'SELECT id, email, username, role, created_at, last_login FROM users WHERE id = ?'
  ).get(req.user.id);

  const usage = db.checkUsageLimit(req.user.id, user.role);

  res.json({
    user,
    usage: {
      used: usage.used,
      limit: usage.limit,
      remaining: usage.limit === '∞' ? '∞' : Math.max(0, usage.limit - usage.used),
      isVip: user.role === 'vip' || user.role === 'admin',
    },
  });
});

// ─── VIP'E GEÇ (demo — gerçek ödeme entegrasyonu için genişletilebilir) ──
router.post('/upgrade-vip', authenticate, (req, res) => {
  try {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    if (user.role === 'admin') {
      return res.json({ message: 'Admin zaten sınırsız erişime sahip.' });
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('vip', req.user.id);
    res.json({ message: 'VIP üyeliğiniz aktifleştirildi! Artık sınırsız analiz yapabilirsiniz.' });
  } catch (err) {
    console.error('Upgrade error:', err);
    res.status(500).json({ error: 'Yükseltme işlemi başarısız.' });
  }
});

// ─── ŞİFRE DEĞİŞTİR ──────────────────────────────────────────────────────
router.put('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/[A-Z]/)
      .matches(/[0-9]/),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Mevcut şifre hatalı.' });

    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ message: 'Şifre başarıyla güncellendi.' });
  }
);

// ─── ŞİFREMİ UNUTTUM ────────────────────────────────────────────────────
const crypto = require('crypto');

router.post('/forgot-password',
  authLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçerli bir e-posta girin.' });

    // Güvenlik: her zaman aynı yanıt ver (kullanıcı varlığını açıklama)
    const { email } = req.body;
    const user = db.prepare('SELECT id, username FROM users WHERE email = ? AND is_active = 1').get(email);

    if (user) {
      const token   = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 saat
      db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
        .run(token, expires, user.id);

      const resetUrl = `${process.env.APP_URL || 'https://your-app.railway.app'}/reset-password.html?token=${token}`;
      console.log(`[forgot-password] Token oluşturuldu: ${user.username} — ${resetUrl}`);

      // Email gönderimi (opsiyonel — SMTP ayarlıysa)
      if (process.env.SMTP_USER) {
        try {
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          });
          await transporter.sendMail({
            from: `"CryptoAnalyst" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'CryptoAnalyst — Şifre Sıfırlama',
            html: `<p>Merhaba <strong>${user.username}</strong>,</p>
                   <p>Şifre sıfırlama linkiniz (1 saat geçerli):</p>
                   <p><a href="${resetUrl}">${resetUrl}</a></p>
                   <p>Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>`,
          });
        } catch (emailErr) {
          console.warn('[forgot-password] E-posta gönderilemedi:', emailErr.message);
        }
      }
    }

    // Her durumda aynı yanıt
    res.json({ message: 'E-posta adresiniz sistemde kayıtlıysa sıfırlama linki gönderildi.' });
  }
);

// ─── ŞİFRE SIFIRLA ───────────────────────────────────────────────────────
router.post('/reset-password',
  authLimiter,
  [
    body('token').isString().isLength({ min: 64, max: 64 }),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/[A-Z]/)
      .matches(/[0-9]/),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçersiz istek.' });

    const { token, newPassword } = req.body;
    const user = db.prepare(
      `SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now') AND is_active = 1`
    ).get(token);

    if (!user) return res.status(400).json({ error: 'Sıfırlama linki geçersiz veya süresi dolmuş.' });

    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
      .run(hash, user.id);

    res.json({ message: 'Şifreniz başarıyla sıfırlandı. Giriş yapabilirsiniz.' });
  }
);

module.exports = router;
