import { getNextRound, getRecentResults, getStatsSummary } from './state.js';
import { formatDateKr, diffDays, todayStr, round1, escapeHtml } from './utils.js';

export function renderHome(container, { goToTab }) {
  const summary = getStatsSummary();
  const next = getNextRound();
  const recent = getRecentResults(5);

  const bestText = summary.best !== null ? summary.best : '-';
  const avgText = summary.average !== null ? round1(summary.average) : '-';

  let ddayBlock = '';
  if (next) {
    const d = diffDays(todayStr(), next.date);
    const ddayLabel = d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${Math.abs(d)}`;
    ddayBlock = `
      <div class="next-round-card">
        <span class="badge-icon">⛳</span>
        <div class="dday">${ddayLabel}</div>
        <div class="course">${escapeHtml(next.course || '골프장 미정')}</div>
        <div class="meta">${formatDateKr(next.date)} · ${next.holes}홀${next.companions?.length ? ` · 동반자 ${next.companions.length}명` : ''}</div>
      </div>`;
  } else {
    ddayBlock = `
      <div class="next-round-card" style="background:var(--bg-card); color: var(--text-primary); border:1px solid var(--border);">
        <div style="font-size:15px; font-weight:700; color:var(--text-secondary);">예정된 라운드가 없어요</div>
        <div style="font-size:13px; color:var(--text-tertiary); margin-top:4px; font-weight:600;">일정 탭에서 새 라운드를 등록해보세요</div>
      </div>`;
  }

  let recentBlock = '';
  if (recent.length) {
    recentBlock = recent.map((r) => {
      const diff = typeof r.par === 'number' ? r.score - r.par : null;
      const diffText = diff === null ? '' : diff === 0 ? 'PAR' : diff > 0 ? `+${diff}` : `${diff}`;
      return `
        <div class="result-row">
          <div class="info">
            <div class="date">${formatDateKr(r.date)}</div>
            <div class="course">${escapeHtml(r.course || '골프장 미정')}</div>
          </div>
          <div class="score-badge">${r.score}<span class="par-diff">${diffText}</span></div>
        </div>`;
    }).join('');
  } else {
    recentBlock = `<div class="empty-state">아직 기록된 라운드가 없어요</div>`;
  }

  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-tile">
        <div class="value neutral">${summary.total}</div>
        <div class="label">총 라운드</div>
      </div>
      <div class="summary-tile">
        <div class="value">${bestText}</div>
        <div class="label">베스트</div>
      </div>
      <div class="summary-tile">
        <div class="value neutral">${avgText}</div>
        <div class="label">평균</div>
      </div>
    </div>

    <div class="section-title">다음 라운드</div>
    ${ddayBlock}

    <div class="section-title">
      최근 결과
      <button class="action-link" id="home-go-stats">전체보기</button>
    </div>
    ${recentBlock}
  `;

  container.querySelector('#home-go-stats')?.addEventListener('click', () => goToTab('stats'));
}
