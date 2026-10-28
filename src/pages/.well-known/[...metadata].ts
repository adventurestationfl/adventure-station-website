import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { authorizationMetadata } from '../../lib/mcp';
import { errorResponse, json } from '../../lib/http';
export const GET: APIRoute = ({ params }) => {
  try {
    if (
      ![
        'oauth-authorization-server',
        'oauth-protected-resource',
        'oauth-protected-resource/mcp',
      ].includes(params.metadata ?? '')
    )
      return new Response('Not found', { status: 404 });
    return json(authorizationMetadata(env, params.metadata !== 'oauth-authorization-server'));
  } catch (error) {
    return errorResponse(error);
  }
};
