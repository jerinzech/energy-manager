import type {
  ActionPayload,
  AgentName,
  AgentNotification,
  AgentSeverity,
  AuditEntry,
  RoomState,
  SiteControlState,
  SiteId,
  SiteSimulation,
} from './types';
import { SCENARIOS, SITES, SITE_BY_ID } from './sites';
import { clamp, slotToTime, timeToSlot } from './time';
import { buildSiteSimulation } from './simulator';

export { buildHqSnapshot, buildSiteSnapshot } from './simulator';

function cloneControl(control: SiteControlState): SiteControlState {
  return {
    ...control,
    urgentIds: [...control.urgentIds],
    overrides: Object.fromEntries(
      Object.entries(control.overrides).map(([id, override]) => [id, { ...override }]),
    ),
  };
}

function cloneState(state: RoomState): RoomState {
  return {
    ...state,
    clock: { ...state.clock },
    sites: Object.fromEntries(
      SITES.map((site) => [site.id, cloneControl(state.sites[site.id])]),
    ) as Record<SiteId, SiteControlState>,
    auditLog: [...state.auditLog],
    notifications: [...state.notifications],
  };
}

function touch(
  next: RoomState,
  action: ActionPayload,
  siteId: SiteId | null,
  message: string,
): void {
  const seq = next.auditSeq + 1;
  const entry: AuditEntry = {
    id: `A-${String(seq).padStart(4, '0')}`,
    seq,
    at: next.clock.time,
    slot: next.clock.slot,
    room: next.room,
    action: action.type,
    siteId,
    message,
  };
  next.auditSeq = seq;
  next.auditLog = [...next.auditLog, entry].slice(-200);

  if (siteId) {
    const control = next.sites[siteId];
    control.lastAction = action.type;
    control.lastActionAt = next.clock.time;
  }
}

function touchAll(next: RoomState, action: ActionPayload, message: string): void {
  for (const site of SITES) {
    const control = next.sites[site.id];
    control.lastAction = action.type;
    control.lastActionAt = next.clock.time;
  }
  touch(next, action, null, message);
}

/** Mark a building's agent notifications as acknowledged. */
function ackSiteNotifications(
  next: RoomState,
  siteId: SiteId,
  notificationId?: string,
): number {
  let acked = 0;
  next.notifications = next.notifications.map((entry) => {
    if (entry.siteId !== siteId || entry.acknowledged) return entry;
    if (notificationId != null && entry.id !== notificationId) return entry;
    acked += 1;
    return { ...entry, acknowledged: true };
  });
  return acked;
}

interface AgentCycleResult {
  routed: number;
  approvals: number;
  guardianHolds: number;
  stable: number;
  skipped: number;
}

const AGENT_STRESS: ReadonlySet<string> = new Set(['cloudy', 'cold', 'unexpected']);

/**
 * One agentic-control cycle. The Grid Routing Agent and the Solar Arbitrage
 * Agent reroute EV load inside the guardrails; the Guardian Agent verifies
 * feasibility and emits one notification targeted at exactly one building.
 * Offline, AI-disabled and fail-safe buildings are never touched.
 */
function runAgentCycle(next: RoomState, target: SiteId | undefined): AgentCycleResult {
  const result: AgentCycleResult = {
    routed: 0,
    approvals: 0,
    guardianHolds: 0,
    stable: 0,
    skipped: 0,
  };
  const targets = target ? [SITE_BY_ID[target]] : SITES;
  const scenarioLabel =
    SCENARIOS.find((scenario) => scenario.key === next.scenario)?.label ?? next.scenario;

  for (const site of targets) {
    const control = next.sites[site.id];
    if (!control.online || !control.aiEnabled || control.failSafe) {
      result.skipped += 1;
      continue;
    }

    const before = buildSiteSimulation(site, control, next.scenario, next.clock.slot);
    const breachPct = before.breaching
      ? Math.round(((before.peakKw - site.capKw) / site.capKw) * 1000) / 10
      : 0;
    const stress = AGENT_STRESS.has(next.scenario);
    const solarUnderHarvested = before.solarSelfPct < 45 && site.solarKwh >= 100;
    const highStakes = breachPct > 10 || stress;

    let agentName: AgentName;
    let severity: AgentSeverity;
    let requiresApproval: boolean;
    let title: string;
    let message: string;

    if (highStakes) {
      agentName = 'Grid Routing Agent';
      requiresApproval = breachPct > 10 || next.scenario === 'unexpected' || next.scenario === 'cold';
      severity = requiresApproval ? 'approval' : 'action';
      title = requiresApproval
        ? 'Peak reroute needs your approval'
        : 'Autonomous peak reroute applied';
      message = control.optimized
        ? `${scenarioLabel} forecast changed the building load. The Grid Routing Agent re-validated the active plan.`
        : `Uncoordinated peak ${before.peakKw} kW breaches the ${site.capKw} kW cap by ${breachPct}%. The Grid Routing Agent shifted EV load into the ${next.scenario === 'cloudy' ? 'off-peak grid window' : 'midday solar window'}.`;
    } else if (before.breaching || (solarUnderHarvested && !control.optimized)) {
      agentName = 'Solar Arbitrage Agent';
      requiresApproval = false;
      severity = 'info';
      title = 'Solar arbitrage reroute applied';
      message = `Only ${before.solarSelfPct}% of the ${site.solarKwh} kWh rooftop/carport harvest feeds charging today${before.breaching ? ` and the ${before.peakKw} kW peak is ${breachPct}% over the ${site.capKw} kW cap` : ''}. The Solar Arbitrage Agent moved flexible sessions into the solar window.`;
    } else {
      result.stable += 1;
      continue;
    }

    // Route the building onto the optimized plan. High-stakes reroutes stay
    // PENDING for L3 human approval; low-stakes ones auto-apply as MODIFIED.
    control.optimized = true;
    control.planStatus = requiresApproval ? 'PENDING' : 'MODIFIED';

    const after = buildSiteSimulation(site, control, next.scenario, next.clock.slot);
    const guardianOk = after.peakKw <= site.capKw + 0.01 && after.readyPct === 100;
    const guardianReasons: string[] = [];
    if (after.peakKw > site.capKw + 0.01) {
      guardianReasons.push(`the rerouted plan still peaks at ${after.peakKw} kW against the ${site.capKw} kW cap`);
    }
    if (after.readyPct < 100) {
      guardianReasons.push(`only ${after.readyPct}% of sessions reach their departure target`);
    }
    const guardianVerdict = guardianOk
      ? `feasible — peak ${after.peakKw}/${site.capKw} kW, ${after.readyPct}% ready by departure, GDPR scope clear`
      : `held — ${guardianReasons.join(' and ')}`;

    if (!guardianOk) {
      agentName = 'Guardian Agent';
      severity = 'guardian';
      requiresApproval = true;
      control.planStatus = 'PENDING';
      title = 'Guardian hold — reroute needs manager review';
      message = `A reroute was proposed for this building, but the Guardian Agent blocked autonomous activation: ${guardianReasons.join(' and ')}. The plan peaks at ${after.peakKw} kW with ${after.readyPct}% readiness and stays PENDING for your review.`;
    } else if (agentName === 'Grid Routing Agent') {
      message += ` The plan now peaks at ${after.peakKw} kW with ${after.readyPct}% of sessions ready by departure. Guardian Agent: ${guardianVerdict}.${requiresApproval ? ' Review and approve under L3 human-in-the-loop.' : ' Low stakes — applied autonomously.'}`;
    } else {
      message += ` The plan now peaks at ${after.peakKw} kW with ${after.solarSelfPct}% solar self-consumption and ${after.readyPct}% readiness. Guardian Agent: ${guardianVerdict}. Auto-applied (no approval needed).`;
    }

    // One unread notification per topic per building: repeated cycles stay
    // quiet until the dashboard acknowledges the previous one.
    const duplicate = next.notifications.some(
      (entry) =>
        entry.siteId === site.id &&
        !entry.acknowledged &&
        entry.agentName === agentName &&
        entry.title === title,
    );
    if (duplicate) {
      result.stable += 1;
      continue;
    }

    const notification: AgentNotification = {
      id: `AN-${String(next.auditSeq + 1).padStart(4, '0')}`,
      siteId: site.id,
      at: next.clock.time,
      agentName,
      severity,
      title,
      message,
      requiresApproval,
      acknowledged: false,
    };
    next.notifications = [...next.notifications, notification].slice(-200);
    result.routed += 1;
    if (requiresApproval) result.approvals += 1;
    if (!guardianOk) result.guardianHolds += 1;

    touch(
      next,
      { type: 'RUN_AGENT_CYCLE', siteId: site.id },
      site.id,
      `${agentName} ${requiresApproval ? 'PROPOSED' : 'APPLIED'} a reroute at ${site.name}: ${before.peakKw} → ${after.peakKw} kW peak. Plan ${control.planStatus}. Guardian: ${guardianOk ? 'feasible' : 'held for review'}.`,
    );
  }

  return result;
}

export function createInitialRoomState(room: string): RoomState {
  const sites = {} as Record<SiteId, SiteControlState>;
  for (const site of SITES) {
    sites[site.id] = {
      aiEnabled: site.defaultAiEnabled,
      optimized: false,
      planStatus: 'BASELINE',
      priorityMode: 'balanced',
      minCharge: 80,
      maxSiteKw: site.capKw,
      urgentIds: [],
      overrides: {},
      failSafe: false,
      online: true,
      sellToGrid: false,
      lastAction: null,
      lastActionAt: null,
    };
  }

  return {
    room,
    serverOnline: true,
    agenticRouting: true,
    notifications: [],
    scenario: 'sunny',
    clock: { slot: 13, time: '09:15', playing: false, speedMs: 1200 },
    sites,
    auditLog: [
      {
        id: 'A-0001',
        seq: 1,
        at: '09:15',
        slot: 13,
        room,
        action: 'INIT',
        siteId: null,
        message: 'Room initialized at 09:15 on a Sunny day. All sites are on their uncoordinated baseline.',
      },
    ],
    auditSeq: 1,
  };
}

/**
 * Pure state transition. The input state is never mutated; the returned state
 * has a fresh immutable audit log entry for every accepted action.
 */
export function applyAction(state: RoomState, action: ActionPayload): RoomState {
  const next = cloneState(state);

  switch (action.type) {
    case 'SET_SCENARIO': {
      if (!SCENARIOS.some((scenario) => scenario.key === action.scenario)) return state;
      next.scenario = action.scenario;
      for (const site of SITES) {
        const control = next.sites[site.id];
        if (control.failSafe) {
          control.planStatus = 'FAILSAFE';
        } else if (control.optimized && control.aiEnabled) {
          control.planStatus = 'PENDING';
        } else {
          control.planStatus = 'BASELINE';
        }
      }
      const label = SCENARIOS.find((scenario) => scenario.key === action.scenario)?.label ?? action.scenario;
      touchAll(next, action, `Scenario set to ${label}. All site plans were re-evaluated against the new building and solar forecast.`);
      // Agentic autonomy: a live scenario switch re-routes power and notifies
      // the impacted building dashboards without waiting for a human click.
      if (next.agenticRouting && next.serverOnline) {
        const cycle = runAgentCycle(next, undefined);
        if (cycle.routed > 0) {
          touch(
            next,
            { type: 'RUN_AGENT_CYCLE' },
            null,
            `Agentic auto-cycle after the scenario change: ${cycle.routed} reroute(s) [${cycle.approvals} PENDING approval], ${cycle.guardianHolds} guardian hold(s), ${cycle.stable} stable, ${cycle.skipped} skipped.`,
          );
        }
      }
      return next;
    }

    case 'SET_CLOCK': {
      if (typeof action.slot === 'number' && Number.isFinite(action.slot)) {
        next.clock.slot = clamp(Math.round(action.slot), 0, 55);
        next.clock.time = slotToTime(next.clock.slot);
      } else if (typeof action.time === 'string') {
        next.clock.slot = timeToSlot(action.time);
        next.clock.time = slotToTime(next.clock.slot);
      }
      if (typeof action.playing === 'boolean') next.clock.playing = action.playing;
      if (typeof action.speedMs === 'number' && Number.isFinite(action.speedMs)) {
        next.clock.speedMs = clamp(Math.round(action.speedMs), 300, 10_000);
      }
      touch(
        next,
        action,
        null,
        `Clock set to ${next.clock.time} · ${next.clock.playing ? `playing at ${next.clock.speedMs} ms/slot` : 'paused'}.`,
      );
      return next;
    }

    case 'SET_SERVER_ONLINE': {
      next.serverOnline = action.enabled;
      if (!action.enabled) {
        next.clock = { ...next.clock, playing: false };
      }
      touch(
        next,
        action,
        null,
        action.enabled
          ? 'Backend data server switched ON. Live telemetry, clock playback and HQ sync resumed.'
          : 'Backend data server placed in STANDBY. The simulation clock was paused and the data stream stopped.',
      );
      return next;
    }

    case 'SITE_SET_ONLINE': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      control.online = action.enabled;
      touch(
        next,
        action,
        action.siteId,
        action.enabled
          ? `${site.name} supply & routing energized. The building rejoined the MV feeder live projection.`
          : `${site.name} supply & routing isolated from launcher. Live telemetry reads zero until it is re-energized.`,
      );
      return next;
    }

    case 'SET_AGENTIC_ROUTING': {
      next.agenticRouting = action.enabled;
      touch(
        next,
        action,
        null,
        action.enabled
          ? 'Agentic electricity routing ENABLED. Grid Routing, Solar Arbitrage and Guardian agents may reroute within guardrails.'
          : 'Agentic electricity routing DISABLED. Autonomous reroutes and scenario auto-cycles are paused.',
      );
      return next;
    }

    case 'RUN_AGENT_CYCLE': {
      if (!next.agenticRouting) {
        touch(
          next,
          action,
          null,
          'Agentic routing cycle skipped: autonomous electricity routing is disabled from the launcher.',
        );
        return next;
      }
      const cycle = runAgentCycle(next, action.siteId);
      const scope = action.siteId ? SITE_BY_ID[action.siteId].name : 'the campus';
      touch(
        next,
        action,
        null,
        `Agentic routing cycle ran for ${scope}: ${cycle.routed} reroute(s) [${cycle.approvals} PENDING approval], ${cycle.guardianHolds} guardian hold(s), ${cycle.stable} stable, ${cycle.skipped} skipped.`,
      );
      return next;
    }

    case 'ACK_NOTIFICATION': {
      const site = SITE_BY_ID[action.siteId];
      const acked = ackSiteNotifications(next, action.siteId, action.notificationId);
      touch(
        next,
        action,
        action.siteId,
        acked > 0
          ? `Manager acknowledged agent notification ${action.notificationId} at ${site.name}.`
          : `No unacknowledged notification ${action.notificationId} at ${site.name}; nothing to acknowledge.`,
      );
      return next;
    }

    case 'OPTIMIZE_ALL': {
      let optimizedCount = 0;
      for (const site of SITES) {
        const control = next.sites[site.id];
        if (control.aiEnabled) {
          control.optimized = true;
          control.planStatus = 'PENDING';
          control.failSafe = false;
          optimizedCount += 1;
        }
      }
      touchAll(
        next,
        action,
        `AI optimization queued for ${optimizedCount} AI-enabled site${optimizedCount === 1 ? '' : 's'}. Plans are PENDING until a human approves them.`,
      );
      return next;
    }

    case 'RESET_ALL': {
      for (const site of SITES) {
        const control = next.sites[site.id];
        control.optimized = false;
        control.planStatus = 'BASELINE';
        control.failSafe = false;
        control.minCharge = 80;
        control.maxSiteKw = site.capKw;
        control.priorityMode = 'balanced';
        control.urgentIds = [];
        control.overrides = {};
      }
      touchAll(next, action, 'All sites reset to the uncoordinated baseline. Constraints, urgent flags and overrides were cleared.');
      return next;
    }

    case 'SITE_OPTIMIZE': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      if (!control.aiEnabled) {
        touch(next, action, action.siteId, `AI is disabled at ${site.name}. Enable AI before requesting an optimized plan.`);
        return next;
      }
      control.optimized = true;
      control.planStatus = 'PENDING';
      control.failSafe = false;
      touch(next, action, action.siteId, `AI optimization requested for ${site.name}. The ${site.evsConnected}-session plan is PENDING human approval.`);
      return next;
    }

    case 'SITE_RESET': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      control.optimized = false;
      control.planStatus = 'BASELINE';
      control.failSafe = false;
      control.minCharge = 80;
      control.maxSiteKw = site.capKw;
      control.priorityMode = 'balanced';
      control.urgentIds = [];
      control.overrides = {};
      touch(next, action, action.siteId, `${site.name} reset to baseline. Site constraints and vehicle overrides were cleared.`);
      return next;
    }

    case 'SITE_APPROVE': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      control.planStatus = control.optimized && control.aiEnabled ? 'APPROVED' : 'BASELINE';
      // Approving a plan also closes every open agent notification for that
      // building: the human decision the agent was waiting for has landed.
      const acked = ackSiteNotifications(next, action.siteId);
      touch(next, action, action.siteId, control.planStatus === 'APPROVED'
        ? `Optimized plan APPROVED for ${site.name}. The schedule is now the active operating plan.${acked > 0 ? ` ${acked} agent notification(s) acknowledged.` : ''}`
        : `${site.name} has no optimized plan to approve; it remains on baseline.`);
      return next;
    }

    case 'SITE_REJECT': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      control.planStatus = 'REJECTED';
      control.optimized = false;
      control.failSafe = false;
      touch(next, action, action.siteId, `Optimized plan REJECTED for ${site.name}. The site reverted to its uncoordinated baseline.`);
      return next;
    }

    case 'SITE_CONSTRAINTS': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      if (typeof action.minCharge === 'number' && Number.isFinite(action.minCharge)) {
        control.minCharge = clamp(Math.round(action.minCharge), 50, 100);
      }
      if (typeof action.maxSiteKw === 'number' && Number.isFinite(action.maxSiteKw)) {
        control.maxSiteKw = clamp(Math.round(action.maxSiteKw), 50, site.capKw);
      }
      if (action.priorityMode) control.priorityMode = action.priorityMode;
      control.planStatus = control.optimized && control.aiEnabled ? 'MODIFIED' : 'BASELINE';
      touch(
        next,
        action,
        action.siteId,
        `${site.name} constraints updated: min charge ${control.minCharge}%, site ceiling ${control.maxSiteKw} kW, ${control.priorityMode} priority. Plan marked ${control.planStatus}.`,
      );
      return next;
    }

    case 'SITE_OVERRIDES': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      const vehicle = site.fleet.find((item) => item.id === action.vehicleId);
      if (!vehicle) {
        touch(next, action, action.siteId, `Override ignored: vehicle ${action.vehicleId} is not part of ${site.name}.`);
        return next;
      }

      const override = { ...(control.overrides[action.vehicleId] ?? {}) };
      if (action.window !== undefined) {
        if (action.window.trim()) override.window = action.window.trim();
        else delete override.window;
      }
      if (typeof action.energyKwh === 'number' && Number.isFinite(action.energyKwh)) {
        const capacity = ((100 - vehicle.soc) / 100) * vehicle.bat;
        override.energyKwh = clamp(action.energyKwh, 0, capacity);
      }
      if (action.priority) override.priority = action.priority;
      if (action.note !== undefined) {
        if (action.note.trim()) override.note = action.note.trim();
        else delete override.note;
      }

      if (Object.keys(override).length > 0) control.overrides[action.vehicleId] = override;
      else delete control.overrides[action.vehicleId];

      control.planStatus = control.optimized && control.aiEnabled ? 'MODIFIED' : 'BASELINE';
      touch(
        next,
        action,
        action.siteId,
        `Manager override saved for ${vehicle.id} at ${site.name}: ${override.window ?? 'arrival–departure window'}, ${override.energyKwh != null ? `${override.energyKwh.toFixed(1)} kWh` : 'default energy'}, ${override.priority ?? vehicle.basePrio} priority.`,
      );
      return next;
    }

    case 'SITE_URGENT': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      const vehicle = site.fleet.find((item) => item.id === action.vehicleId);
      if (!vehicle) {
        touch(next, action, action.siteId, `Urgent flag ignored: vehicle ${action.vehicleId} is not part of ${site.name}.`);
        return next;
      }
      const urgent = action.urgent ?? true;
      if (urgent) {
        if (!control.urgentIds.includes(action.vehicleId)) control.urgentIds.push(action.vehicleId);
      } else {
        control.urgentIds = control.urgentIds.filter((id) => id !== action.vehicleId);
      }
      control.planStatus = control.optimized && control.aiEnabled ? 'MODIFIED' : 'BASELINE';
      touch(
        next,
        action,
        action.siteId,
        `${vehicle.id} ${urgent ? 'flagged URGENT — immediate next-bay priority' : 'urgent flag cleared'} at ${site.name}. Plan marked ${control.planStatus}.`,
      );
      return next;
    }

    case 'SITE_FAILSAFE': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      const enabled = action.enabled ?? true;
      control.failSafe = enabled;
      if (enabled) {
        control.planStatus = 'FAILSAFE';
      } else {
        control.planStatus = control.optimized && control.aiEnabled ? 'PENDING' : 'BASELINE';
      }
      touch(
        next,
        action,
        action.siteId,
        enabled
          ? `EDGE FAIL-SAFE engaged at ${site.name}. Every active bay is capped at 3.7 kW until HQ connectivity returns.`
          : `Edge fail-safe cleared at ${site.name}. Plan returned to ${control.planStatus}.`,
      );
      return next;
    }

    case 'SITE_TOGGLE_AI': {
      const site = SITE_BY_ID[action.siteId];
      const control = next.sites[action.siteId];
      const enabled = action.enabled ?? !control.aiEnabled;
      control.aiEnabled = enabled;
      if (!enabled) {
        control.optimized = false;
        control.failSafe = false;
        control.planStatus = 'BASELINE';
      } else {
        control.planStatus = 'BASELINE';
      }
      touch(
        next,
        action,
        action.siteId,
        `Site AI ${enabled ? 'ENABLED' : 'DISABLED'} at ${site.name}. ${enabled ? 'Optimization is available but not yet requested.' : 'The site is locked to its baseline schedule.'}`,
      );
      return next;
    }

    case 'SITE_SET_SELL_TO_GRID': {
      const site = SITE_BY_ID[action.siteId];
      if (!site) return state;
      const control = next.sites[action.siteId];
      control.sellToGrid = Boolean(action.enabled);
      touch(
        next,
        action,
        action.siteId,
        `Grid export (V2G & solar feed-in) ${control.sellToGrid ? 'ENABLED' : 'DISABLED'} at ${site.name}.`,
      );
      return next;
    }

    default:
      return state;
  }
}
