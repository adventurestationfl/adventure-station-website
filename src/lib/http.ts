import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
export async function readBody(request: Request | Response, limit = 65536): Promise<string> {
  if (Number(request.headers.get('Content-Length')) > limit)
    throw new HttpError(413, 'This file or form is too large.');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, 'This file or form is too large.');
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function bodyJson(request: Request) {
  try {
    return JSON.parse(await readBody(request));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'Please send a valid form.');
  }
}
export function requireOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new HttpError(403, 'Refresh the page before trying again.');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new HttpError(403, 'Request not allowed.');
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json({ error: error.issues.map((i) => i.message).join(' ') }, 400);
  const message = error instanceof Error ? error.message : '';
  if (/CAPACITY|SESSION_UNAVAILABLE/.test(message))
    return json(
      {
        error: 'These places are no longer available. Refresh and choose another date or quantity.',
      },
      409,
    );
  if (/HISTORICAL|BOOKED_SESSION/.test(message))
    return json(
      {
        error:
          'This date has registrations. Preserve its details; cancel it and create a new date if needed.',
      },
      409,
    );
  if (/UNIQUE/.test(message))
    return json({ error: 'This record already exists. Refresh before trying again.' }, 409);
  if (/NOT NULL constraint failed: workshops.name/.test(message))
    return json({ error: 'This workshop has changed. Reload before saving.' }, 409);
  if (/NOT NULL constraint failed: settings.value/.test(message))
    return json({ error: 'This page has changed. Reload before saving.' }, 409);
  if (/FOREIGN KEY/.test(message))
    return json(
      {
        error:
          'A referenced record changed or is still in use. Reload and choose an available record.',
      },
      409,
    );
  return json(
    {
      error:
        'We could not complete this request. Please try again. No confirmation has been issued.',
    },
    500,
  );
}
export const now = () => Math.floor(Date.now() / 1000);
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export function localOnly(request: Request, env: Cloudflare.Env) {
  return (
    env.ENVIRONMENT === 'local' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
  );
}
