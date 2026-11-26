import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getAsphaltRoadTexture } from './textures';

export interface GrenobleUrbanDetailsProps {
  visualMode?: 'realistic' | 'wireframe';
  isCold?: boolean;
  serverOnline?: boolean;
}

const PARK_ZONES: Array<{ x: number; z: number; w: number; d: number }> = [
  // Riverbank green belt east of Isere canal
  { x: -75.5, z: -2, w: 6.5, d: 88 },
  // Central south courtyard parklawn around substation & south of avenue
  { x: 0, z: 16.5, w: 12, d: 9.5 },
  // Northwest lawn buffer behind AlpTech HQ
  { x: -34, z: -21, w: 9, d: 13 },
  // East boulevard pocket park
  { x: 35.5, z: -21, w: 5.5, d: 14 },
  // Southern greenbelt buffer
  { x: 0, z: 48, w: 136, d: 8 },
];

const CROSSWALK_CENTERS: Array<{ x: number; z: number; rotY: number }> = [
  { x: -42, z: 5.4, rotY: 0 },
  { x: -42, z: 11.0, rotY: 0 },
  { x: 40, z: 5.4, rotY: 0 },
  { x: 40, z: 11.0, rotY: 0 },
  { x: -42, z: -28.4, rotY: 0 },
  { x: 40, z: -28.4, rotY: 0 },
  { x: -42, z: 23.4, rotY: 0 },
  { x: 40, z: 23.4, rotY: 0 },
  { x: -39.2, z: 8.2, rotY: Math.PI / 2 },
  { x: 37.2, z: 8.2, rotY: Math.PI / 2 },
  { x: -9.5, z: 5.8, rotY: 0 },
];

// Organic multi-sphere botanical trees along boulevards, river promenade & park blocks
const ORGANIC_TREES: Array<[number, number, number, number]> = [
  // Riverbank promenade grove (x ≈ -75)
  [-75.5, -40, 1.15, 0], [-75.5, -34, 1.0, 1], [-75.5, -26, 1.1, 2], [-75.5, -18, 0.95, 0],
  [-75.5, -10, 1.15, 1], [-75.5, -2, 1.05, 2], [-75.5, 4, 1.0, 0], [-75.5, 14, 1.15, 1],
  [-75.5, 21, 1.0, 2], [-75.5, 31, 1.1, 0], [-75.5, 38, 1.05, 1],
  // North foothills boulevard trees (clear of Mountain Solar Farm)
  [-65, -49.5, 1.1, 0], [-56, -49.5, 1.0, 1], [-47, -49.5, 1.15, 2], [-35, -49.5, 1.0, 0],
  [-23, -49.5, 1.1, 1],
  // Central avenue & plaza courtyard pocket trees
  [-33, 5.4, 0.9, 1], [-27, 5.4, 0.85, 2], [-15, 5.4, 0.9, 0], [12, 5.4, 0.9, 1],
  [28, 5.4, 0.92, 2], [-33, 11.2, 0.88, 0], [-24, 11.2, 0.9, 1], [30, 11.2, 0.88, 2],
  [-2.5, 16, 0.95, 0], [2.5, 17.5, 0.9, 2], [0, 20, 0.85, 1],
  // North-south avenue shade trees
  [-45.2, -25, 0.95, 0], [-45.2, -16, 1.0, 1], [-45.2, -7, 0.92, 2], [-45.2, 17, 1.0, 0],
  [-45.2, 34, 0.95, 1], [43.2, -25, 1.0, 2], [43.2, -16, 0.95, 0], [43.2, -7, 1.0, 1],
  [43.2, 17, 0.95, 2], [43.2, 34, 1.0, 0],
  // Perimeter east & south avenues
  [75.5, -36, 1.1, 0], [75.5, -20, 1.05, 1], [75.5, -4, 1.15, 2], [75.5, 14, 1.05, 0],
  [75.5, 32, 1.1, 1],
  [-62, 46.5, 1.05, 2], [-46, 46.5, 1.1, 0], [-30, 46.5, 1.0, 1], [-14, 46.5, 1.15, 2],
  [2, 46.5, 1.05, 0], [18, 46.5, 1.1, 1], [34, 46.5, 1.0, 2], [52, 46.5, 1.15, 0],
  [66, 46.5, 1.05, 1],
];

/** Sleek modern Grenoble Tram B gliding quietly along the main east-west avenue (z = 8.2). */
function GrenobleTram({ wireframe }: { wireframe: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const period = 36;
    const t = ((state.clock.elapsedTime % period) / period) * 2 - 1;
    // Ping-pong smoothly from x = -34 to x = +34 clear of the roundabout
    const x = Math.sin(t * Math.PI) * 33;
    g.position.x = x;
  });

  if (wireframe) return null;

  return (
    <group ref={ref} position={[0, 0.05, 7.65]}>
      {/* Articulated light-rail 3-car body */}
      {[-1.95, 0, 1.95].map((cx, idx) => (
        <group key={idx} position={[cx, 0, 0]}>
          <mesh position={[0, 0.34, 0]} castShadow>
            <boxGeometry args={[1.8, 0.56, 0.68]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.25} metalness={0.2} />
          </mesh>
          {/* Dark wrap window band */}
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[1.64, 0.24, 0.7]} />
            <meshStandardMaterial color="#1e293b" roughness={0.14} metalness={0.65} />
          </mesh>
          {/* Grenoble blue-teal livery accent stripe */}
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[1.76, 0.09, 0.7]} />
            <meshStandardMaterial color="#0284c7" roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* Pantograph frame on middle car */}
      <mesh position={[0, 0.68, 0]}>
        <boxGeometry args={[0.4, 0.14, 0.35]} />
        <meshStandardMaterial color="#64748b" metalness={0.65} />
      </mesh>
    </group>
  );
}

/** Minimalist glass-and-aluminum Grenoble Tram B transit station shelter. */
function TramStation({ x, wireframe }: { x: number; wireframe: boolean }) {
  if (wireframe) return null;
  return (
    <group position={[x, 0, 6.2]}>
      {/* Raised pale stone boarding platform */}
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[5.2, 0.16, 1.2]} />
        <meshStandardMaterial color="#e8e6e0" roughness={0.85} />
      </mesh>
      {/* Brushed aluminum posts + floating glass canopy */}
      {[-1.8, 1.8].map((px, i) => (
        <mesh key={i} position={[px, 0.72, -0.35]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 1.2, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 1.32, -0.15]} castShadow>
        <boxGeometry args={[4.2, 0.05, 0.9]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.45} roughness={0.25} />
      </mesh>
    </group>
  );
}

/**
 * Apple Maps Detailed City Experience (DCE) cartographic layer:
 * Isere River waterfront & bridges, roundabout, crosswalks, manicured sage lawns,
 * Grenoble Tram B tracks/train, and instanced organic layered botanical trees.
 */
export function GrenobleUrbanDetails({
  visualMode = 'realistic',
  isCold = false,
}: GrenobleUrbanDetailsProps) {
  const wireframe = visualMode === 'wireframe';
  const roadTex = useMemo(() => getAsphaltRoadTexture(), []);

  // Curved Isere river canal along the west & northwest perimeter (x ≈ -86)
  const riverGeo = useMemo(() => {
    const points = [
      new THREE.Vector3(-88, 0.03, 70),
      new THREE.Vector3(-86, 0.03, 35),
      new THREE.Vector3(-84, 0.03, 0),
      new THREE.Vector3(-86, 0.03, -35),
      new THREE.Vector3(-90, 0.03, -64),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const segs = 40;
    const width = 12.5;
    const sampled = curve.getPoints(segs);
    const verts: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segs; i++) {
      const p = sampled[i];
      const tan = curve.getTangent(i / segs);
      const nx = -tan.z * (width / 2);
      const nz = tan.x * (width / 2);
      verts.push(p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz);
      uvs.push(0, i / segs, 1, i / segs);
      if (i < segs) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, []);

  useEffect(() => () => riverGeo.dispose(), [riverGeo]);

  // Instanced white pedestrian crosswalk stripes
  const stripeRef = useRef<THREE.InstancedMesh>(null);
  const stripesPerCrossing = 5;
  const totalStripes = CROSSWALK_CENTERS.length * stripesPerCrossing;

  useEffect(() => {
    if (wireframe || !stripeRef.current) return;
    const dummy = new THREE.Object3D();
    let idx = 0;
    CROSSWALK_CENTERS.forEach((cw) => {
      for (let s = 0; s < stripesPerCrossing; s++) {
        const offset = -0.9 + s * 0.45;
        const dx = Math.cos(cw.rotY) * offset;
        const dz = -Math.sin(cw.rotY) * offset;
        dummy.position.set(cw.x + dx, 0.032, cw.z + dz);
        dummy.rotation.set(0, cw.rotY, 0);
        dummy.updateMatrix();
        stripeRef.current?.setMatrixAt(idx++, dummy.matrix);
      }
    });
    stripeRef.current.instanceMatrix.needsUpdate = true;
  }, [wireframe]);

  // Instanced organic Apple Maps multi-sphere trees
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  const lowCanopyRef = useRef<THREE.InstancedMesh>(null);
  const topCanopyRef = useRef<THREE.InstancedMesh>(null);
  const treeCount = ORGANIC_TREES.length;

  useEffect(() => {
    if (wireframe) return;
    const dummy = new THREE.Object3D();
    const tonePalette = [
      new THREE.Color(isCold ? '#b7c9bd' : '#8eb782'),
      new THREE.Color(isCold ? '#abc0b3' : '#7ba672'),
      new THREE.Color(isCold ? '#c6d5cb' : '#a1c495'),
    ];
    ORGANIC_TREES.forEach(([tx, tz, scale, tint], i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(scale, scale, scale);

      dummy.position.set(tx, 0.018, tz);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      shadowRef.current?.setMatrixAt(i, dummy.matrix);

      dummy.rotation.set(0, 0, 0);
      dummy.position.set(tx, 0.62 * scale, tz);
      dummy.updateMatrix();
      trunkRef.current?.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tx, 1.55 * scale, tz);
      dummy.scale.set(scale * 1.08, scale * 0.88, scale * 1.08);
      dummy.updateMatrix();
      lowCanopyRef.current?.setMatrixAt(i, dummy.matrix);
      lowCanopyRef.current?.setColorAt(i, tonePalette[tint % 3]);

      dummy.position.set(tx + 0.14 * scale, 2.15 * scale, tz - 0.1 * scale);
      dummy.scale.set(scale * 0.78, scale * 0.72, scale * 0.78);
      dummy.updateMatrix();
      topCanopyRef.current?.setMatrixAt(i, dummy.matrix);
      topCanopyRef.current?.setColorAt(i, tonePalette[(tint + 2) % 3]);
    });
    [shadowRef, trunkRef, lowCanopyRef, topCanopyRef].forEach((r) => {
      if (r.current) {
        r.current.instanceMatrix.needsUpdate = true;
        if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
      }
    });
  }, [wireframe, isCold]);

  const lawnColor = isCold ? '#dce6de' : '#c3dcb7';

  return (
    <group>
      {/* Isere River Canal & Limestone Embankments */}
      <mesh geometry={riverGeo} receiveShadow={!wireframe}>
        {wireframe ? (
          <meshBasicMaterial color="#0f2942" />
        ) : (
          <meshStandardMaterial
            color="#8ec5e8"
            roughness={0.14}
            metalness={0.18}
          />
        )}
      </mesh>
      {/* Pale limestone river embankment wall along east bank */}
      {!wireframe && (
        <mesh position={[-79.2, 0.08, 0]} receiveShadow>
          <boxGeometry args={[0.9, 0.24, 114]} />
          <meshStandardMaterial color="#e2dfd7" roughness={0.85} />
        </mesh>
      )}

      {/* Two clean River Bridges carrying West Avenue [-31, 8.2] across the Isere */}
      {[-31, 8.2].map((bz, bi) => (
        <group key={bi} position={[-85, 0.2, bz]}>
          <mesh receiveShadow={!wireframe} castShadow={!wireframe}>
            <boxGeometry args={[16, 0.28, 3.4]} />
            {wireframe ? (
              <meshBasicMaterial color="#0b1120" />
            ) : (
              <meshStandardMaterial map={roadTex} roughness={0.82} />
            )}
          </mesh>
          {/* Low architectural bridge side parapets */}
          {[-1.65, 1.65].map((pz, pi) => (
            <mesh key={pi} position={[0, 0.28, pz]} castShadow={!wireframe}>
              <boxGeometry args={[16, 0.28, 0.14]} />
              <meshStandardMaterial color={wireframe ? '#38bdf8' : '#e8e6e0'} roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Manicured sage-green park zones */}
      {!wireframe &&
        PARK_ZONES.map((p, pi) => (
          <mesh
            key={pi}
            position={[p.x, 0.012, p.z]}
            rotation-x={-Math.PI / 2}
            receiveShadow
          >
            <planeGeometry args={[p.w, p.d]} />
            <meshStandardMaterial color={lawnColor} roughness={0.94} />
          </mesh>
        ))}

      {/* Western Boulevard European Roundabout at [-42, 8.2] */}
      <group position={[-42, 0.03, 8.2]}>
        <mesh rotation-x={-Math.PI / 2} receiveShadow={!wireframe}>
          <circleGeometry args={[3.9, 32]} />
          <meshBasicMaterial color={wireframe ? '#0b1120' : '#919aa6'} />
        </mesh>
        <mesh position={[0, 0.04, 0]} castShadow={!wireframe} receiveShadow={!wireframe}>
          <cylinderGeometry args={[2.0, 2.05, 0.12, 28]} />
          <meshStandardMaterial
            color={wireframe ? '#0f172a' : '#e8e6e0'}
            roughness={0.85}
          />
        </mesh>
        <mesh position={[0, 0.11, 0]} rotation-x={-Math.PI / 2} receiveShadow={!wireframe}>
          <circleGeometry args={[1.75, 28]} />
          <meshStandardMaterial color={wireframe ? '#0b1120' : lawnColor} roughness={0.95} />
        </mesh>
      </group>

      {/* Pedestrian Crosswalks (instanced white bars) */}
      {!wireframe && (
        <instancedMesh ref={stripeRef} args={[undefined, undefined, totalStripes]}>
          <boxGeometry args={[0.24, 0.015, 2.4]} />
          <meshBasicMaterial color="#ffffff" />
        </instancedMesh>
      )}

      {/* Grenoble Tram B Steel Tracks along z = 8.2 boulevard */}
      {[-0.22, 0.22].map((rz, ri) => (
        <mesh key={ri} position={[0, 0.026, 7.65 + rz]}>
          <boxGeometry args={[142, 0.015, 0.05]} />
          <meshStandardMaterial
            color={wireframe ? '#38bdf8' : '#cbd5e1'}
            metalness={0.75}
            roughness={0.3}
          />
        </mesh>
      ))}
      <TramStation x={-26} wireframe={wireframe} />
      <TramStation x={18} wireframe={wireframe} />
      <GrenobleTram wireframe={wireframe} />

      {/* Organic Apple Maps Multi-Sphere Trees (instanced) */}
      {!wireframe && (
        <group>
          <instancedMesh ref={shadowRef} args={[undefined, undefined, treeCount]}>
            <circleGeometry args={[1.05, 14]} />
            <meshBasicMaterial color="#1e293b" transparent opacity={0.14} depthWrite={false} />
          </instancedMesh>
          <instancedMesh ref={trunkRef} args={[undefined, undefined, treeCount]} castShadow>
            <cylinderGeometry args={[0.1, 0.14, 1.25, 6]} />
            <meshStandardMaterial color="#8c735b" roughness={0.95} />
          </instancedMesh>
          <instancedMesh
            ref={lowCanopyRef}
            args={[undefined, undefined, treeCount]}
            castShadow
            receiveShadow
          >
            <icosahedronGeometry args={[0.92, 1]} />
            <meshStandardMaterial roughness={0.86} metalness={0.02} />
          </instancedMesh>
          <instancedMesh
            ref={topCanopyRef}
            args={[undefined, undefined, treeCount]}
            castShadow
            receiveShadow
          >
            <icosahedronGeometry args={[0.78, 1]} />
            <meshStandardMaterial roughness={0.84} metalness={0.02} />
          </instancedMesh>
        </group>
      )}
    </group>
  );
}
