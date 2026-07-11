import { getScoreTrend, getStatsSummary, getRoundsList } from './state.js';
import { formatDateKr, round1, escapeHtml } from './utils.js';

export function renderStats(container) {
  const trend = getScoreTrend();
  const summary = getStatsSummary();
  const allRounds = getRoundsList()
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  const bestText = summary.best !== null ? summary.best : '-';
  const avgText = summary.average !== null ? round1(summary.average) : '-';
  const parDiffText = summary.avgParDiff !== null
    ? (summary.avgParDiff > 0 ? `+${round1(summary.avgParDiff)}` : round1(summary.avgParDiff))
    : '-';

  const recordsHtml = allRounds.length
    ? allRounds.map((r) => {
      const tags = [];
      if (r.isBlock) tags.push('<span class="tag block">블럭</span>');
      if (r.cancelled) tags.push('<span class="tag cancelled">취소</span>');
      const scoreDisplay = typeof r.score === 'number' ? r.score : '-';
      return `
        <div class="record-item">
          <div class="info">
            <div class="date">${formatDateKr(r.date)}</div>
            <div class="course">${escapeHtml(r.course || (r.isBlock ? '블럭 일정' : '골프장 미정'))}</div>
            <div class="tags">${tags.join('')}</div>
          </div>
          <div class="score">${scoreDisplay}</div>
        </div>`;
    }).join('')
    : `<div class="empty-state">전체 기록이 없어요</div>`;

  container.innerHTML = `
    <div class="section-title">스코어 추이</div>
    <div class="chart-wrap">
      <canvas id="trend-canvas" height="180"></canvas>
    </div>

    <div class="stats-grid">
      <div class="summary-tile">
        <div class="value">${bestText}</div>
        <div class="label">베스트</div>
      </div>
      <div class="summary-tile">
        <div class="value neutral">${avgText}</div>
        <div class="label">평균</div>
      </div>
      <div class="summary-tile">
        <div class="value neutral">${parDiffText}</div>
        <div class="label">파 대비</div>
      </div>
    </div>

    <div class="section-title">전체 기록</div>
    <div class="card">${recordsHtml}</div>
  `;

  drawTrendChart(container.querySelector('#trend-canvas'), trend);
}

function drawTrendChart(canvas, trend) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth - 24;
  const cssHeight = 180;
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
  const border = styles.getPropertyValue('--border').trim() || '#333';

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

  const scores = trend.map((t) => t.score);
  let min = Math.min(...scores);
  let max = Math.max(...scores);
  if (min === max) { min -= 5; max += 5; }
  const margin = (max - min) * 0.15 || 5;
  min -= margin;
  max += margin;

  const xFor = (i) => padL + (trend.length === 1 ? plotW / 2 : (i / (trend.length - 1)) * plotW);
  const yFor = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;

  // grid lines (3 horizontal)
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.fillStyle = textSecondary;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  const gridCount = 3;
  for (let i = 0; i <= gridCount; i++) {
    const v = min + ((max - min) * i) / gridCount;
    const y = yFor(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(cssWidth - padR, y);
    ctx.stroke();
    ctx.fillText(Math.round(v).toString(), padL - 6, y + 3);
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

  // x labels: first and last date
  ctx.fillStyle = textSecondary;
  ctx.textAlign = 'left';
  ctx.fillText(shortDate(trend[0].date), padL, cssHeight - 6);
  ctx.textAlign = 'right';
  ctx.fillText(shortDate(trend[trend.length - 1].date), cssWidth - padR, cssHeight - 6);
}

function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}
