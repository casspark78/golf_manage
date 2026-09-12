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

export function formatMonthDayKr(dateStr) {
  const d = strToDate(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function formatDateYMDKr(dateStr) {
  const d = strToDate(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
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

export function parseDurationMinutes(str) {
  if (!str) return 0;
  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*시간/);
  const minMatch = str.match(/(\d+)\s*분/);
  let minutes = 0;
  if (hourMatch) minutes += parseFloat(hourMatch[1]) * 60;
  if (minMatch) minutes += parseInt(minMatch[1], 10);
  if (!hourMatch && !minMatch) {
    const numMatch = str.match(/^\s*(\d+)\s*$/);
    if (numMatch) minutes += parseInt(numMatch[1], 10);
  }
  return Math.round(minutes);
}

export function formatMinutesKr(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

/**
 * Rough estimate of bytes used by this origin's localStorage (UTF-16, 2
 * bytes/char). Used to warn users before they hit the quota wall — most
 * commonly caused by accumulated round photos, which are the biggest
 * consumer of storage in this app.
 */
export function getLocalStorageUsageBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key) || '';
    total += (key.length + value.length) * 2;
  }
  return total;
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

function drawResized(file, maxDim, onCanvas, reject) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      onCanvas(canvas);
    };
    img.onerror = reject;
    img.src = reader.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
}

/**
 * Downscale + re-encode an image file to a binary JPEG Blob, which is what
 * gets stored in IndexedDB. A Blob is ~2.7x smaller than the same image kept
 * as a base64 string in localStorage (base64 inflates by a third, and
 * localStorage stores every character as 2-byte UTF-16).
 */
export function resizeImageToBlob(file, maxDim = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    drawResized(file, maxDim, (canvas) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했습니다.'))),
        'image/jpeg',
        quality
      );
    }, reject);
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, commaIdx);
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(dataUrl.slice(commaIdx + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
