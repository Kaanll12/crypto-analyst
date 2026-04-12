// js/history.js — Analiz Geçmişi
'use strict';

const COIN_AVATARS = { BTC:'₿', ETH:'Ξ', SOL:'◎', XRP:'✕', ADA:'₳', BNB:'⬡' };
const COIN_COLORS  = { BTC:'#F7931A', ETH:'#627EEA', SOL:'#9945FF', XRP:'#00AAE4', ADA:'#3468D1', BNB:'#F3BA2F' };
const SIG_LABELS   = { bullish:'Bullish', bearish:'Bearish', neutral:'Neutral' };
const RISK_LABELS  = { low:'Düşük', medium:'Orta', high:'Yüksek' };

let allAnalyses    = [];
let filteredList   = [];
let currentPage    = 1;
const PAGE_SIZE    = 10;

// ─── TOAST ────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success:'✓', error:'✕', info:'◈' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3800);
}

// ─── FORMAT ───────────────────────────────────────────────────────────────
function fmt(n, dec = 2) {
  if (!n && n !== 0) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function relTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const diff = (Date.now() - d) / 1000;
  if (diff < 3600)  return `${Math.floor(diff/60)} dakika önce`;
  if (diff < 86400) return `${Math.floor(diff/3600)} saat önce`;
  if (diff < 604800)return `${Math.floor(diff/86400)} gün önce`;
  return d.toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'numeric' });
}
function fullDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
    hour:'2-digit', minute:'2-digit',
  });
}
function confClass(c) { return c >= 75 ? 'high' : c >= 50 ? 'medium' : 'low'; }

// ─── LOAD HISTORY ─────────────────────────────────────────────────────────
window.loadHistory = async function() {
  document.getElementById('histList').innerHTML =
    '<div class="hist-loading">Analizler yükleniyor…</div>';
  try {
    const res = await window.apiFetch('/api/analyses?limit=100');
    if (!res.ok) throw new Error();
    const data = await res.json();
    allAnalyses = data.data || [];
    applyFilters();
    updateStats();
  } catch {
    document.getElementById('histList').innerHTML =
      '<div class="hist-empty">Analizler yüklenemedi.</div>';
  }
};

// ─── STATS ────────────────────────────────────────────────────────────────
function updateStats() {
  const bull = allAnalyses.filter(a => a.signal === 'bullish').length;
  const bear = allAnalyses.filter(a => a.signal === 'bearish').length;
  const neut = allAnalyses.filter(a => !a.signal || a.signal === 'neutral').length;
  const total = allAnalyses.length;
  const avgConf = total
    ? Math.round(allAnalyses.reduce((s,a) => s + (a.confidence || 60), 0) / total)
    : 0;

  document.getElementById('statBullish').textContent = bull;
  document.getElementById('statBearish').textContent = bear;
  document.getElementById('statNeutral').textContent = neut;
  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statAvgConf').textContent = avgConf + '%';
}

// ─── FILTERS ──────────────────────────────────────────────────────────────
window.applyFilters = function() {
  const coin   = document.getElementById('filterCoin').value;
  const signal = document.getElementById('filterSignal').value;
  const time   = document.getElementById('filterTime').value;

  filteredList = allAnalyses.filter(a => {
    if (coin   !== 'all' && a.coin_sym !== coin) return false;
    if (signal !== 'all' && (a.signal || 'neutral') !== signal) return false;
    if (time   !== 'all') {
      const d = new Date(a.created_at);
      const now = new Date();
      if (time === 'today' && d.toDateString() !== now.toDateString()) return false;
      if (time === 'week'  && d < new Date(now - 7*86400000))  return false;
      if (time === 'month' && d < new Date(now - 30*86400000)) return false;
    }
    return true;
  });

  currentPage = 1;
  renderPage();
  const count = document.getElementById('filterCount');
  count.textContent = filteredList.length !== allAnalyses.length
    ? `${filteredList.length} sonuç gösteriliyor`
    : '';
};

// ─── RENDER PAGE ──────────────────────────────────────────────────────────
function renderPage() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const end   = start + PAGE_SIZE;
  const page  = filteredList.slice(start, end);
  const totalPages = Math.ceil(filteredList.length / PAGE_SIZE);

  if (!page.length) {
    document.getElementById('histList').innerHTML =
      '<div class="hist-empty">Filtreye uyan analiz bulunamadı.</div>';
    document.getElementById('histPagination').style.display = 'none';
    return;
  }

  document.getElementById('histList').innerHTML = page.map((a, i) =>
    renderCard(a, start + i)
  ).join('');

  // Pagination
  const pag = document.getElementById('histPagination');
  pag.style.display = totalPages > 1 ? 'flex' : 'none';
  document.getElementById('pageInfo').textContent = `Sayfa ${currentPage} / ${totalPages}`;
  document.getElementById('prevBtn').disabled = currentPage === 1;
  document.getElementById('nextBtn').disabled = currentPage === totalPages;
}

window.changePage = function(dir) {
  currentPage += dir;
  renderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ─── RENDER CARD ──────────────────────────────────────────────────────────
function renderCard(a, index) {
  const sig     = a.signal || 'neutral';
  const conf    = a.confidence || 60;
  const color   = COIN_COLORS[a.coin_sym] || 'var(--accent)';
  const avatar  = COIN_AVATARS[a.coin_sym] || a.coin_sym?.[0] || '?';
  const preview = (a.content || '').replace(/[#*`]/g, '').slice(0, 150);
  const change  = a.change_24h;

  return `<div class="hist-card" onclick="openAnalysis(${index})">
    <div class="hist-card-header">
      <div class="hc-left">
        <div class="hc-avatar" style="color:${color};border-color:${color}30;background:${color}15">
          ${avatar}
        </div>
        <div>
          <div class="hc-coin">${a.coin_name} <span style="font-family:var(--mono);font-size:12px;color:var(--fg-muted)">${a.coin_sym}</span></div>
          <div class="hc-date">${relTime(a.created_at)}</div>
        </div>
      </div>
      <div class="hc-right">
        <div class="conf-mini">
          <div class="conf-bar-mini">
            <div class="conf-bar-mini-fill ${confClass(conf)}" style="width:${conf}%"></div>
          </div>
          ${conf}%
        </div>
        <span class="signal-badge ${sig}">
          <span class="sb-dot"></span>
          ${SIG_LABELS[sig]}
        </span>
      </div>
    </div>
    ${preview ? `<div class="hist-card-body">${escHtml(preview)}…</div>` : ''}
    <div class="hist-card-footer">
      <div class="hcf-price">
        ${a.price_usd ? `<span class="hcf-price-val">${fmt(a.price_usd)}</span>` : ''}
        ${change != null ? `<span class="hcf-change ${change >= 0 ? 'up' : 'dn'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%</span>` : ''}
      </div>
      <span class="hcf-view">Tam Analizi Gör →</span>
    </div>
  </div>`;
}

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── ANALYSIS MODAL ───────────────────────────────────────────────────────
window.openAnalysis = function(index) {
  const start = (currentPage - 1) * PAGE_SIZE;
  const a = filteredList[start + index];
  if (!a) return;

  const sig    = a.signal || 'neutral';
  const conf   = a.confidence || 60;
  const risk   = a.risk_level || 'medium';
  const color  = COIN_COLORS[a.coin_sym] || 'var(--accent)';
  const avatar = COIN_AVATARS[a.coin_sym] || a.coin_sym?.[0] || '?';

  const riskColors = { low: 'var(--bullish)', medium: 'var(--neutral)', high: 'var(--bearish)' };

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-coin-row">
      <div class="hc-avatar" style="color:${color};border-color:${color}30;background:${color}15;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;border:1px solid">
        ${avatar}
      </div>
      <div>
        <div class="modal-coin-name">${a.coin_name} <span style="font-family:var(--mono);font-size:14px;color:var(--fg-muted)">(${a.coin_sym})</span></div>
        <div class="modal-date">${fullDate(a.created_at)}</div>
      </div>
    </div>

    <div class="modal-metric-row">
      <div class="mm-card">
        <div class="mm-label">AI Sinyali</div>
        <div class="mm-val"><span class="signal-badge ${sig}"><span class="sb-dot"></span>${SIG_LABELS[sig]}</span></div>
      </div>
      <div class="mm-card">
        <div class="mm-label">Güven Skoru</div>
        <div class="mm-val" style="color:${conf>=75?'var(--bullish)':conf>=50?'var(--neutral)':'var(--bearish)'}">${conf}%</div>
      </div>
      <div class="mm-card">
        <div class="mm-label">Risk Seviyesi</div>
        <div class="mm-val" style="color:${riskColors[risk]}">${RISK_LABELS[risk]}</div>
      </div>
      ${a.price_usd ? `<div class="mm-card">
        <div class="mm-label">Analiz Fiyatı</div>
        <div class="mm-val" style="font-family:var(--mono)">${fmt(a.price_usd)}</div>
      </div>` : ''}
      ${a.change_24h != null ? `<div class="mm-card">
        <div class="mm-label">24s Değişim</div>
        <div class="mm-val" style="color:${a.change_24h>=0?'var(--bullish)':'var(--bearish)'};font-family:var(--mono)">${a.change_24h>=0?'+':''}${a.change_24h.toFixed(2)}%</div>
      </div>` : ''}
    </div>

    <div class="modal-analysis">
      ${formatContent(a.content || '')}
    </div>
  `;

  document.getElementById('analysisModal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeModal = function() {
  document.getElementById('analysisModal').classList.remove('open');
  document.body.style.overflow = '';
};

function formatContent(text) {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^# (.+)$/gm,   '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>')
    .replace(/<p><h3>/g, '<h3>').replace(/<\/h3><\/p>/g, '</h3>');
}

// ─── AUTH HOOKS ───────────────────────────────────────────────────────────
window.onUserLogin = function(user) {
  document.getElementById('loginGate').style.display  = 'none';
  document.getElementById('histContent').style.display = '';
  document.getElementById('authArea').style.display   = 'none';
  document.getElementById('userArea').style.display   = 'flex';
  document.getElementById('userBadge').textContent    = user.username;
  loadHistory();
};

window.onUserLogout = function() {
  document.getElementById('loginGate').style.display  = '';
  document.getElementById('histContent').style.display = 'none';
  document.getElementById('authArea').style.display   = 'flex';
  document.getElementById('userArea').style.display   = 'none';
};
