import { handle } from '@astrojs/cloudflare/handler';
import { reconcile } from './lib/registration';
export default {
  fetch(...args: Parameters<typeof handle>) {
    return handle(...args);
  },
  async scheduled(
    _event: import('@cloudflare/workers-types').ScheduledController,
    env: Cloudflare.Env,
  ) {
    await reconcile(env);
  },
};
