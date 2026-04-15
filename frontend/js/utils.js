// js/utils.js — Ortak yardımcı fonksiyonlar ve sabitler
// Tüm sayfalarda kullanılan tekrarlayan kod buradan merkezi olarak sağlanır.
'use strict';

// ─── TEMA YÖNETİMİ ───────────────────────────────────────────────────────────
(function() {
  var saved = localStorage.getItem('theme');
  // Sistem tercihine bak (dark/light)
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = saved || (prefersDark ? 'dark' : 'light');
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

window.toggleTheme = function() {
  var current = document.documentElement.getAttribute('data-theme');
  var next = (current === 'light') ? 'dark' : 'light';
  if (next === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  localStorage.setItem('theme', next);
  // Toggle butonundaki ikonları güncelle
  document.querySelectorAll('.theme-toggle').forEach(function(btn) {
    btn.title     = next === 'light' ? 'Dark moda geç' : 'Light moda geç';
    btn.innerHTML = next === 'light' ? '🌙' : '☀️';
  });
};

// Sayfa yüklenince toggle buton ikonlarını ayarla
document.addEventListener('DOMContentLoaded', function() {
  var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  document.querySelectorAll('.theme-toggle').forEach(function(btn) {
    btn.innerHTML = isDark ? '☀️' : '🌙';
    btn.title     = isDark ? 'Light moda geç' : 'Dark moda geç';
  });
});

// ─── COIN SABİTLERİ ──────────────────────────────────────────────────────────
window.COIN_AVATARS = { BTC:'₿', ETH:'Ξ', SOL:'◎', XRP:'✕', ADA:'₳', BNB:'⬡' };
window.COIN_COLORS  = {
  BTC:'#F7931A', ETH:'#627EEA', SOL:'#9945FF',
  XRP:'#00AAE4', ADA:'#0D1E7E', BNB:'#F3BA2F',
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
window.toast = function(msg, type) {
  type = type || 'info';
  var icons = { success:'✓', error:'✕', info:'◈' };
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span class="toast-icon">' + icons[type] + '</span><span>' + msg + '</span>';
  container.appendChild(el);
  setTimeout(function() {
    el.classList.add('out');
    setTimeout(function() { el.remove(); }, 300);
  }, 3800);
};

// ─── MARKDOWN → HTML (analiz içeriği için) ───────────────────────────────────
window.formatMarkdown = function(text) {
  if (!text) return '';
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^# (.+)$/gm,   '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,    '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>')
    .replace(/<p><h3>/g, '<h3>').replace(/<\/h3><\/p>/g, '</h3>');
};

// ─── HTML ESCAPE ──────────────────────────────────────────────────────────────
window.escHtml = function(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
};

// ─── PARA BİÇİMLENDİRME ───────────────────────────────────────────────────────
window.fmtUsd = function(n, dec) {
  dec = (dec !== undefined) ? dec : 2;
  if (n === undefined || n === null || isNaN(n)) return '—';
  return '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
};

// ─── GÖRECELI ZAMAN ──────────────────────────────────────────────────────────
window.relativeTime = function(dateStr) {
  if (!dateStr) return 'Bilinmiyor';
  var d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  var diff = (Date.now() - d) / 1000;
  if (diff < 60)    return 'Az önce';
  if (diff < 3600)  return Math.floor(diff / 60)   + ' dakika önce';
  if (diff < 86400) return Math.floor(diff / 3600)  + ' saat önce';
  return Math.floor(diff / 86400) + ' gün önce';
};
