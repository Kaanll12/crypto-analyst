// config/database.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'crypto_analyst.db');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    -- KULLANICILAR
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      username    TEXT NOT NULL,
      role        TEXT DEFAULT 'user' CHECK(role IN ('admin','user','vip')),
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now')),
      last_login  TEXT
    );

    -- ANALİZLER
    CREATE TABLE IF NOT EXISTS analyses (
      id          TEXT PRIMARY KEY,
      coin_id     TEXT NOT NULL,
      coin_sym    TEXT NOT NULL,
      coin_name   TEXT NOT NULL,
      price_usd   REAL,
      change_24h  REAL,
      content     TEXT NOT NULL,
      signal      TEXT DEFAULT 'neutral' CHECK(signal IN ('bullish','bearish','neutral')),
      confidence  INTEGER DEFAULT 50,
      risk_level  TEXT DEFAULT 'medium' CHECK(risk_level IN ('low','medium','high')),
      ai_model    TEXT DEFAULT 'claude-sonnet',
      created_by  TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- GÜNLÜK KULLANIM LİMİTİ
    CREATE TABLE IF NOT EXISTS user_daily_usage (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      usage_date  TEXT NOT NULL DEFAULT (date('now')),
      count       INTEGER DEFAULT 0,
      UNIQUE(user_id, usage_date),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- GÜNLÜK RAPORLAR
    CREATE TABLE IF NOT EXISTS daily_reports (
      id          TEXT PRIMARY KEY,
      report_date TEXT UNIQUE NOT NULL,
      content     TEXT NOT NULL,
      seo_score   INTEGER,
      perf_score  INTEGER,
      cont_score  INTEGER,
      total_analyses INTEGER DEFAULT 0,
      top_coins   TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- PORTFÖY
    CREATE TABLE IF NOT EXISTS portfolio (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      coin_id     TEXT NOT NULL,
      coin_sym    TEXT NOT NULL,
      coin_name   TEXT NOT NULL,
      amount      REAL NOT NULL,
      buy_price   REAL NOT NULL,
      buy_date    TEXT NOT NULL,
      notes       TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio(user_id);

    -- FİYAT ALARMLARI
    CREATE TABLE IF NOT EXISTS price_alerts (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      coin_id     TEXT NOT NULL,
      coin_sym    TEXT NOT NULL,
      condition   TEXT NOT NULL CHECK(condition IN ('above','below')),
      target_price REAL NOT NULL,
      is_active   INTEGER DEFAULT 1,
      triggered_at TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id, is_active);

    -- PUSH BİLDİRİM ABONELİKLERİ
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      endpoint    TEXT UNIQUE NOT NULL,
      p256dh      TEXT NOT NULL DEFAULT '',
      auth        TEXT NOT NULL DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

    -- UYGULAMA AYARLARI (key-value)
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- API LOG (güvenlik için)
    CREATE TABLE IF NOT EXISTS api_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint    TEXT NOT NULL,
      method      TEXT NOT NULL,
      ip          TEXT,
      user_id     TEXT,
      status_code INTEGER,
      duration_ms INTEGER,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- İNDEKSLER
    CREATE INDEX IF NOT EXISTS idx_analyses_coin    ON analyses(coin_id);
    CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_created     ON api_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_date     ON daily_reports(report_date);
    CREATE INDEX IF NOT EXISTS idx_usage_user_date  ON user_daily_usage(user_id, usage_date);
  `);

  // Mevcut tabloya signal/confidence/risk_level kolonları ekle (migration)
  try { db.exec(`ALTER TABLE analyses ADD COLUMN signal TEXT DEFAULT 'neutral'`); } catch(_) {}
  try { db.exec(`ALTER TABLE analyses ADD COLUMN confidence INTEGER DEFAULT 50`); } catch(_) {}
  try { db.exec(`ALTER TABLE analyses ADD COLUMN risk_level TEXT DEFAULT 'medium'`); } catch(_) {}
  // Stripe entegrasyonu için
  try { db.exec(`ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT`); } catch(_) {}
  // Şifre sıfırlama için
  try { db.exec(`ALTER TABLE users ADD COLUMN reset_token TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN reset_token_expires TEXT`); } catch(_) {}
  // Google OAuth için
  try { db.exec(`ALTER TABLE users ADD COLUMN google_id TEXT`); } catch(_) {}
  // Watchlist (favori coinler)
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      coin_id    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, coin_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `); } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id)`); } catch(_) {}
  // Telegram entegrasyonu için
  try { db.exec(`ALTER TABLE users ADD COLUMN telegram_chat_id TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN telegram_code TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN telegram_code_expires TEXT`); } catch(_) {}
  // E-posta doğrulama
  try { db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN email_verify_token TEXT`); } catch(_) {}
  // Push bildirim geçmişi
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS notification_history (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      title      TEXT,
      body       TEXT,
      tag        TEXT,
      sent_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `); } catch(_) {}

  console.log('✅ Veritabanı başlatıldı:', DB_PATH);
}

// ─── KULLANIM LİMİTİ YARDIMCI FONKSİYONLARI ─────────────────────────────

const DAILY_LIMITS = {
  user:  2,   // Ücretsiz kullanıcı
  vip:   Infinity, // VIP sınırsız
  admin: Infinity, // Admin sınırsız
};

function getUserUsage(userId) {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(
    'SELECT count FROM user_daily_usage WHERE user_id = ? AND usage_date = ?'
  ).get(userId, today);
  return row ? row.count : 0;
}

function getUserLimit(role) {
  return DAILY_LIMITS[role] || DAILY_LIMITS.user;
}

function incrementUsage(userId) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO user_daily_usage (user_id, usage_date, count)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1
  `).run(userId, today);
}

function checkUsageLimit(userId, role) {
  const limit = getUserLimit(role);
  if (!isFinite(limit)) return { allowed: true, used: getUserUsage(userId), limit: '∞' };
  const used = getUserUsage(userId);
  return { allowed: used < limit, used, limit };
}

db.getUserUsage = getUserUsage;
db.getUserLimit = getUserLimit;
db.incrementUsage = incrementUsage;
db.checkUsageLimit = checkUsageLimit;

initDatabase();

module.exports = db;
