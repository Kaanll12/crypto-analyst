// automation/emailDigest.js — Haftalık E-posta Özeti
// Nodemailer kuruluysa SMTP ile, değilse SendGrid/Mailgun REST API ile çalışır
'use strict';

const db = require('../config/database');

// ─── YARDIMCI: Fiyatları CoinGecko'dan çek ───────────────────────────────
async function fetchTopPrices() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple&vs_currencies=usd&include_24hr_change=true'
    );
    if (!res.ok) return {};
    return await res.json();
  } catch (_) {
    return {};
  }
}

// ─── Haftalık özet istatistiklerini topla ────────────────────────────────
function collectWeeklyStats() {
  try {
    const totalAnalyses = db.prepare(`
      SELECT COUNT(*) as n FROM analyses
      WHERE created_at >= datetime('now', '-7 days')
    `).get().n;

    const topCoins = db.prepare(`
      SELECT coin_sym, coin_name, COUNT(*) as cnt,
             AVG(confidence) as avg_conf,
             SUM(CASE WHEN signal='bullish' THEN 1 ELSE 0 END) as bullish_ct,
             SUM(CASE WHEN signal='bearish' THEN 1 ELSE 0 END) as bearish_ct,
             SUM(CASE WHEN signal='neutral' THEN 1 ELSE 0 END) as neutral_ct
      FROM analyses
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY coin_sym
      ORDER BY cnt DESC
      LIMIT 5
    `).all();

    const totalUsers = db.prepare('SELECT COUNT(*) as n FROM users WHERE is_active = 1').get().n;

    const newUsers = db.prepare(`
      SELECT COUNT(*) as n FROM users
      WHERE created_at >= datetime('now', '-7 days')
    `).get().n;

    return { totalAnalyses, topCoins, totalUsers, newUsers };
  } catch (e) {
    console.error('Weekly stats error:', e.message);
    return { totalAnalyses: 0, topCoins: [], totalUsers: 0, newUsers: 0 };
  }
}

// ─── HTML E-posta Şablonu ────────────────────────────────────────────────
function buildEmailHtml(username, stats, prices) {
  const { totalAnalyses, topCoins, totalUsers, newUsers } = stats;
  const weekStr = new Date().toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' });

  function priceRow(id, label) {
    const p = prices[id];
    if (!p) return '';
    const change = p.usd_24h_change || 0;
    const changeColor = change >= 0 ? '#00c07f' : '#ff5555';
    const changeStr = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1e2440;font-weight:600">${label}</td>
        <td style="padding:10px 0;border-bottom:1px solid #1e2440;font-family:monospace;text-align:right">
          $${p.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #1e2440;color:${changeColor};font-weight:700;text-align:right">
          ${changeStr}
        </td>
      </tr>`;
  }

  function signalBar(bullish, bearish, neutral) {
    const total = bullish + bearish + neutral || 1;
    return `
      <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin:4px 0">
        <div style="width:${(bullish/total*100).toFixed(0)}%;background:#00c07f"></div>
        <div style="width:${(bearish/total*100).toFixed(0)}%;background:#ff5555"></div>
        <div style="width:${(neutral/total*100).toFixed(0)}%;background:#f0b90b"></div>
      </div>`;
  }

  const coinRows = topCoins.map(c => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #1e2440;font-weight:600">${c.coin_name} (${c.coin_sym})</td>
      <td style="padding:10px 0;border-bottom:1px solid #1e2440;text-align:center">${c.cnt}</td>
      <td style="padding:10px 0;border-bottom:1px solid #1e2440">
        ${signalBar(c.bullish_ct, c.bearish_ct, c.neutral_ct)}
        <div style="font-size:11px;color:#8899aa">
          🟢${c.bullish_ct} 🔴${c.bearish_ct} 🟡${c.neutral_ct}
        </div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #1e2440;text-align:right;font-family:monospace">
        ${Math.round(c.avg_conf)}%
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CryptoAnalyst Haftalık Özet</title>
</head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#e0e6f0">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a">
  <tr><td align="center" style="padding:32px 16px">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

      <!-- HEADER -->
      <tr><td style="background:linear-gradient(135deg,#0f1c3a,#1a56db22);border-radius:16px 16px 0 0;padding:32px;text-align:center;border:1px solid #1e2440;border-bottom:none">
        <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="background:#1A56DB;width:40px;height:40px;border-radius:10px;display:inline-block;line-height:40px;text-align:center;font-weight:800;color:#fff;font-size:14px">CA</div>
          <span style="font-size:20px;font-weight:800">crypto<strong>analyst</strong></span>
        </div>
        <h1 style="margin:0;font-size:24px;font-weight:800">Haftalık Kripto Özeti</h1>
        <p style="margin:8px 0 0;color:#8899aa;font-size:14px">${weekStr} haftası • Merhaba ${username}!</p>
      </td></tr>

      <!-- BODY -->
      <tr><td style="background:#0d1525;border:1px solid #1e2440;border-top:none;border-bottom:none;padding:28px">

        <!-- STATS -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
          <tr>
            <td align="center" style="padding:0 8px 0 0">
              <div style="background:#101928;border:1px solid #1e2440;border-radius:12px;padding:20px;text-align:center">
                <div style="font-size:32px;font-weight:800;color:#1A56DB">${totalAnalyses}</div>
                <div style="font-size:13px;color:#8899aa;margin-top:4px">Haftalık Analiz</div>
              </div>
            </td>
            <td align="center" style="padding:0 4px">
              <div style="background:#101928;border:1px solid #1e2440;border-radius:12px;padding:20px;text-align:center">
                <div style="font-size:32px;font-weight:800;color:#00c07f">${totalUsers}</div>
                <div style="font-size:13px;color:#8899aa;margin-top:4px">Aktif Kullanıcı</div>
              </div>
            </td>
            <td align="center" style="padding:0 0 0 8px">
              <div style="background:#101928;border:1px solid #1e2440;border-radius:12px;padding:20px;text-align:center">
                <div style="font-size:32px;font-weight:800;color:#f0b90b">+${newUsers}</div>
                <div style="font-size:13px;color:#8899aa;margin-top:4px">Yeni Üye</div>
              </div>
            </td>
          </tr>
        </table>

        <!-- MARKET PRICES -->
        <h2 style="font-size:16px;margin:0 0 12px;color:#8899aa;text-transform:uppercase;letter-spacing:.05em">Piyasa Fiyatları</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
          <thead>
            <tr>
              <th style="text-align:left;color:#4a5270;font-size:12px;font-weight:500;padding-bottom:8px">COIN</th>
              <th style="text-align:right;color:#4a5270;font-size:12px;font-weight:500;padding-bottom:8px">FİYAT</th>
              <th style="text-align:right;color:#4a5270;font-size:12px;font-weight:500;padding-bottom:8px">24s DEĞİŞİM</th>
            </tr>
          </thead>
          <tbody>
            ${priceRow('bitcoin', 'Bitcoin (BTC)')}
            ${priceRow('ethereum', 'Ethereum (ETH)')}
            ${priceRow('solana', 'Solana (SOL)')}
            ${priceRow('binancecoin', 'BNB')}
            ${priceRow('ripple', 'XRP')}
          </tbody>
        </table>

        <!-- TOP COINS -->
        ${topCoins.length > 0 ? `
        <h2 style="font-size:16px;margin:0 0 12px;color:#8899aa;text-transform:uppercase;letter-spacing:.05em">En Çok Analiz Edilen</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
          <thead>
            <tr>
              <th style="text-align:left;color:#4a5270;font-size:12px;font-weight:500;padding-bottom:8px">COIN</th>
              <th style="text-align:center;color:#4a5270;font-size:12px;font-weight:500;padding-bottom:8px">ANALİZ</th>
              <th style="text-align:left;color:#4a5270;font-size:12px;font-weight:500;padding-bottom:8px">SİNYAL DAĞILIMI</th>
              <th style="text-align:right;color:#4a5270;font-size:12px;font-weight:500;padding-bottom:8px">ORTALAMA GÜVEN</th>
            </tr>
          </thead>
          <tbody>${coinRows}</tbody>
        </table>` : ''}

        <!-- CTA -->
        <div style="text-align:center;margin:28px 0 0;padding:24px;background:#101928;border:1px solid #1A56DB33;border-radius:12px">
          <p style="margin:0 0 16px;font-size:15px;color:#c0c8d8">Haftalık analiz özeti hazır. Hemen platforma gir ve yeni analizler oluştur!</p>
          <a href="https://crypto-analyst.app" style="display:inline-block;background:#1A56DB;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px">
            📊 Platforma Git →
          </a>
        </div>

      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#080c17;border:1px solid #1e2440;border-top:none;border-radius:0 0 16px 16px;padding:20px;text-align:center">
        <p style="margin:0 0 8px;color:#4a5270;font-size:12px">
          Bu e-posta CryptoAnalyst haftalık özet bültenidir.
        </p>
        <p style="margin:0;color:#4a5270;font-size:12px">
          <a href="https://crypto-analyst.app/legal/unsubscribe.html" style="color:#1A56DB;text-decoration:none">Abonelikten çık</a>
          &nbsp;·&nbsp;
          <a href="https://crypto-analyst.app" style="color:#1A56DB;text-decoration:none">cryptoanalyst.app</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── E-posta Gönderici ───────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  // 1) Nodemailer (kuruluysa)
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || `"CryptoAnalyst" <noreply@crypto-analyst.app>`,
      to,
      subject,
      html,
    });
    return { ok: true, method: 'nodemailer' };
  } catch (e) {
    if (!e.message?.includes('Cannot find module')) throw e;
  }

  // 2) SendGrid REST API (SENDGRID_API_KEY varsa)
  if (process.env.SENDGRID_API_KEY) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from:    { email: process.env.SMTP_FROM || 'noreply@crypto-analyst.app', name: 'CryptoAnalyst' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    if (res.ok || res.status === 202) return { ok: true, method: 'sendgrid' };
    const err = await res.text();
    throw new Error(`SendGrid error: ${err}`);
  }

  // 3) Fallback: log-only
  console.log(`[EmailDigest] SMTP/SendGrid yapılandırılmamış. E-posta loglandı: to=${to} subject="${subject}"`);
  return { ok: true, method: 'log-only' };
}

// ─── HAFTALIK ÖZET GÖNDER ────────────────────────────────────────────────
async function sendWeeklyDigest() {
  console.log(`📧 [${new Date().toLocaleString('tr-TR')}] Haftalık e-posta özeti başlatıldı`);

  const stats  = collectWeeklyStats();
  const prices = await fetchTopPrices();

  // Tüm aktif kullanıcılara gönder
  const users = db.prepare('SELECT id, email, username FROM users WHERE is_active = 1').all();

  let sent = 0, failed = 0;
  for (const user of users) {
    if (!user.email) continue;
    try {
      const html = buildEmailHtml(user.username || 'Kullanıcı', stats, prices);
      const result = await sendEmail(
        user.email,
        `📊 Haftalık Kripto Özeti — ${new Date().toLocaleDateString('tr-TR', { day:'numeric', month:'long' })}`,
        html
      );
      sent++;
      if (sent <= 3) console.log(`✅ Email gönderildi [${result.method}]: ${user.email}`);
    } catch (err) {
      failed++;
      console.error(`❌ Email hatası (${user.email}):`, err.message);
    }
  }

  console.log(`📧 Haftalık özet tamamlandı: ${sent} gönderildi, ${failed} başarısız`);
  return { sent, failed };
}

module.exports = { sendWeeklyDigest, buildEmailHtml, sendEmail, collectWeeklyStats };
