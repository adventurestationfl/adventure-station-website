import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { authenticate } from './lib/auth';
import { errorResponse, HttpError } from './lib/http';
export const onRequest = defineMiddleware(async (context, next) => {
  let response;
  try {
    if (context.url.pathname.startsWith('/admin'))
      context.locals.staff = await authenticate(context.request, env);
    response = await next();
  } catch (error) {
    if (context.url.pathname.startsWith('/admin'))
      response = new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Staff sign-in | Adventure Station</title><body style="font:18px system-ui;max-width:600px;margin:12vh auto;padding:24px"><h1>Staff sign-in</h1><p>${error instanceof HttpError ? error.message : 'Sign-in is temporarily unavailable.'}</p><p><a href="/">Back to Adventure Station</a></p></body></html>`,
        {
          status: error instanceof HttpError ? error.status : 503,
          headers: { 'Content-Type': 'text/html' },
        },
      );
    else response = errorResponse(error);
  }
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(),microphone=(),geolocation=()');
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  );
  if (context.url.protocol === 'https:')
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (
    context.url.pathname.startsWith('/api') ||
    context.url.pathname.startsWith('/admin') ||
    context.url.pathname.startsWith('/registration')
  )
    headers.set('Cache-Control', 'no-store');
  if (
    env.ENVIRONMENT !== 'production' ||
    context.url.pathname.startsWith('/admin') ||
    context.url.pathname.startsWith('/registration')
  )
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
