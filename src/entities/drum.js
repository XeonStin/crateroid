// ============ 油桶：场景危害物，被爆炸/散弹波及后延迟连锁引爆 ============
import * as PIXI from 'pixi.js';
import { GRAVITY } from '../config.js';

export class OilDrum {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;              // 脚底（站在地表上）
    this.vy = 0;
    this.alive = true;
    this.fuse = -1;          // >=0 = 已点燃，倒计时中
    this.attacker = null;    // 引爆归因（击杀/连杀播报用）
    this.t = Math.random() * 6;
    this.buildView();
  }

  buildView() {
    const g = new PIXI.Graphics();
    // 桶体
    g.roundRect(-9, -22, 18, 22, 3).fill(0x8c2f2f);
    g.roundRect(-9, -22, 18, 22, 3).stroke({ width: 1.5, color: 0x5a1d1d });
    // 箍带
    g.rect(-9, -17, 18, 3).fill(0x6a2424);
    g.rect(-9, -8, 18, 3).fill(0x6a2424);
    // 高光
    g.rect(-6, -21, 2.5, 18).fill({ color: 0xb04848, alpha: 0.7 });
    // 危险条纹
    g.moveTo(-7, -3).lineTo(-3, -6.5).moveTo(-1, -3).lineTo(3, -6.5).moveTo(5, -3).lineTo(9, -6.5)
      .stroke({ width: 2, color: 0xffd23d });
    this.view = g;
    this.game.layers.ents.addChild(g);
  }

  ignite(delay, attacker) {
    if (this.fuse >= 0) return;
    this.fuse = Math.max(0.05, delay);
    this.attacker = attacker || null;
    this.game.sfx('fuse');
  }

  step(dt, terrain) {
    if (!this.alive) return;
    this.t += dt;
    // 点燃倒计时：闪烁提示
    if (this.fuse >= 0) {
      this.fuse -= dt;
      this.view.alpha = Math.sin(this.t * 26) > 0 ? 1 : 0.45;
      if (this.fuse <= 0) {
        this.game.drumExplode(this);
        return;
      }
    }
    // 脚下地面被挖掉 → 下落；落水销毁（复用 crate 的落地模式）
    if (!terrain.isSolid(this.x, this.y + 2) && !terrain.isSolid(this.x, this.y + 1)) {
      this.vy = Math.min(this.vy + GRAVITY * dt, 300);
      this.y += this.vy * dt;
      this.view.rotation = Math.sin(this.t * 9) * 0.18;
      if (this.y > this.game.water.level) {
        this.game.splashAt(this.x, this.game.water.level);
        this.destroy();
        return;
      }
    } else {
      let guard = 0;
      while (terrain.isSolid(this.x, this.y) && guard++ < 40) this.y -= 1;
      this.vy = 0;
      if (this.fuse < 0) this.view.rotation = Math.sin(this.t * 1.6) * 0.03;
    }
    this.view.position.set(this.x, this.y);
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.view.destroy({ children: true });
  }
}
