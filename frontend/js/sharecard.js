// js/sharecard.js — Twitter/X Paylaşım Kartı Oluşturucu
// html2canvas ile analiz kartını PNG'ye çevirir ve indirir/paylaşır
'use strict';

(function() {

// ─── html2canvas yükle (lazy) ────────────────────────────────────────────
function loadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) return resolve(window.html2canvas);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload  = () => resolve(window.html2canvas);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ─── Paylaşım Kartı DOM Oluştur ──────────────────────────────────────────
function buildShareCardEl(data) {
  const {
    coinName, coinSym, priceUsd, change24h,
    signal, confidence, content, date,
  } = data;

  const sym     = (coinSym || '').toUpperCase();
  const color   = (window.COIN_COLORS  || {})[sym] || '#8899cc';
  const avatar  = (window.COIN_AVATARS || {})[sym] || sym.charAt(0);
  const change  = parseFloat(change24h) || 0;
  const changeStr = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
  const changeColor = change >= 0 ? '#00c07f' : '#ff5555';

  const signalLabel = { bullish: '🟢 Yükseliş', bearish: '🔴 Düşüş', neutral: '🟡 Nötr' }[signal] || signal;
  const signalBg    = { bullish: '#00c07f22', bearish: '#ff555522', neutral: '#f0b90b22' }[signal] || '#ffffff11';
  const signalBorder= { bullish: '#00c07f', bearish: '#ff5555', neutral: '#f0b90b' }[signal] || '#8899aa';

  // Analiz içeriğini ilk 300 karakter al, düz metin
  const snippet = (content || '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,2}/g, '')
    .replace(/`/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 280) + (content?.length > 280 ? '…' : '');

  const priceStr = priceUsd
    ? '$' + Number(priceUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '';

  const dateStr = date || new Date().toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' });

  const el = document.createElement('div');
  el.id = '__share-card-render';
  el.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 600px;
    background: #0B0F1A;
    color: #f0f0f0;
    font-family: 'Geist', 'Inter', sans-serif;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid #1e2440;
  `;

  el.innerHTML = `
    <div style="background:linear-gradient(135deg,${color}22,#0B0F1A 60%);padding:24px 28px 20px">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:48px;height:48px;border-radius:50%;background:${color}33;border:2px solid ${color};
            display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700;color:${color}">
            ${avatar}
          </div>
          <div>
            <div style="font-weight:800;font-size:1.1rem">${coinName}</div>
            <div style="color:#8899aa;font-size:.8rem;font-family:monospace">${sym}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;font-size:1.4rem;font-family:monospace">${priceStr}</div>
          <div style="color:${changeColor};font-weight:700;font-size:.9rem">${changeStr}</div>
        </div>
      </div>

      <!-- Signal badge -->
      <div style="display:inline-flex;align-items:center;gap:6px;
        background:${signalBg};border:1px solid ${signalBorder};
        border-radius:999px;padding:5px 14px;font-size:.85rem;font-weight:700;margin-bottom:16px">
        ${signalLabel}
        <span style="color:#8899aa;font-weight:400;margin-left:4px">— ${confidence}% güven</span>
      </div>

      <!-- Snippet -->
      <p style="font-size:.85rem;line-height:1.65;color:#c0c8d8;margin:0 0 20px">${snippet}</p>

      <!-- Footer -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:16px;border-top:1px solid #1e2440">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:24px;height:24px;background:#1A56DB;border-radius:6px;
            display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:800;color:#fff">CA</div>
          <span style="font-weight:700;font-size:.85rem">crypto<strong>analyst</strong></span>
          <span style="color:#4a5270;font-size:.75rem">/ AI Analiz</span>
        </div>
        <span style="color:#4a5270;font-size:.75rem">${dateStr}</span>
      </div>
    </div>
  `;

  return el;
}

// ─── Kart oluştur ve indir / paylaş ─────────────────────────────────────
async function generateShareCard(data) {
  let cardEl = null;
  try {
    const html2canvas = await loadHtml2Canvas();
    cardEl = buildShareCardEl(data);
    document.body.appendChild(cardEl);

    // kısa bekleme (font render)
    await new Promise(r => setTimeout(r, 120));

    const canvas = await html2canvas(cardEl, {
      scale:           2,
      backgroundColor: '#0B0F1A',
      logging:         false,
      useCORS:         true,
    });

    return canvas;

  } finally {
    if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
  }
}

// ─── İndir ───────────────────────────────────────────────────────────────
async function downloadShareCard(data) {
  try {
    window.toast?.('🎴 Kart oluşturuluyor…', 'info');
    const canvas = await generateShareCard(data);
    const link = document.createElement('a');
    link.download = `cryptoanalyst-${(data.coinSym || 'card').toLowerCase()}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    window.toast?.('✅ Paylaşım kartı indirildi!', 'success');
  } catch (err) {
    console.error('Share card error:', err);
    window.toast?.('Kart oluşturulamadı. Tekrar deneyin.', 'error');
  }
}

// ─── Twitter/X'te paylaş ─────────────────────────────────────────────────
async function shareToTwitter(data) {
  const sym    = (data.coinSym || '').toUpperCase();
  const signal = data.signal || 'neutral';
  const emoji  = { bullish: '🟢', bearish: '🔴', neutral: '🟡' }[signal] || '📊';
  const price  = data.priceUsd
    ? '$' + Number(data.priceUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '';

  const tweetText = `${emoji} #${sym} Günlük AI Analizi\n\n` +
    `Fiyat: ${price}\n` +
    `Sinyal: ${signal.toUpperCase()}\n\n` +
    `📊 Tam analiz → https://crypto-analyst.app/?coin=${data.coinId || sym.toLowerCase()}\n\n` +
    `#CryptoAnalyst #Kripto #${sym}`;

  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
  window.open(url, '_blank', 'width=560,height=450');

  // Aynı zamanda kartı indir
  downloadShareCard(data);
}

// ─── Native Share API (mobil) ────────────────────────────────────────────
async function nativeShare(data) {
  if (!navigator.share) return shareToTwitter(data);

  try {
    window.toast?.('🎴 Paylaşım kartı hazırlanıyor…', 'info');
    const canvas = await generateShareCard(data);

    canvas.toBlob(async (blob) => {
      try {
        const file = new File([blob], `cryptoanalyst-${(data.coinSym||'').toLowerCase()}.png`, { type: 'image/png' });
        await navigator.share({
          title: `${data.coinName} AI Analizi`,
          text: `${data.coinSym} için CryptoAnalyst AI analizi — Sinyal: ${data.signal}`,
          files: [file],
        });
      } catch (_) {
        shareToTwitter(data);
      }
    }, 'image/png');

  } catch (_) {
    shareToTwitter(data);
  }
}

// ─── GENEL API ───────────────────────────────────────────────────────────
window.shareCard = {
  download:      downloadShareCard,
  shareTwitter:  shareToTwitter,
  share:         nativeShare,

  // Kolaylık: analiz kartına share butonu ekle
  attachToCard(cardEl, data) {
    if (!cardEl) return;
    const existing = cardEl.querySelector('.share-card-btn');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.className = 'share-card-btn btn-ghost btn-sm';
    btn.innerHTML = '🎴 Paylaş';
    btn.style.cssText = 'margin-top:.5rem;font-size:.78rem';
    btn.onclick = (e) => {
      e.stopPropagation();
      nativeShare(data);
    };
    cardEl.appendChild(btn);
  },
};

})();
