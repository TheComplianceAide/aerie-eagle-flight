import { app } from '@azure/functions';
import { createCommerce } from './commerce.mjs';
import { configuration, configuredServices } from './settings.mjs';

const config = configuration();
const commerce = createCommerce(config, configuredServices(config));
if (commerce.purchaseMail.enabled) {
  app.timer('aerie-purchase-confirmations', {
    schedule: '0 */1 * * * *',
    handler: (_timer, context) => commerce.purchaseMail.deliver(context)
  });
}
for (const [name, [method]] of Object.entries(commerce.routes)) {
  app.http(`aerie-${name.replaceAll('/', '-')}`, {
    route: `aerie/${name}`,
    methods: [method, ...(name === 'stripe/webhook' ? [] : ['OPTIONS'])],
    authLevel: 'anonymous',
    handler: (request, context) => commerce.handle(name, request, context)
  });
}
