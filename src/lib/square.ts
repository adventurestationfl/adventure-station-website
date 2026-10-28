import { HttpError } from './http';
export type SquarePayment = {
  id: string;
  order_id?: string;
  location_id?: string;
  status: string;
  amount_money: { amount: number; currency: string };
  refunded_money?: { amount: number; currency: string };
  created_at: string;
};
type SquareOrder = {
  id: string;
  reference_id?: string;
  location_id: string;
  total_money?: { amount: number; currency: string };
  tenders?: { payment_id?: string }[];
};
export function paymentConfigured(env: Cloudflare.Env) {
  return (
    env.SQUARE_ENVIRONMENT === 'sandbox' &&
    !!env.SQUARE_ACCESS_TOKEN &&
    !!env.SQUARE_LOCATION_ID &&
    !!env.SQUARE_WEBHOOK_SIGNATURE_KEY &&
    !!env.SQUARE_WEBHOOK_URL &&
    !!env.ABUSE_SALT
  );
}
export async function square<T>(
  env: Cloudflare.Env,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  // This development integration cannot initiate live transactions, even if misconfigured.
  if (env.SQUARE_ENVIRONMENT !== 'sandbox' || !env.SQUARE_ACCESS_TOKEN)
    throw new HttpError(
      503,
      'Online registration is not open yet. Please contact Adventure Station.',
    );
  const response = await fetch(`https://connect.squareupsandbox.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      'Square-Version': '2026-09-16',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new HttpError(
      502,
      'The payment service could not respond. Your payment is not confirmed. Please try again.',
    );
  return response.json() as Promise<T>;
}
export async function createCheckout(
  env: Cloudflare.Env,
  r: { id: string; total: number; seats: number; workshop_name: string },
) {
  const data = await square<{ payment_link: { id: string; order_id: string; url: string } }>(
    env,
    '/online-checkout/payment-links',
    'POST',
    {
      idempotency_key: `checkout-${r.id}`,
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        reference_id: r.id,
        line_items: [
          {
            name: r.workshop_name,
            quantity: String(r.seats),
            base_price_money: { amount: r.total / r.seats, currency: 'USD' },
          },
        ],
      },
      checkout_options: {
        allow_tipping: false,
        ask_for_shipping_address: false,
        redirect_url: `${env.PUBLIC_ORIGIN}/registration/${r.id}`,
      },
    },
  );
  const p = data.payment_link;
  if (!p?.id || !p.order_id || !p.url || new URL(p.url).hostname !== 'sandbox.square.link')
    throw new HttpError(502, 'The checkout response could not be verified. Please try again.');
  return p;
}
export const getPayment = async (env: Cloudflare.Env, id: string) =>
  (await square<{ payment: SquarePayment }>(env, `/payments/${encodeURIComponent(id)}`)).payment;
export const getOrder = async (env: Cloudflare.Env, id: string) =>
  (await square<{ order: SquareOrder }>(env, `/orders/${encodeURIComponent(id)}`)).order;
export async function verifySignature(
  raw: string,
  signature: string | null,
  key: string,
  url: string,
) {
  if (!signature || !key || !url) return false;
  try {
    const bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const secret = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify('HMAC', secret, bytes, new TextEncoder().encode(url + raw));
  } catch {
    return false;
  }
}
