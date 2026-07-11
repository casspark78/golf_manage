import { getRoundsList, updateRound, deleteRound, getState } from './state.js';
import { strToDate, todayStr, escapeHtml, fileToBase64, resizeImageToDataUrl } from './utils.js';
import { toast, confirmAction } from './components.js';
import { scanScorecard } from './gemini.js';

let rerenderFn = null;

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const PEOPLE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

export function renderScore(container) {
  rerenderFn = () => renderScore(container);

  const today = todayStr();
  const rounds = getRoundsList()
    .filter((r) => !r.isBlock && r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!rounds.length) {
    container.innerHTML = `
      <div class="page-title">스코어</div>
      <div class="empty-state">표시할 라운드가 없어요.<br>라운드 당일부터 이곳에 카드가 표시됩니다.</div>
    `;
    return;
  }

  const groups = [];
  rounds.forEach((r) => {
    const year = r.date.slice(0, 4);
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || lastGroup.year !== year) {
      groups.push({ year, items: [r] });
    } else {
      lastGroup.items.push(r);
    }
  });

  const groupsHtml = groups.map((g) => `
    <div class="score-year-header">
      <span class="year">${g.year}년</span>
      <span class="count">${g.items.length}라운드</span>
    </div>
    <div class="score-tile-grid">${g.items.map(buildScoreTileHtml).join('')}</div>
  `).join('');

  container.innerHTML = `
    <div class="page-title">스코어</div>
    ${groupsHtml}
  `;

  container.querySelectorAll('.score-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const round = rounds.find((r) => r.id === tile.dataset.id);
      if (round) openScoreEntryModal(round);
    });
  });
}

function buildScoreTileHtml(round) {
  const d = strToDate(round.date);
  const hasScore = typeof round.score === 'number';
  const diff = hasScore && typeof round.par === 'number' ? round.score - round.par : null;
  const diffText = diff === null ? '' : diff === 0 ? 'PAR' : diff > 0 ? `+${diff}` : `${diff}`;
  const diffCls = diff === null ? '' : diff > 0 ? 'over' : diff < 0 ? 'under' : 'even';
  const tag = round.cancelled ? '<span class="tag cancelled">취소</span>' : '';
  const companionsRow = round.companions?.length
    ? `<div class="score-tile-companions">${PEOPLE_ICON}<span>${escapeHtml(round.companions.join(', '))}</span></div>`
    : '';

  const photoStyle = round.photo ? ` style="background-image:url('${round.photo}')"` : '';
  const photoClass = round.photo ? ' has-photo' : '';

  return `
    <div class="score-tile${round.cancelled ? ' cancelled' : ''}${photoClass}" data-id="${round.id}"${photoStyle}>
      <div class="score-tile-top">
        <div>
          <div class="score-tile-month">${d.getMonth() + 1}월</div>
          <div class="score-tile-day">${d.getDate()}일</div>
          <div class="score-tile-dow">${DOW[d.getDay()]}</div>
        </div>
        <div class="score-tile-scorebox">
          <div class="score-tile-score">${hasScore ? round.score : '-'}</div>
          ${diffText ? `<div class="score-tile-diff ${diffCls}">${diffText}</div>` : ''}
        </div>
      </div>
      <div class="score-tile-course"><span class="score-tile-course-text">${escapeHtml(round.course || '골프장 미정')}</span>${tag}</div>
      <div class="score-tile-holes">${round.holes}홀</div>
      ${companionsRow}
    </div>`;
}

// --- Score entry fullscreen modal ---

function buildCompanionRow(name, existing) {
  return `
    <div class="score-entry-row" data-name="${escapeHtml(name)}">
      <div class="col-name">${escapeHtml(name)}</div>
      <div class="col-num"><input type="number" class="c-score" value="${existing?.score ?? ''}"></div>
      <div class="col-num"><input type="number" class="c-birdies" value="${existing?.birdies ?? 0}"></div>
      <div class="col-num"><input type="number" class="c-eagles" value="${existing?.eagles ?? 0}"></div>
    </div>`;
}

function openScoreEntryModal(round) {
  const overlay = document.getElementById('score-entry-overlay');
  const body = document.getElementById('score-entry-body');
  const titleEl = document.getElementById('score-entry-title');
  const closeBtn = document.getElementById('score-entry-close');
  const saveBtn = document.getElementById('score-entry-save');
  const scanBtn = document.getElementById('score-entry-scan-btn');
  const fileInput = document.getElementById('score-entry-file-input');

  titleEl.textContent = round.course || '골프장 미정';
  let pendingPhoto = round.photo || null;

  const companionRows = (round.companions || [])
    .map((name) => buildCompanionRow(name, (round.companionScores || []).find((c) => c.name === name)))
    .join('');

  body.innerHTML = `
    <div id="photo-section" style="margin-bottom: 16px;"></div>
    <input type="file" accept="image/*" id="photo-file-input" class="hidden">
    <div class="cancel-row-card">
      <div class="cancel-row-label"><span class="emoji">🌦</span>라운드 취소 (우천 등)</div>
      <button type="button" class="switch${round.cancelled ? ' on' : ''}" id="entry-cancel-switch"></button>
    </div>
    <div class="field" style="margin: 16px 0; max-width: 140px;">
      <label>파(Par)</label>
      <input type="number" id="entry-par" value="${round.par ?? 72}">
    </div>
    <div class="score-entry-table">
      <div class="score-entry-row header">
        <div class="col-name">이름</div>
        <div class="col-num">타수</div>
        <div class="col-num">버디</div>
        <div class="col-num">이글</div>
      </div>
      <div class="score-entry-row" data-role="me">
        <div class="col-name">나</div>
        <div class="col-num"><input type="number" id="entry-my-score" value="${round.score ?? ''}"></div>
        <div class="col-num"><input type="number" id="entry-my-birdies" value="${round.birdies ?? 0}"></div>
        <div class="col-num"><input type="number" id="entry-my-eagles" value="${round.eagles ?? 0}"></div>
      </div>
      ${companionRows}
    </div>
    <button class="btn btn-danger" id="entry-delete-round" style="width:100%; margin-top:20px;">라운드 삭제</button>
  `;

  const photoFileInput = body.querySelector('#photo-file-input');

  function renderPhotoSection() {
    const section = body.querySelector('#photo-section');
    section.innerHTML = pendingPhoto
      ? `
        <img src="${pendingPhoto}" class="photo-preview">
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn-secondary" id="photo-add-btn">사진 변경</button>
          <button class="btn btn-danger" id="photo-remove-btn">사진 삭제</button>
        </div>`
      : `
        <div class="photo-empty">사진 없음</div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn-secondary" id="photo-add-btn">사진 추가</button>
        </div>`;
    section.querySelector('#photo-add-btn').addEventListener('click', () => photoFileInput.click());
    section.querySelector('#photo-remove-btn')?.addEventListener('click', () => {
      pendingPhoto = null;
      renderPhotoSection();
    });
  }
  renderPhotoSection();

  photoFileInput.onchange = async () => {
    const file = photoFileInput.files?.[0];
    if (!file) return;
    try {
      pendingPhoto = await resizeImageToDataUrl(file);
      renderPhotoSection();
    } catch (e) {
      console.error(e);
      toast('사진을 불러오지 못했습니다.');
    } finally {
      photoFileInput.value = '';
    }
  };

  body.querySelector('#entry-delete-round').addEventListener('click', () => {
    if (!confirmAction('이 라운드 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
    deleteRound(round.id);
    toast('라운드가 삭제되었습니다.');
    close();
    rerenderFn && rerenderFn();
  });

  const cancelSwitch = body.querySelector('#entry-cancel-switch');
  cancelSwitch.addEventListener('click', () => cancelSwitch.classList.toggle('on'));

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  function close() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  closeBtn.onclick = close;

  saveBtn.onclick = () => {
    const score = parseFloat(body.querySelector('#entry-my-score').value);
    const par = parseFloat(body.querySelector('#entry-par').value);
    const birdies = parseInt(body.querySelector('#entry-my-birdies').value, 10) || 0;
    const eagles = parseInt(body.querySelector('#entry-my-eagles').value, 10) || 0;
    const cancelled = cancelSwitch.classList.contains('on');

    const companionScores = Array.from(body.querySelectorAll('.score-entry-row[data-name]')).map((row) => {
      const sVal = row.querySelector('.c-score').value;
      const bVal = row.querySelector('.c-birdies').value;
      const eVal = row.querySelector('.c-eagles').value;
      return {
        name: row.dataset.name,
        score: sVal === '' ? null : parseFloat(sVal),
        birdies: parseInt(bVal, 10) || 0,
        eagles: parseInt(eVal, 10) || 0,
      };
    });

    updateRound(round.id, {
      score: Number.isFinite(score) ? score : null,
      par: Number.isFinite(par) ? par : round.par,
      birdies,
      eagles,
      cancelled,
      companionScores,
      photo: pendingPhoto,
    });
    toast('스코어가 저장되었습니다.');
    close();
    rerenderFn && rerenderFn();
  };

  scanBtn.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const apiKey = getState().settings.geminiApiKey;
    if (!apiKey) {
      toast('설정에서 Gemini API 키를 먼저 입력해주세요.');
      fileInput.value = '';
      return;
    }
    scanBtn.disabled = true;
    try {
      const base64 = await fileToBase64(file);
      const result = await scanScorecard(apiKey, base64, file.type || 'image/jpeg');
      if (result.totalScore !== null) body.querySelector('#entry-my-score').value = result.totalScore;
      if (result.par !== null) body.querySelector('#entry-par').value = result.par;
      body.querySelector('#entry-my-birdies').value = result.birdies;
      body.querySelector('#entry-my-eagles').value = result.eagles;

      result.companionScores.forEach((cs) => {
        const row = Array.from(body.querySelectorAll('.score-entry-row[data-name]'))
          .find((r) => r.dataset.name === cs.name);
        if (row && cs.score !== null) row.querySelector('.c-score').value = cs.score;
      });
      toast('스코어카드 분석이 완료되었습니다. 내용을 확인 후 저장해주세요.');
    } catch (e) {
      console.error(e);
      toast(e.message || 'Gemini 분석에 실패했습니다.', 3200);
    } finally {
      scanBtn.disabled = false;
      fileInput.value = '';
    }
  };
}
