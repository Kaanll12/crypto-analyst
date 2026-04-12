// js/news.js — News page logic
'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────
let allNews       = [];
let filteredNews  = [];
let displayedNews = [];
let pageSize      = 15;
let currentPage   = 1;

let filters = {
  sentiment: 'all',
  coin:      'all',
  time:      'all',
  search:    '',
};

const COIN_KEYWORDS = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'eth', 'ether'],
  SOL: ['solana', 'sol'],
  XRP: ['ripple', 'xrp'],
  ADA: ['cardano', 'ada'],
  BNB: ['bnb', 'binance'],
};

const COIN_AVATARS = { BTC:'₿', ETH:'Ξ', SOL:'◎', XRP:'✕', ADA:'₳', BNB:'⬡' };

// ─── TOAST ────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success:'✓', error:'✕', info:'◈' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3800);
}

// ─── SIDEBAR TOGGLE ───────────────────────────────────────────────────────
window.toggleSidebar = function() {
  document.getElementById('sidebar').classList.toggle('open');
};

// ─── FILTERS ──────────────────────────────────────────────────────────────
window.setSentiment = function(val) {
  filters.sentiment = val;
  document.querySelectorAll('#sentimentFilters .filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sentiment === val);
  });
  applyFilters();
};

window.setCoin = function(val) {
  filters.coin = val;
  document.querySelectorAll('#coinFilters .filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.coin === val);
  });
  applyFilters();
};

window.setTime = function(val) {
  filters.time = val;
  document.querySelectorAll('#timeFilters .filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.time === val);
  });
  applyFilters();
};

window.clearFilters = function() {
  setSentiment('all');
  setCoin('all');
  setTime('all');
  document.getElementById('searchInput').value = '';
  filters.search = '';
  applyFilters();
};

window.applyFilters = function() {
  filters.search = document.getElementById('searchInput').value.toLowerCase();

  filteredNews = allNews.filter(n => {
    // Search
    if (filters.search) {
      const hay = (n.title + n.description + n.source + (n.coins || []).join(' ')).toLowerCase();
      if (!hay.includes(filters.search)) return false;
    }
    // Sentiment
    if (filters.sentiment !== 'all' && n.sentiment !== filters.sentiment) return false;
    // Coin
    if (filters.coin !== 'all') {
      const kws = COIN_KEYWORDS[filters.coin] || [filters.coin.toLowerCase()];
      const hay = (n.title + ' ' + n.description).toLowerCase();
      if (!kws.some(k => hay.includes(k))) return false;
    }
    // Time
    if (filters.time !== 'all' && n.pubDate) {
      const pub = new Date(n.pubDate);
      const now = new Date();
      if (filters.time === 'today') {
        if (pub.toDateString() !== now.toDateString()) return false;
      } else if (filters.time === 'week') {
        const weekAgo = new Date(now - 7 * 86400000);
        if (pub < weekAgo) return false;
      }
    }
    return true;
  });

  currentPage = 1;
  renderNews();
  updateCounts();
  updateActiveFilters();
};

function updateActiveFilters() {
  const hasFilter = filters.sentiment !== 'all' || filters.coin !== 'all';
  const wrap = document.getElementById('activeFilters');
  wrap.style.display = hasFilter ? 'flex' : 'none';

  const sentLabels = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
  const sf = document.getElementById('afSentiment');
  const cf = document.getElementById('afCoin');
  sf.textContent = filters.sentiment !== 'all' ? sentLabels[filters.sentiment] : '';
  sf.style.display = filters.sentiment !== 'all' ? '' : 'none';
  cf.textContent = filters.coin !== 'all' ? filters.coin : '';
  cf.style.display = filters.coin !== 'all' ? '' : 'none';
}

function updateCounts() {
  const bull = allNews.filter(n => n.sentiment === 'bullish').length;
  const bear = allNews.filter(n => n.sentiment === 'bearish').length;
  const neut = allNews.filter(n => n.sentiment === 'neutral').length;
  document.getElementById('bullishCount').textContent = bull;
  document.getElementById('bearishCount').textContent = bear;
  document.getElementById('neutralCount').textContent = neut;
}

// ─── DETECT COINS IN ARTICLE ──────────────────────────────────────────────
function detectCoins(title, desc) {
  const text = (title + ' ' + desc).toLowerCase();
  return Object.entries(COIN_KEYWORDS)
    .filter(([, kws]) => kws.some(k => text.includes(k)))
    .map(([sym]) => sym);
}

// ─── DETECT SENTIMENT (simple heuristic) ─────────────────────────────────
function detectSentiment(title, desc) {
  const text = (title + ' ' + desc).toLowerCase();
  const bullishWords = ['surge','soar','rally','gain','bull','high','record','adoption','partnership','launch','upgrade','success','growth','positive','approve','approved','etf','inflow','institutional'];
  const bearishWords = ['crash','drop','fall','decline','bear','low','hack','ban','restrict','fine','lawsuit','concern','risk','fraud','sell','dump','loss','negative','delay','congestion','outage'];
  let score = 0;
  bullishWords.forEach(w => { if (text.includes(w)) score++; });
  bearishWords.forEach(w => { if (text.includes(w)) score--; });
  if (score > 0) return 'bullish';
  if (score < 0) return 'bearish';
  return 'neutral';
}

// ─── RELATIVE TIME ────────────────────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return 'Bilinmiyor';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const diff = (Date.now() - d) / 1000;
  if (diff < 60)   return 'Az önce';
  if (diff < 3600) return `${Math.floor(diff/60)} dakika önce`;
  if (diff < 86400) return `${Math.floor(diff/3600)} saat önce`;
  return `${Math.floor(diff/86400)} gün önce`;
}

// ─── RENDER NEWS ──────────────────────────────────────────────────────────
function renderNews() {
  const feed = document.getElementById('newsFeed');
  const end  = currentPage * pageSize;
  displayedNews = filteredNews.slice(0, end);

  if (!displayedNews.length) {
    feed.innerHTML = `<div class="empty-state">
      <p>Filtreye uyan haber bulunamadı</p>
      <button onclick="clearFilters()">Filtreleri temizle</button>
    </div>`;
    document.getElementById('loadMoreWrap').style.display = 'none';
    return;
  }

  feed.innerHTML = displayedNews.map((n, i) => renderNewsCard(n, i)).join('');

  const loadMore = document.getElementById('loadMoreWrap');
  loadMore.style.display = filteredNews.length > end ? '' : 'none';
}

function renderNewsCard(n, i) {
  const sent = n.sentiment || 'neutral';
  const sentLabels = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
  const coins = n.coins || [];
  const thumbHtml = n.imageUrl
    ? `<div class="news-thumb"><img src="${n.imageUrl}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"/></div>`
    : coins.length
      ? `<div class="news-thumb"><div class="news-thumb-placeholder">${COIN_AVATARS[coins[0]] || '◈'}</div></div>`
      : '';

  return `<article class="news-card" onclick="openNewsDetail(${i})" data-index="${i}">
    <div class="news-card-inner">
      ${thumbHtml}
      <div class="news-body">
        <div class="news-top">
          <h3 class="news-headline">${escHtml(n.title)}</h3>
          <span class="sentiment-tag ${sent}">
            <span class="st-dot"></span>
            ${sentLabels[sent]}
          </span>
        </div>
        ${n.description ? `<p class="news-summary">${escHtml(n.description.slice(0, 180))}…</p>` : ''}
        <div class="news-footer">
          <div class="news-meta">
            <span class="news-source">${escHtml(n.source || '')}</span>
            <span class="news-sep"></span>
            <span class="news-time">${relativeTime(n.pubDate)}</span>
          </div>
          ${coins.length ? `<div class="coin-tags">${coins.slice(0,3).map(c => `<span class="coin-tag">${c}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>
  </article>`;
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── LOAD MORE ────────────────────────────────────────────────────────────
window.loadMore = function() {
  currentPage++;
  renderNews();
};

// ─── NEWS DETAIL MODAL ────────────────────────────────────────────────────
window.openNewsDetail = function(index) {
  const n = displayedNews[index];
  if (!n) return;

  const sent = n.sentiment || 'neutral';
  const sentLabels = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
  const coins = n.coins || [];

  document.getElementById('newsModalContent').innerHTML = `
    <div class="detail-source-row">
      <span class="sentiment-tag ${sent}"><span class="st-dot"></span>${sentLabels[sent]}</span>
      <span class="news-source">${escHtml(n.source || '')}</span>
      <span class="news-sep"></span>
      <span class="news-time">${relativeTime(n.pubDate)}</span>
      ${coins.length ? `<div class="coin-tags">${coins.map(c=>`<span class="coin-tag">${c}</span>`).join('')}</div>` : ''}
    </div>
    <h2 class="detail-headline">${escHtml(n.title)}</h2>
    ${n.description ? `<p class="detail-summary">${escHtml(n.description)}</p>` : ''}
    <div class="detail-commentary" id="detailCommentary">
      <div class="detail-commentary-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        AI Türkçe Analizi
      </div>
      <div class="detail-commentary-body" id="detailBody">
        <div class="commentary-loading">Analiz yükleniyor…</div>
      </div>
    </div>
    ${n.link ? `<a href="${n.link}" target="_blank" rel="noopener" class="detail-link">
      Haberin Tamamını Oku
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
    </a>` : ''}
  `;

  document.getElementById('newsModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Eğer commentary zaten varsa göster
  if (n.commentary) {
    renderCommentary(n.commentary);
  } else {
    fetchCommentary(n, index);
  }
};

window.closeNewsModal = function() {
  document.getElementById('newsModal').classList.remove('open');
  document.body.style.overflow = '';
};

function renderCommentary(text) {
  const el = document.getElementById('detailBody');
  if (!el) return;
  el.innerHTML = text
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>')
    .replace(/<p><h3>/g, '<h3>').replace(/<\/h3><\/p>/g, '</h3>');
}

async function fetchCommentary(n, index) {
  try {
    const res = await fetch((window.API_BASE || '') + '/api/news/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: n.title, description: n.description || '', source: n.source || '' }),
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const commentary = data.commentary || '';
    // Cache on object
    displayedNews[index].commentary = commentary;
    allNews.forEach(an => { if (an.title === n.title) an.commentary = commentary; });
    renderCommentary(commentary);
  } catch {
    const el = document.getElementById('detailBody');
    if (el) el.innerHTML = '<span class="commentary-loading">Analiz yüklenemedi.</span>';
  }
}

// ─── LOAD DIGEST ──────────────────────────────────────────────────────────
window.loadDigest = async function(force = false) {
  const body = document.getElementById('digestBody');
  const icon = document.getElementById('digestRefreshIcon');
  if (icon) icon.parentNode.classList.add('spinning');
  body.innerHTML = '<div class="digest-loading">Özet yükleniyor…</div>';

  try {
    const url = (window.API_BASE || '') + '/api/news/digest' + (force ? '?force=1' : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Digest error');
    const data = await res.json();
    body.innerHTML = (data.digest || '').replace(/\n/g, '<br>');
  } catch {
    body.innerHTML = '<div class="digest-loading">Özet yüklenemedi.</div>';
  } finally {
    if (icon) icon.parentNode.classList.remove('spinning');
  }
};

// ─── FETCH NEWS ───────────────────────────────────────────────────────────
async function fetchNews() {
  try {
    const coinParam = filters.coin !== 'all' ? `?coin=${filters.coin}` : '?limit=50';
    const res = await fetch((window.API_BASE || '') + '/api/news' + coinParam);
    if (!res.ok) throw new Error('News fetch failed');
    const data = await res.json();

    allNews = (data.data || []).map(n => ({
      ...n,
      coins:     n.coins || detectCoins(n.title, n.description || ''),
      sentiment: n.sentiment || detectSentiment(n.title, n.description || ''),
    }));

    applyFilters();
    updateCounts();
  } catch (err) {
    document.getElementById('newsFeed').innerHTML =
      `<div class="empty-state"><p>Haberler yüklenemedi. İnternet bağlantısını kontrol edin.</p></div>`;
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────
(async function init() {
  await fetchNews();
  await loadDigest();
  // Auto-refresh every 5 minutes
  setInterval(fetchNews, 5 * 60 * 1000);
})();
