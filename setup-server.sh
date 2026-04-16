#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CryptoAnalyst — DigitalOcean Ubuntu 22.04 Kurulum Script'i
# Kullanım: bash setup-server.sh
# ═══════════════════════════════════════════════════════════════

set -e
echo "🚀 CryptoAnalyst sunucu kurulumu başlıyor..."

# ── 1. Sistem güncellemesi ────────────────────────────────────
echo "📦 Sistem güncelleniyor..."
apt-get update -q && apt-get upgrade -y -q

# ── 2. Temel araçlar ─────────────────────────────────────────
apt-get install -y -q curl git ufw nginx certbot python3-certbot-nginx

# ── 3. Node.js 20 LTS ────────────────────────────────────────
echo "⬢  Node.js 20 kuruluyor..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "✅ Node: $(node -v) | npm: $(npm -v)"

# ── 4. PM2 ───────────────────────────────────────────────────
echo "⚙️  PM2 kuruluyor..."
npm install -g pm2

# ── 5. GitHub'dan repo clone ─────────────────────────────────
echo "📥 Repo clone ediliyor..."
cd /var/www
git clone https://github.com/Kaanll12/crypto-analyst.git
cd crypto-analyst

# ── 6. Backend bağımlılıkları ─────────────────────────────────
echo "📦 npm install..."
cd backend
npm install --production
cd ..

# ── 7. .env dosyası oluştur ───────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  .env dosyası oluşturuluyor — API key'lerini sonra gir"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat > backend/.env << 'ENVEOF'
NODE_ENV=production
PORT=3001

# Anthropic API Key (zorunlu)
ANTHROPIC_API_KEY=BURAYA_YAZ

# JWT Secret (rastgele uzun bir şifre yaz)
JWT_SECRET=BURAYA_COK_UZUN_RASTGELE_BIR_SIFRE_YAZ

# Domain (SSL sonrası güncelle)
FRONTEND_URL=https://crypto-analyst.app

# E-posta (opsiyonel - şifre sıfırlama için)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=CryptoAnalyst <noreply@crypto-analyst.app>

# Paddle Ödeme (opsiyonel)
PADDLE_WEBHOOK_SECRET=

# Push bildirimleri (otomatik oluşturulur)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
ENVEOF

echo "✅ .env oluşturuldu: /var/www/crypto-analyst/backend/.env"

# ── 8. PM2 ile başlat ─────────────────────────────────────────
echo "▶️  Uygulama başlatılıyor..."
cd /var/www/crypto-analyst
pm2 start backend/server.js --name crypto-analyst --cwd /var/www/crypto-analyst/backend
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

# ── 9. Nginx reverse proxy ────────────────────────────────────
echo "🌐 Nginx yapılandırılıyor..."
cat > /etc/nginx/sites-available/crypto-analyst << 'NGINXEOF'
server {
    listen 80;
    server_name crypto-analyst.app www.crypto-analyst.app;

    # Gzip sıkıştırma
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/crypto-analyst /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 10. Firewall ─────────────────────────────────────────────
echo "🔒 Firewall ayarlanıyor..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ KURULUM TAMAMLANDI!"
echo ""
echo "📝 Sonraki adımlar:"
echo "  1. API key'lerini gir:  nano /var/www/crypto-analyst/backend/.env"
echo "  2. Uygulamayı yeniden başlat:  pm2 restart crypto-analyst"
echo "  3. DNS yayıldıktan sonra SSL kur:"
echo "     certbot --nginx -d crypto-analyst.app -d www.crypto-analyst.app"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
