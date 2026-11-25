import type {
  PriorityLevel,
  ScenarioKey,
  SiteConfig,
  SiteControlState,
  VehicleConfig,
  VehicleSession,
} from './types';
import type { SiteProfile } from './profiles';
import { DT, N, clamp, round1, round2, slotToTime, timeToSlot } from './time';

export type PlanMode = 'baseline' | 'optimized' | 'failsafe';

export interface PlanResult {
  mode: PlanMode;
  ev: number[];
  grid: number[];
  alloc: number[][];
  sessions: VehicleSession[];
  peakKw: number;
  readyPct: number;
  readyCount: number;
  deliveredKwh: number;
  solarUsedKwh: number;
  shiftedKwh: number;
}

interface EffectiveVehicle {
  vehicle: VehicleConfig;
  isUrgent: boolean;
  priority: PriorityLevel;
  targetSoc: number;
  needKwh: number;
  windowSlots: number[];
}

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  Urgent: 0,
  High: 1,
  Normal: 2,
  Low: 3,
};

/** Maximum AC power any single charger can deliver, kW. */
const MAX_CHARGER_KW = 22;

const BASELINE_MARGIN: Record<ScenarioKey, number> = {
  sunny: 62,
  cloudy: 76,
  cold: 70,
  occ80: 55,
  unexpected: 98,
};

const OPTIMIZED_MARGIN: Record<ScenarioKey, number> = {
  sunny: 20,
  cloudy: 12,
  cold: 16,
  occ80: 14,
  unexpected: 8,
};

const BASELINE_SHAPE = [
  0, 0, 0, 0,
  0.10, 0.30, 0.50, 0.68, 0.82, 0.90, 0.95, 0.98, 0.995,
  1.0,
  0.96, 0.88, 0.78, 0.66, 0.54, 0.42, 0.32, 0.24, 0.17, 0.12, 0.08, 0.05, 0.03, 0.01,
];

function emptyMatrix(count: number): number[][] {
  return Array.from({ length: count }, () => new Array<number>(N).fill(0));
}

function parseWindow(label: string): [number, number] | null {
  const match = label.match(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  return [timeToSlot(match[1]), timeToSlot(match[2])];
}

function baselineShape(): number[] {
  const shape = new Array<number>(N).fill(0);
  for (let i = 0; i < BASELINE_SHAPE.length; i += 1) shape[i] = BASELINE_SHAPE[i];
  return shape;
}

function effectiveVehicles(
  site: SiteConfig,
  control: SiteControlState,
  mode: PlanMode,
): EffectiveVehicle[] {
  const minCharge = clamp(control.minCharge, 50, 100);

  return site.fleet.map((vehicle) => {
    const override = control.overrides[vehicle.id];
    const urgent = control.urgentIds.includes(vehicle.id) || vehicle.isUrgent;
    const priority: PriorityLevel = urgent
      ? 'Urgent'
      : override?.priority ?? vehicle.basePrio;

    let targetSoc = vehicle.targetSoc;
    let needKwh = vehicle.needKwh;

    if (mode === 'optimized') {
      targetSoc = urgent ? 100 : Math.max(vehicle.targetSoc, minCharge);
      needKwh = Math.max(0, ((targetSoc - vehicle.soc) / 100) * vehicle.bat);
      if (override?.energyKwh != null) {
        const capacity = ((100 - vehicle.soc) / 100) * vehicle.bat;
        needKwh = clamp(override.energyKwh, 0, capacity);
        targetSoc = Math.min(100, vehicle.soc + (needKwh / vehicle.bat) * 100);
      }
    }

    let slots: number[] = [];
    for (let i = vehicle.a; i < vehicle.d; i += 1) slots.push(i);

    if (override?.window && !urgent) {
      const parsed = parseWindow(override.window);
      if (parsed) {
        const [start, end] = parsed;
        slots = slots.filter((slot) => slot >= start && slot < end);
      }
    }

    return {
      vehicle,
      isUrgent: urgent,
      priority,
      targetSoc: round1(targetSoc),
      needKwh: round1(needKwh),
      windowSlots: slots,
    };
  });
}

function sortForMode(vehicles: EffectiveVehicle[], mode: PlanMode, priorityMode: SiteControlState['priorityMode']): EffectiveVehicle[] {
  return vehicles.slice().sort((a, b) => {
    if (mode === 'optimized' && priorityMode === 'high') {
      return (
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.vehicle.d - b.vehicle.d ||
        b.needKwh - a.needKwh ||
        a.vehicle.id.localeCompare(b.vehicle.id)
      );
    }
    if (mode === 'optimized' && priorityMode === 'fair') {
      return (
        a.vehicle.soc - b.vehicle.soc ||
        a.vehicle.d - b.vehicle.d ||
        b.needKwh - a.needKwh ||
        a.vehicle.id.localeCompare(b.vehicle.id)
      );
    }
    return (
      a.vehicle.d - b.vehicle.d ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.needKwh - a.needKwh ||
      a.vehicle.id.localeCompare(b.vehicle.id)
    );
  });
}

function sessionsFromAllocation(
  site: SiteConfig,
  profile: SiteProfile,
  effective: EffectiveVehicle[],
  alloc: number[][],
  mode: PlanMode,
  targetPeak: number,
  peakKw: number,
): VehicleSession[] {
  const totalEv = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i += 1) {
    totalEv[i] = alloc.reduce((sum, row) => sum + row[i], 0);
  }
  const totalGrid = profile.baseNet.map((value, i) => Math.max(0, value + totalEv[i]));

  return effective.map((item, index) => {
    const raw = alloc[index];
    const deliveredExact = raw.reduce((sum, value) => sum + value, 0) * DT;
    const deliveredKwh = round1(deliveredExact);
    const finalSoc = round1(Math.min(100, item.vehicle.soc + (deliveredExact / item.vehicle.bat) * 100));
    const blocks: number[] = [];
    let solarKwh = 0;
    let deliveredSolarKwh = 0;

    for (let i = 0; i < N; i += 1) {
      if (raw[i] <= 0.01) continue;
      blocks.push(i);
      const solarShare = Math.min(1, profile.solar[i] / Math.max(0.001, totalEv[i]));
      deliveredSolarKwh += raw[i] * DT * solarShare;
      solarKwh += raw[i] * DT;
    }

    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    const windowLabel = first == null
      ? '—'
      : `${slotToTime(first)}–${slotToTime(Math.min(N - 1, last + 1))}`;

    const minHeadroomKw = blocks.length > 0
      ? round1(Math.min(...blocks.map((i) => site.capKw - totalGrid[i])))
      : round1(site.capKw - peakKw);

    const maxAlloc = blocks.length > 0 ? Math.max(...blocks.map((i) => raw[i])) : 0;
    const minBuilding = blocks.length > 0 ? Math.min(...blocks.map((i) => profile.building[i])) : 0;
    const maxSolar = blocks.length > 0 ? Math.max(...blocks.map((i) => profile.solar[i])) : 0;
    // Compare exact delivered energy with the rounded requirement. This keeps
    // readiness honest while avoiding false 79.9%-vs-80% shortfalls caused by
    // one-decimal display rounding.
    const ready = deliveredExact + 0.05 >= item.needKwh;

    let explanation: string;
    if (mode === 'failsafe') {
      explanation = `Edge fail-safe active: charging is capped at 3.7 kW per bay until HQ reconnects. Expected ${finalSoc}% by ${item.vehicle.dep}.`;
    } else if (mode === 'baseline') {
      explanation = ready
        ? `Uncoordinated baseline: plugged in at ${item.vehicle.arr} and charged at up to 22 kW until the session target. Ready at ${finalSoc}% for departure ${item.vehicle.dep}. Run Grid-Sense to move this load into cheaper, lower-carbon hours.`
        : `Uncoordinated baseline: plugged in at ${item.vehicle.arr} and charged on a first-come basis. Only ${finalSoc}% is available at departure ${item.vehicle.dep}; Grid-Sense can protect this session.`;
    } else if (item.isUrgent) {
      explanation = `Urgent trip priority: charging ${windowLabel} at up to ${round1(maxAlloc)} kW so this vehicle reaches ${item.targetSoc}% before departure ${item.vehicle.dep}. The site cap is protected by curtailing flexible sessions.`;
    } else if (blocks.length > 0) {
      explanation = `Charging ${windowLabel} because site demand is low (${round1(minBuilding)} kW) and solar peaks at ${round1(maxSolar)} kW. This keeps the site at or below ${round1(targetPeak)} kW while reaching ${item.targetSoc}% by ${item.vehicle.dep}.`;
    } else {
      explanation = `No charge scheduled: building demand already consumes the ${site.capKw} kW site cap, so this flexible session is held to protect the feeder. It will be reconsidered as headroom returns.`;
    }

    return {
      ...item.vehicle,
      prio: item.priority,
      isUrgent: item.isUrgent,
      targetSoc: item.targetSoc,
      needKwh: item.needKwh,
      finalSoc,
      deliveredKwh: round1(deliveredKwh),
      ready,
      blocks,
      windowLabel,
      allocKw: raw.map((value) => round2(value)),
      explanation,
      solarSharePct: solarKwh > 0 ? Math.round((deliveredSolarKwh / solarKwh) * 100) : 0,
      minHeadroomKw,
    };
  });
}

function summarize(
  mode: PlanMode,
  profile: SiteProfile,
  effective: EffectiveVehicle[],
  alloc: number[][],
  sessions: VehicleSession[],
): PlanResult {
  const ev = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i += 1) {
    ev[i] = alloc.reduce((sum, row) => sum + row[i], 0);
  }
  const grid = profile.baseNet.map((value, i) => Math.max(0, value + ev[i]));
  const peakKw = Math.round(Math.max(...grid));
  const readyCount = sessions.filter((session) => session.ready).length;
  const readyPct = Math.round((readyCount / Math.max(1, sessions.length)) * 100);
  const deliveredKwh = sessions.reduce((sum, session) => sum + session.deliveredKwh, 0);

  let solarUsedKwh = 0;
  let shiftedKwh = 0;
  for (let i = 0; i < N; i += 1) {
    solarUsedKwh += Math.min(ev[i], profile.solar[i]) * DT;
    if (profile.solar[i] > 1) shiftedKwh += ev[i] * DT;
  }

  return {
    mode,
    ev,
    grid,
    alloc,
    sessions,
    peakKw,
    readyPct,
    readyCount,
    deliveredKwh: round1(deliveredKwh),
    solarUsedKwh: round1(solarUsedKwh),
    shiftedKwh: round1(shiftedKwh),
  };
}

function allocateByProfile(
  profileEv: number[],
  effective: EffectiveVehicle[],
  mode: PlanMode,
  priorityMode: SiteControlState['priorityMode'],
): number[][] {
  const alloc = emptyMatrix(effective.length);
  const remaining = effective.map((item) => item.needKwh);
  const order = sortForMode(effective, mode, priorityMode);
  const orderIndex = new Map(order.map((item, index) => [item.vehicle.id, index]));

  for (let slot = 0; slot < N; slot += 1) {
    let available = profileEv[slot];
    if (available <= 0.001) continue;

    const eligible = effective
      .filter((item) => item.windowSlots.includes(slot))
      .sort((a, b) => (orderIndex.get(a.vehicle.id) ?? 0) - (orderIndex.get(b.vehicle.id) ?? 0));

    for (const item of eligible) {
      if (available <= 0.001) break;
      const index = effective.indexOf(item);
      const left = remaining[index];
      if (left <= 0.001) continue;
      const power = Math.min(MAX_CHARGER_KW, available);
      const energy = Math.min(left, power * DT);
      if (energy <= 0.001) continue;
      const kw = energy / DT;
      alloc[index][slot] += kw;
      remaining[index] -= energy;
      available -= kw;
    }
  }

  return alloc;
}

export function planBaseline(
  site: SiteConfig,
  profile: SiteProfile,
  scenario: ScenarioKey,
  control: SiteControlState,
): PlanResult {
  const effective = effectiveVehicles(site, control, 'baseline');
  const targetPeak = site.capKw + BASELINE_MARGIN[scenario];
  const peakSlot = 13; // 09:15
  const peakEv = Math.max(0, targetPeak - profile.baseNet[peakSlot]);
  const shape = baselineShape();

  const totalNeed = effective.reduce((sum, item) => sum + item.needKwh, 0);
  const desiredKwh = totalNeed * 0.9;
  const desiredSum = peakEv > 0 ? desiredKwh / (peakEv * DT) : 0;
  const shapeSum = shape.reduce((sum, value) => sum + value, 0);
  const nonPeakSum = shapeSum - 1;

  let scale = 1;
  if (nonPeakSum > 0 && desiredSum > 0) {
    scale = (desiredSum - 1) / nonPeakSum;
    scale = Math.max(0, Math.min(4, scale));
  }

  for (let i = 0; i < N; i += 1) {
    if (i === peakSlot) {
      shape[i] = 1;
      continue;
    }
    const headroom = Math.max(0, targetPeak - 1 - profile.baseNet[i]);
    const capShape = peakEv > 0 ? headroom / peakEv : 0;
    shape[i] = Math.max(0, Math.min(shape[i] * scale, capShape));
  }

  const profileEv = shape.map((value) => value * peakEv);
  profileEv[peakSlot] = peakEv;

  const alloc = allocateByProfile(profileEv, effective, 'baseline', control.priorityMode);
  const sessions = sessionsFromAllocation(site, profile, effective, alloc, 'baseline', targetPeak, 0);
  const result = summarize('baseline', profile, effective, alloc, sessions);

  return {
    ...result,
    sessions: sessionsFromAllocation(site, profile, effective, alloc, 'baseline', targetPeak, result.peakKw),
  };
}

export function planOptimized(
  site: SiteConfig,
  profile: SiteProfile,
  scenario: ScenarioKey,
  control: SiteControlState,
): PlanResult {
  const effective = effectiveVehicles(site, control, 'optimized');
  const siteCap = Math.max(50, Math.min(site.capKw, control.maxSiteKw || site.capKw));
  const targetPeak = Math.max(0, siteCap - OPTIMIZED_MARGIN[scenario]);
  const usableBays = Math.max(1, Math.round(site.totalBays * (scenario === 'occ80' ? 0.8 : 1)));
  const bayLimit = usableBays * MAX_CHARGER_KW;
  const order = sortForMode(effective, 'optimized', control.priorityMode);
  const orderIndex = new Map(order.map((item, index) => [item.vehicle.id, index]));
  const alloc = emptyMatrix(effective.length);
  const used = new Array<number>(N).fill(0);
  const remaining = effective.map((item) => item.needKwh);

  const allocate = (index: number, slot: number, ceiling: number): void => {
    const left = remaining[index];
    if (left <= 0.001) return;
    const siteRoom = Math.max(0, ceiling - profile.baseNet[slot] - used[slot]);
    const bayRoom = Math.max(0, bayLimit - used[slot]);
    // Pass 1 and pass 2 both call this helper. The charger room check is what
    // prevents a second pass from stacking a second 22 kW on the same bay.
    const chargerRoom = Math.max(0, MAX_CHARGER_KW - alloc[index][slot]);
    const power = Math.min(chargerRoom, siteRoom, bayRoom);
    if (power <= 0.001) return;
    const energy = Math.min(left, power * DT);
    if (energy <= 0.001) return;
    const kw = energy / DT;
    alloc[index][slot] += kw;
    used[slot] += kw;
    remaining[index] -= energy;
  };

  const orderedIndices = effective
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (orderIndex.get(a.item.vehicle.id) ?? 0) - (orderIndex.get(b.item.vehicle.id) ?? 0));

  // Pass 1: stay inside the AI target ceiling, preferring low net-load slots.
  for (const { item, index } of orderedIndices) {
    const slots = item.windowSlots
      .slice()
      .sort((a, b) => profile.baseNet[a] - profile.baseNet[b] || a - b);
    for (const slot of slots) {
      if (remaining[index] <= 0.001) break;
      allocate(index, slot, targetPeak);
    }
  }

  // Pass 2: if readiness is still short, use the remaining room up to the
  // manager/site cap. This never exceeds the hard site cap.
  for (const { item, index } of orderedIndices) {
    if (remaining[index] <= 0.001) continue;
    const slots = item.windowSlots
      .slice()
      .sort((a, b) => (siteCap - profile.baseNet[b] - used[b]) - (siteCap - profile.baseNet[a] - used[a]) || a - b);
    for (const slot of slots) {
      if (remaining[index] <= 0.001) break;
      allocate(index, slot, siteCap);
    }
  }

  const sessions = sessionsFromAllocation(site, profile, effective, alloc, 'optimized', targetPeak, 0);
  const result = summarize('optimized', profile, effective, alloc, sessions);

  return {
    ...result,
    sessions: sessionsFromAllocation(site, profile, effective, alloc, 'optimized', targetPeak, result.peakKw),
  };
}

export function planFailsafe(
  site: SiteConfig,
  profile: SiteProfile,
  control: SiteControlState,
): PlanResult {
  const effective = effectiveVehicles(site, control, 'failsafe');
  const alloc = emptyMatrix(effective.length);
  const remaining = effective.map((item) => item.needKwh);
  const usableBays = Math.max(1, Math.round(site.totalBays * 0.8));
  const bayLimit = usableBays * 3.7;

  for (let index = 0; index < effective.length; index += 1) {
    const item = effective[index];
    for (const slot of item.windowSlots) {
      if (remaining[index] <= 0.001) break;
      const room = Math.max(0, bayLimit - alloc.reduce((sum, row) => sum + row[slot], 0));
      const power = Math.min(3.7, room);
      if (power <= 0.001) continue;
      const energy = Math.min(remaining[index], power * DT);
      alloc[index][slot] += energy / DT;
      remaining[index] -= energy;
    }
  }

  const sessions = sessionsFromAllocation(site, profile, effective, alloc, 'failsafe', site.capKw, 0);
  const result = summarize('failsafe', profile, effective, alloc, sessions);

  return {
    ...result,
    sessions: sessionsFromAllocation(site, profile, effective, alloc, 'failsafe', site.capKw, result.peakKw),
  };
}

export function optimizedTargetPeak(
  site: SiteConfig,
  scenario: ScenarioKey,
  control: SiteControlState,
): number {
  const siteCap = Math.max(50, Math.min(site.capKw, control.maxSiteKw || site.capKw));
  return Math.max(0, siteCap - OPTIMIZED_MARGIN[scenario]);
}
