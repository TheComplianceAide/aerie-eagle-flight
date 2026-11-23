import { TableClient } from '@azure/data-tables';
import { AzureCliCredential } from '@azure/identity';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const dayMilliseconds = 86_400_000;
const flags = ['landed', 'flew', 'checkout', 'flightFromLanding', 'checkoutFromLanding'];

function newCounts() {
  return { uniqueBrowsers: new Set(), landingBrowsers: new Set(), flightFromLandingBrowsers: new Set(),
    checkoutFromLandingBrowsers: new Set(), visits: 0, landingVisits: 0, flightVisits: 0,
    checkoutVisits: 0, landingToFlight: 0, landingToCheckout: 0 };
}

function countVisit(counts, visit) {
  counts.uniqueBrowsers.add(visit.visitorId);
  counts.visits++;
  if (visit.flew) counts.flightVisits++;
  if (visit.checkout) counts.checkoutVisits++;
  if (!visit.landed) return;
  counts.landingBrowsers.add(visit.visitorId);
  counts.landingVisits++;
  if (visit.flew && visit.flightFromLanding) {
    counts.landingToFlight++;
    counts.flightFromLandingBrowsers.add(visit.visitorId);
  }
  if (visit.checkout && visit.checkoutFromLanding) {
    counts.landingToCheckout++;
    counts.checkoutFromLandingBrowsers.add(visit.visitorId);
  }
}

function describe(counts) {
  const result = Object.fromEntries(Object.entries(counts).map(([name, value]) =>
    [name, value instanceof Set ? value.size : value]));
  result.landingToFlightPercent = counts.landingVisits ? 100 * counts.landingToFlight / counts.landingVisits : null;
  result.landingToCheckoutPercent = counts.landingVisits ? 100 * counts.landingToCheckout / counts.landingVisits : null;
  return result;
}

export async function summarizeTraffic(entities) {
  const visits = new Map();
  for await (const entity of entities) {
    if (entity.source === 'qa' || !entity.visitorId || !entity.rowKey) continue;
    let visit = visits.get(entity.rowKey);
    if (!visit) {
      visit = { source: entity.source || 'direct', visitorId: entity.visitorId, day: entity.partitionKey };
      visits.set(entity.rowKey, visit);
    } else if (entity.partitionKey < visit.day) {
      visit.day = entity.partitionKey;
      visit.source = entity.source || 'direct';
    }
    for (const flag of flags) if (entity[flag] === true) visit[flag] = true;
  }

  const total = newCounts();
  const sources = new Map();
  for (const visit of visits.values()) {
    if (!sources.has(visit.source)) sources.set(visit.source, newCounts());
    countVisit(total, visit);
    countVisit(sources.get(visit.source), visit);
  }
  return {
    total: describe(total),
    sources: [...sources].map(([source, counts]) => ({ source, ...describe(counts) }))
      .sort((a, b) => b.visits - a.visits || a.source.localeCompare(b.source))
  };
}

function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use YYYY-MM-DD for UTC dates.');
  const at = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(+at) || at.toISOString().slice(0, 10) !== value) throw new Error('Use a valid UTC date.');
  return at;
}

export function reportWindow(options, now = new Date()) {
  const through = options.through || now.toISOString().slice(0, 10);
  const end = parseDay(through);
  const from = options.from || new Date(+end - 6 * dayMilliseconds).toISOString().slice(0, 10);
  const span = (+end - +parseDay(from)) / dayMilliseconds;
  if (span < 0 || span >= 90) throw new Error('Select an inclusive UTC range of 1 to 90 days.');
  return { from, through };
}

async function main() {
  const { values } = parseArgs({ options: {
    from: { type: 'string' }, through: { type: 'string' }, json: { type: 'boolean' }
  } });
  const window = reportWindow(values);
  const table = new TableClient('https://stplayaerieprod01.table.core.windows.net', 'AerieTraffic', new AzureCliCredential());
  const entries = table.listEntities({ queryOptions: {
    filter: `PartitionKey ge '${window.from}' and PartitionKey le '${window.through}'`,
    select: ['PartitionKey', 'RowKey', 'visitorId', 'source', ...flags]
  } });
  const summary = { ...window, ...await summarizeTraffic(entries) };
  if (values.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`Aerie traffic · ${window.from} to ${window.through} UTC · opted-in browsers`);
  console.table([{ source: 'All sources', ...summary.total }, ...summary.sources].map(row => ({
    Source: row.source === 'direct' ? 'direct or unknown' : row.source,
    Browsers: row.uniqueBrowsers, Visits: row.visits, Landed: row.landingVisits,
    'Flight started': row.flightVisits, 'Checkout handoff': row.checkoutVisits,
    'Landing → flight': row.landingToFlight, 'Landing → checkout': row.landingToCheckout
  })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.statusCode === 403 ? 'Azure requires read access to the AerieTraffic table for this account.' :
      (error instanceof Error && error.name === 'Error' ? error.message : 'Could not read the private Aerie traffic report.'));
    process.exitCode = 1;
  });
}
