import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import type { HqSiteSummary, ScenarioKey, SiteId } from '../engine';
import {
  getConcretePlazaTexture,
  getCurtainWallTexture,
  getRoofMembraneTexture,
  getSolarPanelTexture,
} from './textures';
import type { CurtainWallStyle } from './textures';

export type BuildingVisualMode = 'realistic' | 'wireframe';

export const C = {
  // Wireframe & CAD surface palette
  void: '#090d16',
  grid: '#1e293b',
  edge: '#38bdf8',
  edgeDim: '#334155',
  // Telemetry status accents
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#ef4444',
  slate: '#64748b',
  sky: '#38bdf8',
  frost: '#bae6fd',
  // Compatibility aliases
  panel: '#0f2850',
  line: '#1e293b',
  lineBright: '#38bdf8',
  ink: '#f1f5f9',
  green: '#10b981',
  red: '#ef4444',
};

export interface SiteStatus {
  hex: string;
  label: string;
}

/** Live status colour: isolated → breach → optimized → alert → baseline. */
export function siteStatus(site: HqSiteSummary): SiteStatus {
  if (!site.online) return { hex: C.slate, label: 'Off' };
  const breaching = site.breaching || site.currentKw > site.capKw;
  if (breaching) return { hex: C.rose, label: 'Over Limit' };
  if (site.optimized && !site.failSafe && site.currentKw <= site.capKw) {
    return { hex: C.emerald, label: 'Optimized' };
  }
  if (site.failSafe || site.urgentCount > 0 || site.planStatus === 'PENDING') {
    return { hex: C.amber, label: 'Review' };
  }
  return { hex: C.sky, label: 'Baseline' };
}

function getUnreadNotifications(site: HqSiteSummary): number {
  const candidate = (site as HqSiteSummary & { unreadNotifications?: unknown }).unreadNotifications;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
}

function curtainStyleForSite(id: SiteId): CurtainWallStyle {
  switch (id) {
    case 'isere-rd':
    case 'vercors-control':
      return 'limestone';
    case 'dauphine-cloud':
      return 'dark';
    default:
      return 'glass';
  }
}

/** Height reserved at the base of every building for the 2-level EV parking podium. */
const PODIUM_H = 2.92;
const DECK_1_Y = 0.09;
const DECK_2_Y = 1.5;

const CAR_PAINTS = [
  '#f8fafc',
  '#cbd5e1',
  '#475569',
  '#1e3a5f',
  '#0f766e',
  '#64748b',
];

interface Part {
  w: number;
  h: number;
  d: number;
  px: number;
  py: number;
  pz: number;
  solarOnlySouthTerrace?: boolean;
  skipRooftopEquipment?: boolean;
}

export interface BuildingMeshProps {
  site: HqSiteSummary;
  selected: boolean;
  scenario: ScenarioKey;
  clockSlot: number;
  visualMode?: BuildingVisualMode;
  room?: string;
  onSelect: (id: SiteId) => void;
}

function buildFacadeBoxGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const scaleFace = (faceIndex: number, sx: number, sy: number) => {
    const start = faceIndex * 4;
    for (let v = start; v < start + 4; v++) {
      uv.setXY(v, uv.getX(v) * sx, uv.getY(v) * sy);
    }
  };
  scaleFace(0, Math.max(0.5, d / 8), Math.max(0.5, h / 10));
  scaleFace(1, Math.max(0.5, d / 8), Math.max(0.5, h / 10));
  scaleFace(4, Math.max(0.5, w / 8), Math.max(0.5, h / 10));
  scaleFace(5, Math.max(0.5, w / 8), Math.max(0.5, h / 10));
  uv.needsUpdate = true;
  return geo;
}

function HvacRing({ position }: { position: [number, number, number] }) {
  const ref = useRef<unknown>(null);
  const pts = useMemo(() => {
    const arr: Array<[number, number, number]> = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      arr.push([Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72]);
    }
    return arr;
  }, []);
  useFrame((state) => {
    const ring = ref.current as
      | { scale?: { setScalar: (n: number) => void }; material?: { opacity: number } }
      | null;
    if (!ring?.scale || !ring.material) return;
    const k = (state.clock.elapsedTime * 0.5) % 1;
    ring.scale.setScalar(1 + k * 2.5);
    ring.material.opacity = 0.5 * (1 - k);
  });
  return (
    <Line
      ref={ref as never}
      points={pts}
      position={position}
      color={C.frost}
      transparent
      opacity={0.45}
      lineWidth={1.5}
    />
  );
}

/** Architectural sculpted 3D parked EV visible across the bottom 2 building parking floors. */
function ParkedEv({
  position,
  paint,
  charging,
  urgent,
  wireframe,
}: {
  position: [number, number, number];
  paint: string;
  charging: boolean;
  urgent: boolean;
  wireframe: boolean;
}) {
  const led = urgent ? '#f59e0b' : '#10b981';
  return (
    <group position={position}>
      {/* Contact shadow under vehicle */}
      {!wireframe && (
        <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.88, 1.54]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
      {/* Sculpted EV lower chassis */}
      <mesh position={[0, 0.23, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
        <boxGeometry args={[0.74, 0.22, 1.42]} />
        <meshStandardMaterial
          color={wireframe ? '#0b1120' : paint}
          roughness={0.26}
          metalness={0.45}
        />
      </mesh>
      {/* Tinted aerodynamic glass cabin */}
      <mesh position={[0, 0.4, 0.02]} castShadow={!wireframe}>
        <boxGeometry args={[0.62, 0.17, 0.78]} />
        <meshStandardMaterial
          color={wireframe ? '#1e293b' : '#1e293b'}
          roughness={0.14}
          metalness={0.75}
        />
      </mesh>
      {/* 4 dark tires */}
      {[
        [-0.36, 0.12, -0.44],
        [0.36, 0.12, -0.44],
        [-0.36, 0.12, 0.44],
        [0.36, 0.12, 0.44],
      ].map(([wx, wy, wz], wi) => (
        <mesh key={wi} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.11, 0.11, 0.08, 10]} />
          <meshStandardMaterial color={wireframe ? '#1e293b' : '#111827'} roughness={0.85} />
        </mesh>
      ))}
      {/* Nose EV charge status bar */}
      <mesh position={[0, 0.26, 0.72]}>
        <boxGeometry args={[0.42, 0.05, 0.03]} />
        <meshBasicMaterial color={charging ? led : wireframe ? '#334155' : '#64748b'} />
      </mesh>
    </group>
  );
}

/**
 * Open-bay 2-floor EV parking podium integrated underneath every building
 * with crisp white painted bay dividers, concrete floor slabs, perimeter
 * columns, safety rails, and sculpted parked EVs visible on both lower levels.
 */
function ParkingPodium({
  w,
  d,
  site,
  wireframe,
}: {
  w: number;
  d: number;
  site: HqSiteSummary;
  wireframe: boolean;
}) {
  const totalSlots = 12;
  const filledBays = Math.min(
    totalSlots,
    Math.max(
      site.evsConnected > 0 ? 6 : 0,
      Math.round((site.evsConnected / Math.max(1, site.totalBays)) * totalSlots),
    ),
  );
  const activeBays = site.online
    ? Math.min(
        filledBays,
        Math.max(
          site.activeBays > 0 ? 2 : 0,
          Math.round((site.activeBays / Math.max(1, site.totalBays)) * totalSlots),
        ),
      )
    : 0;
  const urgentBays = site.online ? Math.min(activeBays, site.urgentCount) : 0;

  const bayLayout = useMemo(() => {
    const items: Array<{
      floor: 0 | 1;
      x: number;
      y: number;
      z: number;
      hasCar: boolean;
      charging: boolean;
      urgent: boolean;
      paint: string;
    }> = [];
    const cols = 3;
    const xSpan = Math.max(2.6, w - 2.6);
    const colXs = Array.from({ length: cols }, (_, ci) => -xSpan / 2 + (ci / (cols - 1)) * xSpan);
    const zFront = d * 0.34;
    const zBack = -d * 0.34;

    let idx = 0;
    for (let floor = 0 as 0 | 1; floor <= 1; floor = (floor + 1) as 0 | 1) {
      const floorY = floor === 0 ? DECK_1_Y + 0.05 : DECK_2_Y + 0.05;
      for (const zPos of [zFront, zBack]) {
        for (let ci = 0; ci < cols; ci++) {
          const hasCar = idx < filledBays;
          const charging = hasCar && idx < activeBays;
          const urgent = charging && idx < urgentBays;
          items.push({
            floor,
            x: colXs[ci],
            y: floorY,
            z: zPos,
            hasCar,
            charging,
            urgent,
            paint: CAR_PAINTS[(idx + site.name.length) % CAR_PAINTS.length],
          });
          idx += 1;
        }
      }
    }
    return items;
  }, [w, d, filledBays, activeBays, urgentBays, site.name.length]);

  const colPositions = useMemo(() => {
    const hx = w / 2 - 0.16;
    const hz = d / 2 - 0.16;
    return [
      [-hx, -hz],
      [0, -hz],
      [hx, -hz],
      [-hx, hz],
      [0, hz],
      [hx, hz],
    ] as Array<[number, number]>;
  }, [w, d]);

  return (
    <group>
      {/* Floor 1 & Floor 2 crisp architectural concrete slabs + office transfer deck */}
      {[DECK_1_Y, DECK_2_Y, PODIUM_H - 0.08].map((sy, si) => (
        <mesh key={si} position={[0, sy, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
          <boxGeometry args={[w, 0.14, d]} />
          <meshStandardMaterial
            color={wireframe ? '#0b1120' : si === 2 ? '#efede7' : '#e6e4de'}
            roughness={0.78}
            metalness={0.05}
          />
        </mesh>
      ))}

      {/* Painted white bay lane dividers on Floor 1 & Floor 2 */}
      {!wireframe &&
        [DECK_1_Y + 0.075, DECK_2_Y + 0.075].map((ly, li) => (
          <group key={li}>
            {[-w * 0.24, w * 0.24].map((lx, xi) => (
              <mesh key={xi} position={[lx, ly, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[0.06, d * 0.88]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            ))}
          </group>
        ))}

      {/* Glazed & limestone elevator core spine */}
      <mesh position={[0, PODIUM_H / 2, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
        <boxGeometry args={[Math.max(2.0, w * 0.22), PODIUM_H - 0.16, Math.max(1.0, d * 0.16)]} />
        <meshStandardMaterial
          color={wireframe ? '#111827' : '#cbd5e1'}
          roughness={0.55}
          metalness={0.2}
        />
      </mesh>

      {/* Perimeter architectural structural columns */}
      {colPositions.map(([cx, cz], ci) => (
        <mesh key={ci} position={[cx, PODIUM_H / 2, cz]} castShadow={!wireframe}>
          <boxGeometry args={[0.3, PODIUM_H, 0.3]} />
          <meshStandardMaterial
            color={wireframe ? C.edgeDim : '#f1efe9'}
            roughness={0.5}
            metalness={0.15}
          />
        </mesh>
      ))}

      {/* Sleek safety parapet rails on Floor 2 */}
      {[-d / 2 + 0.08, d / 2 - 0.08].map((rz, ri) => (
        <mesh key={ri} position={[0, DECK_2_Y + 0.42, rz]}>
          <boxGeometry args={[w - 0.35, 0.07, 0.05]} />
          <meshStandardMaterial
            color={wireframe ? C.edgeDim : '#cbd5e1'}
            metalness={0.6}
            roughness={0.35}
          />
        </mesh>
      ))}

      {/* Warm recessed garage light strips on Floors 1 & 2 */}
      {!wireframe &&
        site.online &&
        [DECK_2_Y - 0.12, PODIUM_H - 0.18].map((ly, li) => (
          <mesh key={li} position={[0, ly, 0]}>
            <boxGeometry args={[w * 0.72, 0.035, 0.12]} />
            <meshBasicMaterial color="#fffbeb" />
          </mesh>
        ))}

      {/* Parked 3D EVs across both bottom levels */}
      {bayLayout.map(
        (bay, bi) =>
          bay.hasCar && (
            <ParkedEv
              key={bi}
              position={[bay.x, bay.y, bay.z]}
              paint={bay.paint}
              charging={bay.charging}
              urgent={bay.urgent}
              wireframe={wireframe}
            />
          ),
      )}
    </group>
  );
}

/**
 * Tilted south-facing steel-blue monocrystalline rooftop PV solar arrays
 * cleanly mounted on aluminum racks atop every building.
 */
function RooftopEquipment({
  part,
  solarTex,
  solarIntensity,
  wireframe,
  showHvac,
  online,
}: {
  part: Part;
  solarTex: THREE.Texture;
  solarIntensity: number;
  wireframe: boolean;
  showHvac: boolean;
  online: boolean;
}) {
  const roofY = part.py + part.h;
  const usableW = Math.max(2.0, part.w - 1.0);
  const usableD = Math.max(2.0, part.d - 1.0);

  const solarRows = useMemo(() => {
    if (part.solarOnlySouthTerrace) {
      const rowW = Math.max(2.2, part.w - 1.2);
      return [{ x: 0, z: part.d * 0.33, w: rowW, d: 1.0 }];
    }

    const reserveNorth = !part.skipRooftopEquipment && usableD >= 3.2;
    const southSpan = reserveNorth ? usableD * 0.68 : usableD;
    const startZ = reserveNorth ? part.d * 0.5 - 0.5 - southSpan : -southSpan * 0.5;
    const rowCount = southSpan >= 4.0 ? 4 : southSpan >= 2.5 ? 3 : 2;
    const stepZ = southSpan / rowCount;
    const panelD = Math.min(1.12, stepZ * 0.76);
    const rowW = Math.max(2.0, usableW);

    return Array.from({ length: rowCount }, (_, i) => ({
      x: 0,
      z: startZ + stepZ * (i + 0.5),
      w: rowW,
      d: panelD,
    }));
  }, [part.d, part.w, part.solarOnlySouthTerrace, part.skipRooftopEquipment, usableD, usableW]);

  const panelEdgesList = useMemo(
    () =>
      solarRows.map((row) => {
        const box = new THREE.BoxGeometry(row.w, 0.06, row.d);
        const edges = new THREE.EdgesGeometry(box);
        box.dispose();
        return edges;
      }),
    [solarRows],
  );
  useEffect(
    () => () => {
      panelEdgesList.forEach((e) => e.dispose());
    },
    [panelEdgesList],
  );

  const showMechanical = !part.skipRooftopEquipment && !part.solarOnlySouthTerrace;
  const mechZ = -part.d * 0.5 + 1.0;
  const mechW = Math.min(2.2, part.w * 0.28);

  return (
    <group position={[part.px, roofY, part.pz]}>
      {solarRows.map((row, idx) => (
        <group key={idx} position={[row.x, 0, row.z]}>
          {[-row.w * 0.36, 0, row.w * 0.36].map((rx, ri) => (
            <group key={ri} position={[rx, 0, 0]}>
              <mesh position={[0, 0.28, -row.d * 0.28]} castShadow={!wireframe}>
                <boxGeometry args={[0.06, 0.56, 0.06]} />
                <meshStandardMaterial
                  color={wireframe ? C.edgeDim : '#e2e8f0'}
                  metalness={0.6}
                  roughness={0.32}
                />
              </mesh>
              <mesh position={[0, 0.14, row.d * 0.28]} castShadow={!wireframe}>
                <boxGeometry args={[0.06, 0.28, 0.06]} />
                <meshStandardMaterial
                  color={wireframe ? C.edgeDim : '#e2e8f0'}
                  metalness={0.6}
                  roughness={0.32}
                />
              </mesh>
            </group>
          ))}

          <mesh
            key={wireframe ? 'pv-w' : 'pv-r'}
            position={[0, 0.38, 0]}
            rotation={[0.42, 0, 0]}
            castShadow={!wireframe}
            receiveShadow={!wireframe}
          >
            <boxGeometry args={[row.w, 0.06, row.d]} />
            {wireframe ? (
              <meshBasicMaterial color="#0b1120" />
            ) : (
              <meshStandardMaterial
                map={solarTex}
                metalness={0.55}
                roughness={0.22}
                emissive="#1d4ed8"
                emissiveIntensity={online ? 0.04 + solarIntensity * 0.1 : 0}
              />
            )}
          </mesh>
          {wireframe && (
            <lineSegments
              geometry={panelEdgesList[idx]}
              position={[0, 0.38, 0]}
              rotation={[0.42, 0, 0]}
            >
              <lineBasicMaterial color="#38bdf8" />
            </lineSegments>
          )}
        </group>
      ))}

      {showMechanical && (
        <group position={[0, 0, mechZ]}>
          <mesh position={[-part.w * 0.22, 0.4, 0]} castShadow={!wireframe}>
            <boxGeometry args={[mechW, 0.8, 1.0]} />
            <meshStandardMaterial
              color={wireframe ? '#0b1120' : '#e5e3dc'}
              roughness={0.65}
              metalness={0.18}
            />
          </mesh>

          {[part.w * 0.12, part.w * 0.28].map((cx, hi) => (
            <group key={hi} position={[cx, 0, 0]}>
              <mesh position={[0, 0.32, 0]} castShadow={!wireframe}>
                <boxGeometry args={[0.9, 0.64, 0.8]} />
                <meshStandardMaterial
                  color={wireframe ? '#0b1120' : '#cbd5e1'}
                  roughness={0.55}
                  metalness={0.3}
                />
              </mesh>
              <mesh position={[0, 0.68, 0]}>
                <cylinderGeometry args={[0.28, 0.3, 0.08, 12]} />
                <meshStandardMaterial
                  color={wireframe ? C.edge : '#64748b'}
                  roughness={0.45}
                  metalness={0.55}
                />
              </mesh>
              {showHvac && online && <HvacRing position={[0, 0.78, 0]} />}
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

export function BuildingMesh({
  site,
  selected,
  scenario,
  clockSlot,
  visualMode = 'realistic',
  room = 'gem-demo',
  onSelect,
}: BuildingMeshProps) {
  const { x, z, w, h, d, shape } = site.layout;
  const status = siteStatus(site);
  const unread = getUnreadNotifications(site);
  const wireframe = visualMode === 'wireframe';

  const [hovered, setHovered] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const openHover = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHovered(true);
  };

  const scheduleCloseHover = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setHovered(false);
      closeTimerRef.current = null;
    }, 120);
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  const upperBaseH = Math.max(4.6, h - 1.2);
  const parts = useMemo<Part[]>(() => {
    switch (shape) {
      case 'L':
        return [
          { w, h: upperBaseH, d: d * 0.55, px: 0, py: PODIUM_H, pz: -d * 0.225 },
          { w: w * 0.45, h: upperBaseH * 0.7, d: d * 0.45, px: -w * 0.275, py: PODIUM_H, pz: d * 0.275 },
        ];
      case 'tower':
        return [
          {
            w: w * 0.82,
            h: upperBaseH * 0.46,
            d: d * 0.82,
            px: 0,
            py: PODIUM_H,
            pz: 0,
            solarOnlySouthTerrace: true,
          },
          {
            w: w * 0.52,
            h: upperBaseH * 0.62,
            d: d * 0.52,
            px: 0,
            py: PODIUM_H + upperBaseH * 0.46,
            pz: -d * 0.08,
          },
        ];
      case 'twin':
        return [
          { w: w * 0.42, h: upperBaseH, d: d * 0.82, px: -w * 0.29, py: PODIUM_H, pz: 0 },
          { w: w * 0.42, h: upperBaseH * 0.84, d: d * 0.82, px: w * 0.29, py: PODIUM_H, pz: 0 },
        ];
      default:
        return [{ w, h: upperBaseH, d, px: 0, py: PODIUM_H, pz: 0 }];
    }
  }, [shape, w, d, upperBaseH]);

  const topPart = useMemo(
    () =>
      parts.reduce((best, p) => (p.py + p.h > best.py + best.h ? p : best), parts[0]),
    [parts],
  );
  const topY = topPart.py + topPart.h;

  const curtainTex = useMemo(
    () => getCurtainWallTexture(curtainStyleForSite(site.id), site.online),
    [site.id, site.online],
  );
  const solarTex = useMemo(() => getSolarPanelTexture(), []);
  const plazaTex = useMemo(() => getConcretePlazaTexture(), []);
  const roofTex = useMemo(() => getRoofMembraneTexture(), []);

  const partGeos = useMemo(
    () =>
      parts.map((p) => {
        const box = buildFacadeBoxGeometry(p.w, p.h, p.d);
        const edges = new THREE.EdgesGeometry(box);
        return { box, edges };
      }),
    [parts],
  );

  const bandGeos = useMemo(
    () =>
      parts.map((p) => {
        const flat: number[] = [];
        const floors = Math.floor(p.h / 2.6);
        for (let f = 1; f < floors; f++) {
          const y = p.py + f * 2.6;
          if (y >= p.py + p.h) break;
          const hw = p.w / 2 - 0.03;
          const hd = p.d / 2 - 0.03;
          const c: Array<[number, number, number]> = [
            [p.px - hw, y, p.pz - hd],
            [p.px + hw, y, p.pz - hd],
            [p.px + hw, y, p.pz + hd],
            [p.px - hw, y, p.pz + hd],
            [p.px - hw, y, p.pz - hd],
          ];
          for (let i = 0; i < c.length - 1; i++) flat.push(...c[i], ...c[i + 1]);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
        return g;
      }),
    [parts],
  );

  const plazaW = w + 3.0;
  const plazaD = d + 2.6;

  const plazaEdges = useMemo(() => {
    const box = new THREE.BoxGeometry(plazaW, 0.16, plazaD);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [plazaW, plazaD]);

  useEffect(
    () => () => {
      partGeos.forEach(({ box, edges }) => {
        box.dispose();
        edges.dispose();
      });
      bandGeos.forEach((g) => g.dispose());
      plazaEdges.dispose();
    },
    [partGeos, bandGeos, plazaEdges],
  );

  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: curtainTex,
        roughness: 0.42,
        metalness: 0.18,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const roofCapMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: roofTex,
        roughness: 0.85,
        metalness: 0.04,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    wallMat.map = curtainTex;
    wallMat.emissive.set('#000000');
    wallMat.emissiveMap = null;
    wallMat.emissiveIntensity = 0;
    wallMat.needsUpdate = true;
  }, [wallMat, curtainTex, site.online]);

  useEffect(() => {
    roofCapMat.map = roofTex;
    roofCapMat.needsUpdate = true;
  }, [roofCapMat, roofTex]);

  useEffect(
    () => () => {
      wallMat.dispose();
      roofCapMat.dispose();
    },
    [wallMat, roofCapMat],
  );

  const boxMaterials = useMemo(
    () => [wallMat, wallMat, roofCapMat, roofCapMat, wallMat, wallMat],
    [wallMat, roofCapMat],
  );

  const ringPts = useMemo(() => {
    const hw = plazaW / 2 + 0.3;
    const hd = plazaD / 2 + 0.3;
    return [
      [-hw, 0.09, -hd],
      [hw, 0.09, -hd],
      [hw, 0.09, hd],
      [-hw, 0.09, hd],
      [-hw, 0.09, -hd],
    ] as Array<[number, number, number]>;
  }, [plazaW, plazaD]);

  const ringRef = useRef<unknown>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const ring = ringRef.current as { material?: { opacity: number } } | null;
    if (ring?.material) {
      ring.material.opacity = site.online ? 0.65 + 0.25 * Math.sin(t * 3.0) : 0.25;
    }
    if (beaconRef.current) {
      const s = site.online ? 1 + 0.14 * Math.sin(t * 4.0) : 0.8;
      beaconRef.current.scale.setScalar(s);
    }
  });

  const solarIntensity = site.online
    ? Math.max(0.08, Math.min(1.1, site.currentSolarKw / Math.max(1, site.solarKwh * 0.18)))
    : 0;
  const showHvac = scenario === 'cold' && clockSlot <= 18;
  const expanded = hovered || selected;

  const handleSelect = () => onSelect(site.id);
  const pctOfCap = site.capKw > 0 ? Math.round((site.currentKw / site.capKw) * 100) : 0;
  const barWidthPct = Math.max(0, Math.min(100, pctOfCap));

  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => {
        e.stopPropagation();
        handleSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        openHover();
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        scheduleCloseHover();
      }}
    >
      {/* Subtle ground AO shadow apron beneath building courtyard */}
      {!wireframe && (
        <mesh position={[0, 0.015, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[plazaW + 1.0, plazaD + 1.0]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.11} depthWrite={false} />
        </mesh>
      )}

      {/* Alabaster limestone campus plaza slab */}
      <mesh
        key={wireframe ? 'plaza-w' : 'plaza-r'}
        position={[0, 0.04, 0]}
        receiveShadow={!wireframe}
      >
        <boxGeometry args={[plazaW, 0.08, plazaD]} />
        {wireframe ? (
          <meshBasicMaterial color="#0b1120" />
        ) : (
          <meshStandardMaterial map={plazaTex} roughness={0.86} metalness={0.03} />
        )}
      </mesh>
      {wireframe && (
        <lineSegments geometry={plazaEdges} position={[0, 0.08, 0]}>
          <lineBasicMaterial color={C.edgeDim} />
        </lineSegments>
      )}

      {/* Open 2-Floor Parking Podium underneath the building (parked EVs on Floors 1 & 2) */}
      <ParkingPodium w={w} d={d} site={site} wireframe={wireframe} />

      {/* Twin-tower glazed skybridge */}
      {shape === 'twin' && (
        <mesh
          key={wireframe ? 'bridge-w' : 'bridge-r'}
          position={[0, PODIUM_H + upperBaseH * 0.45, 0]}
          castShadow={!wireframe}
          receiveShadow={!wireframe}
        >
          <boxGeometry args={[w * 0.2, upperBaseH * 0.26, d * 0.34]} />
          {wireframe ? (
            <meshBasicMaterial color="#0b1120" />
          ) : (
            <meshStandardMaterial map={curtainTex} roughness={0.4} metalness={0.2} />
          )}
        </mesh>
      )}

      {/* Upper architectural office volumes + rooftop solar panels */}
      {parts.map((p, i) => {
        const finCount = Math.max(2, Math.floor(p.w / 2.2));
        return (
          <group key={i}>
            <group position={[p.px, p.py, p.pz]}>
              {wireframe ? (
                <mesh key="part-w" geometry={partGeos[i].box} position={[0, p.h / 2, 0]}>
                  <meshBasicMaterial color="#0b1120" />
                </mesh>
              ) : (
                <mesh
                  key="part-r"
                  geometry={partGeos[i].box}
                  position={[0, p.h / 2, 0]}
                  material={boxMaterials}
                  castShadow
                  receiveShadow
                />
              )}

              {wireframe && (
                <lineSegments geometry={partGeos[i].edges} position={[0, p.h / 2, 0]}>
                  <lineBasicMaterial
                    color={selected ? '#f1f5f9' : site.online ? C.edge : C.slate}
                  />
                </lineSegments>
              )}

              {/* Delicate champagne-aluminum vertical architectural mullions */}
              {!wireframe &&
                Array.from({ length: finCount }, (_, fi) => {
                  const fx = -p.w * 0.42 + (fi / Math.max(1, finCount - 1)) * (p.w * 0.84);
                  return (
                    <mesh
                      key={fi}
                      position={[fx, p.h * 0.5, p.d * 0.5 + 0.05]}
                      castShadow
                    >
                      <boxGeometry args={[0.07, p.h * 0.94, 0.1]} />
                      <meshStandardMaterial color="#e5e3dc" metalness={0.3} roughness={0.45} />
                    </mesh>
                  );
                })}

              {/* Clean chamfered pale limestone roof cornice parapet */}
              {[
                { pos: [0, p.h + 0.14, p.d / 2 - 0.1] as [number, number, number], size: [p.w + 0.08, 0.28, 0.2] as [number, number, number] },
                { pos: [0, p.h + 0.14, -p.d / 2 + 0.1] as [number, number, number], size: [p.w + 0.08, 0.28, 0.2] as [number, number, number] },
                { pos: [-p.w / 2 + 0.1, p.h + 0.14, 0] as [number, number, number], size: [0.2, 0.28, p.d] as [number, number, number] },
                { pos: [p.w / 2 - 0.1, p.h + 0.14, 0] as [number, number, number], size: [0.2, 0.28, p.d] as [number, number, number] },
              ].map((rail, ri) => (
                <mesh key={ri} position={rail.pos} castShadow={!wireframe}>
                  <boxGeometry args={rail.size} />
                  <meshStandardMaterial
                    color={wireframe ? '#0b1120' : '#f1efe9'}
                    roughness={0.62}
                    metalness={0.1}
                  />
                </mesh>
              ))}

              {/* Subtle restrained status accent trim on front cornice */}
              {i === 0 && (
                <mesh position={[0, p.h + 0.28, p.d / 2 - 0.04]}>
                  <boxGeometry args={[p.w * 0.45, 0.05, 0.06]} />
                  <meshBasicMaterial color={status.hex} />
                </mesh>
              )}
            </group>

            {wireframe && bandGeos[i].getAttribute('position')?.count > 0 && (
              <lineSegments geometry={bandGeos[i]}>
                <lineBasicMaterial color={C.edgeDim} transparent opacity={0.65} />
              </lineSegments>
            )}

            {/* Tilted deep-blue monocrystalline PV solar panels on top of every building part */}
            <RooftopEquipment
              part={p}
              solarTex={solarTex}
              solarIntensity={solarIntensity}
              wireframe={wireframe}
              showHvac={showHvac}
              online={site.online}
            />
          </group>
        );
      })}

      {/* Restrained Apple Maps selection/status perimeter ring */}
      <Line
        ref={ringRef as never}
        points={ringPts}
        color={status.hex}
        transparent
        opacity={site.online ? 0.75 : 0.25}
        lineWidth={selected ? 2.5 : 1.5}
      />

      {/* Compact rooftop status pin orb */}
      <mesh ref={beaconRef} position={[topPart.px, topY + 1.15, topPart.pz]}>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshBasicMaterial color={site.online ? status.hex : '#94a3b8'} />
      </mesh>

      {/* Apple Maps DCE crisp white floating pill pin & helper bubble */}
      <Html
        position={[topPart.px, topY + 2.75, topPart.pz]}
        center
        zIndexRange={expanded ? [120, 60] : [50, 0]}
      >
        <div
          onPointerEnter={openHover}
          onPointerLeave={scheduleCloseHover}
          onClick={(e) => {
            e.stopPropagation();
            handleSelect();
          }}
          className="select-none font-sans"
          style={{ pointerEvents: 'auto' }}
        >
          {!expanded ? (
            <div
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1.5 text-[11.5px] font-medium transition-all"
              style={{
                background: 'rgba(255, 255, 255, 0.95)',
                color: '#111827',
                border: '1px solid rgba(15, 23, 42, 0.08)',
                borderRadius: '9999px',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.14)',
              }}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: status.hex }}
              />
              <span className="font-semibold text-[#111827]">{site.name}</span>
              <span className="font-mono text-[10.5px] text-[#4b5563] tabular-nums">
                {Math.round(site.currentKw)} kW
              </span>
              {site.sellToGrid && site.currentExportKw > 0 && (
                <span className="rounded-full bg-[#ecfdf5] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[#0d9488] tabular-nums">
                  ↗ +{Math.round(site.currentExportKw)} kW
                </span>
              )}
              {unread > 0 && (
                <span
                  className="inline-block h-2 w-2 rounded-full bg-[#f59e0b]"
                  title={`${unread} routing update(s)`}
                />
              )}
            </div>
          ) : (
            <div
              className="w-[276px] p-4"
              style={{
                background: 'rgba(255, 255, 255, 0.98)',
                color: '#111827',
                border: '1px solid rgba(15, 23, 42, 0.1)',
                borderRadius: '14px',
                boxShadow: '0 14px 32px rgba(15, 23, 42, 0.18)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: status.hex }}
                    />
                    <div className="truncate text-[13px] font-semibold text-[#111827]">
                      {site.name}
                    </div>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#6b7280]">{site.role}</div>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: site.online ? '#ecfdf5' : '#f3f4f6',
                    color: site.online ? '#059669' : '#6b7280',
                  }}
                >
                  {status.label}
                </span>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] tabular-nums">
                  <span className="text-[#6b7280]">Power draw</span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {Math.round(site.currentKw)} / {site.capKw} kW ({pctOfCap}%)
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: '#f1f5f9' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${barWidthPct}%`,
                      backgroundColor: status.hex,
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                <div className="rounded-lg bg-[#f8fafc] px-2.5 py-1.5">
                  <div className="text-[10px] text-[#6b7280]">Rooftop Solar</div>
                  <div className="font-mono font-semibold text-[#d97706]">
                    {Math.round(site.currentSolarKw)} kW
                  </div>
                </div>
                <div className="rounded-lg bg-[#f8fafc] px-2.5 py-1.5">
                  <div className="text-[10px] text-[#6b7280]">
                    {site.sellToGrid ? 'Selling to Grid' : 'Parked EVs'}
                  </div>
                  <div
                    className={`font-mono font-semibold ${
                      site.sellToGrid ? 'text-[#0d9488]' : 'text-[#059669]'
                    }`}
                  >
                    {site.sellToGrid
                      ? `+${Math.round(site.currentExportKw)} kW`
                      : `${site.activeBays} / ${site.totalBays} bays`}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                {unread > 0 ? (
                  <span className="text-[11px] font-medium text-[#b45309]">
                    {unread} routing alert
                  </span>
                ) : (
                  <span className="text-[11px] text-[#6b7280]">
                    Ready {Math.round(site.readyPct)}%
                  </span>
                )}
                <a
                  href={`/sites/${site.id}?room=${encodeURIComponent(room || 'gem-demo')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-sans text-[11px] font-semibold no-underline transition-colors hover:no-underline"
                  style={{
                    backgroundColor: '#111827',
                    color: '#ffffff',
                  }}
                >
                  Open Dashboard ↗
                </a>
              </div>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
