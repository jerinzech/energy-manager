import {
  MV_SUBSTATION,
  SCENARIOS,
  SITES,
  SITE_BY_ID,
  applyAction,
  buildHqSnapshot,
  buildSiteSimulation,
  buildSiteSnapshot,
  createInitialRoomState,
} from '../src/engine';

function assertEqual(actual: unknown, expected: unknown, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      message ??
        `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function assertOk(value: unknown, message?: string): asserts value {
  if (!value) {
    throw new Error(message ?? 'Expected a truthy value');
  }
}

function assertDoesNotThrow(fn: () => void): void {
  fn();
}

let checks = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  checks += 1;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('Grid-Sense — deterministic engine verification\n');

// 1. Campus inventory and feeder capacity.
check('campus inventory: 5 sites, 124 EVs, 157 bays', () => {
  assertEqual(SITES.length, 5);
  assertEqual(
    SITES.reduce((sum, site) => sum + site.evsConnected, 0),
    124,
  );
  assertEqual(
    SITES.reduce((sum, site) => sum + site.totalBays, 0),
    157,
  );
  assertEqual(MV_SUBSTATION.capKw, 1650);
  assertEqual(new Set(SITES.map((site) => site.id)).size, 5);
  assertOk(SITES.every((site) => site.layout != null));
});

// 2. AlpTech HQ Sunny Day reference numbers.
const baseState = createInitialRoomState('verify');
const alptechState = applyAction(baseState, {
  type: 'SITE_OPTIMIZE',
  siteId: 'alptech-hq',
});
const alptech = buildSiteSimulation(
  SITE_BY_ID['alptech-hq'],
  alptechState.sites['alptech-hq'],
  'sunny',
  alptechState.clock.slot,
);

check('alptech-hq Sunny Day baseline peak is exactly 412 kW', () => {
  assertEqual(alptech.baselinePeakKw, 412);
});

check('alptech-hq Sunny Day optimized peak is <= 340 kW', () => {
  assertOk(
    alptech.optimizedPeakKw <= 340,
    `optimizedPeakKw=${alptech.optimizedPeakKw}`,
  );
});

check('alptech-hq Sunny Day solar yield is exactly 186 kWh', () => {
  assertEqual(alptech.solarKwh, 186);
});

check('alptech-hq Sunny Day optimized readiness is 100%', () => {
  assertEqual(alptech.readyPct, 100);
  assertEqual(alptech.readyCount, alptech.vehicles.length);
});

// 3. Every site's optimized plan is 100% ready and stays inside its cap.
check('all 5 sites have a 100% ready Sunny Day optimized plan', () => {
  for (const site of SITES) {
    const sim = buildSiteSimulation(
      site,
      baseState.sites[site.id],
      'sunny',
      baseState.clock.slot,
    );
    assertEqual(
      sim.optimizedReadyPct,
      100,
      `${site.id} optimizedReadyPct=${sim.optimizedReadyPct}`,
    );
    assertOk(
      sim.optimizedPeakKw <= site.capKw,
      `${site.id} optimizedPeakKw=${sim.optimizedPeakKw} > capKw=${site.capKw}`,
    );
  }
});

check('all 5 sites are 100% ready with active AI plans on Sunny Day', () => {
  let state = createInitialRoomState('verify-all-ai');
  for (const site of SITES) {
    if (!state.sites[site.id].aiEnabled) {
      state = applyAction(state, {
        type: 'SITE_TOGGLE_AI',
        siteId: site.id,
        enabled: true,
      });
    }
    state = applyAction(state, { type: 'SITE_OPTIMIZE', siteId: site.id });
  }

  for (const site of SITES) {
    const sim = buildSiteSimulation(
      site,
      state.sites[site.id],
      'sunny',
      state.clock.slot,
    );
    assertEqual(sim.readyPct, 100, `${site.id} readyPct=${sim.readyPct}`);
    assertOk(
      sim.peakKw <= site.capKw,
      `${site.id} peakKw=${sim.peakKw} > capKw=${site.capKw}`,
    );
  }
});

// 4. Every scenario must run without throwing or producing non-finite data.
check('all 5 scenarios run cleanly for HQ and every site', () => {
  for (const scenario of SCENARIOS) {
    let state = createInitialRoomState(`verify-${scenario.key}`);
    state = applyAction(state, {
      type: 'SET_SCENARIO',
      scenario: scenario.key,
    });
    state = applyAction(state, { type: 'OPTIMIZE_ALL' });

    const hq = buildHqSnapshot(state);
    assertEqual(hq.scenario, scenario.key);
    assertEqual(hq.sites.length, 5);
    assertOk(Number.isFinite(hq.substation.currentKw));
    assertOk(Number.isFinite(hq.totals.readyPct));
    assertDoesNotThrow(() => JSON.stringify(hq));

    for (const site of SITES) {
      const snapshot = buildSiteSnapshot(state, site.id);
      assertEqual(snapshot.scenario, scenario.key);
      assertEqual(snapshot.sim.slots.length, 56);
      assertEqual(snapshot.sim.vehicles.length, site.evsConnected);
      assertOk(Number.isFinite(snapshot.sim.peakKw));
      assertOk(Number.isFinite(snapshot.sim.readyPct));
      assertOk(Number.isFinite(snapshot.sim.solarKwh));
      assertEqual(snapshot.clock.time, state.clock.time);

      for (const vehicle of snapshot.sim.vehicles) {
        assertEqual(vehicle.allocKw.length, 56);
        assertOk(
          vehicle.allocKw.every((value) => Number.isFinite(value)),
          `${site.id}/${vehicle.id} has a non-finite allocation`,
        );
        assertOk(
          vehicle.allocKw.every((value) => value <= 22.0001),
          `${site.id}/${vehicle.id} exceeds the 22 kW charger limit`,
        );
      }
    }
  }
});

// 5. The HQ projection must remain GDPR-safe even after vehicle-level actions.
check('HQ snapshot contains zero allocKw, vehicles or EV-01 identifiers', () => {
  let state = createInitialRoomState('verify-gdpr');
  state = applyAction(state, {
    type: 'SITE_URGENT',
    siteId: 'alptech-hq',
    vehicleId: 'EV-01',
    urgent: true,
  });
  const hq = buildHqSnapshot(state);
  const serialized = JSON.stringify(hq);

  assertEqual(serialized.includes('allocKw'), false);
  assertEqual(serialized.includes('vehicles'), false);
  assertEqual(serialized.includes('EV-01'), false);
  assertEqual(serialized.includes('urgentIds'), false);
  assertEqual(serialized.includes('overrides'), false);

  const summary = hq.sites.find((site) => site.id === 'alptech-hq');
  assertOk(summary);
  assertEqual(summary.urgentCount, 1);
  assertEqual(summary.layout.shape, 'L');
});

// 6. Vehicle-level mutations append audit entries and are reflected in HQ.
check('SITE_URGENT and SITE_FAILSAFE mutate cleanly and append audit entries', () => {
  const initial = createInitialRoomState('verify-actions');
  const before = initial.auditLog.length;

  const urgentState = applyAction(initial, {
    type: 'SITE_URGENT',
    siteId: 'alptech-hq',
    vehicleId: 'EV-01',
    urgent: true,
  });
  assertEqual(urgentState.sites['alptech-hq'].urgentIds.includes('EV-01'), true);
  assertEqual(urgentState.auditLog.length, before + 1);
  assertEqual(urgentState.auditLog.at(-1)?.action, 'SITE_URGENT');

  const failsafeState = applyAction(urgentState, {
    type: 'SITE_FAILSAFE',
    siteId: 'alptech-hq',
    enabled: true,
  });
  assertEqual(failsafeState.sites['alptech-hq'].failSafe, true);
  assertEqual(failsafeState.auditLog.length, before + 2);
  assertEqual(failsafeState.auditLog.at(-1)?.action, 'SITE_FAILSAFE');

  const hq = buildHqSnapshot(failsafeState);
  const summary = hq.sites.find((site) => site.id === 'alptech-hq');
  assertOk(summary);
  assertEqual(summary.failSafe, true);
  assertEqual(summary.urgentCount, 1);
  assertOk(Number.isFinite(summary.activeBays));
  assertOk(Number.isFinite(summary.currentBuildingKw));
  assertOk(Number.isFinite(summary.currentKw));

  const siteSnapshot = buildSiteSnapshot(failsafeState, 'alptech-hq');
  assertEqual(siteSnapshot.state.failSafe, true);
  assertEqual(siteSnapshot.sim.vehicles.length, 28);
  const maxAllocation = Math.max(
    ...siteSnapshot.sim.vehicles.flatMap((vehicle) => vehicle.allocKw),
  );
  assertOk(
    maxAllocation <= 3.7 + 0.01,
    `fail-safe allocation ${maxAllocation} kW exceeds 3.7 kW`,
  );
});

check('site snapshots keep full authorised per-vehicle detail', () => {
  const state = createInitialRoomState('verify-site');
  const snapshot = buildSiteSnapshot(state, 'alptech-hq');
  assertEqual(snapshot.site.fleet.length, 28);
  assertEqual(snapshot.sim.vehicles.length, 28);
  assertEqual(snapshot.sim.vehicles[0].allocKw.length, 56);
});

// 7. Launcher supply & routing toggles.
check('SITE_SET_ONLINE isolates and re-energizes a building', () => {
  const initial = createInitialRoomState('verify-online');
  assertEqual(initial.serverOnline, true);
  assertEqual(initial.sites['alptech-hq'].online, true);

  const before = buildHqSnapshot(initial);
  const beforeSummary = before.sites.find((site) => site.id === 'alptech-hq');
  assertOk(beforeSummary, 'missing alptech-hq summary');
  assertEqual(beforeSummary.online, true);
  assertEqual(beforeSummary.currentKw, 412);

  const isolated = applyAction(initial, {
    type: 'SITE_SET_ONLINE',
    siteId: 'alptech-hq',
    enabled: false,
  });
  assertEqual(isolated.sites['alptech-hq'].online, false);
  assertEqual(isolated.auditLog.at(-1)?.action, 'SITE_SET_ONLINE');

  const off = buildHqSnapshot(isolated);
  const offSummary = off.sites.find((site) => site.id === 'alptech-hq');
  assertOk(offSummary, 'missing alptech-hq summary after isolation');
  assertEqual(offSummary.online, false);
  assertEqual(offSummary.currentKw, 0);
  assertEqual(offSummary.currentEvKw, 0);
  assertEqual(offSummary.currentSolarKw, 0);
  assertEqual(offSummary.currentBuildingKw, 0);
  assertEqual(offSummary.activeBays, 0);
  assertEqual(offSummary.peakKw, 0);
  assertEqual(offSummary.breaching, false);
  assertEqual(offSummary.dailySavingEur, 0);
  assertOk(
    off.substation.currentKw < before.substation.currentKw,
    `substation currentKw did not drop: ${off.substation.currentKw} vs ${before.substation.currentKw}`,
  );
  assertEqual(off.totals.currentKw, off.substation.currentKw);

  const offSiteSnapshot = buildSiteSnapshot(isolated, 'alptech-hq');
  assertEqual(offSiteSnapshot.serverOnline, true);
  assertEqual(offSiteSnapshot.state.online, false);
  assertEqual(offSiteSnapshot.sim.current.gridKw, 0);
  assertEqual(offSiteSnapshot.sim.current.activeBays, 0);
  assertEqual(offSiteSnapshot.sim.current.breaching, false);
  assertOk(offSiteSnapshot.sim.peakKw > 0, 'planning curves should stay computable');

  const restored = applyAction(isolated, {
    type: 'SITE_SET_ONLINE',
    siteId: 'alptech-hq',
    enabled: true,
  });
  assertEqual(restored.sites['alptech-hq'].online, true);

  const on = buildHqSnapshot(restored);
  const onSummary = on.sites.find((site) => site.id === 'alptech-hq');
  assertOk(onSummary, 'missing alptech-hq summary after re-energize');
  assertEqual(onSummary.online, true);
  assertEqual(onSummary.currentKw, 412);
  assertEqual(on.substation.currentKw, before.substation.currentKw);
  assertEqual(on.totals.currentKw, before.totals.currentKw);
  assertEqual(on.totals.dailySavingEur, before.totals.dailySavingEur);
});

check('SET_SERVER_ONLINE parks the clock in standby', () => {
  let state = createInitialRoomState('verify-server');
  assertEqual(state.serverOnline, true);

  state = applyAction(state, { type: 'SET_CLOCK', playing: true });
  assertEqual(state.clock.playing, true);

  state = applyAction(state, { type: 'SET_SERVER_ONLINE', enabled: false });
  assertEqual(state.serverOnline, false);
  assertEqual(state.clock.playing, false);
  assertEqual(state.auditLog.at(-1)?.action, 'SET_SERVER_ONLINE');
  assertOk(state.auditLog.at(-1)?.message.includes('STANDBY'));

  const hq = buildHqSnapshot(state);
  assertEqual(hq.serverOnline, false);
  assertEqual(hq.clock.playing, false);

  const siteSnapshot = buildSiteSnapshot(state, 'alptech-hq');
  assertEqual(siteSnapshot.serverOnline, false);
  assertEqual(siteSnapshot.clock.playing, false);
  assertEqual(siteSnapshot.state.online, true);
  assertOk(siteSnapshot.sim.current.gridKw > 0, 'buildings stay individually energized');

  state = applyAction(state, { type: 'SET_SERVER_ONLINE', enabled: true });
  assertEqual(state.serverOnline, true);
  assertOk(state.auditLog.at(-1)?.message.includes('switched ON'));
});

// 8. Agentic electricity routing, guardian holds and targeted notifications.
check('RUN_AGENT_CYCLE reroutes alptech-hq and notifies only that building', () => {
  const initial = createInitialRoomState('verify-agent');
  assertEqual(initial.agenticRouting, true);
  assertEqual(initial.notifications.length, 0);

  const routed = applyAction(initial, { type: 'RUN_AGENT_CYCLE' });
  const alptech = routed.sites['alptech-hq'];
  assertEqual(alptech.optimized, true);
  assertEqual(alptech.planStatus, 'PENDING');

  const snap = buildSiteSnapshot(routed, 'alptech-hq');
  assertOk(snap.notifications.length > 0, 'alptech-hq received no notification');
  const notification = snap.notifications[snap.notifications.length - 1];
  assertEqual(notification.siteId, 'alptech-hq');
  assertEqual(notification.agentName, 'Grid Routing Agent');
  assertEqual(notification.severity, 'approval');
  assertEqual(notification.requiresApproval, true);
  assertEqual(notification.acknowledged, false);
  assertEqual(snap.agenticRouting, true);
  for (const entry of snap.notifications) {
    assertEqual(entry.siteId, 'alptech-hq', 'tenant isolation broken in site snapshot');
  }

  const sim = buildSiteSimulation(
    SITE_BY_ID['alptech-hq'],
    alptech,
    'sunny',
    routed.clock.slot,
  );
  assertOk(sim.peakKw <= 340, `optimized peak ${sim.peakKw} kW exceeds 340 kW`);
  assertOk(sim.peakKw < 412, `peak was not rerouted: ${sim.peakKw} kW`);

  // The AI-free control building is never touched and never notified.
  assertEqual(routed.sites['vercors-control'].aiEnabled, false);
  assertEqual(routed.sites['vercors-control'].optimized, false);
  assertEqual(buildSiteSnapshot(routed, 'vercors-control').notifications.length, 0);

  const hq = buildHqSnapshot(routed);
  assertEqual(hq.agenticRouting, true);
  assertOk(hq.agentFeed.length >= 1, 'HQ agent feed is empty');
  assertEqual(JSON.stringify(hq.agentFeed).includes('EV-'), false, 'agent feed leaks vehicle ids');
  const alptechSummary = hq.sites.find((site) => site.id === 'alptech-hq');
  const vercorsSummary = hq.sites.find((site) => site.id === 'vercors-control');
  assertOk(alptechSummary, 'missing alptech-hq summary');
  assertOk(vercorsSummary, 'missing vercors-control summary');
  assertEqual(alptechSummary.unreadNotifications, 1);
  assertEqual(vercorsSummary.unreadNotifications, 0);

  // A second cycle is idempotent: the unread notification is not duplicated.
  const rerun = applyAction(routed, { type: 'RUN_AGENT_CYCLE' });
  assertEqual(
    buildSiteSnapshot(rerun, 'alptech-hq').notifications.length,
    snap.notifications.length,
  );
});

check('RUN_AGENT_CYCLE can target a single building', () => {
  const initial = createInitialRoomState('verify-agent-target');
  const routed = applyAction(initial, {
    type: 'RUN_AGENT_CYCLE',
    siteId: 'alptech-hq',
  });
  assertEqual(routed.sites['alptech-hq'].optimized, true);
  assertEqual(routed.sites['isere-rd'].optimized, false);
  assertEqual(buildSiteSnapshot(routed, 'alptech-hq').notifications.length, 1);
  assertEqual(buildSiteSnapshot(routed, 'isere-rd').notifications.length, 0);
});

check('guardian agent holds infeasible reroutes for manager review', () => {
  const state = applyAction(createInitialRoomState('verify-guardian'), {
    type: 'SET_SCENARIO',
    scenario: 'unexpected',
  });
  const snap = buildSiteSnapshot(state, 'dauphine-cloud');
  const held = snap.notifications.filter(
    (entry) => entry.agentName === 'Guardian Agent' && entry.severity === 'guardian',
  );
  assertOk(held.length > 0, 'guardian hold notification missing for dauphine-cloud');
  assertEqual(held[held.length - 1].siteId, 'dauphine-cloud');
  assertEqual(held[held.length - 1].requiresApproval, true);
  assertEqual(state.sites['dauphine-cloud'].planStatus, 'PENDING');
});

check('ACK_NOTIFICATION and SITE_APPROVE acknowledge building notifications', () => {
  let state = applyAction(createInitialRoomState('verify-ack'), {
    type: 'RUN_AGENT_CYCLE',
  });
  const notification = buildSiteSnapshot(state, 'alptech-hq').notifications.at(-1);
  assertOk(notification, 'no notification to acknowledge');

  state = applyAction(state, {
    type: 'ACK_NOTIFICATION',
    siteId: 'alptech-hq',
    notificationId: notification.id,
  });
  assertEqual(
    state.notifications.find((entry) => entry.id === notification.id)?.acknowledged,
    true,
  );
  const hq = buildHqSnapshot(state);
  assertEqual(hq.sites.find((site) => site.id === 'alptech-hq')?.unreadNotifications, 0);

  // Approving a plan closes every remaining open notification for the site.
  state = applyAction(createInitialRoomState('verify-ack-approve'), {
    type: 'RUN_AGENT_CYCLE',
  });
  const openBefore = state.notifications.filter(
    (entry) => entry.siteId === 'alptech-hq' && !entry.acknowledged,
  ).length;
  assertOk(openBefore > 0, 'expected open notifications before approval');
  state = applyAction(state, { type: 'SITE_APPROVE', siteId: 'alptech-hq' });
  assertEqual(
    state.notifications.filter(
      (entry) => entry.siteId === 'alptech-hq' && !entry.acknowledged,
    ).length,
    0,
  );
  assertEqual(state.sites['alptech-hq'].planStatus, 'APPROVED');
});

check('SET_SCENARIO auto-triggers the agentic cycle only when routing is enabled', () => {
  let state = createInitialRoomState('verify-auto-cycle');
  state = applyAction(state, { type: 'SET_SCENARIO', scenario: 'unexpected' });
  const snap = buildSiteSnapshot(state, 'alptech-hq');
  assertEqual(snap.scenario, 'unexpected');
  assertOk(snap.notifications.length > 0, 'auto-cycle produced no notification');
  assertEqual(state.sites['alptech-hq'].optimized, true);

  let off = applyAction(createInitialRoomState('verify-auto-off'), {
    type: 'SET_AGENTIC_ROUTING',
    enabled: false,
  });
  assertEqual(off.agenticRouting, false);
  off = applyAction(off, { type: 'SET_SCENARIO', scenario: 'unexpected' });
  assertEqual(buildSiteSnapshot(off, 'alptech-hq').notifications.length, 0);
  assertEqual(off.sites['alptech-hq'].optimized, false);
  const cycled = applyAction(off, { type: 'RUN_AGENT_CYCLE' });
  assertEqual(cycled.sites['alptech-hq'].optimized, false);
  assertEqual(buildSiteSnapshot(cycled, 'alptech-hq').notifications.length, 0);
});

check('SITE_SET_SELL_TO_GRID exports surplus power cleanly with GDPR isolation', () => {
  let state = createInitialRoomState('verify-sell-to-grid');
  const before = buildSiteSnapshot(state, 'alptech-hq').sim.current;
  assertEqual(before.exportKw, 0);

  state = applyAction(state, {
    type: 'SITE_SET_SELL_TO_GRID',
    siteId: 'alptech-hq',
    enabled: true,
  });
  const after = buildSiteSnapshot(state, 'alptech-hq');
  assertOk(after.sim.current.exportKw > 0, 'expected positive exportKw after enabling sellToGrid');
  assertOk(after.sim.dailyExportRevenueEur > 0, 'expected positive export revenue');
  assertOk(after.sim.current.gridKw < before.gridKw, 'net grid draw should drop during export');

  const hqJson = JSON.stringify(buildHqSnapshot(state));
  assertOk(!hqJson.includes('allocKw'), 'HQ snapshot leaked allocKw');
  assertOk(!hqJson.includes('"vehicles"'), 'HQ snapshot leaked vehicles');
  assertOk(!hqJson.includes('EV-01'), 'HQ snapshot leaked EV-01');
});

console.log(`\n${checks - failures.length}/${checks} checks passed.`);
if (failures.length > 0) {
  throw new Error(`Failed checks: ${failures.join(', ')}`);
}
