import { handle } from '@astrojs/cloudflare/handler';
import { reconcile } from './lib/registration';
import { reconcileRefunds } from './lib/booking-operations';
import { deliverNotifications } from './lib/notifications';
export default {
  fetch(...args: Parameters<typeof handle>) {
    return handle(...args);
  },
  async scheduled(
    _event: import('@cloudflare/workers-types').ScheduledController,
    env: Cloudflare.Env,
  ) {
    await reconcile(env);
    await reconcileRefunds(env);
    await deliverNotifications(env);
  },
};
