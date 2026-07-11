import { getRounds, saveRounds, getSettings, saveSettings } from './storage.js';
import { uid, todayStr } from './utils.js';

const listeners = new Set();

const store = {
  rounds: getRounds(),
  settings: getSettings(),
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn(store));
}

export function getState() {
  return store;
}

export function getRoundsList() {
  return store.rounds;
}

export function findRoundsByDate(dateStr, excludeId) {
  return store.rounds.filter((r) => r.date === dateStr && r.id !== excludeId);
}

function persistRounds() {
  saveRounds(store.rounds);
  notify();
}

export function addRound(data) {
  const round = {
    id: uid(),
    date: data.date,
    course: data.course || '',
    holes: data.holes || 18,
    score: data.score ?? null,
    par: data.par ?? 72,
    memo: data.memo || '',
    companions: data.companions || [],
    birdies: data.birdies ?? 0,
    eagles: data.eagles ?? 0,
    companionScores: data.companionScores || [],
    cancelled: !!data.cancelled,
    isBlock: !!data.isBlock,
    createdAt: Date.now(),
  };
  store.rounds.push(round);
  persistRounds();
  return round;
}

export function updateRound(id, patch) {
  const idx = store.rounds.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  store.rounds[idx] = { ...store.rounds[idx], ...patch };
  persistRounds();
  return store.rounds[idx];
}

export function deleteRound(id) {
  store.rounds = store.rounds.filter((r) => r.id !== id);
  persistRounds();
}

/**
 * Bulk import rounds (e.g. from a JSON backup or converted spreadsheet export).
 * mode: 'merge' (default) appends imported rounds whose date doesn't already
 * exist locally, skipping the rest; 'replace' wipes existing rounds first.
 * Returns { added, skipped }.
 */
export function importRounds(newRounds, mode = 'merge') {
  if (!Array.isArray(newRounds)) throw new Error('가져올 데이터 형식이 올바르지 않습니다.');

  if (mode === 'replace') {
    store.rounds = newRounds.map((r) => ({ ...r, id: r.id || uid() }));
    persistRounds();
    return { added: store.rounds.length, skipped: 0 };
  }

  const existingDates = new Set(store.rounds.map((r) => r.date));
  let added = 0;
  let skipped = 0;
  newRounds.forEach((r) => {
    if (existingDates.has(r.date)) {
      skipped += 1;
      return;
    }
    existingDates.add(r.date);
    store.rounds.push({ ...r, id: r.id || uid() });
    added += 1;
  });
  persistRounds();
  return { added, skipped };
}

export function updateSettings(patch) {
  store.settings = { ...store.settings, ...patch };
  saveSettings(store.settings);
  notify();
}

// --- Derived / computed helpers ---

export function getPlayableRounds() {
  // rounds that count toward stats: not a block, not cancelled, has a score entered
  return store.rounds.filter((r) => !r.isBlock && !r.cancelled && typeof r.score === 'number');
}

export function getNextRound() {
  const today = todayStr();
  return store.rounds
    .filter((r) => !r.isBlock && !r.cancelled && r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

export function getRecentResults(limit = 5) {
  return getPlayableRounds()
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function getStatsSummary() {
  const playable = getPlayableRounds();
  const scores = playable.map((r) => r.score);
  const total = playable.length;
  const best = scores.length ? Math.min(...scores) : null;
  const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const parDiffs = playable
    .filter((r) => typeof r.par === 'number')
    .map((r) => r.score - r.par);
  const avgParDiff = parDiffs.length ? parDiffs.reduce((a, b) => a + b, 0) / parDiffs.length : null;
  return { total, best, average, avgParDiff };
}

export function getScoreTrend() {
  return getPlayableRounds()
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, score: r.score, par: r.par }));
}
