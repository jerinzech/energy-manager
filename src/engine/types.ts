/**
 * Grid-Sense — shared engine contracts.
 *
 * This module is intentionally free of DOM, Node, React and Cloudflare
 * dependencies. The exact same code runs in the Durable Object, the Vite
 * browser fallback and the `tsx` verification script.
 */

export type ScenarioKey = 'sunny' | 'cloudy' | 'cold' | 'occ80' | 'unexpected';

export type SiteId =
  | 'alptech-hq'
  | 'isere-rd'
  | 'dauphine-cloud'
  | 'vercors-control'
  | 'chartreuse-annex';

export type PriorityLevel = 'Urgent' | 'High' | 'Normal' | 'Low';

export type PlanStatus =
  | 'BASELINE'
  | 'PENDING'
  | 'APPROVED'
  | 'MODIFIED'
  | 'REJECTED'
  | 'FAILSAFE';

export type PriorityMode = 'balanced' | 'high' | 'fair';

/** The three agentic-control actors of the Grid-Sense system. */
export type AgentName =
  | 'Grid Routing Agent'
  | 'Solar Arbitrage Agent'
  | 'Guardian Agent';

/** How strongly an agent notification addresses the building dashboard. */
export type AgentSeverity = 'info' | 'action' | 'approval' | 'guardian';

/**
 * One agentic-control notification, deliberately targeted at exactly one
 * building. HQ only ever sees a redacted feed; per-building dashboards see
 * their own entries with acknowledge controls.
 */
export interface AgentNotification {
  id: string;
  siteId: SiteId;
  at: string;
  agentName: AgentName;
  severity: AgentSeverity;
  title: string;
  message: string;
  requiresApproval: boolean;
  acknowledged: boolean;
}

/** A deterministic, anonymised vehicle session definition. */
export interface VehicleConfig {
  id: string;
  charger: string;
  /** Arrival clock time, HH:MM. */
  arr: string;
  /** Planned departure clock time, HH:MM. */
  dep: string;
  /** Requested energy at arrival, kWh. */
  req: number;
  /** Arrival state of charge, percent. */
  soc: number;
  /** Usable battery capacity, kWh. */
  bat: number;
  prio: PriorityLevel;
  basePrio: PriorityLevel;
  /** Representative teaching session (first 12 of every fleet). */
  rep: boolean;
  isUrgent: boolean;
  /** Morning departure means the vehicle cannot rely on late-day charging. */
  lockMorning: boolean;
  /** Arrival slot index (06:00 = 0, 15-minute resolution). */
  a: number;
  /** Departure slot index (exclusive). */
  d: number;
  /** Minimum energy required to hit targetSoc, kWh. */
  needKwh: number;
  /** Requested departure state of charge, percent. */
  targetSoc: number;
}

export type VehicleSchedule = VehicleConfig;

/** A fully evaluated charging session, including its per-slot allocation. */
export interface VehicleSession extends VehicleConfig {
  finalSoc: number;
  deliveredKwh: number;
  ready: boolean;
  /** Slot indices where this vehicle receives energy. */
  blocks: number[];
  windowLabel: string;
  /** kW allocation per slot (length 56). */
  allocKw: number[];
  explanation: string;
  solarSharePct: number;
  minHeadroomKw: number;
}

export interface SiteLayout {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  shape: 'L' | 'rect' | 'tower' | 'twin';
  canopyOffset: [number, number];
}

export interface SiteConfig {
  id: SiteId;
  name: string;
  role: string;
  isControl: boolean;
  defaultAiEnabled: boolean;
  capKw: number;
  evsConnected: number;
  totalBays: number;
  solarKwh: number;
  layout: SiteLayout;
  seed: number;
  fleet: VehicleConfig[];
}

export interface VehicleOverride {
  window?: string;
  energyKwh?: number;
  priority?: PriorityLevel;
  note?: string;
}

/** Serializable site control state. */
export interface SiteControlState {
  aiEnabled: boolean;
  optimized: boolean;
  planStatus: PlanStatus;
  priorityMode: PriorityMode;
  /** Minimum departure state of charge, percent. */
  minCharge: number;
  /** Manager-imposed site demand ceiling, kW. */
  maxSiteKw: number;
  urgentIds: string[];
  overrides: Record<string, VehicleOverride>;
  failSafe: boolean;
  /** Whether this building's electrical supply & routing is energized. */
  online: boolean;
  lastAction: string | null;
  lastActionAt: string | null;
}

export type SiteControlStateDto = SiteControlState;

export interface SiteEconomics {
  dailySavingEur: number;
  peakSavingEur: number;
  energySavingEur: number;
  co2SavedKg: number;
  shiftedPct: number;
  solarSelfPct: number;
  baselineCostEur: number;
  optimizedCostEur: number;
  /** Every financial value in this prototype is simulated. */
  simulated: true;
}

export interface CurrentSlice {
  slot: number;
  time: string;
  buildingKw: number;
  evKw: number;
  solarKw: number;
  gridKw: number;
  activeBays: number;
  totalBays: number;
  breaching: boolean;
}

export interface SiteSimulation {
  slots: string[];
  building: number[];
  solar: number[];
  ev: number[];
  grid: number[];
  baselineEv: number[];
  baselineGrid: number[];
  optimizedEv: number[];
  optimizedGrid: number[];
  activeChargers: number[];
  usableBays: number;
  vehicles: VehicleSession[];
  peakKw: number;
  baselinePeakKw: number;
  optimizedPeakKw: number;
  baselineReadyPct: number;
  optimizedReadyPct: number;
  capKw: number;
  breaching: boolean;
  peakReductionPct: number;
  solarKwh: number;
  solarSelfPct: number;
  readyPct: number;
  readyCount: number;
  dailySavingEur: number;
  peakSavingEur: number;
  energySavingEur: number;
  shiftedPct: number;
  capBreachAfter: boolean;
  socShortfallAfter: number;
  feasible: boolean;
  current: CurrentSlice;
  economics: SiteEconomics;
}

/**
 * GDPR-safe HQ projection. Deliberately contains no vehicle arrays, no
 * per-session allocations and no vehicle identifiers. Only aggregate telemetry
 * and the site's spatial layout are exposed to the HQ visualiser.
 */
export interface HqSiteSummary {
  id: SiteId;
  name: string;
  role: string;
  isControl: boolean;
  /** Spatial footprint used by the 3D Grenoble HQ visualiser. */
  layout: SiteLayout;
  /** False when the building's supply & routing is isolated from the launcher. */
  online: boolean;
  /** Unacknowledged agentic notifications still waiting on this building. */
  unreadNotifications: number;
  aiEnabled: boolean;
  optimized: boolean;
  planStatus: PlanStatus;
  failSafe: boolean;
  urgentCount: number;
  capKw: number;
  evsConnected: number;
  totalBays: number;
  currentKw: number;
  currentEvKw: number;
  currentSolarKw: number;
  currentBuildingKw: number;
  activeBays: number;
  peakKw: number;
  baselinePeakKw: number;
  optimizedPeakKw: number;
  peakReductionPct: number;
  readyPct: number;
  readyCount: number;
  solarKwh: number;
  solarSelfPct: number;
  /** True when the active plan's daily peak exceeds the site cap. */
  breaching: boolean;
  dailySavingEur: number;
  feasible: boolean;
}

export interface ClockState {
  slot: number;
  time: string;
  playing: boolean;
  speedMs: number;
}

export interface ScenarioMeta {
  key: ScenarioKey;
  label: string;
  desc: string;
  short: string;
}

export interface SubstationSummary {
  name: string;
  capKw: number;
  currentKw: number;
  baselinePeakKw: number;
  optimizedPeakKw: number;
  headroomKw: number;
  breaching: boolean;
  baselineBreaching: boolean;
  optimizedBreaching: boolean;
  siteCount: number;
}

export interface HqTotals {
  sites: number;
  evsConnected: number;
  totalBays: number;
  readyPct: number;
  readyCount: number;
  currentKw: number;
  baselinePeakKw: number;
  optimizedPeakKw: number;
  solarKwh: number;
  solarSelfPct: number;
  dailySavingEur: number;
  breaching: boolean;
}

export interface PilotDay {
  day: number;
  label: string;
  type: string;
  pilotPeak: number;
  controlPeak: number;
  capKw: number;
  savedEur: number;
}

export interface AuditEntry {
  id: string;
  seq: number;
  at: string;
  slot: number;
  room: string;
  action: string;
  siteId: SiteId | null;
  message: string;
}

export interface HqSnapshot {
  room: string;
  /** False when the backend data server is parked in standby from the launcher. */
  serverOnline: boolean;
  /** False when autonomous agent reroutes are paused from the launcher. */
  agenticRouting: boolean;
  /** GDPR-redacted cross-building agent feed (no vehicle identifiers). */
  agentFeed: AgentNotification[];
  scenario: ScenarioKey;
  scenarios: ScenarioMeta[];
  clock: ClockState;
  substation: SubstationSummary;
  totals: HqTotals;
  sites: HqSiteSummary[];
  pilot30Day: PilotDay[];
  auditLog: AuditEntry[];
}

export interface SiteSnapshot {
  room: string;
  /** False when the backend data server is parked in standby from the launcher. */
  serverOnline: boolean;
  /** False when autonomous agent reroutes are paused from the launcher. */
  agenticRouting: boolean;
  /** Agent notifications strictly filtered to this building. */
  notifications: AgentNotification[];
  site: SiteConfig;
  clock: ClockState;
  scenario: ScenarioKey;
  scenarios: ScenarioMeta[];
  sim: SiteSimulation;
  state: SiteControlStateDto;
  pilot30Day: PilotDay[];
  auditLog: AuditEntry[];
}

export type ActionPayload =
  | { type: 'SET_SCENARIO'; scenario: ScenarioKey }
  | {
      type: 'SET_CLOCK';
      slot?: number;
      time?: string;
      playing?: boolean;
      speedMs?: number;
    }
  | { type: 'SET_SERVER_ONLINE'; enabled: boolean }
  | { type: 'SET_AGENTIC_ROUTING'; enabled: boolean }
  | { type: 'RUN_AGENT_CYCLE'; siteId?: SiteId }
  | { type: 'ACK_NOTIFICATION'; siteId: SiteId; notificationId: string }
  | { type: 'OPTIMIZE_ALL' }
  | { type: 'RESET_ALL' }
  | { type: 'SITE_OPTIMIZE'; siteId: SiteId }
  | { type: 'SITE_RESET'; siteId: SiteId }
  | { type: 'SITE_APPROVE'; siteId: SiteId }
  | { type: 'SITE_REJECT'; siteId: SiteId }
  | { type: 'SITE_SET_ONLINE'; siteId: SiteId; enabled: boolean }
  | {
      type: 'SITE_CONSTRAINTS';
      siteId: SiteId;
      minCharge?: number;
      maxSiteKw?: number;
      priorityMode?: PriorityMode;
    }
  | {
      type: 'SITE_OVERRIDES';
      siteId: SiteId;
      vehicleId: string;
      window?: string;
      energyKwh?: number;
      priority?: PriorityLevel;
      note?: string;
    }
  | {
      type: 'SITE_URGENT';
      siteId: SiteId;
      vehicleId: string;
      urgent?: boolean;
    }
  | { type: 'SITE_FAILSAFE'; siteId: SiteId; enabled?: boolean }
  | { type: 'SITE_TOGGLE_AI'; siteId: SiteId; enabled?: boolean };

export type WsServerMessage =
  | { type: 'hq_state'; data: HqSnapshot }
  | { type: 'site_state'; siteId: SiteId; data: SiteSnapshot };

export interface RoomState {
  room: string;
  /** Whether the backend data server is streaming (launcher standby toggle). */
  serverOnline: boolean;
  /** Whether agentic electricity routing agents may act autonomously. */
  agenticRouting: boolean;
  /** Targeted agent notifications, newest last, capped at 200 entries. */
  notifications: AgentNotification[];
  scenario: ScenarioKey;
  clock: ClockState;
  sites: Record<SiteId, SiteControlState>;
  auditLog: AuditEntry[];
  auditSeq: number;
}
