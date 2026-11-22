import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace } from 'three';

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

/** Soft radial additive glow texture for lights, halos, moon and engine bloom. */
export function createGlowTexture(inner = '#ffffff', mid = '#ffc88099', outer = '#ff882000'): CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.22, mid);
  g.addColorStop(0.55, mid.slice(0, 7) + '33');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Soft cloudy puff sprite for exhaust steam, RCS gas, and explosion smoke. */
export function createPuffTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  const blobs = [
    [64, 64, 46, 0.72],
    [48, 54, 32, 0.45],
    [82, 58, 30, 0.42],
    [58, 78, 34, 0.4],
    [76, 74, 28, 0.35],
  ];
  for (const [x, y, r, a] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(235,244,255,${a * 0.42})`);
    g.addColorStop(1, 'rgba(220,235,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Brushed stainless-steel skin with circumferential weld rings and aft heat-scorch patina. */
export function createBoosterTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 512);
  // Base vertical steel tone: bright clean upper cryo section -> slightly scorched aft skirt.
  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#cfd9e2');
  base.addColorStop(0.18, '#b9c6d2');
  base.addColorStop(0.55, '#9eacb9');
  base.addColorStop(0.84, '#7d8894');
  base.addColorStop(0.95, '#595f68');
  base.addColorStop(1, '#393f48');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);

  // Subtle horizontal brushed-metal bands & barrel variation.
  for (let i = 0; i < 28; i++) {
    const y = Math.round((i / 28) * 512);
    const h = Math.ceil(512 / 28);
    const shade = ((i * 37) % 11) - 5;
    ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade * 0.014})` : `rgba(12,22,36,${-shade * 0.018})`;
    ctx.fillRect(0, y, 256, h);
    // Weld seam line.
    ctx.fillStyle = 'rgba(22,32,44,0.34)';
    ctx.fillRect(0, y, 256, 2);
    ctx.fillStyle = 'rgba(230,242,255,0.16)';
    ctx.fillRect(0, y + 2, 256, 1);
  }

  // Cryo frost patch mid-tank (LOX / CH4 bands) + vertical raceway / chine shadow.
  const frost = ctx.createLinearGradient(0, 120, 0, 310);
  frost.addColorStop(0, 'rgba(235,246,255,0)');
  frost.addColorStop(0.3, 'rgba(235,246,255,0.22)');
  frost.addColorStop(0.7, 'rgba(225,240,255,0.16)');
  frost.addColorStop(1, 'rgba(235,246,255,0)');
  ctx.fillStyle = frost;
  ctx.fillRect(0, 120, 256, 190);

  // Vertical stringer / soot streaks near the bottom.
  for (let x = 0; x < 256; x += 8) {
    const a = 0.05 + ((x * 19) % 7) * 0.014;
    const soot = ctx.createLinearGradient(0, 350, 0, 512);
    soot.addColorStop(0, 'rgba(20,16,14,0)');
    soot.addColorStop(1, `rgba(24,18,15,${a * 2.4})`);
    ctx.fillStyle = soot;
    ctx.fillRect(x, 350, 5, 162);
  }

  // Subtle amber-tinted hot-staging ring near the top.
  ctx.fillStyle = '#2a3644';
  ctx.fillRect(0, 16, 256, 18);
  for (let x = 6; x < 256; x += 16) {
    ctx.fillStyle = '#141d28';
    ctx.fillRect(x, 19, 10, 12);
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Colorful paneled hot-air balloon fabric texture. */
export function createBalloonTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 128);
  const colors = ['#e87a86', '#f7d59c', '#6bb7c8', '#f29f72', '#d96f8c', '#f5e6cc'];
  const stripes = 12;
  const w = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(i * w, 0, w + 1, 128);
  }
  // Horizontal accent band & subtle panel seams.
  ctx.fillStyle = 'rgba(255,250,240,0.35)';
  ctx.fillRect(0, 52, 256, 18);
  ctx.fillStyle = 'rgba(20,25,38,0.22)';
  for (let i = 0; i < stripes; i++) ctx.fillRect(i * w, 0, 1.5, 128);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
