// routes/news.js
const express   = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { body, validationResult } = require('express-validator');
const { optionalAuth } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const router    = express.Router();

const NEWS_SOURCES = [
  { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss'                   },
  { name: 'Decrypt',       url: 'https://decrypt.co/feed'                         },
];

// ─── RATE LIMIT: AI yorum endpoint'i için ayrı limit ─────────────────────
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 30,                   // 15 dakikada en fazla 30 yorum isteği
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla yorum isteği gönderildi. 15 dakika bekleyin.' },
});

// ─── ÖNBELLEK ─────────────────────────────────────────────────────────────
const commentaryCache = new Map();
const CACHE_TTL_MS    = 6 * 60 * 60 * 1000; // 6 saat
const MAX_CACHE_SIZE  = 500;

function cacheKey(title) {
  return title.slice(0, 80).toLowerCase().replace(/\s+/g, '_');
}

function cacheSet(key, value) {
  if (commentaryCache.size >= MAX_CACHE_SIZE) {
    // En eski girdiyi sil
    commentaryCache.delete(commentaryCache.keys().next().value);
  }
  commentaryCache.set(key, { commentary: value, ts: Date.now() });
}

function cacheGet(key) {
  const entry = commentaryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    commentaryCache.delete(key);
    return null;
  }
  return entry.commentary;
}

// ─── RSS PARSER ───────────────────────────────────────────────────────────
function parseRSS(xml, source) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`
      ));
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const title = get('title');
    const link  = get('link') || block.match(/<link>\s*(.*?)\s*<\/link>/)?.[1] || '';
    const pub   = get('pubDate');
    const desc  = get('description').replace(/<[^>]+>/g, '').slice(0, 300);
    if (title && link) items.push({ title, link, description: desc, pubDate: pub, source: source.name });
  }
  return items;
}

// ─── HABER ÇEK (ortak yardımcı) ──────────────────────────────────────────
async function fetchAllNews() {
  const results = await Promise.allSettled(
    NEWS_SOURCES.map(async (src) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000); // timeout kaydedildi
      try {
        const r = await fetch(src.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'CryptoAnalyst/1.0' },
        });
        clearTimeout(timer); // ✅ timeout temizleniyor
        if (!r.ok) return [];
        return parseRSS(await r.text(), src);
      } catch {
        clearTimeout(timer); // ✅ hata durumunda da temizleniyor
        return [];
      }
    })
  );
  return results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
}

function filterByCoin(items, coin) {
  if (!coin) return items;
  const keywords = {
    bitcoin:     ['bitcoin','btc'],
    ethereum:    ['ethereum','eth','ether'],
    solana:      ['solana','sol'],
    binancecoin: ['bnb','binance'],
    ripple:      ['ripple','xrp'],
    cardano:     ['cardano','ada'],
  };
  const kws = keywords[coin.toLowerCase()] || [coin.toLowerCase()];
  return items.filter(i =>
    kws.some(k => i.title.toLowerCase().includes(k) || i.description.toLowerCase().includes(k))
  );
}

function dedup(items) {
  const seen = new Set();
  return items.filter(n => {
    const key = n.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// ─── GET /api/news ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const coin  = req.query.coin;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  try {
    let allNews = await fetchAllNews();
    allNews.sort((a, b) => (new Date(b.pubDate)||0) - (new Date(a.pubDate)||0));
    if (coin) allNews = filterByCoin(allNews, coin);
    allNews = dedup(allNews);

    const data = allNews.slice(0, limit).map(n => {
      const cached = cacheGet(cacheKey(n.title));
      return { ...n, commentary: cached || null };
    });

    res.json({ data, total: allNews.length, sources: NEWS_SOURCES.map(s => s.name) });
  } catch (err) {
    console.error('News fetch error:', err);
    res.status(500).json({ error: 'Haberler alınamadı.' });
  }
});

// ─── GET /api/news/digest ──────────────────────────────────────────────────
router.get('/digest', async (req, res) => {
  const todayKey = 'digest_' + new Date().toISOString().split('T')[0];
  const cached   = cacheGet(todayKey);
  if (cached) return res.json({ digest: cached, cached: true });

  try {
    let allNews = await fetchAllNews();
    allNews.sort((a, b) => (new Date(b.pubDate)||0) - (new Date(a.pubDate)||0));
    allNews = dedup(allNews);

    const top5 = allNews.slice(0, 5);
    if (!top5.length) return res.status(503).json({ error: 'Haber verisi alınamadı.' });

    const client    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const newsBlock = top5.map((n, i) =>
      `${i + 1}. [${n.source}] ${n.title}\n   ${n.description || ''}`
    ).join('\n\n');

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Kripto para uzmanı olarak bugünün en önemli 5 haberini aşağıda buluyorsun. Bunları Türkçe olarak bütünleştiren kısa bir günlük özet yaz.

HABERLER:
${newsBlock}

FORMAT:
## 🗞️ Günün Kripto Özeti
(2-3 cümle genel değerlendirme)

## 📌 Öne Çıkanlar
(Her haber için 1 satır Türkçe özet, önemi neden yüksek)

## 🔮 Bugün Dikkat Et
(Yatırımcı için en kritik 1-2 nokta)

Türkçe, profesyonel ve özlü yaz.`,
      }],
    });

    const digest = message.content[0].text;
    cacheSet(todayKey, digest);

    res.json({
      digest,
      headlines: top5.map(n => ({ title: n.title, source: n.source })),
      cached: false,
    });
  } catch (err) {
    console.error('Digest error:', err.message);
    res.status(500).json({ error: 'Günlük özet oluşturulamadı.' });
  }
});

// ─── POST /api/news/analyze ───────────────────────────────────────────────
router.post('/analyze',
  optionalAuth,
  analyzeLimiter, // ✅ rate limit eklendi
  [
    body('title').isString().isLength({ min: 5, max: 500 }).trim(),
    body('description').optional().isString().isLength({ max: 1000 }).trim(),
    body('source').optional().isString().isLength({ max: 100 }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Geçersiz haber verisi.' });

    const { title, description = '', source = '' } = req.body;

    // Önbellek kontrolü
    const key    = cacheKey(title);
    const cached = cacheGet(key);
    if (cached) return res.json({ commentary: cached, cached: true });

    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Kripto para alanında uzman bir analistsin. Aşağıdaki İngilizce kripto haberini oku ve Türkçe yorum yap.

HABER BAŞLIĞI: ${title}
KAYNAK: ${source || 'Bilinmiyor'}
ÖZET: ${description || '(Özet yok)'}

Lütfen şu formatta yanıt ver:

## 📰 HABER ÖZETİ
(Haberi 1-2 cümleyle Türkçeye çevir ve özetle)

## 💡 PİYASA ETKİSİ
(Bu haberin kripto piyasasına olası etkisi — kısa ve net, 2-3 cümle)

## 🎯 YATIRIMCI İÇİN
(Yatırımcı bu haberi nasıl değerlendirmeli? 1-2 cümle)

⚡ ÖNEM SEVİYESİ: [Düşük / Orta / Yüksek / Kritik]

Türkçe yaz. Kısa ve öz ol. Spekülatif abartılardan kaçın.`,
        }],
      });

      const commentary = message.content[0].text;
      cacheSet(key, commentary);

      res.json({ commentary, cached: false });
    } catch (err) {
      console.error('News analyze error:', err.message);
      res.status(500).json({ error: 'Yorum oluşturulamadı. Lütfen tekrar deneyin.' });
    }
  }
);

module.exports = router;
