const test = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../public/js/mood-utils.js');
const {
  MOOD_META,
  normalizeMoodHistory,
  calculateMoodStreak,
  summarizeMoodTrend,
  buildMoodChartPoints,
  buildSmoothPath
} = utils;

test('maps mood labels and values for all existing mood options', () => {
  assert.equal(MOOD_META.great.label, '开心');
  assert.equal(MOOD_META.calm.label, '平静');
  assert.equal(MOOD_META.anxious.label, '焦虑');
  assert.equal(MOOD_META.sad.label, '沮丧');
  assert.equal(MOOD_META.terrible.label, '糟糕');
  assert.equal(MOOD_META.terrible.value, 1);
  assert.equal(MOOD_META.sad.value, 2);
  assert.equal(MOOD_META.anxious.value, 3);
  assert.equal(MOOD_META.calm.value, 4);
  assert.equal(MOOD_META.great.value, 5);
});

test('normalizes mood history from old to new and drops unknown moods', () => {
  const result = normalizeMoodHistory([
    { date: '2026-06-17', mood: 'great', note: 'today' },
    { date: '2026-06-15', mood: 'sad', note: '' },
    { date: '2026-06-16', mood: 'unknown', note: '' },
    { date: '2026-06-16', mood: 'calm', note: 'middle' }
  ]);

  assert.deepEqual(result.map(item => item.date), ['2026-06-15', '2026-06-16', '2026-06-17']);
  assert.deepEqual(result.map(item => item.value), [2, 4, 5]);
  assert.equal(result[1].label, '平静');
});

test('rejects invalid, overflow, and non-strict date strings', () => {
  const result = normalizeMoodHistory([
    { date: '2026-02-31', mood: 'great' },
    { date: '2026/06/17', mood: 'calm' },
    { date: '2026-06-17T23:00:00-02:00', mood: 'sad' },
    { date: '2026-06-17', mood: 'anxious' }
  ]);

  assert.deepEqual(result.map(item => item.date), ['2026-06-17']);
  assert.deepEqual(result.map(item => item.mood), ['anxious']);
});

test('calculates continuous streak from the latest check-in date', () => {
  const history = normalizeMoodHistory([
    { date: '2026-06-17', mood: 'great' },
    { date: '2026-06-16', mood: 'calm' },
    { date: '2026-06-15', mood: 'sad' },
    { date: '2026-06-13', mood: 'great' }
  ]);

  assert.equal(calculateMoodStreak(history), 3);
});

test('summarizes trend from recent mood values', () => {
  assert.deepEqual(
    summarizeMoodTrend(normalizeMoodHistory([
      { date: '2026-06-14', mood: 'sad' },
      { date: '2026-06-15', mood: 'anxious' },
      { date: '2026-06-16', mood: 'calm' },
      { date: '2026-06-17', mood: 'great' }
    ])),
    { label: '趋于积极', tone: 'positive' }
  );

  assert.deepEqual(
    summarizeMoodTrend(normalizeMoodHistory([
      { date: '2026-06-14', mood: 'great' },
      { date: '2026-06-15', mood: 'calm' },
      { date: '2026-06-16', mood: 'sad' },
      { date: '2026-06-17', mood: 'terrible' }
    ])),
    { label: '需要关照', tone: 'care' }
  );

  assert.deepEqual(
    summarizeMoodTrend(normalizeMoodHistory([
      { date: '2026-06-15', mood: 'calm' },
      { date: '2026-06-16', mood: 'anxious' },
      { date: '2026-06-17', mood: 'calm' }
    ])),
    { label: '较为平稳', tone: 'stable' }
  );
});

test('summarizes short recent improvement as a positive trend', () => {
  assert.deepEqual(
    summarizeMoodTrend(normalizeMoodHistory([
      { date: '2026-06-15', mood: 'terrible' },
      { date: '2026-06-16', mood: 'terrible' },
      { date: '2026-06-17', mood: 'sad' }
    ])),
    { label: '趋于积极', tone: 'positive' }
  );
});

test('builds chart points and a left-to-right SVG path', () => {
  const history = normalizeMoodHistory([
    { date: '2026-06-15', mood: 'terrible' },
    { date: '2026-06-16', mood: 'anxious' },
    { date: '2026-06-17', mood: 'great' }
  ]);

  const width = 300;
  const height = 140;
  const padding = { left: 24, right: 24, top: 16, bottom: 24 };
  const points = buildMoodChartPoints(history, width, height, padding);
  const path = buildSmoothPath(points);

  assert.equal(points.length, 3);
  assert.deepEqual(points.map(point => point.date), ['2026-06-15', '2026-06-16', '2026-06-17']);
  assert.equal(points[0].x, padding.left);
  assert.equal(points[points.length - 1].x, width - padding.right);
  assert.ok(points[0].x < points[1].x);
  assert.ok(points[1].x < points[2].x);
  assert.ok(points[0].y > points[1].y);
  assert.ok(points[1].y > points[2].y);
  assert.ok(path.length > 0);
});

test('normalizes today mood events by date and time ascending', () => {
  const events = utils.normalizeMoodEvents([
    { id: 2, mood: 'sad', note: '下午低落', date: '2026-06-17', time: '15:20', created_at: '2026-06-17 15:20:00' },
    { id: 1, mood: 'great', note: '早上不错', date: '2026-06-17', time: '09:05', created_at: '2026-06-17 09:05:00' },
    { id: 3, mood: 'unknown', note: '无效', date: '2026-06-17', time: '16:00', created_at: '2026-06-17 16:00:00' },
    { id: 4, mood: 'calm', note: '坏日期', date: '2026-02-31', time: '10:00', created_at: '2026-02-31 10:00:00' }
  ]);

  assert.deepEqual(events.map((event) => event.id), [1, 2]);
  assert.equal(events[0].label, '开心');
  assert.equal(events[0].emoji, '😄');
  assert.equal(events[0].displayTime, '09:05');
});

test('builds intraday chart points with time labels and mood labels', () => {
  const events = utils.normalizeMoodEvents([
    { id: 1, mood: 'great', note: '早上不错', date: '2026-06-17', time: '09:05' },
    { id: 2, mood: 'calm', note: '午后平静', date: '2026-06-17', time: '13:30' },
    { id: 3, mood: 'sad', note: '晚上低落', date: '2026-06-17', time: '21:10' }
  ]);

  const points = utils.buildIntradayChartPoints(events, 320, 150, 20);

  assert.equal(points.length, 3);
  assert.equal(points[0].x, 20);
  assert.equal(points[2].x, 300);
  assert.equal(points[0].timeLabel, '09:05');
  assert.equal(points[1].moodLabel, '平静');
  assert.equal(points[2].note, '晚上低落');
});

test('calculates daily aggregate mood by highest proportion', () => {
  const events = utils.normalizeMoodEvents([
    { id: 1, mood: 'great', date: '2026-06-17', time: '09:00' },
    { id: 2, mood: 'calm', date: '2026-06-17', time: '10:00' },
    { id: 3, mood: 'calm', date: '2026-06-17', time: '11:00' }
  ]);

  const aggregate = utils.calculateDailyAggregateMood(events);

  assert.equal(aggregate.mood, 'calm');
  assert.equal(aggregate.count, 3);
  assert.equal(aggregate.summary, '今日记录 3 次，主要为平静');
  assert.equal(aggregate.counts.great, 1);
  assert.equal(aggregate.counts.calm, 2);
});

test('breaks aggregate mood ties by latest event among tied moods', () => {
  const events = utils.normalizeMoodEvents([
    { id: 1, mood: 'great', date: '2026-06-17', time: '09:00' },
    { id: 2, mood: 'calm', date: '2026-06-17', time: '10:00' },
    { id: 3, mood: 'great', date: '2026-06-17', time: '11:00' },
    { id: 4, mood: 'calm', date: '2026-06-17', time: '12:00' }
  ]);

  const aggregate = utils.calculateDailyAggregateMood(events);

  assert.equal(aggregate.mood, 'calm');
  assert.equal(aggregate.summary, '今日记录 4 次，主要为平静');
});

test('returns null aggregate for an empty event list', () => {
  assert.equal(utils.calculateDailyAggregateMood([]), null);
});

test('builds a smooth path for two points without straight line segments', () => {
  const path = utils.buildSmoothPath([
    { x: 20, y: 110 },
    { x: 300, y: 40 }
  ]);

  assert.match(path, /^M 20 110 /);
  assert.match(path, / [CQ] /);
  assert.match(path, /300 40$/);
  assert.equal(path.includes(' L '), false);
});

test('keeps event sorting deterministic when event ids are not numeric', () => {
  const events = utils.normalizeMoodEvents([
    { id: 'later', mood: 'calm', date: '2026-06-17', time: '09:00' },
    { id: 'earlier', mood: 'great', date: '2026-06-17', time: '09:00' }
  ]);

  assert.deepEqual(events.map((event) => event.mood), ['calm', 'great']);
});

test('ignores invalid chart padding fields and keeps default bounds', () => {
  const history = utils.normalizeMoodHistory([
    { mood: 'terrible', date: '2026-06-16' },
    { mood: 'great', date: '2026-06-17' }
  ]);

  const points = utils.buildMoodChartPoints(history, 300, 140, { left: 'wide', right: undefined, top: 10, bottom: 20 });

  assert.equal(points[0].x, 24);
  assert.equal(points[1].x, 276);
});
