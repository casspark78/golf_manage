import { subscribe, getState, updateSettings, getRoundsList, importRounds, markExported } from './state.js';
import { renderHome } from './view-home.js';
import { renderSchedule, bindScheduleModalChrome } from './view-schedule.js';
import { renderScore } from './view-score.js';
import { renderStats } from './view-stats.js';
import { openModal, closeModal, toast, confirmAction } from './components.js';
import { geocodeLocation } from './weather.js';
import { escapeHtml } from './utils.js';

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
          <div class="label">날씨 지역</div>
          <div class="desc">홈 탭 다음 라운드 카드에 표시할 날씨 조회 지역입니다</div>
        </div>
      </div>
      <div class="field-row" style="grid-template-columns: 1fr auto; align-items:end; margin-top:10px;">
        <div class="field">
          <input type="text" id="weather-location-input" placeholder="예: 서울, 포천" value="${escapeHtml(settings.weatherLocation?.name || '')}">
        </div>
        <button class="btn btn-secondary" id="save-location-btn" style="flex:0 0 auto;">저장</button>
      </div>

      <div class="settings-row" style="margin-top:16px;">
        <div>
          <div class="label">데이터 위치</div>
          <div class="desc">모든 기록은 이 기기의 브라우저에만 저장됩니다 (오프라인 사용 가능)</div>
        </div>
      </div>

      <div class="settings-row" style="margin-top:4px; border-bottom:none; padding-bottom:0;">
        <div>
          <div class="label">데이터 가져오기 / 내보내기</div>
          <div class="desc">JSON 파일로 기록을 백업하거나 불러올 수 있습니다</div>
        </div>
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-secondary" id="export-data-btn">내보내기</button>
        <button class="btn btn-secondary" id="import-data-btn">가져오기</button>
      </div>
      <input type="file" accept="application/json" id="import-file-input" class="hidden">
    `;
    body.querySelector('#save-key-btn').addEventListener('click', () => {
      const key = body.querySelector('#gemini-key-input').value.trim();
      updateSettings({ geminiApiKey: key });
      toast('API 키가 저장되었습니다.');
      closeModal(overlay);
    });

    const saveLocationBtn = body.querySelector('#save-location-btn');
    saveLocationBtn.addEventListener('click', async () => {
      const query = body.querySelector('#weather-location-input').value.trim();
      if (!query) return;
      saveLocationBtn.disabled = true;
      try {
        const loc = await geocodeLocation(query);
        updateSettings({ weatherLocation: loc });
        toast(`날씨 지역이 "${loc.name}"(으)로 저장되었습니다.`);
      } catch (e) {
        console.error(e);
        toast(e.message || '지역을 찾지 못했습니다.', 3200);
      } finally {
        saveLocationBtn.disabled = false;
      }
    });

    body.querySelector('#export-data-btn').addEventListener('click', () => {
      const rounds = getRoundsList();
      const blob = new Blob([JSON.stringify(rounds, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `haksu-golf-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
      markExported();
      toast('데이터를 내보냈습니다.');
    });

    const importInput = body.querySelector('#import-file-input');
    body.querySelector('#import-data-btn').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const merge = confirmAction(
          '기존 기록과 날짜가 겹치지 않는 항목만 추가합니다.\n계속할까요?'
        );
        if (!merge) return;
        const { added, skipped } = importRounds(data, 'merge');
        toast(`${added}건 추가됨${skipped ? `, ${skipped}건 중복으로 건너뜀` : ''}`, 3200);
        closeModal(overlay);
      } catch (e) {
        console.error(e);
        toast('가져오기에 실패했습니다. 파일 형식을 확인해주세요.', 3200);
      } finally {
        importInput.value = '';
      }
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
