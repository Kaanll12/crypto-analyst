// js/api.js — API base URL config
'use strict';

// Backend hangi adreste?
// - node server.js ile çalışıyorsa (port 3001) → relative URL yeter ('')
// - Frontend ayrı port'ta açıksa (Live Server, npx serve vb.) → tam URL gerekir
(function () {
  const port  = window.location.port;
  const proto = window.location.protocol;
  const host  = window.location.hostname;

  let base = '';

  if (proto === 'file:') {
    // Dosya olarak açılmış — backend localhost:3001'de varsayılır
    base = 'http://localhost:3001';
  } else if ((host === 'localhost' || host === '127.0.0.1') && port !== '3001') {
    // Farklı localhost port'u (Live Server: 5500, Vite: 5173, vb.)
    base = 'http://' + host + ':3001';
  }
  // Aksi hâlde (production veya port 3001) boş kalır — relative URL çalışır

  window.API_BASE = base;
})();

// ─── MERKEZ apiFetch — auth.js bu tanımın üzerine YAZMASIN ──────────────
// Token okuma: auth.js yüklenmeden önce de çalışabilmesi için localStorage'dan direkt oku.
window.apiFetch = function (url, opts) {
  opts = opts || {};
  var token = localStorage.getItem('ca_token');
  return fetch(window.API_BASE + url, Object.assign({}, opts, {
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { 'Authorization': 'Bearer ' + token } : {},
      opts.headers || {}
    ),
  }));
};
window._apiFetchDefined = true; // auth.js kontrolü için işaret
