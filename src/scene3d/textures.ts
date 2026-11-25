import * as THREE from 'three';

export type CurtainWallStyle = 'glass' | 'limestone' | 'dark';

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
    const fallback = new THREE.DataTexture(new Uint8Array([30, 41, 59, 255]), 1, 1);
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
  glass: {
    spandrelTop: '#334155',
    spandrelBot: '#1e293b',
    mullion: '#0f172a',
    glassTop: '#3b6790',
    glassBot: '#214162',
    pilaster: null,
  },
  limestone: {
    spandrelTop: '#cbd5e1',
    spandrelBot: '#94a3b8',
    mullion: '#334155',
    glassTop: '#2f5478',
    glassBot: '#1a334e',
    pilaster: '#b0bac6',
  },
  dark: {
    spandrelTop: '#1e293b',
    spandrelBot: '#0f172a',
    mullion: '#090d16',
    glassTop: '#264666',
    glassBot: '#13273e',
    pilaster: null,
  },
};

/**
 * Procedural 512x512 European architectural curtain-wall facade texture.
 * Renders concrete/stone floor spandrels, anodized mullions, sky-tinted
 * glazing, and warm lit office bays when `online === true`.
 */
export function getCurtainWallTexture(
  style: CurtainWallStyle,
  online: boolean,
): THREE.Texture {
  const key = `curtain:${style}:${online ? 'on' : 'off'}`;
  return createCanvasTexture(key, 512, 512, (ctx, w, h) => {
    const pal = CURTAIN_PALETTES[style];
    const floors = 4;
    const cols = 8;
    const floorH = h / floors;
    const colW = w / cols;
    const spandrelH = 26;

    ctx.fillStyle = pal.mullion;
    ctx.fillRect(0, 0, w, h);

    for (let f = 0; f < floors; f++) {
      const fy = f * floorH;

      // Floor spandrel band with subtle top highlight & bottom shadow reveal.
      const spGrad = ctx.createLinearGradient(0, fy, 0, fy + spandrelH);
      spGrad.addColorStop(0, online ? pal.spandrelTop : '#1e293b');
      spGrad.addColorStop(1, online ? pal.spandrelBot : '#0f172a');
      ctx.fillStyle = spGrad;
      ctx.fillRect(0, fy, w, spandrelH);

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, fy, w, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, fy + spandrelH - 2, w, 2);

      // Glazed ribbon windows for this story.
      const winY = fy + spandrelH + 3;
      const winH = floorH - spandrelH - 6;

      for (let c = 0; c < cols; c++) {
        const cx = c * colW + 3;
        const cw = colW - 6;
        const r = hash2d(c, f, style.length * 19 + 7);
        const lit = online && r > 0.36;

        if (lit) {
          const warmth = hash2d(c + 11, f + 3, 41);
          const g = ctx.createLinearGradient(cx, winY, cx, winY + winH);
          if (warmth > 0.45) {
            g.addColorStop(0, '#fef3c7');
            g.addColorStop(0.45, '#fde68a');
            g.addColorStop(1, '#d97706');
          } else {
            g.addColorStop(0, '#e0f2fe');
            g.addColorStop(0.55, '#bae6fd');
            g.addColorStop(1, '#64748b');
          }
          ctx.fillStyle = g;
          ctx.fillRect(cx, winY, cw, winH);

          // Subtle office ceiling luminaire & desk silhouette.
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.fillRect(cx + 6, winY + 5, cw - 12, 4);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
          ctx.fillRect(cx + 3, winY + winH * 0.68, cw - 6, winH * 0.32);
        } else {
          const g = ctx.createLinearGradient(cx, winY, cx + cw, winY + winH);
          g.addColorStop(0, online ? pal.glassTop : '#111c2d');
          g.addColorStop(1, online ? pal.glassBot : '#090f1a');
          ctx.fillStyle = g;
          ctx.fillRect(cx, winY, cw, winH);

          // Subtle sky reflection sheen on unlit glass.
          if (online) {
            ctx.fillStyle = 'rgba(186, 230, 253, 0.12)';
            ctx.beginPath();
            ctx.moveTo(cx, winY);
            ctx.lineTo(cx + cw * 0.65, winY);
            ctx.lineTo(cx, winY + winH * 0.7);
            ctx.closePath();
            ctx.fill();
          }
        }

        // Mid-pane horizontal transom bar.
        ctx.fillStyle = pal.mullion;
        ctx.fillRect(cx, winY + winH * 0.46, cw, 2);

        // Vertical limestone pilaster accents on every 2nd column for 'limestone'.
        if (pal.pilaster && c % 2 === 0) {
          ctx.fillStyle = online ? pal.pilaster : '#334155';
          ctx.fillRect(c * colW - 3, fy, 6, floorH);
        }
      }
    }
  });
}

/**
 * Procedural 256x256 dark monocrystalline silicon PV module grid
 * with silver busbars, chamfered cell corners, and aluminum frame.
 */
export function getSolarPanelTexture(): THREE.Texture {
  return createCanvasTexture('solar-pv-256', 256, 256, (ctx, w, h) => {
    // Anodized aluminum outer module frame.
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, w, h);

    const pad = 7;
    ctx.fillStyle = '#07142b';
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
        grad.addColorStop(0, '#0c234a');
        grad.addColorStop(0.5, '#091a38');
        grad.addColorStop(1, '#0f2b57');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, cw, ch);

        // Fine photovoltaic finger lines.
        ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
        for (let f = 1; f <= 4; f++) {
          ctx.fillRect(x, y + (ch * f) / 5, cw, 0.7);
        }

        // Dual silver busbars per cell.
        ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
        ctx.fillRect(x + cw * 0.28, y, 1.3, ch);
        ctx.fillRect(x + cw * 0.72, y, 1.3, ch);
      }
    }

    // Monocrystalline diamond corner tabs between cells.
    ctx.fillStyle = '#cbd5e1';
    for (let r = 1; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        const cx = pad + c * cellW;
        const cy = pad + r * cellH;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 3);
        ctx.lineTo(cx + 3, cy);
        ctx.lineTo(cx, cy + 3);
        ctx.lineTo(cx - 3, cy);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Crisp inner bezel highlight.
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  });
}

/**
 * Procedural 512x256 horizontal road texture with concrete curbs along
 * top/bottom edges, weathered dark asphalt grain, and dashed white centerline.
 */
export function getAsphaltRoadTexture(): THREE.Texture {
  return createCanvasTexture(
    'asphalt-road-512',
    512,
    256,
    (ctx, w, h) => {
      // Base weathered asphalt.
      ctx.fillStyle = '#1f2833';
      ctx.fillRect(0, 0, w, h);

      // Subtle tire-wear longitudinal tracks.
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.fillRect(0, h * 0.28, w, h * 0.14);
      ctx.fillRect(0, h * 0.58, w, h * 0.14);

      // Deterministic fine mineral asphalt aggregate speckle.
      for (let i = 0; i < 1800; i++) {
        const rx = Math.floor(hash2d(i, 1, 91) * w);
        const ry = Math.floor(hash2d(i, 2, 91) * h);
        const shade = hash2d(i, 3, 91) > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.16)';
        ctx.fillStyle = shade;
        ctx.fillRect(rx, ry, 2, 2);
      }

      // Top & bottom concrete curbs.
      const curbH = 18;
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, 0, w, curbH);
      ctx.fillRect(0, h - curbH, w, curbH);

      ctx.fillStyle = '#475569';
      ctx.fillRect(0, curbH - 3, w, 3);
      ctx.fillRect(0, h - curbH, w, 3);

      for (let x = 0; x < w; x += 64) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
        ctx.fillRect(x, 0, 2, curbH);
        ctx.fillRect(x, h - curbH, 2, curbH);
      }

      // Edge shoulder stripes.
      ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
      ctx.fillRect(0, curbH + 6, w, 3);
      ctx.fillRect(0, h - curbH - 9, w, 3);

      // Dashed white lane centerline.
      ctx.fillStyle = '#e2e8f0';
      const dashLen = 140;
      const gapLen = 116;
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
 * Procedural 512x512 architectural Grenoble limestone/granite courtyard pavers.
 */
export function getConcretePlazaTexture(): THREE.Texture {
  return createCanvasTexture('concrete-plaza-512', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, w, h);

    const grid = 8;
    const tile = w / grid;
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const v = Math.floor(156 + hash2d(c, r, 13) * 26);
        const warm = Math.floor(hash2d(c + 5, r + 9, 29) * 8);
        ctx.fillStyle = `rgb(${v + warm}, ${v + 4}, ${v + 8 - warm})`;
        ctx.fillRect(c * tile + 2, r * tile + 2, tile - 4, tile - 4);

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(c * tile + 2, r * tile + 2, tile - 4, 2);
      }
    }

    // Fine stone aggregate speckle.
    for (let i = 0; i < 900; i++) {
      const rx = Math.floor(hash2d(i, 7, 53) * w);
      const ry = Math.floor(hash2d(i, 9, 53) * h);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(rx, ry, 2, 2);
    }
  });
}

/** Procedural 256x256 crushed ballast gravel texture for the MV substation pad. */
export function getGravelPadTexture(): THREE.Texture {
  return createCanvasTexture('substation-gravel-256', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const rx = Math.floor(hash2d(i, 4, 71) * w);
      const ry = Math.floor(hash2d(i, 8, 71) * h);
      const sz = 2 + Math.floor(hash2d(i, 11, 71) * 3);
      const tone = hash2d(i, 15, 71);
      ctx.fillStyle = tone > 0.66 ? '#94a3b8' : tone > 0.33 ? '#64748b' : '#334155';
      ctx.fillRect(rx, ry, sz, sz);
    }
  });
}

/** Procedural 256x256 flat roof architectural membrane texture. */
export function getRoofMembraneTexture(): THREE.Texture {
  return createCanvasTexture('roof-membrane-256', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#253244';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
    for (let y = 0; y < h; y += 32) {
      ctx.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 650; i++) {
      const rx = Math.floor(hash2d(i, 3, 19) * w);
      const ry = Math.floor(hash2d(i, 6, 19) * h);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(rx, ry, 2, 2);
    }
  });
}
