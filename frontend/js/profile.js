// js/profile.js — Kullanıcı profili & şifre değiştirme
'use strict';

// ─── KULLANICI BİLGİLERİNİ YÜKLE ──────────────────────────────────────────
async function loadProfile() {
  try {
    const res = await window.apiFetch('/api/auth/me');
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderProfile(data.user, data.usage);
  } catch {
    toast('Profil bilgileri yüklenemedi.', 'error');
  }
}

function renderProfile(user, usage) {
  // Avatar: kullanıcı adının ilk harfi
  const initials = (user.username || '?')[0].toUpperCase();
  document.getElementById('profileAvatar').textContent    = initials;
  document.getElementById('profileUsername').textContent  = user.username;
  document.getElementById('profileEmail').textContent     = user.email;

  // Üyelik tarihi
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })
    : '—';
  document.getElementById('profileJoined').textContent    = joined;

  const lastLogin = user.last_login
    ? window.relativeTime(user.last_login)
    : 'Bilinmiyor';
  document.getElementById('profileLastLogin').textContent = lastLogin;

  // Rol etiketi
  const roleEl = document.getElementById('profileRole');
  const planEl = document.getElementById('profilePlan');
  const role   = user.role || 'user';
  roleEl.textContent = role.toUpperCase();
  roleEl.className   = `role-badge role-${role}`;

  if (role === 'admin') {
    planEl.textContent = 'Admin (∞)';
    document.getElementById('adminCard').style.display = '';
  } else if (role === 'vip') {
    planEl.textContent = 'VIP (∞)';
  } else {
    planEl.textContent = 'Ücretsiz';
    document.getElementById('upgradeCard').style.display = '';
  }

  // Kullanım çubuğu
  if (usage && usage.limit !== '∞') {
    const used  = usage.used   || 0;
    const limit = usage.limit  || 5;
    const pct   = Math.min(100, Math.round((used / limit) * 100));
    const fill  = document.getElementById('usageBar');
    fill.style.width = pct + '%';
    fill.className   = 'usage-bar-fill' + (pct >= 90 ? ' danger' : pct >= 60 ? ' warn' : '');
    document.getElementById('usageTxt').textContent = `${used} / ${limit}`;
  } else {
    document.getElementById('usageTxt').textContent = 'Sınırsız';
    const fill = document.getElementById('usageBar');
    fill.style.width = '100%';
    fill.style.background = 'var(--bullish)';
  }
}

// ─── ŞİFRE DEĞİŞTİR ──────────────────────────────────────────────────────
window.changePassword = async function() {
  const current  = document.getElementById('currentPass').value;
  const newPass  = document.getElementById('newPass').value;
  const confirm  = document.getElementById('confirmPass').value;

  if (!current || !newPass || !confirm) {
    toast('Tüm alanları doldurun.', 'error'); return;
  }
  if (newPass !== confirm) {
    toast('Yeni şifreler eşleşmiyor.', 'error'); return;
  }
  if (newPass.length < 8 || !/[A-Z]/.test(newPass) || !/[0-9]/.test(newPass)) {
    toast('Şifre: en az 8 karakter, 1 büyük harf, 1 rakam.', 'error'); return;
  }

  const btn = document.getElementById('changePwdBtn');
  btn.disabled = true; btn.textContent = 'Güncelleniyor…';

  try {
    const res = await window.apiFetch('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Hata oluştu.', 'error'); return;
    }
    toast('Şifre başarıyla güncellendi! 🔒', 'success');
    document.getElementById('currentPass').value  = '';
    document.getElementById('newPass').value      = '';
    document.getElementById('confirmPass').value  = '';
  } catch {
    toast('Bağlantı hatası.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Şifreyi Güncelle';
  }
};

// ─── VIP YÜKSELTME ────────────────────────────────────────────────────────
window.upgradeVip = async function() {
  try {
    const res = await window.apiFetch('/api/auth/upgrade-vip', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Hata.', 'error'); return; }
    toast(data.message || 'VIP aktifleştirildi!', 'success');
    document.getElementById('upgradeCard').style.display = 'none';
    await loadProfile();
  } catch {
    toast('Bağlantı hatası.', 'error');
  }
};

// ─── AUTH HOOKS ───────────────────────────────────────────────────────────
window.onUserLogin = function(user) {
  document.getElementById('loginGate').style.display    = 'none';
  document.getElementById('profileContent').style.display = '';
  document.getElementById('authArea').style.display     = 'none';
  document.getElementById('userArea').style.display     = 'flex';
  document.getElementById('userBadge').textContent      = user.username;
  loadProfile();
};

window.onUserLogout = function() {
  document.getElementById('loginGate').style.display    = '';
  document.getElementById('profileContent').style.display = 'none';
  document.getElementById('authArea').style.display     = 'flex';
  document.getElementById('userArea').style.display     = 'none';
};
