// js/admin.js — Admin Panel
'use strict';

// ─── AUTH GUARD (frontend) ────────────────────────────────────────────────
// Admin sayfası yalnızca role === 'admin' kullanıcılara gösterilir.
// auth.js, onUserLogin / onUserLogout hook'larını tetikler.

window.onUserLogin = async function(user) {
  if (user.role !== 'admin') {
    document.getElementById('noAccess').style.display = '';
    document.getElementById('adminContent').style.display = 'none';
    document.getElementById('loadingState').style.display = 'none';
    return;
  }
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('noAccess').style.display = 'none';
  document.getElementById('adminContent').style.display = '';

  document.getElementById('authArea').style.display  = 'none';
  document.getElementById('userArea').style.display  = 'flex';
  document.getElementById('userBadge').textContent   = user.username;

  await Promise.all([loadStats(), loadUsers(), loadLogs()]);
};

window.onUserLogout = function() {
  document.getElementById('adminContent').style.display = 'none';
  document.getElementById('loadingState').style.display = '';
  document.getElementById('authArea').style.display = 'flex';
  document.getElementById('userArea').style.display = 'none';
};

// ─── İSTATİSTİKLER ────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res  = await window.apiFetch('/api/admin/stats');
    if (!res.ok) throw new Error();
    const data = await res.json();
    const s    = data.stats || {};

    setEl('statTotalUsers',    s.totalUsers);
    setEl('statVipUsers',      s.vipUsers + ' VIP');
    setEl('statTodayAnalyses', s.todayAnalyses);
    setEl('statWeekAnalyses',  s.totalAnalyses);
    setEl('statTotalAnalyses', s.totalAnalyses);
    setEl('statActiveAlerts',  s.activeAlerts);
    setEl('statPushSubs',      '—');
    setEl('statErrors24h',     '—');
    setEl('statLastReport',    '—');

    // Top coins as "sinyal dağılımı" substitute
    renderTopCoins(data.topCoins || []);
    // Trend
    renderTrend(data.weeklyTrend || []);
  } catch (e) {
    console.error('Stats yüklenemedi:', e);
  }
}

function renderTopCoins(coins) {
  const el = document.getElementById('signalDist');
  if (!el || !coins.length) return;
  const max = Math.max(...coins.map(c => c.count), 1);
  const COLORS = { BTC:'#F7931A', ETH:'#627EEA', SOL:'#9945FF', BNB:'#F3BA2F', XRP:'#346AA9', ADA:'#0033AD' };
  el.innerHTML = coins.map(c => `
    <div class="signal-bar-row">
      <span class="sb-label" style="color:${COLORS[c.coin_sym]||'var(--accent)'}">${c.coin_sym}</span>
      <div class="sb-track"><div class="sb-fill bullish" style="width:${(c.count/max*100).toFixed(1)}%;background:${COLORS[c.coin_sym]||'var(--accent)'}"></div></div>
      <span class="sb-count">${c.count}</span>
    </div>
  `).join('');
}

function renderSignalDist(dist) {
  const total = dist.reduce((s, d) => s + d.count, 0) || 1;
  const map   = {};
  dist.forEach(d => { map[d.signal] = d.count; });
  const bull = map.bullish  || 0;
  const bear = map.bearish  || 0;
  const neut = map.neutral  || 0;
  const el   = document.getElementById('signalDist');
  if (!el) return;
  el.innerHTML = `
    <div class="signal-bar-row">
      <span class="sb-label bullish">▲ Bullish</span>
      <div class="sb-track"><div class="sb-fill bullish" style="width:${(bull/total*100).toFixed(1)}%"></div></div>
      <span class="sb-count">${bull}</span>
    </div>
    <div class="signal-bar-row">
      <span class="sb-label bearish">▼ Bearish</span>
      <div class="sb-track"><div class="sb-fill bearish" style="width:${(bear/total*100).toFixed(1)}%"></div></div>
      <span class="sb-count">${bear}</span>
    </div>
    <div class="signal-bar-row">
      <span class="sb-label neutral">— Neutral</span>
      <div class="sb-track"><div class="sb-fill neutral" style="width:${(neut/total*100).toFixed(1)}%"></div></div>
      <span class="sb-count">${neut}</span>
    </div>
  `;
}

function renderTrend(trend) {
  const el = document.getElementById('trendChart');
  if (!el || !trend.length) return;
  const max = Math.max(...trend.map(t => t.count), 1);
  el.innerHTML = trend.map(t => {
    const h = Math.round((t.count / max) * 60);
    const day = t.day.slice(5); // MM-DD
    return `<div class="tc-bar-wrap" title="${t.day}: ${t.count} analiz">
      <div class="tc-bar" style="height:${h}px"></div>
      <div class="tc-label">${day}</div>
    </div>`;
  }).join('');
}

// ─── KULLANICI LİSTESİ ────────────────────────────────────────────────────
let userPage = 1;

async function loadUsers(page = 1) {
  userPage = page;
  const search = document.getElementById('userSearch')?.value || '';
  const url = `/api/admin/users?page=${page}${search ? '&search=' + encodeURIComponent(search) : ''}`;
  try {
    const res  = await window.apiFetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderUsers(data.data || []);
    renderUserPagination({ page: data.page, pages: data.pages, total: data.total });
  } catch (e) {
    document.getElementById('userTable').innerHTML =
      '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--fg-muted)">Yüklenemedi.</td></tr>';
  }
}

function renderUsers(rows) {
  const tbody = document.getElementById('userTable');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--fg-muted)">Kullanıcı bulunamadı.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(u => `
    <tr>
      <td><span class="u-name">${escHtml(u.username)}</span><br><span style="font-size:11px;color:var(--fg-muted)">${escHtml(u.email)}</span></td>
      <td><span class="role-badge role-${u.role}">${u.role.toUpperCase()}</span></td>
      <td><span class="status-dot ${u.is_active ? 'active' : 'inactive'}"></span>${u.is_active ? 'Aktif' : 'Pasif'}</td>
      <td style="font-family:var(--mono);font-size:12px">${u.todayUsage || 0}</td>
      <td style="font-size:12px;color:var(--fg-muted)">${u.created_at?.slice(0,10) || '—'}</td>
      <td>
        <div class="u-actions">
          <select class="role-select" data-uid="${u.id}" onchange="changeRole(this)">
            <option value="user"  ${u.role==='user'  ? 'selected' : ''}>User</option>
            <option value="vip"   ${u.role==='vip'   ? 'selected' : ''}>VIP</option>
            <option value="admin" ${u.role==='admin' ? 'selected' : ''}>Admin</option>
          </select>
          <button class="btn-sm ${u.is_active ? 'btn-warn' : 'btn-ok'}" onclick="toggleStatus('${u.id}')">
            ${u.is_active ? 'Pasif Yap' : 'Aktif Et'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderUserPagination(pag) {
  if (!pag) return;
  const el = document.getElementById('userPagination');
  if (!el) return;
  el.innerHTML = `
    <button class="btn-ghost" onclick="loadUsers(${pag.page - 1})" ${pag.page <= 1 ? 'disabled' : ''}>← Önceki</button>
    <span style="font-size:13px;color:var(--fg-muted)">Sayfa ${pag.page} / ${pag.pages} (${pag.total} kullanıcı)</span>
    <button class="btn-ghost" onclick="loadUsers(${pag.page + 1})" ${pag.page >= pag.pages ? 'disabled' : ''}>Sonraki →</button>
  `;
}

window.changeRole = async function(sel) {
  const uid  = sel.dataset.uid;
  const role = sel.value;
  try {
    const res = await window.apiFetch(`/api/admin/users/${uid}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
    if (res.ok) { toast(`Rol güncellendi: ${role}`, 'success'); }
    else        { toast('Rol güncellenemedi.', 'error'); }
  } catch { toast('Hata.', 'error'); }
};

window.toggleStatus = async function(uid) {
  try {
    const res = await window.apiFetch(`/api/admin/users/${uid}/toggle`, { method: 'PUT' });
    const data = await res.json();
    if (res.ok) {
      toast(data.message || 'Durum güncellendi.', 'info');
      await loadUsers(userPage);
    } else { toast(data.error || 'İşlem başarısız.', 'error'); }
  } catch { toast('Hata.', 'error'); }
};

window.searchUsers = function() { loadUsers(1); };

// ─── LOG GÖRÜNTÜLEYİCİ ───────────────────────────────────────────────────
async function loadLogs(filter) {
  const url = '/api/admin/logs?limit=100' + (filter ? `&status=${filter}` : '');
  try {
    const res  = await window.apiFetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderLogs(data.data || []);
  } catch {
    document.getElementById('logTable').innerHTML =
      '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--fg-muted)">Yüklenemedi.</td></tr>';
  }
}

function renderLogs(rows) {
  const tbody = document.getElementById('logTable');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--fg-muted)">Log bulunamadı.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(l => `
    <tr>
      <td><span class="method-badge method-${l.method.toLowerCase()}">${l.method}</span> <span style="font-family:var(--mono);font-size:12px">${escHtml(l.endpoint)}</span></td>
      <td><span class="status-code ${l.status_code >= 500 ? 'err5' : l.status_code >= 400 ? 'err4' : 'ok2'}">${l.status_code}</span></td>
      <td style="font-size:12px">${l.username || '—'}</td>
      <td style="font-family:var(--mono);font-size:12px">${l.duration_ms}ms</td>
      <td style="font-size:11px;color:var(--fg-muted)">${l.created_at?.slice(0,19).replace('T',' ')}</td>
    </tr>
  `).join('');
}

window.filterLogs = function(f) {
  document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  loadLogs(f);
};

// ─── PUSH TEST ────────────────────────────────────────────────────────────
window.sendPushTest = async function() {
  const btn = document.getElementById('pushTestBtn');
  btn.disabled = true; btn.textContent = 'Gönderiliyor…';
  try {
    const res  = await window.apiFetch('/api/admin/push-test', {
      method: 'POST',
      body: JSON.stringify({ title: '🔔 Admin Test', body: 'CryptoAnalyst admin push testi.' }),
    });
    const data = await res.json();
    if (res.ok) { toast(`Push gönderildi: ${data.sent} aboneye`, 'success'); }
    else        { toast(data.error || 'Hata.', 'error'); }
  } catch { toast('Push gönderilemedi.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '🔔 Push Test Gönder'; }
};

window.sendEmailDigest = async function() {
  const btn = document.getElementById('emailSendBtn');
  btn.disabled = true; btn.textContent = 'Gönderiliyor…';
  try {
    const res = await window.apiFetch('/api/admin/email-send', { method: 'POST' });
    const data = await res.json();
    if (res.ok) { toast('Haftalık özet gönderildi!', 'success'); }
    else        { toast(data.error || 'Hata.', 'error'); }
  } catch { toast('E-posta gönderilemedi.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '📧 Haftalık Özet Gönder'; }
};

window.previewEmail = function() {
  window.open('/api/admin/email-preview', '_blank');
};

// ─── YARDIMCI ─────────────────────────────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

var escHtml = window.escHtml || function(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
};

var toast = window.toast || function(m, t) { console.log(m); };
