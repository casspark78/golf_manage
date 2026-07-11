import { getRoundsList, addRound, updateRound, deleteRound, findRoundsByDate } from './state.js';
import { dateToStr, strToDate, todayStr, formatMonthKr, escapeHtml } from './utils.js';
import { openModal, closeModal, createChipInput, toast, confirmAction } from './components.js';

let viewYear, viewMonth; // month is 0-indexed
let rerenderFn = null;

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function initMonthIfNeeded() {
  if (viewYear === undefined) {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  }
}

export function renderSchedule(container) {
  initMonthIfNeeded();
  rerenderFn = () => renderSchedule(container);

  const rounds = getRoundsList();
  const today = todayStr();

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startDow = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) {
    const dayNum = daysInPrevMonth - startDow + 1 + i;
    cells.push({ dayNum, dim: true, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = dateToStr(new Date(viewYear, viewMonth, d));
    cells.push({ dayNum: d, dim: false, dateStr });
  }
  while (cells.length % 7 !== 0) {
    const idx = cells.length - (startDow + daysInMonth);
    cells.push({ dayNum: idx + 1, dim: true, dateStr: null });
  }

  const roundsByDate = {};
  rounds.forEach((r) => {
    (roundsByDate[r.date] = roundsByDate[r.date] || []).push(r);
  });

  const cellsHtml = cells.map((c) => {
    if (!c.dateStr) {
      return `<div class="cal-cell empty other-dim"><span class="day-num">${c.dayNum}</span></div>`;
    }
    const dayRounds = roundsByDate[c.dateStr] || [];
    const isToday = c.dateStr === today;
    const dots = dayRounds.map((r) => {
      const cls = r.cancelled ? 'cancelled' : r.isBlock ? 'block' : 'round';
      return `<span class="cal-dot ${cls}"></span>`;
    }).join('');
    return `
      <div class="cal-cell${isToday ? ' today' : ''}" data-date="${c.dateStr}">
        <span class="day-num">${c.dayNum}</span>
        <span class="dot-wrap">${dots}</span>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="month-nav">
      <button class="icon-btn" id="prev-month-btn" aria-label="이전 달">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="month-label">${formatMonthKr(viewYear, viewMonth)}</div>
      <button class="icon-btn" id="next-month-btn" aria-label="다음 달">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
    <div class="cal-grid">
      ${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cellsHtml}
    </div>
    <div class="legend-row">
      <span class="legend-item"><span class="cal-dot round"></span>라운드</span>
      <span class="legend-item"><span class="cal-dot block"></span>블럭</span>
      <span class="legend-item"><span class="cal-dot cancelled"></span>취소</span>
    </div>
    <button class="fab" id="add-schedule-fab" aria-label="일정 추가">+</button>
  `;

  container.querySelector('#prev-month-btn').addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    renderSchedule(container);
  });
  container.querySelector('#next-month-btn').addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderSchedule(container);
  });
  container.querySelector('#add-schedule-fab').addEventListener('click', () => {
    openScheduleModal(today, null);
  });
  container.querySelectorAll('.cal-cell[data-date]').forEach((cell) => {
    cell.addEventListener('click', () => {
      const dateStr = cell.dataset.date;
      const dayRounds = roundsByDate[dateStr] || [];
      openScheduleModal(dateStr, dayRounds[0] || null);
    });
  });
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
