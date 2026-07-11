import { subscribe, getState, updateSettings } from './state.js';
import { renderHome } from './view-home.js';
import { renderSchedule, bindScheduleModalChrome } from './view-schedule.js';
import { renderScore } from './view-score.js';
import { renderStats } from './view-stats.js';
import { openModal, closeModal, toast } from './components.js';

const SUN_PATH = `<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`;
const MOON_PATH = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;

let currentTab = 'home';

const views = {
  home: document.getElementById('view-home'),
  schedule: document.getElementById('view-schedule'),
  score: document.getElementById('view-score'),
  stats: document.getElementById('view-stats'),
};

function goToTab(tab) {
  currentTab = tab;
  Object.entries(views).forEach(([name, el]) => {
    el.classList.toggle('active', name === tab);
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderCurrentView();
}

function renderCurrentView() {
  if (currentTab === 'home') renderHome(views.home, { goToTab });
  else if (currentTab === 'schedule') renderSchedule(views.schedule);
  else if (currentTab === 'score') renderScore(views.score);
  else if (currentTab === 'stats') renderStats(views.stats);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  icon.innerHTML = theme === 'dark' ? SUN_PATH : MOON_PATH;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#141A24' : '#2DC96E');
}

function setupTabBar() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => goToTab(btn.dataset.tab));
  });
}

function setupThemeToggle() {
  applyTheme(getState().settings.theme);
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const current = getState().settings.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: next });
    applyTheme(next);
  });
}

function setupSettingsModal() {
  const overlay = document.getElementById('settings-modal-overlay');
  const body = document.getElementById('settings-modal-body');
  const openBtn = document.getElementById('settings-btn');
  const closeBtn = document.getElementById('settings-modal-close');

  function render() {
    const settings = getState().settings;
    body.innerHTML = `
      <div class="settings-row">
        <div>
          <div class="label">Gemini API 키</div>
          <div class="desc">스코어카드 사진 분석(gemini-2.0-flash)에 사용됩니다</div>
        </div>
      </div>
      <div class="field" style="margin: 10px 0 16px;">
        <input type="password" id="gemini-key-input" placeholder="AIza..." value="${settings.geminiApiKey || ''}">
      </div>
      <button class="btn btn-primary" id="save-key-btn" style="width:100%;">저장</button>
      <div class="settings-row" style="margin-top:8px;">
        <div>
          <div class="label">데이터 위치</div>
          <div class="desc">모든 기록은 이 기기의 브라우저에만 저장됩니다 (오프라인 사용 가능)</div>
        </div>
      </div>
    `;
    body.querySelector('#save-key-btn').addEventListener('click', () => {
      const key = body.querySelector('#gemini-key-input').value.trim();
      updateSettings({ geminiApiKey: key });
      toast('API 키가 저장되었습니다.');
      closeModal(overlay);
    });
  }

  openBtn.addEventListener('click', () => {
    render();
    openModal(overlay);
  });
  closeBtn.addEventListener('click', () => closeModal(overlay));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay);
  });
}

function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => {
        console.error('Service worker registration failed', err);
      });
    });
  }
}

function init() {
  setupTabBar();
  setupThemeToggle();
  bindScheduleModalChrome();
  setupSettingsModal();
  setupServiceWorker();
  subscribe(() => renderCurrentView());
  goToTab('home');
}

init();
