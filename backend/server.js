// server.js
require('dotenv').config();
const express = require('express');
const morgan  = require('morgan');
const path    = require('path');

const db = require('./config/database');
const {
  helmetMiddleware, corsMiddleware,
  generalLimiter, sanitizeInput, apiLogger
} = require('./middleware/security');
const { startScheduler } = require('./automation/scheduler');

const authRoutes     = require('./routes/auth');
const analysisRoutes = require('./routes/analysis');
const reportRoutes   = require('./routes/reports');
const newsRoutes     = require('./routes/news');
const paymentRoutes  = require('./routes/payments');
const portfolioRoutes = require('./routes/portfolio');
const alertRoutes    = require('./routes/alerts');

// Yeni rotalar — hata olursa server ayakta kalsın
let notifyRoutes, emailRoutes;
try { notifyRoutes = require('./routes/notifications'); } catch(e) { console.error('⚠️  notifications route yüklenemedi:', e.message); }
try { emailRoutes  = require('./routes/email');         } catch(e) { console.error('⚠️  email route yüklenemedi:', e.message); }

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── STRIPE WEBHOOK (raw body gerekir — JSON parse'dan ÖNCE) ─────────────
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentRoutes);

// ─── TEMEL MİDDLEWARE ────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(sanitizeInput);
app.use(generalLimiter);
app.use(morgan('combined'));
app.use(apiLogger(db));

// ─── ROTALAR ─────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/analyses', analysisRoutes);
app.use('/api/reports',  reportRoutes);
app.use('/api/news',     newsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/alerts',        alertRoutes);
if (notifyRoutes) app.use('/api/notifications', notifyRoutes);
if (emailRoutes)  app.use('/api/email',         emailRoutes);

// ─── SAĞLIK KONTROLÜ ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    stripe: !!process.env.STRIPE_SECRET_KEY,
  });
});

// ─── FRONTEND (her ortamda static serve) ──────────────────────────────────
{
  const frontendPath = process.env.FRONTEND_PATH
    || path.join(__dirname, '..', 'frontend');

  app.use(express.static(frontendPath));

  // SEO: sitemap & robots her ortamda servis edilsin
  app.get('/sitemap.xml',  (_req, res) => res.sendFile(path.join(frontendPath, 'sitemap.xml')));
  app.get('/robots.txt',   (_req, res) => res.sendFile(path.join(frontendPath, 'robots.txt')));
  // Favicon: tarayıcı /favicon.ico ister — mevcut icon'a yönlendir
  app.get('/favicon.ico',  (_req, res) => res.sendFile(path.join(frontendPath, 'icons', 'icon-192.png')));

  // SPA: uzantısız path'ler için index.html döndür (js/css/png gibi dosyalar HARİÇ)
  // Uzantılı dosya istekleri express.static tarafından ya servis edilir ya 404 döner
  app.get(/^(?!\/api\/)(?!.*\.[a-zA-Z0-9]{1,6}$).*/, (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// ─── HATA YÖNETİMİ ───────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  if (err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: 'Sunucu hatası.' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadı.' });
});

// ─── SUNUCUYU BAŞLAT ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  🚀 Crypto Analyst API               ║`);
  console.log(`║  Port   : ${PORT}                        ║`);
  console.log(`║  Ortam  : ${process.env.NODE_ENV || 'development'}               ║`);
  console.log('╚══════════════════════════════════════╝\n');
  startScheduler();
});

process.on('SIGTERM', () => {
  console.log('SIGTERM alındı, sunucu kapatılıyor...');
  process.exit(0);
});

module.exports = app;
