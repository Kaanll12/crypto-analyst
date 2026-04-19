// js/auth.js — Authentication helpers
'use strict';

const TOKEN_KEY = 'ca_token';
const USER_KEY  = 'ca_user';

// utils.js'den önce yüklenirse window.toast henüz tanımsız olabilir — güvenli wrapper
function toast(msg, type) {
  if (window.toast && window.toast !== toast) return window.toast(msg, type);
  // Fallback: utils.js yüklenene kadar basit console log
  console.info('[toast]', type, msg);
}

window.currentUser = null;

// ─── MODAL HELPERS ─────────────────────────────────────────────────────────
window.openModal = function(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.closeModal = function(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
};
window.switchModal = function(from, to) {
  closeModal(from);
  setTimeout(() => openModal(to), 150);
};

// ─── TOKEN / USER ───────────────────────────────────────────────────────────
function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.currentUser = user;
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.currentUser = null;
}
function getToken() { return localStorage.getItem(TOKEN_KEY); }

// ─── API FETCH ───────────────────────────────────────────────────────────────
// api.js önce yüklenerek window._apiFetchDefined=true işaretini bırakır.
// Çift tanım yerine mevcut apiFetch varsa koru — yoksa (api.js yokken) tanımla.
if (!window._apiFetchDefined) {
  window.apiFetch = function(url, opts) {
    opts = opts || {};
    const token = getToken();
    return fetch((window.API_BASE || '') + url, Object.assign({}, opts, {
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {},
        opts.headers || {}
      ),
    }));
  };
}

// ─── LOGIN ──────────────────────────────────────────────────────────────────
window.login = async function() {
  const btn = document.getElementById('loginBtn');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor…';

  try {
    const res = await fetch((window.API_BASE || '') + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Giriş başarısız.';
      errEl.style.display = '';
      return;
    }

    saveSession(data.token, data.user);
    closeModal('loginModal');
    toast(`Hoş geldiniz, ${data.user.username}!`, 'success');

    if (window.onUserLogin) window.onUserLogin(data.user, data.usage);

  } catch (err) {
    errEl.textContent = 'Bağlantı hatası. Tekrar deneyin.';
    errEl.style.display = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
  }
};

// ─── REGISTER ───────────────────────────────────────────────────────────────
window.register = async function() {
  const btn = document.getElementById('registerBtn');
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('registerError');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor…';

  try {
    const res = await fetch((window.API_BASE || '') + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.errors?.[0]?.msg || data.error || 'Kayıt başarısız.';
      errEl.textContent = msg;
      errEl.style.display = '';
      return;
    }

    saveSession(data.token, data.user);
    closeModal('registerModal');
    toast(`Hesabınız oluşturuldu! Hoş geldiniz, ${data.user.username}!`, 'success');

    if (window.onUserLogin) window.onUserLogin(data.user, data.usage);

  } catch (err) {
    errEl.textContent = 'Bağlantı hatası. Tekrar deneyin.';
    errEl.style.display = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kayıt Ol';
  }
};

// ─── LOGOUT ─────────────────────────────────────────────────────────────────
window.logout = function() {
  clearSession();
  toast('Çıkış yapıldı.', 'info');
  if (window.onUserLogout) window.onUserLogout();
};

// ─── GOOGLE OAUTH BUTONU GÖRÜNÜRLÜĞÜNü KONTROL ET ──────────────────────────
(async function checkGoogleOAuth() {
  try {
    const res = await fetch((window.API_BASE || '') + '/api/oauth/google/status');
    if (res.ok) {
      const data = await res.json();
      if (data.enabled) {
        const loginWrap    = document.getElementById('googleLoginWrap');
        const registerWrap = document.getElementById('googleRegisterWrap');
        if (loginWrap)    loginWrap.style.display    = '';
        if (registerWrap) registerWrap.style.display = '';
      }
    }
  } catch (_) {}
})();

// ─── GOOGLE OAUTH CALLBACK TOKEN İŞLEME ─────────────────────────────────────
(function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const oauthToken = params.get('oauth_token');
  const oauthError = params.get('error');

  if (oauthError) {
    // Hata varsa URL'yi temizle ve toast göster
    window.history.replaceState({}, '', '/');
    // Toast'u biraz bekle (utils.js yüklensin)
    setTimeout(() => toast(decodeURIComponent(oauthError), 'error'), 500);
    return;
  }

  if (!oauthToken) return;

  // Token'ı URL'den al, localStorage'a kaydet
  window.history.replaceState({}, '', '/');

  (async function() {
    try {
      saveSession(oauthToken, { username: params.get('oauth_user') || 'Kullanıcı' });

      // Token geçerliliğini doğrula ve tam kullanıcı bilgisini al
      const res = await fetch((window.API_BASE || '') + '/api/auth/me', {
        headers: { Authorization: `Bearer ${oauthToken}` },
      });

      if (!res.ok) { clearSession(); return; }

      const data = await res.json();
      saveSession(oauthToken, data.user);
      window.currentUser = data.user;

      setTimeout(() => {
        toast(`🎉 Google ile giriş başarılı! Hoş geldiniz, ${data.user.username}!`, 'success');
        if (window.onUserLogin) window.onUserLogin(data.user, data.usage);
      }, 300);

    } catch (_) { clearSession(); }
  })();
})();

// ─── AUTO LOGIN (from stored token) ─────────────────────────────────────────
(async function autoLogin() {
  const token = getToken();
  const storedUser = localStorage.getItem(USER_KEY);
  if (!token || !storedUser) return;

  try {
    const user = JSON.parse(storedUser);
    window.currentUser = user;

    // Verify token & get fresh usage data
    const res = await fetch((window.API_BASE || '') + '/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) { clearSession(); return; }

    const data = await res.json();
    window.currentUser = data.user;
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));

    if (window.onUserLogin) window.onUserLogin(data.user, data.usage);

  } catch (_) { clearSession(); }
})();
