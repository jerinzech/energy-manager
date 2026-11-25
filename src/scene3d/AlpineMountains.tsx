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

const RANGES: RangeSpec[] = [
  // North: Chartreuse limestone massif (z ≈ -68)
  {
    id: 'chartreuse',
    axis: 'x',
    length: 224,
    depth: 46,
    center: [0, -68],
    maxHeight: 33,
    seed: 1.7,
    rockLow: '#475569',
    rockHigh: '#6c7a8e',
  },
  // East / Northeast: Belledonne snow-capped alpine chain (x ≈ 72, z ≈ -58..25+)
  {
    id: 'belledonne',
    axis: 'z',
    length: 146,
    depth: 46,
    center: [72, -16],
    maxHeight: 40,
    seed: 4.3,
    rockLow: '#435061',
    rockHigh: '#67768a',
  },
  // West: Vercors limestone escarpment cliffs (x ≈ -72)
  {
    id: 'vercors',
    axis: 'z',
    length: 142,
    depth: 44,
    center: [-72, -14],
    maxHeight: 30,
    seed: 7.9,
    rockLow: '#4b5666',
    rockHigh: '#6f7c8e',
  },
];

/** Deterministic multi-octave ridged alpine noise built from Math.abs(Math.sin(...)). */
function ridgedMultiOctave(u: number, v: number, seed: number): number {
  const warpX = Math.sin(u * 0.045 + seed) * 1.4 + Math.cos(v * 0.06 - seed) * 1.1;
  const warpZ = Math.cos(u * 0.04 - seed) * 1.4 + Math.sin(v * 0.05 + seed) * 1.1;
  const px = u * 0.048 + warpX * 0.35;
  const pz = v * 0.065 + warpZ * 0.35;

  let sum = 0;
  let amp = 0.55;
  let freq = 1.0;
  let norm = 0;

  for (let o = 0; o < 5; o++) {
    const waveA = Math.sin(px * freq + pz * freq * 0.72 + seed * (o + 1.3));
    const waveB = Math.sin(px * freq * 0.63 - pz * freq * 1.15 + seed * (o + 2.7));
    const rA = 1 - Math.abs(waveA);
    const rB = 1 - Math.abs(waveB);
    const ridge = Math.pow(0.55 * rA + 0.45 * rB, 1.55);
    sum += ridge * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }

  return sum / norm;
}

function buildRangeGeometry(spec: RangeSpec, isCold: boolean): THREE.BufferGeometry {
  const segLen = 120;
  const segDepth = 26;
  const geo = new THREE.PlaneGeometry(spec.length, spec.depth, segLen, segDepth);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  const pineLow = new THREE.Color('#193228');
  const pineHigh = new THREE.Color('#1e3a2f');
  const rockLow = new THREE.Color(spec.rockLow);
  const rockHigh = new THREE.Color(spec.rockHigh);
  const snowShadow = new THREE.Color('#e8f1fb');
  const snowPeak = new THREE.Color('#ffffff');
  const tmpColor = new THREE.Color();

  const snowline = isCold ? 12.5 : 16.5;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);

    // Map local (lx, lz) into world coordinates for consistent range placement.
    let wx: number;
    let wz: number;
    if (spec.axis === 'x') {
      wx = spec.center[0] + lx;
      wz = spec.center[1] + lz;
    } else {
      // Rotate 90 degrees so length runs along world Z and depth along world X.
      wx = spec.center[0] + lz;
      wz = spec.center[1] - lx;
    }

    // Normalized depth across the range [-1, 1] and longitudinal taper near ends.
    const uNorm = lx / (spec.length * 0.5);
    const vNorm = lz / (spec.depth * 0.5);
    const depthBell = Math.max(0, Math.cos(vNorm * Math.PI * 0.5));
    const endTaper = Math.max(0, Math.min(1, (1 - Math.abs(uNorm)) * 3.4));

    const ridge = ridgedMultiOctave(lx, lz, spec.seed);
    const crestBoost = 0.44 + 0.82 * Math.pow(ridge, 1.12);
    const rawH = spec.maxHeight * Math.pow(depthBell, 0.8) * endTaper * crestBoost;
    // Sink outer skirts slightly below ground plane (y = -0.35) to prevent gaps.
    const y = depthBell < 0.04 || endTaper < 0.04 ? -0.35 : rawH - 0.35;

    pos.setXYZ(i, wx, y, wz);

    // Elevation-driven vertex coloring with crisp alpine snow caps.
    const noiseShift = (ridge - 0.5) * 1.6;
    const hColor = y + noiseShift;

    if (y < 9) {
      const t = Math.max(0, Math.min(1, y / 9));
      tmpColor.lerpColors(pineLow, pineHigh, t);
      if (y > 6.8) {
        tmpColor.lerp(rockLow, ((y - 6.8) / 2.2) * 0.45);
      }
    } else if (hColor < snowline) {
      const t = Math.max(0, Math.min(1, (hColor - 9) / Math.max(1, snowline - 9)));
      tmpColor.lerpColors(rockLow, rockHigh, t);
    } else {
      const t = Math.max(0, Math.min(1, (hColor - snowline) / 4));
      tmpColor.lerpColors(snowShadow, snowPeak, t);
      if (y < snowline + 1.0) {
        tmpColor.lerp(rockHigh, Math.max(0, 1 - (y - snowline) / 1.0) * 0.25);
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
 * 3D sculpted Grenoble Alps valley panorama (Chartreuse, Belledonne, Vercors)
 * with elevation-based vertex coloring and snowline response to the cold scenario.
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
          <meshStandardMaterial vertexColors roughness={0.78} metalness={0.03} />
        </mesh>
      ))}
    </group>
  );
}
