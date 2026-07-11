import { getRoundsList, updateRound, toggleCancelled, getState } from './state.js';
import { formatDateKr, todayStr, addDays, escapeHtml, fileToBase64 } from './utils.js';
import { toast } from './components.js';
import { scanScorecard } from './gemini.js';

let rerenderFn = null;

export function renderScore(container) {
  rerenderFn = () => renderScore(container);
  const today = todayStr();
  const cutoff = addDays(today, -1); // 하루 전부터 카드 표시 -> date must be >= yesterday? Actually show cards starting the day before the round: round.date <= today+1

  const upperBound = addDays(today, 1);

  const rounds = getRoundsList()
    .filter((r) => !r.isBlock && r.date <= upperBound)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!rounds.length) {
    container.innerHTML = `<div class="empty-state">표시할 라운드가 없어요.<br>라운드 하루 전부터 이곳에 카드가 표시됩니다.</div>`;
    return;
  }

  container.innerHTML = `<div id="score-cards"></div>`;
  const cardsWrap = container.querySelector('#score-cards');

  rounds.forEach((r) => {
    cardsWrap.appendChild(buildScoreCard(r));
  });
}

function buildScoreCard(round) {
  const el = document.createElement('div');
  el.className = `score-card${round.cancelled ? ' is-cancelled' : ''}`;

  const companionRows = (round.companions || []).map((name) => {
    const existing = (round.companionScores || []).find((c) => c.name === name);
    return `
      <div class="companion-score-row" data-name="${escapeHtml(name)}">
        <span class="name">${escapeHtml(name)}</span>
        <input type="number" class="companion-score-input" placeholder="타수" value="${existing?.score ?? ''}">
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="score-card-head">
      <div>
        <span class="date-badge">${formatDateKr(round.date)}</span>
        <div class="course-name">${escapeHtml(round.course || '골프장 미정')}</div>
        <div class="holes-info">${round.holes}홀${round.companions?.length ? ` · 동반자 ${round.companions.length}명` : ''}</div>
      </div>
      <button class="cancel-toggle-btn${round.cancelled ? ' is-cancelled' : ''}" id="cancel-btn">
        ${round.cancelled ? '취소됨 · 되돌리기' : '취소'}
      </button>
    </div>

    <div class="field-row">
      <div class="field">
        <label>내 타수</label>
        <input type="number" id="my-score" value="${round.score ?? ''}" placeholder="타수">
      </div>
      <div class="field">
        <label>파(Par)</label>
        <input type="number" id="my-par" value="${round.par ?? 72}" placeholder="72">
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>버디</label>
        <input type="number" id="my-birdies" value="${round.birdies ?? 0}" min="0">
      </div>
      <div class="field">
        <label>이글</label>
        <input type="number" id="my-eagles" value="${round.eagles ?? 0}" min="0">
      </div>
    </div>

    ${companionRows ? `<div class="companion-score-list">${companionRows}</div>` : ''}

    <button class="gemini-scan-btn" id="gemini-scan-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      <span id="gemini-scan-label">Gemini AI로 스코어카드 스캔</span>
    </button>
    <input type="file" accept="image/*" capture="environment" id="gemini-file-input" class="hidden">

    <div class="score-card-actions">
      <button class="btn btn-primary" id="save-score-btn">저장</button>
    </div>
  `;

  el.querySelector('#cancel-btn').addEventListener('click', () => {
    toggleCancelled(round.id);
    toast(round.cancelled ? '취소가 해제되었습니다.' : '라운드가 취소 처리되었습니다.');
    rerenderFn && rerenderFn();
  });

  el.querySelector('#save-score-btn').addEventListener('click', () => {
    const score = parseFloat(el.querySelector('#my-score').value);
    const par = parseFloat(el.querySelector('#my-par').value);
    const birdies = parseInt(el.querySelector('#my-birdies').value, 10) || 0;
    const eagles = parseInt(el.querySelector('#my-eagles').value, 10) || 0;
    const companionScores = Array.from(el.querySelectorAll('.companion-score-row')).map((row) => {
      const name = row.dataset.name;
      const val = row.querySelector('.companion-score-input').value;
      return { name, score: val === '' ? null : parseFloat(val) };
    });

    updateRound(round.id, {
      score: Number.isFinite(score) ? score : null,
      par: Number.isFinite(par) ? par : round.par,
      birdies,
      eagles,
      companionScores,
    });
    toast('스코어가 저장되었습니다.');
    rerenderFn && rerenderFn();
  });

  const fileInput = el.querySelector('#gemini-file-input');
  const scanBtn = el.querySelector('#gemini-scan-btn');
  scanBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const apiKey = getState().settings.geminiApiKey;
    if (!apiKey) {
      toast('설정에서 Gemini API 키를 먼저 입력해주세요.');
      fileInput.value = '';
      return;
    }
    const label = el.querySelector('#gemini-scan-label');
    const originalLabel = label.textContent;
    label.textContent = '분석 중...';
    scanBtn.disabled = true;
    try {
      const base64 = await fileToBase64(file);
      const result = await scanScorecard(apiKey, base64, file.type || 'image/jpeg');
      if (result.totalScore !== null) el.querySelector('#my-score').value = result.totalScore;
      if (result.par !== null) el.querySelector('#my-par').value = result.par;
      el.querySelector('#my-birdies').value = result.birdies;
      el.querySelector('#my-eagles').value = result.eagles;

      result.companionScores.forEach((cs) => {
        const row = Array.from(el.querySelectorAll('.companion-score-row'))
          .find((r) => r.dataset.name === cs.name);
        if (row && cs.score !== null) {
          row.querySelector('.companion-score-input').value = cs.score;
        }
      });
      toast('스코어카드 분석이 완료되었습니다. 내용을 확인 후 저장해주세요.');
    } catch (e) {
      console.error(e);
      toast(e.message || 'Gemini 분석에 실패했습니다.', 3200);
    } finally {
      label.textContent = originalLabel;
      scanBtn.disabled = false;
      fileInput.value = '';
    }
  });

  return el;
}
