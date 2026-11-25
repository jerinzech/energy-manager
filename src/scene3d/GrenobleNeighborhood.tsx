import { Component, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls, Sky } from '@react-three/drei';
import type { HqSiteSummary, HqSnapshot, ScenarioKey, SiteId } from '../engine';
import { AlpineMountains } from './AlpineMountains';
import { BuildingMesh, C } from './BuildingMesh';
import { SolarCarport } from './SolarCarport';
import { SubstationConduits } from './SubstationConduits';
import { getAsphaltRoadTexture } from './textures';

export type CameraPreset = 'overview' | 'focus' | 'substation' | 'alpine' | 'top';
export type VisualMode = 'realistic' | 'wireframe';

export interface GrenobleNeighborhoodProps {
  data: HqSnapshot;
  selectedSiteId: SiteId | null;
  onSelectSite: (id: SiteId) => void;
  cameraPreset: CameraPreset;
  visualMode?: VisualMode;
  room?: string;
}

/* ------------------------------------------------------------------ */
/* Error boundary — graceful fallback if WebGL is unavailable         */
/* ------------------------------------------------------------------ */

interface BoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

class SceneErrorBoundary extends Component<BoundaryProps, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // Rendered fallback covers the failure; nothing else to do.
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Procedural campus roads, trees, streetlamps & weather effects       */
/* ------------------------------------------------------------------ */

interface RoadSegment {
  from: [number, number];
  to: [number, number];
  width: number;
}

const ROAD_SEGMENTS: RoadSegment[] = [
  // Primary tech-park boulevard ring (clear of MV substation pad [-6.5..6.5, -2.75..6.75])
  { from: [-42, 8.2], to: [42, 8.2], width: 3.0 },
  { from: [-42, 8.2], to: [-42, -30], width: 2.6 },
  { from: [42, 8.2], to: [42, -30], width: 2.6 },
  { from: [-42, -30], to: [42, -30], width: 2.6 },
  // South access loop behind Vercors & Chartreuse Annex carports
  { from: [-42, 8.2], to: [-42, 27], width: 2.5 },
  { from: [42, 8.2], to: [42, 27], width: 2.5 },
  { from: [-42, 27], to: [42, 27], width: 2.5 },
  // Clean driveway spurs to each site carport without crossing the substation
  { from: [-20, 8.2], to: [-20, -1], width: 2.0 }, // AlpTech HQ carport
  { from: [-9.5, 8.2], to: [-9.5, -5.8], width: 2.0 }, // Service lane around substation
  { from: [-9.5, -5.8], to: [2, -5.8], width: 2.0 }, // Isère R&D carport
  { from: [22, 8.2], to: [22, 4], width: 2.0 }, // Dauphiné Cloud carport
  { from: [-12, 27], to: [-12, 24], width: 2.0 }, // Vercors Control carport
  { from: [14, 27], to: [14, 23], width: 2.0 }, // Chartreuse Annex carport
];

function Road({
  from,
  to,
  width,
  wireframe,
  roadTex,
}: RoadSegment & { wireframe: boolean; roadTex: THREE.Texture }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const angle = -Math.atan2(to[1] - from[1], to[0] - from[0]);

  const roadGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(len, width);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const repeatX = Math.max(1, len / 8);
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, uv.getX(i) * repeatX);
    }
    uv.needsUpdate = true;
    return geo;
  }, [len, width]);

  useEffect(() => () => roadGeo.dispose(), [roadGeo]);

  return (
    <group>
      <mesh
        key={wireframe ? 'road-w' : 'road-r'}
        geometry={roadGeo}
        rotation={[-Math.PI / 2, 0, angle]}
        position={[(from[0] + to[0]) / 2, 0.02, (from[1] + to[1]) / 2]}
        receiveShadow={!wireframe}
      >
        {wireframe ? (
          <meshBasicMaterial color="#0b1120" />
        ) : (
          <meshStandardMaterial map={roadTex} roughness={0.9} metalness={0.05} />
        )}
      </mesh>
      {wireframe && (
        <Line
          points={[
            [from[0], 0.035, from[1]],
            [to[0], 0.035, to[1]],
          ]}
          color={C.edgeDim}
          dashed
          dashSize={1.6}
          gapSize={1.4}
          transparent
          opacity={0.85}
        />
      )}
    </group>
  );
}

const CONIFER_CLUSTERS: Array<[number, number, number]> = [
  // North-west foothills buffer
  [-36, -24, 1.15],
  [-33, -22, 0.95],
  [-38, -20, 1.0],
  [-31, -25, 0.85],
  // Between AlpTech & Isère north lawn
  [-11, -23, 1.1],
  [-9, -25, 0.9],
  [11, -24, 1.05],
  [14, -22, 0.9],
  // North-east park corner
  [35, -24, 1.2],
  [37, -21, 0.95],
  [33, -26, 0.85],
  // West & East perimeter greens
  [-36, 1, 1.05],
  [-38, 4, 0.9],
  [-35, 19, 1.1],
  [-37, 22, 0.9],
  [36, 2, 1.05],
  [38, 5, 0.9],
  [35, 19, 1.15],
  [37, 22, 0.95],
  // Central south park courtyard pockets (clear of buildings & substation)
  [0, 15, 0.95],
  [-2, 17.5, 0.8],
  [2.2, 17, 0.9],
  [-28, 17, 1.05],
  [-30, 19, 0.85],
  [28, 17, 1.0],
  [30, 19, 0.85],
];

function AlpineConifers({
  isCold,
  wireframe,
}: {
  isCold: boolean;
  wireframe: boolean;
}) {
  if (wireframe) return null;
  const tipColor = isCold ? '#cbd5e1' : '#2a5942';
  return (
    <group>
      {CONIFER_CLUSTERS.map(([tx, tz, scale], i) => (
        <group key={i} position={[tx, 0, tz]} scale={scale}>
          {/* Trunk */}
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.2, 1.1, 6]} />
            <meshStandardMaterial color="#4a3728" roughness={0.95} />
          </mesh>
          {/* 3 tiered alpine spruce cones */}
          <mesh position={[0, 1.55, 0]} castShadow>
            <coneGeometry args={[1.05, 1.7, 7]} />
            <meshStandardMaterial color="#193c2d" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0, 2.45, 0]} castShadow>
            <coneGeometry args={[0.82, 1.5, 7]} />
            <meshStandardMaterial color="#214b38" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0, 3.25, 0]} castShadow>
            <coneGeometry args={[0.56, 1.25, 7]} />
            <meshStandardMaterial color={tipColor} roughness={0.85} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const LAMP_POSITIONS: Array<[number, number]> = [
  [-34, 6.4],
  [-16, 6.4],
  [-16, 10.0],
  [12, 6.4],
  [12, 10.0],
  [34, 6.4],
  [-34, -28.2],
  [0, -28.2],
  [34, -28.2],
];

function Streetlamps({
  dimDaylight,
  wireframe,
}: {
  dimDaylight: boolean;
  wireframe: boolean;
}) {
  if (wireframe) return null;
  return (
    <group>
      {LAMP_POSITIONS.map(([lx, lz], i) => (
        <group key={i} position={[lx, 0, lz]}>
          <mesh position={[0, 1.65, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.07, 3.3, 6]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, 3.28, 0.22]}>
            <boxGeometry args={[0.22, 0.08, 0.55]} />
            <meshStandardMaterial color="#475569" metalness={0.6} />
          </mesh>
          <mesh position={[0, 3.23, 0.34]}>
            <boxGeometry args={[0.18, 0.04, 0.3]} />
            <meshStandardMaterial
              color="#fef3c7"
              emissive="#fbbf24"
              emissiveIntensity={dimDaylight ? 1.8 : 0.25}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CloudLayer({ wireframe }: { wireframe: boolean }) {
  const planes = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        pos: [-65 + i * 22, 46 + (i % 3) * 5, -48 + ((i * 37) % 85)] as [number, number, number],
        size: [36 + (i % 3) * 12, 18 + (i % 2) * 8] as [number, number],
        rot: i * 0.65,
      })),
    [],
  );
  return (
    <group>
      {planes.map((p, i) => (
        <mesh key={i} position={p.pos} rotation={[-Math.PI / 2, 0, p.rot]}>
          <planeGeometry args={p.size} />
          <meshBasicMaterial
            color={wireframe ? '#94a3b8' : '#e2e8f0'}
            transparent
            opacity={wireframe ? 0.08 : 0.22}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Amber/rose warning pulse ring during the midday unexpected-peak spike (slots 22..31). */
function WarningRing({ slot }: { slot: number }) {
  const ref = useRef<unknown>(null);
  const pts = useMemo(() => {
    const arr: Array<[number, number, number]> = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      arr.push([Math.cos(a) * 10, 0, Math.sin(a) * 10]);
    }
    return arr;
  }, []);
  const active = slot >= 22 && slot <= 31;
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const ring = ref.current as {
      scale?: { setScalar: (n: number) => void };
      material?: { opacity: number; color: THREE.Color };
    } | null;
    if (!ring?.scale || !ring.material) return;
    if (!active) {
      ring.material.opacity = 0;
      return;
    }
    ring.scale.setScalar(0.92 + 0.22 * Math.sin(t * 6));
    ring.material.opacity = 0.5 + 0.5 * Math.sin(t * 6);
    ring.material.color.setHex(Math.sin(t * 6) > 0 ? 0xf59e0b : 0xf43f5e);
  });
  return (
    <Line
      ref={ref as never}
      points={pts}
      position={[0, 0.14, 2]}
      color={C.amber}
      transparent
      opacity={0}
      lineWidth={2}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Camera fly-to controller                                            */
/* ------------------------------------------------------------------ */

interface CameraGoal {
  pos: THREE.Vector3;
  tgt: THREE.Vector3;
}

function goalFor(preset: CameraPreset, focus: HqSiteSummary | null): CameraGoal {
  if (preset === 'top') {
    return { pos: new THREE.Vector3(0, 96, 0.01), tgt: new THREE.Vector3(0, 0, 0) };
  }
  if (preset === 'substation') {
    return { pos: new THREE.Vector3(15, 11, 19), tgt: new THREE.Vector3(0, 2.2, 2) };
  }
  if (preset === 'alpine') {
    // Scenic angle looking across the solar-roofed tech park toward the Belledonne & Chartreuse Alps
    return { pos: new THREE.Vector3(-38, 16, 36), tgt: new THREE.Vector3(18, 9, -24) };
  }
  if (preset === 'focus' && focus) {
    const L = focus.layout;
    return {
      pos: new THREE.Vector3(L.x + L.w + 15, L.h + 10, L.z + L.d + 15),
      tgt: new THREE.Vector3(L.x, L.h * 0.55, L.z),
    };
  }
  return { pos: new THREE.Vector3(0, 34, 48), tgt: new THREE.Vector3(0, 4, -2) };
}

function CameraController({
  preset,
  focus,
  flyingRef,
}: {
  preset: CameraPreset;
  focus: HqSiteSummary | null;
  flyingRef: MutableRefObject<boolean>;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update?: () => void;
  } | null;

  const focusId = focus?.id ?? null;
  const fx = focus?.layout.x ?? 0;
  const fh = focus?.layout.h ?? 0;
  const fz = focus?.layout.z ?? 0;
  const fw = focus?.layout.w ?? 0;
  const fd = focus?.layout.d ?? 0;

  // Depend only on primitive preset & layout coordinates so live telemetry ticks do not hijack user orbit.
  const goal = useMemo(
    () => goalFor(preset, focus),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, focusId, fx, fh, fz, fw, fd],
  );

  useEffect(() => {
    flyingRef.current = true;
  }, [goal, flyingRef]);

  useFrame((_, delta) => {
    if (!controls || !flyingRef.current) return;
    const k = 1 - Math.exp(-delta * 2.6);
    camera.position.lerp(goal.pos, k);
    controls.target.lerp(goal.tgt, k);
    controls.update?.();
    if (
      camera.position.distanceTo(goal.pos) < 0.35 &&
      controls.target.distanceTo(goal.tgt) < 0.2
    ) {
      flyingRef.current = false;
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function getSkySun(slot: number, scenario: ScenarioKey) {
  const dayT = Math.min(1, Math.max(0, slot / 55));
  const elev = Math.sin(Math.PI * dayT) * 0.95 + 0.08;
  // East (+X) sunrise -> South (+Z) midday -> West (-X) sunset so Alps catch crisp front-lit sun.
  const az = 1.85 - 3.7 * dayT;
  const r = 160;
  const daylight = Math.sin(Math.PI * dayT);
  const isCloudy = scenario === 'cloudy';
  const isCold = scenario === 'cold';

  const position: [number, number, number] = [
    Math.cos(elev) * Math.sin(az) * r,
    Math.sin(elev) * r,
    Math.cos(elev) * Math.cos(az) * r,
  ];

  const fogColor = isCloudy
    ? '#94a3b8'
    : isCold
      ? '#c7dcf2'
      : daylight < 0.28
        ? '#c7b8c9'
        : '#bfd6ea';

  return {
    position,
    daylight,
    dimDaylight: daylight < 0.35 || isCloudy,
    intensity: (isCloudy ? 0.55 : 1.2) * (0.35 + 1.05 * daylight),
    color: isCold ? '#e0f2fe' : daylight < 0.25 ? '#fed7aa' : '#fff7ed',
    hemi: (isCloudy ? 0.8 : 0.95) * (0.35 + 0.5 * daylight),
    hemiSky: isCold ? '#bae6fd' : '#dbeafe',
    fogColor,
    fogNear: isCloudy ? 145 : 190,
    fogFar: isCloudy ? 340 : 460,
  };
}

function NeighborhoodScene({
  data,
  selectedSiteId,
  onSelectSite,
  cameraPreset,
  visualMode = 'realistic',
  room,
}: GrenobleNeighborhoodProps) {
  const wireframe = visualMode === 'wireframe';
  const isCold = data.scenario === 'cold';
  const selected = data.sites.find((s) => s.id === selectedSiteId) ?? null;
  const roadTex = useMemo(() => getAsphaltRoadTexture(), []);
  const flyingRef = useRef(false);

  const sun = useMemo(
    () => getSkySun(data.clock.slot, data.scenario),
    [data.clock.slot, data.scenario],
  );

  const activeRoom = room ?? data.room ?? 'gem-demo';

  return (
    <>
      {wireframe ? (
        <>
          <color attach="background" args={[C.void]} />
          <fog attach="fog" args={[C.void, 130, 320]} />
          <hemisphereLight args={['#38bdf8', '#090d16', 0.45]} />
          <ambientLight args={['#1e293b', 0.65]} />
          <directionalLight position={sun.position} intensity={0.7} color="#bae6fd" />
        </>
      ) : (
        <>
          <color attach="background" args={[sun.fogColor]} />
          <fog attach="fog" args={[sun.fogColor, sun.fogNear, sun.fogFar]} />
          <Sky
            distance={4500}
            sunPosition={sun.position}
            turbidity={data.scenario === 'cloudy' ? 9 : isCold ? 2.5 : 4.5}
            rayleigh={data.scenario === 'cloudy' ? 1.2 : 1.8}
            mieCoefficient={data.scenario === 'cloudy' ? 0.012 : 0.004}
            mieDirectionalG={0.82}
          />
          <hemisphereLight args={[sun.hemiSky, '#1e3128', sun.hemi]} />
          <ambientLight args={['#cbd5e1', 0.35]} />
          <directionalLight
            position={sun.position}
            intensity={sun.intensity}
            color={sun.color}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-52}
            shadow-camera-right={52}
            shadow-camera-top={52}
            shadow-camera-bottom={-52}
            shadow-camera-near={10}
            shadow-camera-far={280}
            shadow-bias={-0.0004}
          />
        </>
      )}

      {/* Ground surface */}
      <mesh
        key={wireframe ? 'ground-w' : 'ground-r'}
        rotation-x={-Math.PI / 2}
        position={[0, 0, 0]}
        receiveShadow={!wireframe}
      >
        <planeGeometry args={[280, 280]} />
        {wireframe ? (
          <meshBasicMaterial color={C.void} />
        ) : (
          <meshStandardMaterial color="#1e3128" roughness={0.96} metalness={0.02} />
        )}
      </mesh>
      {wireframe && (
        <gridHelper args={[240, 120, '#334155', C.grid]} position={[0, 0.015, 0]} />
      )}

      {/* Tech-park boulevard network */}
      {ROAD_SEGMENTS.map((seg, i) => (
        <Road
          key={i}
          from={seg.from}
          to={seg.to}
          width={seg.width}
          wireframe={wireframe}
          roadTex={roadTex}
        />
      ))}

      {/* 3D Grenoble Alps Valley Panorama */}
      <AlpineMountains mode={visualMode} scenario={data.scenario} />

      {/* Campus landscaping & streetlamps (realistic mode) */}
      <AlpineConifers isCold={isCold} wireframe={wireframe} />
      <Streetlamps dimDaylight={sun.dimDaylight} wireframe={wireframe} />

      {/* Weather & grid anomaly atmosphere */}
      {data.scenario === 'cloudy' && <CloudLayer wireframe={wireframe} />}
      {data.scenario === 'unexpected' && <WarningRing slot={data.clock.slot} />}

      {/* 5 Grenoble tech campus sites + solar carports */}
      {data.sites.map((site) => (
        <group key={site.id}>
          <BuildingMesh
            site={site}
            selected={site.id === selectedSiteId}
            scenario={data.scenario}
            clockSlot={data.clock.slot}
            visualMode={visualMode}
            room={activeRoom}
            onSelect={onSelectSite}
          />
          <SolarCarport site={site} visualMode={visualMode} />
        </group>
      ))}

      {/* MV substation + animated power conduits */}
      <SubstationConduits
        sites={data.sites}
        substation={data.substation}
        serverOnline={data.serverOnline}
        visualMode={visualMode}
      />

      <CameraController preset={cameraPreset} focus={selected} flyingRef={flyingRef} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={8}
        maxDistance={220}
        onStart={() => {
          flyingRef.current = false;
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export function GrenobleNeighborhood(props: GrenobleNeighborhoodProps) {
  return (
    <SceneErrorBoundary
      fallback={
        <div className="flex h-full min-h-[520px] items-center justify-center bg-inset p-6 text-center">
          <div>
            <div className="label text-grid">⚠ 3D viewport unavailable</div>
            <p className="mono mt-2 text-[11px] uppercase tracking-[0.08em] text-ink-dim">
              WebGL context could not be created · live KPIs, roster and event feed remain active
            </p>
          </div>
        </div>
      }
    >
      <div className="relative z-0 h-full w-full">
        <Canvas
          shadows
          camera={{ position: [0, 34, 48], fov: 44 }}
          dpr={[1, 2]}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <NeighborhoodScene {...props} />
        </Canvas>
      </div>
    </SceneErrorBoundary>
  );
}
