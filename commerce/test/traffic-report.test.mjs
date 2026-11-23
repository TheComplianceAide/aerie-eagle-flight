import assert from 'node:assert/strict';
import test from 'node:test';
import { reportWindow, summarizeTraffic } from '../tools/traffic-report.mjs';

test('traffic report deduplicates browsers and midnight visits, excludes QA, and uses the landing funnel', async () => {
  const rows = [
    { partitionKey: '2026-11-24', rowKey: 'visit-A', visitorId: 'browser-1', source: 'x', flew: true, flightFromLanding: true },
    { partitionKey: '2026-11-23', rowKey: 'visit-A', visitorId: 'browser-1', source: 'x', landed: true },
    { partitionKey: '2026-11-24', rowKey: 'visit-B', visitorId: 'browser-1', source: 'google', landed: true, checkout: true, checkoutFromLanding: true },
    { partitionKey: '2026-11-24', rowKey: 'visit-C', visitorId: 'browser-2', source: 'direct', landed: true, flew: true },
    { partitionKey: '2026-11-24', rowKey: 'visit-D', visitorId: 'browser-3', source: 'reddit', flew: true },
    { partitionKey: '2026-11-24', rowKey: 'visit-QA', visitorId: 'test-browser', source: 'qa', landed: true, flew: true, flightFromLanding: true }
  ];
  const report = await summarizeTraffic(rows);
  assert.equal(report.total.uniqueBrowsers, 3);
  assert.equal(report.total.visits, 4);
  assert.equal(report.total.landingBrowsers, 2);
  assert.equal(report.total.landingVisits, 3);
  assert.equal(report.total.flightVisits, 3);
  assert.equal(report.total.landingToFlight, 1);
  assert.equal(report.total.landingToCheckout, 1);
  assert.equal(report.total.landingToCheckoutPercent, 100 / 3);
  assert.equal(report.sources.find(x => x.source === 'x').landingToFlight, 1);
  assert.equal(report.sources.find(x => x.source === 'direct').landingToFlight, 0);
  assert.equal(report.sources.find(x => x.source === 'qa'), undefined);
});

test('a traffic report uses seven UTC dates by default and validates explicit ranges', () => {
  const now = new Date('2026-11-23T03:02:01Z');
  assert.deepEqual(reportWindow({}, now), { from: '2026-11-17', through: '2026-11-23' });
  assert.deepEqual(reportWindow({ from: '2026-11-12', through: '2026-11-13' }, now),
    { from: '2026-11-12', through: '2026-11-13' });
  assert.throws(() => reportWindow({ from: '2026-02-30' }, now), /valid UTC date/);
  assert.throws(() => reportWindow({ from: '2026-08-15' }, now), /1 to 90 days/);
});
