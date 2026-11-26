import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { HqSiteSummary, SiteId, SubstationSummary } from '../engine';
import { C, siteStatus } from './BuildingMesh';
import type { BuildingVisualMode } from './BuildingMesh';
import { SOLAR_FARM_RELAY_POS } from './MountainSolarFarm';
import { getGravelPadTexture } from './textures';

export interface SubstationConduitsProps {
  sites: HqSiteSummary[];
  substation: SubstationSummary;
  serverOnline?: boolean;
  visualMode?: BuildingVisualMode;
}

const SUBSTATION_POS: [number, number, number] = [0, 0, 2];
const WEST_RELAY_POS: [number, number, number] = [-24, 0, 1.8];
const EAST_RELAY_POS: [number, number, number] = [20, 0, 1.8];

type Waypoint = [number, number, number];
type BlobMode = 'supply' | 'export' | 'breach';

// Orthogonal road-aligned feeder trunk from Mountain Solar Farm Relay -> Central MV Substation
const SOLAR_TRUNK_PATH: Waypoint[] = [
  [SOLAR_FARM_RELAY_POS[0], 0.3, SOLAR_FARM_RELAY_POS[2]],
  [38, 0.3, -46],
  [40, 0.3, -46],
  [40, 0.3, 8.2],
  [0, 0.3, 8.2],
  [0, 0.3, 2],
];

// Road-aligned sector feeder trunks from Central Substation -> West & East Sector Relays
const WEST_TRUNK_PATH: Waypoint[] = [
  [0, 0.3, 2],
  [0, 0.3, 8.2],
  [-24, 0.3, 8.2],
  [-24, 0.3, 1.8],
];

const EAST_TRUNK_PATH: Waypoint[] = [
  [0, 0.3, 2],
  [0, 0.3, 8.2],
  [20, 0.3, 8.2],
  [20, 0.3, 1.8],
];

// Orthogonal road-aligned paths from each sector relay to its campus building
const SITE_PATHS: Record<SiteId, Waypoint[]> = {
  'alptech-hq': [
    [-24, 0.28, 1.8],
    [-24, 0.28, -4.5],
    [-20, 0.28, -4.5],
    [-20, 0.28, -12],
  ],
  'vercors-control': [
    [-24, 0.28, 1.8],
    [-24, 0.28, 8.2],
    [-12, 0.28, 8.2],
    [-12, 0.28, 14],
  ],
  'isere-rd': [
    [0, 0.28, 2],
    [-9.5, 0.28, 2],
    [-9.5, 0.28, -5.8],
    [2, 0.28, -5.8],
    [2, 0.28, -14],
  ],
  'dauphine-cloud': [
    [20, 0.28, 1.8],
    [20, 0.28, -1.5],
    [22, 0.28, -1.5],
    [22, 0.28, -8],
  ],
  'chartreuse-annex': [
    [20, 0.28, 1.8],
    [20, 0.28, 8.2],
    [14, 0.28, 8.2],
    [14, 0.28, 14],
  ],
};

function samplePolyline(pts: THREE.Vector3[], cum: number[], total: number, t: number, out: THREE.Vector3) {
  const target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < pts.length - 1; i++) {
    const start = cum[i];
    const end = cum[i + 1];
    if (target <= end || i === pts.length - 2) {
      const span = Math.max(0.0001, end - start);
      const localT = (target - start) / span;
      out.lerpVectors(pts[i], pts[i + 1], Math.max(0, Math.min(1, localT)));
      return;
    }
  }
}

/**
 * Multi-layer glowing neon energy blob travelling at constant speed along
 * road-following waypoints. Green = grid/solar supply; cyan-emerald =
 * building selling power back to the grid; coral-red = cap breach.
 */
function NeonPowerBlob({
  waypoints,
  energized,
  mode = 'supply',
  intensity = 0.7,
  offset = 0,
  size = 1.0,
}: {
  waypoints: Waypoint[];
  energized: boolean;
  mode?: BlobMode;
  intensity?: number;
  offset?: number;
  size?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const tRef = useRef(offset);

  const { pts, cum, total } = useMemo(() => {
    const vecs = waypoints.map((p) => new THREE.Vector3(...p));
    const distances = [0];
    let acc = 0;
    for (let i = 0; i < vecs.length - 1; i++) {
      acc += vecs[i].distanceTo(vecs[i + 1]);
      distances.push(acc);
    }
    return { pts: vecs, cum: distances, total: Math.max(0.01, acc) };
  }, [waypoints]);

  const posOut = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    if (!energized) {
      samplePolyline(pts, cum, total, tRef.current, posOut);
      g.position.copy(posOut);
      g.scale.setScalar(0.42 * size);
      return;
    }
    // Constant world-units-per-second feel scaled smoothly across long vs short road branches
    const metersPerSec = 5.5 + Math.min(1.6, Math.max(0.2, intensity)) * 6.5;
    tRef.current = (tRef.current + (delta * metersPerSec) / total) % 1;
    samplePolyline(pts, cum, total, tRef.current, posOut);
    g.position.copy(posOut);
    const pulse = (1 + 0.2 * Math.sin(tRef.current * Math.PI * 8)) * size;
    g.scale.setScalar(pulse);
  });

  const coreColor = !energized
    ? '#64748b'
    : mode === 'breach'
      ? '#ffd4dc'
      : mode === 'export'
        ? '#e0fffa'
        : '#e6fff2';
  const plasmaColor = !energized
    ? '#475569'
    : mode === 'breach'
      ? '#ff3b5c'
      : mode === 'export'
        ? '#00f5d4'
        : '#00ff88';
  const haloColor = !energized
    ? '#334155'
    : mode === 'breach'
      ? '#ff1f4b'
      : mode === 'export'
        ? '#00d4aa'
        : '#00e676';

  return (
    <group ref={groupRef} position={waypoints[0]}>
      <mesh>
        <sphereGeometry args={[0.25, 12, 10]} />
        <meshBasicMaterial
          color={coreColor}
          toneMapped={false}
          transparent
          opacity={energized ? 1 : 0.28}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.44, 14, 12]} />
        <meshBasicMaterial
          color={plasmaColor}
          toneMapped={false}
          transparent
          opacity={energized ? 0.88 : 0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.78, 14, 12]} />
        <meshBasicMaterial
          color={haloColor}
          toneMapped={false}
          transparent
          opacity={energized ? 0.3 : 0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** Compact neighborhood Sector Relay Kiosk bridging the MV Substation and buildings. */
function SectorRelayKiosk({
  position,
  label,
  active,
  wireframe,
  gravelTex,
}: {
  position: [number, number, number];
  label: string;
  active: boolean;
  wireframe: boolean;
  gravelTex: THREE.Texture;
}) {
  return (
    <group position={position} name={label}>
      <mesh position={[0, 0.06, 0]} receiveShadow={!wireframe}>
        <boxGeometry args={[4.4, 0.12, 3.6]} />
        {wireframe ? (
          <meshBasicMaterial color="#0b1120" />
        ) : (
          <meshStandardMaterial map={gravelTex} roughness={0.9} metalness={0.04} />
        )}
      </mesh>

      <mesh position={[-0.75, 0.88, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
        <boxGeometry args={[1.5, 1.52, 1.4]} />
        <meshStandardMaterial
          color={wireframe ? '#0b1120' : '#f1efe9'}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>
      <mesh position={[0.9, 0.96, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
        <boxGeometry args={[1.2, 1.68, 1.15]} />
        <meshStandardMaterial
          color={wireframe ? '#0b1120' : '#64748b'}
          roughness={0.44}
          metalness={0.48}
        />
      </mesh>

      {[-0.3, 0, 0.3].map((bx, bi) => (
        <mesh key={bi} position={[0.9 + bx, 1.98, 0]}>
          <cylinderGeometry args={[0.05, 0.08, 0.36, 8]} />
          <meshStandardMaterial color={wireframe ? C.edge : '#9a5b3c'} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[-0.75, 1.48, 0.72]}>
        <boxGeometry args={[1.1, 0.09, 0.04]} />
        <meshBasicMaterial color={active ? '#00ff88' : '#64748b'} toneMapped={false} />
      </mesh>
    </group>
  );
}

function FinnedTransformer({
  x,
  wireframe,
}: {
  x: number;
  wireframe: boolean;
}) {
  return (
    <group position={[x, 0, -1.6]}>
      <mesh position={[0, 0.12, 0]} receiveShadow={!wireframe}>
        <boxGeometry args={[2.3, 0.24, 1.75]} />
        <meshStandardMaterial
          color={wireframe ? '#0b1120' : '#e2e8f0'}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
        <boxGeometry args={[1.65, 2.02, 1.2]} />
        <meshStandardMaterial
          color={wireframe ? '#0b1120' : '#64748b'}
          metalness={0.5}
          roughness={0.42}
        />
      </mesh>
      {[-0.45, -0.22, 0, 0.22, 0.45].map((fz, fi) => (
        <group key={fi}>
          <mesh position={[-0.92, 1.25, fz]} castShadow={!wireframe}>
            <boxGeometry args={[0.2, 1.65, 0.06]} />
            <meshStandardMaterial
              color={wireframe ? C.edgeDim : '#cbd5e1'}
              metalness={0.55}
              roughness={0.38}
            />
          </mesh>
          <mesh position={[0.92, 1.25, fz]} castShadow={!wireframe}>
            <boxGeometry args={[0.2, 1.65, 0.06]} />
            <meshStandardMaterial
              color={wireframe ? C.edgeDim : '#cbd5e1'}
              metalness={0.55}
              roughness={0.38}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.52, -0.35]} rotation={[0, 0, Math.PI / 2]} castShadow={!wireframe}>
        <cylinderGeometry args={[0.22, 0.22, 1.3, 12]} />
        <meshStandardMaterial
          color={wireframe ? '#1e293b' : '#94a3b8'}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      {[-0.48, 0, 0.48].map((bx, bi) => (
        <group key={bi} position={[bx, 2.26, 0.22]}>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.07, 0.11, 0.56, 10]} />
            <meshStandardMaterial
              color={wireframe ? C.edge : '#9a5b3c'}
              roughness={0.25}
              metalness={0.15}
            />
          </mesh>
          <mesh position={[0, 0.58, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.08, 8]} />
            <meshStandardMaterial color={wireframe ? C.edge : '#f1f5f9'} metalness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Road-following power network linking the Mountain Solar Farm Collector Relay,
 * Central MV Relay Substation [0, 0, 2], West & East Sector Relays, and all 5
 * campus buildings with bidirectional glowing neon energy blobs.
 */
export function SubstationConduits({
  sites,
  substation,
  serverOnline = true,
  visualMode = 'realistic',
}: SubstationConduitsProps) {
  const wireframe = visualMode === 'wireframe';
  const gravelTex = useMemo(() => getGravelPadTexture(), []);

  const ringColor = !serverOnline
    ? C.slate
    : substation.breaching
      ? '#ef4444'
      : '#00ff88';

  const ringRef = useRef<unknown>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const ring = ringRef.current as { material?: { opacity: number } } | null;
    if (ring?.material) {
      ring.material.opacity = serverOnline ? 0.55 + 0.35 * Math.sin(t * 3.2) : 0.25;
    }
  });

  const ringPts = useMemo(() => {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push([Math.cos(a) * 8, 0.14, Math.sin(a) * 8]);
    }
    return pts;
  }, []);

  const yardEdges = useMemo(() => {
    const plane = new THREE.PlaneGeometry(13, 9.5);
    const edges = new THREE.EdgesGeometry(plane);
    plane.dispose();
    return edges;
  }, []);

  const cubicleEdges = useMemo(
    () =>
      [-3.4, 0, 3.4].map((cx) => {
        const box = new THREE.BoxGeometry(2.1, 2.25, 1.5);
        const edges = new THREE.EdgesGeometry(box);
        box.dispose();
        return { cx, edges };
      }),
    [],
  );

  useEffect(
    () => () => {
      yardEdges.dispose();
      cubicleEdges.forEach((c) => c.edges.dispose());
    },
    [yardEdges, cubicleEdges],
  );

  const fencePosts = useMemo(() => {
    const posts: Array<[number, number]> = [];
    const hx = 6.4;
    const hz = 4.65;
    for (let x = -hx; x <= hx; x += 2.13) {
      posts.push([x, -hz]);
      if (Math.abs(x) > 1.2) posts.push([x, hz]);
    }
    for (let z = -hz + 2.3; z < hz; z += 2.3) {
      posts.push([-hx, z], [hx, z]);
    }
    return posts;
  }, []);

  const westActive =
    serverOnline &&
    sites.some((s) => s.online && (s.id === 'alptech-hq' || s.id === 'vercors-control'));
  const eastActive =
    serverOnline &&
    sites.some((s) => s.online && (s.id === 'dauphine-cloud' || s.id === 'chartreuse-annex'));

  const westExporting =
    serverOnline &&
    sites.some(
      (s) =>
        s.online &&
        s.sellToGrid &&
        s.currentExportKw > 0 &&
        (s.id === 'alptech-hq' || s.id === 'vercors-control'),
    );
  const eastExporting =
    serverOnline &&
    sites.some(
      (s) =>
        s.online &&
        s.sellToGrid &&
        s.currentExportKw > 0 &&
        (s.id === 'dauphine-cloud' || s.id === 'chartreuse-annex'),
    );

  const reversedWestTrunk = useMemo(() => [...WEST_TRUNK_PATH].reverse(), []);
  const reversedEastTrunk = useMemo(() => [...EAST_TRUNK_PATH].reverse(), []);

  return (
    <group>
      {/* Road-following Solar Collector Trunk: Mountain Solar Farm -> Central Substation */}
      <Line
        points={SOLAR_TRUNK_PATH}
        color={serverOnline ? '#00ff88' : C.slate}
        transparent
        opacity={serverOnline ? 0.82 : 0.25}
        lineWidth={2.2}
      />
      {[0, 0.25, 0.5, 0.75].map((offset) => (
        <NeonPowerBlob
          key={`solar-trunk-${offset}`}
          waypoints={SOLAR_TRUNK_PATH}
          energized={serverOnline}
          mode="supply"
          intensity={1.1}
          offset={offset}
          size={1.2}
        />
      ))}

      {/* Road-following Sector Trunks: Central Substation -> West & East Sector Relays */}
      {[
        { path: WEST_TRUNK_PATH, rev: reversedWestTrunk, active: westActive, exporting: westExporting, id: 'west' },
        { path: EAST_TRUNK_PATH, rev: reversedEastTrunk, active: eastActive, exporting: eastExporting, id: 'east' },
      ].map(({ path, rev, active, exporting, id }) => (
        <group key={id}>
          <Line
            points={path}
            color={active ? '#00ff88' : C.slate}
            transparent
            opacity={active ? 0.85 : 0.25}
            lineWidth={2.0}
          />
          {[0, 0.33, 0.66].map((offset) => (
            <NeonPowerBlob
              key={`${id}-blob-${offset}`}
              waypoints={path}
              energized={active}
              mode="supply"
              intensity={0.95}
              offset={offset}
              size={1.1}
            />
          ))}
          {exporting &&
            [0.15, 0.65].map((offset) => (
              <NeonPowerBlob
                key={`${id}-exp-${offset}`}
                waypoints={rev}
                energized={true}
                mode="export"
                intensity={1.1}
                offset={offset}
                size={1.08}
              />
            ))}
        </group>
      ))}

      {/* West & East Sector Relay Stations */}
      <SectorRelayKiosk
        position={WEST_RELAY_POS}
        label="West Sector Relay"
        active={westActive}
        wireframe={wireframe}
        gravelTex={gravelTex}
      />
      <SectorRelayKiosk
        position={EAST_RELAY_POS}
        label="East Sector Relay"
        active={eastActive}
        wireframe={wireframe}
        gravelTex={gravelTex}
      />

      {/* Road-following Relay -> Building paths (+ reverse cyan-emerald blobs when selling to grid!) */}
      {sites.map((site) => {
        const path = SITE_PATHS[site.id];
        const revPath = [...path].reverse();
        const status = siteStatus(site);
        const active = site.online && serverOnline;
        const breaching = active && (site.breaching || site.currentKw > site.capKw);
        const exporting = active && site.sellToGrid && site.currentExportKw > 0;
        const ratio = active && site.capKw > 0 ? site.currentKw / site.capKw : 0;

        return (
          <group key={site.id}>
            <Line
              points={path}
              color={
                !active
                  ? C.slate
                  : breaching
                    ? status.hex
                    : exporting
                      ? '#00f5d4'
                      : '#00ff88'
              }
              transparent
              opacity={active ? 0.82 : 0.22}
              lineWidth={2.0}
            />
            {[0, 0.5].map((offset) => (
              <NeonPowerBlob
                key={`${site.id}-blob-${offset}`}
                waypoints={path}
                energized={active}
                mode={breaching ? 'breach' : 'supply'}
                intensity={ratio}
                offset={offset}
                size={0.95}
              />
            ))}
            {exporting &&
              [0.25, 0.75].map((offset) => (
                <NeonPowerBlob
                  key={`${site.id}-exp-${offset}`}
                  waypoints={revPath}
                  energized={true}
                  mode="export"
                  intensity={1.05}
                  offset={offset}
                  size={1.05}
                />
              ))}
          </group>
        );
      })}

      {/* Central Neighborhood MV Relay Substation [0, 0, 2] */}
      <group position={SUBSTATION_POS}>
        <mesh
          key={wireframe ? 'pad-w' : 'pad-r'}
          position={[0, 0.05, 0]}
          rotation-x={-Math.PI / 2}
          receiveShadow={!wireframe}
        >
          <planeGeometry args={[13, 9.5]} />
          {wireframe ? (
            <meshBasicMaterial color="#0b1120" />
          ) : (
            <meshStandardMaterial map={gravelTex} roughness={0.92} />
          )}
        </mesh>
        <lineSegments geometry={yardEdges} position={[0, 0.07, 0]} rotation-x={-Math.PI / 2}>
          <lineBasicMaterial color={wireframe ? C.edge : '#94a3b8'} />
        </lineSegments>

        {fencePosts.map(([fx, fz], i) => (
          <mesh key={i} position={[fx, 0.58, fz]}>
            <cylinderGeometry args={[0.04, 0.04, 1.15, 6]} />
            <meshStandardMaterial color={wireframe ? C.edgeDim : '#cbd5e1'} metalness={0.55} />
          </mesh>
        ))}
        <mesh position={[0, 1.08, -4.65]}>
          <boxGeometry args={[12.8, 0.04, 0.04]} />
          <meshBasicMaterial color={wireframe ? C.edgeDim : '#cbd5e1'} />
        </mesh>
        <mesh position={[-6.4, 1.08, 0]}>
          <boxGeometry args={[0.04, 0.04, 9.3]} />
          <meshBasicMaterial color={wireframe ? C.edgeDim : '#cbd5e1'} />
        </mesh>
        <mesh position={[6.4, 1.08, 0]}>
          <boxGeometry args={[0.04, 0.04, 9.3]} />
          <meshBasicMaterial color={wireframe ? C.edgeDim : '#cbd5e1'} />
        </mesh>

        {[-3.4, 0, 3.4].map((cx) => (
          <FinnedTransformer key={cx} x={cx} wireframe={wireframe} />
        ))}
        {wireframe &&
          cubicleEdges.map(({ cx, edges }, i) => (
            <lineSegments key={i} geometry={edges} position={[cx, 1.15, -1.6]}>
              <lineBasicMaterial color={C.edge} />
            </lineSegments>
          ))}

        {[-5.2, 5.2].map((bx, i) => (
          <group key={i} position={[bx, 0, 2.5]}>
            <mesh position={[0, 2.25, -0.22]} castShadow={!wireframe}>
              <cylinderGeometry args={[0.1, 0.12, 4.5, 8]} />
              <meshStandardMaterial color={wireframe ? C.edge : '#cbd5e1'} metalness={0.65} />
            </mesh>
            <mesh position={[0, 2.25, 0.22]} castShadow={!wireframe}>
              <cylinderGeometry args={[0.1, 0.12, 4.5, 8]} />
              <meshStandardMaterial color={wireframe ? C.edge : '#cbd5e1'} metalness={0.65} />
            </mesh>
          </group>
        ))}
        {[3.4, 3.9, 4.35].map((by, i) => (
          <mesh key={i} position={[0, by, 2.5]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.055, 0.055, 10.6, 8]} />
            <meshStandardMaterial
              color={wireframe ? C.edge : '#e2e8f0'}
              metalness={0.8}
              roughness={0.25}
            />
          </mesh>
        ))}

        <Line
          ref={ringRef as never}
          points={ringPts}
          color={ringColor}
          transparent
          opacity={serverOnline ? 0.85 : 0.28}
          lineWidth={2.2}
        />
      </group>
    </group>
  );
}
