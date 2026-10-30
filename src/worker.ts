import { handle } from '@astrojs/cloudflare/handler';
import { reconcile } from './lib/registration';
import { reconcileRefunds } from './lib/booking-operations';
import { deliverNotifications } from './lib/notifications';
import { audit } from './lib/data';
import { maintainSpark } from './lib/spark';
import { maintainMedia } from './lib/media';
import { queueDueReminders } from './lib/communications';
export default {
  fetch(...args: Parameters<typeof handle>) {
    return handle(...args);
  },
  async scheduled(
    _event: import('@cloudflare/workers-types').ScheduledController,
    env: Cloudflare.Env,
    ctx: import('@cloudflare/workers-types').ExecutionContext,
  ) {
    await reconcile(env);
    await reconcileRefunds(env);
    await deliverNotifications(env);
    await audit(env.DB, 'scheduled', 'scheduled.completed', env.ENVIRONMENT).run();
    // Critical payment/refund/outbox work completes first. Creative research has its own
    // bounded lease, status and failure path and cannot turn a payment run into a retry.
    ctx.waitUntil(
      maintainSpark(env).catch(async () => {
        await audit(env.DB, 'scheduled', 'idea.maintenance.failed', 'creative_spark', {
          source: 'scheduled',
          outcome: 'failed',
        }).run();
      }),
    );
    // Bounded, recoverable trash cleanup follows critical operational work.
    ctx.waitUntil(maintainMedia(env));
    ctx.waitUntil(
      queueDueReminders(env).catch(async () => {
        await audit(env.DB, 'scheduled', 'session.reminders.failed', 'communications', {
          source: 'scheduled',
          outcome: 'failed',
        }).run();
      }),
    );
  },
};
