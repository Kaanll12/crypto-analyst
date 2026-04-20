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
  // Kullanıcı adı alanını doldur
  const curUsernameEl = document.getElementById('currentUsername');
  if (curUsernameEl) curUsernameEl.value = user.username || '';

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

// ─── KULLANICI ADI DEĞİŞTİR ───────────────────────────────────────────────
window.changeUsername = async function() {
  const newUsername = (document.getElementById('newUsername')?.value || '').trim();
  if (!newUsername) {
    toast('Yeni kullanıcı adını girin.', 'error'); return;
  }
  if (newUsername.length < 3 || newUsername.length > 30) {
    toast('Kullanıcı adı 3-30 karakter arası olmalı.', 'error'); return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
    toast('Sadece harf, rakam ve _ kullanabilirsin.', 'error'); return;
  }

  const btn = document.getElementById('changeUsernameBtn');
  btn.disabled = true; btn.textContent = 'Güncelleniyor…';

  try {
    const res = await window.apiFetch('/api/auth/change-username', {
      method: 'PUT',
      body: JSON.stringify({ username: newUsername }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Hata oluştu.', 'error'); return;
    }
    toast('Kullanıcı adı güncellendi! ✅', 'success');
    document.getElementById('newUsername').value = '';
    // Profili yenile
    await loadProfile();
    // Local auth verisini güncelle
    const stored = localStorage.getItem('cryptoanalyst_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        u.username = newUsername;
        localStorage.setItem('cryptoanalyst_user', JSON.stringify(u));
      } catch(_) {}
    }
  } catch {
    toast('Bağlantı hatası.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Kullanıcı Adını Güncelle';
  }
};

// ─── VIP YÜKSELTME ────────────────────────────────────────────────────────
window.upgradeVip = async function() {
  try {
    // Paddle yapılandırmasını kontrol et
    const plansRes = await fetch((window.API_BASE || '') + '/api/payments/plans');
    if (!plansRes.ok) throw new Error();
    const plansData = await plansRes.json();

    if (plansData.paddleEnabled) {
      // Paddle aktif → ödeme sayfasına yönlendir
      window.location.href = '/#pricing';
    } else {
      // Demo mod → ücretsiz demo aktivasyonu
      const res = await window.apiFetch('/api/payments/upgrade-demo', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Hata.', 'error'); return; }
      toast(data.message || 'VIP aktifleştirildi!', 'success');
      document.getElementById('upgradeCard').style.display = 'none';
      await loadProfile();
    }
  } catch {
    toast('Bağlantı hatası.', 'error');
  }
};

// ─── TELEGRAM ─────────────────────────────────────────────────────────────
async function loadTelegramStatus() {
  try {
    const res = await window.apiFetch('/api/telegram/status');
    if (!res.ok) {
      document.getElementById('telegramCard').style.display = 'none';
      return;
    }
    const data = await res.json();
    if (!data.enabled) {
      document.getElementById('telegramCard').style.display = 'none';
      return;
    }
    document.getElementById('telegramConnected').style.display    = data.connected ? '' : 'none';
    document.getElementById('telegramDisconnected').style.display = data.connected ? 'none' : '';
  } catch (_) {}
}

window.connectTelegram = async function() {
  const btn = document.getElementById('telegramConnectBtn');
  btn.disabled = true; btn.textContent = 'Kod oluşturuluyor…';
  try {
    const res = await window.apiFetch('/api/telegram/generate-code', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Hata.', 'error'); return; }

    document.getElementById('telegramCodeWrap').style.display = '';
    document.getElementById('telegramCode').textContent = `/start ${data.code}`;
    document.getElementById('telegramStartCmd').textContent = `/start ${data.code}`;
    const botLink = document.getElementById('telegramBotLink');
    botLink.href = data.deepLink;
    botLink.textContent = `@${data.botUsername}`;

    // 15 dk geri sayım
    let remaining = data.expiresIn * 60;
    const interval = setInterval(() => {
      remaining--;
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      const el = document.getElementById('telegramExpiry');
      if (el) el.textContent = `Kod geçerlilik süresi: ${m}:${s.toString().padStart(2,'0')}`;
      if (remaining <= 0) {
        clearInterval(interval);
        document.getElementById('telegramCodeWrap').style.display = 'none';
        btn.disabled = false; btn.textContent = 'Telegram\'ı Bağla';
        toast('Kod süresi doldu. Yeni kod oluştur.', 'error');
      }
    }, 1000);

    // Bağlantıyı periyodik kontrol et
    const checkInterval = setInterval(async () => {
      try {
        const statusRes = await window.apiFetch('/api/telegram/status');
        if (statusRes.ok) {
          const s = await statusRes.json();
          if (s.connected) {
            clearInterval(checkInterval);
            clearInterval(interval);
            document.getElementById('telegramCodeWrap').style.display = 'none';
            document.getElementById('telegramConnected').style.display = '';
            document.getElementById('telegramDisconnected').style.display = 'none';
            toast('🎉 Telegram başarıyla bağlandı!', 'success');
            btn.disabled = false; btn.textContent = 'Telegram\'ı Bağla';
          }
        }
      } catch (_) {}
    }, 5000);

  } catch (_) {
    toast('Bağlantı hatası.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Telegram\'ı Bağla';
  }
};

window.disconnectTelegram = async function() {
  if (!confirm('Telegram bağlantısını kesmek istediğine emin misin?')) return;
  try {
    const res = await window.apiFetch('/api/telegram/disconnect', { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      toast('Telegram bağlantısı kesildi.', 'info');
      document.getElementById('telegramConnected').style.display = 'none';
      document.getElementById('telegramDisconnected').style.display = '';
    } else {
      toast(data.error || 'Hata.', 'error');
    }
  } catch (_) {
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
  loadTelegramStatus();
};

window.onUserLogout = function() {
  document.getElementById('loginGate').style.display    = '';
  document.getElementById('profileContent').style.display = 'none';
  document.getElementById('authArea').style.display     = 'flex';
  document.getElementById('userArea').style.display     = 'none';
};
