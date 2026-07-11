import { getRoundsList, addRound, updateRound, deleteRound, findRoundsByDate } from './state.js';
import { strToDate, todayStr, escapeHtml } from './utils.js';
import { openModal, closeModal, createChipInput, toast, confirmAction } from './components.js';

let viewMonthKey; // 'YYYY-MM'
let rerenderFn = null;

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const CARD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`;
const PEOPLE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

export function renderSchedule(container) {
  rerenderFn = () => renderSchedule(container);

  const rounds = getRoundsList();
  const todayKey = todayStr().slice(0, 7);

  const countByMonth = {};
  rounds.forEach((r) => {
    const k = r.date.slice(0, 7);
    countByMonth[k] = (countByMonth[k] || 0) + 1;
  });
  const monthKeys = Array.from(new Set([...Object.keys(countByMonth), todayKey])).sort();

  if (!viewMonthKey || !monthKeys.includes(viewMonthKey)) {
    viewMonthKey = monthKeys.find((k) => k >= todayKey) || monthKeys[monthKeys.length - 1];
  }

  const multiYear = new Set(monthKeys.map((k) => k.slice(0, 4))).size > 1;

  const pillsHtml = monthKeys.map((k) => {
    const year = k.slice(2, 4);
    const month = Number(k.slice(5, 7));
    const count = countByMonth[k] || 0;
    const label = multiYear ? `'${year}.${month}월` : `${month}월`;
    return `
      <button class="month-pill${k === viewMonthKey ? ' active' : ''}" data-key="${k}">
        <span class="pill-month">${label}</span>
        <span class="pill-count">${count}건</span>
      </button>`;
  }).join('');

  const monthRounds = rounds
    .filter((r) => r.date.slice(0, 7) === viewMonthKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  const cardsHtml = monthRounds.length
    ? monthRounds.map((r) => buildScheduleCardHtml(r)).join('')
    : `<div class="empty-state" style="grid-column: 1 / -1;">이 달에는 일정이 없어요</div>`;

  container.innerHTML = `
    <div class="schedule-header-row">
      <div class="schedule-title">라운드 일정</div>
      <button class="fab-inline" id="add-schedule-fab" aria-label="일정 추가">+</button>
    </div>
    <div class="month-pill-row">${pillsHtml}</div>
    <div class="schedule-card-grid">${cardsHtml}</div>
  `;

  container.querySelector('#add-schedule-fab').addEventListener('click', () => {
    openScheduleModal(todayStr(), null);
  });
  container.querySelectorAll('.month-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      viewMonthKey = pill.dataset.key;
      renderSchedule(container);
    });
  });
  container.querySelectorAll('.schedule-card').forEach((card) => {
    card.addEventListener('click', () => {
      const round = rounds.find((r) => r.id === card.dataset.id);
      if (round) openScheduleModal(round.date, round);
    });
  });
}

function buildScheduleCardHtml(round) {
  const d = strToDate(round.date);
  const typeClass = round.cancelled ? 'cancelled' : round.isBlock ? 'block' : '';
  const tag = round.cancelled
    ? '<span class="tag cancelled">취소</span>'
    : round.isBlock ? '<span class="tag block">블럭</span>' : '';
  const title = round.isBlock ? (round.memo || '블럭 일정') : (round.course || '골프장 미정');
  const holesLine = round.isBlock ? '' : `<div class="schedule-card-holes">${round.holes}홀</div>`;
  const companionsRow = (!round.isBlock && round.companions?.length)
    ? `<div class="schedule-card-companions">${PEOPLE_ICON}<span>${escapeHtml(round.companions.join(', '))}</span></div>`
    : '';

  return `
    <div class="schedule-card${typeClass ? ` ${typeClass}` : ''}" data-id="${round.id}">
      <div class="schedule-card-top">
        <div>
          <div class="schedule-card-month">${d.getMonth() + 1}월</div>
          <div class="schedule-card-day">${d.getDate()}일</div>
          <div class="schedule-card-dow">${DOW[d.getDay()]}</div>
        </div>
        <div class="schedule-card-icon">${CARD_ICON}</div>
      </div>
      <div class="schedule-card-divider"></div>
      <div class="schedule-card-course">${escapeHtml(title)}${tag}</div>
      ${holesLine}
      ${companionsRow}
    </div>`;
}

// --- Modal ---

function getModalEls() {
  return {
    overlay: document.getElementById('schedule-modal-overlay'),
    body: document.getElementById('schedule-modal-body'),
    title: document.getElementById('schedule-modal-title'),
  };
}

export function bindScheduleModalChrome() {
  const { overlay } = getModalEls();
  document.getElementById('schedule-modal-close').addEventListener('click', () => closeModal(overlay));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay);
  });
}

function openScheduleModal(dateStr, existing) {
  const { overlay, body, title } = getModalEls();
  title.textContent = existing ? '일정 수정' : '일정 추가';

  let type = existing ? (existing.isBlock ? 'block' : 'round') : 'round';

  body.innerHTML = `
    <div class="type-toggle">
      <button type="button" data-type="round" class="${type === 'round' ? 'active' : ''}">라운드</button>
      <button type="button" data-type="block" class="${type === 'block' ? 'active' : ''}">블럭</button>
    </div>
    <div class="field-row" style="grid-template-columns: 1fr;">
      <div class="field">
        <label>날짜</label>
        <input type="date" id="f-date" value="${existing?.date || dateStr}">
      </div>
    </div>
    <div id="round-only-fields">
      <div class="field-row">
        <div class="field">
          <label>골프장</label>
          <input type="text" id="f-course" placeholder="골프장 이름" value="${escapeHtml(existing?.course || '')}">
        </div>
        <div class="field">
          <label>홀수</label>
          <select id="f-holes">
            <option value="18" ${!existing || existing.holes === 18 ? 'selected' : ''}>18홀</option>
            <option value="9" ${existing?.holes === 9 ? 'selected' : ''}>9홀</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>파(Par)</label>
          <input type="number" id="f-par" placeholder="72" value="${existing?.par ?? 72}">
        </div>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>동반자 <span style="color:var(--danger)">*필수</span></label>
        <div id="companion-chip-container"></div>
        <div class="field-error" id="companion-error"></div>
      </div>
    </div>
    <div class="field" style="margin-top:12px;">
      <label>메모</label>
      <textarea id="f-memo" placeholder="메모 (선택)">${escapeHtml(existing?.memo || '')}</textarea>
    </div>
    <div class="field-error" id="date-error"></div>
    <div class="score-card-actions" style="margin-top:18px;">
      ${existing ? '<button class="btn btn-danger" id="f-delete">삭제</button>' : ''}
      <button class="btn btn-primary" id="f-save">저장</button>
    </div>
  `;

  const chip = createChipInput(
    body.querySelector('#companion-chip-container'),
    existing?.companions || [],
    '동반자 이름 입력 후 Enter'
  );

  const roundOnlyFields = body.querySelector('#round-only-fields');
  function applyTypeUI() {
    roundOnlyFields.style.display = type === 'round' ? '' : 'none';
  }
  applyTypeUI();

  body.querySelectorAll('.type-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      type = btn.dataset.type;
      body.querySelectorAll('.type-toggle button').forEach((b) => b.classList.toggle('active', b === btn));
      applyTypeUI();
    });
  });

  body.querySelector('#f-save').addEventListener('click', () => {
    const dateVal = body.querySelector('#f-date').value;
    const dateErrorEl = body.querySelector('#date-error');
    const companionErrorEl = body.querySelector('#companion-error');
    dateErrorEl.textContent = '';
    companionErrorEl.textContent = '';

    if (!dateVal) {
      dateErrorEl.textContent = '날짜를 선택해주세요.';
      return;
    }

    const dup = findRoundsByDate(dateVal, existing?.id);
    if (dup.length > 0) {
      dateErrorEl.textContent = '이미 해당 날짜에 등록된 일정이 있습니다.';
      return;
    }

    const companions = chip.getValues();
    if (type === 'round' && companions.length === 0) {
      companionErrorEl.textContent = '동반자를 최소 1명 입력해주세요.';
      return;
    }

    const payload = {
      date: dateVal,
      isBlock: type === 'block',
      memo: body.querySelector('#f-memo').value.trim(),
    };

    if (type === 'round') {
      payload.course = body.querySelector('#f-course').value.trim();
      payload.holes = Number(body.querySelector('#f-holes').value);
      payload.par = Number(body.querySelector('#f-par').value) || 72;
      payload.companions = companions;
      if (!payload.course) {
        toast('골프장 이름을 입력해주세요.');
        return;
      }
    } else {
      payload.course = '';
      payload.companions = [];
    }

    if (existing) {
      updateRound(existing.id, payload);
      toast('일정이 수정되었습니다.');
    } else {
      addRound(payload);
      toast('일정이 추가되었습니다.');
    }
    closeModal(overlay);
    rerenderFn && rerenderFn();
  });

  const deleteBtn = body.querySelector('#f-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirmAction('이 일정을 삭제할까요?')) {
        deleteRound(existing.id);
        toast('일정이 삭제되었습니다.');
        closeModal(overlay);
        rerenderFn && rerenderFn();
      }
    });
  }

  openModal(overlay);
}
