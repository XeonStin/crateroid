// ============ 可破坏地形：程序生成 + 位图掩码 + 挖坑 ============
import { WORLD_W, WORLD_H, THEMES } from '../config.js';
import * as PIXI from 'pixi.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 一维值噪声
function makeNoise1D(rng, size = 512) {
  const vals = new Float32Array(size);
  for (let i = 0; i < size; i++) vals[i] = rng();
  return (x) => {
    x = ((x % size) + size) % size;
    const i = Math.floor(x), f = x - i;
    const a = vals[i], b = vals[(i + 1) % size];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

export class Terrain {
  constructor(W = WORLD_W, H = WORLD_H) {
    this.W = W; this.H = H;
    this.mask = new Uint8Array(this.W * this.H);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.waterY = 1150;
    this.theme = null;
    // 分块纹理：爆炸只更新脏瓦片，避免整图重传 GPU
    this.TILE_W = 600; this.TILE_H = 675;
    this.tiles = [];   // {canvas, ctx, sprite, x0, y0}
  }

  attach(container) {
    this._destroyTiles();
    container.sortableChildren = true;
    const cols = Math.ceil(this.W / this.TILE_W), rows = Math.ceil(this.H / this.TILE_H);
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const x0 = rx * this.TILE_W, y0 = ry * this.TILE_H;
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(this.TILE_W, this.W - x0);
        canvas.height = Math.min(this.TILE_H, this.H - y0);
        const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
        sprite.position.set(x0, y0);
        sprite.zIndex = 0;
        container.addChild(sprite);
        this.tiles.push({ canvas, ctx: canvas.getContext('2d'), sprite, x0, y0 });
      }
    }
  }

  _destroyTiles() {
    for (const t of this.tiles) {
      t.sprite.destroy({ texture: true, textureSource: true });
    }
    this.tiles = [];
  }

  // 把主画布区域 blit 到脏瓦片
  _blitTile(t) {
    t.ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
    t.ctx.drawImage(this.canvas, t.x0, t.y0, t.canvas.width, t.canvas.height, 0, 0, t.canvas.width, t.canvas.height);
    t.sprite.texture.source.update();
  }

  // 对相交瓦片应用局部破坏并刷新纹理
  _damageTiles(x0, y0, x1, y1, drawFn) {
    for (const t of this.tiles) {
      const tx1 = t.x0 + t.canvas.width, ty1 = t.y0 + t.canvas.height;
      if (x1 < t.x0 || x0 > tx1 || y1 < t.y0 || y0 > ty1) continue;
      t.ctx.save();
      t.ctx.translate(-t.x0, -t.y0);
      t.ctx.globalCompositeOperation = 'destination-out';
      drawFn(t.ctx);
      t.ctx.restore();
      t.sprite.texture.source.update();
    }
  }

  isSolid(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || x >= this.W) return true;          // 左右边界视为墙
    if (y < 0) return false;
    if (y >= this.H) return false;                   // 底部开放（落水）
    return this.mask[y * this.W + x] === 1;
  }

  // 列 x 上从 yStart 向下找第一个实心点（找不到返回 null）
  findSurfaceY(x, yStart = 0) {
    x |= 0;
    if (x < 0 || x >= this.W) return null;
    for (let y = Math.max(0, yStart | 0); y < this.H; y++) {
      if (this.mask[y * this.W + x]) return y;
    }
    return null;
  }

  // ---------------- 生成 ----------------
  // modifier(terrain)：教学关自定义场景在纹理绘制前改写掩码/水位
  generate(themeKey, seed, modifier = null) {
    const theme = this.theme = THEMES[themeKey];
    this.noDecor = false;
    const rng = mulberry32(seed || Math.floor(Math.random() * 1e9));
    const n1 = makeNoise1D(rng), n2 = makeNoise1D(rng), n3 = makeNoise1D(rng), n4 = makeNoise1D(rng);
    const { W, H, mask } = this;
    mask.fill(0);
    this.waterY = theme.waterY;

    // 1) 高度图地形
    const heights = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const h = theme.base
        + (n1(x / 620) - 0.5) * 2 * theme.amps[0]
        + (n2(x / 170) - 0.5) * 2 * theme.amps[1]
        + (n3(x / 62) - 0.5) * 2 * theme.amps[2];
      heights[x] = Math.min(this.waterY - 60, Math.max(220, h));
    }
    // 沙漠平顶台地
    if (theme.mesas) {
      for (let m = 0; m < 3; m++) {
        const cx = 300 + rng() * (W - 600), wHalf = 90 + rng() * 130;
        const top = 300 + rng() * 200;
        for (let x = Math.max(0, cx - wHalf | 0); x < Math.min(W, cx + wHalf | 0); x++) {
          if (Math.abs(x - cx) < wHalf * 0.82) heights[x] = Math.min(heights[x], top);
        }
      }
    }
    for (let x = 0; x < W; x++) {
      for (let y = heights[x] | 0; y < H; y++) mask[y * W + x] = 1;
    }

    // 2) 边缘悬崖（防虫虫走出世界落水太容易）：左右加高
    const edgeTop = Math.round(H * 0.23);
    for (let x = 0; x < 46; x++) {
      const top = edgeTop + (46 - x) * 4;
      for (let y = top; y < H; y++) mask[y * W + x] = 1;
    }
    for (let x = W - 46; x < W; x++) {
      const top = edgeTop + (x - (W - 46)) * 4;
      for (let y = top; y < H; y++) mask[y * W + x] = 1;
    }

    // 3) 悬浮岛
    if (theme.islands) {
      const n = 2 + (rng() * 2 | 0);
      for (let i = 0; i < n; i++) {
        const cx = 260 + rng() * (W - 520);
        const cy = 260 + rng() * 220;
        const rx = 110 + rng() * 150, ry = 42 + rng() * 46;
        for (let dx = -rx; dx <= rx; dx++) {
          for (let dy = -ry; dy <= ry; dy++) {
            const nx = dx / rx, ny = dy / ry;
            const d = nx * nx + ny * ny + (n4(dx / 22) - 0.5) * 0.5;
            if (d < 1) {
              const px = (cx + dx) | 0, py = (cy + dy) | 0;
              if (px >= 0 && px < W && py >= 0 && py < H) mask[py * W + px] = 1;
            }
          }
        }
      }
    }

    // 4) 地下洞穴
    const caves = 2 + (rng() * 2 | 0);
    for (let i = 0; i < caves; i++) {
      const cx = 200 + rng() * (W - 400);
      const cy = this.waterY - 60 + rng() * 120;
      const rx = 60 + rng() * 90, ry = 34 + rng() * 30;
      for (let dx = -rx; dx <= rx; dx++) {
        for (let dy = -ry; dy <= ry; dy++) {
          if ((dx / rx) ** 2 + (dy / ry) ** 2 < 1) {
            const px = (cx + dx) | 0, py = (cy + dy) | 0;
            if (px >= 0 && px < W && py >= 0 && py < H) mask[py * W + px] = 0;
          }
        }
      }
    }

    // 5) 湖（挖到水位以下）
    if (theme.lakes) {
      for (let i = 0; i < theme.lakes; i++) {
        const cx = 300 + rng() * (W - 600), rx = 90 + rng() * 130;
        for (let dx = -rx; dx <= rx; dx++) {
          const depth = Math.cos(dx / rx * Math.PI / 2) * 130;
          for (let y = this.waterY - depth | 0; y < this.waterY + 60 && y < H; y++) {
            const px = (cx + dx) | 0;
            if (px >= 0 && px < W && y >= 0) mask[y * W + px] = 0;
          }
        }
      }
    }

    if (modifier) modifier(this);

    this._paint(rng);
    if (!this.noDecor) this._decorate(rng);
    for (const t of this.tiles) this._blitTile(t);
  }

  // 地表装饰物（烘焙进地形纹理，爆炸时随地形一起消失）
  _decorate(rng) {
    const { W, ctx, theme } = this;
    const kind = theme.decor;
    if (!kind) return;
    for (let i = 0; i < 10; i++) {
      const x = 70 + Math.floor(rng() * (W - 140));
      const sy = this.findSurfaceY(x, 0);
      if (sy === null || sy > this.waterY - 26 || sy < 60) continue;
      // 只放在较平坦处（左右 8px 高度差 < 14）
      const l = this.findSurfaceY(x - 8, 0), r2 = this.findSurfaceY(x + 8, 0);
      if (l === null || r2 === null || Math.abs(l - sy) > 14 || Math.abs(r2 - sy) > 14) continue;
      ctx.save();
      ctx.translate(x, sy);
      if (kind === 'palm') this._drawPalm(ctx, rng);
      else if (kind === 'pine') this._drawPine(ctx);
      else if (kind === 'cactus') this._drawCactus(ctx);
      else if (kind === 'crystal') this._drawCrystal(ctx, rng);
      ctx.restore();
    }
  }

  _drawPalm(ctx, rng) {
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-1.5, -19, 3, 19);
    ctx.fillStyle = '#3fa34d';
    for (const [dx, dy, ex, ey] of [[-13, -23, -1, -21], [0, -27, 0, -21], [13, -23, 1, -21]]) {
      ctx.beginPath();
      ctx.moveTo(dx, dy); ctx.lineTo(ex, ey); ctx.lineTo(dx * 0.55, dy - 4);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#2e8b3f';
    ctx.beginPath(); ctx.ellipse(0, -21, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  }

  _drawPine(ctx) {
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(-1.5, -7, 3, 7);
    ctx.fillStyle = '#2f7a4f';
    ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(9, -6); ctx.lineTo(0, -24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3d9159';
    ctx.beginPath(); ctx.moveTo(-7, -14); ctx.lineTo(7, -14); ctx.lineTo(0, -30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-3, -25); ctx.lineTo(3, -25); ctx.lineTo(0, -31); ctx.closePath(); ctx.fill();
  }

  _drawCactus(ctx) {
    ctx.fillStyle = '#4f9e56';
    ctx.fillRect(-3.5, -22, 7, 22);
    ctx.fillRect(-10, -16, 4, 9);
    ctx.fillRect(-10, -16, 7, 4);
    ctx.fillRect(6, -12, 4, 8);
    ctx.fillRect(3, -12, 7, 4);
    ctx.strokeStyle = '#2f7a3f';
    ctx.lineWidth = 1;
    ctx.strokeRect(-3.5, -22, 7, 22);
  }

  _drawCrystal(ctx, rng) {
    const h1 = 12 + rng() * 8, h2 = 8 + rng() * 6;
    ctx.fillStyle = '#b980ff';
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-4, -h1); ctx.lineTo(1, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0a8ff';
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(7, -h2); ctx.lineTo(11, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(185,128,255,0.25)';
    ctx.beginPath(); ctx.arc(1, -6, 13, 0, Math.PI * 2); ctx.fill();
  }

  // 按列扫描实心段着色
  _paint(rng) {
    const { W, H, ctx, mask, theme } = this;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const cTop = hexRGB(theme.top), cTop2 = hexRGB(theme.top2);
    const cBody = hexRGB(theme.body), cBody2 = hexRGB(theme.body2);
    const cSpeck = hexRGB(theme.speck);
    const topBand = 13;
    for (let x = 0; x < W; x++) {
      let runTop = -1;
      for (let y = 0; y < H; y++) {
        const solid = mask[y * W + x] === 1;
        if (solid && runTop < 0) runTop = y;
        if (!solid) { runTop = -1; continue; }
        const depth = y - runTop;
        let r, g, b;
        if (depth < topBand) {
          const t = depth / topBand;
          r = lerp(cTop2[0], cTop[0], t); g = lerp(cTop2[1], cTop[1], t); b = lerp(cTop2[2], cTop[2], t);
        } else {
          const t = Math.min(1, (depth - topBand) / 260);
          r = lerp(cBody[0], cBody2[0], t); g = lerp(cBody[1], cBody2[1], t); b = lerp(cBody[2], cBody2[2], t);
          // 斑点纹理
          const h = (x * 73856093 ^ y * 19349663) >>> 0;
          if ((h % 23) === 0) { r = cSpeck[0]; g = cSpeck[1]; b = cSpeck[2]; }
          else { const v = ((h >> 8) % 13) - 6; r += v; g += v; b += v; }
        }
        // 熔岩图：深处岩浆光斑
        if (theme.lava && y > this.waterY - 200) {
          const h2 = (x * 2654435761 ^ y * 40503) >>> 0;
          if ((h2 % 97) < 3) { r = 255; g = 110 + (h2 % 60); b = 30; }
        }
        const o = (y * W + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------------- 破坏 ----------------
  // 圆形爆炸挖坑
  carve(cx, cy, r) {
    const { W, H, mask } = this;
    const x0 = Math.max(0, cx - r | 0), x1 = Math.min(W - 1, cx + r | 0);
    const y0 = Math.max(0, cy - r | 0), y1 = Math.min(H - 1, cy + r | 0);
    let changed = false;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy, dy2 = dy * dy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy2 <= r * r) {
          const i = y * W + x;
          if (mask[i]) { mask[i] = 0; changed = true; }
        }
      }
    }
    if (changed) {
      this._damageTiles(x0, y0, x1, y1, (ctx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    return changed;
  }

  // 垂直钻挖隧道
  drillColumn(cx, yFrom, depth, r) {
    const { W, H, mask } = this;
    const y0 = Math.max(0, yFrom | 0), y1 = Math.min(H - 1, (yFrom + depth) | 0);
    for (let y = y0; y <= y1; y++) {
      for (let x = Math.max(0, cx - r | 0); x <= Math.min(W - 1, cx + r | 0); x++) {
        const dx = x - cx;
        if (dx * dx <= r * r - 1) mask[y * W + x] = 0;
      }
    }
    this._damageTiles(cx - r - 1, y0, cx + r + 1, y1, (ctx) => {
      ctx.beginPath();
      ctx.roundRect(cx - r, y0, r * 2, y1 - y0, r);
      ctx.fill();
    });
  }

  // 挖出后找虫虫落脚点（若脚下悬空自然下落即可，这里只做辅助查询）
  groundY(x, fromY) {
    return this.findSurfaceY(x, Math.max(0, fromY - 40));
  }
}

// ---------------- 工具 ----------------
function hexRGB(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
function lerp(a, b, t) { return a + (b - a) * t; }
