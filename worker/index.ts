import { NeighborhoodRoom } from './neighborhood-do';
import type { Env } from './neighborhood-do';

export { NeighborhoodRoom };

const DEFAULT_ROOM = 'gem-demo';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-room-name',
  'access-control-max-age': '86400',
};

function sanitizeRoomName(value: string | null): string {
  const cleaned = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
  return cleaned || DEFAULT_ROOM;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith('/api/');
    const isWebSocket = url.pathname === '/ws';

    if (isApi && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (isApi || isWebSocket) {
      const room = sanitizeRoomName(url.searchParams.get('room'));
      const id = env.NEIGHBORHOOD.idFromName(room);
      const stub = env.NEIGHBORHOOD.get(id);

      const headers = new Headers(request.headers);
      headers.set('x-room-name', room);
      const forwarded = new Request(request, { headers });
      const response = await stub.fetch(forwarded);

      return isApi ? withCors(response) : response;
    }

    // Vite's built SPA assets, including `/` and `/sites/:siteId`, are served
    // by the ASSETS binding with single-page-application fallback.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
