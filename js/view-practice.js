import { getPracticesList, getPracticeByDate, upsertPractice, deletePractice } from './state.js';
import { dateToStr, todayStr, formatDateKr, escapeHtml } from './utils.js';
import { toast, confirmAction } from './components.js';

let viewYear;
let viewMonth; // 0-indexed
let selectedDate = todayStr();
let rerenderFn = null;

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CLUB_OPTIONS = ['드라이버', '우드', '유틸', '아이언', '웨지', '퍼터'];

function initMonthIfNeeded() {
  if (viewYear === undefined) {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  }
}

export function renderPractice(container) {
  initMonthIfNeeded();
  rerenderFn = () => renderPractice(container);

  const practiceDates = new Set(getPracticesList().map((p) => p.date));
  const today = todayStr();

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startDow = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) {
    cells.push({ dayNum: daysInPrevMonth - startDow + 1 + i, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dayNum: d, dateStr: dateToStr(new Date(viewYear, viewMonth, d)) });
  }
  while (cells.length % 7 !== 0) {
    const idx = cells.length - (startDow + daysInMonth);
    cells.push({ dayNum: idx + 1, dateStr: null });
  }

  const cellsHtml = cells.map((c) => {
    if (!c.dateStr) {
      return `<div class="cal-cell empty other-dim"><span class="day-num">${c.dayNum}</span></div>`;
    }
    const isToday = c.dateStr === today;
    const isSelected = c.dateStr === selectedDate;
    const hasPractice = practiceDates.has(c.dateStr);
    return `
      <div class="cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" data-date="${c.dateStr}">
        <span class="day-num">${c.dayNum}</span>
        <span class="dot-wrap">${hasPractice ? '<span class="cal-dot practice"></span>' : ''}</span>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="page-title">연습</div>
    <div class="month-nav">
      <button class="icon-btn" id="practice-prev-month" aria-label="이전 달">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="month-label">${viewYear}년 ${viewMonth + 1}월</div>
      <button class="icon-btn" id="practice-next-month" aria-label="다음 달">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
    <div class="cal-grid">
      ${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cellsHtml}
    </div>

    <div class="section-title">${formatDateKr(selectedDate)} 연습 기록</div>
    <div id="practice-form-wrap"></div>
  `;

  container.querySelector('#practice-prev-month').addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    renderPractice(container);
  });
  container.querySelector('#practice-next-month').addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderPractice(container);
  });
  container.querySelectorAll('.cal-cell[data-date]').forEach((cell) => {
    cell.addEventListener('click', () => {
      selectedDate = cell.dataset.date;
      renderPractice(container);
    });
  });

  renderPracticeForm(container.querySelector('#practice-form-wrap'), selectedDate);
}

function renderPracticeForm(wrap, date) {
  const existing = getPracticeByDate(date);

  wrap.innerHTML = `
    <div class="card">
      <div class="field-row">
        <div class="field">
          <label>연습 시간</label>
          <input type="text" id="p-duration" placeholder="예: 1시간 30분" value="${escapeHtml(existing?.duration || '')}">
        </div>
        <div class="field">
          <label>총 연습타수</label>
          <input type="number" id="p-balls" placeholder="개" value="${existing?.totalBalls ?? ''}">
        </div>
      </div>
      <div class="field-row" style="margin-top:12px;">
        <div class="field">
          <label>드라이버 최대비거리</label>
          <input type="number" id="p-distance" placeholder="m" value="${existing?.driverMaxDistance ?? ''}">
        </div>
        <div class="field">
          <label>오늘의 최고클럽</label>
          <select id="p-club">
            <option value="">선택 안 함</option>
            ${CLUB_OPTIONS.map((c) => `<option value="${c}" ${existing?.bestClub === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>메모</label>
        <textarea id="p-memo" rows="5" placeholder="오늘 연습하면서 느낀 팁을 적어보세요">${escapeHtml(existing?.memo || '')}</textarea>
      </div>
      <div class="btn-row" style="margin-top:16px;">
        ${existing ? '<button class="btn btn-danger" id="p-delete">삭제</button>' : ''}
        <button class="btn btn-primary" id="p-save">저장</button>
      </div>
    </div>
  `;

  wrap.querySelector('#p-save').addEventListener('click', () => {
    const ballsVal = wrap.querySelector('#p-balls').value;
    const distanceVal = wrap.querySelector('#p-distance').value;
    const data = {
      duration: wrap.querySelector('#p-duration').value.trim(),
      totalBalls: ballsVal === '' ? null : Number(ballsVal),
      driverMaxDistance: distanceVal === '' ? null : Number(distanceVal),
      bestClub: wrap.querySelector('#p-club').value || null,
      memo: wrap.querySelector('#p-memo').value.trim(),
    };
    upsertPractice(date, data);
    toast('연습 기록이 저장되었습니다.');
    rerenderFn && rerenderFn();
  });

  const deleteBtn = wrap.querySelector('#p-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!confirmAction('이 날의 연습 기록을 삭제할까요?')) return;
      deletePractice(existing.id);
      toast('연습 기록이 삭제되었습니다.');
      rerenderFn && rerenderFn();
    });
  }
}
