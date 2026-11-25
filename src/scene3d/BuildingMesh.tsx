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
  // Status accents
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  slate: '#64748b',
  sky: '#38bdf8',
  frost: '#bae6fd',
  // Compatibility aliases
  panel: '#0f2850',
  line: '#1e293b',
  lineBright: '#38bdf8',
  ink: '#f1f5f9',
  green: '#10b981',
  red: '#f43f5e',
};

export interface SiteStatus {
  hex: string;
  label: string;
}

/** Live status colour: isolated → breach → optimized → alert → baseline. */
export function siteStatus(site: HqSiteSummary): SiteStatus {
  if (!site.online) return { hex: C.slate, label: 'OFFLINE' };
  const breaching = site.breaching || site.currentKw > site.capKw;
  if (breaching) return { hex: C.rose, label: 'BREACH' };
  if (site.optimized && !site.failSafe && site.currentKw <= site.capKw) {
    return { hex: C.emerald, label: 'OPTIMIZED' };
  }
  if (site.failSafe || site.urgentCount > 0 || site.planStatus === 'PENDING') {
    return { hex: C.amber, label: 'ALERT' };
  }
  return { hex: C.sky, label: 'BASELINE' };
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

/** World height of the white 1.0x cap collar on each load meter pillar. */
const PILLAR_H = 12;

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

/** Creates a BoxGeometry whose 4 vertical facades map cleanly to real-world meters. */
function buildFacadeBoxGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face groups: 0:+X (d×h), 1:-X (d×h), 2:+Y, 3:-Y, 4:+Z (w×h), 5:-Z (w×h)
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

function entranceTransform(
  shape: HqSiteSummary['layout']['shape'],
  w: number,
  d: number,
): { x: number; z: number; maxW: number } {
  switch (shape) {
    case 'L':
      return { x: -w * 0.275, z: d * 0.5 - 0.15, maxW: w * 0.38 };
    case 'tower':
      return { x: 0, z: d * 0.38 - 0.15, maxW: w * 0.48 };
    case 'twin':
      return { x: -w * 0.29, z: d * 0.4 - 0.15, maxW: w * 0.34 };
    default:
      return { x: 0, z: d * 0.5 - 0.15, maxW: w * 0.48 };
  }
}

/** Expanding frost-blue rooftop ring, visible on cold mornings (slot <= 18). */
function HvacRing({ position }: { position: [number, number, number] }) {
  const ref = useRef<unknown>(null);
  const pts = useMemo(() => {
    const arr: Array<[number, number, number]> = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      arr.push([Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75]);
    }
    return arr;
  }, []);
  useFrame((state) => {
    const ring = ref.current as
      | { scale?: { setScalar: (n: number) => void }; material?: { opacity: number } }
      | null;
    if (!ring?.scale || !ring.material) return;
    const k = (state.clock.elapsedTime * 0.5) % 1;
    ring.scale.setScalar(1 + k * 2.8);
    ring.material.opacity = 0.65 * (1 - k);
  });
  return (
    <Line
      ref={ref as never}
      points={pts}
      position={position}
      color={C.frost}
      transparent
      opacity={0.6}
      lineWidth={1.5}
    />
  );
}

/**
 * Tilted south-facing rooftop PV solar panel rows on aluminum racking rails,
 * paired with a rooftop mechanical penthouse and dual HVAC chillers.
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
  const usableW = Math.max(1.8, part.w - 1.1);
  const usableD = Math.max(1.8, part.d - 1.1);

  const solarRows = useMemo(() => {
    if (part.solarOnlySouthTerrace) {
      // South terrace in front of upper tower setback
      const rowW = Math.max(2.2, part.w - 1.4);
      const rowD = 0.85;
      return [{ x: 0, z: part.d * 0.34, w: rowW, d: rowD }];
    }

    // Reserve north-west corner for mechanical penthouse + dual HVAC chillers when deep enough
    const reserveNorth = !part.skipRooftopEquipment && usableD >= 3.2;
    const southSpan = reserveNorth ? usableD * 0.64 : usableD;
    const startZ = reserveNorth ? part.d * 0.5 - 0.55 - southSpan : -southSpan * 0.5;
    const rowCount = southSpan >= 4.2 ? 4 : southSpan >= 2.7 ? 3 : 2;
    const stepZ = southSpan / rowCount;
    const panelD = Math.min(1.05, stepZ * 0.72);
    const rowW = Math.max(1.8, usableW);

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
  const mechZ = -part.d * 0.5 + 1.05;
  const mechW = Math.min(2.2, part.w * 0.28);

  return (
    <group position={[part.px, roofY, part.pz]}>
      {/* Tilted south-facing PV solar arrays */}
      {solarRows.map((row, idx) => (
        <group key={idx} position={[row.x, 0, row.z]}>
          {/* Aluminum racking legs / rails */}
          {[-row.w * 0.36, 0, row.w * 0.36].map((rx, ri) => (
            <group key={ri} position={[rx, 0, 0]}>
              <mesh position={[0, 0.28, -row.d * 0.28]} castShadow={!wireframe}>
                <boxGeometry args={[0.06, 0.56, 0.06]} />
                <meshStandardMaterial
                  color={wireframe ? C.edgeDim : '#94a3b8'}
                  metalness={0.65}
                  roughness={0.35}
                />
              </mesh>
              <mesh position={[0, 0.14, row.d * 0.28]} castShadow={!wireframe}>
                <boxGeometry args={[0.06, 0.28, 0.06]} />
                <meshStandardMaterial
                  color={wireframe ? C.edgeDim : '#94a3b8'}
                  metalness={0.65}
                  roughness={0.35}
                />
              </mesh>
            </group>
          ))}

          {/* Tilted crystalline silicon PV module row (~0.42 rad facing +Z south) */}
          <mesh
            key={wireframe ? 'pv-w' : 'pv-r'}
            position={[0, 0.36, 0]}
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
                roughness={0.28}
                emissive={C.amber}
                emissiveIntensity={online ? solarIntensity * 0.55 : 0}
              />
            )}
          </mesh>
          {wireframe && (
            <lineSegments
              geometry={panelEdgesList[idx]}
              position={[0, 0.36, 0]}
              rotation={[0.42, 0, 0]}
            >
              <lineBasicMaterial color={C.amber} />
            </lineSegments>
          )}
        </group>
      ))}

      {/* Rooftop mechanical penthouse + dual HVAC chillers */}
      {showMechanical && (
        <group position={[0, 0, mechZ]}>
          {/* Mechanical louver penthouse */}
          <mesh position={[-part.w * 0.22, 0.45, 0]} castShadow={!wireframe}>
            <boxGeometry args={[mechW, 0.9, 1.1]} />
            <meshStandardMaterial
              color={wireframe ? '#0b1120' : '#475569'}
              roughness={0.75}
              metalness={0.3}
            />
          </mesh>

          {/* Dual HVAC chillers */}
          {[part.w * 0.12, part.w * 0.28].map((cx, hi) => (
            <group key={hi} position={[cx, 0, 0]}>
              <mesh position={[0, 0.35, 0]} castShadow={!wireframe}>
                <boxGeometry args={[0.95, 0.7, 0.85]} />
                <meshStandardMaterial
                  color={wireframe ? '#0b1120' : '#64748b'}
                  roughness={0.6}
                  metalness={0.45}
                />
              </mesh>
              <mesh position={[0, 0.74, 0]}>
                <cylinderGeometry args={[0.3, 0.32, 0.1, 12]} />
                <meshStandardMaterial
                  color={wireframe ? C.edge : '#1e293b'}
                  roughness={0.5}
                  metalness={0.6}
                />
              </mesh>
              {showHvac && online && <HvacRing position={[0, 0.84, 0]} />}
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

  const parts = useMemo<Part[]>(() => {
    switch (shape) {
      case 'L':
        return [
          { w, h, d: d * 0.55, px: 0, py: 0, pz: -d * 0.225 },
          { w: w * 0.45, h: h * 0.72, d: d * 0.45, px: -w * 0.275, py: 0, pz: d * 0.275 },
        ];
      case 'tower':
        return [
          {
            w: w * 0.76,
            h: h * 0.52,
            d: d * 0.76,
            px: 0,
            py: 0,
            pz: 0,
            solarOnlySouthTerrace: true,
          },
          {
            w: w * 0.48,
            h: h * 0.66,
            d: d * 0.48,
            px: 0,
            py: h * 0.52,
            pz: -d * 0.08,
          },
        ];
      case 'twin':
        return [
          { w: w * 0.42, h, d: d * 0.8, px: -w * 0.29, py: 0, pz: 0 },
          { w: w * 0.42, h: h * 0.85, d: d * 0.8, px: w * 0.29, py: 0, pz: 0 },
        ];
      default:
        return [{ w, h, d, px: 0, py: 0, pz: 0 }];
    }
  }, [shape, w, h, d]);

  const topPart = useMemo(
    () =>
      parts.reduce((best, p) => (p.py + p.h > best.py + best.h ? p : best), parts[0]),
    [parts],
  );
  const topY = topPart.py + topPart.h;
  const entrance = useMemo(() => entranceTransform(shape, w, d), [shape, w, d]);

  const curtainTex = useMemo(
    () => getCurtainWallTexture(curtainStyleForSite(site.id), site.online),
    [site.id, site.online],
  );
  const solarTex = useMemo(() => getSolarPanelTexture(), []);
  const plazaTex = useMemo(() => getConcretePlazaTexture(), []);
  const roofTex = useMemo(() => getRoofMembraneTexture(), []);

  // Custom aspect-correct BoxGeometries + wireframe edge geometries per building part.
  const partGeos = useMemo(
    () =>
      parts.map((p) => {
        const box = buildFacadeBoxGeometry(p.w, p.h, p.d);
        const edges = new THREE.EdgesGeometry(box);
        return { box, edges };
      }),
    [parts],
  );

  // Blueprint floor-band lines for wireframe mode.
  const bandGeos = useMemo(
    () =>
      parts.map((p) => {
        const flat: number[] = [];
        const floors = Math.floor(p.h / 3);
        for (let f = 1; f < floors; f++) {
          const y = p.py + f * 3;
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

  const plazaW = w + 2.8;
  const plazaD = d + 2.2;

  const plazaEdges = useMemo(() => {
    const box = new THREE.BoxGeometry(plazaW, 0.24, plazaD);
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

  // Stable materials array for realistic multi-story facades (4 walls glazed, top/bottom membrane/slate).
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: curtainTex,
        roughness: 0.35,
        metalness: 0.32,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const roofCapMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: roofTex,
        roughness: 0.9,
        metalness: 0.05,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    wallMat.map = curtainTex;
    wallMat.emissive.set(site.online ? '#fbbf24' : '#000000');
    wallMat.emissiveMap = site.online ? curtainTex : null;
    wallMat.emissiveIntensity = site.online ? 0.22 : 0;
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

  // Pulsing status perimeter ring around the campus plaza.
  const ringPts = useMemo(() => {
    const hw = plazaW / 2 + 0.45;
    const hd = plazaD / 2 + 0.45;
    return [
      [-hw, 0.14, -hd],
      [hw, 0.14, -hd],
      [hw, 0.14, hd],
      [-hw, 0.14, hd],
      [-hw, 0.14, -hd],
    ] as Array<[number, number, number]>;
  }, [plazaW, plazaD]);

  const ringRef = useRef<unknown>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const ring = ringRef.current as { material?: { opacity: number } } | null;
    if (ring?.material) {
      ring.material.opacity = site.online ? 0.55 + 0.4 * Math.sin(t * 3.5) : 0.25;
    }
    if (beaconRef.current) {
      const s = site.online ? 1 + 0.22 * Math.sin(t * 4.5) : 0.75;
      beaconRef.current.scale.setScalar(s);
    }
  });

  // 3D vertical load gauge beside the building.
  const ratio = site.online && site.capKw > 0 ? site.currentKw / site.capKw : 0;
  const pillarH = site.online ? Math.max(0.08, Math.min(1.75, ratio)) * PILLAR_H : 0.04;
  const solarIntensity = site.online
    ? Math.max(0.08, Math.min(1.2, site.currentSolarKw / Math.max(1, site.solarKwh * 0.18)))
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
      {/* Architectural campus plaza slab */}
      <mesh
        key={wireframe ? 'plaza-w' : 'plaza-r'}
        position={[0, 0.12, 0]}
        receiveShadow={!wireframe}
      >
        <boxGeometry args={[plazaW, 0.24, plazaD]} />
        {wireframe ? (
          <meshBasicMaterial color="#0b1120" />
        ) : (
          <meshStandardMaterial map={plazaTex} roughness={0.88} metalness={0.04} />
        )}
      </mesh>
      {wireframe && (
        <lineSegments geometry={plazaEdges} position={[0, 0.12, 0]}>
          <lineBasicMaterial color={C.edgeDim} />
        </lineSegments>
      )}

      {/* Recessed dark-glass ground lobby + cantilevered architectural entrance canopy */}
      <group position={[entrance.x, 0.24, entrance.z]}>
        <mesh position={[0, 0.72, 0.12]} castShadow={!wireframe}>
          <boxGeometry args={[Math.min(4.4, entrance.maxW), 1.44, 0.7]} />
          <meshStandardMaterial
            color={wireframe ? '#0b1120' : site.online ? '#17253b' : '#090d16'}
            emissive={site.online && !wireframe ? '#f59e0b' : '#000000'}
            emissiveIntensity={site.online && !wireframe ? 0.35 : 0}
            roughness={0.2}
            metalness={0.5}
          />
        </mesh>
        {/* Cantilevered entrance canopy */}
        <mesh position={[0, 1.56, 0.72]} castShadow={!wireframe}>
          <boxGeometry args={[Math.min(5.0, entrance.maxW + 0.6), 0.12, 1.45]} />
          <meshStandardMaterial
            color={wireframe ? '#0b1120' : '#94a3b8'}
            roughness={0.4}
            metalness={0.6}
          />
        </mesh>
        {/* Entrance status strip */}
        <mesh position={[0, 1.51, 1.44]}>
          <boxGeometry args={[Math.min(4.8, entrance.maxW + 0.4), 0.04, 0.04]} />
          <meshBasicMaterial color={status.hex} />
        </mesh>
      </group>

      {/* Twin-tower glazed skybridge */}
      {shape === 'twin' && (
        <mesh
          key={wireframe ? 'bridge-w' : 'bridge-r'}
          position={[0, h * 0.46, 0]}
          castShadow={!wireframe}
          receiveShadow={!wireframe}
        >
          <boxGeometry args={[w * 0.2, h * 0.2, d * 0.34]} />
          {wireframe ? (
            <meshBasicMaterial color="#0b1120" />
          ) : (
            <meshStandardMaterial
              map={curtainTex}
              roughness={0.3}
              metalness={0.4}
              emissive={site.online ? '#fbbf24' : '#000000'}
              emissiveIntensity={site.online ? 0.18 : 0}
            />
          )}
        </mesh>
      )}

      {/* Main architectural volumes + roof parapets + brise-soleil fins + rooftop solar */}
      {parts.map((p, i) => {
        const finCount = Math.max(2, Math.floor(p.w / 2.1));
        return (
          <group key={i}>
            <group position={[p.px, p.py, p.pz]}>
              {/* Curtain-wall volume */}
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

              {/* Wireframe CAD edges */}
              {wireframe && (
                <lineSegments geometry={partGeos[i].edges} position={[0, p.h / 2, 0]}>
                  <lineBasicMaterial
                    color={selected ? '#f1f5f9' : site.online ? C.edge : C.slate}
                  />
                </lineSegments>
              )}

              {/* Subtle vertical brise-soleil facade fins (front +Z and rear -Z) */}
              {!wireframe &&
                Array.from({ length: finCount }, (_, fi) => {
                  const fx = -p.w * 0.42 + (fi / Math.max(1, finCount - 1)) * (p.w * 0.84);
                  return (
                    <mesh
                      key={fi}
                      position={[fx, p.h * 0.54, p.d * 0.5 + 0.08]}
                      castShadow
                    >
                      <boxGeometry args={[0.09, p.h * 0.84, 0.16]} />
                      <meshStandardMaterial color="#64748b" metalness={0.55} roughness={0.4} />
                    </mesh>
                  );
                })}

              {/* Extruded roof parapet cornice */}
              {[
                { pos: [0, p.h + 0.16, p.d / 2 - 0.1] as [number, number, number], size: [p.w + 0.08, 0.34, 0.2] as [number, number, number] },
                { pos: [0, p.h + 0.16, -p.d / 2 + 0.1] as [number, number, number], size: [p.w + 0.08, 0.34, 0.2] as [number, number, number] },
                { pos: [-p.w / 2 + 0.1, p.h + 0.16, 0] as [number, number, number], size: [0.2, 0.34, p.d] as [number, number, number] },
                { pos: [p.w / 2 - 0.1, p.h + 0.16, 0] as [number, number, number], size: [0.2, 0.34, p.d] as [number, number, number] },
              ].map((rail, ri) => (
                <mesh key={ri} position={rail.pos} castShadow={!wireframe}>
                  <boxGeometry args={rail.size} />
                  <meshStandardMaterial
                    color={wireframe ? '#0b1120' : '#94a3b8'}
                    roughness={0.75}
                    metalness={0.18}
                  />
                </mesh>
              ))}

              {/* Perimeter parapet LED status strip on primary volume */}
              {i === 0 && (
                <mesh position={[0, p.h + 0.34, p.d / 2 - 0.04]}>
                  <boxGeometry args={[p.w, 0.06, 0.08]} />
                  <meshBasicMaterial color={status.hex} />
                </mesh>
              )}
            </group>

            {wireframe && bandGeos[i].getAttribute('position')?.count > 0 && (
              <lineSegments geometry={bandGeos[i]}>
                <lineBasicMaterial color={C.edgeDim} transparent opacity={0.65} />
              </lineSegments>
            )}

            {/* Mandatory tilted south-facing rooftop PV solar array + HVAC on every building part */}
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

      {/* Live status perimeter ring */}
      <Line
        ref={ringRef as never}
        points={ringPts}
        color={status.hex}
        transparent
        opacity={site.online ? 0.9 : 0.3}
        lineWidth={selected ? 2.5 : 1.5}
      />

      {/* Roof status beacon (off/dark when isolated) */}
      <mesh ref={beaconRef} position={[topPart.px, topY + 1.35, topPart.pz]}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshBasicMaterial color={site.online ? status.hex : '#1e293b'} />
      </mesh>

      {/* Sleek 3D Vertical Load Gauge beside building */}
      <group position={[w / 2 + 2.6, 0, 0]}>
        {/* Pedestal */}
        <mesh position={[0, 0.1, 0]} receiveShadow={!wireframe}>
          <boxGeometry args={[1.9, 0.2, 1.9]} />
          <meshStandardMaterial
            color={wireframe ? '#0b1120' : '#1e293b'}
            roughness={0.6}
            metalness={0.4}
          />
        </mesh>

        {/* Outer structural frame rails up to 1.35x cap */}
        {[
          [-0.72, -0.72],
          [0.72, -0.72],
          [-0.72, 0.72],
          [0.72, 0.72],
        ].map(([gx, gz], gi) => (
          <mesh key={gi} position={[gx, (PILLAR_H * 1.35) / 2, gz]}>
            <boxGeometry args={[0.05, PILLAR_H * 1.35, 0.05]} />
            <meshBasicMaterial color={wireframe ? C.edgeDim : '#475569'} />
          </mesh>
        ))}

        {/* Live load bar */}
        <mesh position={[0, 0.2 + pillarH / 2, 0]} scale={[1, pillarH, 1]}>
          <boxGeometry args={[1.05, 1, 1.05]} />
          <meshStandardMaterial
            color={status.hex}
            emissive={site.online ? status.hex : '#000000'}
            emissiveIntensity={site.online ? 0.55 : 0}
            roughness={0.35}
          />
        </mesh>

        {/* Crisp white 1.0x CAP marker ring */}
        <mesh position={[0, PILLAR_H, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[1.1, 1.55, 32]} />
          <meshBasicMaterial color="#f8fafc" side={THREE.DoubleSide} transparent opacity={0.95} />
        </mesh>
      </group>

      {/* Interactive Building Stats Helper Bubble */}
      <Html
        position={[topPart.px, topY + 3.1, topPart.pz]}
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
            /* Resting crisp white Swiss map pin */
            <div
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-2.5 py-1 text-[11.5px] font-semibold tracking-tight transition-all"
              style={{
                background: 'rgba(255, 255, 255, 0.96)',
                color: '#141413',
                border: '1px solid #d6d3cb',
                borderRadius: '6px',
                boxShadow: '0 2px 8px rgba(20, 20, 19, 0.14)',
              }}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: status.hex }}
              />
              <span className="font-semibold text-[#141413]">{site.name}</span>
              <span className="font-mono text-[10.5px] font-medium text-[#57564f] tabular-nums">
                {Math.round(site.currentKw)}/{site.capKw} kW
              </span>
              {unread > 0 && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-[#b45309]"
                  title={`${unread} agent alert(s)`}
                />
              )}
            </div>
          ) : (
            /* Expanded white Swiss map helper card */
            <div
              className="w-[288px] p-3.5"
              style={{
                background: 'rgba(255, 255, 255, 0.98)',
                color: '#141413',
                border: '1px solid #d6d3cb',
                borderRadius: '6px',
                boxShadow: '0 10px 28px rgba(20, 20, 19, 0.18)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: status.hex }}
                    />
                    <div className="truncate text-xs font-bold tracking-tight text-[#141413]">
                      {site.name}
                    </div>
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-medium text-[#86847b]">
                    {site.role}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className="rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase"
                    style={{
                      backgroundColor: site.online ? '#f0fdfa' : '#efeee9',
                      border: site.online ? '1px solid #ccfbf1' : '1px solid #e5e3dc',
                      color: site.online ? '#0f766e' : '#57564f',
                    }}
                  >
                    {site.online ? 'Online' : 'Isolated'}
                  </span>
                  {unread > 0 && (
                    <span
                      className="rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase"
                      style={{
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        color: '#b45309',
                      }}
                    >
                      Alert · {unread}
                    </span>
                  )}
                </div>
              </div>

              {/* Live Grid Load Bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between font-mono text-[10.5px] tabular-nums">
                  <span className="text-[#86847b]">Grid Load</span>
                  <span className="font-semibold text-[#141413]">
                    {Math.round(site.currentKw)} / {site.capKw} kW ({pctOfCap}%)
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: '#efeee9' }}
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

              {/* Power breakdown & EV fleet metrics */}
              <div
                className="mt-3 grid grid-cols-3 gap-1.5 border-y py-2.5 font-mono text-[10.5px] tabular-nums"
                style={{ borderColor: '#e5e3dc' }}
              >
                <div className="rounded px-2 py-1" style={{ backgroundColor: '#faf9f6' }}>
                  <div className="text-[9px] text-[#86847b]">Building</div>
                  <div className="font-semibold text-[#1d4ed8]">
                    {Math.round(site.currentBuildingKw)} kW
                  </div>
                </div>
                <div className="rounded px-2 py-1" style={{ backgroundColor: '#faf9f6' }}>
                  <div className="text-[9px] text-[#86847b]">EV</div>
                  <div className="font-semibold text-[#0f766e]">
                    {Math.round(site.currentEvKw)} kW
                  </div>
                </div>
                <div className="rounded px-2 py-1" style={{ backgroundColor: '#faf9f6' }}>
                  <div className="text-[9px] text-[#86847b]">Solar</div>
                  <div className="font-semibold text-[#b45309]">
                    {Math.round(site.currentSolarKw)} kW
                  </div>
                </div>
                <div className="rounded px-2 py-1" style={{ backgroundColor: '#faf9f6' }}>
                  <div className="text-[9px] text-[#86847b]">EV Bays</div>
                  <div className="font-semibold text-[#141413]">
                    {site.activeBays}/{site.totalBays}
                  </div>
                </div>
                <div className="rounded px-2 py-1" style={{ backgroundColor: '#faf9f6' }}>
                  <div className="text-[9px] text-[#86847b]">Ready</div>
                  <div className="font-semibold text-[#141413]">{Math.round(site.readyPct)}%</div>
                </div>
                <div className="rounded px-2 py-1" style={{ backgroundColor: '#faf9f6' }}>
                  <div className="text-[9px] text-[#86847b]">Saving</div>
                  <div className="font-semibold text-[#0f766e]">
                    €{Math.round(site.dailySavingEur)}
                  </div>
                </div>
              </div>

              {/* Direct Dashboard Link */}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span
                  className="font-mono text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: status.hex }}
                >
                  {status.label}
                </span>
                <a
                  href={`/sites/${site.id}?room=${encodeURIComponent(room || 'gem-demo')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 font-sans text-[11px] font-semibold no-underline transition-colors hover:no-underline"
                  style={{
                    backgroundColor: '#141413',
                    color: '#ffffff',
                    borderRadius: '6px',
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
