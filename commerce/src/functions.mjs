import { app } from '@azure/functions';
import manifest from '../package.json' with { type: 'json' };
import { createCommerce } from './commerce.mjs';
import { configuration, configuredServices } from './settings.mjs';

const config = { ...configuration(), releaseRevision: manifest.aerieReleaseRevision };
const commerce = createCommerce(config, configuredServices(config));
if (commerce.purchaseMail.enabled) {
  app.timer('aerie-purchase-confirmations', {
    schedule: '0 */1 * * * *',
    handler: (_timer, context) => commerce.purchaseMail.deliver(context)
  });
}
app.timer('aerie-traffic-retention', {
  schedule: '0 23 2 * * *',
  handler: async (_timer, context) => {
    try {
      await commerce.traffic.retain();
    } catch {
      context.error('Aerie traffic retention failed.');
    }
  }
});
for (const [name, [method]] of Object.entries(commerce.routes)) {
  app.http(`aerie-${name.replaceAll('/', '-')}`, {
    route: `aerie/${name}`,
    methods: [method, ...(name === 'stripe/webhook' ? [] : ['OPTIONS'])],
    authLevel: 'anonymous',
    handler: (request, context) => commerce.handle(name, request, context)
  });
}
