const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const WEATHER_CODE_MAP = {
  0: { icon: '☀️', label: '맑음' },
  1: { icon: '🌤️', label: '대체로 맑음' },
  2: { icon: '⛅', label: '구름 조금' },
  3: { icon: '☁️', label: '흐림' },
  45: { icon: '🌫️', label: '안개' },
  48: { icon: '🌫️', label: '안개' },
  51: { icon: '🌦️', label: '이슬비' },
  53: { icon: '🌦️', label: '이슬비' },
  55: { icon: '🌦️', label: '이슬비' },
  61: { icon: '🌧️', label: '비' },
  63: { icon: '🌧️', label: '비' },
  65: { icon: '🌧️', label: '강한 비' },
  66: { icon: '🌧️', label: '어는 비' },
  67: { icon: '🌧️', label: '어는 비' },
  71: { icon: '🌨️', label: '눈' },
  73: { icon: '🌨️', label: '눈' },
  75: { icon: '🌨️', label: '폭설' },
  77: { icon: '🌨️', label: '가루눈' },
  80: { icon: '🌦️', label: '소나기' },
  81: { icon: '🌦️', label: '소나기' },
  82: { icon: '⛈️', label: '강한 소나기' },
  85: { icon: '🌨️', label: '소나기 눈' },
  86: { icon: '🌨️', label: '소나기 눈' },
  95: { icon: '⛈️', label: '뇌우' },
  96: { icon: '⛈️', label: '뇌우' },
  99: { icon: '⛈️', label: '뇌우' },
};

function describeCode(code) {
  return WEATHER_CODE_MAP[code] || { icon: '🌡️', label: '-' };
}

export async function geocodeLocation(query) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=1&language=ko&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('위치 검색에 실패했습니다.');
  const data = await res.json();
  const first = data.results?.[0];
  if (!first) throw new Error('해당 지역을 찾을 수 없습니다.');
  return { lat: first.latitude, lon: first.longitude, name: first.name };
}

const CACHE_KEY = 'golf_weather_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) { /* ignore quota errors */ }
}

/**
 * Returns { icon, label, tempMax, tempMin, windMax } for dateStr, or null if
 * the date is outside the forecast provider's available range.
 */
export async function getDailyForecast(lat, lon, dateStr) {
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)},${dateStr}`;
  const cache = readCache();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max&timezone=Asia%2FSeoul&forecast_days=16`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('날씨 정보를 가져오지 못했습니다.');
  const json = await res.json();
  const idx = json.daily?.time?.indexOf(dateStr);

  if (idx === undefined || idx === -1) {
    cache[cacheKey] = { fetchedAt: Date.now(), data: null };
    writeCache(cache);
    return null;
  }

  const { icon, label } = describeCode(json.daily.weathercode[idx]);
  const data = {
    icon,
    label,
    tempMax: Math.round(json.daily.temperature_2m_max[idx]),
    tempMin: Math.round(json.daily.temperature_2m_min[idx]),
    windMax: Math.round(json.daily.windspeed_10m_max[idx]),
  };

  cache[cacheKey] = { fetchedAt: Date.now(), data };
  writeCache(cache);
  return data;
}
