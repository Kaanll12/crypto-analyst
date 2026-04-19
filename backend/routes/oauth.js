// routes/oauth.js — Google OAuth entegrasyonu
// Gerekli env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL
'use strict';

const express = require('express');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

const router = express.Router();

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL              = process.env.APP_URL || 'https://crypto-analyst.app';
const REDIRECT_URI         = `${APP_URL}/api/oauth/google/callback`;

const ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
if (!ENABLED) {
  console.warn('⚠️  Google OAuth yapılandırılmamış (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET eksik).');
}

// ─── State store (CSRF koruması için, 10 dk TTL) ─────────────────────────
const stateStore = new Map();
function cleanExpiredStates() {
  const now = Date.now();
  for (const [k, v] of stateStore.entries()) {
    if (now > v.exp) stateStore.delete(k);
  }
}

// ─── Google OAuth Başlat ─────────────────────────────────────────────────
router.get('/google', (_req, res) => {
  if (!ENABLED) {
    return res.redirect(`/?error=${encodeURIComponent('Google OAuth yapılandırılmamış.')}`);
  }

  cleanExpiredStates();
  const state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, { exp: Date.now() + 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'online',
    prompt:        'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ─── Google OAuth Callback ───────────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent('Google girişi iptal edildi.')}`);
  }

  // CSRF state kontrolü
  const storedState = stateStore.get(state);
  if (!state || !storedState || Date.now() > storedState.exp) {
    return res.redirect(`/?error=${encodeURIComponent('Geçersiz OAuth state. Tekrar deneyin.')}`);
  }
  stateStore.delete(state);

  try {
    // Authorization code → access token değiş tokuşu
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[OAuth] Token exchange hatası:', err);
      return res.redirect(`/?error=${encodeURIComponent('Google kimlik doğrulama başarısız.')}`);
    }

    const tokens = await tokenRes.json();

    // ID token'dan kullanıcı bilgilerini al
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!userInfoRes.ok) {
      return res.redirect(`/?error=${encodeURIComponent('Kullanıcı bilgileri alınamadı.')}`);
    }

    const googleUser = await userInfoRes.json();
    const { id: googleId, email, name, picture } = googleUser;

    if (!email) {
      return res.redirect(`/?error=${encodeURIComponent('E-posta adresi alınamadı.')}`);
    }

    // ─── Kullanıcı bul veya oluştur ──────────────────────────────────────
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (user) {
      // Mevcut kullanıcı — google_id'yi ekle/güncelle
      if (!user.google_id) {
        db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, user.id);
      }
      // Son girişi güncelle
      db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id);
    } else {
      // Yeni kullanıcı oluştur
      const id       = uuidv4();
      // Username: Google adından temizle veya email'den üret
      let username = (name || email.split('@')[0])
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // aksanları kaldır
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/__+/g, '_')
        .slice(0, 25)
        .toLowerCase();

      // Kullanıcı adı çakışmasını çöz
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) username = username + '_' + Math.floor(Math.random() * 1000);

      db.prepare(`
        INSERT INTO users (id, email, password, username, role, google_id)
        VALUES (?, ?, ?, ?, 'user', ?)
      `).run(id, email, '__GOOGLE_OAUTH__', username, googleId);

      user = { id, email, username, role: 'user' };
    }

    // ─── JWT token üret ve sayfaya yönlendir ─────────────────────────────
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    // Token'ı query param ile ana sayfaya ilet (kısa süre geçerli)
    // Frontend bunu alıp localStorage'a kaydeder
    res.redirect(`/?oauth_token=${encodeURIComponent(token)}&oauth_user=${encodeURIComponent(user.username)}`);

  } catch (err) {
    console.error('[OAuth] Callback hatası:', err);
    res.redirect(`/?error=${encodeURIComponent('Giriş işlemi sırasında hata oluştu.')}`);
  }
});

// ─── OAuth Durumunu Kontrol Et ───────────────────────────────────────────
router.get('/google/status', (_req, res) => {
  res.json({ enabled: ENABLED });
});

module.exports = router;
