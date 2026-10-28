import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  bodyJson,
  errorResponse,
  HttpError,
  json,
  readBody,
  requireOrigin,
  sha256,
} from '../../lib/http';
import { authenticate } from '../../lib/auth';
import { adminApi } from '../../lib/admin';
import { mediaApi } from '../../lib/media';
import { register, rateLimit, applyPayment } from '../../lib/registration';
import { getPayment, square, verifySignature } from '../../lib/square';
export const ALL: APIRoute = async ({ request, params }) => {
  try {
    const path = params.path ?? '';
    if (path === 'square/webhook' && request.method === 'POST') {
      const raw = await readBody(request, 262144);
      if (
        !(await verifySignature(
          raw,
          request.headers.get('x-square-hmacsha256-signature'),
          env.SQUARE_WEBHOOK_SIGNATURE_KEY,
          env.SQUARE_WEBHOOK_URL,
        ))
      )
        throw new HttpError(401, 'Invalid webhook signature.');
      const event = JSON.parse(raw);
      if (typeof event.event_id !== 'string' || event.event_id.length > 100)
        throw new HttpError(400, 'Invalid event.');
      if (
        ['payment.created', 'payment.updated'].includes(event.type) &&
        typeof event.data?.id === 'string'
      )
        await applyPayment(env, await getPayment(env, event.data.id), event.event_id);
      if (
        ['refund.created', 'refund.updated'].includes(event.type) &&
        typeof event.data?.id === 'string'
      ) {
        const data = await square<{ refund: { payment_id: string } }>(
          env,
          `/refunds/${encodeURIComponent(event.data.id)}`,
        );
        await applyPayment(env, await getPayment(env, data.refund.payment_id), event.event_id);
      }
      return json({ received: true });
    }
    if (path === 'registrations' && request.method === 'POST') {
      requireOrigin(request);
      await rateLimit(request, env);
      const result = await register(
        env,
        await bodyJson(request),
        request.headers.get('idempotency-key') ?? '',
      );
      const { token, ...safe } = result;
      const response = json(safe, 201);
      response.headers.set(
        'Set-Cookie',
        `receipt_${result.id}=${token}; HttpOnly; SameSite=Lax; Path=/api/receipts/${result.id}; Max-Age=604800${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
      );
      return response;
    }
    const receipt = /^receipts\/([\w-]+)$/.exec(path);
    if (receipt && request.method === 'GET') {
      const key = receipt[1]!,
        cookies = request.headers.get('cookie') ?? '',
        token = cookies
          .split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith(`receipt_${key}=`))
          ?.split('=')[1];
      if (!token)
        throw new HttpError(
          404,
          'This confirmation is only available in the browser used to register. Contact Adventure Station with your payment reference.',
        );
      const r = await env.DB.prepare(
        'SELECT status,hold_until,receipt_hash,workshop_name,seats,starts_at,timezone,total,needs_attention FROM registrations WHERE id=? AND receipt_hash=?',
      )
        .bind(key, await sha256(token))
        .first<Record<string, unknown>>();
      if (!r) throw new HttpError(404, 'Confirmation not found.');
      const { receipt_hash, ...safe } = r;
      return json(safe);
    }
    if (path.startsWith('admin/')) {
      if (!['GET', 'HEAD'].includes(request.method)) requireOrigin(request);
      const staff = await authenticate(request, env),
        action = path.slice(6);
      if (action.startsWith('media')) return await mediaApi(request, env, staff, action);
      return await adminApi(request, env, staff, action);
    }
    throw new HttpError(404, 'This request was not found.');
  } catch (error) {
    return errorResponse(error);
  }
};
