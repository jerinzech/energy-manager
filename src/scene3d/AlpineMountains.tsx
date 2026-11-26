import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ScenarioKey } from '../engine';

export type AlpineMode = 'realistic' | 'wireframe';

export interface AlpineMountainsProps {
  mode: AlpineMode;
  scenario: ScenarioKey;
}

interface RangeSpec {
  id: string;
  axis: 'x' | 'z';
  length: number;
  depth: number;
  center: [number, number];
  maxHeight: number;
  seed: number;
  rockLow: string;
  rockHigh: string;
}

// Crisp high-resolution Grenoble alpine amphitheater (Chartreuse, Belledonne, Vercors)
const RANGES: RangeSpec[] = [
  // North: Chartreuse limestone massif rising cleanly behind the hillside solar farm
  {
    id: 'chartreuse',
    axis: 'x',
    length: 420,
    depth: 84,
    center: [0, -108],
    maxHeight: 58,
    seed: 1.7,
    rockLow: '#a3acb8',
    rockHigh: '#c4cbd4',
  },
  // East / Northeast: Belledonne snow-capped alpine chain
  {
    id: 'belledonne',
    axis: 'z',
    length: 250,
    depth: 66,
    center: [106, -16],
    maxHeight: 56,
    seed: 4.3,
    rockLow: '#9ea7b4',
    rockHigh: '#bfc7d1',
  },
  // West: Vercors limestone escarpment across the Isere river
  {
    id: 'vercors',
    axis: 'z',
    length: 245,
    depth: 64,
    center: [-108, -14],
    maxHeight: 45,
    seed: 7.9,
    rockLow: '#aab2bd',
    rockHigh: '#c9cfd8',
  },
];

/** Multi-octave ridged alpine noise with faceted limestone crests. */
function ridgedMultiOctave(u: number, v: number, seed: number): number {
  const warpX = Math.sin(u * 0.042 + seed) * 1.4 + Math.cos(v * 0.055 - seed) * 1.1;
  const warpZ = Math.cos(u * 0.038 - seed) * 1.4 + Math.sin(v * 0.048 + seed) * 1.1;
  const px = u * 0.045 + warpX * 0.38;
  const pz = v * 0.058 + warpZ * 0.38;

  let sum = 0;
  let amp = 0.56;
  let freq = 1.0;
  let norm = 0;

  for (let o = 0; o < 5; o++) {
    const waveA = Math.sin(px * freq + pz * freq * 0.72 + seed * (o + 1.3));
    const waveB = Math.sin(px * freq * 0.63 - pz * freq * 1.15 + seed * (o + 2.7));
    const rA = 1 - Math.abs(waveA);
    const rB = 1 - Math.abs(waveB);
    const ridge = Math.pow(0.55 * rA + 0.45 * rB, 1.7);
    sum += ridge * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.08;
  }

  return sum / norm;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function buildRangeGeometry(spec: RangeSpec, isCold: boolean): THREE.BufferGeometry {
  const segLen = 190;
  const segDepth = 44;
  const geo = new THREE.PlaneGeometry(spec.length, spec.depth, segLen, segDepth);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  // Apple Maps DCE topographic elevation palette
  const pineLow = new THREE.Color('#86ab7c');
  const pineHigh = new THREE.Color('#6f966a');
  const rockLow = new THREE.Color(spec.rockLow);
  const rockHigh = new THREE.Color(spec.rockHigh);
  const snowShadow = new THREE.Color('#eef4fb');
  const snowPeak = new THREE.Color('#ffffff');
  const tmpColor = new THREE.Color();

  const snowline = isCold ? 12 : 16;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);

    let wx: number;
    let wz: number;
    if (spec.axis === 'x') {
      wx = spec.center[0] + lx;
      wz = spec.center[1] + lz;
    } else {
      wx = spec.center[0] + lz;
      wz = spec.center[1] - lx;
    }

    const uNorm = lx / (spec.length * 0.5);
    const vNorm = lz / (spec.depth * 0.5);
    const depthBell = Math.max(0, Math.cos(vNorm * Math.PI * 0.5));
    const endTaper = Math.max(0, Math.min(1, (1 - Math.abs(uNorm)) * 3.4));

    const ridge = ridgedMultiOctave(lx, lz, spec.seed);
    const crestBoost = 0.4 + 0.9 * Math.pow(ridge, 1.08);
    const rawH = spec.maxHeight * Math.pow(depthBell, 0.78) * endTaper * crestBoost;
    let y = depthBell < 0.03 || endTaper < 0.03 ? -0.35 : rawH - 0.35;

    if (spec.id === 'chartreuse') {
      const inX = smoothstep(-30, -12, wx) * (1 - smoothstep(80, 98, wx));
      const inZ = 1 - smoothstep(-98, -85, wz);
      const cut = inX * inZ;
      if (cut > 0.001) {
        const bermCap = Math.max(-0.35, ((-51 - wz) / 3.5) * 1.9 - 1.6);
        y = THREE.MathUtils.lerp(y, Math.min(y, bermCap), cut);
      }
    }

    pos.setXYZ(i, wx, y, wz);

    const noiseShift = (ridge - 0.5) * 2.0;
    const hColor = y + noiseShift;

    if (y < 9.5) {
      const t = Math.max(0, Math.min(1, y / 9.5));
      tmpColor.lerpColors(pineLow, pineHigh, t);
      if (y > 7.0) {
        tmpColor.lerp(rockLow, ((y - 7.0) / 2.5) * 0.5);
      }
    } else if (hColor < snowline) {
      const t = Math.max(0, Math.min(1, (hColor - 9.5) / Math.max(1, snowline - 9.5)));
      tmpColor.lerpColors(rockLow, rockHigh, t);
    } else {
      const t = Math.max(0, Math.min(1, (hColor - snowline) / 4.2));
      tmpColor.lerpColors(snowShadow, snowPeak, t);
      if (y < snowline + 1.0) {
        tmpColor.lerp(rockHigh, Math.max(0, 1 - (y - snowline) / 1.0) * 0.22);
      }
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * High-resolution 3D sculpted Grenoble Alps valley panorama in Apple Maps
 * topographic styling (Chartreuse, Belledonne, Vercors).
 */
export function AlpineMountains({ mode, scenario }: AlpineMountainsProps) {
  const isCold = scenario === 'cold';

  const geometries = useMemo(
    () => RANGES.map((spec) => ({ id: spec.id, geo: buildRangeGeometry(spec, isCold) })),
    [isCold],
  );

  useEffect(
    () => () => {
      geometries.forEach((entry) => entry.geo.dispose());
    },
    [geometries],
  );

  if (mode === 'wireframe') {
    return (
      <group key="alpine-wireframe">
        {geometries.map(({ id, geo }) => (
          <group key={id}>
            <mesh geometry={geo}>
              <meshBasicMaterial
                color="#0b1120"
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
              />
            </mesh>
            <mesh geometry={geo}>
              <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.35} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  return (
    <group key="alpine-realistic">
      {geometries.map(({ id, geo }) => (
        <mesh key={id} geometry={geo} receiveShadow castShadow>
          <meshStandardMaterial vertexColors roughness={0.86} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}
