// js/app.js — Crypto Analyst Frontend (Redesigned)
'use strict';

const COINS = [
  { id:'bitcoin',      sym:'BTC',  name:'Bitcoin',   avatar:'₿',  avatarColor:'#F7931A' },
  { id:'ethereum',     sym:'ETH',  name:'Ethereum',  avatar:'Ξ',  avatarColor:'#627EEA' },
  { id:'solana',       sym:'SOL',  name:'Solana',    avatar:'◎',  avatarColor:'#9945FF' },
  { id:'binancecoin',  sym:'BNB',  name:'BNB',       avatar:'⬡',  avatarColor:'#F3BA2F' },
  { id:'ripple',       sym:'XRP',  name:'XRP',       avatar:'✕',  avatarColor:'#00AAE4' },
  { id:'cardano',      sym:'ADA',  name:'Cardano',   avatar:'₳',  avatarColor:'#0D1E7E' },
  { id:'dogecoin',     sym:'DOGE', name:'Dogecoin',  avatar:'Ð',  avatarColor:'#C2A633' },
  { id:'avalanche-2',  sym:'AVAX', name:'Avalanche', avatar:'△',  avatarColor:'#E84142' },
  { id:'polkadot',     sym:'DOT',  name:'Polkadot',  avatar:'●',  avatarColor:'#E6007A' },
];

let selected  = COINS[0];
let prices    = {};
let currentAnalysis = null;
let usageData = { used: 0, limit: 2, remaining: 2, isVip: false };

// toast() → utils.js'den gelir (window.toast)

// ─── HEADER SCROLL ─────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('header').classList.toggle('scrolled', window.scrollY > 20);
});

// ─── MOBILE MENU ───────────────────────────────────────────────────────────
function toggleMenu() {
  const nav  = document.getElementById('navLinks');
  const btn  = document.getElementById('hamburger');
  const open = nav.classList.toggle('open');
  if (btn) btn.classList.toggle('open', open);
  // Menü dışına tıklayınca kapat (bir kerelik listener)
  if (open) {
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!nav.contains(e.target) && !btn.contains(e.target)) {
          nav.classList.remove('open');
          btn && btn.classList.remove('open');
          document.removeEventListener('click', handler);
        }
      });
    }, 10);
  }
}

// ─── CLOCK ─────────────────────────────────────────────────────────────────
function updateClock() {
  const t = new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
  const el = document.getElementById('statTime');
  if (el) el.textContent = t;
  const dateEl = document.getElementById('cardDate');
  if (dateEl) dateEl.textContent =
    new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

// ─── HERO DEMO CARD ANIMATION ───────────────────────────────────────────────
(function initHeroDemo() {
  let pct = 0;
  const target = 78;
  setTimeout(() => {
    const iv = setInterval(() => {
      pct = Math.min(pct + 2, target);
      const fill = document.getElementById('demoFill');
      const label = document.getElementById('demoPct');
      if (fill) fill.style.width = pct + '%';
      if (label) label.textContent = pct + '%';
      if (pct >= target) clearInterval(iv);
    }, 25);
  }, 600);
})();

// ─── SPARKLINE ─────────────────────────────────────────────────────────────
function drawSparkline(coinId) {
  const canvas = document.getElementById('sparkCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || canvas.parentElement.offsetWidth || 600;
  const H = 48;
  canvas.width = W; canvas.height = H;

  const d = prices[coinId] || {};
  const ch = d.price_change_percentage_24h || 0;
  const pts = 24;
  const data = [];
  let v = 50;
  for (let i = 0; i < pts; i++) {
    v += (Math.random() - 0.49) * 8;
    v = Math.max(10, Math.min(90, v));
    data.push(v);
  }
  data[pts-1] = ch > 0 ? Math.max(data[pts-2] || 50, 58) : Math.min(data[pts-2] || 50, 42);

  const min = Math.min(...data), max = Math.max(...data);
  const norm = data.map(v => H - ((v - min) / (max - min + 0.1)) * (H - 6) - 3);
  const color = ch >= 0 ? 'oklch(0.70 0.18 145)' : 'oklch(0.65 0.22 25)';
  const colorRgb = ch >= 0 ? '34,197,94' : '239,68,68';

  ctx.clearRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgba(${colorRgb},.12)`);
  grad.addColorStop(1, `rgba(${colorRgb},0)`);
  ctx.beginPath();
  norm.forEach((y, i) => {
    const x = (i / (pts-1)) * W;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  norm.forEach((y, i) => {
    const x = (i / (pts-1)) * W;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
}

// ─── PRICES (backend proxy üzerinden — rate limit yok) ────────────────────
async function fetchPrices() {
  try {
    const r = await fetch((window.API_BASE || '') + '/api/prices');
    if (!r.ok) throw new Error('prices API ' + r.status);
    const json = await r.json();
    // data bir nesne {coinId: {...}} formatında gelir
    if (json.data && typeof json.data === 'object') {
      Object.assign(prices, json.data);
    }
  } catch (err) {
    console.warn('Fiyat proxy erişilemedi, önceki veriler korunuyor.', err.message);
  }
  renderTicker();
  renderCoinTabs();
  updatePriceCard();
}

function renderTicker() {
  const makeItem = c => {
    const d = prices[c.id] || {};
    const ch = typeof d.price_change_percentage_24h === 'number' ? d.price_change_percentage_24h : null;
    const price = d.current_price
      ? `$${d.current_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : '—';
    const chHtml = ch !== null
      ? `<span class="${ch >= 0 ? 'ticker-up' : 'ticker-dn'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)}%</span>`
      : '';
    return `<span class="ticker-item">
      <span class="ticker-avatar" style="color:${c.avatarColor}">${c.avatar}</span>
      <span class="ticker-sym">${c.sym}</span>
      <span class="ticker-price">${price}</span>
      ${chHtml}
      <span class="ticker-sep">·</span>
    </span>`;
  };
  // İki kopya — seamless loop için
  const html = [...COINS, ...COINS].map(makeItem).join('');
  document.getElementById('ticker').innerHTML = html;
}

function renderCoinTabs() {
  document.getElementById('coinTabs').innerHTML = COINS.map(c => {
    const d = prices[c.id] || {};
    const ch = d.price_change_percentage_24h || 0;
    const price = d.current_price
      ? `$${d.current_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : '—';
    return `<button class="coin-tab ${c.id === selected.id ? 'active' : ''}" onclick="selectCoin('${c.id}')">
      <span class="coin-tab-sym">${c.sym}</span>
      <span class="coin-tab-ch ${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</span>
    </button>`;
  }).join('');
}

function selectCoin(id) {
  selected = COINS.find(c => c.id === id);
  renderCoinTabs();
  updatePriceCard();
  resetAnalysisPanel();
  drawSparkline(id);
}

function updatePriceCard() {
  const d = prices[selected.id] || {};
  document.getElementById('cardCoin').textContent = selected.name;

  // Avatar
  const avatarEl = document.getElementById('priceAvatar');
  if (avatarEl) {
    avatarEl.textContent = selected.avatar;
    avatarEl.style.color = selected.avatarColor;
    avatarEl.style.borderColor = selected.avatarColor + '40';
    avatarEl.style.background = selected.avatarColor + '18';
  }

  const price = d.current_price
    ? `$${d.current_price.toLocaleString('en-US', { maximumFractionDigits: d.current_price < 1 ? 6 : 2 })}`
    : '—';
  document.getElementById('cardPrice').textContent = price;

  const ch = d.price_change_percentage_24h || 0;
  const el = document.getElementById('cardChange');
  el.textContent = (ch >= 0 ? '▲ +' : '▼ ') + ch.toFixed(2) + '%';
  el.className = 'price-change ' + (ch >= 0 ? 'up' : 'dn');

  drawSparkline(selected.id);
}

function resetAnalysisPanel() {
  currentAnalysis = null;
  document.getElementById('emptyState').style.display = '';
  document.getElementById('panelHeader').style.display = 'none';
  document.getElementById('metricCardsGrid').style.display = 'none';
  document.getElementById('explanationCard').style.display = 'none';
}

function showAnalysisSkeleton() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('panelHeader').style.display = 'flex';
  document.getElementById('metricCardsGrid').style.display = 'grid';
  document.getElementById('explanationCard').style.display = '';

  // Header skeleton
  document.getElementById('panelCoinName').innerHTML =
    `<div class="skeleton skeleton-text" style="width:140px;height:18px;margin:0"></div>`;
  document.getElementById('panelTimestamp').innerHTML =
    `<div class="skeleton skeleton-text" style="width:100px;height:12px;margin:0"></div>`;

  // Metric cards skeleton
  ['signalCard','confidenceCard','riskCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML =
      `<div class="skeleton skeleton-text" style="width:60%;height:12px;margin:0 0 8px"></div>
       <div class="skeleton" style="width:80px;height:28px;margin:0"></div>`;
  });

  // Key factors skeleton
  const kfList = document.getElementById('kfList');
  if (kfList) kfList.innerHTML = [80,65,90,55].map(w =>
    `<li><div class="skeleton skeleton-text" style="width:${w}%;height:12px;margin:0"></div></li>`
  ).join('');

  // Content skeleton
  const analysisContent = document.getElementById('analysisContent');
  if (analysisContent) analysisContent.innerHTML =
    [100,85,92,70,88,95,75,82].map(w =>
      `<div class="skeleton skeleton-text" style="width:${w}%"></div>`
    ).join('');
}

// ─── RENDER ANALYSIS PANEL (AI_ResultPanel design) ──────────────────────────
function renderAnalysisPanel(data) {
  currentAnalysis = data;
  const { signal, confidence, risk_level, key_factors, content, coin_name, coin_sym, created_at } = data;

  // Hide empty state
  document.getElementById('emptyState').style.display = 'none';

  // Panel header
  const panelHeader = document.getElementById('panelHeader');
  panelHeader.style.display = 'flex';
  document.getElementById('panelCoinName').innerHTML =
    `${coin_name} <span class="panel-sym">(${coin_sym})</span>`;
  document.getElementById('panelTimestamp').textContent =
    `${new Date(created_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })} güncellendi`;

  // Metric cards
  document.getElementById('metricCardsGrid').style.display = 'grid';

  // 1) Signal card
  const signalCard = document.getElementById('signalCard');
  const signalLabels = { bullish: 'Boğa', bearish: 'Ayı', neutral: 'Nötr' };
  const signalIcons = {
    bullish: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    bearish: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
    neutral: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  };
  signalCard.className = `metric-card signal-card ${signal}`;
  document.getElementById('signalSym').textContent = coin_sym;
  document.getElementById('signalIconWrap').className = `mc-icon-wrap ${signal}`;
  document.getElementById('signalIconWrap').innerHTML = signalIcons[signal];
  document.getElementById('signalLabel').className = `mc-value signal-val ${signal}`;
  document.getElementById('signalLabel').textContent = signalLabels[signal] || 'Nötr';

  // 2) Confidence card
  const confNum = document.getElementById('confNum');
  const confBar = document.getElementById('confBar');
  const confColor = confidence >= 75 ? 'green' : confidence >= 50 ? 'yellow' : 'red';
  confNum.className = `conf-num ${confColor}`;
  confNum.textContent = confidence || '—';
  confBar.className = `conf-bar-fill ${confColor}`;
  setTimeout(() => { confBar.style.width = (confidence || 0) + '%'; }, 50);

  // 3) Risk card
  const riskConfigs = {
    low:    { label: 'Düşük Risk', desc: 'Dengeli piyasa koşulları', bars: 1, cls: 'bullish' },
    medium: { label: 'Orta Risk',  desc: 'Ilımlı dalgalanma bekleniyor', bars: 2, cls: 'neutral' },
    high:   { label: 'Yüksek Risk', desc: 'Yüksek volatilite uyarısı', bars: 3, cls: 'bearish' },
  };
  const riskCfg = riskConfigs[risk_level] || riskConfigs.medium;
  document.getElementById('riskLabel').className = `mc-value risk-val ${riskCfg.cls}`;
  document.getElementById('riskLabel').textContent = riskCfg.label;
  document.getElementById('riskDesc').textContent = riskCfg.desc;
  document.getElementById('riskIconWrap').className = `mc-icon-wrap ${riskCfg.cls}`;

  const riskBars = document.getElementById('riskBars');
  riskBars.innerHTML = [1,2,3].map(i =>
    `<div class="risk-bar ${i <= riskCfg.bars ? `active-${risk_level}` : ''}"></div>`
  ).join('');

  // Explanation card
  document.getElementById('explanationCard').style.display = '';

  // Key factors (JSON string veya array olabilir)
  const kfEl = document.getElementById('keyFactors');
  const kfList = document.getElementById('kfList');
  let kf = key_factors;
  if (typeof kf === 'string') { try { kf = JSON.parse(kf); } catch(_) { kf = []; } }
  if (Array.isArray(kf) && kf.length > 0) {
    kfEl.style.display = '';
    kfList.innerHTML = kf.map(f => `<li>${window.escHtml ? window.escHtml(f) : f}</li>`).join('');
  } else {
    kfEl.style.display = 'none';
  }

  // Format content (markdown-like)
  document.getElementById('analysisContent').innerHTML = formatAnalysisContent(content);

  // Share butonu için event
  document.dispatchEvent(new CustomEvent('analysisLoaded', { detail: data }));
}

// formatAnalysisContent → utils.js'deki window.formatMarkdown kullanılıyor
// window.formatMarkdown henüz tanımlanmamışsa güvenli fallback
function formatAnalysisContent(text) {
  if (window.formatMarkdown) return window.formatMarkdown(text);
  return text ? '<p>' + text.replace(/\n/g, '<br>') + '</p>' : '';
}

// ─── GENERATE ANALYSIS ──────────────────────────────────────────────────────
async function generateAnalysis() {
  if (!window.currentUser) {
    openModal('loginModal');
    return;
  }

  const btn = document.getElementById('genBtn');
  const btnText = document.getElementById('genBtnText');
  const refreshIcon = document.getElementById('refreshIcon');

  btn.disabled = true;
  btn.classList.add('loading');
  btnText.textContent = 'Analiz Yapılıyor…';
  if (refreshIcon) refreshIcon.classList.add('spin');
  showAnalysisSkeleton();
  document.getElementById('analizler').scrollIntoView({ behavior: 'smooth' });

  const d = prices[selected.id] || {};

  try {
    const res = await apiFetch('/api/analyses/generate', {
      method: 'POST',
      body: JSON.stringify({
        coinId:    selected.id,
        coinSym:   selected.sym,
        coinName:  selected.name,
        priceUsd:  d.current_price,
        change24h: d.price_change_percentage_24h,
        volume24h: d.total_volume,
        marketCap: d.market_cap,
        high24h:   d.high_24h,
        low24h:    d.low_24h,
        ath:       d.ath,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      if (res.status === 429 && err.code === 'DAILY_LIMIT_EXCEEDED') {
        toast(`Günlük ${err.limit} analiz limitine ulaştınız. VIP'e geçin!`, 'error');
        // Usage kartını güncelle
        renderUsageCard({ used: err.used, limit: err.limit, remaining: 0, isVip: false });
      } else {
        toast(err.error || 'Analiz oluşturulamadı.', 'error');
      }
      return;
    }

    const json = await res.json();
    renderAnalysisPanel(json.data);

    // Usage güncelle
    if (json.usage) {
      usageData = { ...usageData, ...json.usage };
      renderUsageCard(usageData);
    }

    toast(`${selected.name} analizi tamamlandı!`, 'success');
    loadHistory();

  } catch (err) {
    console.error('Generate error:', err);
    toast('Bağlantı hatası. Tekrar deneyin.', 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btnText.textContent = 'Analiz Oluştur';
    if (refreshIcon) refreshIcon.classList.remove('spin');
  }
}

// ─── USAGE CARD (creditpage design) ─────────────────────────────────────────
function renderUsageCard(data) {
  usageData = { ...usageData, ...data };
  const { used, limit, remaining, isVip } = usageData;

  const card = document.getElementById('usageCard');
  const vipCard = document.getElementById('vipBadgeCard');

  if (isVip) {
    if (card) card.style.display = 'none';
    if (vipCard) vipCard.style.display = 'flex';
    return;
  }

  if (card) card.style.display = '';
  if (vipCard) vipCard.style.display = 'none';

  const numLimit = typeof limit === 'number' ? limit : 2;
  const pct = Math.min((used / numLimit) * 100, 100);

  const usedEl = document.getElementById('usageUsed');
  const limitEl = document.getElementById('usageLimit');
  const remEl = document.getElementById('usageRemaining');
  const barEl = document.getElementById('usageBar');

  if (usedEl) usedEl.textContent = used;
  if (limitEl) limitEl.textContent = `/ ${numLimit}`;
  if (remEl) remEl.textContent = remaining > 0 ? `${remaining} kalan` : 'Limit doldu';

  if (barEl) {
    barEl.style.width = pct + '%';
    barEl.className = 'usage-bar-fill' +
      (pct >= 100 ? ' full' : pct >= 50 ? ' warn' : '');
  }
}

async function loadUsage() {
  if (!window.currentUser) return;
  try {
    const res = await apiFetch('/api/analyses/usage');
    if (res.ok) {
      const data = await res.json();
      renderUsageCard(data);
    }
  } catch(_) {}
}

async function upgradeToVip() {
  if (!window.currentUser) { openModal('loginModal'); return; }
  try {
    const res = await apiFetch('/api/auth/upgrade-vip', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      toast(data.message, 'success');
      renderUsageCard({ isVip: true });
      updateGenButton(true);
    } else {
      const err = await res.json();
      toast(err.error || 'Yükseltme başarısız.', 'error');
    }
  } catch(_) {
    toast('Bağlantı hatası.', 'error');
  }
}

// ─── GEN BUTTON STATE ────────────────────────────────────────────────────────
function updateGenButton(loggedIn) {
  const btn = document.getElementById('genBtn');
  const hintText = document.getElementById('hintText');
  const footerHint = document.getElementById('footerHint');

  if (!loggedIn) {
    btn.disabled = true;
    if (hintText) hintText.textContent = 'Analiz oluşturmak için giriş yapın';
    if (footerHint) footerHint.className = 'footer-hint';
  } else {
    btn.disabled = false;
    if (hintText) hintText.textContent = 'Ücretsiz AI analizi — Hazır';
    if (footerHint) footerHint.className = 'footer-hint';
  }
}

// ─── HISTORY ────────────────────────────────────────────────────────────────
async function loadHistory() {
  if (!window.currentUser) return;
  try {
    const res = await apiFetch('/api/analyses?limit=8');
    if (!res.ok) return;
    const json = await res.json();
    const rows = json.data || [];

    document.getElementById('histCount').textContent = `${rows.length} kayıt`;

    if (!rows.length) {
      document.getElementById('histBody').innerHTML =
        `<div class="empty-state small"><p class="empty-title small">Henüz analiz yok</p></div>`;
      return;
    }

    document.getElementById('histBody').innerHTML = rows.map(r => {
      const sig = r.signal || 'neutral';
      const sigLabels = { bullish: 'Boğa', bearish: 'Ayı', neutral: 'Nötr' };
      return `<div class="hist-item" onclick="loadAnalysis('${r.id}')">
        <div>
          <div class="hist-coin">${r.coin_sym} — ${r.coin_name}</div>
          <div class="hist-date">${new Date(r.created_at).toLocaleDateString('tr-TR')}</div>
        </div>
        <span class="hist-sig ${sig}">${sigLabels[sig]}</span>
      </div>`;
    }).join('');
  } catch(_) {}
}

async function loadAnalysis(id) {
  try {
    const res = await apiFetch(`/api/analyses/${id}`);
    if (res.ok) {
      const json = await res.json();
      renderAnalysisPanel(json.data);
      document.getElementById('analizler').scrollIntoView({ behavior: 'smooth' });
    }
  } catch(_) {}
}

// ─── STATS ──────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch('/api/analyses/stats/summary');
    if (!res.ok) return;
    const d = await res.json();
    const totalEl = document.getElementById('statTotal');
    const todayEl = document.getElementById('statToday');
    if (totalEl) totalEl.textContent = d.total?.toLocaleString('tr-TR') || '—';
    if (todayEl) todayEl.textContent = d.today || '—';

    // Popular coins
    if (d.popularCoins?.length) {
      document.getElementById('popularBody').innerHTML = d.popularCoins.map(c =>
        `<div class="popular-item">
          <div>
            <div class="popular-sym">${c.coin_sym}</div>
            <div class="popular-cnt">${c.coin_name}</div>
          </div>
          <span class="popular-count-badge">${c.count}</span>
        </div>`
      ).join('');
    }
  } catch(_) {}
}

// ─── DAILY REPORT ────────────────────────────────────────────────────────────
async function loadReport() {
  try {
    const res = await fetch('/api/reports/today');
    if (!res.ok) { document.getElementById('reportCard').innerHTML = renderEmptyReport(); return; }
    const json = await res.json();
    const r = json.data;
    if (!r) { document.getElementById('reportCard').innerHTML = renderEmptyReport(); return; }

    document.getElementById('reportCard').innerHTML = `
      <div class="report-header">
        <div>
          <div class="report-title">📋 Günlük Piyasa Raporu</div>
          <div class="report-date">${r.report_date}</div>
        </div>
        ${r.seo_score ? `<span style="font-size:12px;color:var(--fg-muted)">SEO: ${r.seo_score}</span>` : ''}
      </div>
      <div class="report-body">${formatAnalysisContent(r.content)}</div>`;

    // Sidebar metrikleri
    animateMetric('seoVal', 'seoBar',  r.seo_score  || 0, 100);
    animateMetric('perfVal', 'perfBar', r.perf_score || 0, 100);
    animateMetric('contVal', 'contBar', r.cont_score || 0, 100);

    document.getElementById('metricTime').textContent = r.report_date;
  } catch(_) {
    document.getElementById('reportCard').innerHTML = renderEmptyReport();
  }
}

function renderEmptyReport() {
  return `<div class="empty-state small">
    <div class="empty-icon small">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    </div>
    <p class="empty-title small">Günlük rapor henüz hazır değil</p>
  </div>`;
}

function animateMetric(valId, barId, val, max) {
  const v = Math.min(val, max);
  const pct = (v / max) * 100;
  const valEl = document.getElementById(valId);
  const barEl = document.getElementById(barId);
  if (valEl) valEl.textContent = v;
  if (barEl) setTimeout(() => { barEl.style.width = pct + '%'; }, 100);

  if (!document.getElementById('kwArea').children.length) {
    const kws = ['kripto analiz', 'bitcoin yorum', 'ethereum analiz', 'coin tahmin', 'borsa haberleri'];
    document.getElementById('kwArea').innerHTML = kws.map(k =>
      `<span class="kw-tag">${k}</span>`
    ).join('');
  }
}

// ─── NEWS ────────────────────────────────────────────────────────────────────
async function loadNews(coinId) {
  const coin = COINS.find(c => c.id === (coinId || selected.id));
  try {
    const res = await fetch(`/api/news?coin=${coin?.sym || 'BTC'}`);
    if (!res.ok) throw 0;
    const json = await res.json();
    const items = json.data || [];

    const badge = document.getElementById('newsCount');
    if (badge) badge.textContent = items.length;

    if (!items.length) {
      document.getElementById('newsBody').innerHTML =
        `<div class="empty-state small"><p class="empty-title small">Haber bulunamadı</p></div>`;
      return;
    }

    document.getElementById('newsBody').innerHTML = items.map(n => {
      // Backend 'bullish'/'bearish'/'neutral' döndürüyor
      const sent = n.sentiment || 'neutral';
      const sentCls   = sent === 'bullish' ? 'positive' : sent === 'bearish' ? 'negative' : 'neutral';
      const sentLabel = sent === 'bullish' ? 'Olumlu'   : sent === 'bearish' ? 'Olumsuz'  : 'Nötr';
      const pubDate = n.pubDate || n.published_at;
      return `<div class="news-item">
        <div class="news-source">
          <span class="news-src-name">${n.source || 'Haber'}</span>
          <span class="news-src-time">${pubDate ? new Date(pubDate).toLocaleDateString('tr-TR') : ''}</span>
        </div>
        <div class="news-headline">
          ${n.link ? `<a href="${n.link}" target="_blank" rel="noopener">${n.title}</a>` : n.title}
        </div>
        <span class="news-sentiment ${sentCls}">${sentLabel}</span>
      </div>`;
    }).join('');

    // Digest
    if (json.digest) {
      document.getElementById('digestCard').innerHTML =
        `<div class="digest-body">${json.digest}</div>`;
    }
  } catch {
    document.getElementById('newsBody').innerHTML =
      `<div class="empty-state small"><p class="empty-title small">Haberler yüklenemedi</p></div>`;
  }
}

// ─── AUTH HOOKS ──────────────────────────────────────────────────────────────
window.onUserLogin = function(user, usage) {
  document.getElementById('authArea').style.display = 'none';
  document.getElementById('userArea').style.display = 'flex';
  document.getElementById('usageCard').style.display = '';
  document.getElementById('userBadge').textContent = user.username || user.email?.split('@')[0];
  updateGenButton(true);

  if (usage) renderUsageCard(usage);
  loadUsage();
  loadHistory();
};

window.onUserLogout = function() {
  document.getElementById('authArea').style.display = 'flex';
  document.getElementById('userArea').style.display = 'none';
  document.getElementById('usageCard').style.display = 'none';
  document.getElementById('vipBadgeCard').style.display = 'none';
  updateGenButton(false);
  resetAnalysisPanel();
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
(async function init() {
  // Coin tabs skeleton placeholder
  document.getElementById('coinTabs').innerHTML = COINS.map(() =>
    `<div class="coin-tab" style="pointer-events:none;gap:6px">
      <div class="skeleton skeleton-text" style="width:36px;height:12px;margin:0"></div>
      <div class="skeleton skeleton-text" style="width:48px;height:10px;margin:0"></div>
    </div>`
  ).join('');

  await Promise.all([fetchPrices(), loadStats(), loadReport()]);
  setInterval(fetchPrices, 60000);
  setInterval(loadStats, 120000);
})();
