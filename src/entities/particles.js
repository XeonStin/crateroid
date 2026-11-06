// ============ 粒子系统（Sprite 对象池 + 共享圆点纹理） ============
import * as PIXI from 'pixi.js';

const MAX = 420;

// 白色圆点共享纹理（tint 上色），避免每帧重建 Graphics 几何
let _dotTex = null;
function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(16, 16, 14, 0, Math.PI * 2);
  g.fill();
  _dotTex = PIXI.Texture.from(c);
  return _dotTex;
}

export class Particles {
  constructor(mobile) {
    this.pool = [];
    this.active = [];
    this.mobile = mobile;
    this.layer = new PIXI.Container();
    this.layer.zIndex = 800;
    const tex = dotTexture();
    for (let i = 0; i < MAX; i++) {
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      this.pool.push({ view: s, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: 0xffffff, gravity: 0, fade: true, shrink: false });
    }
  }

  spawn(opts) {
    const p = this.pool.find(p => !p.view.visible);
    if (!p) return;
    const scale = this.mobile ? 0.6 : 1;
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0;
    p.maxLife = p.life = opts.life || 0.6;
    p.size = (opts.size || 4) * scale;
    p.color = opts.color ?? 0xffffff;
    p.gravity = opts.gravity ?? 0;
    p.fade = opts.fade !== false;
    p.shrink = !!opts.shrink;
    p.view.visible = true;
    p.view.tint = p.color;
    this._draw(p);
    this.active.push(p);
  }

  _draw(p) {
    const v = p.view;
    v.position.set(p.x, p.y);
    const t = p.life / p.maxLife;
    v.alpha = p.fade ? Math.min(1, t * 1.6) : 1;
    const s = p.shrink ? p.size * (0.3 + 0.7 * t) : p.size;
    v.scale.set(Math.max(0.06, s / 14)); // 纹理半径 14px → 世界半径 s
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) { p.view.visible = false; this.active.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      this._draw(p);
    }
  }

  clear() {
    for (const p of this.active) p.view.visible = false;
    this.active.length = 0;
  }

  // -------- 高级发射器 --------
  explosion(x, y, r, dirtColor, mobile) {
    const n = Math.min((mobile ? 14 : 26), r);
    // 火光
    for (let i = 0; i < n * 0.7; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * r * 4.2;
      this.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.25 + Math.random() * 0.3, size: 5 + Math.random() * 7, color: [0xffd23d, 0xff8c42, 0xff5a2a][i % 3], shrink: true });
    }
    // 烟
    for (let i = 0; i < n * 0.5; i++) {
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * r * 2;
      this.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.7 + Math.random() * 0.8, size: 8 + Math.random() * 10, color: 0x777777, gravity: -30, shrink: true });
    }
    // 泥土碎块
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 90 + Math.random() * r * 3.6;
      this.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.7, size: 2.5 + Math.random() * 4, color: dirtColor, gravity: 900 });
    }
  }

  splash(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8, sp = 60 + Math.random() * 160;
      this.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4, size: 2 + Math.random() * 3, color, gravity: 700 });
    }
  }

  sparkle(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 90;
      this.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.4, size: 2 + Math.random() * 2.5, color, shrink: true });
    }
  }

  trail(x, y, color, size = 2.5) {
    this.spawn({ x, y, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14, life: 0.35, size, color, shrink: true });
  }

  confetti(x, y) {
    for (let i = 0; i < (this.mobile ? 30 : 60); i++) {
      const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 260;
      this.spawn({ x: x + (Math.random() - 0.5) * 200, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, life: 1 + Math.random(), size: 3 + Math.random() * 3, color: [0xff6b81, 0xffd93d, 0x4d96ff, 0x6bd968, 0xb980ff][i % 5], gravity: 500 });
    }
  }
}
