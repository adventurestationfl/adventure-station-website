import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { tokenEndpoint } from '../../lib/mcp';
import { HttpError, json } from '../../lib/http';
export const ALL: APIRoute = async ({ request }) => {
  try {
    return await tokenEndpoint(request, env);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    return json(
      {
        error:
          status === 503
            ? 'temporarily_unavailable'
            : status === 429
              ? 'temporarily_unavailable'
              : 'invalid_grant',
        error_description:
          'The authorization exchange could not be completed. Restart the connection.',
      },
      status,
    );
  }
};
