// ============ 水面（或熔岩）：波浪 + 上涨 ============
import { WORLD_W, WORLD_H } from '../config.js';
import * as PIXI from 'pixi.js';

export class Water {
  constructor(themeKey, W = WORLD_W, H = WORLD_H) {
    this.level = 1150;        // 当前水面 y（y 向下为正：数值变小 = 水位上涨）
    this.target = 1150;       // 目标（上涨动画）
    this.t = 0;
    this.W = W; this.H = H;   // 跟随地图尺寸（大/中/小）
    this.minLevel = Math.round(H * 0.62); // 突死水位上限（淹没谷地、高地可站）
    this.view = new PIXI.Graphics();
    this.view.zIndex = 500;
    this.themeKey = themeKey;
  }

  setLevel(y) { this.level = this.target = y; }

  // 上涨 = 水面 y 减小；钳在 minLevel 防止全图淹没
  rise(px) { this.target = Math.max(this.target - px, this.minLevel); }

  update(dt) {
    this.t += dt;
    // 平滑上涨
    this.level += (this.target - this.level) * Math.min(1, dt * 1.6);
    // 波浪 30fps 重绘（60 段多边形重建成本可观）
    this._fc = ((this._fc || 0) + 1) % 2;
    if (this._fc === 0) this.draw();
  }

  draw() {
    const g = this.view;
    g.clear();
    const isLava = this.themeKey === 'lava';
    const y = this.level;
    // 波浪多边形
    const segs = 60, amp = isLava ? 3 : 6;
    const pts = [0, y + 4];
    for (let i = 0; i <= segs; i++) {
      const x = (this.W / segs) * i;
      const wy = y + Math.sin(i * 0.55 + this.t * (isLava ? 1.2 : 2)) * amp;
      pts.push(x, wy);
    }
    pts.push(this.W, 2000, 0, 2000);
    g.poly(pts).fill({ color: isLava ? 0xff5a1e : 0x2f86d6, alpha: isLava ? 0.92 : 0.68 });
    // 表层亮带
    const pts2 = [0, y + 4];
    for (let i = 0; i <= segs; i++) {
      const x = (this.W / segs) * i;
      const wy = y + Math.sin(i * 0.55 + this.t * (isLava ? 1.2 : 2)) * amp;
      pts2.push(x, wy);
    }
    pts2.push(this.W, y + 16, 0, y + 16);
    g.poly(pts2).fill({ color: isLava ? 0xffc23d : 0x9fd4ff, alpha: isLava ? 0.85 : 0.5 });
  }
}
