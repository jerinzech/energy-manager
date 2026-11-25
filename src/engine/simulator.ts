import type {
  HqSiteSummary,
  HqSnapshot,
  PilotDay,
  RoomState,
  ScenarioKey,
  SiteConfig,
  SiteControlState,
  SiteId,
  SiteSimulation,
  SiteSnapshot,
} from './types';
import { CONTROL_SITE_ID, MV_SUBSTATION, PILOT_SITE_ID, SCENARIOS, SITES, SITE_BY_ID } from './sites';
import { buildSiteProfile } from './profiles';
import { planBaseline, planFailsafe, planOptimized } from './optimizer';
import { N, clamp, round1 } from './time';

export { N, DT, slotToTime, timeToSlot } from './time';

function activePlan(
  site: SiteConfig,
  control: SiteControlState,
  scenario: ScenarioKey,
) {
  const profile = buildSiteProfile(site, scenario);
  const baseline = planBaseline(site, profile, scenario, control);
  const optimized = planOptimized(site, profile, scenario, control);
  const failsafe = planFailsafe(site, profile, control);
  const active = control.failSafe
    ? failsafe
    : control.optimized && control.aiEnabled
      ? optimized
      : baseline;

  return { profile, baseline, optimized, failsafe, active };
}

export function buildSiteSimulation(
  site: SiteConfig,
  control: SiteControlState,
  scenario: ScenarioKey,
  clockSlot: number,
): SiteSimulation {
  const { profile, baseline, optimized, active } = activePlan(site, control, scenario);
  const slot = clamp(Math.round(clockSlot), 0, N - 1);
  const usableBays = Math.max(1, Math.round(site.totalBays * (scenario === 'occ80' ? 0.8 : 1)));
  // An isolated building (supply & routing OFF from the launcher) reports zero
  // live telemetry while its planning curves stay computable for preview.
  const energized = control.online !== false;

  const activeChargers = Array.from({ length: N }, (_, i) => {
    const count = active.sessions.filter((session) => session.allocKw[i] > 0.01).length;
    return Math.min(usableBays, count);
  });

  const capBreachAfter = active.grid.some((value) => value > site.capKw + 0.01);
  const socShortfallAfter = active.sessions.filter((session) => !session.ready).length;
  const peakReductionPct = baseline.peakKw > 0
    ? Math.round(((baseline.peakKw - active.peakKw) / baseline.peakKw) * 100)
    : 0;
  const solarSelfPct = profile.solarKwh > 0
    ? Math.round((active.solarUsedKwh / profile.solarKwh) * 100)
    : 0;
  const shiftedPct = active.deliveredKwh > 0
    ? Math.round((active.shiftedKwh / active.deliveredKwh) * 100)
    : 0;

  const peakSavingEur = active.mode === 'baseline'
    ? 0
    : Math.max(0, Math.round((baseline.peakKw - active.peakKw) * 0.9));
  const energySavingEur = active.mode === 'baseline' ? 0 : Math.round(shiftedPct * 0.4);
  const dailySavingEur = peakSavingEur + energySavingEur;
  const co2SavedKg = Math.round(dailySavingEur * 0.12);
  const baselineCostEur = round1(baseline.deliveredKwh * 0.22 + baseline.peakKw * 0.35);
  const optimizedCostEur = round1(active.deliveredKwh * 0.18 + active.peakKw * 0.25);

  return {
    slots: Array.from({ length: N }, (_, i) => {
      const total = 6 * 60 + i * 15;
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }),
    building: profile.building.map(round1),
    solar: profile.solar.map(round1),
    ev: active.ev.map(round1),
    grid: active.grid.map(round1),
    baselineEv: baseline.ev.map(round1),
    baselineGrid: baseline.grid.map(round1),
    optimizedEv: optimized.ev.map(round1),
    optimizedGrid: optimized.grid.map(round1),
    activeChargers,
    usableBays,
    vehicles: active.sessions,
    peakKw: active.peakKw,
    baselinePeakKw: baseline.peakKw,
    optimizedPeakKw: optimized.peakKw,
    baselineReadyPct: baseline.readyPct,
    optimizedReadyPct: optimized.readyPct,
    capKw: site.capKw,
    // `breaching` describes the active plan's daily peak; `current.breaching`
    // below describes only the active clock slot.
    breaching: active.peakKw > site.capKw + 0.01,
    peakReductionPct,
    solarKwh: profile.solarKwh,
    solarSelfPct,
    readyPct: active.readyPct,
    readyCount: active.readyCount,
    dailySavingEur,
    peakSavingEur,
    energySavingEur,
    shiftedPct,
    capBreachAfter,
    socShortfallAfter,
    feasible: !capBreachAfter && socShortfallAfter === 0,
    current: {
      slot,
      time: (() => {
        const total = 6 * 60 + slot * 15;
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
      })(),
      buildingKw: energized ? round1(profile.building[slot]) : 0,
      evKw: energized ? round1(active.ev[slot]) : 0,
      solarKw: energized ? round1(profile.solar[slot]) : 0,
      gridKw: energized ? round1(active.grid[slot]) : 0,
      activeBays: energized ? activeChargers[slot] : 0,
      totalBays: site.totalBays,
      breaching: energized ? active.grid[slot] > site.capKw + 0.01 : false,
    },
    economics: {
      dailySavingEur,
      peakSavingEur,
      energySavingEur,
      co2SavedKg,
      shiftedPct,
      solarSelfPct,
      baselineCostEur,
      optimizedCostEur,
      simulated: true,
    },
  };
}

export function generatePilot30Day(state: RoomState): PilotDay[] {
  const pilotSite = SITE_BY_ID[PILOT_SITE_ID];
  const controlSite = SITE_BY_ID[CONTROL_SITE_ID];
  const pilot = buildSiteSimulation(
    pilotSite,
    state.sites[PILOT_SITE_ID],
    state.scenario,
    state.clock.slot,
  );
  const control = buildSiteSimulation(
    controlSite,
    state.sites[CONTROL_SITE_ID],
    state.scenario,
    state.clock.slot,
  );
  const pilotControl = state.sites[PILOT_SITE_ID];
  const pilotOn = pilotControl.aiEnabled && pilotControl.optimized && !pilotControl.failSafe;
  const pilotBase = pilotOn ? pilot.optimizedPeakKw : pilot.baselinePeakKw;
  const controlBase = control.baselinePeakKw;
  const types = ['Sunny', 'Cloudy', 'Cold', 'Sunny', 'Unexpected'];

  return Array.from({ length: 30 }, (_, index) => {
    const day = index + 1;
    const type = types[index % types.length];
    const jitter = ((day * 37) % 19) - 9;
    const controlPeak = Math.max(0, Math.round(controlBase + jitter));
    const pilotPeak = pilotOn
      ? Math.max(0, Math.round(pilotBase + jitter * 0.6))
      : controlPeak;
    const savedEur = pilotOn
      ? Math.max(0, Math.round((controlPeak - pilotPeak) * 0.9 + 18))
      : 0;

    return {
      day,
      label: `D${String(day).padStart(2, '0')}`,
      type,
      pilotPeak,
      controlPeak,
      capKw: pilotSite.capKw,
      savedEur,
    };
  });
}

export function buildHqSnapshot(state: RoomState): HqSnapshot {
  const simulations = SITES.map((site) => ({
    site,
    sim: buildSiteSimulation(site, state.sites[site.id], state.scenario, state.clock.slot),
    online: state.sites[site.id].online !== false,
  }));

  const baselineCoincident = new Array<number>(N).fill(0);
  const optimizedCoincident = new Array<number>(N).fill(0);

  for (const { site, sim } of simulations) {
    const useOptimized = !site.isControl && state.sites[site.id].aiEnabled;
    for (let i = 0; i < N; i += 1) {
      baselineCoincident[i] += sim.baselineGrid[i];
      optimizedCoincident[i] += useOptimized ? sim.optimizedGrid[i] : sim.baselineGrid[i];
    }
  }

  const baselinePeakKw = Math.round(Math.max(...baselineCoincident));
  const optimizedPeakKw = Math.round(Math.max(...optimizedCoincident));
  const currentKw = round1(
    simulations.reduce((sum, entry) => sum + (entry.online ? entry.sim.current.gridKw : 0), 0),
  );
  const totalEvs = simulations.reduce((sum, entry) => sum + entry.site.evsConnected, 0);
  const totalBays = simulations.reduce((sum, entry) => sum + entry.site.totalBays, 0);
  const readyCount = simulations.reduce((sum, entry) => sum + entry.sim.readyCount, 0);
  const totalSolarKwh = simulations.reduce((sum, entry) => sum + entry.sim.solarKwh, 0);
  const weightedSolarSelf = simulations.reduce(
    (sum, entry) => sum + entry.sim.solarKwh * entry.sim.solarSelfPct,
    0,
  );
  const dailySavingEur = round1(
    simulations.reduce((sum, entry) => sum + (entry.online ? entry.sim.dailySavingEur : 0), 0),
  );

  const sites: HqSiteSummary[] = simulations.map(({ site, sim, online }) => ({
    id: site.id,
    name: site.name,
    role: site.role,
    isControl: site.isControl,
    layout: site.layout,
    online,
    unreadNotifications: state.notifications.filter(
      (entry) => entry.siteId === site.id && !entry.acknowledged,
    ).length,
    aiEnabled: state.sites[site.id].aiEnabled,
    optimized: state.sites[site.id].optimized && state.sites[site.id].aiEnabled,
    planStatus: state.sites[site.id].planStatus,
    failSafe: state.sites[site.id].failSafe,
    urgentCount: state.sites[site.id].urgentIds.length,
    capKw: site.capKw,
    evsConnected: site.evsConnected,
    totalBays: site.totalBays,
    currentKw: online ? sim.current.gridKw : 0,
    currentEvKw: online ? sim.current.evKw : 0,
    currentSolarKw: online ? sim.current.solarKw : 0,
    currentBuildingKw: online ? sim.current.buildingKw : 0,
    activeBays: online ? sim.current.activeBays : 0,
    peakKw: online ? sim.peakKw : 0,
    baselinePeakKw: sim.baselinePeakKw,
    optimizedPeakKw: sim.optimizedPeakKw,
    peakReductionPct: sim.peakReductionPct,
    readyPct: sim.readyPct,
    readyCount: sim.readyCount,
    solarKwh: sim.solarKwh,
    solarSelfPct: sim.solarSelfPct,
    breaching: online ? sim.breaching : false,
    dailySavingEur: online ? sim.dailySavingEur : 0,
    feasible: sim.feasible,
  }));

  return {
    room: state.room,
    serverOnline: state.serverOnline,
    agenticRouting: state.agenticRouting,
    // GDPR-redacted cross-building agent feed. The per-building dashboards own
    // the acknowledgements; HQ only ever sees this anonymised projection.
    agentFeed: state.notifications.slice(-50).map((entry) => ({
      ...entry,
      title: entry.title.replace(/\bEV-\d+\b/g, 'anonymised session'),
      message: entry.message.replace(/\bEV-\d+\b/g, 'anonymised session'),
    })),
    scenario: state.scenario,
    scenarios: SCENARIOS,
    clock: { ...state.clock },
    substation: {
      name: MV_SUBSTATION.name,
      capKw: MV_SUBSTATION.capKw,
      currentKw,
      baselinePeakKw,
      optimizedPeakKw,
      headroomKw: round1(MV_SUBSTATION.capKw - currentKw),
      breaching: currentKw > MV_SUBSTATION.capKw,
      baselineBreaching: baselinePeakKw > MV_SUBSTATION.capKw,
      optimizedBreaching: optimizedPeakKw > MV_SUBSTATION.capKw,
      siteCount: SITES.length,
    },
    totals: {
      sites: SITES.length,
      evsConnected: totalEvs,
      totalBays,
      readyPct: Math.round((readyCount / Math.max(1, totalEvs)) * 100),
      readyCount,
      currentKw,
      baselinePeakKw,
      optimizedPeakKw,
      solarKwh: round1(totalSolarKwh),
      solarSelfPct: totalSolarKwh > 0 ? Math.round(weightedSolarSelf / totalSolarKwh) : 0,
      dailySavingEur,
      breaching:
        currentKw > MV_SUBSTATION.capKw ||
        simulations.some((entry) => entry.online && entry.sim.breaching),
    },
    sites,
    pilot30Day: generatePilot30Day(state),
    // The HQ projection is deliberately anonymised: vehicle identifiers that
    // appear in site-level audit messages are redacted before crossing the
    // GDPR boundary.
    auditLog: state.auditLog.slice(-100).map((entry) => ({
      ...entry,
      message: entry.message.replace(/\bEV-\d+\b/g, 'anonymised session'),
    })),
  };
}

export function buildSiteSnapshot(state: RoomState, siteId: SiteId): SiteSnapshot {
  const site = SITE_BY_ID[siteId];
  const control = state.sites[siteId];

  return {
    room: state.room,
    serverOnline: state.serverOnline,
    agenticRouting: state.agenticRouting,
    // Tenant isolation: a building dashboard only ever sees its own entries.
    notifications: state.notifications
      .filter((entry) => entry.siteId === siteId)
      .slice(-50),
    site,
    clock: { ...state.clock },
    scenario: state.scenario,
    scenarios: SCENARIOS,
    sim: buildSiteSimulation(site, control, state.scenario, state.clock.slot),
    state: {
      ...control,
      urgentIds: [...control.urgentIds],
      overrides: Object.fromEntries(
        Object.entries(control.overrides).map(([id, override]) => [id, { ...override }]),
      ),
    },
    pilot30Day: generatePilot30Day(state),
    auditLog: state.auditLog
      .filter((entry) => entry.siteId == null || entry.siteId === siteId)
      .slice(-100),
  };
}
