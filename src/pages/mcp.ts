import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { mcpHttp } from '../lib/mcp';
export const ALL: APIRoute = ({ request }) => mcpHttp(request, env);
