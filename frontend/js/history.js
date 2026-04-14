// js/history.js — Analiz Geçmişi
'use strict';

// COIN_AVATARS, COIN_COLORS, toast, escHtml, formatMarkdown → utils.js'den geliyor
var COIN_AVATARS = window.COIN_AVATARS;
var COIN_COLORS  = window.COIN_COLORS;
const SIG_LABELS   = { bullish:'Bullish', bearish:'Bearish', neutral:'Neutral' };
const RISK_LABELS  = { low:'Düşük', medium:'Orta', high:'Yüksek' };

let allAnalyses    = [];
let filteredList   = [];
let currentPage    = 1;
const PAGE_SIZE    = 10;

// ─── FORMAT ───────────────────────────────────────────────────────────────
function fmt(n, dec) {
  dec = (dec !== undefined) ? dec : 2;
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

// ─── BUILD API URL FROM FILTERS ───────────────────────────────────────────
function buildApiUrl(page) {
  const coin   = document.getElementById('filterCoin')?.value   || 'all';
  const signal = document.getElementById('filterSignal')?.value || 'all';
  const from   = document.getElementById('filterFrom')?.value   || '';
  const to     = document.getElementById('filterTo')?.value     || '';

  const params = new URLSearchParams();
  params.set('limit', '50');
  params.set('page', page || 1);
  if (coin   !== 'all') params.set('coin',   coin);
  if (signal !== 'all') params.set('signal', signal);
  if (from)             params.set('from',   from);
  if (to)               params.set('to',     to);

  return '/api/analyses?' + params.toString();
}

// ─── SYNC FILTERS ↔ URL PARAMS ────────────────────────────────────────────
function readFiltersFromURL() {
  const sp = new URLSearchParams(window.location.search);
  const coin   = sp.get('coin')   || 'all';
  const signal = sp.get('signal') || 'all';
  const from   = sp.get('from')   || '';
  const to     = sp.get('to')     || '';

  const coinEl   = document.getElementById('filterCoin');
  const signalEl = document.getElementById('filterSignal');
  const fromEl   = document.getElementById('filterFrom');
  const toEl     = document.getElementById('filterTo');

  if (coinEl)   coinEl.value   = coin;
  if (signalEl) signalEl.value = signal;
  if (fromEl)   fromEl.value   = from;
  if (toEl)     toEl.value     = to;
}

function writeFiltersToURL() {
  const coin   = document.getElementById('filterCoin')?.value   || 'all';
  const signal = document.getElementById('filterSignal')?.value || 'all';
  const from   = document.getElementById('filterFrom')?.value   || '';
  const to     = document.getElementById('filterTo')?.value     || '';

  const sp = new URLSearchParams();
  if (coin   !== 'all') sp.set('coin',   coin);
  if (signal !== 'all') sp.set('signal', signal);
  if (from)             sp.set('from',   from);
  if (to)               sp.set('to',     to);

  const newUrl = window.location.pathname + (sp.toString() ? '?' + sp.toString() : '');
  history.replaceState(null, '', newUrl);
}

// ─── LOAD HISTORY ─────────────────────────────────────────────────────────
window.loadHistory = async function(page) {
  page = page || 1;
  currentPage = page;
  document.getElementById('histList').innerHTML =
    '<div class="hist-loading">Analizler yükleniyor…</div>';
  try {
    const url = buildApiUrl(page);
    const res = await window.apiFetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    allAnalyses  = data.data || [];
    filteredList = allAnalyses; // server-side filtered
    // pagination meta from server
    _serverPagination = data.pagination;
    updateStats();
    renderPageDirect();
    const count = document.getElementById('filterCount');
    count.textContent = data.pagination?.total > data.data?.length
      ? `${data.pagination.total} sonuçtan ${data.data.length} gösteriliyor`
      : `${data.data.length} sonuç`;
  } catch {
    document.getElementById('histList').innerHTML =
      '<div class="hist-empty">Analizler yüklenemedi.</div>';
  }
};

// Server tarafından dönen toplam sayfa bilgisi
let _serverPagination = null;

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
  writeFiltersToURL();
  loadHistory(1); // sunucu tarafı filtreleme — yeniden yükle
};

window.clearFilters = function() {
  const coinEl   = document.getElementById('filterCoin');
  const signalEl = document.getElementById('filterSignal');
  const fromEl   = document.getElementById('filterFrom');
  const toEl     = document.getElementById('filterTo');
  if (coinEl)   coinEl.value   = 'all';
  if (signalEl) signalEl.value = 'all';
  if (fromEl)   fromEl.value   = '';
  if (toEl)     toEl.value     = '';
  writeFiltersToURL();
  loadHistory(1);
};

// ─── RENDER PAGE (client-side, current page items) ────────────────────────
function renderPage() {
  // Legacy: for modal index
  renderPageDirect();
}

function renderPageDirect() {
  if (!filteredList.length) {
    document.getElementById('histList').innerHTML =
      '<div class="hist-empty">Filtreye uyan analiz bulunamadı.</div>';
    document.getElementById('histPagination').style.display = 'none';
    return;
  }

  document.getElementById('histList').innerHTML = filteredList.map((a, i) =>
    renderCard(a, i)
  ).join('');

  // Server-side pagination
  const pag = document.getElementById('histPagination');
  const sp  = _serverPagination;
  if (sp && sp.pages > 1) {
    pag.style.display = 'flex';
    document.getElementById('pageInfo').textContent = `Sayfa ${sp.page} / ${sp.pages}`;
    document.getElementById('prevBtn').disabled = sp.page <= 1;
    document.getElementById('nextBtn').disabled = sp.page >= sp.pages;
  } else {
    pag.style.display = 'none';
  }
}

window.changePage = function(dir) {
  const sp = _serverPagination || { page: 1 };
  loadHistory(sp.page + dir);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ─── CSV EXPORT ───────────────────────────────────────────────────────────
window.downloadCSV = async function() {
  // Tüm filtrelenmiş verileri çek (limit yüksek)
  const coin   = document.getElementById('filterCoin')?.value   || 'all';
  const signal = document.getElementById('filterSignal')?.value || 'all';
  const from   = document.getElementById('filterFrom')?.value   || '';
  const to     = document.getElementById('filterTo')?.value     || '';

  const params = new URLSearchParams();
  params.set('limit', '500');
  params.set('page', '1');
  if (coin   !== 'all') params.set('coin',   coin);
  if (signal !== 'all') params.set('signal', signal);
  if (from)             params.set('from',   from);
  if (to)               params.set('to',     to);

  try {
    const res  = await window.apiFetch('/api/analyses?' + params.toString());
    if (!res.ok) throw new Error('API hatası');
    const data = await res.json();
    const rows = data.data || [];
    if (!rows.length) { toast('Dışa aktarılacak veri yok.', 'error'); return; }

    const headers = ['id','coin_sym','coin_name','signal','confidence','risk_level','price_usd','change_24h','created_at'];
    const csvLines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => {
        const val = r[h] != null ? r[h] : '';
        // Virgül veya satır sonu içeriyorsa tırnak içine al
        const s = String(val).replace(/"/g, '""');
        return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
      }).join(',')),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cryptoanalyst-gecmis-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`${rows.length} analiz CSV olarak indirildi.`, 'success');
  } catch (e) {
    toast('CSV indirme başarısız: ' + e.message, 'error');
  }
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

// escHtml → utils.js'den geliyor (window.escHtml)
var escHtml = window.escHtml;

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

// formatContent → utils.js'deki window.formatMarkdown kullanılıyor
var formatContent = window.formatMarkdown;

// ─── AUTH HOOKS ───────────────────────────────────────────────────────────
window.onUserLogin = function(user) {
  document.getElementById('loginGate').style.display  = 'none';
  document.getElementById('histContent').style.display = '';
  document.getElementById('authArea').style.display   = 'none';
  document.getElementById('userArea').style.display   = 'flex';
  document.getElementById('userBadge').textContent    = user.username;
  readFiltersFromURL(); // URL'deki filter parametrelerini oku
  loadHistory(1);
};

window.onUserLogout = function() {
  document.getElementById('loginGate').style.display  = '';
  document.getElementById('histContent').style.display = 'none';
  document.getElementById('authArea').style.display   = 'flex';
  document.getElementById('userArea').style.display   = 'none';
};
