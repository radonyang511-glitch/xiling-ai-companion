// ============ Mood Check-in Module ============
let selectedMood = null;
let moodPanelRequestId = 0;

const moodMessages = {
  great: '今天心情好棒！真为你开心~ ✨',
  calm: '平平淡淡也是美好的一天呢 💕',
  anxious: '别担心，我会一直陪着你的 🫂',
  sad: '抱抱你...有什么都可以跟我说 🥺',
  terrible: '我在这里，你不是一个人 💛'
};

const moodExpressions = {
  great: '爱心眼',
  calm: '星星眼',
  anxious: '蚊香眼',
  sad: '流泪',
  terrible: '流泪'
};

const moodChartConfig = {
  width: 320,
  height: 160,
  padding: { left: 24, right: 24, top: 16, bottom: 30 }
};

const intradayChartConfig = {
  width: 320,
  height: 140,
  padding: 20,
  gridPadding: { left: 20, right: 20, top: 20, bottom: 20 }
};

function initMood() {
  document.getElementById('btn-mood-checkin').addEventListener('click', openMoodPanel);
  document.getElementById('btn-mood-quick').addEventListener('click', openMoodPanel);
  document.getElementById('btn-mood-cancel').addEventListener('click', closeMoodPanel);
  document.getElementById('btn-mood-submit').addEventListener('click', submitMood);

  document.querySelectorAll('.mood-option').forEach(opt => {
    opt.addEventListener('click', () => {
      setSelectedMood(opt.dataset.mood || '');
    });
  });

  document.getElementById('mood-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeMoodPanel();
  });
}

async function openMoodPanel() {
  const overlay = document.getElementById('mood-overlay');
  clearMoodSelection();
  document.getElementById('mood-note').value = '';
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('is-entered'));
  renderMoodLoadingState();
  await refreshMoodTrendPanel({ animateChart: true });
}

function closeMoodPanel() {
  const overlay = document.getElementById('mood-overlay');
  moodPanelRequestId += 1;
  overlay.classList.remove('is-entered');
  hideMoodTooltip('mood-chart-tooltip');
  hideMoodTooltip('mood-intraday-tooltip');
  setTimeout(() => {
    if (!overlay.classList.contains('is-entered')) {
      overlay.style.display = 'none';
    }
  }, 180);
}

async function submitMood() {
  if (!selectedMood) return showToast('请选择一个心情哦~', 'warning');

  const mood = selectedMood;
  const note = document.getElementById('mood-note').value.trim();

  try {
    const data = await API.createMoodEvent(mood, note);
    if (data.error) return showToast(data.error, 'danger');

    showToast('已记录此刻心情 ✓');
    updateMoodBubble(data.checkin?.mood || mood);
    playMoodExpression(mood);
    refreshUserProfile();
    clearMoodSelection();
    document.getElementById('mood-note').value = '';
    await refreshMoodTrendPanel({ animateChart: true });
  } catch (e) {
    showToast('记录失败，请稍后再试', 'danger');
  }
}

async function refreshMoodTrendPanel(options = {}) {
  const requestId = ++moodPanelRequestId;

  try {
    renderMoodLoadingState();

    const [todayData, historyData, eventsData] = await Promise.all([
      API.getTodayMood(),
      API.getMoodHistory(),
      API.getTodayMoodEvents()
    ]);

    if (requestId !== moodPanelRequestId) return;

    if (todayData && todayData.error) throw new Error(todayData.error);
    if (historyData && historyData.error) throw new Error(historyData.error);
    if (eventsData && eventsData.error) throw new Error(eventsData.error);

    const todayCheckin = todayData && todayData.checkin ? todayData.checkin : null;
    const history = normalizeMoodHistory(historyData && historyData.history ? historyData.history : [], todayCheckin);
    const events = MoodTrendUtils.normalizeMoodEvents(eventsData && eventsData.events ? eventsData.events : []);
    const aggregate = MoodTrendUtils.calculateDailyAggregateMood(events);

    renderMoodStats(history, todayCheckin, aggregate, events.length);
    renderMoodChart(history, { animate: Boolean(options.animateChart) });
    renderIntradayChart(events, { animate: Boolean(options.animateChart) });
  } catch (e) {
    if (requestId !== moodPanelRequestId) return;
    renderMoodErrorState();
    showToast(e && e.message ? e.message : '心情趋势加载失败，请稍后再试', 'warning');
  }
}

function clearMoodSelection() {
  selectedMood = null;
  document.querySelectorAll('.mood-option').forEach(option => option.classList.remove('selected'));
}

function setSelectedMood(mood) {
  selectedMood = mood || null;
  document.querySelectorAll('.mood-option').forEach(option => {
    option.classList.toggle('selected', option.dataset.mood === selectedMood);
  });
}

function normalizeMoodHistory(history, todayCheckin) {
  const utils = MoodTrendUtils;
  const baseHistory = utils.normalizeMoodHistory(Array.isArray(history) ? history : []);

  if (!todayCheckin) return baseHistory;

  const normalizedToday = utils.normalizeMoodHistory([todayCheckin])[0];
  if (!normalizedToday) return baseHistory;
  if (baseHistory.some(item => item.date === normalizedToday.date)) return baseHistory;

  return utils.normalizeMoodHistory(baseHistory.concat(normalizedToday));
}

function renderMoodLoadingState() {
  document.getElementById('mood-trend-subtitle').textContent = '正在同步今天的心情轨迹...';
  document.getElementById('mood-trend-range').textContent = '载入中';
  document.getElementById('mood-intraday-range').textContent = '载入中';
  document.getElementById('mood-streak-value').textContent = '--';
  document.getElementById('mood-today-value').textContent = '载入中';
  document.getElementById('mood-event-count-value').textContent = '--';
  document.getElementById('mood-trend-svg').innerHTML = '';
  document.getElementById('mood-intraday-svg').innerHTML = '';

  const trendEmpty = document.getElementById('mood-chart-empty');
  trendEmpty.textContent = '正在加载最近趋势...';
  trendEmpty.style.display = 'flex';

  const intradayEmpty = document.getElementById('mood-intraday-empty');
  intradayEmpty.textContent = '正在加载今日轨迹...';
  intradayEmpty.style.display = 'flex';

  hideMoodTooltip('mood-chart-tooltip');
  hideMoodTooltip('mood-intraday-tooltip');
}

function renderMoodErrorState() {
  document.getElementById('mood-trend-subtitle').textContent = '暂时没能同步到心情记录';
  document.getElementById('mood-trend-range').textContent = '加载失败';
  document.getElementById('mood-intraday-range').textContent = '加载失败';
  document.getElementById('mood-streak-value').textContent = '0天';
  document.getElementById('mood-today-value').textContent = '未记录';
  document.getElementById('mood-event-count-value').textContent = '0次';
  document.getElementById('mood-trend-svg').innerHTML = '';
  document.getElementById('mood-intraday-svg').innerHTML = '';

  const trendEmpty = document.getElementById('mood-chart-empty');
  trendEmpty.textContent = '最近趋势加载失败，稍后再试';
  trendEmpty.style.display = 'flex';

  const intradayEmpty = document.getElementById('mood-intraday-empty');
  intradayEmpty.textContent = '今日轨迹加载失败，稍后再试';
  intradayEmpty.style.display = 'flex';

  hideMoodTooltip('mood-chart-tooltip');
  hideMoodTooltip('mood-intraday-tooltip');
}

function renderMoodStats(history, todayCheckin, aggregate, eventCount) {
  const utils = MoodTrendUtils;
  const streak = utils.calculateMoodStreak(history);
  const todayMood = aggregate?.mood || todayCheckin?.mood || null;
  const todayMeta = todayMood && utils.MOOD_META[todayMood] ? utils.MOOD_META[todayMood] : null;

  document.getElementById('mood-streak-value').textContent = streak + '天';
  document.getElementById('mood-today-value').textContent = todayMeta ? `${todayMeta.emoji} ${todayMeta.label}` : '未记录';
  document.getElementById('mood-event-count-value').textContent = `${eventCount || 0}次`;
  document.getElementById('mood-trend-subtitle').textContent = buildTrendSubtitle(history.length, todayMeta, eventCount);
  document.getElementById('mood-trend-range').textContent = buildTrendRange(history);
}

function renderMoodChart(history, options = {}) {
  const svg = document.getElementById('mood-trend-svg');
  const empty = document.getElementById('mood-chart-empty');
  hideMoodTooltip('mood-chart-tooltip');

  const points = MoodTrendUtils.buildMoodChartPoints(
    history,
    moodChartConfig.width,
    moodChartConfig.height,
    moodChartConfig.padding
  );

  if (points.length < 2) {
    svg.innerHTML = '';
    empty.textContent = '还没有足够的每日记录，今天开始记录吧~';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';

  const linePath = MoodTrendUtils.buildSmoothPath(points);
  const baselineY = moodChartConfig.height - moodChartConfig.padding.bottom;
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;
  const labelIndices = getChartLabelIndices(points.length);
  const gridMarkup = buildChartGrid(moodChartConfig);
  const labelsMarkup = labelIndices.map(index => {
    const point = points[index];
    return `<text x="${point.x}" y="${moodChartConfig.height - 8}" class="mood-chart-date">${formatMoodShortDate(point.date)}</text>`;
  }).join('');
  const pointsMarkup = points.map((point, index) => {
    const classes = ['mood-chart-point'];
    if (options.animate) classes.push('animate-point');
    return `<circle class="${classes.join(' ')}" cx="${point.x}" cy="${point.y}" r="4.5" fill="${point.color}" stroke="rgba(255,255,255,0.92)" stroke-width="2" tabindex="0" data-trend-point-index="${index}" style="--point-delay:${index * 90}ms;" aria-label="${point.label}，${formatMoodDate(point.date)}"></circle>`;
  }).join('');
  const pathClasses = ['mood-chart-line'];
  if (options.animate) pathClasses.push('animate-draw');

  svg.innerHTML = `
    ${buildChartDefs('mood-trend')}
    ${gridMarkup}
    <path class="mood-chart-area" d="${areaPath}" fill="url(#mood-trend-area-gradient)"></path>
    <path class="${pathClasses.join(' ')}" d="${linePath}" fill="none" stroke="url(#mood-trend-line-gradient)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
    ${labelsMarkup}
    ${pointsMarkup}
  `;

  bindMoodChartTooltip(svg, points, 'data-trend-point-index', 'mood-chart-tooltip', 'mood-chart-wrap', moodChartConfig, false);
  if (options.animate) playMoodChartAnimation(svg);
}

function renderIntradayChart(events, options = {}) {
  const svg = document.getElementById('mood-intraday-svg');
  const empty = document.getElementById('mood-intraday-empty');
  hideMoodTooltip('mood-intraday-tooltip');

  const points = MoodTrendUtils.buildIntradayChartPoints(
    events,
    intradayChartConfig.width,
    intradayChartConfig.height,
    intradayChartConfig.padding
  );

  svg.innerHTML = '';

  if (!points.length) {
    empty.textContent = '再记录一次，就能看到今天的变化曲线。';
    empty.style.display = 'flex';
    document.getElementById('mood-intraday-range').textContent = '今日暂无记录';
    return;
  }

  if (points.length === 1) {
    empty.textContent = '再记录一次，就能看到今天的变化曲线。';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
  }

  document.getElementById('mood-intraday-range').textContent = points.length === 1
    ? points[0].timeLabel
    : `${points[0].timeLabel} - ${points[points.length - 1].timeLabel}`;

  const linePath = points.length > 1 ? MoodTrendUtils.buildSmoothPath(points) : '';
  const gridMarkup = buildChartGrid({ width: 320, height: 140, padding: intradayChartConfig.gridPadding });
  const timeLabelIndices = getChartLabelIndices(points.length);
  const labelsMarkup = timeLabelIndices.map(index => {
    const point = points[index];
    return `<text x="${point.x}" y="${intradayChartConfig.height - 7}" class="mood-chart-date">${point.timeLabel}</text>`;
  }).join('');
  const pointsMarkup = points.map((point, index) => {
    const classes = ['mood-chart-point', 'mood-intraday-point'];
    if (options.animate) classes.push('animate-point');
    return `<circle class="${classes.join(' ')}" cx="${point.x}" cy="${point.y}" r="4.5" fill="${point.color}" stroke="rgba(255,255,255,0.92)" stroke-width="2" tabindex="0" data-intraday-point-index="${index}" style="--point-delay:${index * 70}ms;" aria-label="${point.timeLabel}，${point.moodLabel}${point.note ? `，备注：${escapeAttribute(point.note)}` : ''}"></circle>`;
  }).join('');
  const emojiMarkup = points.map(point => `<text x="${point.x}" y="${Math.max(14, point.y - 12)}" text-anchor="middle" class="mood-point-emoji">${point.emoji}</text>`).join('');
  const pathClasses = ['mood-chart-line', 'mood-intraday-line'];
  if (options.animate) pathClasses.push('animate-draw');

  svg.innerHTML = `
    ${buildChartDefs('mood-intraday')}
    ${gridMarkup}
    ${linePath ? `<path class="${pathClasses.join(' ')}" d="${linePath}" fill="none" stroke="url(#mood-intraday-line-gradient)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>` : ''}
    ${labelsMarkup}
    ${emojiMarkup}
    ${pointsMarkup}
  `;

  bindMoodChartTooltip(svg, points, 'data-intraday-point-index', 'mood-intraday-tooltip', 'mood-intraday-wrap', intradayChartConfig, true);
  if (options.animate) playMoodChartAnimation(svg);
}

function buildChartDefs(prefix) {
  return `
    <defs>
      <linearGradient id="${prefix}-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f87171"></stop>
        <stop offset="50%" stop-color="#fbbf24"></stop>
        <stop offset="100%" stop-color="#4ade80"></stop>
      </linearGradient>
      <linearGradient id="${prefix}-area-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(99, 102, 241, 0.34)"></stop>
        <stop offset="100%" stop-color="rgba(99, 102, 241, 0)"></stop>
      </linearGradient>
    </defs>
  `;
}

function buildChartGrid(config) {
  const lines = [];
  const labels = [];
  const levels = [5, 4, 3, 2, 1];
  const padding = config.padding;
  const utils = MoodTrendUtils;

  levels.forEach(value => {
    const y = padding.top + ((5 - value) / 4) * (config.height - padding.top - padding.bottom);
    const meta = Object.values(utils.MOOD_META).find(item => item.value === value);
    lines.push(`<line x1="${padding.left}" y1="${y}" x2="${config.width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 6"></line>`);
    labels.push(`<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" class="mood-chart-axis-label">${meta ? meta.emoji : ''}</text>`);
  });

  return `<g class="mood-chart-grid-lines">${lines.join('')}${labels.join('')}</g>`;
}

function bindMoodChartTooltip(svg, points, indexAttribute, tooltipId, wrapId, config, useTimeLabel) {
  svg.querySelectorAll(`[${indexAttribute}]`).forEach(node => {
    const point = points[Number(node.getAttribute(indexAttribute))];
    if (!point) return;

    node.addEventListener('mouseenter', () => showMoodTooltip(point, tooltipId, wrapId, svg.id, config, useTimeLabel));
    node.addEventListener('focus', () => showMoodTooltip(point, tooltipId, wrapId, svg.id, config, useTimeLabel));
    node.addEventListener('mouseleave', () => hideMoodTooltip(tooltipId));
    node.addEventListener('blur', () => hideMoodTooltip(tooltipId));
  });
}

function showMoodTooltip(point, tooltipId, wrapId, svgId, config, useTimeLabel) {
  const wrap = document.getElementById(wrapId);
  const svg = document.getElementById(svgId);
  const tooltip = document.getElementById(tooltipId);
  const safeEscapeHtml = typeof escapeHtml === 'function' ? escapeHtml : fallbackEscapeHtml;
  const title = useTimeLabel ? point.timeLabel : formatMoodDate(point.date);
  const label = point.moodLabel || point.label;
  const noteMarkup = point.note ? `<div class="mood-chart-tooltip-note">${safeEscapeHtml(point.note)}</div>` : '';

  tooltip.innerHTML = `
    <div class="mood-chart-tooltip-title">${point.emoji} ${label}</div>
    <div class="mood-chart-tooltip-date">${title}</div>
    ${noteMarkup}
  `;
  tooltip.style.display = 'block';
  tooltip.style.visibility = 'hidden';

  const wrapWidth = wrap.clientWidth || config.width;
  const wrapHeight = wrap.clientHeight || config.height;
  const svgRect = svg.getBoundingClientRect();
  const chartWidth = svgRect.width || wrapWidth;
  const chartHeight = svgRect.height || wrapHeight;
  const x = (point.x / config.width) * chartWidth;
  const y = (point.y / config.height) * chartHeight;
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const left = clamp(x - tooltipWidth / 2, 8, Math.max(8, wrapWidth - tooltipWidth - 8));
  const preferredTop = y - tooltipHeight - 14;
  const fallbackTop = y + 14;
  const top = preferredTop >= 8 ? preferredTop : Math.min(fallbackTop, Math.max(8, wrapHeight - tooltipHeight - 8));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.visibility = 'visible';
}

function hideMoodTooltip(tooltipId) {
  const tooltip = document.getElementById(tooltipId);
  if (!tooltip) return;
  tooltip.style.display = 'none';
  tooltip.style.visibility = 'hidden';
}

function buildTrendSubtitle(count, todayMeta, eventCount) {
  if (!eventCount) return '记录此刻，也看看今天的心情轨迹。';
  if (eventCount === 1) return todayMeta ? '已经记录一个时刻，再记录一次就能看到今日曲线~' : '今天的轨迹刚刚开始~';
  return todayMeta ? `今日已记录${eventCount}次，整体更接近${todayMeta.label}。` : `今日已记录${eventCount}次。`;
}

function buildTrendRange(history) {
  if (!history.length) return '暂无记录';
  if (history.length === 1) return formatMoodShortDate(history[0].date);
  return `${formatMoodShortDate(history[0].date)} - ${formatMoodShortDate(history[history.length - 1].date)}`;
}

function getChartLabelIndices(total) {
  if (total <= 3) return Array.from({ length: total }, (_, index) => index);

  const maxLabels = Math.min(5, total);
  const indices = new Set([0, total - 1]);

  for (let i = 1; i < maxLabels - 1; i += 1) {
    indices.add(Math.round((i * (total - 1)) / (maxLabels - 1)));
  }

  return Array.from(indices).sort((a, b) => a - b);
}

function playMoodChartAnimation(svg) {
  const line = svg.querySelector('.mood-chart-line');
  if (line && typeof line.getTotalLength === 'function') {
    const length = line.getTotalLength();
    line.style.strokeDasharray = `${length}`;
    line.style.strokeDashoffset = `${length}`;
    line.classList.remove('animate-draw');
    void line.getBoundingClientRect();
    line.classList.add('animate-draw');
  }

  svg.querySelectorAll('.mood-chart-point').forEach(point => {
    point.classList.remove('animate-point');
    void point.getBoundingClientRect();
    point.classList.add('animate-point');
  });
}

function formatMoodDate(dateKey) {
  if (!dateKey || typeof dateKey !== 'string') return '';
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function formatMoodShortDate(dateKey) {
  if (!dateKey || typeof dateKey !== 'string') return '';
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  return `${parts[1]}.${parts[2]}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeAttribute(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fallbackEscapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br/>');
}

function updateMoodBubble(mood) {
  const bubble = document.getElementById('char-bubble');
  bubble.innerHTML = moodMessages[mood] || '今天想跟我聊什么呀？';
}

function playMoodExpression(mood) {
  try {
    if (App.live2dModel && moodExpressions[mood]) {
      App.live2dModel.expression(moodExpressions[mood]);
    }
  } catch (e) { /* skip */ }
}

async function loadTodaysMood() {
  try {
    const data = await API.getTodayMood();
    if (data.checkin) {
      updateMoodBubble(data.checkin.mood);
    }
  } catch (e) { /* ignore */ }
}
