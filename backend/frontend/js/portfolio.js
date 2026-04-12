// js/portfolio.js — Portföy takipçisi
'use strict';

const COIN_AVATARS = { BTC:'₿', ETH:'Ξ', SOL:'◎', XRP:'✕', ADA:'₳', BNB:'⬡' };
const COIN_COLORS  = { BTC:'#F7931A', ETH:'#627EEA', SOL:'#9945FF', XRP:'#00AAE4', ADA:'#0D1E7E', BNB:'#F3BA2F' };

let portfolioData = null;

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
  if (n === undefined || n === null || isNaN(n)) return '—';
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(n) {
  if (!n && n !== 0) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
function pnlClass(n) { return n >= 0 ? 'profit' : 'loss'; }

// ─── LOAD PORTFOLIO ───────────────────────────────────────────────────────
async function loadPortfolio() {
  try {
    const res = await window.apiFetch('/api/portfolio/summary');
    if (!res.ok) throw new Error('API error');
    portfolioData = await res.json();
    renderSummary(portfolioData);
    renderCoinCards(portfolioData.coins || []);
    await loadPositions();
  } catch {
    document.getElementById('coinCards').innerHTML =
      '<div class="pf-empty">Portföy yüklenemedi.</div>';
  }
}

function renderSummary(d) {
  const pnlCls = pnlClass(d.pnl || 0);
  document.getElementById('scTotalValue').textContent = fmt(d.totalValue);
  document.getElementById('scTotalSub').textContent   = `${(d.coins || []).length} coin`;
  document.getElementById('scInvested').textContent   = fmt(d.totalInvested);
  document.getElementById('scPnl').className          = `sc-value ${pnlCls}`;
  document.getElementById('scPnl').textContent        = (d.pnl >= 0 ? '+' : '') + fmt(d.pnl);
  document.getElementById('scPnlPct').textContent     = fmtPct(d.pnlPct);
  document.getElementById('scPositions').textContent  = (d.coins || []).length;
  const card = document.getElementById('scPnlCard');
  card.classList.toggle('profit', d.pnl >= 0);
  card.classList.toggle('loss',   d.pnl < 0);
}

function renderCoinCards(coins) {
  if (!coins.length) {
    document.getElementById('coinCards').innerHTML =
      '<div class="pf-empty">Henüz pozisyon yok.<br>Sağ panelden coin ekleyebilirsin.</div>';
    return;
  }

  document.getElementById('coinCards').innerHTML = coins.map(c => {
    const pCls = pnlClass(c.pnl);
    const barPct = Math.min(Math.abs(c.pnlPct || 0), 100);
    const color = COIN_COLORS[c.coinSym] || 'var(--accent)';
    return `<div class="coin-card">
      <div class="cc-header">
        <div class="cc-coin">
          <div class="cc-avatar" style="color:${color};border-color:${color}30;background:${color}15">
            ${COIN_AVATARS[c.coinSym] || c.coinSym[0]}
          </div>
          <div>
            <div class="cc-name">${c.coinName}</div>
            <div class="cc-sym">${c.coinSym}</div>
          </div>
        </div>
        <div class="cc-pnl">
          <div class="cc-pnl-val ${pCls}">${c.pnl >= 0 ? '+' : ''}${fmt(c.pnl)}</div>
          <div class="cc-pnl-pct ${pCls}">${fmtPct(c.pnlPct)}</div>
        </div>
      </div>
      <div class="cc-stats">
        <div class="cc-stat">
          <div class="cc-stat-label">Miktar</div>
          <div class="cc-stat-val">${c.totalAmount.toFixed(4)}</div>
        </div>
        <div class="cc-stat">
          <div class="cc-stat-label">Ort. Alım</div>
          <div class="cc-stat-val">${fmt(c.avgBuyPrice)}</div>
        </div>
        <div class="cc-stat">
          <div class="cc-stat-label">Güncel</div>
          <div class="cc-stat-val">${fmt(c.currentPrice)}</div>
        </div>
        <div class="cc-stat">
          <div class="cc-stat-label">Değer</div>
          <div class="cc-stat-val">${fmt(c.currentValue)}</div>
        </div>
      </div>
      <div class="cc-bar-wrap">
        <div class="cc-bar-label">
          <span>Yatırım: ${fmt(c.totalInvested)}</span>
          <span>${c.change24h >= 0 ? '▲' : '▼'} 24s: ${fmtPct(c.change24h)}</span>
        </div>
        <div class="cc-bar">
          <div class="cc-bar-fill ${pCls}" style="width:${barPct}%"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function loadPositions() {
  try {
    const res = await window.apiFetch('/api/portfolio');
    if (!res.ok) throw new Error();
    const data = await res.json();
    const rows = data.data || [];

    // Güncel fiyatları portfolioData'dan al
    const priceMap = {};
    (portfolioData?.coins || []).forEach(c => { priceMap[c.coinId] = c.currentPrice; });

    if (!rows.length) {
      document.getElementById('positionList').innerHTML =
        '<div class="pf-empty">Henüz pozisyon yok.</div>';
      return;
    }

    document.getElementById('positionList').innerHTML = rows.map(r => {
      const currentPrice = priceMap[r.coin_id] || 0;
      const currentVal = r.amount * currentPrice;
      const invested   = r.amount * r.buy_price;
      const pnl        = currentVal - invested;
      const pCls       = pnlClass(pnl);
      return `<div class="position-item">
        <div class="pi-left">
          <div class="pi-sym">${r.coin_sym}</div>
          <div class="pi-info">
            <div class="pi-amount">${r.amount} ${r.coin_sym}</div>
            <div class="pi-date">${r.buy_date}</div>
          </div>
        </div>
        <div class="pi-right">
          <div class="pi-buy-price">${fmt(r.buy_price)}</div>
          <div class="pi-pnl ${pCls}">${pnl >= 0 ? '+' : ''}${fmt(pnl)}</div>
          <button class="pi-delete" onclick="deletePosition('${r.id}')" title="Sil">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>`;
    }).join('');
  } catch {
    document.getElementById('positionList').innerHTML =
      '<div class="pf-empty">Pozisyonlar yüklenemedi.</div>';
  }
}

// ─── ADD POSITION ─────────────────────────────────────────────────────────
window.addPosition = async function() {
  const coinId   = document.getElementById('addCoin').value;
  const amount   = parseFloat(document.getElementById('addAmount').value);
  const buyPrice = parseFloat(document.getElementById('addBuyPrice').value);
  const buyDate  = document.getElementById('addBuyDate').value;
  const notes    = document.getElementById('addNotes').value;

  if (!amount || !buyPrice || !buyDate) {
    toast('Miktar, fiyat ve tarih zorunlu.', 'error'); return;
  }

  const btn = document.getElementById('addBtn');
  btn.disabled = true; btn.textContent = 'Ekleniyor…';

  try {
    const res = await window.apiFetch('/api/portfolio', {
      method: 'POST',
      body: JSON.stringify({ coinId, amount, buyPrice, buyDate, notes }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Hata.', 'error'); return; }
    toast('Pozisyon eklendi!', 'success');
    document.getElementById('addAmount').value   = '';
    document.getElementById('addBuyPrice').value = '';
    document.getElementById('addNotes').value    = '';
    await loadPortfolio();
  } catch { toast('Bağlantı hatası.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Pozisyon Ekle'; }
};

// ─── DELETE POSITION ──────────────────────────────────────────────────────
window.deletePosition = async function(id) {
  if (!confirm('Bu pozisyonu silmek istediğinize emin misiniz?')) return;
  try {
    const res = await window.apiFetch(`/api/portfolio/${id}`, { method: 'DELETE' });
    if (res.ok) { toast('Pozisyon silindi.', 'info'); await loadPortfolio(); }
  } catch { toast('Hata.', 'error'); }
};

// ─── REFRESH ──────────────────────────────────────────────────────────────
window.refreshPortfolio = async function() {
  const icon = document.getElementById('refreshIcon');
  if (icon) icon.style.animation = 'spin .8s linear infinite';
  await loadPortfolio();
  await loadAlerts();
  if (icon) icon.style.animation = '';
};

// ─── ALERTS ───────────────────────────────────────────────────────────────
async function loadAlerts() {
  try {
    const res = await window.apiFetch('/api/alerts');
    if (!res.ok) return;
    const data = await res.json();
    const rows = data.data || [];

    document.getElementById('alertCount').textContent = rows.filter(r => r.is_active).length;

    if (!rows.length) {
      document.getElementById('alertList').innerHTML =
        '<div class="pf-loading small">Alarm yok</div>';
      return;
    }

    document.getElementById('alertList').innerHTML = rows.map(r => {
      const condLabel = r.condition === 'above' ? '↑ Üzerine' : '↓ Altına';
      return `<div class="alert-item ${!r.is_active ? 'alert-triggered' : ''}">
        <div>
          <div class="ai-sym">${r.coin_sym}</div>
          <div class="ai-cond">${condLabel} çıkınca</div>
        </div>
        <div class="ai-price">${fmt(r.target_price)}</div>
        <button class="ai-delete" onclick="deleteAlert('${r.id}')">✕</button>
      </div>`;
    }).join('');
  } catch {}
}

window.addAlert = async function() {
  const coinRaw    = document.getElementById('alertCoin').value;
  const [coinId, coinSym] = coinRaw.split('|');
  const condition  = document.getElementById('alertCondition').value;
  const targetPrice = parseFloat(document.getElementById('alertPrice').value);

  if (!targetPrice) { toast('Hedef fiyat girin.', 'error'); return; }

  try {
    const res = await window.apiFetch('/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ coinId, coinSym, condition, targetPrice }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Hata.', 'error'); return; }
    toast('Alarm kuruldu!', 'success');
    document.getElementById('alertPrice').value = '';
    await loadAlerts();
  } catch { toast('Bağlantı hatası.', 'error'); }
};

window.deleteAlert = async function(id) {
  try {
    const res = await window.apiFetch(`/api/alerts/${id}`, { method: 'DELETE' });
    if (res.ok) { toast('Alarm silindi.', 'info'); await loadAlerts(); }
  } catch {}
};

// ─── AUTH HOOKS ───────────────────────────────────────────────────────────
window.onUserLogin = async function(user) {
  document.getElementById('loginGate').style.display  = 'none';
  document.getElementById('pfContent').style.display  = '';
  document.getElementById('authArea').style.display   = 'none';
  document.getElementById('userArea').style.display   = 'flex';
  document.getElementById('userBadge').textContent    = user.username;

  // Bugünün tarihini default yap
  document.getElementById('addBuyDate').value = new Date().toISOString().split('T')[0];

  await loadPortfolio();
  await loadAlerts();
};

window.onUserLogout = function() {
  document.getElementById('loginGate').style.display = '';
  document.getElementById('pfContent').style.display = 'none';
  document.getElementById('authArea').style.display  = 'flex';
  document.getElementById('userArea').style.display  = 'none';
};

// ─── INIT ─────────────────────────────────────────────────────────────────
// Auto-refresh every 60 seconds
setInterval(async () => {
  if (window.currentUser) await loadPortfolio();
}, 60000);
