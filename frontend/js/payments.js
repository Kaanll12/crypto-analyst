// js/payments.js — Ödeme & pricing modal
'use strict';

let selectedPlan = 'yearly';
let stripeEnabled = false;

// ─── MODAL ────────────────────────────────────────────────────────────────
window.openPricingModal = async function () {
  if (!window.currentUser) { openModal('loginModal'); return; }

  document.getElementById('pricingModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Stripe durumunu backend'den kontrol et
  try {
    const res = await fetch(window.API_BASE + '/api/payments/plans');
    if (res.ok) {
      const data = await res.json();
      stripeEnabled = data.stripeEnabled;
      document.getElementById('demoUpgradeWrap').style.display =
        stripeEnabled ? 'none' : '';
      document.getElementById('pricingCta').style.display =
        stripeEnabled ? '' : 'none';
    }
  } catch (_) {
    stripeEnabled = false;
    document.getElementById('demoUpgradeWrap').style.display = '';
    document.getElementById('pricingCta').style.display = 'none';
  }
};

window.closePricingModal = function () {
  document.getElementById('pricingModal').classList.remove('open');
  document.body.style.overflow = '';
};

// ─── PLAN SEÇ ─────────────────────────────────────────────────────────────
window.selectPlan = function (plan) {
  selectedPlan = plan;

  // Kart stillerini güncelle
  document.getElementById('planMonthly').classList.toggle('active', plan === 'monthly');
  document.getElementById('planYearly').classList.toggle('active',  plan === 'yearly');
  document.getElementById('checkMonthly').textContent = plan === 'monthly' ? '✓' : '';
  document.getElementById('checkMonthly').classList.toggle('active', plan === 'monthly');
  document.getElementById('checkYearly').textContent  = plan === 'yearly'  ? '✓' : '';
  document.getElementById('checkYearly').classList.toggle('active',  plan === 'yearly');

  // CTA metni
  const prices = { monthly: '$9.99/ay', yearly: '$6.67/ay ($79.99/yıl)' };
  document.getElementById('pricingCtaText').textContent =
    `Hemen Başla — ${prices[plan]}`;
};

// ─── STRIPE CHECKOUT ──────────────────────────────────────────────────────
window.startCheckout = async function () {
  if (!window.currentUser) { openModal('loginModal'); return; }

  const btn = document.getElementById('pricingCta');
  btn.disabled = true;
  document.getElementById('pricingCtaText').textContent = 'Yönlendiriliyor…';

  try {
    const res = await window.apiFetch('/api/payments/create-checkout', {
      method: 'POST',
      body: JSON.stringify({ planKey: selectedPlan }),
    });

    const data = await res.json();

    if (!res.ok) {
      toast(data.error || 'Ödeme başlatılamadı.', 'error');
      return;
    }

    // Stripe Checkout sayfasına yönlendir
    window.location.href = data.url;

  } catch (err) {
    toast('Bağlantı hatası. Tekrar deneyin.', 'error');
  } finally {
    btn.disabled = false;
    document.getElementById('pricingCtaText').textContent =
      selectedPlan === 'yearly' ? 'Hemen Başla — $6.67/ay' : 'Hemen Başla — $9.99/ay';
  }
};

// ─── DEMO UPGRADE (Stripe yokken) ────────────────────────────────────────
window.upgradeDemo = async function () {
  try {
    const res = await window.apiFetch('/api/payments/upgrade-demo', { method: 'POST' });
    const data = await res.json();

    if (res.ok) {
      toast('🎉 Demo VIP aktifleştirildi!', 'success');
      closePricingModal();
      renderUsageCard({ isVip: true });
      updateGenButton(true);
    } else {
      toast(data.error || 'Hata oluştu.', 'error');
    }
  } catch (_) {
    toast('Bağlantı hatası.', 'error');
  }
};

// ─── ÖDEME BAŞARILI SAYFASI ───────────────────────────────────────────────
// URL'de ?payment=success varsa kullanıcıyı VIP olarak işaretle
(function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success' || window.location.pathname === '/payment-success') {
    setTimeout(async () => {
      try {
        // Güncel kullanıcı bilgisini çek (VIP olmuş olmalı)
        const res = await window.apiFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user.role === 'vip') {
            toast('🎉 VIP üyeliğin aktif! Sınırsız analiz yapabilirsin.', 'success');
            renderUsageCard({ isVip: true });
          }
        }
      } catch (_) {}
      // URL'yi temizle
      window.history.replaceState({}, '', '/');
    }, 1000);
  }
})();
