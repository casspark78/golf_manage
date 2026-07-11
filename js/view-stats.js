import { getScoreTrend, getStatsSummary, getPlayableRounds, getTopCourses, getTopCompanions } from './state.js';
import { formatDateYMDKr, round1, escapeHtml, strToDate } from './utils.js';

const CHART_MIN = 70;
const CHART_MAX = 110;

export function renderStats(container) {
  const trend = getScoreTrend();
  const summary = getStatsSummary();
  const allRounds = getPlayableRounds()
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  const bestText = summary.best !== null ? summary.best : '-';
  const avgText = summary.average !== null ? round1(summary.average) : '-';
  const parDiffText = summary.avgParDiff !== null
    ? (summary.avgParDiff > 0 ? `+${round1(summary.avgParDiff)}` : round1(summary.avgParDiff))
    : '-';

  const topCourses = getTopCourses(5);
  const topCompanions = getTopCompanions(5);
  const courseRankHtml = buildBest5ListHtml(topCourses);
  const companionRankHtml = buildBest5ListHtml(topCompanions);

  const recordsHtml = allRounds.length
    ? allRounds.map((r) => {
      const diff = typeof r.par === 'number' ? r.score - r.par : null;
      const diffText = diff === null ? '' : diff === 0 ? 'PAR' : diff > 0 ? `+${diff}` : `${diff}`;
      const diffCls = diff === null ? '' : diff > 0 ? 'over' : diff < 0 ? 'under' : 'even';
      return `
        <div class="record-item">
          <div class="info">
            <div class="course">${escapeHtml(r.course || '골프장 미정')}</div>
            <div class="date">${formatDateYMDKr(r.date)}</div>
          </div>
          <div class="score-block">
            <div class="score">${r.score}타</div>
            ${diffText ? `<div class="diff ${diffCls}">${diffText}</div>` : ''}
          </div>
        </div>`;
    }).join('')
    : `<div class="empty-state">완료된 기록이 없어요</div>`;

  container.innerHTML = `
    <div class="page-title">통계</div>

    <div class="section-title" style="margin-top:0;">나의 골프 기록</div>
    <div class="stat-tile-grid">
      <div class="stat-tile">
        <div class="icon">🚩</div>
        <div class="value">${summary.total}회</div>
        <div class="label">총 라운드</div>
      </div>
      <div class="stat-tile">
        <div class="icon">🏆</div>
        <div class="value">${bestText}</div>
        <div class="label">베스트 스코어</div>
      </div>
      <div class="stat-tile">
        <div class="icon">📈</div>
        <div class="value">${avgText}</div>
        <div class="label">평균 스코어</div>
      </div>
      <div class="stat-tile">
        <div class="icon" style="color: var(--score-over);">±</div>
        <div class="value">${parDiffText}</div>
        <div class="label">평균 파 대비</div>
      </div>
    </div>

    <div class="section-title">스코어 추이</div>
    <div class="chart-wrap">
      <canvas id="trend-canvas" height="220"></canvas>
    </div>

    <div class="section-title">골프장 Best 5</div>
    <div class="card">${courseRankHtml}</div>

    <div class="section-title">동반자 Best 5</div>
    <div class="card">${companionRankHtml}</div>

    <div class="section-title">전체 기록</div>
    <div class="card">${recordsHtml}</div>
  `;

  drawTrendChart(container.querySelector('#trend-canvas'), trend, summary.average);
}

function drawTrendChart(canvas, trend, average) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth - 24;
  const cssHeight = 220;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue('--primary').trim() || '#2DC96E';
  const textSecondary = styles.getPropertyValue('--text-secondary').trim() || '#888';
  const avgColor = styles.getPropertyValue('--cancel').trim() || '#FF9500';

  if (!trend.length) {
    ctx.fillStyle = textSecondary;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('아직 스코어 기록이 없어요', cssWidth / 2, cssHeight / 2);
    return;
  }

  const padL = 34;
  const padR = 10;
  const padT = 16;
  const padB = 22;
  const plotW = cssWidth - padL - padR;
  const plotH = cssHeight - padT - padB;

  const min = CHART_MIN;
  const max = CHART_MAX;

  const xFor = (i) => padL + (trend.length === 1 ? plotW / 2 : (i / (trend.length - 1)) * plotW);
  const yFor = (v) => padT + plotH - ((clamp(v, min, max) - min) / (max - min)) * plotH;

  // y-axis labels every 10, from min to max (no grid lines, kept simple)
  ctx.fillStyle = textSecondary;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  const step = 10;
  for (let v = min; v <= max; v += step) {
    const y = yFor(v);
    ctx.fillText(v.toString(), padL - 6, y + 3);
  }

  // average dashed line
  if (typeof average === 'number') {
    const avgY = yFor(average);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = avgColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, avgY);
    ctx.lineTo(cssWidth - padR, avgY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = avgColor;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`평균 ${round1(average)}`, cssWidth - padR - 4, avgY - 5);
  }

  // line path
  ctx.beginPath();
  trend.forEach((t, i) => {
    const x = xFor(i);
    const y = yFor(t.score);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = primary;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // area fill
  const lastX = xFor(trend.length - 1);
  ctx.lineTo(lastX, padT + plotH);
  ctx.lineTo(xFor(0), padT + plotH);
  ctx.closePath();
  ctx.fillStyle = `${primary}22`;
  ctx.fill();

  // points
  trend.forEach((t, i) => {
    const x = xFor(i);
    const y = yFor(t.score);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = primary;
    ctx.fill();
  });

  // x labels: a handful of evenly spaced year-month labels
  ctx.fillStyle = textSecondary;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const labelCount = Math.min(4, trend.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = labelCount === 1 ? 0 : Math.round((i / (labelCount - 1)) * (trend.length - 1));
    const x = xFor(idx);
    const align = idx === 0 ? 'left' : idx === trend.length - 1 ? 'right' : 'center';
    ctx.textAlign = align;
    ctx.fillText(monthLabel(trend[idx].date), x, cssHeight - 6);
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function buildBest5ListHtml(items) {
  if (!items.length) return `<div class="empty-state" style="padding:16px 4px;">데이터 없음</div>`;
  return items.map((item, i) => {
    const range = item.min === item.max ? `${item.min}타` : `${item.min}~${item.max}타`;
    return `
    <div class="best5-row">
      <div class="best5-rank${i === 0 ? ' top' : ''}">${i + 1}</div>
      <div class="best5-info">
        <div class="best5-name">${escapeHtml(item.name)}</div>
        <div class="best5-sub">${item.count}회 · 평균 ${round1(item.average)} (${range})</div>
      </div>
    </div>`;
  }).join('');
}

function monthLabel(dateStr) {
  const d = strToDate(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}
