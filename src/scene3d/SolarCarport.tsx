import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { HqSiteSummary } from '../engine';
import { C } from './BuildingMesh';
import type { BuildingVisualMode } from './BuildingMesh';
import { getSolarPanelTexture } from './textures';

export interface SolarCarportProps {
  site: HqSiteSummary;
  visualMode?: BuildingVisualMode;
}

const COLS = 5;
const STALL_ROWS = 2;
const HERO_SLOTS = COLS * STALL_ROWS; // 10 dual-facing bays under canopy

const CAR_PAINTS = ['#cbd5e1', '#3b82f6', '#1e293b', '#94a3b8', '#e2e8f0', '#0f766e'];

interface StallSlot {
  x: number;
  z: number;
  facingNorth: boolean;
  hasCar: boolean;
  bollardColor: string;
  active: boolean;
  paint: string;
}

/** Stylized 3D EV car silhouette (body + cabin + tinted glass + 4 wheels + charge LED). */
function EvCar({
  position,
  facingNorth,
  paint,
  ledColor,
  active,
  wireframe,
}: {
  position: [number, number, number];
  facingNorth: boolean;
  paint: string;
  ledColor: string;
  active: boolean;
  wireframe: boolean;
}) {
  const rotY = facingNorth ? 0 : Math.PI;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* Main lower aerodynamic body */}
      <mesh position={[0, 0.19, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
        <boxGeometry args={[0.64, 0.2, 1.24]} />
        <meshStandardMaterial
          color={wireframe ? '#0b1120' : paint}
          roughness={0.3}
          metalness={0.55}
        />
      </mesh>
      {/* Tinted glass cabin */}
      <mesh position={[0, 0.34, 0.04]} castShadow={!wireframe}>
        <boxGeometry args={[0.54, 0.15, 0.68]} />
        <meshStandardMaterial
          color={wireframe ? '#0f172a' : '#0f172a'}
          roughness={0.12}
          metalness={0.8}
        />
      </mesh>
      {/* 4 dark tires */}
      {[
        [-0.31, 0.1, -0.38],
        [0.31, 0.1, -0.38],
        [-0.31, 0.1, 0.38],
        [0.31, 0.1, 0.38],
      ].map(([wx, wy, wz], wi) => (
        <mesh key={wi} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 0.08, 10]} />
          <meshStandardMaterial color={wireframe ? '#1e293b' : '#090d16'} roughness={0.85} />
        </mesh>
      ))}
      {/* Nose charging indicator LED bar */}
      <mesh position={[0, 0.23, -0.625]}>
        <boxGeometry args={[0.32, 0.04, 0.02]} />
        <meshBasicMaterial color={active ? ledColor : wireframe ? '#334155' : '#475569'} />
      </mesh>
    </group>
  );
}

/**
 * Loi APER solar parking canopy at `canopyOffset`, built with galvanized steel
 * H-columns, trusses, angled crystalline PV roof, stylized 3D EV silhouettes,
 * and glowing charger bollards.
 */
export function SolarCarport({ site, visualMode = 'realistic' }: SolarCarportProps) {
  const { x, z, canopyOffset } = site.layout;
  const px = x + canopyOffset[0];
  const pz = z + canopyOffset[1];
  const wireframe = visualMode === 'wireframe';

  const solarTex = useMemo(() => getSolarPanelTexture(), []);

  const glow = site.online
    ? Math.max(0.05, Math.min(1.1, site.currentSolarKw / Math.max(1, site.solarKwh * 0.18)))
    : 0;

  const breaching = site.breaching || site.currentKw > site.capKw;

  // Map site bay telemetry proportionally across the 10 hero stalls beneath the canopy.
  const stalls = useMemo<StallSlot[]>(() => {
    const total = Math.max(1, site.totalBays);
    const parkedCount = Math.min(
      HERO_SLOTS,
      Math.max(site.evsConnected > 0 ? 1 : 0, Math.round((site.evsConnected / total) * HERO_SLOTS)),
    );
    const activeCount = site.online
      ? Math.min(
          parkedCount,
          site.activeBays > 0 ? Math.max(1, Math.round((site.activeBays / total) * HERO_SLOTS)) : 0,
        )
      : 0;
    const urgentSlots = site.online ? Math.min(activeCount, site.urgentCount) : 0;

    const list: StallSlot[] = [];
    for (let i = 0; i < HERO_SLOTS; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const sx = -(COLS - 1) * 0.52 + col * 1.04;
      const sz = row === 0 ? -1.05 : 1.05;
      const isActive = i < activeCount;

      let bollardColor = '#334155';
      if (site.online && isActive) {
        if (i < urgentSlots) bollardColor = C.amber;
        else if (breaching) bollardColor = C.rose;
        else bollardColor = C.emerald;
      }

      list.push({
        x: sx,
        z: sz,
        facingNorth: row === 1, // both rows face central charging spine z=0
        hasCar: i < parkedCount,
        bollardColor,
        active: isActive,
        paint: CAR_PAINTS[(i + site.name.length) % CAR_PAINTS.length],
      });
    }
    return list;
  }, [site.totalBays, site.evsConnected, site.activeBays, site.online, site.urgentCount, site.name.length, breaching]);

  const canopyEdges = useMemo(() => {
    const box = new THREE.BoxGeometry(6.0, 0.08, 4.1);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, []);

  const asphaltPadEdges = useMemo(() => {
    const plane = new THREE.PlaneGeometry(6.2, 4.3);
    const edges = new THREE.EdgesGeometry(plane);
    plane.dispose();
    return edges;
  }, []);

  useEffect(
    () => () => {
      canopyEdges.dispose();
      asphaltPadEdges.dispose();
    },
    [canopyEdges, asphaltPadEdges],
  );

  return (
    <group position={[px, 0, pz]}>
      {/* Carport tarmac bay apron */}
      <mesh
        key={wireframe ? 'apron-w' : 'apron-r'}
        position={[0, 0.03, 0]}
        rotation-x={-Math.PI / 2}
        receiveShadow={!wireframe}
      >
        <planeGeometry args={[6.2, 4.3]} />
        <meshStandardMaterial
          color={wireframe ? '#0b1120' : '#1b2430'}
          roughness={0.95}
        />
      </mesh>
      {wireframe && (
        <lineSegments geometry={asphaltPadEdges} position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
          <lineBasicMaterial color={C.edgeDim} />
        </lineSegments>
      )}

      {/* Parking stall striping */}
      {Array.from({ length: COLS + 1 }, (_, ci) => (
        <mesh key={ci} position={[-(COLS * 1.04) / 2 + ci * 1.04, 0.04, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.04, 3.8]} />
          <meshBasicMaterial color={wireframe ? '#1e293b' : '#cbd5e1'} transparent opacity={0.45} />
        </mesh>
      ))}

      {/* Galvanized steel H-columns + central spine trusses */}
      {[-2.6, 0, 2.6].map((cx, i) => (
        <group key={i} position={[cx, 0, 0]}>
          {/* Center H-column */}
          <mesh position={[0, 1.32, 0]} castShadow={!wireframe}>
            <boxGeometry args={[0.14, 2.64, 0.18]} />
            <meshStandardMaterial
              color={wireframe ? C.edgeDim : '#94a3b8'}
              metalness={0.7}
              roughness={0.35}
            />
          </mesh>
          {/* Cantilever angled roof truss beam */}
          <mesh position={[0, 2.62, 0]} rotation={[0.32, 0, 0]} castShadow={!wireframe}>
            <boxGeometry args={[0.1, 0.12, 3.8]} />
            <meshStandardMaterial
              color={wireframe ? C.edgeDim : '#94a3b8'}
              metalness={0.7}
              roughness={0.35}
            />
          </mesh>
        </group>
      ))}

      {/* Longitudinal purlins under canopy */}
      {[-1.3, 0, 1.3].map((pzRail, i) => (
        <mesh key={i} position={[0, 2.66 - pzRail * 0.32, pzRail]}>
          <boxGeometry args={[5.8, 0.07, 0.07]} />
          <meshStandardMaterial
            color={wireframe ? C.edgeDim : '#64748b'}
            metalness={0.65}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* Angled Loi APER PV canopy roof (tilted south +Z) */}
      <mesh
        key={wireframe ? 'canopy-w' : 'canopy-r'}
        position={[0, 2.72, 0]}
        rotation={[0.32, 0, 0]}
        castShadow={!wireframe}
        receiveShadow={!wireframe}
      >
        <boxGeometry args={[6.0, 0.08, 4.1]} />
        {wireframe ? (
          <meshBasicMaterial color="#0b1120" />
        ) : (
          <meshStandardMaterial
            map={solarTex}
            metalness={0.55}
            roughness={0.28}
            emissive={C.amber}
            emissiveIntensity={site.online ? glow * 0.45 : 0}
          />
        )}
      </mesh>
      {wireframe && (
        <lineSegments geometry={canopyEdges} position={[0, 2.72, 0]} rotation={[0.32, 0, 0]}>
          <lineBasicMaterial color={C.amber} />
        </lineSegments>
      )}

      {/* Stylized 3D EV cars + glowing charger bollards */}
      {stalls.map((stall, i) => {
        const bollardZ = stall.facingNorth ? 0.2 : -0.2;
        return (
          <group key={i}>
            {/* Charger bollard along central curb */}
            <group position={[stall.x, 0, bollardZ]}>
              <mesh position={[0, 0.3, 0]} castShadow={!wireframe}>
                <boxGeometry args={[0.14, 0.6, 0.12]} />
                <meshStandardMaterial
                  color={wireframe ? '#0b1120' : '#334155'}
                  metalness={0.5}
                  roughness={0.4}
                />
              </mesh>
              <mesh position={[0, 0.56, 0]}>
                <boxGeometry args={[0.16, 0.09, 0.14]} />
                <meshBasicMaterial color={stall.bollardColor} />
              </mesh>
            </group>

            {/* Bay pad indicator */}
            <mesh position={[stall.x, 0.042, stall.z]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.78, 1.36]} />
              <meshBasicMaterial
                color={stall.active ? stall.bollardColor : wireframe ? '#1e293b' : '#263344'}
                transparent
                opacity={stall.active ? 0.35 : 0.45}
              />
            </mesh>

            {/* Stylized 3D EV vehicle parked in stall */}
            {stall.hasCar && (
              <EvCar
                position={[stall.x, 0.04, stall.z]}
                facingNorth={stall.facingNorth}
                paint={stall.paint}
                ledColor={stall.bollardColor}
                active={stall.active}
                wireframe={wireframe}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
