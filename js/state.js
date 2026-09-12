import { getRounds, saveRounds, getSettings, saveSettings, getPractices, savePractices } from './storage.js';
import { uid, todayStr, dataUrlToBlob } from './utils.js';
import { putPhoto, deletePhoto, releasePhotoUrl } from './photo-store.js';

const listeners = new Set();

const store = {
  rounds: getRounds(),
  settings: getSettings(),
  practices: getPractices(),
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

const STORAGE_FULL_MESSAGE = '저장 공간이 부족해 방금 변경사항이 저장되지 않았습니다. 사진이 있는 오래된 라운드를 삭제하거나, 설정에서 데이터를 내보낸 후 정리해주세요.';

// Writes the rounds array to disk. Returns true on success. On failure
// (most commonly localStorage quota exceeded due to accumulated photos),
// the caller must roll back its in-memory change before notify() runs —
// otherwise the UI shows data that was never actually saved, and it
// silently disappears the next time the app reloads.
function persistRounds() {
  const ok = saveRounds(store.rounds);
  if (ok) {
    store.settings.lastDataChangeAt = Date.now();
    saveSettings(store.settings);
  }
  return ok;
}

export function markExported() {
  store.settings.lastExportAt = Date.now();
  saveSettings(store.settings);
  notify();
}

export function getBackupStatus() {
  const { lastDataChangeAt, lastExportAt } = store.settings;
  if (!lastDataChangeAt) return { needsExport: false };
  if (!lastExportAt || lastExportAt < lastDataChangeAt) {
    return { needsExport: true, sinceDate: lastDataChangeAt };
  }
  return { needsExport: false };
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
    hasPhoto: !!data.hasPhoto,
    createdAt: Date.now(),
  };
  store.rounds.push(round);
  if (!persistRounds()) {
    store.rounds.pop();
    notify();
    throw new Error(STORAGE_FULL_MESSAGE);
  }
  notify();
  return round;
}

export function updateRound(id, patch) {
  const idx = store.rounds.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const previous = store.rounds[idx];
  store.rounds[idx] = { ...previous, ...patch };
  if (!persistRounds()) {
    store.rounds[idx] = previous;
    notify();
    throw new Error(STORAGE_FULL_MESSAGE);
  }
  notify();
  return store.rounds[idx];
}

export function deleteRound(id) {
  const previous = store.rounds;
  store.rounds = store.rounds.filter((r) => r.id !== id);
  if (!persistRounds()) {
    store.rounds = previous;
    notify();
    throw new Error(STORAGE_FULL_MESSAGE);
  }
  releasePhotoUrl(id);
  deletePhoto(id).catch((e) => console.error('photo cleanup failed', e));
  notify();
}

/**
 * Bulk import rounds (e.g. from a JSON backup or converted spreadsheet export).
 * mode: 'merge' (default) appends imported rounds whose date doesn't already
 * exist locally, skipping the rest; 'replace' wipes existing rounds first.
 * Returns { added, skipped, addedRounds } — addedRounds carries the stored
 * objects (with their final ids) so the caller can attach photos to them.
 */
export function importRounds(newRounds, mode = 'merge') {
  if (!Array.isArray(newRounds)) throw new Error('가져올 데이터 형식이 올바르지 않습니다.');

  const previous = store.rounds;

  if (mode === 'replace') {
    store.rounds = newRounds.map((r) => ({ ...r, id: r.id || uid() }));
    if (!persistRounds()) {
      store.rounds = previous;
      notify();
      throw new Error(STORAGE_FULL_MESSAGE);
    }
    notify();
    return { added: store.rounds.length, skipped: 0, addedRounds: store.rounds.slice() };
  }

  const existingDates = new Set(store.rounds.map((r) => r.date));
  const addedRounds = [];
  let skipped = 0;
  newRounds.forEach((r) => {
    if (existingDates.has(r.date)) {
      skipped += 1;
      return;
    }
    existingDates.add(r.date);
    const stored = { ...r, id: r.id || uid() };
    store.rounds.push(stored);
    addedRounds.push(stored);
  });
  if (!persistRounds()) {
    store.rounds = previous;
    notify();
    throw new Error(STORAGE_FULL_MESSAGE);
  }
  notify();
  return { added: addedRounds.length, skipped, addedRounds };
}

/**
 * One-time move of legacy base64 photos out of localStorage and into
 * IndexedDB. Photos are written to IndexedDB first; only once a photo is
 * safely stored is its base64 copy dropped from the rounds JSON — so an
 * interrupted or failed migration leaves the original data untouched rather
 * than losing a photo. Returns the number of photos moved.
 */
export async function migrateLegacyPhotos() {
  const legacy = store.rounds.filter((r) => typeof r.photo === 'string' && r.photo.startsWith('data:'));
  if (!legacy.length) return 0;

  const migrated = [];
  for (const round of legacy) {
    try {
      await putPhoto(round.id, dataUrlToBlob(round.photo));
      migrated.push(round);
    } catch (e) {
      console.error('photo migration failed for round', round.id, e);
    }
  }
  if (!migrated.length) return 0;

  migrated.forEach((round) => {
    delete round.photo;
    round.hasPhoto = true;
  });
  // Dropping the base64 shrinks the payload dramatically, so this write
  // succeeds even when localStorage was previously at its 5MB ceiling.
  saveRounds(store.rounds);
  notify();
  return migrated.length;
}

export function updateSettings(patch) {
  store.settings = { ...store.settings, ...patch };
  saveSettings(store.settings);
  notify();
}

// --- Practice log ---

export function getPracticesList() {
  return store.practices;
}

export function getPracticeByDate(date) {
  return store.practices.find((p) => p.date === date) || null;
}

function persistPractices() {
  const ok = savePractices(store.practices);
  if (ok) {
    store.settings.lastDataChangeAt = Date.now();
    saveSettings(store.settings);
  }
  return ok;
}

export function upsertPractice(date, data) {
  const idx = store.practices.findIndex((p) => p.date === date);
  const previous = store.practices.slice();
  if (idx === -1) {
    store.practices.push({ id: uid(), date, createdAt: Date.now(), ...data });
  } else {
    store.practices[idx] = { ...store.practices[idx], ...data };
  }
  if (!persistPractices()) {
    store.practices = previous;
    notify();
    throw new Error(STORAGE_FULL_MESSAGE);
  }
  notify();
}

export function deletePractice(id) {
  const previous = store.practices;
  store.practices = store.practices.filter((p) => p.id !== id);
  if (!persistPractices()) {
    store.practices = previous;
    notify();
    throw new Error(STORAGE_FULL_MESSAGE);
  }
  notify();
}

/**
 * Bulk import practices (e.g. from a JSON backup), merging by date —
 * skips dates that already exist locally. Returns { added, skipped }.
 */
export function importPractices(newPractices) {
  if (!Array.isArray(newPractices)) return { added: 0, skipped: 0 };
  const previous = store.practices;
  const existingDates = new Set(store.practices.map((p) => p.date));
  let added = 0;
  let skipped = 0;
  newPractices.forEach((p) => {
    if (existingDates.has(p.date)) {
      skipped += 1;
      return;
    }
    existingDates.add(p.date);
    store.practices.push({ ...p, id: p.id || uid() });
    added += 1;
  });
  if (!persistPractices()) {
    store.practices = previous;
    notify();
    throw new Error(STORAGE_FULL_MESSAGE);
  }
  notify();
  return { added, skipped };
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

function topByRounds(groups, limit) {
  return Object.entries(groups)
    .map(([name, scores]) => ({
      name,
      count: scores.length,
      average: scores.reduce((a, b) => a + b, 0) / scores.length,
      min: Math.min(...scores),
      max: Math.max(...scores),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function getTopCourses(limit = 5) {
  const groups = {};
  getPlayableRounds().forEach((r) => {
    const name = (r.course || '').trim();
    if (!name) return;
    (groups[name] = groups[name] || []).push(r.score);
  });
  return topByRounds(groups, limit);
}

export function getTopCompanions(limit = 5) {
  const groups = {};
  getPlayableRounds().forEach((r) => {
    (r.companions || []).forEach((name) => {
      if (!name) return;
      (groups[name] = groups[name] || []).push(r.score);
    });
  });
  return topByRounds(groups, limit);
}
