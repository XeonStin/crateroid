// ============ 补给箱：伞降 / 拾取 ============
import * as PIXI from 'pixi.js';
import { CRATE_TYPES, GRAVITY } from '../config.js';

export function pickCrateType(rng = Math.random) {
  const total = CRATE_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const t of CRATE_TYPES) { r -= t.weight; if (r <= 0) return t; }
  return CRATE_TYPES[0];
}

export class Crate {
  // kind: 'health' | 'weapon' | 'tool'; payload: 武器箱时的 weaponId
  constructor(game, x, kind, payload) {
    this.game = game;
    this.x = x;
    this.y = -30;
    this.vy = 0;
    this.kind = kind;
    this.payload = payload;
    this.type = CRATE_TYPES.find(t => t.id === kind);
    this.alive = true;
    this.parachute = true;
    this.t = 0;
    this.buildView();
  }

  buildView() {
    const c = new PIXI.Container();
    // 降落伞
    this.chute = new PIXI.Graphics();
    this.chute.moveTo(0, -12).lineTo(-14, -30).lineTo(14, -30).closePath().fill({ color: 0xffffff, alpha: 0.9 });
    this.chute.moveTo(-14, -30).quadraticCurveTo(0, -46, 14, -30).fill({ color: 0xff6b81 });
    c.addChild(this.chute);
    // 箱体
    const box = new PIXI.Graphics();
    box.roundRect(-11, -11, 22, 20, 3).fill(this.type.color);
    box.roundRect(-11, -11, 22, 20, 3).stroke({ width: 2, color: 0x00000022 });
    c.addChild(box);
    const icon = new PIXI.Text({
      text: this.type.icon,
      style: { fontSize: 12, align: 'center' },
    });
    icon.anchor.set(0.5);
    icon.position.set(0, -1);
    c.addChild(icon);
    this.view = c;
    this.game.layers.ents.addChild(c);
  }

  step(dt, terrain, windAccel) {
    if (!this.alive) return;
    this.t += dt;
    if (this.parachute) {
      // 伞降：缓慢下落 + 风漂移
      this.vy = Math.min(this.vy + GRAVITY * dt, 85);
      this.x += windAccel * 0.05 * dt; // 轻微风漂
      this.x += Math.sin(this.t * 2) * 8 * dt;
      this.y += this.vy * dt;
      this.chute.rotation = Math.sin(this.t * 2.4) * 0.12;
      if (terrain.isSolid(this.x, this.y)) {
        let guard = 0;
        while (terrain.isSolid(this.x, this.y) && guard++ < 40) this.y -= 1;
        this.parachute = false;
        this.chute.visible = false;
        this.game.sfx('crate');
      }
    } else {
      // 落地后随地形（若被挖掉则下落）
      if (!terrain.isSolid(this.x, this.y + 2) && !terrain.isSolid(this.x, this.y + 1)) {
        this.vy = Math.min(this.vy + GRAVITY * dt, 300);
        this.y += this.vy * dt;
        if (this.y > this.game.water.level) {
          this.game.splashAt(this.x, this.game.water.level);
          this.destroy();
          return;
        }
      } else {
        let guard = 0;
        while (terrain.isSolid(this.x, this.y) && guard++ < 40) this.y -= 1;
        this.vy = 0;
      }
      this.view.rotation = Math.sin(this.t * 2) * 0.06;
    }
    this.view.position.set(this.x, this.y);
  }

  // 虫虫触碰拾取，返回效果描述
  tryPickup(worm) {
    if (!this.alive || !worm.alive) return false;
    const dx = worm.x - this.x, dy = worm.bodyY - (this.y - 6);
    if (dx * dx + dy * dy > 26 * 26) return false;
    this.destroy();
    return true;
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.view.destroy();
  }
}
