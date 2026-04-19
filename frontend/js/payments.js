// js/payments.js — Paddle ödeme entegrasyonu
'use strict';

let selectedPlan = 'yearly';
let paddleReady  = false;
let plansData    = null;

// ─── PADDLE JS YÜKLE ─────────────────────────────────────────────────────
function loadPaddleJS(clientToken) {
  if (window.Paddle) { initPaddle(clientToken); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
  s.onload = () => initPaddle(clientToken);
  document.head.appendChild(s);
}

function initPaddle(clientToken) {
  if (!clientToken || !window.Paddle) return;
  // PADDLE_ENV: 'sandbox' test için, 'production' canlı için
  const paddleEnv = window.PADDLE_ENV || 'production';
  if (paddleEnv === 'sandbox') window.Paddle.Environment.set('sandbox');
  window.Paddle.Initialize({
    token: clientToken,
    eventCallback: function(e) {
      if (e.name === 'checkout.completed') {
        handlePaddleSuccess(e.data?.transaction_id);
      }
    },
  });
  paddleReady = true;
}

// ─── MODAL ────────────────────────────────────────────────────────────────
window.openPricingModal = async function () {
  if (!window.currentUser) { openModal('loginModal'); return; }

  document.getElementById('pricingModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  if (!plansData) {
    try {
      const res = await fetch(window.API_BASE + '/api/payments/plans');
      if (res.ok) {
        plansData = await res.json();
        if (plansData.paddleEnabled && plansData.clientToken) {
          window.PADDLE_ENV = plansData.paddleEnv || 'production';
          loadPaddleJS(plansData.clientToken);
        }
      }
    } catch (_) {}
  }

  const isPaddle = plansData?.paddleEnabled;
  document.getElementById('demoUpgradeWrap').style.display = isPaddle ? 'none' : '';
  document.getElementById('pricingCta').style.display      = isPaddle ? ''     : 'none';
};

window.closePricingModal = function () {
  document.getElementById('pricingModal').classList.remove('open');
  document.body.style.overflow = '';
};

// ─── PLAN SEÇ ─────────────────────────────────────────────────────────────
window.selectPlan = function (plan) {
  selectedPlan = plan;
  document.getElementById('planMonthly').classList.toggle('active', plan === 'monthly');
  document.getElementById('planYearly').classList.toggle('active',  plan === 'yearly');
  document.getElementById('checkMonthly').textContent = plan === 'monthly' ? '✓' : '';
  document.getElementById('checkMonthly').classList.toggle('active', plan === 'monthly');
  document.getElementById('checkYearly').textContent  = plan === 'yearly'  ? '✓' : '';
  document.getElementById('checkYearly').classList.toggle('active',  plan === 'yearly');
  const prices = { monthly: '$9.99/ay', yearly: '$6.67/ay' };
  document.getElementById('pricingCtaText').textContent = `Hemen Başla — ${prices[plan]}`;
};

// ─── PADDLE CHECKOUT BAŞLAT ───────────────────────────────────────────────
window.startCheckout = function () {
  if (!window.currentUser) { openModal('loginModal'); return; }

  const plan = plansData?.plans?.find(p => p.key === selectedPlan);
  if (!plan?.priceId) {
    toast('Plan bilgisi yüklenemedi, tekrar deneyin.', 'error');
    return;
  }

  if (!paddleReady || !window.Paddle) {
    toast('Ödeme sistemi yükleniyor, bekleyin…', 'info');
    return;
  }

  // Paddle overlay checkout — kullanıcı sayfadan ayrılmaz
  window.Paddle.Checkout.open({
    items: [{ priceId: plan.priceId, quantity: 1 }],
    customer: { email: window.currentUser.email },
    customData: { userId: window.currentUser.id },
    settings: {
      displayMode: 'overlay',
      locale: 'tr',
    },
  });
};

// ─── ÖDEME BAŞARILI ───────────────────────────────────────────────────────
async function handlePaddleSuccess(transactionId) {
  try {
    const res = await window.apiFetch('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify({ transactionId }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast('🎉 VIP üyeliğin aktif! Sınırsız analiz yapabilirsin.', 'success');
      closePricingModal();
      renderUsageCard({ isVip: true });
      updateGenButton(true);
    }
  } catch (_) {
    // Webhook zaten VIP yapıyor, hata olsa da sorun yok
    toast('🎉 Ödeme alındı! Hesabın güncelleniyor…', 'success');
    closePricingModal();
  }
}

// ─── DEMO VIP ─────────────────────────────────────────────────────────────
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

// ─── SAYFA GERİ DÖNÜŞ ────────────────────────────────────────────────────
(function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') {
    setTimeout(async () => {
      try {
        const res = await window.apiFetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user?.role === 'vip') {
            toast('🎉 VIP üyeliğin aktif!', 'success');
            renderUsageCard({ isVip: true });
          }
        }
      } catch (_) {}
      window.history.replaceState({}, '', '/');
    }, 1000);
  }
})();
