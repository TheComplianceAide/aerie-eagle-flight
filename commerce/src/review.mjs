import { createCommerce } from './commerce.mjs';
import { configuration, configuredServices } from './settings.mjs';

const config = configuration();
const services = configuredServices(config);
const [command, uid] = process.argv.slice(2);
if (!services.store) throw new Error('Set the commerce table URL and identity secret.');

if (command === 'list') {
  console.log('Pending public posts');
  for await (const claim of services.store.claims()) {
    if (claim.status === 'pending') console.log(JSON.stringify({ id: claim.uid, post: claim.postUrl }));
  }
} else if (command === 'approve' || command === 'reject') {
  await createCommerce(config, services).review(uid, command === 'approve' ? 'approved' : 'rejected');
  console.log('Review saved.');
} else {
  throw new Error('Use list, approve <id>, or reject <id>.');
}
