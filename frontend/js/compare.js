// js/compare.js — Coin Karşılaştırma Sayfası
'use strict';

const COIN_COLORS = window.COIN_COLORS || {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF',
  XRP: '#00AAE4', ADA: '#0033AD', BNB: '#F0B90B',
};
const COIN_AVATARS = window.COIN_AVATARS || {
  BTC: '₿', ETH: 'Ξ', SOL: '◎', XRP: '✕', ADA: '₳', BNB: '⬡',
};

// ─── CoinGecko fiyat verisini çek ────────────────────────────────────────
async function fetchCoinPrice(coinId) {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`
    );
    if (!res.ok) return {};
    const data = await res.json();
    return data[coinId] || {};
  } catch (_) {
    return {};
  }
}

// ─── Karşılaştırma başlat ────────────────────────────────────────────────
window.startCompare = async function() {
  const coin1Val = document.getElementById('coin1Select').value;
  const coin2Val = document.getElementById('coin2Select').value;

  if (coin1Val === coin2Val) {
    window.toast('Lütfen farklı iki coin seçin.', 'error');
    return;
  }

  const [c1id, c1sym, c1name] = coin1Val.split('|');
  const [c2id, c2sym, c2name] = coin2Val.split('|');

  const btn = document.getElementById('compareBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Analiz ediliyor...';

  const resultEl  = document.getElementById('compareResult');
  const gridEl    = document.getElementById('compareGrid');
  const verdictEl = document.getElementById('compareVerdict');

  resultEl.style.display = 'block';
  gridEl.innerHTML = renderSkeletons();
  verdictEl.innerHTML = '';

  try {
    // Fiyat verilerini paralel çek
    const [price1, price2] = await Promise.all([
      fetchCoinPrice(c1id),
      fetchCoinPrice(c2id),
    ]);

    const coin1Data = {
      coinId: c1id, coinSym: c1sym, coinName: c1name,
      priceUsd: price1.usd || 0,
      change24h: price1.usd_24h_change || 0,
      volume24h: price1.usd_24h_vol || 0,
      marketCap: price1.usd_market_cap || 0,
    };
    const coin2Data = {
      coinId: c2id, coinSym: c2sym, coinName: c2name,
      priceUsd: price2.usd || 0,
      change24h: price2.usd_24h_change || 0,
      volume24h: price2.usd_24h_vol || 0,
      marketCap: price2.usd_market_cap || 0,
    };

    // Backend'e karşılaştırma isteği
    const res = await window.apiFetch('/api/analyses/compare', {
      method: 'POST',
      body: JSON.stringify({ coin1: coin1Data, coin2: coin2Data }),
    });

    if (res.status === 401) {
      window.toast('Karşılaştırma için giriş yapmanız gerekiyor.', 'error');
      return;
    }
    if (res.status === 429) {
      const data = await res.json();
      window.toast(data.error || 'Günlük limitinize ulaştınız.', 'error');
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.toast(data.error || 'Karşılaştırma başarısız.', 'error');
      return;
    }

    const result = await res.json();
    renderCompareResult(result, coin1Data, coin2Data);

  } catch (err) {
    console.error('Compare error:', err);
    window.toast('Bağlantı hatası. Tekrar deneyin.', 'error');
    resultEl.style.display = 'none';
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Karşılaştır';
  }
};

// ─── Sonuç Render ────────────────────────────────────────────────────────
function renderCompareResult(result, coin1, coin2) {
  const { analysis1, analysis2, verdict } = result;
  const gridEl    = document.getElementById('compareGrid');
  const verdictEl = document.getElementById('compareVerdict');

  const winner = determineWinner(analysis1, analysis2);

  gridEl.innerHTML = [
    renderCoinCard(coin1, analysis1, winner === 1),
    renderCoinCard(coin2, analysis2, winner === 2),
  ].join('');

  // Confidence bar animation
  requestAnimationFrame(() => {
    document.querySelectorAll('.confidence-fill').forEach(el => {
      el.style.width = el.dataset.width + '%';
    });
  });

  // Verdict
  if (verdict) {
    verdictEl.innerHTML = `
      <h2>🤖 AI Kararı</h2>
      <div class="verdict-text">${window.formatMarkdown ? window.formatMarkdown(verdict) : verdict}</div>
    `;
  }
}

function determineWinner(a1, a2) {
  if (!a1 || !a2) return 0;
  const score1 = signalScore(a1.signal) * (a1.confidence || 50);
  const score2 = signalScore(a2.signal) * (a2.confidence || 50);
  if (score1 > score2) return 1;
  if (score2 > score1) return 2;
  return 0;
}

function signalScore(signal) {
  if (signal === 'bullish') return 1;
  if (signal === 'bearish') return -1;
  return 0.3;
}

function renderCoinCard(coin, analysis, isWinner) {
  const sym    = coin.coinSym.toUpperCase();
  const color  = COIN_COLORS[sym]  || '#8899aa';
  const avatar = COIN_AVATARS[sym] || sym.charAt(0);
  const signal    = analysis?.signal     || 'neutral';
  const conf      = analysis?.confidence || 50;
  const risk      = analysis?.risk_level || 'medium';
  const priceStr  = coin.priceUsd ? window.fmtUsd?.(coin.priceUsd, 2) : '$—';
  const changePos = coin.change24h >= 0;
  const changeStr = (changePos ? '+' : '') + (coin.change24h || 0).toFixed(2) + '%';

  const signalLabel = { bullish: '🟢 Yükseliş', bearish: '🔴 Düşüş', neutral: '🟡 Nötr' }[signal] || signal;
  const riskLabel   = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' }[risk] || risk;

  const analysisHtml = analysis?.content
    ? (window.formatMarkdown ? window.formatMarkdown(analysis.content.slice(0, 800) + (analysis.content.length > 800 ? '…' : '')) : analysis.content.slice(0, 400))
    : '<em>Analiz yüklenemedi.</em>';

  return `
    <div class="compare-card ${isWinner ? 'winner' : ''}">
      ${isWinner ? '<div class="winner-badge">✓ Daha Güçlü Sinyal</div>' : ''}
      <div class="compare-coin-header">
        <div class="compare-avatar" style="background:${color}22;color:${color}">${avatar}</div>
        <div>
          <div class="compare-coin-name">${coin.coinName}</div>
          <div class="compare-coin-sym">${sym}</div>
        </div>
      </div>

      <div class="compare-price">${priceStr}</div>
      <span class="compare-change ${changePos ? 'pos' : 'neg'}">${changeStr} (24s)</span>

      <div class="compare-metrics">
        <div class="metric-item">
          <div class="metric-label">Piyasa Değeri</div>
          <div class="metric-value">${coin.marketCap ? '$' + (coin.marketCap / 1e9).toFixed(1) + 'B' : '—'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">24s Hacim</div>
          <div class="metric-value">${coin.volume24h ? '$' + (coin.volume24h / 1e9).toFixed(2) + 'B' : '—'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Risk Seviyesi</div>
          <div class="metric-value">${riskLabel}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Güven Skoru</div>
          <div class="metric-value">${conf}%</div>
        </div>
      </div>

      <div class="signal-row">
        <div class="signal-dot ${signal}"></div>
        <span class="signal-text">${signalLabel}</span>
      </div>

      <div class="confidence-bar-wrap">
        <div class="confidence-label">AI Güven: ${conf}%</div>
        <div class="confidence-bar">
          <div class="confidence-fill ${signal}" style="width:0%" data-width="${conf}"></div>
        </div>
      </div>

      <div class="compare-analysis">${analysisHtml}</div>
    </div>
  `;
}

function renderSkeletons() {
  const skl = `
    <div class="compare-card compare-skeleton">
      <div class="skeleton-line" style="width:60%;height:20px;margin-bottom:1rem"></div>
      <div class="skeleton-line" style="width:40%;height:32px;margin-bottom:.5rem"></div>
      <div class="skeleton-line" style="width:30%"></div>
      <div class="skeleton-line" style="width:100%;margin-top:1rem"></div>
      <div class="skeleton-line" style="width:90%"></div>
      <div class="skeleton-line" style="width:95%"></div>
      <div class="skeleton-line" style="width:85%"></div>
      <div class="skeleton-line" style="width:80%"></div>
    </div>
  `;
  return skl + skl;
}

// ─── URL parametrelerinden ön-seçim ──────────────────────────────────────
(function initFromURL() {
  const params = new URLSearchParams(window.location.search);
  const c1 = params.get('coin1');
  const c2 = params.get('coin2');
  if (c1) {
    const opt = document.querySelector(`#coin1Select option[value*="${c1}"]`);
    if (opt) opt.selected = true;
  }
  if (c2) {
    const opt = document.querySelector(`#coin2Select option[value*="${c2}"]`);
    if (opt) opt.selected = true;
  }
  if (c1 && c2) window.startCompare();
})();

// ─── TREND GRAFİĞİ ────────────────────────────────────────────────────────
let trendChartInstance = null;
let _currentC1 = null;
let _currentC2 = null;
let _activeDays = 7;

// startCompare() bittikten sonra coin ID'lerini sakla
const _origStartCompare = window.startCompare;
window.startCompare = async function() {
  const v1 = document.getElementById('coin1Select')?.value || '';
  const v2 = document.getElementById('coin2Select')?.value || '';
  _currentC1 = v1.split('|')[0];
  _currentC2 = v2.split('|')[0];
  await _origStartCompare();
  // Karşılaştırma tamamlandıktan sonra 7 günlük trend yükle
  if (_currentC1 && _currentC2) loadTrend(_activeDays);
};

window.loadTrend = async function(days) {
  if (!_currentC1 || !_currentC2) return;
  _activeDays = days;

  // Aktif buton stili
  [1, 7, 14, 30].forEach(d => {
    const btn = document.getElementById('trendBtn' + d);
    if (!btn) return;
    if (d === days) {
      btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)';
    } else {
      btn.style.borderColor = ''; btn.style.color = '';
    }
  });

  const loadEl = document.getElementById('trendLoading');
  if (loadEl) loadEl.style.display = '';

  try {
    const [r1, r2] = await Promise.all([
      fetch(`/api/prices/history/${_currentC1}/${days}`).then(r => r.json()),
      fetch(`/api/prices/history/${_currentC2}/${days}`).then(r => r.json()),
    ]);

    const pts1 = r1.data || [];
    const pts2 = r2.data || [];
    if (!pts1.length && !pts2.length) return;

    // Zaman etiketleri (coin1'den al)
    const labels = pts1.map(p => {
      const d = new Date(p.t);
      return days <= 1
        ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    });

    // Normalize: ilk noktayı 100 kabul et (yüzde değişim göster)
    function normalize(pts) {
      const base = pts[0]?.p || 1;
      return pts.map(p => +((p.p / base * 100) - 100).toFixed(3));
    }

    const c1sym = (document.getElementById('coin1Select')?.value || '').split('|')[1] || 'Coin1';
    const c2sym = (document.getElementById('coin2Select')?.value || '').split('|')[1] || 'Coin2';
    const c1col = COIN_COLORS[c1sym] || '#1A56DB';
    const c2col = COIN_COLORS[c2sym] || '#F97316';

    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }

    trendChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: c1sym + ' (% değişim)',
            data: normalize(pts1),
            borderColor: c1col,
            backgroundColor: c1col + '18',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.35,
            fill: false,
          },
          {
            label: c2sym + ' (% değişim)',
            data: normalize(pts2),
            borderColor: c2col,
            backgroundColor: c2col + '18',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.35,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#9ca3af', font: { size: 12 }, boxWidth: 14 },
          },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label.split(' ')[0]}: ${ctx.raw >= 0 ? '+' : ''}${ctx.raw}%`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#9ca3af', font: { size: 11 }, maxTicksLimit: 8 },
            grid: { color: 'rgba(255,255,255,.04)' },
          },
          y: {
            ticks: {
              color: '#9ca3af', font: { size: 11 },
              callback: v => (v >= 0 ? '+' : '') + v + '%',
            },
            grid: { color: 'rgba(255,255,255,.04)' },
          },
        },
      },
    });
  } catch (e) {
    console.warn('Trend grafik hatası:', e.message);
  } finally {
    if (loadEl) loadEl.style.display = 'none';
  }
};
