import { DurableObject } from 'cloudflare:workers';
import type {
  ActionPayload,
  HqSnapshot,
  PriorityLevel,
  PriorityMode,
  RoomState,
  ScenarioKey,
  SiteControlState,
  SiteId,
  SiteSnapshot,
  WsServerMessage,
} from '../src/engine';
import {
  N,
  SITES,
  SITE_BY_ID,
  applyAction,
  buildHqSnapshot,
  buildSiteSnapshot,
  createInitialRoomState,
  slotToTime,
} from '../src/engine';

export interface Env {
  NEIGHBORHOOD: DurableObjectNamespace<NeighborhoodRoom>;
  ASSETS: Fetcher;
}

const ROOM_STATE_KEY = 'roomState';
const DEFAULT_ROOM = 'gem-demo';
const SCENARIO_KEYS: ScenarioKey[] = ['sunny', 'cloudy', 'cold', 'occ80', 'unexpected'];
const PRIORITY_VALUES: PriorityLevel[] = ['Urgent', 'High', 'Normal', 'Low'];
const PRIORITY_MODES: PriorityMode[] = ['balanced', 'high', 'fair'];

function sanitizeRoomName(value: string | null | undefined): string {
  const cleaned = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
  return cleaned || DEFAULT_ROOM;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function isSiteId(value: string): value is SiteId {
  return Object.prototype.hasOwnProperty.call(SITE_BY_ID, value);
}

function hasSiteId(
  action: ActionPayload,
): action is Extract<ActionPayload, { siteId: SiteId }> {
  return 'siteId' in action;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalPriority(value: unknown): PriorityLevel | undefined {
  return PRIORITY_VALUES.includes(value as PriorityLevel) ? (value as PriorityLevel) : undefined;
}

function optionalPriorityMode(value: unknown): PriorityMode | undefined {
  return PRIORITY_MODES.includes(value as PriorityMode) ? (value as PriorityMode) : undefined;
}

function optionalScenario(value: unknown): ScenarioKey | undefined {
  return SCENARIO_KEYS.includes(value as ScenarioKey) ? (value as ScenarioKey) : undefined;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Backfills launcher-era fields onto a RoomState persisted by an older build,
 * so a stored room without `serverOnline` / per-site `online` flags or the
 * agentic-routing fields hydrates fully enabled instead of carrying `undefined`
 * into the snapshot layer.
 */
function migrateRoomState(stored: RoomState): RoomState {
  const sites = { ...stored.sites } as Record<SiteId, SiteControlState>;
  for (const site of SITES) {
    const control = sites[site.id];
    if (control) sites[site.id] = { ...control, online: control.online ?? true };
  }
  return {
    ...stored,
    serverOnline: stored.serverOnline ?? true,
    agenticRouting: stored.agenticRouting ?? true,
    notifications: Array.isArray(stored.notifications) ? stored.notifications : [],
    sites,
  };
}

function siteConvenienceAction(
  siteId: SiteId,
  operation: string,
  body: Record<string, unknown>,
  siteOnline: boolean,
): ActionPayload | null {
  switch (operation) {
    case 'optimize':
      return { type: 'SITE_OPTIMIZE', siteId };
    case 'reset':
      return { type: 'SITE_RESET', siteId };
    case 'approve':
      return { type: 'SITE_APPROVE', siteId };
    case 'reject':
      return { type: 'SITE_REJECT', siteId };
    case 'power':
      return {
        type: 'SITE_SET_ONLINE',
        siteId,
        enabled: optionalBoolean(body.enabled) ?? !siteOnline,
      };
    case 'constraints':
      return {
        type: 'SITE_CONSTRAINTS',
        siteId,
        minCharge: optionalNumber(body.minCharge),
        maxSiteKw: optionalNumber(body.maxSiteKw),
        priorityMode: optionalPriorityMode(body.priorityMode),
      };
    case 'overrides': {
      const vehicleId = optionalString(body.vehicleId);
      if (!vehicleId) return null;
      return {
        type: 'SITE_OVERRIDES',
        siteId,
        vehicleId,
        window: optionalString(body.window),
        energyKwh: optionalNumber(body.energyKwh),
        priority: optionalPriority(body.priority),
        note: optionalString(body.note),
      };
    }
    case 'urgent': {
      const vehicleId = optionalString(body.vehicleId);
      if (!vehicleId) return null;
      return {
        type: 'SITE_URGENT',
        siteId,
        vehicleId,
        urgent: optionalBoolean(body.urgent),
      };
    }
    case 'failsafe':
      return { type: 'SITE_FAILSAFE', siteId, enabled: optionalBoolean(body.enabled) };
    case 'toggle-ai':
      return { type: 'SITE_TOGGLE_AI', siteId, enabled: optionalBoolean(body.enabled) };
    default:
      return null;
  }
}

function hqConvenienceAction(
  operation: string,
  body: Record<string, unknown>,
  state: RoomState,
): ActionPayload | null {
  switch (operation) {
    case 'scenario': {
      const scenario = optionalScenario(body.scenario);
      return scenario ? { type: 'SET_SCENARIO', scenario } : null;
    }
    case 'clock':
      return {
        type: 'SET_CLOCK',
        slot: optionalNumber(body.slot),
        time: optionalString(body.time),
        playing: optionalBoolean(body.playing),
        speedMs: optionalNumber(body.speedMs),
      };
    case 'server':
      return {
        type: 'SET_SERVER_ONLINE',
        enabled: optionalBoolean(body.enabled) ?? !state.serverOnline,
      };
    case 'agentic':
      return {
        type: 'SET_AGENTIC_ROUTING',
        enabled: optionalBoolean(body.enabled) ?? !state.agenticRouting,
      };
    case 'agent-cycle': {
      const siteId = optionalString(body.siteId);
      if (siteId == null) return { type: 'RUN_AGENT_CYCLE' };
      if (!isSiteId(siteId)) return null;
      return { type: 'RUN_AGENT_CYCLE', siteId };
    }
    case 'optimize-all':
      return { type: 'OPTIMIZE_ALL' };
    case 'reset-all':
      return { type: 'RESET_ALL' };
    default:
      return null;
  }
}

/**
 * One Durable Object per room. The object owns the authoritative RoomState,
 * hibernatable WebSocket fan-out and the live simulation clock.
 */
export class NeighborhoodRoom extends DurableObject<Env> {
  private state: RoomState | null = null;
  private loading: Promise<RoomState> | null = null;
  private roomName = DEFAULT_ROOM;

  private async getState(): Promise<RoomState> {
    if (this.state) return this.state;
    if (!this.loading) {
      this.loading = (async () => {
        const stored = await this.ctx.storage.get<RoomState>(ROOM_STATE_KEY);
        const next = stored ? migrateRoomState(stored) : createInitialRoomState(this.roomName);
        if (!stored) await this.ctx.storage.put(ROOM_STATE_KEY, next);
        this.state = next;
        return next;
      })();
    }
    return this.loading;
  }

  private async persist(next: RoomState): Promise<void> {
    this.state = next;
    await this.ctx.storage.put(ROOM_STATE_KEY, next);
  }

  private async syncAlarm(state: RoomState): Promise<void> {
    if (state.serverOnline && state.clock.playing) {
      await this.ctx.storage.setAlarm(Date.now() + state.clock.speedMs);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  private safeSend(ws: WebSocket, payload: string): void {
    try {
      ws.send(payload);
    } catch {
      // The socket can close between the tag lookup and the send.
    }
  }

  private broadcast(state: RoomState): void {
    const hqMessage: WsServerMessage = {
      type: 'hq_state',
      data: buildHqSnapshot(state),
    };
    const hqPayload = JSON.stringify(hqMessage);
    for (const ws of this.ctx.getWebSockets('hq')) {
      this.safeSend(ws, hqPayload);
    }

    for (const site of SITES) {
      const sockets = this.ctx.getWebSockets(`site:${site.id}`);
      if (sockets.length === 0) continue;
      const message: WsServerMessage = {
        type: 'site_state',
        siteId: site.id,
        data: buildSiteSnapshot(state, site.id),
      };
      const payload = JSON.stringify(message);
      for (const ws of sockets) {
        this.safeSend(ws, payload);
      }
    }
  }

  private async commit(
    action: ActionPayload,
  ): Promise<{ hq: HqSnapshot; site?: SiteSnapshot }> {
    const current = await this.getState();
    const next = applyAction(current, action);
    if (next === current) {
      throw new Error(`Unsupported action: ${action.type}`);
    }

    await this.persist(next);
    if (action.type === 'SET_CLOCK' || action.type === 'SET_SERVER_ONLINE') {
      await this.syncAlarm(next);
    }
    this.broadcast(next);

    const hq = buildHqSnapshot(next);
    if (hasSiteId(action)) {
      return { hq, site: buildSiteSnapshot(next, action.siteId) };
    }
    return { hq };
  }

  private handleWebSocket(
    request: Request,
    state: RoomState,
    url: URL,
  ): Response {
    if ((request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') {
      return json({ ok: false, error: 'Expected a WebSocket upgrade request' }, 426);
    }

    const role = url.searchParams.get('role');
    if (role === 'hq') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, ['hq']);
      const message: WsServerMessage = {
        type: 'hq_state',
        data: buildHqSnapshot(state),
      };
      server.send(JSON.stringify(message));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (role === 'site') {
      const siteId = url.searchParams.get('id') ?? '';
      if (!isSiteId(siteId)) {
        return json({ ok: false, error: `Unknown site: ${siteId || '(missing id)'}` }, 400);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [`site:${siteId}`]);
      const message: WsServerMessage = {
        type: 'site_state',
        siteId,
        data: buildSiteSnapshot(state, siteId),
      };
      server.send(JSON.stringify(message));
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ ok: false, error: 'role must be "hq" or "site"' }, 400);
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const requestedRoom = request.headers.get('x-room-name') ?? url.searchParams.get('room');
      if (requestedRoom) this.roomName = sanitizeRoomName(requestedRoom);

      const state = await this.getState();

      if (url.pathname === '/ws') {
        return this.handleWebSocket(request, state, url);
      }

      if (url.pathname === '/api/hq/state' && request.method === 'GET') {
        return json(buildHqSnapshot(state));
      }

      if (url.pathname === '/api/action') {
        if (request.method !== 'POST') {
          return json({ ok: false, error: 'Use POST' }, 405);
        }
        const body = await readJson(request);
        if (!body) return json({ ok: false, error: 'Invalid JSON body' }, 400);
        const action = body.action as ActionPayload | undefined;
        if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
          return json({ ok: false, error: 'Expected { action: ActionPayload }' }, 400);
        }
        try {
          const result = await this.commit(action);
          return json({ ok: true, ...result });
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Action failed' },
            400,
          );
        }
      }

      const hqMatch = url.pathname.match(
        /^\/api\/hq\/(scenario|clock|server|agentic|agent-cycle|optimize-all|reset-all)$/,
      );
      if (hqMatch) {
        if (request.method !== 'POST') {
          return json({ ok: false, error: 'Use POST' }, 405);
        }
        const body = await readJson(request);
        if (!body) return json({ ok: false, error: 'Invalid JSON body' }, 400);
        if (hqMatch[1] === 'agent-cycle') {
          const siteId = optionalString(body.siteId);
          if (siteId != null && !isSiteId(siteId)) {
            return json({ ok: false, error: `Unknown site: ${siteId}` }, 400);
          }
        }
        const action = hqConvenienceAction(hqMatch[1], body, state);
        if (!action) {
          return json({ ok: false, error: `Unsupported operation: ${hqMatch[1]}` }, 400);
        }
        try {
          const result = await this.commit(action);
          return json({ ok: true, ...result });
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Action failed' },
            400,
          );
        }
      }

      const siteMatch = url.pathname.match(
        /^\/api\/site\/([^/]+)\/(state|optimize|reset|approve|reject|constraints|overrides|urgent|failsafe|toggle-ai|power)$/,
      );
      if (siteMatch) {
        const siteId = decodeURIComponent(siteMatch[1]);
        const operation = siteMatch[2];
        if (!isSiteId(siteId)) {
          return json({ ok: false, error: `Unknown site: ${siteId}` }, 404);
        }
        if (operation === 'state') {
          if (request.method !== 'GET') {
            return json({ ok: false, error: 'Use GET' }, 405);
          }
          return json(buildSiteSnapshot(state, siteId));
        }
        if (request.method !== 'POST') {
          return json({ ok: false, error: 'Use POST' }, 405);
        }
        const body = await readJson(request);
        if (!body) return json({ ok: false, error: 'Invalid JSON body' }, 400);
        const action = siteConvenienceAction(
          siteId,
          operation,
          body,
          state.sites[siteId].online,
        );
        if (!action) {
          return json({ ok: false, error: `Unsupported operation: ${operation}` }, 400);
        }
        try {
          const result = await this.commit(action);
          return json({ ok: true, ...result });
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Action failed' },
            400,
          );
        }
      }

      const notificationMatch = url.pathname.match(
        /^\/api\/site\/([^/]+)\/notifications\/([^/]+)\/ack$/,
      );
      if (notificationMatch) {
        const siteId = decodeURIComponent(notificationMatch[1]);
        if (!isSiteId(siteId)) {
          return json({ ok: false, error: `Unknown site: ${siteId}` }, 404);
        }
        if (request.method !== 'POST') {
          return json({ ok: false, error: 'Use POST' }, 405);
        }
        const action: ActionPayload = {
          type: 'ACK_NOTIFICATION',
          siteId,
          notificationId: decodeURIComponent(notificationMatch[2]),
        };
        try {
          const result = await this.commit(action);
          return json({ ok: true, ...result });
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Action failed' },
            400,
          );
        }
      }

      return json({ ok: false, error: 'Not found' }, 404);
    } catch (error) {
      console.error('NeighborhoodRoom fetch failed', error);
      return json({ ok: false, error: 'Internal error' }, 500);
    }
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== 'string') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    const action = (parsed as { action?: ActionPayload } | null)?.action;
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
      return;
    }

    try {
      await this.commit(action);
    } catch (error) {
      this.safeSend(
        ws,
        JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Action failed',
        }),
      );
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed by the peer.
    }
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    console.error('NeighborhoodRoom WebSocket error', error);
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // Already closed by the peer.
    }
  }

  async alarm(): Promise<void> {
    const state = await this.getState();
    if (!state.serverOnline || !state.clock.playing) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const slot = (state.clock.slot + 1) % N;
    const next: RoomState = {
      ...state,
      clock: { ...state.clock, slot, time: slotToTime(slot) },
    };
    await this.persist(next);
    this.broadcast(next);

    if (next.serverOnline && next.clock.playing) {
      await this.ctx.storage.setAlarm(Date.now() + next.clock.speedMs);
    }
  }
}
