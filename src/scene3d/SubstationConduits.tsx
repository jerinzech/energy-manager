import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { HqSiteSummary, SubstationSummary } from '../engine';
import { C, siteStatus } from './BuildingMesh';
import type { BuildingVisualMode } from './BuildingMesh';
import { getGravelPadTexture } from './textures';

export interface SubstationConduitsProps {
  sites: HqSiteSummary[];
  substation: SubstationSummary;
  serverOnline?: boolean;
  visualMode?: BuildingVisualMode;
}

const SUBSTATION_POS: [number, number, number] = [0, 0, 2];

/** One animated energy pulse travelling along a conduit; pauses & dims when offline. */
function FlowPulse({
  from,
  to,
  site,
  serverOnline,
  offset = 0,
}: {
  from: [number, number, number];
  to: [number, number, number];
  site: HqSiteSummary;
  serverOnline: boolean;
  offset?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const tRef = useRef(offset);
  const v0 = useMemo(() => new THREE.Vector3(...from), [from]);
  const v1 = useMemo(() => new THREE.Vector3(...to), [to]);
  const status = siteStatus(site);
  const energized = site.online && serverOnline;
  const ratio = energized && site.capKw > 0 ? site.currentKw / site.capKw : 0;

  useFrame((_, delta) => {
    const m = ref.current;
    const mat = matRef.current;
    if (!m || !mat) return;

    if (!energized) {
      // Freeze pulse position & dim visibly when site or backend server is offline.
      m.position.lerpVectors(v0, v1, tRef.current);
      m.scale.setScalar(0.65);
      mat.opacity = 0.25;
      return;
    }

    tRef.current = (tRef.current + delta * (0.08 + Math.min(1.6, ratio) * 0.22)) % 1;
    m.position.lerpVectors(v0, v1, tRef.current);
    const s = 1 + 0.28 * Math.sin(tRef.current * 10);
    m.scale.setScalar(s);
    mat.opacity = 0.95;
  });

  return (
    <mesh ref={ref} position={from}>
      <sphereGeometry args={[0.3, 10, 8]} />
      <meshBasicMaterial
        ref={matRef}
        color={energized ? status.hex : C.slate}
        transparent
        opacity={energized ? 0.95 : 0.25}
      />
    </mesh>
  );
}

/** Finned MV Transformer with radiator cooling banks and ceramic porcelain bushings. */
function FinnedTransformer({
  x,
  wireframe,
}: {
  x: number;
  wireframe: boolean;
}) {
  return (
    <group position={[x, 0, -1.6]}>
      {/* Concrete plinth */}
      <mesh position={[0, 0.12, 0]} receiveShadow={!wireframe}>
        <boxGeometry args={[2.3, 0.24, 1.75]} />
        <meshStandardMaterial
          color={wireframe ? '#0b1120' : '#94a3b8'}
          roughness={0.85}
        />
      </mesh>
      {/* Main transformer oil tank */}
      <mesh position={[0, 1.25, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
        <boxGeometry args={[1.65, 2.02, 1.2]} />
        <meshStandardMaterial
          color={wireframe ? '#0b1120' : '#475569'}
          metalness={0.55}
          roughness={0.45}
        />
      </mesh>
      {/* Side cooling radiator fins */}
      {[-0.45, -0.22, 0, 0.22, 0.45].map((fz, fi) => (
        <group key={fi}>
          <mesh position={[-0.92, 1.25, fz]} castShadow={!wireframe}>
            <boxGeometry args={[0.2, 1.65, 0.06]} />
            <meshStandardMaterial
              color={wireframe ? C.edgeDim : '#64748b'}
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>
          <mesh position={[0.92, 1.25, fz]} castShadow={!wireframe}>
            <boxGeometry args={[0.2, 1.65, 0.06]} />
            <meshStandardMaterial
              color={wireframe ? C.edgeDim : '#64748b'}
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
      {/* Overhead conservator expansion drum */}
      <mesh position={[0, 2.52, -0.35]} rotation={[0, 0, Math.PI / 2]} castShadow={!wireframe}>
        <cylinderGeometry args={[0.22, 0.22, 1.3, 12]} />
        <meshStandardMaterial
          color={wireframe ? '#1e293b' : '#64748b'}
          metalness={0.5}
          roughness={0.45}
        />
      </mesh>
      {/* 3 porcelain HV insulator bushings */}
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
            <meshStandardMaterial color={wireframe ? C.edge : '#cbd5e1'} metalness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Center-south Neighborhood MV Substation at [0, 0, 2] with fenced gravel pad,
 * 3 finned transformers with porcelain bushings, gantry + busbars, and animated
 * ground power conduits to every campus site.
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
      ? C.rose
      : C.emerald;

  const ringRef = useRef<unknown>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const ring = ringRef.current as { material?: { opacity: number } } | null;
    if (ring?.material) {
      ring.material.opacity = serverOnline ? 0.6 + 0.4 * Math.sin(t * 3.2) : 0.3;
    }
  });

  const ringPts = useMemo(() => {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push([Math.cos(a) * 8, 0.11, Math.sin(a) * 8]);
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
      if (Math.abs(x) > 1.2) posts.push([x, hz]); // leave front gate gap
    }
    for (let z = -hz + 2.3; z < hz; z += 2.3) {
      posts.push([-hx, z], [hx, z]);
    }
    return posts;
  }, []);

  return (
    <group>
      {/* Ground power conduits substation → each site */}
      {sites.map((site) => {
        const to: [number, number, number] = [site.layout.x, 0.14, site.layout.z];
        const status = siteStatus(site);
        const active = site.online && serverOnline;
        return (
          <group key={site.id}>
            <Line
              points={[
                [SUBSTATION_POS[0], 0.14, SUBSTATION_POS[2]],
                to,
              ]}
              color={active ? (wireframe ? status.hex : '#38bdf8') : C.slate}
              transparent
              opacity={active ? 0.75 : 0.28}
              lineWidth={wireframe ? 1.5 : 1.2}
            />
            <FlowPulse
              from={[SUBSTATION_POS[0], 0.16, SUBSTATION_POS[2]]}
              to={to}
              site={site}
              serverOnline={serverOnline}
              offset={0}
            />
            <FlowPulse
              from={[SUBSTATION_POS[0], 0.16, SUBSTATION_POS[2]]}
              to={to}
              site={site}
              serverOnline={serverOnline}
              offset={0.5}
            />
          </group>
        );
      })}

      {/* Neighborhood MV substation [0, 0, 2] */}
      <group position={SUBSTATION_POS}>
        {/* Fenced gravel pad */}
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
            <meshStandardMaterial map={gravelTex} roughness={0.95} />
          )}
        </mesh>
        <lineSegments geometry={yardEdges} position={[0, 0.07, 0]} rotation-x={-Math.PI / 2}>
          <lineBasicMaterial color={wireframe ? C.edge : '#64748b'} />
        </lineSegments>

        {/* Perimeter security fence posts + rails */}
        {fencePosts.map(([fx, fz], i) => (
          <mesh key={i} position={[fx, 0.58, fz]}>
            <cylinderGeometry args={[0.04, 0.04, 1.15, 6]} />
            <meshStandardMaterial color={wireframe ? C.edgeDim : '#94a3b8'} metalness={0.6} />
          </mesh>
        ))}
        {/* Fence horizontal top rails */}
        <mesh position={[0, 1.08, -4.65]}>
          <boxGeometry args={[12.8, 0.04, 0.04]} />
          <meshBasicMaterial color={wireframe ? C.edgeDim : '#94a3b8'} />
        </mesh>
        <mesh position={[-6.4, 1.08, 0]}>
          <boxGeometry args={[0.04, 0.04, 9.3]} />
          <meshBasicMaterial color={wireframe ? C.edgeDim : '#94a3b8'} />
        </mesh>
        <mesh position={[6.4, 1.08, 0]}>
          <boxGeometry args={[0.04, 0.04, 9.3]} />
          <meshBasicMaterial color={wireframe ? C.edgeDim : '#94a3b8'} />
        </mesh>

        {/* 3 finned MV transformers with porcelain insulator bushings */}
        {[-3.4, 0, 3.4].map((cx) => (
          <FinnedTransformer key={cx} x={cx} wireframe={wireframe} />
        ))}
        {wireframe &&
          cubicleEdges.map(({ cx, edges }, i) => (
            <lineSegments key={i} geometry={edges} position={[cx, 1.15, -1.6]}>
              <lineBasicMaterial color={C.edge} />
            </lineSegments>
          ))}

        {/* Steel gantry H-towers + overhead 3-phase busbars */}
        {[-5.2, 5.2].map((bx, i) => (
          <group key={i} position={[bx, 0, 2.5]}>
            <mesh position={[0, 2.25, -0.22]} castShadow={!wireframe}>
              <cylinderGeometry args={[0.1, 0.12, 4.5, 8]} />
              <meshStandardMaterial color={wireframe ? C.edge : '#94a3b8'} metalness={0.7} />
            </mesh>
            <mesh position={[0, 2.25, 0.22]} castShadow={!wireframe}>
              <cylinderGeometry args={[0.1, 0.12, 4.5, 8]} />
              <meshStandardMaterial color={wireframe ? C.edge : '#94a3b8'} metalness={0.7} />
            </mesh>
          </group>
        ))}
        {[3.4, 3.9, 4.35].map((by, i) => (
          <mesh key={i} position={[0, by, 2.5]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.055, 0.055, 10.6, 8]} />
            <meshStandardMaterial
              color={wireframe ? C.edge : '#cbd5e1'}
              metalness={0.85}
              roughness={0.25}
            />
          </mesh>
        ))}

        {/* Substation load halo */}
        <Line
          ref={ringRef as never}
          points={ringPts}
          color={ringColor}
          transparent
          opacity={serverOnline ? 0.9 : 0.3}
          lineWidth={2.2}
        />
      </group>
    </group>
  );
}
