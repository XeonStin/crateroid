// ============ 天空背景：星 / 云 / 极光 / 环境粒子（屏幕空间视差） ============
import * as PIXI from 'pixi.js';
import { THEMES } from '../config.js';

export class Sky {
  constructor(themeKey, mobile) {
    this.container = new PIXI.Container();
    this.t = 0;
    this.theme = THEMES[themeKey];
    this.embers = [];
    const n = mobile ? 0.5 : 1; // 性能降档系数

    // 星星
    if (this.theme.stars) {
      const g = new PIXI.Graphics();
      for (let i = 0; i < this.theme.stars * n; i++) {
        const x = Math.random() * 2400, y = Math.random() * 700;
        const r = Math.random() * 1.6 + 0.5;
        g.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.3 + Math.random() * 0.7 });
      }
      this.container.addChild(g);
    }

    // 极光（雪原主题：几条摇曳的绿色光带）
    if (this.theme.aurora) {
      this.aurora = new PIXI.Graphics();
      this.aurora.alpha = 0.35;
      this.container.addChild(this.aurora);
    }

    // 月亮/太阳（位置在首帧按屏幕宽度摆放）
    const sun = new PIXI.Graphics();
    const isNight = this.theme.stars > 0;
    sun.circle(0, 0, isNight ? 46 : 58).fill({ color: isNight ? 0xfff4d6 : 0xffe9a8, alpha: 0.95 });
    if (isNight) sun.circle(30, -15, 40).fill({ color: this.theme.sky[0].split(' ')[0] === '#0e1e42' ? 0x10234a : 0x3d1418, alpha: 1 });
    this.sun = sun;
    this.container.addChild(sun);

    // 云朵
    this.clouds = [];
    if (this.theme.clouds) {
      const count = Math.round(7 * n);
      for (let i = 0; i < count; i++) {
        const c = new PIXI.Graphics();
        const s = 0.6 + Math.random() * 0.9;
        const cx = Math.random() * 2600 - 100, cy = 80 + Math.random() * 380;
        c.circle(0, 0, 34 * s).fill({ color: 0xffffff, alpha: 0.75 });
        c.circle(30 * s, 8 * s, 26 * s).fill({ color: 0xffffff, alpha: 0.75 });
        c.circle(-30 * s, 10 * s, 22 * s).fill({ color: 0xffffff, alpha: 0.75 });
        c.circle(8 * s, -14 * s, 24 * s).fill({ color: 0xffffff, alpha: 0.75 });
        c.position.set(cx, cy);
        c.alpha = 0.5 + Math.random() * 0.35;
        this.clouds.push({ view: c, speed: 6 + Math.random() * 12 });
        this.container.addChild(c);
      }
    }

    // 熔岩环境火星
    if (this.theme.embers) {
      for (let i = 0; i < 26 * n; i++) {
        const e = new PIXI.Graphics();
        e.circle(0, 0, 1.5 + Math.random() * 2).fill({ color: 0xff7a30, alpha: 0.9 });
        e.position.set(Math.random() * 2400, 300 + Math.random() * 900);
        this.embers.push({ view: e, vy: -20 - Math.random() * 45, drift: Math.random() * 30 - 15 });
        this.container.addChild(e);
      }
    }
  }

  update(dt, camX, viewW) {
    this.t += dt;
    this._fc = ((this._fc || 0) + 1) % 2;
    if (!this._sunPlaced && viewW > 0) {
      this._sunPlaced = true;
      this.sun.position.set(viewW * 0.84, 110);
    }
    // 视差：背景以相机 x 的 6% 速率反向移动
    this.container.x = -camX * 0.06;
    for (const c of this.clouds) {
      c.view.x += c.speed * dt;
      if (c.view.x > 2600) c.view.x = -200;
    }
    // 极光 30fps 重绘（3 条 80+ 点多边形）
    if (this.aurora && this._fc === 0) {
      const g = this.aurora;
      g.clear();
      for (let band = 0; band < 3; band++) {
        const baseY = 90 + band * 70;
        const pts = [];
        for (let x = 0; x <= 2400; x += 60) {
          pts.push(x, baseY + Math.sin(x / 300 + this.t * 0.7 + band * 2) * 46);
        }
        for (let x = 2400; x >= 0; x -= 60) {
          pts.push(x, baseY + 60 + Math.sin(x / 300 + this.t * 0.7 + band * 2) * 46);
        }
        g.poly(pts).fill({ color: band === 1 ? 0x63e6b0 : 0x7ec8ff, alpha: 0.16 });
      }
    }
    for (const e of this.embers) {
      e.view.y += e.vy * dt;
      e.view.x += Math.sin(this.t * 2 + e.vy) * e.drift * dt;
      if (e.view.y < 200) { e.view.y = 1300; e.view.x = Math.random() * 2400; }
    }
  }
}
