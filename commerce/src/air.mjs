const minute = 60_000;
const freshFor = 30 * minute;
const maxAge = 2 * 60 * minute;
const maxBytes = 16 * 1024;
const customerEndpoint = 'https://customer-api.open-meteo.com/v1/forecast';
const previewEndpoint = 'https://api.open-meteo.com/v1/forecast';

// The third value selects the GFS seamless model at the US sites.
const sites = new Map(Object.entries({
  alaska: [58.418, -134.565, true], canyon: [36.879, -111.510, true], swiss: [46.498, 7.727],
  winnipesaukee: [43.585, -71.330, true], surry: [43.006, -72.311, true], dixville: [44.867, -71.305, true],
  labrador: [50.747, -68.500], moosehead: [45.700, -69.730, true], yosemite: [37.723, -119.637, true],
  crater: [42.944, -122.109, true], lofoten: [67.932, 13.089], acadia: [44.321, -68.187, true],
  yellowstone: [44.461, -110.829, true]
}));
const temperature = [-100, 70];
const wind = [0, 150];
const currentFields = { temperature_2m: temperature, relative_humidity_2m: [0, 100], surface_pressure: [300, 1100], wind_speed_10m: wind };
const hourlyFields = { temperature_80m: temperature, temperature_120m: temperature, wind_speed_80m: wind, wind_speed_120m: wind };

function provider({ mode, forecastKey, forecastEndpoint }) {
  try {
    const address = forecastEndpoint || (forecastKey ? customerEndpoint : previewEndpoint);
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (url.href === customerEndpoint) {
      if (!forecastKey) return null;
      url.searchParams.set('apikey', forecastKey);
    } else if (/(^|\.)open-meteo\.com$/.test(url.hostname.replace(/\.+$/, ''))) {
      if (mode !== 'test' || url.href !== previewEndpoint) return null;
    }
    return url;
  } catch {
    return null;
  }
}

function bounded(value, [low, high]) {
  if (!Number.isFinite(value) || value < low || value > high) throw new Error('Invalid forecast measurement.');
  return value;
}

function measurements({ current, hourly }, now) {
  if (typeof current?.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(current?.time) || !hourly || typeof hourly !== 'object' || Array.isArray(hourly)) {
    throw new Error('Invalid forecast.');
  }
  const observed = Date.parse(current.time + ':00Z');
  if (!Number.isFinite(observed) || observed > now + 15 * minute || now >= observed + maxAge) throw new Error('Stale forecast.');
  const forecast = { current: { time: current.time }, hourly: {} };
  for (const [field, limits] of Object.entries(currentFields)) forecast.current[field] = bounded(current[field], limits);
  for (const [field, limits] of Object.entries(hourlyFields)) {
    const series = hourly[field];
    if (series !== undefined && (!Array.isArray(series) || series.length !== 1)) throw new Error('Invalid hourly forecast.');
    const value = series?.[0];
    forecast.hourly[field] = [value == null ? null : bounded(value, limits)];
  }
  return { forecast, observed };
}

async function fetchForecast(endpoint, [lat, lon, us], fetcher, now) {
  const url = new URL(endpoint);
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('current', Object.keys(currentFields).join(','));
  url.searchParams.set('hourly', Object.keys(hourlyFields).join(','));
  url.searchParams.set('forecast_hours', '1');
  url.searchParams.set('wind_speed_unit', 'ms');
  if (us) url.searchParams.set('models', 'gfs_seamless');
  const response = await fetcher(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(4000) });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error('Forecast unavailable.');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw new Error('Oversized forecast.');
    chunks.push(chunk);
  }
  return measurements(JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')), now());
}

export function createAirForecast(config, { fetcher = fetch, now = Date.now } = {}) {
  const endpoint = provider(config);
  const regions = new Map();
  return async function air(request) {
    const region = request.query.get('region');
    if (!sites.has(region)) return { status: 400, jsonBody: { error: 'Unknown forecast region.' } };
    if (!endpoint) return { status: 204 };
    const entry = regions.get(region) || { nextAttempt: 0, validUntil: 0 };
    regions.set(region, entry);
    if (now() >= entry.nextAttempt && !entry.pending) {
      entry.pending = fetchForecast(endpoint, sites.get(region), fetcher, now).then(({ forecast, observed }) => {
        entry.forecast = forecast;
        entry.validUntil = Math.min(observed, now()) + maxAge;
        entry.nextAttempt = Math.min(entry.validUntil, now() + freshFor);
      }).catch(() => {
        entry.nextAttempt = now() + minute;
      }).finally(() => { delete entry.pending; });
    }
    await entry.pending;
    return entry.forecast && now() < entry.validUntil ? { status: 200, jsonBody: entry.forecast } : { status: 204 };
  };
}
