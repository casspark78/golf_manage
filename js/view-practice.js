import { getPracticesList, getPracticeByDate, upsertPractice, deletePractice, getState, updateSettings } from './state.js';
import { dateToStr, todayStr, formatDateKr, escapeHtml, parseDurationMinutes, formatMinutesKr } from './utils.js';
import { toast, confirmAction } from './components.js';
import { summarizePracticeTips } from './gemini.js';

let viewYear;
let viewMonth; // 0-indexed
let selectedDate = todayStr();
let rerenderFn = null;

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CLUB_OPTIONS = ['드라이버', '우드', '유틸', '아이언', '웨지', '퍼터'];
const DURATION_OPTIONS = ['30분', '1시간', '1시간30분', '2시간', '2시간30분', '3시간'];

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
      <div class="cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${hasPractice ? ' has-practice' : ''}" data-date="${c.dateStr}">
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

    <div class="section-title">연습 통계</div>
    <div id="practice-stats-wrap"></div>
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
  renderPracticeStats(container.querySelector('#practice-stats-wrap'));
}

function computePracticeStats(practices) {
  const totalDays = practices.length;
  const totalMinutes = practices.reduce((sum, p) => sum + parseDurationMinutes(p.duration), 0);
  const totalBalls = practices.reduce((sum, p) => sum + (typeof p.totalBalls === 'number' ? p.totalBalls : 0), 0);
  const clubCounts = {};
  practices.forEach((p) => {
    if (p.bestClub) clubCounts[p.bestClub] = (clubCounts[p.bestClub] || 0) + 1;
  });
  const topClubEntry = Object.entries(clubCounts).sort((a, b) => b[1] - a[1])[0];
  return {
    totalDays,
    totalMinutes,
    totalBalls,
    topClub: topClubEntry ? topClubEntry[0] : null,
    topClubCount: topClubEntry ? topClubEntry[1] : 0,
  };
}

function renderPracticeStats(wrap) {
  const practices = getPracticesList();

  if (!practices.length) {
    wrap.innerHTML = `<div class="card"><div class="empty-state">아직 연습 기록이 없습니다.<br>캘린더에서 날짜를 선택해 기록을 남겨보세요.</div></div>`;
    return;
  }

  const stats = computePracticeStats(practices);
  const memoCount = practices.filter((p) => p.memo && p.memo.trim()).length;
  const settings = getState().settings;
  const insights = settings.practiceInsights;
  const stale = insights && insights.forCount !== memoCount;

  wrap.innerHTML = `
    <div class="card">
      <div class="summary-grid" style="grid-template-columns: repeat(2, 1fr);">
        <div class="summary-tile">
          <div class="value">${stats.totalDays}</div>
          <div class="label">총 연습일수</div>
        </div>
        <div class="summary-tile">
          <div class="value" style="font-size:22px;">${stats.totalMinutes ? formatMinutesKr(stats.totalMinutes) : '-'}</div>
          <div class="label">총 연습시간</div>
        </div>
        <div class="summary-tile">
          <div class="value">${stats.totalBalls ? stats.totalBalls.toLocaleString() : '-'}</div>
          <div class="label">총 연습타수</div>
        </div>
        <div class="summary-tile">
          <div class="value neutral" style="font-size:22px;">${stats.topClub || '-'}</div>
          <div class="label">최고클럽 선택${stats.topClub ? ` (${stats.topClubCount}회)` : ''}</div>
        </div>
      </div>

      <div class="ai-summary-box" style="margin-top:14px;">
        <div class="settings-row" style="border-bottom:none; padding-bottom:0;">
          <div>
            <div class="label">AI 팁 요약</div>
            <div class="desc">메모란에 남긴 내용만 Gemini로 요약합니다</div>
          </div>
        </div>
        <div id="ai-summary-content" style="margin-top:10px;">
          ${insights?.summary ? `<div class="ai-summary-text">${escapeHtml(insights.summary)}</div>${stale ? '<div class="desc" style="margin-top:6px;">새 기록이 추가되었습니다. 다시 요약해보세요.</div>' : ''}` : ''}
        </div>
        <button class="btn btn-secondary" id="ai-summary-btn" style="width:100%; margin-top:10px;">
          ${insights?.summary ? 'AI 요약 다시 생성' : 'AI로 팁 요약하기'}
        </button>
      </div>
    </div>
  `;

  wrap.querySelector('#ai-summary-btn').addEventListener('click', async () => {
    const apiKey = getState().settings.geminiApiKey;
    const btn = wrap.querySelector('#ai-summary-btn');
    btn.disabled = true;
    btn.textContent = '요약 생성 중...';
    try {
      const summary = await summarizePracticeTips(apiKey, getPracticesList());
      const newMemoCount = getPracticesList().filter((p) => p.memo && p.memo.trim()).length;
      updateSettings({ practiceInsights: { summary, forCount: newMemoCount, generatedAt: Date.now() } });
      renderPracticeStats(wrap);
    } catch (e) {
      console.error(e);
      toast(e.message || 'AI 요약 생성에 실패했습니다.', 3200);
      btn.disabled = false;
      btn.textContent = insights?.summary ? 'AI 요약 다시 생성' : 'AI로 팁 요약하기';
    }
  });
}

function renderPracticeForm(wrap, date) {
  const existing = getPracticeByDate(date);

  wrap.innerHTML = `
    <div class="card">
      <div class="field-row">
        <div class="field">
          <label>연습 시간</label>
          <select id="p-duration">
            <option value="">선택 안 함</option>
            ${DURATION_OPTIONS.map((d) => `<option value="${d}" ${existing?.duration === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
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
    try {
      upsertPractice(date, data);
      toast('연습 기록이 저장되었습니다.');
      rerenderFn && rerenderFn();
    } catch (e) {
      console.error(e);
      toast(e.message, 4500);
    }
  });

  const deleteBtn = wrap.querySelector('#p-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!confirmAction('이 날의 연습 기록을 삭제할까요?')) return;
      try {
        deletePractice(existing.id);
        toast('연습 기록이 삭제되었습니다.');
        rerenderFn && rerenderFn();
      } catch (e) {
        console.error(e);
        toast(e.message, 4500);
      }
    });
  }
}
