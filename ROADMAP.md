# 🗺️ Crypto Analyst — Geliştirme Yol Haritası

> Son güncelleme: 13 Nisan 2026 | Bakım + Özellik turu #1 tamamlandı

---

## ✅ TAMAMLANDI — Bugün (13 Nisan 2026)

### 🛠️ Bakım & Bug Düzeltmeleri
- [x] BUG-1: `/api/reports/today` endpoint eklendi (route çakışması giderildi)
- [x] BUG-2: `apiFetch` çift tanımlama sorunu (`_apiFetchDefined` sentinel ile)
- [x] BUG-3: Sentiment etiket uyumsuzluğu düzeltildi (`bullish/bearish` → `positive/negative`)
- [x] BUG-4: Paddle webhook güvenlik açığı kapatıldı (secret yoksa 401 döner)
- [x] BUG-5: CSP devre dışıydı — production-safe CSP direktifleri eklendi
- [x] `utils.js` oluşturuldu — `toast`, `escHtml`, `fmtUsd`, `formatMarkdown`, `relativeTime` merkezileştirildi
- [x] Tüm sayfalar `utils.js`'i yükleyecek şekilde güncellendi

### 🌐 SEO Optimizasyonu
- [x] Tüm sayfalara Open Graph + Twitter Card meta etiketleri eklendi
- [x] JSON-LD yapılandırılmış veri (WebApplication schema)
- [x] `sitemap.xml` oluşturuldu
- [x] `robots.txt` oluşturuldu
- [x] Canonical URL'ler eklendi

### 📱 PWA Desteği
- [x] `manifest.json` oluşturuldu (shortcuts, icons, theme_color)
- [x] `sw.js` Service Worker (Cache-First + Network-First + Push)
- [x] PWA ikonları: `icons/icon-192.png`, `icons/icon-512.png`
- [x] Desktop screenshot eklendi (`screenshots/desktop.png`)
- [x] SW kaydı `index.html`'e eklendi

### 🔔 Push Bildirimleri
- [x] `frontend/js/notifications.js` (VAPID abonelik yönetimi)
- [x] `backend/routes/notifications.js` (VAPID keygen, subscribe/unsubscribe/test)
- [x] DB: `push_subscriptions` + `settings` tabloları eklendi
- [x] `sendPushToUser()` + `sendPushToAll()` helper'ları (scheduler entegrasyonu için)
- [x] Bildirim toggle butonu index.html'de mevcut

### 🔀 Coin Karşılaştırma
- [x] `frontend/compare.html` — yan yana karşılaştırma arayüzü
- [x] `frontend/js/compare.js` — CoinGecko fiyat çekimi + render
- [x] `backend/routes/analysis.js` `/compare` endpoint'i (paralel AI analiz + karar özeti)
- [x] URL parametresi desteği: `?coin1=bitcoin&coin2=ethereum`

### 🎴 Paylaşım Kartları (Twitter/X)
- [x] `frontend/js/sharecard.js` — html2canvas tabanlı PNG oluşturucu
- [x] Twitter intent URL ile doğrudan paylaşım
- [x] Native Share API desteği (mobil)
- [x] Analiz paneline 🎴 buton eklendi
- [x] `analysisLoaded` event tetikleniyor

### 📧 Haftalık E-posta Özeti
- [x] `backend/automation/emailDigest.js` — HTML e-posta şablonu + gönderici
- [x] Nodemailer → SendGrid → log-only fallback zinciri
- [x] `backend/routes/email.js` — admin panel endpointleri (`/digest/send`, `/preview`, `/test`)
- [x] Scheduler: Her Pazartesi 08:00 TR saatinde otomatik gönderim

---

## 📋 YARIN İÇİN PLAN (14 Nisan 2026)

### 🎯 Öncelik 1: Admin Paneli

**Hedef:** Backend yönetimi için minimal bir admin arayüzü  
**Tahmini süre:** 3-4 saat  
**Dosyalar:**
- `frontend/admin.html` — özet dashboard
- `frontend/js/admin.js` — kullanıcı listesi, analiz istatistikleri
- `backend/routes/admin.js` — `/api/admin/stats`, `/api/admin/users`, `/api/admin/push-test`

**İçerik:**
- Kullanıcı listesi (rol yönetimi: user → vip)
- Haftalık özet önizleme + manuel gönderme butonu
- Push bildirim test arayüzü
- API log görüntüleyici (son 100 istek)

---

### 🎯 Öncelik 2: Fiyat Alarm Sistemi — Push Entegrasyonu

**Hedef:** Alarm tetiklendiğinde push bildirimi gönder  
**Tahmini süre:** 1.5 saat  
**Dosyalar:**
- `backend/automation/scheduler.js` — 5 dakikada bir fiyat kontrol cronjob
- `backend/routes/alerts.js` — alarm tetiklenince `sendPushToUser()` çağır

**İçerik:**
- `/api/alerts` rotası var ama scheduler entegrasyonu eksik
- Tetiklenen alarm için: `🔔 BTC $95,000 hedefine ulaştı!` push bildirimi

---

### 🎯 Öncelik 3: Analiz Geçmişi — Gelişmiş Filtre

**Hedef:** `history.html`'e arama ve filtre ekle  
**Tahmini süre:** 1.5 saat  
**Dosyalar:**
- `frontend/history.html` — filtre arayüzü
- `frontend/js/history.js` — tarih aralığı + sinyal filtresi
- `backend/routes/analysis.js` — `/api/analyses?signal=bullish&from=2026-04-01`

**İçerik:**
- Coin, sinyal (bullish/bearish/neutral) ve tarih aralığı filtresi
- Sonuçları CSV olarak indir
- Analiz dışa aktarma (PDF / PNG)

---

### 🎯 Öncelik 4: Portföy Geliştirme

**Hedef:** Portföy sayfasına grafik + P&L özeti ekle  
**Tahmini süre:** 2 saat  
**Dosyalar:**
- `frontend/portfolio.html` — chart alanı
- `frontend/js/portfolio.js` — Chart.js pie/bar entegrasyonu (CDN)

**İçerik:**
- Portföy dağılımı pie chart (coin bazında)
- Toplam kar/zarar özeti (TL + USD)
- En iyi/kötü performanslı coin vurgusu

---

### 🎯 Öncelik 5: Production Hazırlık

**Hedef:** Deploy öncesi kontrol listesi  
**Tahmini süre:** 1 saat  

**TODO Listesi:**
- [ ] `.env.example` dosyası oluştur (tüm değişkenler dokümante edilsin)
- [ ] `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` ayarları test et
- [ ] `VAPID_PUBLIC_KEY` ve `VAPID_PRIVATE_KEY` `.env`'e ekle
- [ ] `npm audit` çalıştır (güvenlik açıkları)
- [ ] Rate limiter ayarlarını production için sıkılaştır
- [ ] Error monitoring (Sentry veya benzeri) entegre et
- [ ] Health check endpoint'ini genişlet (`/api/health` → DB durumu da içersin)
- [ ] HTTPS yönlendirme + HSTS header

---

## 🔮 GELECEK HAFTA (Uzun Vadeli)

| Özellik | Açıklama | Öncelik |
|---------|----------|---------|
| 🌍 Çoklu dil | İngilizce destek | Yüksek |
| 📊 TradingView widget | Gerçek zamanlı grafik embed | Yüksek |
| 🤖 AI Chatbot | Coin hakkında soru-cevap | Orta |
| 📲 Mobil uygulama | React Native veya PWA to APK | Orta |
| 🏆 Leaderboard | En doğru tahminleri yapan kullanıcılar | Düşük |
| 🔗 Sosyal paylaşım | Portföy kartı Twitter paylaşımı | Düşük |
| 💼 Kurumsal plan | API erişimi, webhook, white-label | Uzun vadeli |

---

## 🗂️ Dosya Haritası (Güncel)

```
crypto-analyst/
├── backend/
│   ├── automation/
│   │   ├── dailyReport.js       ✅
│   │   ├── emailDigest.js       ✅ YENİ
│   │   └── scheduler.js         ✅ güncellendi
│   ├── config/
│   │   └── database.js          ✅ push_subscriptions + settings tabloları
│   ├── middleware/
│   │   ├── auth.js              ✅
│   │   └── security.js          ✅ CSP düzeltildi
│   ├── routes/
│   │   ├── alerts.js            ✅ (push entegrasyonu YARIN)
│   │   ├── analysis.js          ✅ /compare eklendi
│   │   ├── auth.js              ✅
│   │   ├── email.js             ✅ YENİ
│   │   ├── news.js              ✅
│   │   ├── notifications.js     ✅ YENİ
│   │   ├── payments.js          ✅ webhook güvenliği
│   │   ├── portfolio.js         ✅
│   │   └── reports.js           ✅ /today eklendi
│   └── server.js                ✅ tüm rotalar kayıtlı
│
└── frontend/
    ├── css/
    │   └── style.css            ✅
    ├── icons/
    │   ├── icon-192.png         ✅ YENİ
    │   └── icon-512.png         ✅ YENİ
    ├── js/
    │   ├── api.js               ✅ _apiFetchDefined flag
    │   ├── app.js               ✅ sentiment fix + shareCard event
    │   ├── auth.js              ✅ conditional apiFetch
    │   ├── compare.js           ✅ YENİ
    │   ├── history.js           ✅ utils.js refactor
    │   ├── news.js              ✅ utils.js refactor
    │   ├── notifications.js     ✅ YENİ
    │   ├── payments.js          ✅
    │   ├── portfolio.js         ✅ utils.js refactor
    │   ├── sharecard.js         ✅ YENİ
    │   └── utils.js             ✅ YENİ
    ├── screenshots/
    │   └── desktop.png          ✅ YENİ
    ├── compare.html             ✅ YENİ
    ├── history.html             ✅
    ├── index.html               ✅ SEO + PWA + share btn
    ├── manifest.json            ✅ YENİ
    ├── news.html                ✅
    ├── portfolio.html           ✅
    ├── robots.txt               ✅ YENİ
    ├── sitemap.xml              ✅ YENİ
    └── sw.js                    ✅ YENİ (Service Worker)
```

---

## ⚙️ Ortam Değişkenleri (Tümü)

```env
# Gerekli
ANTHROPIC_API_KEY=...
JWT_SECRET=...
NODE_ENV=production
PORT=3001

# Ödeme (Paddle)
PADDLE_WEBHOOK_SECRET=...

# Push Bildirimleri (otomatik oluşturulur, opsiyonel override)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...

# E-posta (birini seç)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="CryptoAnalyst <noreply@crypto-analyst.app>"
# VEYA:
SENDGRID_API_KEY=...

# Zamanlayıcılar (opsiyonel, varsayılanlar)
DAILY_REPORT_CRON=0 9 * * *
WEEKLY_DIGEST_CRON=0 8 * * 1

# Frontend yolu (opsiyonel)
FRONTEND_PATH=../frontend
```

---

*CryptoAnalyst geliştirme oturumu — her gün daha iyi! 🚀*
