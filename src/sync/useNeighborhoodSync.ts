import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  N,
  SITES,
  applyAction,
  buildHqSnapshot,
  buildSiteSnapshot,
  createInitialRoomState,
} from '../engine';
import type {
  ActionPayload,
  HqSnapshot,
  RoomState,
  SiteControlState,
  SiteId,
  SiteSnapshot,
} from '../engine';

const DEFAULT_ROOM = 'gem-demo';
const STORAGE_PREFIX = 'grid-sense:room:';
const CHANNEL_PREFIX = 'grid-sense:';

export type SyncMode = 'ws' | 'offline';

export interface NeighborhoodSync<T> {
  data: T;
  connected: boolean;
  mode: SyncMode;
  dispatch: (action: ActionPayload) => Promise<void>;
}

function sanitizeRoom(value: string | null | undefined): string {
  const cleaned = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
  return cleaned || DEFAULT_ROOM;
}

/** Reads the sanitized `?room=` query parameter, defaulting to `gem-demo`. */
export function useRoomName(): string {
  return useMemo(() => {
    if (typeof window === 'undefined') return DEFAULT_ROOM;
    return sanitizeRoom(new URLSearchParams(window.location.search).get('room'));
  }, []);
}

function storageKey(room: string): string {
  return `${STORAGE_PREFIX}${room}`;
}

function isRoomState(value: unknown): value is RoomState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RoomState>;
  if (typeof candidate.room !== 'string') return false;
  if (typeof candidate.scenario !== 'string') return false;
  if (!candidate.clock || typeof candidate.clock.slot !== 'number') return false;
  if (!candidate.sites || typeof candidate.sites !== 'object') return false;
  if (!Array.isArray(candidate.auditLog)) return false;
  if (typeof candidate.auditSeq !== 'number') return false;

  return SITES.every((site) => {
    const control = (candidate.sites as Record<string, unknown>)[site.id];
    return (
      !!control &&
      typeof control === 'object' &&
      typeof (control as { aiEnabled?: unknown }).aiEnabled === 'boolean'
    );
  });
}

/**
 * Validates a parsed room and backfills launcher-era defaults, so a snapshot
 * persisted by an older build hydrates fully energized instead of carrying
 * `undefined` flags into the deterministic fallback.
 */
function normalizeRoomState(value: unknown): RoomState | null {
  if (!isRoomState(value)) return null;
  const sites = { ...value.sites } as Record<SiteId, SiteControlState>;
  for (const site of SITES) {
    const control = sites[site.id];
    sites[site.id] = {
      ...control,
      online: control.online ?? true,
      sellToGrid: control.sellToGrid ?? false,
    };
  }
  return {
    ...value,
    serverOnline: value.serverOnline ?? true,
    agenticRouting: value.agenticRouting ?? true,
    notifications: Array.isArray(value.notifications) ? value.notifications : [],
    sites,
  };
}

function readStoredRoom(room: string): RoomState {
  if (typeof window === 'undefined') return createInitialRoomState(room);
  try {
    const raw = window.localStorage.getItem(storageKey(room));
    if (raw) {
      const parsed = normalizeRoomState(JSON.parse(raw) as unknown);
      if (parsed && parsed.room === room) return parsed;
    }
  } catch {
    // Corrupt storage should never block the deterministic fallback.
  }

  const initial = createInitialRoomState(room);
  try {
    window.localStorage.setItem(storageKey(room), JSON.stringify(initial));
  } catch {
    // Private-mode storage can throw; the in-memory state still works.
  }
  return initial;
}

function writeStoredRoom(room: string, state: RoomState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(room), JSON.stringify(state));
  } catch {
    // Ignore quota/private-mode errors.
  }
}

function useNeighborhoodChannel<T>(
  room: string,
  role: 'hq' | 'site',
  siteId: SiteId | null,
  select: (state: RoomState) => T,
): NeighborhoodSync<T> {
  const [localState, setLocalState] = useState<RoomState>(() => readStoredRoom(room));
  const localRef = useRef(localState);
  localRef.current = localState;

  const [serverData, setServerData] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const [degraded, setDegraded] = useState(false);

  const onlineRef = useRef(false);
  onlineRef.current = connected;
  const channelRef = useRef<BroadcastChannel | null>(null);

  const persist = useCallback(
    (next: RoomState) => {
      writeStoredRoom(room, next);
      channelRef.current?.postMessage({ type: 'room_state', state: next });
    },
    [room],
  );

  const commitLocal = useCallback(
    (action: ActionPayload): RoomState => {
      const current = localRef.current;
      const next = applyAction(current, action);
      if (next === current) return current;
      localRef.current = next;
      setLocalState(next);
      persist(next);
      return next;
    },
    [persist],
  );

  // Rehydrate synchronously whenever the room changes.
  useEffect(() => {
    const next = readStoredRoom(room);
    localRef.current = next;
    setLocalState(next);
    setServerData(null);
    setConnected(false);
    setDegraded(false);
  }, [room]);

  // Cross-tab synchronization: BroadcastChannel first, storage events as a
  // fallback for browsers that cannot construct a channel.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(`${CHANNEL_PREFIX}${room}`);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent) => {
        const payload = event.data as { type?: string; state?: unknown } | null;
        if (!payload || payload.type !== 'room_state') return;
        const incoming = normalizeRoomState(payload.state);
        if (!incoming || incoming.room !== room || incoming.auditSeq <= localRef.current.auditSeq) {
          return;
        }
        localRef.current = incoming;
        setLocalState(incoming);
        writeStoredRoom(room, incoming);
      };
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey(room) || !event.newValue) return;
      try {
        const parsed = normalizeRoomState(JSON.parse(event.newValue) as unknown);
        if (!parsed || parsed.room !== room) return;
        if (parsed.auditSeq <= localRef.current.auditSeq) return;
        localRef.current = parsed;
        setLocalState(parsed);
      } catch {
        // Ignore malformed cross-tab payloads.
      }
    };

    window.addEventListener('storage', onStorage);
    return () => {
      channel?.close();
      if (channelRef.current === channel) channelRef.current = null;
      window.removeEventListener('storage', onStorage);
    };
  }, [room]);

  // Live WebSocket stream with capped exponential-backoff reconnects.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function scheduleRetry(): void {
      if (disposed) return;
      const delay = Math.min(4000, 300 * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    }

    function connect(): void {
      if (disposed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({ role, room });
      if (role === 'site' && siteId) params.set('id', siteId);

      let ws: WebSocket;
      try {
        ws = new WebSocket(`${protocol}//${window.location.host}/ws?${params.toString()}`);
      } catch {
        scheduleRetry();
        return;
      }
      socket = ws;

      ws.onopen = () => {
        if (disposed) return;
        attempt = 0;
        setConnected(true);
        setDegraded(false);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (disposed) return;
        let message: unknown;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!message || typeof message !== 'object') return;

        const msg = message as { type?: string; data?: T; siteId?: SiteId };
        if (role === 'hq' && msg.type === 'hq_state' && msg.data) {
          setServerData(msg.data);
          setConnected(true);
          setDegraded(false);
        } else if (
          role === 'site' &&
          msg.type === 'site_state' &&
          msg.siteId === siteId &&
          msg.data
        ) {
          setServerData(msg.data);
          setConnected(true);
          setDegraded(false);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setServerData(null);
        scheduleRetry();
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // Already closed by the peer.
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [room, role, siteId]);

  const offline = !connected || degraded;

  // Completely offline clock playback. When the DO is reachable its alarm owns
  // the clock, so the interval only runs against the local fallback. A backend
  // server in standby pauses the clock exactly like the DO alarm does.
  useEffect(() => {
    if (
      !offline ||
      !localState.serverOnline ||
      !localState.clock.playing ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const delay = Math.max(300, localState.clock.speedMs);
    const timer = window.setInterval(() => {
      const current = localRef.current;
      if (!current.clock.playing) return;
      commitLocal({
        type: 'SET_CLOCK',
        slot: (current.clock.slot + 1) % N,
        playing: true,
        speedMs: current.clock.speedMs,
      });
    }, delay);

    return () => window.clearInterval(timer);
  }, [offline, localState.serverOnline, localState.clock.playing, localState.clock.speedMs, commitLocal]);

  const dispatch = useCallback(
    async (action: ActionPayload): Promise<void> => {
      commitLocal(action);

      if (!onlineRef.current) return;

      try {
        const response = await fetch(`/api/action?room=${encodeURIComponent(room)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (!response.ok) throw new Error(`Action failed with HTTP ${response.status}`);

        const payload = (await response.json()) as {
          ok?: boolean;
          hq?: HqSnapshot;
          site?: SiteSnapshot;
          error?: string;
        };
        if (payload.ok === false) throw new Error(payload.error ?? 'Action rejected');

        if (role === 'hq' && payload.hq) setServerData(payload.hq as T);
        if (role === 'site' && payload.site) setServerData(payload.site as T);
        setDegraded(false);
      } catch {
        // The local fallback already has the action. Drop stale server data so
        // the UI immediately reflects the deterministic local plan.
        setDegraded(true);
        setServerData(null);
      }
    },
    [commitLocal, room, role],
  );

  const localData = useMemo(() => select(localState), [select, localState]);
  const mode: SyncMode = connected && !degraded ? 'ws' : 'offline';

  return {
    data: serverData ?? localData,
    connected,
    mode,
    dispatch,
  };
}

/** HQ-wide live snapshot with an instant local-first fallback. */
export function useHqSync(room: string): NeighborhoodSync<HqSnapshot> {
  const select = useCallback((state: RoomState) => buildHqSnapshot(state), []);
  return useNeighborhoodChannel(room, 'hq', null, select);
}

/** Authorised per-site snapshot, including the full vehicle fleet. */
export function useSiteSync(
  siteId: SiteId,
  room: string,
): NeighborhoodSync<SiteSnapshot> {
  const select = useCallback(
    (state: RoomState) => buildSiteSnapshot(state, siteId),
    [siteId],
  );
  return useNeighborhoodChannel(room, 'site', siteId, select);
}
