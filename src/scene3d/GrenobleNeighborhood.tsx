import { Component, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Line, OrbitControls, Sky } from '@react-three/drei';
import type { HqSiteSummary, HqSnapshot, ScenarioKey, SiteId } from '../engine';
import { AlpineMountains } from './AlpineMountains';
import { BuildingMesh, C } from './BuildingMesh';
import { ContextBuildings } from './ContextBuildings';
import { GrenobleUrbanDetails } from './GrenobleUrbanDetails';
import { MountainSolarFarm, SOLAR_FARM_RELAY_POS } from './MountainSolarFarm';
import { SubstationConduits } from './SubstationConduits';
import { getAsphaltRoadTexture } from './textures';

export type CameraPreset = 'overview' | 'focus' | 'substation' | 'alpine' | 'top';
export type VisualMode = 'realistic' | 'wireframe';
export type NavMode = 'pan' | 'orbit';
export type NavActionType = 'zoom-in' | 'zoom-out' | 'reset-view';

export interface GrenobleNeighborhoodProps {
  data: HqSnapshot;
  selectedSiteId: SiteId | null;
  onSelectSite: (id: SiteId) => void;
  cameraPreset: CameraPreset;
  cameraNonce?: number;
  navMode?: NavMode;
  navAction?: { type: NavActionType; nonce: number } | null;
  visualMode?: VisualMode;
  room?: string;
}

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
    // Rendered fallback handles WebGL errors gracefully.
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

interface RoadSegment {
  from: [number, number];
  to: [number, number];
  width: number;
}

const ROAD_SEGMENTS: RoadSegment[] = [
  // East-West boulevards (continuing smoothly across Isere bridges at -31 & 8.2)
  { from: [-96, 8.2], to: [72, 8.2], width: 3.3 },
  { from: [-96, -31], to: [72, -31], width: 2.8 },
  { from: [-72, -46], to: [72, -46], width: 2.4 },
  { from: [-72, 26], to: [72, 26], width: 2.8 },
  { from: [-72, 42], to: [72, 42], width: 2.6 },
  // North-South avenues creating multi-block Grenoble parcels
  { from: [-72, -46], to: [-72, 42], width: 2.6 },
  { from: [-42, -46], to: [-42, 42], width: 2.8 },
  { from: [40, -46], to: [40, 42], width: 2.8 },
  { from: [72, -46], to: [72, 42], width: 2.6 },
  // Central substation & sector access spurs
  { from: [-9.5, 8.2], to: [-9.5, -5.8], width: 2.0 },
  { from: [-9.5, -5.8], to: [2, -5.8], width: 2.0 },
  // Foothill service road to the Mountain Solar Collector Relay
  {
    from: [SOLAR_FARM_RELAY_POS[0], -46],
    to: [SOLAR_FARM_RELAY_POS[0], SOLAR_FARM_RELAY_POS[2]],
    width: 2.2,
  },
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
          <meshStandardMaterial map={roadTex} roughness={0.84} metalness={0.03} />
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

const LAMP_POSITIONS: Array<[number, number]> = [
  [-56, 6.2], [-32, 6.2], [-15, 6.2], [12, 6.2], [33, 6.2], [56, 6.2],
  [-34, -29.2], [0, -29.2], [34, -29.2], [-34, 24.2], [34, 24.2],
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
          <mesh position={[0, 1.55, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.06, 3.1, 6]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.35} />
          </mesh>
          <mesh position={[0, 3.08, 0.2]}>
            <boxGeometry args={[0.2, 0.07, 0.5]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.55} />
          </mesh>
          <mesh position={[0, 3.03, 0.3]}>
            <boxGeometry args={[0.16, 0.035, 0.28]} />
            <meshStandardMaterial
              color="#fef9c3"
              emissive="#fbbf24"
              emissiveIntensity={dimDaylight ? 1.2 : 0.08}
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
      Array.from({ length: 8 }, (_, i) => ({
        pos: [-85 + i * 26, 56 + (i % 3) * 5, -62 + ((i * 37) % 110)] as [number, number, number],
        size: [42 + (i % 3) * 14, 22 + (i % 2) * 8] as [number, number],
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
            color={wireframe ? '#94a3b8' : '#ffffff'}
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
    ring.scale.setScalar(0.92 + 0.18 * Math.sin(t * 6));
    ring.material.opacity = 0.5 + 0.45 * Math.sin(t * 6);
    ring.material.color.setHex(Math.sin(t * 6) > 0 ? 0xf59e0b : 0xef4444);
  });
  return (
    <Line
      ref={ref as never}
      points={pts}
      position={[0, 0.16, 2]}
      color={C.amber}
      transparent
      opacity={0}
      lineWidth={2}
    />
  );
}

interface CameraGoal {
  pos: THREE.Vector3;
  tgt: THREE.Vector3;
}

function goalFor(preset: CameraPreset, focus: HqSiteSummary | null): CameraGoal {
  if (preset === 'top') {
    return { pos: new THREE.Vector3(4, 155, 0.01), tgt: new THREE.Vector3(4, 0, -16) };
  }
  if (preset === 'substation') {
    return { pos: new THREE.Vector3(20, 15, 25), tgt: new THREE.Vector3(0, 2, 2) };
  }
  if (preset === 'alpine') {
    return { pos: new THREE.Vector3(2, 27, 16), tgt: new THREE.Vector3(34, 9, -68) };
  }
  if (preset === 'focus' && focus) {
    const L = focus.layout;
    return {
      pos: new THREE.Vector3(L.x + L.w + 13, L.h + 8.5, L.z + L.d + 13),
      tgt: new THREE.Vector3(L.x, L.h * 0.45, L.z),
    };
  }
  return { pos: new THREE.Vector3(4, 46, 76), tgt: new THREE.Vector3(6, 4, -12) };
}

function CameraController({
  preset,
  focus,
  flyingRef,
  cameraNonce = 0,
  navAction,
}: {
  preset: CameraPreset;
  focus: HqSiteSummary | null;
  flyingRef: MutableRefObject<boolean>;
  cameraNonce?: number;
  navAction?: { type: NavActionType; nonce: number } | null;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
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

  const goal = useMemo(
    () => goalFor(preset, focus),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, focusId, fx, fh, fz, fw, fd],
  );
  const activeGoalRef = useRef<CameraGoal>(goal);
  const mountedRef = useRef(false);
  const lastNonceRef = useRef(cameraNonce);
  const lastActionNonceRef = useRef(navAction?.nonce ?? -1);

  useEffect(() => {
    const stopFly = () => {
      flyingRef.current = false;
    };
    const dom = gl.domElement;
    dom.addEventListener('pointerdown', stopFly, { passive: true });
    dom.addEventListener('wheel', stopFly, { passive: true });
    return () => {
      dom.removeEventListener('pointerdown', stopFly);
      dom.removeEventListener('wheel', stopFly);
    };
  }, [gl, flyingRef]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      activeGoalRef.current = goal;
      // Honour deep-link presets like ?preset=alpine immediately on load.
      if (preset !== 'overview') {
        flyingRef.current = true;
      }
      lastNonceRef.current = cameraNonce;
      return;
    }
    if (cameraNonce !== lastNonceRef.current) {
      lastNonceRef.current = cameraNonce;
      activeGoalRef.current = goal;
      flyingRef.current = true;
    }
  }, [cameraNonce, goal, preset, flyingRef]);

  useEffect(() => {
    if (!navAction || navAction.nonce === lastActionNonceRef.current) return;
    lastActionNonceRef.current = navAction.nonce;

    if (navAction.type === 'reset-view') {
      activeGoalRef.current = goalFor('overview', null);
      flyingRef.current = true;
      return;
    }

    if (!controls) return;
    flyingRef.current = false;
    const offset = camera.position.clone().sub(controls.target);
    const factor = navAction.type === 'zoom-in' ? 0.78 : 1.28;
    const nextDist = Math.max(3.5, Math.min(380, offset.length() * factor));
    offset.setLength(nextDist);
    camera.position.copy(controls.target).add(offset);
    camera.position.y = Math.max(1.2, camera.position.y);
    controls.update?.();
  }, [navAction, camera, controls, flyingRef]);

  useFrame((_, delta) => {
    if (!controls || !flyingRef.current) return;
    const targetGoal = activeGoalRef.current;
    const k = 1 - Math.exp(-delta * 3.0);
    camera.position.lerp(targetGoal.pos, k);
    controls.target.lerp(targetGoal.tgt, k);
    controls.update?.();
    if (
      camera.position.distanceTo(targetGoal.pos) < 0.35 &&
      controls.target.distanceTo(targetGoal.tgt) < 0.2
    ) {
      flyingRef.current = false;
    }
  });
  return null;
}

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true;
}

function KeyboardNavigation({ flyingRef }: { flyingRef: MutableRefObject<boolean> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update?: () => void;
  } | null;
  const keysRef = useRef<Set<string>>(new Set());
  const fwdRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const moveRef = useRef(new THREE.Vector3());
  const offsetRef = useRef(new THREE.Vector3());
  const upVec = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useEffect(() => {
    const keys = keysRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(document.activeElement)) return;
      const k = e.key.toLowerCase();
      if (
        k === 'w' ||
        k === 'a' ||
        k === 's' ||
        k === 'd' ||
        k === 'q' ||
        k === 'e' ||
        k === 'arrowup' ||
        k === 'arrowdown' ||
        k === 'arrowleft' ||
        k === 'arrowright' ||
        k === 'shift' ||
        k === '=' ||
        k === '+' ||
        k === '-'
      ) {
        if (k.startsWith('arrow')) e.preventDefault();
        keys.add(k);
        flyingRef.current = false;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
    };
    const onBlur = () => {
      keys.clear();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [flyingRef]);

  useFrame((_, delta) => {
    if (!controls || keysRef.current.size === 0) return;
    const keys = keysRef.current;
    const dt = Math.min(0.08, delta);
    const dist = camera.position.distanceTo(controls.target);
    const boost = keys.has('shift') ? 2.2 : 1.0;
    const speed = Math.max(12, Math.min(95, dist * 0.72)) * boost * dt;

    const fwd = fwdRef.current;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();

    const right = rightRef.current;
    right.crossVectors(fwd, upVec).normalize();

    const move = moveRef.current.set(0, 0, 0);
    if (keys.has('w') || keys.has('arrowup')) move.addScaledVector(fwd, speed);
    if (keys.has('s') || keys.has('arrowdown')) move.addScaledVector(fwd, -speed);
    if (keys.has('d') || keys.has('arrowright')) move.addScaledVector(right, speed);
    if (keys.has('a') || keys.has('arrowleft')) move.addScaledVector(right, -speed);
    if (keys.has('e')) move.y += speed * 0.65;
    if (keys.has('q')) move.y -= speed * 0.65;

    let moved = false;
    if (move.lengthSq() > 0) {
      camera.position.add(move);
      controls.target.add(move);

      const clampedX = Math.max(-240, Math.min(240, controls.target.x));
      const clampedZ = Math.max(-230, Math.min(220, controls.target.z));
      const dx = clampedX - controls.target.x;
      const dz = clampedZ - controls.target.z;
      controls.target.x = clampedX;
      controls.target.z = clampedZ;
      camera.position.x += dx;
      camera.position.z += dz;

      controls.target.y = Math.max(0, Math.min(85, controls.target.y));
      camera.position.y = Math.max(1.2, camera.position.y);
      moved = true;
    }

    if (keys.has('=') || keys.has('+')) {
      const off = offsetRef.current.copy(camera.position).sub(controls.target);
      const nextLen = Math.max(3.5, off.length() * (1 - 1.25 * dt));
      off.setLength(nextLen);
      camera.position.copy(controls.target).add(off);
      camera.position.y = Math.max(1.2, camera.position.y);
      moved = true;
    }
    if (keys.has('-')) {
      const off = offsetRef.current.copy(camera.position).sub(controls.target);
      const nextLen = Math.min(380, off.length() * (1 + 1.25 * dt));
      off.setLength(nextLen);
      camera.position.copy(controls.target).add(off);
      camera.position.y = Math.max(1.2, camera.position.y);
      moved = true;
    }

    if (moved) {
      controls.update?.();
    }
  });

  return null;
}

function getSkySun(slot: number, scenario: ScenarioKey) {
  const dayT = Math.min(1, Math.max(0, slot / 55));
  const elev = Math.sin(Math.PI * dayT) * 0.85 + 0.26;
  const az = 1.65 - 3.3 * dayT;
  const r = 190;
  const daylight = Math.sin(Math.PI * dayT);
  const isCloudy = scenario === 'cloudy';
  const isCold = scenario === 'cold';

  const position: [number, number, number] = [
    Math.cos(elev) * Math.sin(az) * r,
    Math.sin(elev) * r,
    Math.cos(elev) * Math.cos(az) * r,
  ];

  const fogColor = isCloudy
    ? '#d6dce5'
    : isCold
      ? '#e2edf7'
      : daylight < 0.25
        ? '#e9d8db'
        : '#dce8f4';

  return {
    position,
    daylight,
    dimDaylight: daylight < 0.3 || isCloudy,
    intensity: (isCloudy ? 1.0 : 1.75) * (0.58 + 0.58 * daylight),
    color: isCold ? '#f0f9ff' : daylight < 0.22 ? '#fdecd2' : '#fffdf8',
    hemi: (isCloudy ? 0.95 : 1.15) * (0.6 + 0.4 * daylight),
    hemiSky: isCold ? '#e0f2fe' : '#eaf3fc',
    fogColor,
    fogNear: isCloudy ? 260 : 320,
    fogFar: isCloudy ? 620 : 840,
  };
}

function NeighborhoodScene({
  data,
  selectedSiteId,
  onSelectSite,
  cameraPreset,
  cameraNonce = 0,
  navMode = 'pan',
  navAction,
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
  const totalSolarKw = data.sites.reduce(
    (sum, s) => sum + (s.online ? s.currentSolarKw : 0),
    0,
  );

  return (
    <>
      {wireframe ? (
        <>
          <color attach="background" args={[C.void]} />
          <fog attach="fog" args={[C.void, 280, 680]} />
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
            turbidity={data.scenario === 'cloudy' ? 8 : isCold ? 2.0 : 3.2}
            rayleigh={data.scenario === 'cloudy' ? 1.0 : 1.35}
            mieCoefficient={data.scenario === 'cloudy' ? 0.01 : 0.003}
            mieDirectionalG={0.8}
          />
          <Environment resolution={256} frames={1}>
            <Lightformer
              form="rect"
              intensity={1.7}
              color="#eef6ff"
              scale={[150, 150, 1]}
              position={[0, 80, 0]}
              rotation={[Math.PI / 2, 0, 0]}
            />
            <Lightformer
              form="circle"
              intensity={2.2}
              color="#fff9eb"
              scale={[36, 36, 1]}
              position={[65, 55, 75]}
              target={[0, 0, 0]}
            />
            <Lightformer
              form="rect"
              intensity={0.9}
              color="#d7dcd8"
              scale={[160, 160, 1]}
              position={[0, -30, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            />
          </Environment>

          <hemisphereLight args={[sun.hemiSky, '#d6dad4', sun.hemi]} />
          <ambientLight args={['#f1f5f9', 0.42]} />
          <directionalLight
            position={sun.position}
            intensity={sun.intensity}
            color={sun.color}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-98}
            shadow-camera-right={98}
            shadow-camera-top={98}
            shadow-camera-bottom={-98}
            shadow-camera-near={10}
            shadow-camera-far={360}
            shadow-bias={-0.0004}
          />
        </>
      )}

      {/* Apple Maps DCE warm alabaster ground canvas */}
      <mesh
        key={wireframe ? 'ground-w' : 'ground-r'}
        rotation-x={-Math.PI / 2}
        position={[0, 0, 0]}
        receiveShadow={!wireframe}
      >
        <planeGeometry args={[800, 800]} />
        {wireframe ? (
          <meshBasicMaterial color={C.void} />
        ) : (
          <meshStandardMaterial
            color={isCold ? '#e8eef4' : '#e6e8e4'}
            roughness={0.94}
            metalness={0.01}
          />
        )}
      </mesh>
      {wireframe && (
        <gridHelper args={[320, 160, '#334155', C.grid]} position={[0, 0.015, 0]} />
      )}

      {/* Expanded Apple Maps light-slate road boulevards */}
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

      {/* Urban Cartographic Layer: Isere River, bridges, roundabout, crosswalks, parks, Tram B, organic trees */}
      <GrenobleUrbanDetails
        visualMode={visualMode}
        isCold={isCold}
        serverOnline={data.serverOnline}
      />

      {/* High-Resolution Grenoble Alps Valley Panorama */}
      <AlpineMountains mode={visualMode} scenario={data.scenario} />

      {/* Terraced Mountain-Side Solar Power Generation Farm + Collector Relay */}
      <MountainSolarFarm
        visualMode={visualMode}
        totalSolarKw={totalSolarKw}
        serverOnline={data.serverOnline}
      />

      {/* 18 Surrounding Grenoble District European Architectural Buildings */}
      <ContextBuildings visualMode={visualMode} online={data.serverOnline} />

      <Streetlamps dimDaylight={sun.dimDaylight} wireframe={wireframe} />

      {data.scenario === 'cloudy' && <CloudLayer wireframe={wireframe} />}
      {data.scenario === 'unexpected' && <WarningRing slot={data.clock.slot} />}

      {/* 5 Interactive Grenoble Campuses (2-floor parked EV podium + rooftop solar) */}
      {data.sites.map((site) => (
        <BuildingMesh
          key={site.id}
          site={site}
          selected={site.id === selectedSiteId}
          scenario={data.scenario}
          clockSlot={data.clock.slot}
          visualMode={visualMode}
          room={activeRoom}
          onSelect={onSelectSite}
        />
      ))}

      {/* Central Substation, Sector Relays & Glowing Green Neon Power Blobs */}
      <SubstationConduits
        sites={data.sites}
        substation={data.substation}
        serverOnline={data.serverOnline}
        visualMode={visualMode}
      />

      <CameraController
        preset={cameraPreset}
        focus={selected}
        flyingRef={flyingRef}
        cameraNonce={cameraNonce}
        navAction={navAction}
      />
      <KeyboardNavigation flyingRef={flyingRef} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.075}
        enablePan
        enableRotate
        enableZoom
        screenSpacePanning={false}
        zoomToCursor
        minDistance={3.5}
        maxDistance={380}
        minPolarAngle={0.02}
        maxPolarAngle={Math.PI * 0.495}
        panSpeed={1.5}
        zoomSpeed={1.3}
        rotateSpeed={0.85}
        mouseButtons={
          navMode === 'pan'
            ? {
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.ROTATE,
              }
            : {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
              }
        }
        touches={
          navMode === 'pan'
            ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
            : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
        }
        onStart={() => {
          flyingRef.current = false;
        }}
      />
    </>
  );
}

export function GrenobleNeighborhood(props: GrenobleNeighborhoodProps) {
  return (
    <SceneErrorBoundary
      fallback={
        <div className="flex h-full min-h-[520px] items-center justify-center bg-inset p-6 text-center">
          <div>
            <div className="label text-grid">3D viewport unavailable</div>
            <p className="mt-2 text-xs text-ink-dim">
              WebGL context could not be created · live telemetry, roster and event feed remain active
            </p>
          </div>
        </div>
      }
    >
      <div className="relative z-0 h-full w-full">
        <Canvas
          shadows
          camera={{ position: [4, 46, 76], fov: 44, far: 1800 }}
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
