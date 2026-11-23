import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommerce } from '../src/commerce.mjs';
import { allWorlds, configuration } from '../src/settings.mjs';

const minute = 60_000;
const start = Date.parse('2026-11-23T09:00Z');
const secret = 'fixture-provider-secret';
const example = () => ({
  current: { time: '2026-11-23T09:00', temperature_2m: 8.1, relative_humidity_2m: 86, surface_pressure: 992.2, wind_speed_10m: 0.28 },
  hourly: { temperature_80m: [10.4], temperature_120m: [null], wind_speed_80m: [0.86], wind_speed_120m: [2.03] }
});
const sampleSnapshot = () => ({
  version: 1, generatedAt: new Date(start).toISOString(),
  regions: Object.fromEntries(allWorlds.map(world => [world, example()]))
});
function fixture(env = {}, upstream = () => Response.json(example()), readWeatherBlob) {
  const config = configuration(env);
  const urls = [], errors = [];
  let time = start;
  const app = createCommerce(config, { now: () => time, readWeatherBlob, fetchForecast: (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    urls.push(url);
    return upstream(url);
  } });
  const request = (region = 'winnipesaukee', action = 'air') => app.handle(action, {
    method: 'GET', query: new URLSearchParams({ region }), headers: new Headers()
  }, { error: value => errors.push(value) });
  return { urls, request, errors, at: minutes => { time = start + minutes * minute; } };
}

test('private Azure snapshot selection coalesces reads and never contacts the forecast provider on failure', async () => {
  let reads = 0;
  const settings = {
    AERIE_STRIPE_MODE: 'live', AERIE_ACOUSTIC_SNAPSHOT_STORAGE_ENABLED: 'true',
    AERIE_OPEN_METEO_API_KEY: secret, AERIE_ACOUSTIC_SNAPSHOT_URL: 'https://weather.aerie.example/snapshot.json'
  };
  const working = fixture(settings, undefined, async () => {
    reads++;
    return Response.json(sampleSnapshot());
  });
  const results = await Promise.all([working.request('alaska'), working.request('winnipesaukee')]);
  assert.equal(reads, 1);
  assert.ok(results.every(reply => reply.status === 200));
  for (const reply of results) assert.deepEqual(reply.jsonBody, example());
  assert.equal(working.urls.length, 0);
  for (const read of [undefined, async () => new Response(null, { status: 403 })]) {
    const broken = fixture(settings, undefined, read);
    assert.equal((await broken.request()).status, 204);
    assert.equal(broken.urls.length, 0);
  }
});

test('a prepared live snapshot supplies all worlds in one fetch and an invalid refresh retains the previous forecast', async () => {
  let payload = sampleSnapshot();
  const address = 'https://weather.aerie.example/snapshot.json';
  const api = fixture({
    AERIE_STRIPE_MODE: 'live', AERIE_ACOUSTIC_SNAPSHOT_URL: address,
    AERIE_OPEN_METEO_API_KEY: secret
  }, () => Response.json(payload));
  const results = await Promise.all(allWorlds.map(world => api.request(world)));
  assert.ok(results.every(reply => reply.status === 200));
  assert.equal(api.urls.length, 1);
  assert.equal(api.urls[0].href, address);
  assert.deepEqual(results[0].jsonBody, example());
  payload = sampleSnapshot();
  payload.regions.yosemite.current.surface_pressure = null;
  api.at(6);
  assert.deepEqual((await api.request('yosemite')).jsonBody, example());
  assert.equal(api.urls.length, 2);
  api.at(120);
  assert.equal((await api.request('yosemite')).status, 204);
  assert.equal(api.urls.length, 3);
});

test('a snapshot URL with credentials or a free Open-Meteo host makes no upstream request', async () => {
  for (const address of ['https://weather.aerie.example/snapshot.json?key=fixture', 'https://api.open-meteo.com/v1/forecast']) {
    const api = fixture({ AERIE_STRIPE_MODE: 'live', AERIE_ACOUSTIC_SNAPSHOT_URL: address });
    assert.equal((await api.request()).status, 204);
    assert.equal(api.urls.length, 0);
  }
});

test('all 13 Aerie regions use their actual coordinates, forecast fields, units and models', async () => {
  const regions = {
    yellowstone: [44.461, -110.829, true], alaska: [58.418, -134.565, true], canyon: [36.879, -111.510, true],
    swiss: [46.498, 7.727], winnipesaukee: [43.585, -71.330, true], surry: [43.006, -72.311, true],
    dixville: [44.867, -71.305, true], labrador: [50.747, -68.500], moosehead: [45.700, -69.730, true],
    yosemite: [37.723, -119.637, true], crater: [42.944, -122.109, true], lofoten: [67.932, 13.089], acadia: [44.321, -68.187, true]
  };
  assert.deepEqual(Object.keys(regions).sort(), [...allWorlds].sort());
  const api = fixture();
  for (const [region, [lat, lon, us]] of Object.entries(regions)) {
    const reply = await api.request(region);
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.jsonBody, example());
    const u = api.urls.at(-1), p = u.searchParams;
    assert.equal(u.origin + u.pathname, 'https://api.open-meteo.com/v1/forecast');
    assert.equal(p.get('latitude'), String(lat));
    assert.equal(p.get('longitude'), String(lon));
    assert.equal(p.get('models'), us ? 'gfs_seamless' : null);
    assert.equal(p.get('current'), 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m');
    assert.equal(p.get('hourly'), 'temperature_80m,temperature_120m,wind_speed_80m,wind_speed_120m');
    assert.equal(p.get('forecast_hours'), '1');
    assert.equal(p.get('wind_speed_unit'), 'ms');
    assert.equal(p.has('apikey'), false);
  }
  for (const unknown of ['', 'other', '__proto__', 'constructor', 'https://example.org', 'alaska&latitude=0']) {
    assert.equal((await api.request(unknown)).status, 400);
  }
  assert.equal(api.urls.length, 13);
});

test('live requires licensed service and misconfigured providers fail closed', async () => {
  for (const address of ['', 'https://api.open-meteo.com/v1/forecast', 'https://api.open-meteo.com./v1/forecast',
    'https://customer-api.open-meteo.com/v1/forecast', 'http://weather.example/v1/forecast', 'invalid',
    'https://owner:pass@weather.example/v1/forecast', 'https://weather.example/forecast?otherSecret=value', 'https://weather.example/#secret']) {
    const api = fixture({ AERIE_STRIPE_MODE: 'live', AERIE_OPEN_METEO_ENDPOINT: address });
    assert.equal((await api.request()).status, 204);
    assert.deepEqual(api.urls, []);
  }
});

test('only the official customer endpoint gets the key, no provider metadata or credentials reach the client or logs', async () => {
  for (const mode of ['live', 'test']) {
    for (const address of ['', 'https://customer-api.open-meteo.com/v1/forecast', 'https://weather.example/aerie/forecast']) {
      const upstream = example();
      upstream.endpoint = secret;
      upstream.current.note = secret;
      upstream.hourly.note = [secret];
      const api = fixture({ AERIE_STRIPE_MODE: mode, AERIE_OPEN_METEO_API_KEY: secret, AERIE_OPEN_METEO_ENDPOINT: address }, () => Response.json(upstream));
      assert.deepEqual((await api.request()).jsonBody, example());
      const url = api.urls[0], selfHosted = address.includes('weather.example');
      assert.equal(url.origin + url.pathname, address || 'https://customer-api.open-meteo.com/v1/forecast');
      assert.equal(url.searchParams.get('apikey'), selfHosted ? null : secret);
      assert.ok(!JSON.stringify(await api.request('', 'config')).includes(secret));
      assert.deepEqual(api.errors, []);
    }
  }
  const failed = fixture({ AERIE_OPEN_METEO_API_KEY: secret }, url => { throw new Error(url.href); });
  const reply = await failed.request();
  assert.equal(reply.status, 204);
  assert.ok(!JSON.stringify(reply).includes(secret));
  assert.deepEqual(failed.errors, []);
});

test('concurrent flights coalesce per region, refresh after 30 minutes, back off outages and stop serving stale air', async () => {
  let complete;
  const api = fixture({}, () => new Promise(resolve => { complete = resolve; }));
  const first = api.request(), second = api.request();
  assert.equal(api.urls.length, 1);
  complete(Response.json(example()));
  assert.deepEqual((await Promise.all([first, second])).map(r => r.status), [200, 200]);
  api.at(29);
  assert.equal((await api.request()).status, 200);
  assert.equal(api.urls.length, 1);
  api.at(30);
  const refresh = api.request();
  complete(new Response('outage', { status: 503 }));
  assert.equal((await refresh).status, 200);
  api.at(30.5);
  assert.equal((await api.request()).status, 200);
  assert.equal(api.urls.length, 2);
  api.at(119.5);
  const outage = api.request();
  complete(new Response('still down', { status: 429 }));
  assert.equal((await outage).status, 200);
  api.at(120);
  assert.equal((await api.request()).status, 204);
  assert.equal(api.urls.length, 3);
  api.at(121);
  const recovered = api.request(), next = example();
  next.current.time = '2026-11-23T11:00';
  next.current.temperature_2m = 13;
  complete(Response.json(next));
  assert.deepEqual((await recovered).jsonBody, next);
});

test('rejects oversized and malformed measurements, prevents a stale provider from renewing old readings', async () => {
  const cases = [
    () => Response.json(example(), { headers: { 'Content-Length': '20000' } }),
    () => new Response(' '.repeat(17 * 1024) + JSON.stringify(example())),
    () => new Response('{'), () => Response.json({ current: example().current, hourly: [] }),
    () => Response.json({ ...example(), current: { ...example().current, temperature_2m: null } }),
    () => Response.json({ ...example(), current: { ...example().current, relative_humidity_2m: 101 } }),
    () => Response.json({ ...example(), current: { ...example().current, time: [example().current.time] } }),
    () => Response.json({ ...example(), current: { ...example().current, time: '2026-11-23T10:00' } }),
    () => Response.json({ ...example(), hourly: { ...example().hourly, temperature_120m: [12, 12] } })
  ];
  for (const upstream of cases) {
    const api = fixture({}, upstream);
    assert.equal((await api.request()).status, 204);
    assert.equal((await api.request()).status, 204);
    assert.equal(api.urls.length, 1);
    assert.deepEqual(api.errors, []);
  }
  const old = fixture();
  old.at(119);
  assert.equal((await old.request()).status, 200);
  old.at(120);
  assert.equal((await old.request()).status, 204);
  const lower = example();
  delete lower.hourly.temperature_120m;
  assert.equal((await fixture({}, () => Response.json(lower)).request()).jsonBody.hourly.temperature_120m[0], null);
});
