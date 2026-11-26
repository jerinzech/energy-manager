import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { getGravelPadTexture, getSolarPanelTexture } from './textures';

export type SolarFarmVisualMode = 'realistic' | 'wireframe';

export interface MountainSolarFarmProps {
  visualMode?: SolarFarmVisualMode;
  totalSolarKw: number;
  serverOnline?: boolean;
}

/** Collector relay kiosk at the foot of the hillside solar farm. */
export const SOLAR_FARM_RELAY_POS: [number, number, number] = [38, 0, -49];

interface TerraceRow {
  rowIdx: number;
  z: number;
  baseY: number;
  cols: number;
  width: number;
  benches: Array<{ x: number; baseY: number; z: number }>;
}

const TERRACE_ROWS: TerraceRow[] = Array.from({ length: 10 }, (_, rowIdx) => {
  const z = -53 - rowIdx * 3.5;
  const baseY = 0.7 + rowIdx * 1.9;
  const cols = rowIdx < 7 ? 11 : rowIdx < 9 ? 10 : 9;
  const pitch = 7.8;
  const startX = 34 - ((cols - 1) * pitch) / 2;
  const benches = Array.from({ length: cols }, (_, ci) => ({
    x: startX + ci * pitch,
    baseY,
    z,
  }));
  return {
    rowIdx,
    z,
    baseY,
    cols,
    width: cols * pitch + 3.5,
    benches,
  };
});

const ALL_BENCHES = TERRACE_ROWS.flatMap((row) => row.benches);

const HILLSIDE_SPINE_WAYPOINTS: THREE.Vector3[] = [
  new THREE.Vector3(38, 18.2, -84.5),
  new THREE.Vector3(38, 1.0, -53),
  new THREE.Vector3(38, 0.4, -49),
];

function sampleSegmentPath(
  pts: THREE.Vector3[],
  t: number,
  out: THREE.Vector3,
): void {
  const segCount = pts.length - 1;
  const scaled = Math.max(0, Math.min(0.9999, t)) * segCount;
  const idx = Math.floor(scaled);
  const localT = scaled - idx;
  out.lerpVectors(pts[idx], pts[idx + 1], localT);
}

/**
 * Animated neon pulse orbs carrying harvested PV power down the hillside
 * collector bus into the Collector Relay Station at [38, 0, -49].
 */
function CollectorPulseOrb({
  offset,
  serverOnline,
}: {
  offset: number;
  serverOnline: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const tRef = useRef(offset);
  const pos = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    if (serverOnline) {
      tRef.current = (tRef.current + delta * 0.28) % 1;
    }
    sampleSegmentPath(HILLSIDE_SPINE_WAYPOINTS, tRef.current, pos);
    mesh.position.copy(pos);
    mesh.scale.setScalar(serverOnline ? 1 + 0.18 * Math.sin(tRef.current * Math.PI * 6) : 0.55);
  });

  return (
    <mesh ref={ref} position={[38, 18.2, -84.5]}>
      <sphereGeometry args={[0.38, 12, 10]} />
      <meshBasicMaterial
        color={serverOnline ? '#00ff88' : '#64748b'}
        toneMapped={false}
        transparent
        opacity={serverOnline ? 0.92 : 0.3}
      />
    </mesh>
  );
}

/**
 * Monumental 10-terrace alpine photovoltaic generation farm carved into the
 * south-facing Chartreuse foothill amphitheater (~106 solar array tables),
 * feeding green collector buses into the relay kiosk at [38, 0, -49].
 */
export function MountainSolarFarm({
  visualMode = 'realistic',
  totalSolarKw,
  serverOnline = true,
}: MountainSolarFarmProps) {
  const wireframe = visualMode === 'wireframe';
  const solarTex = useMemo(() => getSolarPanelTexture(), []);
  const gravelTex = useMemo(() => getGravelPadTexture(), []);

  const postsRef = useRef<THREE.InstancedMesh>(null);
  const framesRef = useRef<THREE.InstancedMesh>(null);
  const panelsRef = useRef<THREE.InstancedMesh>(null);

  const slopeGeo = useMemo(() => new THREE.BoxGeometry(92, 3.8, 40), []);
  const postGeo = useMemo(() => new THREE.CylinderGeometry(0.08, 0.1, 1.05, 6), []);
  const frameGeo = useMemo(() => new THREE.BoxGeometry(7.0, 0.08, 3.0), []);
  const panelGeo = useMemo(() => new THREE.BoxGeometry(6.75, 0.1, 2.8), []);

  useEffect(
    () => () => {
      slopeGeo.dispose();
      postGeo.dispose();
      frameGeo.dispose();
      panelGeo.dispose();
    },
    [slopeGeo, frameGeo, panelGeo, postGeo],
  );

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const tiltEuler = new THREE.Euler(0.56, 0, 0);

    ALL_BENCHES.forEach((bench, bi) => {
      if (postsRef.current) {
        [-2.35, 2.35].forEach((px, pi) => {
          dummy.position.set(bench.x + px, bench.baseY + 0.48, bench.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          postsRef.current!.setMatrixAt(bi * 2 + pi, dummy.matrix);
        });
      }

      if (framesRef.current) {
        dummy.position.set(bench.x, bench.baseY + 1.0, bench.z);
        dummy.rotation.copy(tiltEuler);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        framesRef.current.setMatrixAt(bi, dummy.matrix);
      }

      if (panelsRef.current) {
        dummy.position.set(bench.x, bench.baseY + 1.03, bench.z + 0.01);
        dummy.rotation.copy(tiltEuler);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        panelsRef.current.setMatrixAt(bi, dummy.matrix);
      }
    });

    if (postsRef.current) postsRef.current.instanceMatrix.needsUpdate = true;
    if (framesRef.current) framesRef.current.instanceMatrix.needsUpdate = true;
    if (panelsRef.current) panelsRef.current.instanceMatrix.needsUpdate = true;
  }, [wireframe]);

  const solarActivity = serverOnline
    ? Math.max(0.08, Math.min(0.28, totalSolarKw / 820))
    : 0;
  const farmOutputKw = Math.round(Math.max(120, totalSolarKw * 1.4));

  return (
    <group>
      {/* Sage-green alpine foothill berm supporting all 10 solar terraces */}
      {!wireframe && (
        <mesh
          position={[34, 7.9, -68.75]}
          rotation={[0.497, 0, 0]}
          geometry={slopeGeo}
          receiveShadow
          castShadow
        >
          <meshStandardMaterial color="#84a97b" roughness={0.92} metalness={0.02} />
        </mesh>
      )}

      {/* 10 Stepped limestone & gravel access terraces */}
      {TERRACE_ROWS.map((row) => (
        <mesh
          key={row.rowIdx}
          position={[34, row.baseY - 0.18, row.z]}
          receiveShadow={!wireframe}
        >
          <boxGeometry args={[row.width, 0.42, 3.1]} />
          {wireframe ? (
            <meshBasicMaterial color="#0b1120" />
          ) : (
            <meshStandardMaterial map={gravelTex} roughness={0.9} metalness={0.04} />
          )}
        </mesh>
      ))}

      {/* Instanced stanchion posts (~212 posts) */}
      <instancedMesh
        ref={postsRef}
        args={[postGeo, undefined, ALL_BENCHES.length * 2]}
        castShadow={!wireframe}
      >
        <meshStandardMaterial
          color={wireframe ? '#334155' : '#cbd5e1'}
          metalness={0.6}
          roughness={0.35}
        />
      </instancedMesh>

      {/* Instanced brushed-aluminum PV frames (106 tables) */}
      <instancedMesh
        ref={framesRef}
        args={[frameGeo, undefined, ALL_BENCHES.length]}
        castShadow={!wireframe}
        receiveShadow={!wireframe}
      >
        <meshStandardMaterial
          color={wireframe ? '#1e293b' : '#e2e8f0'}
          metalness={0.55}
          roughness={0.3}
          wireframe={wireframe}
        />
      </instancedMesh>

      {/* Instanced cobalt-blue monocrystalline photovoltaic panel surfaces (106 tables) */}
      <instancedMesh
        key={wireframe ? 'farm-pv-w' : 'farm-pv-r'}
        ref={panelsRef}
        args={[panelGeo, undefined, ALL_BENCHES.length]}
        castShadow={!wireframe}
        receiveShadow={!wireframe}
      >
        {wireframe ? (
          <meshBasicMaterial color="#38bdf8" wireframe />
        ) : (
          <meshStandardMaterial
            map={solarTex}
            metalness={0.58}
            roughness={0.2}
            emissive="#1d4ed8"
            emissiveIntensity={solarActivity}
          />
        )}
      </instancedMesh>

      {/* Hillside glowing green collector bus conduits into the relay substation */}
      <Line
        points={[
          [38, 18.2, -84.5],
          [38, 1.0, -53],
          [38, 0.4, -49],
        ]}
        color={serverOnline ? '#00ff88' : '#64748b'}
        lineWidth={2.5}
        transparent
        opacity={serverOnline ? 0.9 : 0.35}
      />
      <Line
        points={[
          [-4, 1.05, -52.2],
          [72, 1.05, -52.2],
        ]}
        color={serverOnline ? '#00ff88' : '#64748b'}
        lineWidth={2.0}
        transparent
        opacity={serverOnline ? 0.85 : 0.3}
      />
      {[0, 0.25, 0.5, 0.75].map((offset) => (
        <CollectorPulseOrb key={offset} offset={offset} serverOnline={serverOnline} />
      ))}

      {/* Upgraded Hillside Solar Collector Relay Station at [38, 0, -49] */}
      <group position={SOLAR_FARM_RELAY_POS}>
        <mesh position={[0, 0.09, 0]} receiveShadow={!wireframe}>
          <boxGeometry args={[9.6, 0.18, 5.0]} />
          {wireframe ? (
            <meshBasicMaterial color="#0b1120" />
          ) : (
            <meshStandardMaterial map={gravelTex} roughness={0.9} />
          )}
        </mesh>

        {[-2.7, -0.9, 0.9, 2.7].map((ix, i) => (
          <group key={i} position={[ix, 0.18, 0]}>
            <mesh position={[0, 0.78, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
              <boxGeometry args={[1.38, 1.56, 1.35]} />
              <meshStandardMaterial
                color={wireframe ? '#0b1120' : i === 1 || i === 2 ? '#64748b' : '#f1f5f9'}
                metalness={i === 1 || i === 2 ? 0.5 : 0.25}
                roughness={0.42}
              />
            </mesh>
            <mesh position={[0, 1.42, 0.69]}>
              <boxGeometry args={[0.82, 0.1, 0.04]} />
              <meshBasicMaterial color={serverOnline ? '#00ff88' : '#64748b'} toneMapped={false} />
            </mesh>
          </group>
        ))}

        {[-3.8, 3.8].map((mx, i) => (
          <group key={i} position={[mx, 0, 1.7]}>
            <mesh position={[0, 1.4, 0]} castShadow={!wireframe}>
              <cylinderGeometry args={[0.065, 0.085, 2.8, 8]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.35} />
            </mesh>
            <mesh position={[0, 2.86, 0]}>
              <sphereGeometry args={[0.17, 12, 10]} />
              <meshBasicMaterial color={serverOnline ? '#00ff88' : '#64748b'} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Clean Apple Maps-style landmark badge above the solar terrace crest */}
      <Html position={[34, 21.8, -80]} center zIndexRange={[1, 0]}>
        <div className="pointer-events-none inline-flex select-none items-center gap-2 whitespace-nowrap rounded-full border border-black/[0.08] bg-white/95 px-3 py-1 text-[11px] font-semibold text-[#111827] shadow-md backdrop-blur-md">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: serverOnline ? '#10b981' : '#9ca3af' }}
          />
          <span>
            {serverOnline
              ? `Chartreuse Solar Farm · +${farmOutputKw} kW`
              : 'Chartreuse Solar Farm · Standby'}
          </span>
        </div>
      </Html>
    </group>
  );
}
