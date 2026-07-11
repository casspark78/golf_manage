export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function todayStr() {
  return dateToStr(new Date());
}

export function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function strToDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, days) {
  const d = strToDate(dateStr);
  d.setDate(d.getDate() + days);
  return dateToStr(d);
}

export function diffDays(fromStr, toStr) {
  const a = strToDate(fromStr);
  const b = strToDate(toStr);
  return Math.round((b - a) / 86400000);
}

export function formatDateKr(dateStr) {
  const d = strToDate(dateStr);
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${week[d.getDay()]})`;
}

export function formatMonthKr(year, month) {
  return `${year}년 ${month + 1}월`;
}

export function isSameMonth(dateStr, year, month) {
  const d = strToDate(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.substring(result.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
