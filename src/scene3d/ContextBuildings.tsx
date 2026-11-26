import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  getConcretePlazaTexture,
  getCurtainWallTexture,
  getRoofMembraneTexture,
  getSolarPanelTexture,
} from './textures';
import type { CurtainWallStyle } from './textures';

export interface ContextBuildingsProps {
  visualMode?: 'realistic' | 'wireframe';
  online?: boolean;
}

interface ContextBuildingSpec {
  id: string;
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  style: CurtainWallStyle;
  hasSolar: boolean;
  roofType?: 'flat' | 'setback' | 'hipped';
}

// 18 European architectural district buildings creating authentic Grenoble urban density
// strictly clear of the 5 interactive campuses, boulevards, Isere river, relays, and solar farm.
const CONTEXT_BUILDINGS: ContextBuildingSpec[] = [
  // West riverfront boulevard corridor (x = -57)
  { id: 'ctx-w1', x: -57, z: -21, w: 15, h: 11, d: 10, style: 'glass', hasSolar: true, roofType: 'setback' },
  { id: 'ctx-w2', x: -57, z: -2, w: 14, h: 8.5, d: 9.5, style: 'limestone', hasSolar: true, roofType: 'flat' },
  { id: 'ctx-w3', x: -57, z: 17, w: 15, h: 9.5, d: 9.5, style: 'terracotta', hasSolar: false, roofType: 'hipped' },
  { id: 'ctx-w4', x: -57, z: 34, w: 14, h: 7.5, d: 8.5, style: 'limestone', hasSolar: true, roofType: 'flat' },
  // North foothills labs (west of Mountain Solar Farm)
  { id: 'ctx-n1', x: -25, z: -39, w: 15, h: 9, d: 8, style: 'glass', hasSolar: true, roofType: 'setback' },
  { id: 'ctx-n2', x: 1, z: -39, w: 14, h: 8, d: 7.5, style: 'limestone', hasSolar: true, roofType: 'flat' },
  { id: 'ctx-n3', x: -57, z: -39, w: 14, h: 8.5, d: 8, style: 'terracotta', hasSolar: false, roofType: 'hipped' },
  // East Presqu'ile business & research corridor (x = 56)
  { id: 'ctx-e1', x: 56, z: -21, w: 15, h: 12, d: 10, style: 'glass', hasSolar: true, roofType: 'setback' },
  { id: 'ctx-e2', x: 56, z: -2, w: 14, h: 9, d: 9.5, style: 'dark', hasSolar: true, roofType: 'flat' },
  { id: 'ctx-e3', x: 56, z: 17, w: 15, h: 10.5, d: 9.5, style: 'limestone', hasSolar: true, roofType: 'setback' },
  { id: 'ctx-e4', x: 56, z: 34, w: 14, h: 8, d: 8.5, style: 'terracotta', hasSolar: false, roofType: 'hipped' },
  { id: 'ctx-e5', x: 56, z: -39, w: 14, h: 8, d: 8, style: 'glass', hasSolar: true, roofType: 'flat' },
  // South campus annex avenue (z = 34)
  { id: 'ctx-s1', x: -26, z: 34, w: 13, h: 7.5, d: 8, style: 'limestone', hasSolar: true, roofType: 'flat' },
  { id: 'ctx-s2', x: -3, z: 34, w: 14, h: 9, d: 8, style: 'glass', hasSolar: true, roofType: 'setback' },
  { id: 'ctx-s3', x: 21, z: 34, w: 13, h: 8, d: 8, style: 'dark', hasSolar: true, roofType: 'flat' },
  // Mid-west & mid-east European district infill blocks
  { id: 'ctx-mw', x: -30, z: 18, w: 11, h: 7.5, d: 8, style: 'limestone', hasSolar: true, roofType: 'flat' },
  { id: 'ctx-me', x: 31, z: 18, w: 9, h: 6.8, d: 7.5, style: 'terracotta', hasSolar: false, roofType: 'hipped' },
  { id: 'ctx-sw', x: -34, z: -2, w: 9.5, h: 7, d: 8, style: 'glass', hasSolar: true, roofType: 'flat' },
];

function scaleBoxUVs(w: number, h: number, d: number): THREE.BoxGeometry {
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

function ContextBuilding({
  spec,
  wireframe,
  wallMat,
  roofMat,
  plazaTex,
  solarTex,
}: {
  spec: ContextBuildingSpec;
  wireframe: boolean;
  wallMat: THREE.MeshStandardMaterial;
  roofMat: THREE.MeshStandardMaterial;
  plazaTex: THREE.Texture;
  solarTex: THREE.Texture;
}) {
  const { mainGeo, crownGeo, hipGeo, mainEdges } = useMemo(() => {
    const mGeo = scaleBoxUVs(spec.w, spec.h, spec.d);
    const cGeo =
      spec.roofType === 'setback'
        ? scaleBoxUVs(spec.w * 0.62, spec.h * 0.28, spec.d * 0.64)
        : null;
    const hGeo =
      spec.roofType === 'hipped'
        ? new THREE.ConeGeometry(Math.max(spec.w, spec.d) * 0.68, 2.2, 4)
        : null;
    const edges = new THREE.EdgesGeometry(mGeo);
    return { mainGeo: mGeo, crownGeo: cGeo, hipGeo: hGeo, mainEdges: edges };
  }, [spec.w, spec.h, spec.d, spec.roofType]);

  useEffect(
    () => () => {
      mainGeo.dispose();
      crownGeo?.dispose();
      hipGeo?.dispose();
      mainEdges.dispose();
    },
    [mainGeo, crownGeo, hipGeo, mainEdges],
  );

  const boxMats = useMemo(
    () => [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat],
    [wallMat, roofMat],
  );

  const solarH = spec.roofType === 'setback' ? spec.h + spec.h * 0.28 : spec.h;
  const solarW = spec.roofType === 'setback' ? spec.w * 0.52 : spec.w * 0.78;
  const solarZRows = spec.roofType === 'setback' ? [-0.95, 0.95] : [-spec.d * 0.22, 0, spec.d * 0.22];

  return (
    <group position={[spec.x, 0, spec.z]}>
      {/* Ground AO contact shadow */}
      {!wireframe && (
        <mesh position={[0, 0.015, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[spec.w + 3.0, spec.d + 3.0]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.1} depthWrite={false} />
        </mesh>
      )}

      {/* Alabaster courtyard plinth */}
      <mesh position={[0, 0.08, 0]} receiveShadow={!wireframe}>
        <boxGeometry args={[spec.w + 2.2, 0.16, spec.d + 2.2]} />
        {wireframe ? (
          <meshBasicMaterial color="#0b1120" />
        ) : (
          <meshStandardMaterial map={plazaTex} roughness={0.88} metalness={0.03} />
        )}
      </mesh>

      {/* Main European office / residential volume */}
      {wireframe ? (
        <>
          <mesh geometry={mainGeo} position={[0, spec.h / 2 + 0.16, 0]}>
            <meshBasicMaterial color="#0b1120" />
          </mesh>
          <lineSegments geometry={mainEdges} position={[0, spec.h / 2 + 0.16, 0]}>
            <lineBasicMaterial color="#334155" />
          </lineSegments>
        </>
      ) : (
        <mesh
          geometry={mainGeo}
          position={[0, spec.h / 2 + 0.16, 0]}
          material={boxMats}
          castShadow
          receiveShadow
        />
      )}

      {/* Architectural upper setback crown */}
      {!wireframe && crownGeo && (
        <mesh
          geometry={crownGeo}
          position={[0, spec.h + (spec.h * 0.28) / 2 + 0.16, 0]}
          material={boxMats}
          castShadow
          receiveShadow
        />
      )}

      {/* Traditional French zinc/terracotta hipped roof option */}
      {!wireframe && hipGeo && (
        <mesh
          geometry={hipGeo}
          position={[0, spec.h + 1.25, 0]}
          rotation={[0, Math.PI / 4, 0]}
          scale={[spec.w / Math.max(spec.w, spec.d), 1, spec.d / Math.max(spec.w, spec.d)]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#b48a78" roughness={0.78} metalness={0.08} />
        </mesh>
      )}

      {/* Roof cornice trim */}
      {!wireframe && spec.roofType !== 'hipped' && (
        <mesh position={[0, spec.h + 0.24, 0]}>
          <boxGeometry args={[spec.w + 0.14, 0.22, spec.d + 0.14]} />
          <meshStandardMaterial color="#edeae2" roughness={0.65} metalness={0.12} />
        </mesh>
      )}

      {/* Rooftop monocrystalline solar arrays */}
      {!wireframe &&
        spec.hasSolar &&
        spec.roofType !== 'hipped' &&
        solarZRows.map((rz, idx) => (
          <mesh
            key={idx}
            position={[0, solarH + 0.44, rz]}
            rotation={[0.38, 0, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[solarW, 0.06, 1.15]} />
            <meshStandardMaterial
              map={solarTex}
              metalness={0.58}
              roughness={0.22}
              emissive="#1d4ed8"
              emissiveIntensity={0.05}
            />
          </mesh>
        ))}
    </group>
  );
}

/**
 * Surrounding Grenoble neighborhood European architectural district giving authentic
 * Apple Maps Detailed City Experience urban density around the 5 campuses.
 */
export function ContextBuildings({
  visualMode = 'realistic',
  online = true,
}: ContextBuildingsProps) {
  const wireframe = visualMode === 'wireframe';

  const glassTex = useMemo(() => getCurtainWallTexture('glass', online), [online]);
  const stoneTex = useMemo(() => getCurtainWallTexture('limestone', online), [online]);
  const darkTex = useMemo(() => getCurtainWallTexture('dark', online), [online]);
  const terraTex = useMemo(() => getCurtainWallTexture('terracotta', online), [online]);
  const roofTex = useMemo(() => getRoofMembraneTexture(), []);
  const plazaTex = useMemo(() => getConcretePlazaTexture(), []);
  const solarTex = useMemo(() => getSolarPanelTexture(), []);

  const wallMats = useMemo(() => {
    const mk = (map: THREE.Texture) =>
      new THREE.MeshStandardMaterial({
        map,
        roughness: 0.45,
        metalness: 0.16,
      });
    return {
      glass: mk(glassTex),
      limestone: mk(stoneTex),
      dark: mk(darkTex),
      terracotta: mk(terraTex),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roofMat = useMemo(
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
    wallMats.glass.map = glassTex;
    wallMats.limestone.map = stoneTex;
    wallMats.dark.map = darkTex;
    wallMats.terracotta.map = terraTex;
    Object.values(wallMats).forEach((m) => {
      m.needsUpdate = true;
    });
  }, [wallMats, glassTex, stoneTex, darkTex, terraTex]);

  useEffect(() => {
    roofMat.map = roofTex;
    roofMat.needsUpdate = true;
  }, [roofMat, roofTex]);

  useEffect(
    () => () => {
      Object.values(wallMats).forEach((m) => m.dispose());
      roofMat.dispose();
    },
    [wallMats, roofMat],
  );

  return (
    <group>
      {CONTEXT_BUILDINGS.map((spec) => (
        <ContextBuilding
          key={spec.id}
          spec={spec}
          wireframe={wireframe}
          wallMat={wallMats[spec.style]}
          roofMat={roofMat}
          plazaTex={plazaTex}
          solarTex={solarTex}
        />
      ))}
    </group>
  );
}
