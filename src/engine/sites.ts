import type {
  PriorityLevel,
  ScenarioMeta,
  SiteConfig,
  VehicleConfig,
} from './types';
import { N, pad2, round1, timeToSlot } from './time';

export const MV_SUBSTATION = {
  name: "Grenoble Presqu'île MV Feeder",
  capKw: 1650,
} as const;

export const SCENARIOS: ScenarioMeta[] = [
  {
    key: 'sunny',
    label: 'Sunny day',
    desc: 'High solar generation; prioritize midday charging.',
    short: 'Sunny',
  },
  {
    key: 'cloudy',
    label: 'Cloudy day',
    desc: 'Low solar; shift charging to off-peak grid hours.',
    short: 'Cloudy',
  },
  {
    key: 'cold',
    label: 'Cold morning',
    desc: 'Higher building heating demand early; delay EV start.',
    short: 'Cold',
  },
  {
    key: 'occ80',
    label: '80% charger occupancy',
    desc: 'Reduced charger availability; longer queues.',
    short: '80% Occ',
  },
  {
    key: 'unexpected',
    label: 'Unexpected building peak',
    desc: 'Sudden demand spike midday; curtail EV charging.',
    short: 'Unexpected',
  },
];

const PRIORITIES: PriorityLevel[] = [
  'Normal',
  'High',
  'Normal',
  'High',
  'Normal',
  'Normal',
  'Low',
  'High',
  'Normal',
  'Normal',
  'High',
  'Normal',
];

const REP_ARRIVALS = [
  '07:30', '08:00', '08:15', '08:45', '09:00', '09:30',
  '10:00', '07:45', '08:30', '09:15', '08:00', '09:45',
];
const REP_DEPARTURES = [
  '16:30', '17:00', '17:30', '18:00', '16:00', '17:15',
  '18:30', '16:45', '17:45', '16:15', '18:15', '17:30',
];
const REP_ENERGY = [24, 30, 18, 42, 28, 36, 22, 33, 27, 19, 40, 25];
const REP_SOC = [30, 45, 60, 20, 50, 35, 70, 25, 55, 40, 30, 65];

function minutesToHHMM(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/**
 * Deterministic, anonymous fleet. No employee names, no attendance data.
 * The first 12 sessions of every site are representative teaching sessions.
 */
function makeFleet(count: number, siteId: SiteConfig['id'], seed: number): VehicleConfig[] {
  const fleet: VehicleConfig[] = [];

  for (let i = 0; i < count; i += 1) {
    const rep = i < 12;
    let arr: string;
    let dep: string;
    let req: number;
    let soc: number;
    let bat: number;
    let prio: PriorityLevel;

    if (siteId === 'alptech-hq' && rep) {
      arr = REP_ARRIVALS[i];
      dep = REP_DEPARTURES[i];
      req = REP_ENERGY[i];
      soc = REP_SOC[i];
      bat = 75 + ((i * 7 + seed) % 26);
      prio = PRIORITIES[i];
    } else {
      const arrivalMin = 7 * 60 + ((seed * 37 + i * 53) % 210); // 07:00–10:30
      const departureMin = 15 * 60 + 30 + ((seed * 19 + i * 47) % 180); // 15:30–18:30
      arr = minutesToHHMM(arrivalMin);
      dep = minutesToHHMM(departureMin);
      req = 16 + ((seed * 13 + i * 11) % 27); // 16–42 kWh
      soc = 20 + ((seed * 7 + i * 17) % 51); // 20–70 %
      bat = 70 + ((seed * 5 + i * 7) % 31); // 70–100 kWh
      prio = PRIORITIES[(i + seed) % PRIORITIES.length];
    }

    // Never request more energy than the battery can physically accept.
    const capacityKwh = ((100 - soc) / 100) * bat;
    const needKwh = Math.max(0, Math.min(req, Math.floor(capacityKwh)));
    const targetSoc = round1(Math.min(100, soc + (needKwh / bat) * 100));
    const arrivalSlot = timeToSlot(arr);
    const departureSlot = Math.max(arrivalSlot + 2, timeToSlot(dep));

    fleet.push({
      id: `EV-${pad2(i + 1)}`,
      charger: `C-${pad2(i + 1)}`,
      arr,
      dep,
      req: needKwh,
      soc,
      bat,
      prio,
      basePrio: prio,
      rep,
      isUrgent: false,
      lockMorning: departureSlot <= timeToSlot('16:30'),
      a: arrivalSlot,
      d: Math.min(N, departureSlot),
      needKwh,
      targetSoc,
    });
  }

  return fleet;
}

function siteConfig(
  id: SiteConfig['id'],
  name: string,
  role: string,
  isControl: boolean,
  defaultAiEnabled: boolean,
  capKw: number,
  evsConnected: number,
  totalBays: number,
  solarKwh: number,
  layout: SiteConfig['layout'],
  seed: number,
): SiteConfig {
  return {
    id,
    name,
    role,
    isControl,
    defaultAiEnabled,
    capKw,
    evsConnected,
    totalBays,
    solarKwh,
    layout,
    seed,
    fleet: makeFleet(evsConnected, id, seed),
  };
}

export const SITES: SiteConfig[] = [
  siteConfig(
    'alptech-hq',
    'AlpTech Innovation HQ',
    'Pilot AI',
    false,
    true,
    350,
    28,
    35,
    186,
    { x: -20, z: -12, w: 12, h: 10, d: 9, shape: 'L', canopyOffset: [0, 9] },
    3,
  ),
  siteConfig(
    'isere-rd',
    'Isère R&D Software Lab',
    'Active AI',
    false,
    true,
    280,
    22,
    28,
    145,
    { x: 2, z: -14, w: 10, h: 8, d: 8, shape: 'rect', canopyOffset: [0, 8] },
    11,
  ),
  siteConfig(
    'dauphine-cloud',
    'Dauphiné Cloud & Data Ops',
    'High-Peak AI',
    false,
    true,
    480,
    32,
    40,
    210,
    { x: 22, z: -8, w: 13, h: 12, d: 10, shape: 'tower', canopyOffset: [0, 10] },
    // Calibrated seed: the 32-session fleet must fit the 480 kW site cap while
    // every session reaches the 80% minimum departure SoC at 22 kW per bay.
    58,
  ),
  siteConfig(
    'vercors-control',
    'Vercors Engineering Hub',
    'Control (No AI)',
    true,
    false,
    350,
    26,
    34,
    175,
    { x: -12, z: 14, w: 11, h: 8, d: 8, shape: 'twin', canopyOffset: [0, 8] },
    31,
  ),
  siteConfig(
    'chartreuse-annex',
    'Chartreuse Campus Annex',
    'Scale Site AI',
    false,
    true,
    220,
    16,
    20,
    120,
    { x: 14, z: 14, w: 9, h: 6, d: 7, shape: 'rect', canopyOffset: [0, 7] },
    41,
  ),
];

export const SITE_BY_ID: Record<SiteConfig['id'], SiteConfig> = Object.fromEntries(
  SITES.map((site) => [site.id, site]),
) as Record<SiteConfig['id'], SiteConfig>;

export const PILOT_SITE_ID = 'alptech-hq' as const;
export const CONTROL_SITE_ID = 'vercors-control' as const;
