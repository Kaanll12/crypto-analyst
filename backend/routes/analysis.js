// routes/analysis.js
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { analysisLimiter } = require('../middleware/security');

const router = express.Router();
const VALID_COINS = ['bitcoin','ethereum','solana','binancecoin','ripple','cardano','polkadot','avalanche-2'];

// ─── KULLANIM LİMİTİ SORGULA ─────────────────────────────────────────────
router.get('/usage', authenticate, (req, res) => {
  try {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    const role = user?.role || 'user';
    const usage = db.checkUsageLimit(req.user.id, role);
    res.json({
      used: usage.used,
      limit: usage.limit,
      remaining: usage.limit === '∞' ? '∞' : Math.max(0, usage.limit - usage.used),
      isVip: role === 'vip' || role === 'admin',
      resetsAt: 'Gece yarısı (00:00)',
    });
  } catch (err) {
    console.error('Usage error:', err);
    res.status(500).json({ error: 'Kullanım bilgisi alınamadı.' });
  }
});

// ─── İSTATİSTİKLER ───────────────────────────────────────────────────────
router.get('/stats/summary', (req, res) => {
  try {
    const total   = db.prepare('SELECT COUNT(*) as n FROM analyses').get().n;
    const today   = db.prepare(`SELECT COUNT(*) as n FROM analyses WHERE date(created_at) = date('now')`).get().n;
    const popular = db.prepare(`
      SELECT coin_sym, coin_name, COUNT(*) as count FROM analyses
      GROUP BY coin_sym ORDER BY count DESC LIMIT 5
    `).all();

    res.json({ total, today, popularCoins: popular });
  } catch(err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'İstatistikler alınamadı.' });
  }
});

// ─── TÜM ANALİZLERİ LİSTELE ──────────────────────────────────────────────
router.get('/', optionalAuth, [
  query('coin').optional().isString().trim(),
  query('signal').optional().isIn(['bullish', 'bearish', 'neutral']),
  query('from').optional().isDate(),
  query('to').optional().isDate(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('minConf').optional().isInt({ min: 0, max: 100 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const page    = parseInt(req.query.page)    || 1;
  const limit   = parseInt(req.query.limit)   || 10;
  const coin    = req.query.coin;
  const signal  = req.query.signal;
  const from    = req.query.from;   // YYYY-MM-DD
  const to      = req.query.to;     // YYYY-MM-DD
  const minConf = parseInt(req.query.minConf) || 0;
  const offset  = (page - 1) * limit;

  const conds  = [];
  const params = [];

  if (coin) {
    // coin_sym veya coin_id ile eşleşebilir
    conds.push('(coin_id = ? OR coin_sym = ?)');
    params.push(coin, coin);
  }
  if (signal) {
    conds.push('signal = ?');
    params.push(signal);
  }
  if (from) {
    conds.push("date(created_at) >= ?");
    params.push(from);
  }
  if (to) {
    conds.push("date(created_at) <= ?");
    params.push(to);
  }
  if (minConf > 0) {
    conds.push('confidence >= ?');
    params.push(minConf);
  }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) as n FROM analyses ${where}`).get(...params).n;
  const rows  = db.prepare(`
    SELECT id, coin_id, coin_sym, coin_name, price_usd, change_24h,
           signal, confidence, risk_level, content, created_at
    FROM analyses ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─── TEK ANALİZ ───────────────────────────────────────────────────────────
router.get('/:id', [param('id').isUUID()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçersiz ID.' });

  const row = db.prepare('SELECT * FROM analyses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Analiz bulunamadı.' });
  res.json({ data: row });
});

// ─── AI ANALİZ OLUŞTUR ────────────────────────────────────────────────────
router.post('/generate',
  authenticate,
  analysisLimiter,
  [
    body('coinId').isIn(VALID_COINS).withMessage('Geçersiz coin.'),
    body('coinSym').isLength({ min: 2, max: 10 }),
    body('coinName').isLength({ min: 2, max: 50 }),
    body('priceUsd').optional().isFloat({ min: 0 }),
    body('change24h').optional().isFloat(),
    body('volume24h').optional().isFloat({ min: 0 }),
    body('marketCap').optional().isFloat({ min: 0 }),
    body('high24h').optional().isFloat({ min: 0 }),
    body('low24h').optional().isFloat({ min: 0 }),
    body('ath').optional().isFloat({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // ─── KULLANIM LİMİTİ KONTROLÜ ─────────────────────────────────────
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    const role = user?.role || 'user';
    const usageCheck = db.checkUsageLimit(req.user.id, role);

    if (!usageCheck.allowed) {
      return res.status(429).json({
        error: 'Günlük analiz limitine ulaştınız.',
        code: 'DAILY_LIMIT_EXCEEDED',
        used: usageCheck.used,
        limit: usageCheck.limit,
        message: `Ücretsiz hesabınızla günde ${usageCheck.limit} analiz oluşturabilirsiniz. Sınırsız analiz için VIP'e geçin.`,
      });
    }

    const { coinId, coinSym, coinName, priceUsd, change24h, volume24h, marketCap, high24h, low24h, ath } = req.body;

    try {
      // CoinGecko'dan ek veri çek
      let extraData = {};
      try {
        const cgRes = await fetch(
          `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
        );
        if (cgRes.ok) extraData = await cgRes.json();
      } catch(_) {}

      const sentiment = extraData?.sentiment_votes_up_percentage
        ? `Topluluk duyarlılığı: %${extraData.sentiment_votes_up_percentage.toFixed(0)} olumlu`
        : '';
      const priceChange7d  = extraData?.market_data?.price_change_percentage_7d?.toFixed(2)  || null;
      const priceChange30d = extraData?.market_data?.price_change_percentage_30d?.toFixed(2) || null;
      const athDiff = ath && priceUsd ? (((priceUsd - ath) / ath) * 100).toFixed(1) : null;

      // Anlık haber başlıklarını çek
      let newsContext = '';
      try {
        const newsRes = await fetch(`https://api.coingecko.com/api/v3/news?page=1`).catch(() => null);
        // RSS'den son haberleri al
        const internalNewsRes = await fetch(`/api/news?coin=${coinSym}&limit=5`).catch(() => null);
        if (internalNewsRes?.ok) {
          const newsData = await internalNewsRes.json();
          const headlines = (newsData.data || []).slice(0, 5).map(n => `- ${n.title}`).join('\n');
          if (headlines) newsContext = `\n\n## Son Haberler (Anlık)\n${headlines}`;
        }
      } catch(_) {}

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1400,
        system: `Sen CryptoAnalyst platformunun baş analisti ve kripto para uzmanısın. 10 yıllık tecrübene sahipsin. Teknik analiz, on-chain veriler ve makro ekonomik faktörleri harmanlayarak derin, somut ve eylem odaklı analizler üretirsin. Asla belirsiz ya da genel konuşmazsın. Her analizinde net destek/direnç seviyeleri, risk değerlendirmesi ve yatırımcıya özel tavsiyeler verirsin.`,
        messages: [{
          role: 'user',
          content: `${coinName} (${coinSym}) için ${new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })} tarihli kapsamlı günlük analiz yaz.

## Piyasa Verileri
- Güncel fiyat: $${priceUsd?.toLocaleString() || 'N/A'}
- 24s değişim: ${change24h?.toFixed(2) || 0}%
${priceChange7d  ? `- 7 günlük değişim: ${priceChange7d}%`    : ''}
${priceChange30d ? `- 30 günlük değişim: ${priceChange30d}%`  : ''}
${high24h  ? `- 24s yüksek: $${high24h.toLocaleString()}`     : ''}
${low24h   ? `- 24s düşük: $${low24h.toLocaleString()}`       : ''}
${volume24h ? `- 24s hacim: $${(volume24h/1e9).toFixed(2)}B`  : ''}
${marketCap ? `- Piyasa değeri: $${(marketCap/1e9).toFixed(1)}B` : ''}
${athDiff   ? `- ATH'den uzaklık: ${athDiff}%`                : ''}
${sentiment}${newsContext}

## ÖNEMLİ: Yanıtının EN BAŞINA aşağıdaki JSON bloğunu ekle (başka bir şey yazmadan önce):
\`\`\`json
{
  "signal": "bullish|bearish|neutral",
  "confidence": 0-100,
  "risk_level": "low|medium|high",
  "key_factors": ["faktör1", "faktör2", "faktör3", "faktör4"]
}
\`\`\`

## Analiz Formatı
Aşağıdaki bölümleri Türkçe yaz. Her bölüm somut, veri odaklı ve net olsun:

### 📊 Piyasa Durumu
(Genel piyasa konumu, hacim analizi, baskın eğilim — 3-4 cümle)

### 🔍 Teknik Analiz
(Kritik destek ve direnç seviyeleri, momentum, RSI yorumu, trend analizi — 3-4 cümle, mutlaka rakam ver)

### 🌍 Makro & On-Chain
(BTC dominansı etkisi, kurumsal hareketler, ağ aktivitesi — 2-3 cümle)

### ⚡ Kısa Vadeli Senaryo
(24-72 saat için boğa senaryosu ve ayı senaryosu, tetikleyiciler — 2-3 cümle)

### 🎯 Yatırımcı Notu
(Risk seviyesi: Düşük/Orta/Yüksek — Net alım/satım/bekleme tavsiyesi ve gerekçesi — 2 cümle)

Profesyonel, güvenilir ve cesur ol. Belirsiz ifadelerden kaçın.`,
        }],
      });

      const rawContent = message.content[0].text;

      // JSON bloğunu çıkar
      let signal = 'neutral', confidence = 60, riskLevel = 'medium', keyFactors = [];
      const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          signal     = parsed.signal     || 'neutral';
          confidence = parsed.confidence || 60;
          riskLevel  = parsed.risk_level || 'medium';
          keyFactors = parsed.key_factors || [];
        } catch(_) {}
      }

      // JSON bloğunu metinden çıkar
      const content = rawContent.replace(/```json[\s\S]*?```\n?/, '').trim();

      const id = uuidv4();
      db.prepare(`
        INSERT INTO analyses (id, coin_id, coin_sym, coin_name, price_usd, change_24h, content, signal, confidence, risk_level, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, coinId, coinSym, coinName, priceUsd || null, change24h || null, content, signal, confidence, riskLevel, req.user.id);

      // Kullanım sayacını artır
      db.incrementUsage(req.user.id);

      // Güncel kullanım
      const updatedUsage = db.checkUsageLimit(req.user.id, role);

      res.status(201).json({
        message: 'Analiz başarıyla oluşturuldu.',
        data: {
          id,
          coin_sym: coinSym,
          coin_name: coinName,
          content,
          signal,
          confidence,
          risk_level: riskLevel,
          key_factors: keyFactors,
          created_at: new Date().toISOString(),
        },
        usage: {
          used: updatedUsage.used,
          limit: updatedUsage.limit,
          remaining: updatedUsage.limit === '∞' ? '∞' : Math.max(0, updatedUsage.limit - updatedUsage.used),
        },
      });
    } catch (err) {
      console.error('Analysis generation error:', err);
      res.status(500).json({ error: 'Analiz oluşturulamadı. API hatası.' });
    }
  }
);

// ─── COIN KARŞILAŞTIRMA ──────────────────────────────────────────────────
router.post('/compare',
  authenticate,
  analysisLimiter,
  [
    body('coin1.coinId').isIn(VALID_COINS),
    body('coin1.coinSym').isLength({ min: 2, max: 10 }),
    body('coin1.coinName').isLength({ min: 2, max: 50 }),
    body('coin2.coinId').isIn(VALID_COINS),
    body('coin2.coinSym').isLength({ min: 2, max: 10 }),
    body('coin2.coinName').isLength({ min: 2, max: 50 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (req.body.coin1.coinId === req.body.coin2.coinId)
      return res.status(400).json({ error: 'Farklı iki coin seçin.' });

    // Kullanım limiti — karşılaştırma 2 analiz sayar
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    const role = user?.role || 'user';
    const usageCheck = db.checkUsageLimit(req.user.id, role);

    if (!usageCheck.allowed || (isFinite(usageCheck.limit) && usageCheck.used + 1 >= usageCheck.limit)) {
      return res.status(429).json({
        error: 'Karşılaştırma için yeterli analiz hakkınız yok (2 hak gerekir).',
        code: 'DAILY_LIMIT_EXCEEDED',
      });
    }

    const { coin1, coin2 } = req.body;
    const dateStr = new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    function buildCoinContext(c) {
      return `- Coin: ${c.coinName} (${c.coinSym})
- Fiyat: $${c.priceUsd?.toLocaleString() || 'N/A'}
- 24s değişim: ${(c.change24h || 0).toFixed(2)}%
- Hacim: ${c.volume24h ? '$' + (c.volume24h / 1e9).toFixed(2) + 'B' : 'N/A'}
- Piyasa değeri: ${c.marketCap ? '$' + (c.marketCap / 1e9).toFixed(1) + 'B' : 'N/A'}`;
    }

    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      // İki analizi paralel oluştur
      const [msg1, msg2] = await Promise.all([
        client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 900,
          system: 'Sen CryptoAnalyst platformunun baş analisti ve kripto para uzmanısın. Kısa, somut ve karşılaştırmaya uygun analizler üretirsin.',
          messages: [{ role: 'user', content:
`${coin1.coinName} (${coin1.coinSym}) için ${dateStr} tarihli KISA analiz yaz. Karşılaştırma amacıyla yazıyorsun.

${buildCoinContext(coin1)}

## ÖNEMLİ: Yanıtının EN BAŞINA JSON bloğu ekle:
\`\`\`json
{"signal":"bullish|bearish|neutral","confidence":0-100,"risk_level":"low|medium|high"}
\`\`\`

Sonra şu bölümleri Türkçe yaz (her biri 2-3 cümle):
### 📊 Teknik Görünüm
### ⚡ Kısa Vadeli Beklenti
### 🎯 Yatırımcı Notu` }],
        }),
        client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 900,
          system: 'Sen CryptoAnalyst platformunun baş analisti ve kripto para uzmanısın. Kısa, somut ve karşılaştırmaya uygun analizler üretirsin.',
          messages: [{ role: 'user', content:
`${coin2.coinName} (${coin2.coinSym}) için ${dateStr} tarihli KISA analiz yaz. Karşılaştırma amacıyla yazıyorsun.

${buildCoinContext(coin2)}

## ÖNEMLİ: Yanıtının EN BAŞINA JSON bloğu ekle:
\`\`\`json
{"signal":"bullish|bearish|neutral","confidence":0-100,"risk_level":"low|medium|high"}
\`\`\`

Sonra şu bölümleri Türkçe yaz (her biri 2-3 cümle):
### 📊 Teknik Görünüm
### ⚡ Kısa Vadeli Beklenti
### 🎯 Yatırımcı Notu` }],
        }),
      ]);

      function parseAnalysis(msg, coinData) {
        const raw = msg.content[0].text;
        let signal = 'neutral', confidence = 50, risk_level = 'medium';
        const m = raw.match(/```json\s*([\s\S]*?)```/);
        if (m) {
          try {
            const p = JSON.parse(m[1]);
            signal = p.signal || 'neutral';
            confidence = p.confidence || 50;
            risk_level = p.risk_level || 'medium';
          } catch (_) {}
        }
        const content = raw.replace(/```json[\s\S]*?```\n?/, '').trim();
        return { signal, confidence, risk_level, content };
      }

      const analysis1 = parseAnalysis(msg1, coin1);
      const analysis2 = parseAnalysis(msg2, coin2);

      // İkisini de DB'ye kaydet
      const id1 = uuidv4();
      const id2 = uuidv4();
      db.prepare(`INSERT INTO analyses (id,coin_id,coin_sym,coin_name,price_usd,change_24h,content,signal,confidence,risk_level,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id1, coin1.coinId, coin1.coinSym, coin1.coinName, coin1.priceUsd||null, coin1.change24h||null,
             analysis1.content, analysis1.signal, analysis1.confidence, analysis1.risk_level, req.user.id);
      db.prepare(`INSERT INTO analyses (id,coin_id,coin_sym,coin_name,price_usd,change_24h,content,signal,confidence,risk_level,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id2, coin2.coinId, coin2.coinSym, coin2.coinName, coin2.priceUsd||null, coin2.change24h||null,
             analysis2.content, analysis2.signal, analysis2.confidence, analysis2.risk_level, req.user.id);

      // Kullanımı 2 artır
      db.incrementUsage(req.user.id);
      db.incrementUsage(req.user.id);

      // Karar metni oluştur
      const verdictMsg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: 'Kripto para uzmanısın. Kısa ve net karar ver.',
        messages: [{ role: 'user', content:
`${coin1.coinName} (${coin1.coinSym}) vs ${coin2.coinName} (${coin2.coinSym}) karşılaştırması:

${coin1.coinName}: Sinyal=${analysis1.signal}, Güven=%${analysis1.confidence}, Risk=${analysis1.risk_level}
${coin2.coinName}: Sinyal=${analysis2.signal}, Güven=%${analysis2.confidence}, Risk=${analysis2.risk_level}

Bu iki coinden hangisi şu an daha iyi fırsat sunuyor? 2-3 cümle ile somut, net karar ver. Türkçe yaz.`
        }],
      });

      res.json({
        analysis1: { ...analysis1, coinSym: coin1.coinSym, coinName: coin1.coinName },
        analysis2: { ...analysis2, coinSym: coin2.coinSym, coinName: coin2.coinName },
        verdict: verdictMsg.content[0].text,
      });

    } catch (err) {
      console.error('Compare error:', err);
      res.status(500).json({ error: 'Karşılaştırma analizi oluşturulamadı.' });
    }
  }
);

// ─── ANALİZ SİL (sadece admin) ────────────────────────────────────────────
router.delete('/:id', authenticate, [param('id').isUUID()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçersiz ID.' });

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bu işlem için admin yetkisi gerekli.' });
  }

  const row = db.prepare('SELECT id FROM analyses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Analiz bulunamadı.' });

  db.prepare('DELETE FROM analyses WHERE id = ?').run(req.params.id);
  res.json({ message: 'Analiz silindi.' });
});

module.exports = router;
