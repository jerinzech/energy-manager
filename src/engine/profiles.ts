import type { ScenarioKey, SiteConfig } from './types';
import { DT, N, slotToHour } from './time';

export interface ScenarioFactors {
  buildingScale: number;
  solarScale: number;
  addCold: number;
  addSpike: number;
  occupancy: number;
}

export interface SiteProfile {
  building: number[];
  solar: number[];
  /** building − solar; the load the EV plan sits on top of. */
  baseNet: number[];
  solarKwh: number;
}

const BUILDING_KEYS: Record<SiteConfig['id'], Array<[number, number]>> = {
  'alptech-hq': [
    [6, 130], [7, 150], [8, 175], [9, 195], [10, 210], [11, 225], [12, 235],
    [13, 240], [14, 230], [15, 215], [16, 200], [17, 180], [18, 160], [19, 140], [20, 125],
  ],
  'isere-rd': [
    [6, 95], [7, 110], [8, 125], [9, 150], [10, 180], [11, 195], [12, 205],
    [13, 210], [14, 215], [15, 205], [16, 190], [17, 170], [18, 145], [19, 120], [20, 105],
  ],
  'dauphine-cloud': [
    [6, 300], [7, 315], [8, 330], [9, 350], [10, 370], [11, 395], [12, 420],
    [13, 430], [14, 425], [15, 410], [16, 390], [17, 365], [18, 340], [19, 320], [20, 305],
  ],
  'vercors-control': [
    [6, 130], [7, 150], [8, 175], [9, 195], [10, 210], [11, 225], [12, 235],
    [13, 240], [14, 230], [15, 215], [16, 200], [17, 180], [18, 160], [19, 140], [20, 125],
  ],
  'chartreuse-annex': [
    [6, 85], [7, 95], [8, 110], [9, 120], [10, 125], [11, 130], [12, 135],
    [13, 140], [14, 135], [15, 125], [16, 115], [17, 105], [18, 95], [19, 85], [20, 80],
  ],
};

function interp(keys: Array<[number, number]>, hour: number): number {
  if (hour <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (hour >= last[0]) return last[1];

  for (let i = 0; i < keys.length - 1; i += 1) {
    const [h1, v1] = keys[i];
    const [h2, v2] = keys[i + 1];
    if (hour >= h1 && hour <= h2) {
      const t = (hour - h1) / (h2 - h1);
      return v1 + (v2 - v1) * t;
    }
  }
  return last[1];
}

export function scenarioFactors(scenario: ScenarioKey, siteId: SiteConfig['id']): ScenarioFactors {
  let buildingScale = 1;
  let solarScale = 1;
  let addCold = 0;
  let addSpike = 0;
  let occupancy = 1;

  if (scenario === 'cloudy') {
    buildingScale = 1.05;
    solarScale = 0.35;
  }
  if (scenario === 'cold') {
    solarScale = 0.8;
    addCold = siteId === 'dauphine-cloud' ? 65 : 45;
  }
  if (scenario === 'occ80') {
    occupancy = 0.8;
  }
  if (scenario === 'unexpected') {
    addSpike = 95;
  }

  return { buildingScale, solarScale, addCold, addSpike, occupancy };
}

/**
 * Build the deterministic building + solar profile for a site and scenario.
 * Solar is normalised so its integral is exactly `site.solarKwh × scale`.
 */
export function buildSiteProfile(site: SiteConfig, scenario: ScenarioKey): SiteProfile {
  const factors = scenarioFactors(scenario, site.id);
  const keys = BUILDING_KEYS[site.id];
  const building: number[] = [];
  const solarRaw: number[] = [];

  for (let i = 0; i < N; i += 1) {
    const hour = slotToHour(i);
    let load = interp(keys, hour) * factors.buildingScale;
    if (hour < 10) load += factors.addCold;
    if (hour >= 11 && hour <= 13) load += factors.addSpike;
    building.push(Math.max(0, load));

    const sun = hour >= 7 && hour <= 19
      ? Math.max(0, Math.sin(((hour - 7) / 12) * Math.PI))
      : 0;
    solarRaw.push(sun);
  }

  const solarTarget = site.solarKwh * factors.solarScale;
  const rawKwh = solarRaw.reduce((sum, value) => sum + value, 0) * DT;
  const solar = solarRaw.map((value) => (rawKwh > 0 ? (value / rawKwh) * solarTarget : 0));

  // Remove floating-point drift so `sum(solar) * DT` is exactly the target kWh.
  const lastSun = solar.reduce((last, value, index) => (value > 0 ? index : last), -1);
  if (lastSun >= 0) {
    const actualKwh = solar.reduce((sum, value) => sum + value, 0) * DT;
    solar[lastSun] += (solarTarget - actualKwh) / DT;
  }

  const baseNet = building.map((value, index) => value - solar[index]);
  const solarKwh = Math.round(solar.reduce((sum, value) => sum + value, 0) * DT);

  return { building, solar, baseNet, solarKwh };
}
