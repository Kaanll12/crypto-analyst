// middleware/security.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

// ─── HELMET ───────────────────────────────────────────────────────────────
// Temel CSP: API rotaları için koruma sağlar.
// Frontend HTML inline onclick içerdiğinden yalnızca API katmanında uygulanır.
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", 'cdn.paddle.com', 'fonts.googleapis.com'],
      styleSrc:       ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
      fontSrc:        ["'self'", 'fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     ["'self'", 'api.coingecko.com', 'sandbox-api.paddle.com', 'api.paddle.com'],
      frameSrc:       ["'self'", 'paddle.com', '*.paddle.com'],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// ─── CORS ─────────────────────────────────────────────────────────────────
const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === 'null' ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
      /\.railway\.app$/.test(origin) ||
      (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN)
    ) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: "${origin}" izinsiz.`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
});

// ─── RATE LIMIT ───────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Çok fazla giriş denemesi. 15 dakika bekleyin.' },
  skipSuccessfulRequests: true,
});

const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Saatlik analiz limitine ulaştınız.' },
});

// ─── SANITIZE ─────────────────────────────────────────────────────────────
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

// ─── API LOGGER ───────────────────────────────────────────────────────────
function apiLogger(db) {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      try {
        db.prepare(`
          INSERT INTO api_logs (endpoint, method, ip, user_id, status_code, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(req.path, req.method, req.ip, req.user?.id || null, res.statusCode, Date.now() - start);
      } catch (_) {}
    });
    next();
  };
}

module.exports = {
  helmetMiddleware, corsMiddleware,
  generalLimiter, authLimiter, analysisLimiter,
  sanitizeInput, apiLogger,
};
