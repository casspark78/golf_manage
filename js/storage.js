const ROUNDS_KEY = 'golf_rounds_v1';
const SETTINGS_KEY = 'golf_settings_v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('storage read failed', key, e);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('storage write failed', key, e);
    return false;
  }
}

export function getRounds() {
  return readJson(ROUNDS_KEY, []);
}

export function saveRounds(rounds) {
  return writeJson(ROUNDS_KEY, rounds);
}

const DEFAULT_SETTINGS = {
  theme: 'dark',
  geminiApiKey: '',
};

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) };
}

export function saveSettings(settings) {
  return writeJson(SETTINGS_KEY, settings);
}
