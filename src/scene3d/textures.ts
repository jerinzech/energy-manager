import * as THREE from 'three';

export type CurtainWallStyle = 'glass' | 'limestone' | 'dark' | 'terracotta';

const TEXTURE_CACHE = new Map<string, THREE.Texture>();

function hash2d(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function createCanvasTexture(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  configure?: (tex: THREE.CanvasTexture) => void,
): THREE.Texture {
  const cached = TEXTURE_CACHE.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    const fallback = new THREE.DataTexture(new Uint8Array([220, 224, 230, 255]), 1, 1);
    fallback.needsUpdate = true;
    TEXTURE_CACHE.set(key, fallback);
    return fallback;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    draw(ctx, width, height);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  configure?.(tex);
  tex.needsUpdate = true;
  TEXTURE_CACHE.set(key, tex);
  return tex;
}

const CURTAIN_PALETTES: Record<
  CurtainWallStyle,
  {
    spandrelTop: string;
    spandrelBot: string;
    mullion: string;
    glassTop: string;
    glassBot: string;
    pilaster: string | null;
  }
> = {
  // Apple Maps DCE brushed champagne-aluminum spandrels & pale cerulean sky glazing
  glass: {
    spandrelTop: '#ebeae6',
    spandrelBot: '#dad8d2',
    mullion: '#9aa4b0',
    glassTop: '#bdd3e6',
    glassBot: '#8cb0cc',
    pilaster: null,
  },
  // Parisian / Grenoble alabaster limestone & slate-blue architectural glazing
  limestone: {
    spandrelTop: '#f2efe8',
    spandrelBot: '#e4dfd4',
    mullion: '#94a0ad',
    glassTop: '#a2bdd4',
    glassBot: '#7496b5',
    pilaster: '#ece7dd',
  },
  // Pale architectural precast concrete with graphite mullions & cool blue glazing
  dark: {
    spandrelTop: '#e6e8ec',
    spandrelBot: '#d5d9e0',
    mullion: '#64748b',
    glassTop: '#8eaec9',
    glassBot: '#5c7fa1',
    pilaster: null,
  },
  // Warm alpine terracotta/sandstone residential stucco with clean daylight windows
  terracotta: {
    spandrelTop: '#eadcd0',
    spandrelBot: '#dcc8b8',
    mullion: '#8f847b',
    glassTop: '#adc2d4',
    glassBot: '#7f9cb5',
    pilaster: '#efe4da',
  },
};

/**
 * Procedural 512x512 Apple Maps DCE sunlit European architectural facade texture.
 * Soft matte limestone/concrete/aluminum spandrels paired with calm sky-reflective glazing.
 */
export function getCurtainWallTexture(
  style: CurtainWallStyle,
  online: boolean,
): THREE.Texture {
  const key = `curtain-dce-v3:${style}:${online ? 'on' : 'off'}`;
  return createCanvasTexture(key, 512, 512, (ctx, w, h) => {
    const pal = CURTAIN_PALETTES[style];
    const floors = 4;
    const cols = 8;
    const floorH = h / floors;
    const colW = w / cols;
    const spandrelH = 34;

    ctx.fillStyle = online ? pal.mullion : '#64748b';
    ctx.fillRect(0, 0, w, h);

    for (let f = 0; f < floors; f++) {
      const fy = f * floorH;

      // Subtle sunlit spandrel band with clean shadow reveal.
      const spGrad = ctx.createLinearGradient(0, fy, 0, fy + spandrelH);
      spGrad.addColorStop(0, online ? pal.spandrelTop : '#94a3b8');
      spGrad.addColorStop(1, online ? pal.spandrelBot : '#788496');
      ctx.fillStyle = spGrad;
      ctx.fillRect(0, fy, w, spandrelH);

      ctx.fillStyle = online ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)';
      ctx.fillRect(0, fy, w, 2);
      ctx.fillStyle = 'rgba(15,23,42,0.1)';
      ctx.fillRect(0, fy + spandrelH - 2, w, 2);

      // Calm glazed ribbon windows
      const winY = fy + spandrelH + 3;
      const winH = floorH - spandrelH - 6;

      for (let c = 0; c < cols; c++) {
        const cx = c * colW + 3;
        const cw = colW - 6;
        const g = ctx.createLinearGradient(cx, winY, cx + cw * 0.45, winY + winH);
        g.addColorStop(0, online ? pal.glassTop : '#475569');
        g.addColorStop(1, online ? pal.glassBot : '#334155');
        ctx.fillStyle = g;
        ctx.fillRect(cx, winY, cw, winH);

        if (online) {
          const sheen = 0.14 + hash2d(c, f, style.length * 13 + 5) * 0.12;
          ctx.fillStyle = `rgba(255, 255, 255, ${sheen.toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(cx, winY);
          ctx.lineTo(cx + cw * 0.78, winY);
          ctx.lineTo(cx, winY + winH * 0.72);
          ctx.closePath();
          ctx.fill();

          // Subtle recessed interior blind/ceiling tone for architectural depth
          if (hash2d(c + 3, f + 7, 19) > 0.4) {
            ctx.fillStyle = 'rgba(248, 250, 252, 0.16)';
            ctx.fillRect(cx + 4, winY + 4, cw - 8, winH * 0.24);
          }
        }

        // Delicate transom line
        ctx.fillStyle = online ? pal.mullion : '#475569';
        ctx.fillRect(cx, winY + winH * 0.5, cw, 1.5);

        if (pal.pilaster && c % 2 === 0) {
          ctx.fillStyle = online ? pal.pilaster : '#828e9e';
          ctx.fillRect(c * colW - 3, fy, 6, floorH);
        }
      }
    }
  });
}

/**
 * Procedural 256x256 Apple Maps-clear steel-blue monocrystalline PV module grid
 * with crisp silver frames and delicate busbars.
 */
export function getSolarPanelTexture(): THREE.Texture {
  return createCanvasTexture('solar-pv-256-dce-v3', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);

    const pad = 6;
    ctx.fillStyle = '#152d54';
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);

    const cols = 4;
    const rows = 6;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const cellW = innerW / cols;
    const cellH = innerH / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = pad + c * cellW + 1.5;
        const y = pad + r * cellH + 1.5;
        const cw = cellW - 3;
        const ch = cellH - 3;

        const grad = ctx.createLinearGradient(x, y, x + cw, y + ch);
        grad.addColorStop(0, '#1d3b6b');
        grad.addColorStop(0.5, '#19335c');
        grad.addColorStop(1, '#274d8a');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, cw, ch);

        ctx.fillStyle = 'rgba(241, 245, 249, 0.16)';
        for (let f = 1; f <= 4; f++) {
          ctx.fillRect(x, y + (ch * f) / 5, cw, 0.7);
        }

        ctx.fillStyle = 'rgba(241, 245, 249, 0.42)';
        ctx.fillRect(x + cw * 0.28, y, 1.2, ch);
        ctx.fillRect(x + cw * 0.72, y, 1.2, ch);
      }
    }

    ctx.fillStyle = '#f1f5f9';
    for (let r = 1; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        const cx = pad + c * cellW;
        const cy = pad + r * cellH;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 2.4);
        ctx.lineTo(cx + 2.4, cy);
        ctx.lineTo(cx, cy + 2.4);
        ctx.lineTo(cx - 2.4, cy);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  });
}

/**
 * Procedural 512x256 Apple Maps DCE light-slate roadway texture with warm pale
 * limestone sidewalks/curbs and crisp white center markings.
 */
export function getAsphaltRoadTexture(): THREE.Texture {
  return createCanvasTexture(
    'asphalt-road-512-dce-v3',
    512,
    256,
    (ctx, w, h) => {
      // Clean Apple Maps DCE slate roadway
      ctx.fillStyle = '#919aa6';
      ctx.fillRect(0, 0, w, h);

      // Subtle tire-wear tracks
      ctx.fillStyle = 'rgba(71, 85, 105, 0.14)';
      ctx.fillRect(0, h * 0.28, w, h * 0.13);
      ctx.fillRect(0, h * 0.59, w, h * 0.13);

      // Fine mineral speckle
      for (let i = 0; i < 1200; i++) {
        const rx = Math.floor(hash2d(i, 1, 91) * w);
        const ry = Math.floor(hash2d(i, 2, 91) * h);
        const shade = hash2d(i, 3, 91) > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)';
        ctx.fillStyle = shade;
        ctx.fillRect(rx, ry, 2, 2);
      }

      // Pale architectural stone curbs / sidewalk edges
      const curbH = 20;
      ctx.fillStyle = '#e8e6e0';
      ctx.fillRect(0, 0, w, curbH);
      ctx.fillRect(0, h - curbH, w, curbH);

      ctx.fillStyle = '#c4c0b6';
      ctx.fillRect(0, curbH - 3, w, 3);
      ctx.fillRect(0, h - curbH, w, 3);

      for (let x = 0; x < w; x += 64) {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.2)';
        ctx.fillRect(x, 0, 2, curbH);
        ctx.fillRect(x, h - curbH, 2, curbH);
      }

      // Clean white shoulder lines
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.fillRect(0, curbH + 5, w, 3);
      ctx.fillRect(0, h - curbH - 8, w, 3);

      // Dashed white center divider
      ctx.fillStyle = '#ffffff';
      const dashLen = 136;
      const gapLen = 120;
      for (let x = 24; x < w; x += dashLen + gapLen) {
        ctx.fillRect(x, h / 2 - 4, dashLen, 8);
      }
    },
    (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    },
  );
}

/**
 * Procedural 512x512 warm alabaster European pedestrian courtyard pavers.
 */
export function getConcretePlazaTexture(): THREE.Texture {
  return createCanvasTexture('concrete-plaza-512-dce-v3', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e5e2da';
    ctx.fillRect(0, 0, w, h);

    const grid = 8;
    const tile = w / grid;
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const v = Math.floor(234 + hash2d(c, r, 13) * 12);
        const warm = Math.floor(hash2d(c + 5, r + 9, 29) * 5);
        ctx.fillStyle = `rgb(${v + warm}, ${v + 1}, ${v - warm})`;
        ctx.fillRect(c * tile + 2, r * tile + 2, tile - 4, tile - 4);

        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(c * tile + 2, r * tile + 2, tile - 4, 2);
      }
    }
  });
}

/** Procedural 256x256 pale crushed ballast gravel texture for relay & solar terrace pads. */
export function getGravelPadTexture(): THREE.Texture {
  return createCanvasTexture('substation-gravel-256-dce-v3', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d9dce0';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const rx = Math.floor(hash2d(i, 4, 71) * w);
      const ry = Math.floor(hash2d(i, 8, 71) * h);
      const sz = 2 + Math.floor(hash2d(i, 11, 71) * 3);
      const tone = hash2d(i, 15, 71);
      ctx.fillStyle = tone > 0.66 ? '#e8eaee' : tone > 0.33 ? '#cfd4db' : '#b8bfc9';
      ctx.fillRect(rx, ry, sz, sz);
    }
  });
}

/** Procedural 256x256 pale architectural gravel roof membrane framing solar panels cleanly. */
export function getRoofMembraneTexture(): THREE.Texture {
  return createCanvasTexture('roof-membrane-256-dce-v3', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d6d9de';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    for (let y = 0; y < h; y += 32) {
      ctx.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 650; i++) {
      const rx = Math.floor(hash2d(i, 3, 19) * w);
      const ry = Math.floor(hash2d(i, 6, 19) * h);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(100,116,139,0.08)';
      ctx.fillRect(rx, ry, 2, 2);
    }
  });
}
