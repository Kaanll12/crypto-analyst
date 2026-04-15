// js/notifications.js — Tarayıcı Push Bildirim Yöneticisi
'use strict';

const NOTIFY_KEY = 'ca_notify_enabled';

// ─── YARDIMCI ────────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// ─── İZİN DURUMU ─────────────────────────────────────────────────────────────
window.getNotifyStatus = function() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
};

// ─── İZİN İSTE + ABONE OL ────────────────────────────────────────────────────
window.requestNotifyPermission = async function() {
  if (!('Notification' in window)) {
    window.toast('Bu tarayıcı bildirimleri desteklemiyor.', 'error');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    window.toast('Bildirim izni reddedildi.', 'error');
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    // VAPID public key — backend'deki VAPID_PUBLIC_KEY ile aynı olmalı
    const vapidRes = await fetch((window.API_BASE || '') + '/api/notifications/vapid-public-key');
    if (!vapidRes.ok) throw new Error('VAPID key alınamadı');
    const { publicKey } = await vapidRes.json();

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // Backend'e subscription kaydet
    const saveRes = await window.apiFetch('/api/notifications/subscribe', {
      method: 'POST',
      body:   JSON.stringify(subscription),
    });

    if (!saveRes.ok) throw new Error('Abonelik kaydedilemedi');

    localStorage.setItem(NOTIFY_KEY, 'true');
    window.toast('🔔 Bildirimler aktif! Fiyat alarmları artık çalışacak.', 'success');
    updateNotifyUI(true);
    return true;

  } catch (err) {
    console.error('Push subscription error:', err);
    window.toast('Bildirim aboneliği başarısız. Tekrar deneyin.', 'error');
    return false;
  }
};

// ─── ABONELIĞI İPTAL ET ──────────────────────────────────────────────────────
window.unsubscribeNotify = async function() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await window.apiFetch('/api/notifications/unsubscribe', {
        method: 'POST',
        body:   JSON.stringify({ endpoint: sub.endpoint }),
      });
    }
    localStorage.removeItem(NOTIFY_KEY);
    window.toast('Bildirimler kapatıldı.', 'info');
    updateNotifyUI(false);
  } catch (err) {
    console.error('Unsubscribe error:', err);
  }
};

// ─── ANİK TEST BİLDİRİMİ ────────────────────────────────────────────────────
window.sendTestNotification = async function() {
  try {
    const res = await window.apiFetch('/api/notifications/test', { method: 'POST' });
    if (res.ok) {
      window.toast('Test bildirimi gönderildi!', 'success');
    } else {
      window.toast('Test bildirimi gönderilemedi.', 'error');
    }
  } catch (_) {
    window.toast('Bağlantı hatası.', 'error');
  }
};

// ─── UI GÜNCELLE ─────────────────────────────────────────────────────────────
function updateNotifyUI(enabled) {
  const btn = document.getElementById('notifyToggleBtn');
  if (!btn) return;
  btn.textContent = enabled ? '🔕 Bildirimleri Kapat' : '🔔 Bildirimleri Aç';
  btn.className   = enabled ? 'btn-ghost active' : 'btn-ghost';
  btn.onclick     = enabled ? window.unsubscribeNotify : window.requestNotifyPermission;
}

// ─── BAŞLANGIÇTA DURUMU KONTROL ET ───────────────────────────────────────────
(async function initNotify() {
  // Tarayıcı desteği yok
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    _showPushUnsupportedWarning('Tarayıcınız Push bildirimlerini desteklemiyor.');
    return;
  }

  // Bildirim izni kalıcı olarak reddedilmişse uyar
  if (Notification.permission === 'denied') {
    _showPushUnsupportedWarning('Bildirim izni reddedildi. Tarayıcı ayarlarından etkinleştirin.');
    updateNotifyUI(false);
    return;
  }

  try {
    const reg    = await navigator.serviceWorker.ready;
    const sub    = await reg.pushManager.getSubscription();
    const status = Notification.permission;
    const active = !!sub && status === 'granted';
    updateNotifyUI(active);

    // Daha önce izin verilmişse ve sub yoksa yeniden dene
    if (status === 'granted' && !sub && localStorage.getItem(NOTIFY_KEY)) {
      window.requestNotifyPermission();
    }
  } catch (_) {}
})();

function _showPushUnsupportedWarning(msg) {
  const btn = document.getElementById('notifyToggleBtn');
  if (btn) {
    btn.disabled    = true;
    btn.textContent = '🔕 Bildirim Kullanılamıyor';
    btn.title       = msg;
    btn.style.opacity = '0.5';
    btn.style.cursor  = 'not-allowed';
  }
  // Alarm listesi varsa küçük uyarı göster
  const alertList = document.getElementById('alertList');
  if (alertList && !document.getElementById('pushWarnBanner')) {
    const warn = document.createElement('div');
    warn.id        = 'pushWarnBanner';
    warn.style.cssText = 'font-size:11px;color:var(--neutral);background:var(--neutral-dim);border:1px solid var(--neutral-border);border-radius:8px;padding:8px 12px;margin-top:8px;';
    warn.textContent   = '⚠️ ' + msg;
    alertList.parentNode.insertBefore(warn, alertList);
  }
}
