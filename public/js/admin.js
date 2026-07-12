// ============ Admin Panel ============
let adminToken = null;
const adminSectionState = {
  current: 'dashboard',
  loaded: {},
  loading: {}
};
const crisisContextCache = new Map();

const SECTION_LOADERS = {
  dashboard: loadDashboard,
  users: loadUsers,
  crisis: loadCrisisAlerts,
  'mood-stats': loadMoodStats,
  config: loadConfig
};

const SECTION_LOADING_TEXT = {
  dashboard: '正在加载仪表盘...',
  users: '正在加载用户列表...',
  crisis: '正在加载危机工单...',
  'mood-stats': '正在加载情绪看板...',
  config: '正在加载配置中心...'
};

document.addEventListener('DOMContentLoaded', () => {
  // Check for saved admin token
  const saved = localStorage.getItem('xiling_admin_token');
  if (saved) {
    adminToken = saved;
    API.adminToken = saved;
    verifyAdminAndShow();
  }

  document.getElementById('admin-login-btn').addEventListener('click', handleAdminLogin);
  document.getElementById('btn-admin-logout').addEventListener('click', handleAdminLogout);

  // Admin login enter key
  document.getElementById('admin-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAdminLogin();
  });

  // Navigation
  document.querySelectorAll('.admin-nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => switchAdminSection(item.dataset.section));
  });

  document.getElementById('section-crisis').addEventListener('change', handleCrisisChange);
  document.getElementById('section-crisis').addEventListener('click', handleCrisisClick);
  document.getElementById('section-config').addEventListener('click', handleConfigClick);
  document.getElementById('new-keyword').addEventListener('keydown', e => {
    if (e.key === 'Enter') addKeyword();
  });
});

async function verifyAdminAndShow() {
  try {
    const data = await API.adminDashboard();
    if (data.stats) {
      showAdminShell();
      renderDashboard(data);
      adminSectionState.loaded.dashboard = true;
      switchAdminSection('dashboard', { skipLoad: true });
    } else {
      localStorage.removeItem('xiling_admin_token');
      showAdminLogin();
    }
  } catch (e) {
    localStorage.removeItem('xiling_admin_token');
    showAdminLogin();
  }
}

function showAdminLogin() {
  document.getElementById('admin-login-overlay').style.display = 'flex';
  document.getElementById('admin-shell').style.display = 'none';
}

function showAdminShell() {
  document.getElementById('admin-login-overlay').style.display = 'none';
  document.getElementById('admin-shell').style.display = 'flex';
}

async function handleAdminLogin() {
  const usernameInput = document.getElementById('admin-username');
  const passwordInput = document.getElementById('admin-password');
  const loginBtn = document.getElementById('admin-login-btn');
  const errorEl = document.getElementById('admin-login-error');
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!username) return;

  setButtonLoading(loginBtn, '登录中...');
  usernameInput.disabled = true;
  passwordInput.disabled = true;
  errorEl.style.display = 'none';

  try {
    const data = await API.adminLogin(username, password);
    if (data.error || !data.token) {
      errorEl.textContent = data.error || '登录失败';
      errorEl.style.display = 'block';
      return;
    }

    adminToken = data.token;
    API.adminToken = data.token;
    localStorage.setItem('xiling_admin_token', data.token);
    showAdminShell();
    await switchAdminSection('dashboard', { force: true });
  } catch (e) {
    errorEl.textContent = '网络异常，请稍后重试';
    errorEl.style.display = 'block';
  } finally {
    clearButtonLoading(loginBtn, '登录');
    usernameInput.disabled = false;
    passwordInput.disabled = false;
  }
}

async function handleAdminLogout() {
  const btn = document.getElementById('btn-admin-logout');
  const oldText = btn.textContent;
  btn.textContent = '退出中...';
  btn.style.pointerEvents = 'none';
  try {
    await API.adminLogout();
    showAdminToast('已退出登录');
  } catch (e) {
    showAdminToast('本地已退出', 'warning');
  } finally {
    localStorage.removeItem('xiling_admin_token');
    adminToken = null;
    API.adminToken = null;
    adminSectionState.loaded = {};
    btn.textContent = oldText;
    btn.style.pointerEvents = '';
    showAdminLogin();
  }
}

async function switchAdminSection(section, options = {}) {
  const target = document.getElementById('section-' + section);
  const loader = SECTION_LOADERS[section];
  if (!target || !loader) return;

  adminSectionState.current = section;
  document.querySelectorAll('.admin-nav-item[data-section]').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  target.classList.add('active');

  if (options.skipLoad) return;
  if (adminSectionState.loaded[section] && !options.force) return;
  await loader();
}

function setSectionLoading(section, message = '正在加载...') {
  adminSectionState.loading[section] = true;
  const state = getSectionStateEl(section);
  if (state) state.innerHTML = `<div class="admin-state admin-state-loading">${escapeHtml(message)}</div>`;
}

function setSectionError(section, message, retryAction) {
  adminSectionState.loading[section] = false;
  const state = getSectionStateEl(section);
  if (!state) return;
  state.innerHTML = `<div class="admin-state admin-state-error">
    <div>${escapeHtml(message || '加载失败')}</div>
    ${retryAction ? '<button class="btn btn-ghost" data-action="retry-section" style="margin-top:10px;font-size:12px;padding:5px 12px;">重试</button>' : ''}
  </div>`;
  if (retryAction) state.querySelector('[data-action="retry-section"]').addEventListener('click', retryAction);
}

function setSectionEmpty(section, message) {
  const state = getSectionStateEl(section);
  if (state) state.innerHTML = `<div class="admin-state admin-state-empty">${escapeHtml(message)}</div>`;
}

function clearSectionState(section) {
  adminSectionState.loading[section] = false;
  const state = getSectionStateEl(section);
  if (state) state.innerHTML = '';
}

function getSectionStateEl(section) {
  const root = document.getElementById('section-' + section);
  if (!root) return null;
  let state = root.querySelector(':scope > .admin-section-state');
  if (!state) {
    state = document.createElement('div');
    state.className = 'admin-section-state';
    root.appendChild(state);
  }
  return state;
}

function setButtonLoading(button, text = '处理中...') {
  if (!button) return;
  button.dataset.oldText = button.textContent;
  button.textContent = text;
  button.disabled = true;
  button.classList.add('is-loading');
}

function clearButtonLoading(button, fallbackText = '') {
  if (!button) return;
  button.textContent = button.dataset.oldText || fallbackText;
  delete button.dataset.oldText;
  button.disabled = false;
  button.classList.remove('is-loading');
}

function ensureOk(data, fallback = '操作失败') {
  if (!data) throw new Error(fallback);
  if (data.error) throw new Error(data.error);
  return data;
}

// ============ Dashboard ============
async function loadDashboard() {
  setSectionLoading('dashboard', SECTION_LOADING_TEXT.dashboard);
  try {
    const data = ensureOk(await API.adminDashboard(), '仪表盘加载失败');
    if (!data.stats) throw new Error('仪表盘数据为空');
    renderDashboard(data);
    clearSectionState('dashboard');
    adminSectionState.loaded.dashboard = true;
  } catch (e) {
    setSectionError('dashboard', e.message, () => loadDashboard());
  }
}

function renderDashboard(data) {
  document.getElementById('dashboard-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${data.stats.totalUsers}</div><div class="stat-label">总用户数</div></div>
    <div class="stat-card"><div class="stat-value">${data.stats.todayCheckins}</div><div class="stat-label">今日打卡</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${data.stats.pendingAlerts > 0 ? '#f87171' : 'var(--accent-light)'}">${data.stats.pendingAlerts}</div><div class="stat-label">待处理告警</div></div>
    <div class="stat-card"><div class="stat-value">${data.stats.todayChats}</div><div class="stat-label">今日对话</div></div>
  `;

  const alertsContainer = document.getElementById('dashboard-recent-alerts');
  if (data.recentAlerts && data.recentAlerts.length > 0) {
    alertsContainer.innerHTML = `<table class="data-table">
      <thead><tr><th>ID</th><th>用户</th><th>消息</th><th>风险</th><th>状态</th><th>时间</th></tr></thead>
      <tbody>${data.recentAlerts.map(a => `
        <tr>
          <td>#${a.id}</td><td>${escapeHtml(a.username)}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.message)}</td>
          <td><span class="badge badge-${a.risk_level === 'high' ? 'escalated' : a.risk_level === 'low' ? 'resolved' : 'pending'}">${a.risk_level}</span></td>
          <td><span class="badge badge-${a.status === 'pending' ? 'pending' : a.status === 'contacting' ? 'contacting' : a.status === 'resolved' ? 'resolved' : 'escalated'}">${a.status}</span></td>
          <td>${formatTime(a.created_at)}</td>
        </tr>`).join('')}
      </tbody></table>`;
  } else {
    alertsContainer.innerHTML = '<div class="admin-state admin-state-empty">暂无告警 ✅</div>';
  }
}

// ============ Users ============
async function loadUsers() {
  setSectionLoading('users', SECTION_LOADING_TEXT.users);
  try {
    const data = ensureOk(await API.adminUsers(), '用户列表加载失败');
    if (!data.users) throw new Error('用户列表数据为空');
    renderUsers(data.users);
    clearSectionState('users');
    adminSectionState.loaded.users = true;
  } catch (e) {
    setSectionError('users', e.message, () => loadUsers());
  }
}

function renderUsers(users) {
  const tbody = document.querySelector('#users-table tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="admin-state admin-state-empty">暂无用户</div></td></tr>';
    return;
  }
  const moodLabels = { great: '开心', calm: '平静', anxious: '焦虑', sad: '沮丧', terrible: '糟糕' };
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>#${u.id}</td><td>${escapeHtml(u.username)}</td><td>Lv.${u.affection_level || 1}</td>
      <td>${u.affection_points || 0}</td>
      <td>${u.latest_mood ? `<span class="badge badge-mood-${u.latest_mood}">${moodLabels[u.latest_mood] || u.latest_mood}</span>` : '-'}</td>
      <td>${u.chat_count || 0}</td><td>${u.crisis_count || 0}</td>
      <td>${u.created_at ? u.created_at.substring(0, 10) : '-'}</td>
    </tr>
  `).join('');
}

// ============ Crisis Workbench ============
async function loadCrisisAlerts() {
  setSectionLoading('crisis', SECTION_LOADING_TEXT.crisis);
  try {
    const data = ensureOk(await API.adminCrisisAlerts(), '危机工单加载失败');
    if (!data.alerts) throw new Error('危机工单数据为空');
    renderCrisisAlerts(data.alerts);
    clearSectionState('crisis');
    adminSectionState.loaded.crisis = true;
  } catch (e) {
    setSectionError('crisis', e.message, () => loadCrisisAlerts());
  }
}

function renderCrisisAlerts(alerts) {
  crisisContextCache.clear();
  const tbody = document.querySelector('#crisis-table tbody');
  if (!alerts.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="admin-state admin-state-empty">暂无危机工单 ✅</div></td></tr>';
    return;
  }
  tbody.innerHTML = alerts.map(a => {
    crisisContextCache.set(String(a.id), { username: a.username, context: a.context || '' });
    return `
      <tr>
        <td>#${a.id}</td><td>${escapeHtml(a.username)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.message)}</td>
        <td>
          <select data-action="update-alert-risk" data-id="${a.id}" data-current="${escapeHtml(a.risk_level)}" style="background:var(--bg-content);color:var(--text-primary);border:1px solid var(--border-normal);border-radius:4px;padding:2px 6px;font-size:11px;">
            <option value="low" ${a.risk_level === 'low' ? 'selected' : ''}>低风险</option>
            <option value="medium" ${a.risk_level === 'medium' ? 'selected' : ''}>中风险</option>
            <option value="high" ${a.risk_level === 'high' ? 'selected' : ''}>高风险</option>
          </select>
        </td>
        <td>
          <select data-action="update-alert-status" data-id="${a.id}" data-current="${escapeHtml(a.status)}" style="background:var(--bg-content);color:var(--text-primary);border:1px solid var(--border-normal);border-radius:4px;padding:2px 6px;font-size:11px;">
            <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>待处理</option>
            <option value="contacting" ${a.status === 'contacting' ? 'selected' : ''}>联系中</option>
            <option value="escalated" ${a.status === 'escalated' ? 'selected' : ''}>已转交</option>
            <option value="resolved" ${a.status === 'resolved' ? 'selected' : ''}>已解除</option>
          </select>
        </td>
        <td>${formatTime(a.created_at)}</td>
        <td><button class="btn btn-ghost" data-action="view-crisis-context" data-id="${a.id}" style="font-size:10px;padding:2px 8px;">详情</button></td>
      </tr>`;
  }).join('');
}

async function handleCrisisChange(e) {
  const control = e.target;
  const action = control.dataset.action;
  if (action !== 'update-alert-risk' && action !== 'update-alert-status') return;
  const id = control.dataset.id;
  const oldValue = control.dataset.current;
  const value = control.value;
  control.disabled = true;
  const label = action === 'update-alert-risk' ? '风险等级' : '工单状态';
  try {
    const payload = action === 'update-alert-risk' ? { risk_level: value } : { status: value };
    ensureOk(await API.updateCrisisAlert(id, payload), `${label}更新失败`);
    control.dataset.current = value;
    adminSectionState.loaded.dashboard = false;
    showAdminToast(`${label}已更新 ✅`);
  } catch (err) {
    control.value = oldValue;
    showAdminToast(err.message, 'danger');
  } finally {
    control.disabled = false;
  }
}

function handleCrisisClick(e) {
  const btn = e.target.closest('[data-action="view-crisis-context"]');
  if (!btn) return;
  const info = crisisContextCache.get(String(btn.dataset.id));
  viewCrisisContext(btn.dataset.id, info?.username || '', info?.context || '');
}

function viewCrisisContext(id, username, context) {
  const overlay = document.createElement('div');
  overlay.className = 'mood-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="diary-detail" style="position:relative;">
      <h2>🚨 危机上下文 - ${escapeHtml(username)} (#${escapeHtml(id)})</h2>
      <div style="margin-top:12px;font-size:12px;color:var(--text-muted);white-space:pre-wrap;line-height:1.7;max-height:50vh;overflow-y:auto;">${escapeHtml(context) || '无上下文数据'}</div>
      <button class="diary-detail-close" onclick="this.closest('.mood-overlay').remove()">✕</button>
    </div>
  `;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ============ Mood Stats ============
async function loadMoodStats() {
  setSectionLoading('mood-stats', SECTION_LOADING_TEXT['mood-stats']);
  try {
    const data = ensureOk(await API.adminMoodStats(), '情绪看板加载失败');
    drawMoodChart(data.dailyStats || []);
    renderUserMoodDist(data.userMoodDist || []);
    clearSectionState('mood-stats');
    adminSectionState.loaded['mood-stats'] = true;
  } catch (e) {
    setSectionError('mood-stats', e.message, () => loadMoodStats());
  }
}

function drawMoodChart(stats) {
  const canvas = document.getElementById('mood-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.clientWidth - 40;
  const H = 250;
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  ctx.clearRect(0, 0, W, H);

  if (stats.length === 0) {
    ctx.fillStyle = '#5a6070';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', W / 2, H / 2);
    return;
  }

  // Group by date
  const dates = [...new Set(stats.map(s => s.date))].sort().slice(-30);
  const moodColors = { great: '#4ade80', calm: '#818cf8', anxious: '#fbbf24', sad: '#fb923c', terrible: '#f87171' };
  const moodNames = { great: '开心', calm: '平静', anxious: '焦虑', sad: '沮丧', terrible: '糟糕' };

  // Simple line for "calm" as baseline
  const padding = { top: 20, right: 100, bottom: 40, left: 40 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  // Draw axes
  ctx.strokeStyle = '#ffffff10';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, H - padding.bottom);
  ctx.lineTo(W - padding.right, H - padding.bottom);
  ctx.stroke();

  // Draw mood distribution as colored dots/blocks per day
  const barWidth = Math.max(4, chartW / dates.length - 2);
  const moodValues = { great: 5, calm: 4, anxious: 3, sad: 2, terrible: 1 };

  // For each day, calculate average mood
  dates.forEach((date, i) => {
    const dayStats = stats.filter(s => s.date === date);
    if (dayStats.length === 0) return;

    let totalVal = 0, totalCount = 0;
    dayStats.forEach(s => { totalVal += (moodValues[s.mood] || 3) * s.count; totalCount += s.count; });
    const avg = totalVal / totalCount;
    const x = padding.left + (i / (dates.length - 1 || 1)) * chartW;
    const y = padding.top + chartH - ((avg - 1) / 4) * chartH;

    // Draw bar
    const color = avg >= 4 ? '#4ade80' : avg >= 3 ? '#818cf8' : avg >= 2 ? '#fbbf24' : '#f87171';
    ctx.fillStyle = color;
    ctx.fillRect(x - barWidth / 2, y, barWidth, padding.top + chartH - y);

    // Date labels
    if (i % 7 === 0 || i === dates.length - 1) {
      ctx.fillStyle = '#5a6070';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(date.substring(5), x, H - padding.bottom + 14);
    }
  });

  // Legend
  const legendX = W - padding.right + 10;
  Object.entries(moodNames).forEach(([key, name], i) => {
    const ly = padding.top + i * 20;
    ctx.fillStyle = moodColors[key];
    ctx.fillRect(legendX, ly, 10, 10);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(name, legendX + 14, ly + 9);
  });
}

function renderUserMoodDist(users) {
  const container = document.getElementById('user-mood-dist');
  if (!users || users.length === 0) {
    container.innerHTML = '<div class="admin-state admin-state-empty">暂无用户情绪数据</div>';
    return;
  }

  const atRisk = users.filter(u => u.negative_count > 5);
  container.innerHTML = `
    <div class="chart-container" style="margin-top:16px;">
      <h3 style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">⚠️ 高风险用户（长期负面情绪）</h3>
      ${atRisk.length === 0 ? '<div class="admin-state admin-state-empty">暂无高风险用户</div>' : atRisk.map(u => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:12px;">
          <span>${escapeHtml(u.display_name || u.username)}</span>
          <span style="color:#f87171;">负面打卡 ${u.negative_count}/${u.total_checkins}</span>
          <span>最近: ${u.latest_mood || '-'}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ============ Config ==========
async function loadConfig() {
  setSectionLoading('config', SECTION_LOADING_TEXT.config);
  try {
    const data = ensureOk(await API.adminConfig(), '配置加载失败');
    if (!data.configs) throw new Error('配置数据为空');
    renderConfig(data.configs);
    await loadKeywords();
    clearSectionState('config');
    adminSectionState.loaded.config = true;
  } catch (e) {
    setSectionError('config', e.message, () => loadConfig());
  }
}

function renderConfig(configs) {
  document.getElementById('config-list').innerHTML = configs.map(c => `
    <div class="config-row">
      <div class="config-label">${escapeHtml(c.key)}</div>
      <input class="config-input config-value" data-key="${escapeHtml(c.key)}" value="${escapeHtml(c.value)}">
      <button class="btn btn-primary" data-action="save-config" data-key="${escapeHtml(c.key)}" style="font-size:10px;padding:4px 10px;">保存</button>
    </div>
  `).join('');
}

async function handleConfigClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'save-config') {
    const input = document.querySelector(`.config-value[data-key="${cssEscape(btn.dataset.key)}"]`);
    await saveConfig(btn.dataset.key, input?.value || '', btn);
  }
  if (btn.dataset.action === 'add-keyword') await addKeyword();
  if (btn.dataset.action === 'remove-keyword') await removeKeyword(btn.dataset.id, btn);
}

async function saveConfig(key, value, button) {
  setButtonLoading(button, '保存中...');
  try {
    ensureOk(await API.updateConfig(key, value), '配置保存失败');
    showAdminToast('配置已保存 ✅');
  } catch (e) {
    showAdminToast(e.message, 'danger');
  } finally {
    clearButtonLoading(button, '保存');
  }
}

async function loadKeywords() {
  const data = ensureOk(await API.adminKeywords(), '关键词加载失败');
  renderKeywords(data.keywords || []);
}

function renderKeywords(keywords) {
  document.getElementById('keyword-tags').innerHTML = keywords.length ? keywords.map(k => `
    <span class="keyword-tag">
      ${escapeHtml(k.keyword)}
      <button type="button" class="keyword-delete" data-action="remove-keyword" data-id="${k.id}" title="删除关键词">×</button>
    </span>
  `).join('') : '<div class="admin-state admin-state-empty">暂无关键词</div>';
}

async function addKeyword() {
  const input = document.getElementById('new-keyword');
  const button = document.getElementById('btn-add-keyword');
  const keyword = input.value.trim();
  if (!keyword) return showAdminToast('关键词不能为空', 'warning');

  setButtonLoading(button, '添加中...');
  input.disabled = true;
  try {
    ensureOk(await API.addKeyword(keyword), '关键词添加失败');
    input.value = '';
    await loadKeywords();
    showAdminToast('关键词已添加 ✅');
  } catch (e) {
    showAdminToast(e.message, 'danger');
  } finally {
    input.disabled = false;
    clearButtonLoading(button, '添加');
  }
}

async function removeKeyword(id, button) {
  if (!confirm('确定删除这个关键词吗？')) return;
  setButtonLoading(button, '...');
  try {
    ensureOk(await API.deleteKeyword(id), '关键词删除失败');
    await loadKeywords();
    showAdminToast('关键词已删除 ✅');
  } catch (e) {
    showAdminToast(e.message, 'danger');
    clearButtonLoading(button, '×');
  }
}

// ============ Admin Toast ============
function showAdminToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || '');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.right = '20px';
  toast.style.zIndex = '300';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function cssEscape(value) {
  if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN');
}
