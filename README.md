# 🚀 Crypto Analyst

AI destekli günlük kripto analiz platformu. Her gün saat **09:00**'da otomatik olarak coin analizleri ve site raporu oluşturur.

---

## 📁 Proje Yapısı

```
crypto-analyst/
├── backend/
│   ├── server.js              ← Ana giriş noktası
│   ├── config/database.js     ← SQLite + tablolar
│   ├── middleware/
│   │   ├── auth.js            ← JWT doğrulama
│   │   └── security.js        ← Helmet, CORS, Rate Limit
│   ├── routes/
│   │   ├── auth.js            ← Kayıt / Giriş
│   │   ├── analysis.js        ← AI analiz CRUD
│   │   └── reports.js         ← Günlük raporlar
│   └── automation/
│       ├── scheduler.js       ← Cron (09:00 tetikleyici)
│       └── dailyReport.js     ← Günlük rapor motoru
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── api.js             ← Backend bağlantısı
│       ├── auth.js            ← Giriş / Kayıt
│       └── app.js             ← Ana uygulama
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## ⚙️ Kurulum (Lokal)

### 1. Gereksinimler
- Node.js 20+
- npm

### 2. Ortam değişkenleri
```bash
cd backend
cp .env.example .env
# .env dosyasını düzenle:
#   JWT_SECRET=en_az_64_karakter_gizli_anahtar
#   ANTHROPIC_API_KEY=sk-ant-xxxxx
#   ALLOWED_ORIGIN=http://localhost:3000
```

### 3. Backend kur ve başlat
```bash
cd backend
npm install
npm run dev
```

### 4. Frontend
Frontend saf HTML/CSS/JS olduğu için sadece `frontend/index.html` dosyasını aç.  
Canlı sunucuda nginx üzerinden serve edilir.

---

## 🐳 Canlıya Alma (Docker)

```bash
# 1. .env dosyasını oluştur
cp backend/.env.example .env
# JWT_SECRET, ANTHROPIC_API_KEY, ALLOWED_ORIGIN doldur

# 2. SSL sertifikası al (Let's Encrypt)
mkdir ssl
certbot certonly --standalone -d senindomain.com
cp /etc/letsencrypt/live/senindomain.com/fullchain.pem ssl/
cp /etc/letsencrypt/live/senindomain.com/privkey.pem ssl/

# 3. nginx.conf içindeki domain adını güncelle
# 4. Başlat
docker-compose up -d
```

---

## 🔐 Güvenlik Özellikleri

| Katman | Koruma |
|--------|--------|
| Helmet | 15+ güvenlik HTTP başlığı |
| CORS | Sadece tanımlı origin |
| Rate Limit | 100 istek/15 dk (genel), 10/15 dk (auth), 20/saat (analiz) |
| JWT | 7 günlük token, sunucu doğrulama |
| Bcrypt | 12 round password hash |
| Validator | Tüm inputlar doğrulanır ve temizlenir |
| XSS | Script injection temizleyici middleware |
| Payload Limit | Max 10KB body (DoS koruması) |
| Nginx | HSTS, X-Frame, bot engelleme |
| Docker | Root olmayan kullanıcı (non-root) |

---

## ⏰ Otomasyon

Sunucu başladığında `node-cron` otomatik devreye girer.

| Görev | Zaman | Açıklama |
|-------|-------|----------|
| Günlük Rapor | Her gün 09:00 | Coin fiyatları + AI raporu + site metrikleri |
| Log Temizliği | Her Pazar 02:00 | 90 günden eski API logları silinir |

Raporu elle tetiklemek için (admin hesabıyla):
```
POST /api/reports/generate
Authorization: Bearer <admin_token>
```

---

## 📡 API Endpointleri

### Auth
```
POST /api/auth/register     → Kayıt
POST /api/auth/login        → Giriş
GET  /api/auth/me           → Profil (auth)
PUT  /api/auth/change-password → Şifre değiştir (auth)
```

### Analizler
```
GET  /api/analyses           → Tüm analizler (sayfalı)
GET  /api/analyses/:id       → Tek analiz
POST /api/analyses/generate  → AI analiz oluştur (auth)
GET  /api/analyses/stats/summary → İstatistikler
DELETE /api/analyses/:id     → Sil (admin)
```

### Raporlar
```
GET  /api/reports            → Son 30 rapor
GET  /api/reports/:date      → Belirli tarih (YYYY-MM-DD)
POST /api/reports/generate   → Elle oluştur (admin)
```

### Sistem
```
GET  /api/health             → Sunucu durumu
```

---

## 🔧 Sık Kullanılan Komutlar

```bash
# Logları izle
docker-compose logs -f backend

# Veritabanına bak (SQLite)
sqlite3 backend/data/crypto_analyst.db
.tables
SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT 5;

# Günlük raporu hemen çalıştır
curl -X POST http://localhost:3001/api/reports/generate \
  -H "Authorization: Bearer <admin_token>"

# Nginx reload (config değişikliğinde)
docker-compose exec nginx nginx -s reload
```

---

## 🌐 Sonraki Adımlar

- [ ] E-posta bildirimleri (nodemailer)
- [ ] Kullanıcı yorum sistemi
- [ ] Fiyat alarm sistemi
- [ ] PWA (offline destek)
- [ ] Admin paneli

---

**Her gün 09:00'da otomatik güncellenir. ⏰**
