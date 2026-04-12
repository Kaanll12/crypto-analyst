// middleware/security.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

// ─── HELMET (HTTP güvenlik başlıkları) ─────────────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "https:"],
      // localhost'taki tüm portlara izin ver (dev + prod)
      connectSrc: ["'self'", "https://api.coingecko.com", "http://localhost:*", "ws://localhost:*"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// ─── CORS ──────────────────────────────────────────────────────────────────
const corsMiddleware = cors({
  origin: (origin, callback) => {
    // İzin verilen sabit origin'ler
    const allowedExact = [
      process.env.ALLOWED_ORIGIN,
    ].filter(Boolean);

    // Origin yoksa (curl, file://, Postman) veya localhost'sa — izin ver
    if (
      !origin ||
      origin === 'null' ||
      /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
      allowedExact.includes(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: "${origin}" kaynağından erişim izni yok.`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
});

// ─── GENEL RATE LIMIT ──────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderildi. Lütfen bekleyin.' },
});

// ─── AUTH RATE LIMIT (brute-force koruması) ────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Çok fazla giriş denemesi. 15 dakika bekleyin.' },
  skipSuccessfulRequests: true,
});

// ─── ANALİZ RATE LIMIT ────────────────────────────────────────────────────
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Saatlik analiz limitine ulaştınız (20 analiz/saat).' },
});

// ─── XSS & SQL Injection temizleyici ──────────────────────────────────────
function sanitizeInput(req, _res, next) {
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        clean[k] = v
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .trim();
      } else if (typeof v === 'object') {
        clean[k] = sanitize(v);
      } else {
        clean[k] = v;
      }
    }
    return clean;
  };

  if (req.body)  req.body  = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  next();
}

// ─── API LOGGER ────────────────────────────────────────────────────────────
function apiLogger(db) {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      try {
        db.prepare(`
          INSERT INTO api_logs (endpoint, method, ip, user_id, status_code, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          req.path, req.method, req.ip,
          req.user?.id || null,
          res.statusCode,
          Date.now() - start
        );
      } catch (_) {}
    });
    next();
  };
}

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  generalLimiter,
  authLimiter,
  analysisLimiter,
  sanitizeInput,
  apiLogger,
};
