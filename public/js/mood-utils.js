(function (root, factory) {
  const api = factory();

  if (typeof window !== 'undefined') {
    window.MoodTrendUtils = api;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (typeof globalThis !== 'undefined') {
    globalThis.MoodTrendUtils = api;
  } else {
    root.MoodTrendUtils = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MOOD_META = Object.freeze({
    terrible: Object.freeze({ value: 1, label: '糟糕', emoji: '😡', color: '#f87171' }),
    sad: Object.freeze({ value: 2, label: '沮丧', emoji: '😢', color: '#fb923c' }),
    anxious: Object.freeze({ value: 3, label: '焦虑', emoji: '😰', color: '#fbbf24' }),
    calm: Object.freeze({ value: 4, label: '平静', emoji: '😐', color: '#818cf8' }),
    great: Object.freeze({ value: 5, label: '开心', emoji: '😄', color: '#4ade80' })
  });

  const MOOD_ORDER = Object.keys(MOOD_META);

  function parseStrictDateKey(date) {
    if (typeof date !== 'string' || !date) return null;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    if (Number.isNaN(parsed.getTime())) return null;

    const canonical = parsed.toISOString().slice(0, 10);
    return canonical === date ? canonical : null;
  }

  function toDateKey(date) {
    return parseStrictDateKey(date);
  }

  function isValidTime(value) {
    if (typeof value !== 'string') return false;
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return false;

    const parts = value.split(':').map(Number);
    const [hours, minutes, seconds = 0] = parts;
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59;
  }

  function toDisplayTime(value) {
    return isValidTime(value) ? value.slice(0, 5) : '';
  }

  function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeChartPadding(padding) {
    const defaults = { left: 24, right: 24, top: 16, bottom: 24 };
    if (!padding || typeof padding !== 'object') return defaults;

    return {
      left: toFiniteNumber(padding.left, defaults.left),
      right: toFiniteNumber(padding.right, defaults.right),
      top: toFiniteNumber(padding.top, defaults.top),
      bottom: toFiniteNumber(padding.bottom, defaults.bottom)
    };
  }

  function normalizeMoodHistory(history) {
    if (!Array.isArray(history)) return [];

    return history
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') return null;

        const moodKey = typeof entry.mood === 'string' ? entry.mood : '';
        const meta = MOOD_META[moodKey];
        if (!meta) return null;

        const date = typeof entry.date === 'string' ? entry.date : '';
        const canonicalDate = toDateKey(date);
        if (!canonicalDate) return null;

        return {
          id: entry.id,
          date: canonicalDate,
          mood: moodKey,
          note: typeof entry.note === 'string' ? entry.note : '',
          created_at: typeof entry.created_at === 'string' ? entry.created_at : '',
          value: meta.value,
          label: meta.label,
          emoji: meta.emoji,
          color: meta.color,
          _index: index
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.date === b.date) return a._index - b._index;
        return a.date < b.date ? -1 : 1;
      })
      .map(({ _index, ...item }) => item);
  }

  function normalizeMoodEvents(events) {
    if (!Array.isArray(events)) return [];

    return events
      .map((event, index) => {
        if (!event || typeof event !== 'object') return null;

        const moodKey = typeof event.mood === 'string' ? event.mood : '';
        const meta = MOOD_META[moodKey];
        if (!meta) return null;

        const canonicalDate = toDateKey(typeof event.date === 'string' ? event.date : '');
        if (!canonicalDate || !isValidTime(event.time)) return null;

        return {
          id: toFiniteNumber(event.id, index),
          mood: moodKey,
          note: typeof event.note === 'string' ? event.note : '',
          date: canonicalDate,
          time: event.time,
          displayTime: toDisplayTime(event.time),
          created_at: typeof event.created_at === 'string' ? event.created_at : '',
          value: meta.value,
          label: meta.label,
          emoji: meta.emoji,
          color: meta.color,
          _index: index
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.time !== b.time) return a.time < b.time ? -1 : 1;
        if (a.id !== b.id) return a.id - b.id;
        return a._index - b._index;
      })
      .map(({ _index, ...event }) => event);
  }

  function calculateMoodStreak(history) {
    const normalized = normalizeMoodHistory(history);
    if (!normalized.length) return 0;

    const dateKeys = new Set(normalized.map(item => item.date));
    let streak = 0;
    let current = new Date(normalized[normalized.length - 1].date + 'T00:00:00Z');

    while (true) {
      const key = current.toISOString().slice(0, 10);
      if (!dateKeys.has(key)) break;
      streak += 1;
      current.setUTCDate(current.getUTCDate() - 1);
    }

    return streak;
  }

  function summarizeMoodTrend(history) {
    const normalized = normalizeMoodHistory(history).slice(-7);
    if (normalized.length < 2) {
      return { label: '刚刚开始', tone: 'stable' };
    }

    const midpoint = Math.ceil(normalized.length / 2);
    const earlier = normalized.slice(0, midpoint);
    const later = normalized.slice(midpoint);
    const earlierAvg = earlier.reduce((sum, item) => sum + item.value, 0) / earlier.length;
    const laterAvg = (later.length ? later : earlier).reduce((sum, item) => sum + item.value, 0) / (later.length ? later : earlier).length;
    const recent3 = normalized.slice(-3);
    const recent3Avg = recent3.reduce((sum, item) => sum + item.value, 0) / recent3.length;

    if (laterAvg - earlierAvg >= 0.75 || recent3Avg >= 4.4) {
      return { label: '趋于积极', tone: 'positive' };
    }

    if (earlierAvg - laterAvg >= 0.75 || recent3Avg <= 2.2) {
      return { label: '需要关照', tone: 'care' };
    }

    return { label: '较为平稳', tone: 'stable' };
  }

  function buildMoodChartPoints(history, width, height, padding) {
    const normalized = normalizeMoodHistory(history);
    const safeWidth = Number.isFinite(width) ? width : 0;
    const safeHeight = Number.isFinite(height) ? height : 0;
    const safePadding = normalizeChartPadding(padding);

    if (!normalized.length) return [];

    const chartWidth = Math.max(0, safeWidth - safePadding.left - safePadding.right);
    const chartHeight = Math.max(0, safeHeight - safePadding.top - safePadding.bottom);
    const lastIndex = Math.max(1, normalized.length - 1);

    return normalized.map((item, index) => {
      const x = normalized.length === 1 ? safePadding.left : safePadding.left + (chartWidth * index) / lastIndex;
      const y = safePadding.top + ((5 - item.value) / 4) * chartHeight;

      return {
        ...item,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100
      };
    });
  }

  function buildIntradayChartPoints(events, width, height, padding) {
    const normalized = normalizeMoodEvents(events);
    const safeWidth = Number.isFinite(width) ? width : 0;
    const safeHeight = Number.isFinite(height) ? height : 0;
    const safePadding = Number.isFinite(padding) ? padding : 20;

    if (!normalized.length) return [];

    const chartWidth = Math.max(0, safeWidth - safePadding * 2);
    const chartHeight = Math.max(0, safeHeight - safePadding * 2);
    const lastIndex = Math.max(1, normalized.length - 1);

    return normalized.map((event, index) => {
      const x = normalized.length === 1 ? safeWidth / 2 : safePadding + (chartWidth * index) / lastIndex;
      const y = safePadding + ((5 - event.value) / 4) * chartHeight;

      return {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        mood: event.mood,
        moodLabel: event.label,
        emoji: event.emoji,
        color: event.color,
        value: event.value,
        note: event.note,
        date: event.date,
        time: event.time,
        timeLabel: event.displayTime
      };
    });
  }

  function calculateDailyAggregateMood(events) {
    const normalized = normalizeMoodEvents(events);
    if (!normalized.length) return null;

    const counts = {};
    normalized.forEach((event) => {
      counts[event.mood] = (counts[event.mood] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(counts));
    const tiedMoods = Object.keys(counts).filter((mood) => counts[mood] === maxCount);
    const latestTiedEvent = [...normalized].reverse().find((event) => tiedMoods.includes(event.mood));
    const mood = latestTiedEvent.mood;

    return {
      mood,
      count: normalized.length,
      counts,
      summary: `今日记录 ${normalized.length} 次，主要为${MOOD_META[mood].label}`
    };
  }

  function roundPathNumber(value) {
    return Math.round(value * 100) / 100;
  }

  function buildSmoothPath(points) {
    if (!Array.isArray(points) || points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    const path = [`M ${points[0].x} ${points[0].y}`];
    const tension = 0.22;

    for (let i = 0; i < points.length - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const previous = points[i - 1] || current;
      const nextNext = points[i + 2] || next;

      const cp1x = current.x + (next.x - previous.x) * tension;
      const cp1y = current.y + (next.y - previous.y) * tension;
      const cp2x = next.x - (nextNext.x - current.x) * tension;
      const cp2y = next.y - (nextNext.y - current.y) * tension;

      path.push(`C ${roundPathNumber(cp1x)} ${roundPathNumber(cp1y)}, ${roundPathNumber(cp2x)} ${roundPathNumber(cp2y)}, ${next.x} ${next.y}`);
    }

    return path.join(' ');
  }

  return {
    MOOD_META,
    normalizeMoodHistory,
    normalizeMoodEvents,
    calculateMoodStreak,
    calculateDailyAggregateMood,
    summarizeMoodTrend,
    buildMoodChartPoints,
    buildIntradayChartPoints,
    buildSmoothPath
  };
});
