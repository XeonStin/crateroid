// ============ 投射物：积分/碰撞/引信/特殊弹（真实对战与 AI 模拟共用） ============
import * as PIXI from 'pixi.js';
import { GRAVITY, SUBSTEPS, WORM_R, WEAPON_BY_ID } from '../config.js';

// 纯函数：圆形爆炸对虫虫列表的伤害与击退（真实/模拟共用）
export function explosionEffects(worms, x, y, r, dmg) {
  const out = [];
  for (const w of worms) {
    if (!w.alive) continue;
    const by = w.bodyY !== undefined ? w.bodyY : w.y - 16;
    const dx = w.x - x, dy = by - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const rr = r + WORM_R;
    if (d > rr) continue;
    const t = 1 - d / rr;
    const damage = dmg * t;
    const kb = 340 * Math.pow(t, 0.8);
    const nd = Math.max(d, 1);
    // 击退方向带向上偏置
    const kx = (dx / nd) * kb;
    const ky = (dy / nd) * kb - kb * 0.42;
    out.push({ worm: w, dmg: damage, kx, ky });
  }
  return out;
}

// 采集 ghost 残影的主力武器（bomblet/bomb/cow 不采：一次开火几十个子弹会互相覆盖）
const GHOST_WEAPONS = { bazooka: 1, grenade: 1, cluster: 1, holy: 1, driller: 1 };

export class Projectile {
  // weaponId, owner, x, y, vx, vy, onExplode(x,y), game
  constructor(o) {
    this.weapon = WEAPON_BY_ID[o.weaponId];
    this.owner = o.owner;
    this.x = o.x; this.y = o.y;
    this.vx = o.vx; this.vy = o.vy;
    this.time = 0;
    this.fuse = this.weapon.fuse ?? Infinity;
    this.bounces = this.weapon.bounce ? 99 : 0;
    this.alive = true;
    this.onExplode = o.onExplode;
    this.game = o.game || null;
    this.settled = false;          // 手雷类停稳
    this.mode = 'fly';             // fly | drill | cow
    this.drillDepth = 0;
    this.cowBounces = this.weapon.bounces || 0;
    this.lastX = this.x; this.lastY = this.y;
    // 形状必须在构造器里定全：directHit/ghostPts 若飞行中动态添加，
    // 会让热子步循环的隐藏类迁移、整体退化为多态（实测 AI 单次模拟慢 3~5 倍）
    this.directHit = false;        // 直接命中虫体（explode 侧必暴击）
    this.ghostPts = [];            // ghost 弹道采样点（真实对战用）
    this._ghostTick = 0;
    // 以下字段同样可能被外部后置赋值/首步写入，构造器定全保持单一隐藏类：
    this.simWorms = null;          // AI 模拟虫列表（planner 注入；step 回退读它）
    this.onCowBounce = null;       // 奶牛踩踏回调（planner 注入）
    this._lastFuse = -1;           // 引信音效节流（step 首次写入）
    this._lastDrillSfx = -1;       // 钻地音效节流
    // AI 模拟（game=null）不创建视图，省掉每次寻优数百次 Graphics 构造
    if (this.game) this.buildView();
    else this.view = null;
  }

  buildView() {
    const g = new PIXI.Container();
    const id = this.weapon.id;
    if (id === 'bazooka') {
      const b = new PIXI.Graphics();
      b.ellipse(0, 0, 9, 4.5).fill(0xd64550);
      b.ellipse(3, 0, 4, 3).fill(0xf2f2f2);
      g.addChild(b);
    } else if (id === 'grenade' || id === 'cluster' || id === 'holy') {
      const c = new PIXI.Graphics();
      const color = id === 'holy' ? 0xf5f5f5 : id === 'cluster' ? 0x885544 : 0x445566;
      c.circle(0, 0, id === 'holy' ? 8 : 6).fill(color);
      c.rect(-1.5, -9, 3, 4).fill(0x998877);
      if (id === 'holy') { c.circle(0, 0, 4.5).fill(0xffd23d); }
      g.addChild(c);
    } else if (id === 'driller') {
      const d = new PIXI.Graphics();
      d.moveTo(-6, -6).lineTo(6, -6).lineTo(0, 8).fill(0x8899aa);
      d.rect(-6, -9, 12, 4).fill(0xd64550);
      g.addChild(d);
    } else if (id === 'bomb') { // 空袭炸弹
      const b = new PIXI.Graphics();
      b.ellipse(0, 0, 5, 3.5).fill(0x55606a);
      g.addChild(b);
    } else if (id === 'cow') {
      const c = new PIXI.Graphics();
      c.ellipse(0, 0, 16, 10).fill(0xffffff);
      c.circle(-7, -4, 4).fill(0x333344);
      c.circle(6, 2, 5).fill(0x333344);
      c.circle(10, -3, 3).fill(0x333344);
      c.circle(-13, 0, 2.5).fill(0x333344);
      c.circle(-9, 7, 3).fill(0x333344);
      // 头
      c.ellipse(-15, -6, 5, 4).fill(0xffffff);
      c.circle(-17, -7, 1.2).fill(0x222233);
      c.circle(-13, -7, 1.2).fill(0x222233);
      g.addChild(c);
      this.cowT = 0;
    } else { // bomblet
      const b = new PIXI.Graphics();
      b.circle(0, 0, 4).fill(0x885544);
      g.addChild(b);
    }
    this.view = g;
    // 手机小屏上投射物偏小，适度放大
    if (this.game?.mobile) g.scale.set(1.4);
    if (this.game) this.game.layers.ents.addChild(g);
  }

  // 单帧推进（外部按固定步长调用）
  step(dt, terrain, windAccel, waterY) {
    if (!this.alive) return;
    this.time += dt;
    const w = this.weapon;

    // 引信
    if (this.fuse !== Infinity) {
      if (this.game && this.time - (this._lastFuse || -1) > 0.2) {
        this._lastFuse = this.time;
        this.game.sfx('fuse');
      }
      if (this.time >= this.fuse) {
        this.explode(terrain, waterY);
        return;
      }
    }

    if (this.mode === 'drill') { this.stepDrill(dt, terrain, waterY); return; }

    const sub = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS && this.alive; i++) {
      this.lastX = this.x; this.lastY = this.y;
      // 空气阻力轻微
      this.vx += windAccel * (w.wind ?? 0) * sub;
      this.vy += GRAVITY * (w.gravity ?? 1) * sub;
      this.x += this.vx * sub;
      this.y += this.vy * sub;

      // 出界
      if (this.x < -50 || this.x > terrain.W + 50 || this.y > waterY) {
        if (this.y > waterY && this.game) this.game.splashAt(this.x, waterY);
        this.alive = false;
        if (this.game) this.game.projectileGone(this);
        return;
      }

      // 直接命中虫虫：非弹跳类立即爆炸；手雷/神圣手雷从虫虫身上弹开
      if (w.id !== 'cow') {
        const worms = this.game ? this.game.worms : (this.simWorms || []);
        for (const worm of worms) {
          if (!worm.alive) continue;
          // 0.3s 发射者豁免：按 id 比较（AI 模拟里虫虫是 SimWorm 副本，=== 永不成立）
          if (this.owner && worm.id === this.owner.id && this.time < 0.3) continue;
          const dx = worm.x - this.x, dy = worm.bodyY - this.y;
          if (dx * dx + dy * dy < (WORM_R + 5) ** 2) {
            if (w.bounce) {
              this.bounceOffWorm(worm);
              break;
            }
            this.directHit = true; // 直接命中虫体 → explode 侧必暴击
            this.explode(terrain, waterY);
            return;
          }
        }
      }

      // 地形碰撞
      if (terrain.isSolid(this.x, this.y)) {
        if (w.id === 'cow') { this.stepCowBounce(terrain, waterY); continue; }
        if (w.bounce) { this.bounceOff(terrain); continue; }
        if (w.drill) {
          // 进入钻地模式
          this.mode = 'drill';
          this.drillDepth = 0;
          this.vx = 0; this.vy = 0;
          if (this.game) this.game.sfx('drill');
          break;
        }
        this.explode(terrain, waterY);
        return;
      }
    }

    // 已在子步里爆炸（例如奶牛最后一次弹跳）：不再更新拖尾/视图
    if (!this.alive) return;

    // 拖尾 + ghost 采样
    if (this.game) {
      const tid = this.weapon.id;
      if (tid === 'bazooka') {
        this.game.particles.trail(this.x, this.y, 0xdddddd, 2);
        // 大颗尾烟 linger ~1s：弹道飞到哪一目了然
        if (Math.random() < 0.35) {
          this.game.particles.spawn({ x: this.x, y: this.y, vx: (Math.random() - 0.5) * 10, vy: -14 - Math.random() * 12, life: 0.9 + Math.random() * 0.5, size: 5 + Math.random() * 4, color: 0x999999, shrink: true });
        }
      } else if (tid === 'holy') {
        this.game.particles.trail(this.x, this.y, 0xffe9a8, 2);
      }
      // ghost 弹道采样：每 2 固定步记 1 点（≤80），爆炸时存为「上一发残影」
      if (GHOST_WEAPONS[tid]) {
        this._ghostTick++;
        if (this._ghostTick % 2 === 0 && this.ghostPts.length < 80) {
          this.ghostPts.push({ x: this.x, y: this.y });
        }
      }
      if (tid === 'cow' && this.view) { this.cowT += dt; this.view.rotation = Math.sin(this.cowT * 10) * 0.3; }
    }
    if (this.view) {
      this.view.position.set(this.x, this.y);
      this.view.rotation = this.weapon.id === 'cow' ? this.view.rotation : Math.atan2(this.vy, this.vx);
    }
  }

  // 弹跳类投射物撞到虫虫：沿法线弹出并反射速度（不立即爆炸）
  bounceOffWorm(worm) {
    let dx = this.x - worm.x, dy = this.y - worm.bodyY;
    let d = Math.hypot(dx, dy);
    if (d < 0.001) { dx = 0; dy = -1; d = 1; }
    const nx = dx / d, ny = dy / d;
    const out = WORM_R + 7;
    this.x = worm.x + nx * out;
    this.y = worm.bodyY + ny * out;
    const dot = this.vx * nx + this.vy * ny;
    if (dot < 0) {
      const e = 0.62;
      this.vx -= (1 + e) * dot * nx;
      this.vy -= (1 + e) * dot * ny;
    }
    this.vx *= 0.92;
    this.vy *= 0.92;
    if (this.game) this.game.sfx('bounce');
  }

  bounceOff(terrain) {    // 用局部实心采样估算表面法线（比按运动方向近似准确）
    const R = 6;
    const s = (x, y) => (terrain.isSolid(x, y) ? 1 : 0);
    const gx = s(this.x + R, this.y) - s(this.x - R, this.y);
    const gy = s(this.x, this.y + R) - s(this.x, this.y - R);
    let nx = -gx, ny = -gy; // 指向空气侧（表面法线）
    let nl = Math.hypot(nx, ny);
    if (nl < 0.001) {
      // 兜底：按上一步运动反方向
      let dx = this.x - this.lastX, dy = this.y - this.lastY;
      const d = Math.hypot(dx, dy) || 1;
      nx = -dx / d; ny = -dy / d; nl = 1;
    } else { nx /= nl; ny /= nl; }
    // 沿法线推出固体
    let guard = 0;
    while (terrain.isSolid(this.x, this.y) && guard++ < 40) {
      this.x += nx; this.y += ny;
    }
    // 反射：v' = v - (1+e)(v·n)n
    const e = 0.45;
    const dot = this.vx * nx + this.vy * ny;
    if (dot < 0) {
      this.vx -= (1 + e) * dot * nx;
      this.vy -= (1 + e) * dot * ny;
    }
    // 切向摩擦
    this.vx *= 0.86; this.vy *= 0.9;
    const sp = Math.hypot(this.vx, this.vy);
    if (this.game) this.game.sfx('bounce');
    if (sp < 58) { this.vx = 0; this.vy = 0; this.settled = true; }
  }

  stepCowBounce(terrain, waterY) {
    // 推出地面，向前弹跳并造成接触伤害
    let guard = 0;
    while (terrain.isSolid(this.x, this.y) && guard++ < 40) this.y -= 1;
    this.cowBounces--;
    if (this.game) {
      this.game.sfx('moo');
      this.game.cowStomp(this);
    } else if (this.onCowBounce) this.onCowBounce(this);
    if (this.cowBounces <= 0) {
      this.explode(terrain, waterY);
      return;
    }
    // 几乎垂直上跳：奶牛落在目标点附近，连续 5 次踩踏都覆盖同一片区域。
    // 横向速度压到 15% 以内，不再向右/左弹开。
    this.vx = Math.max(-36, Math.min(36, this.vx * 0.15));
    this.vy = -320;
  }

  stepDrill(dt, terrain, waterY) {
    const speed = 130;
    const dy = speed * dt;
    this.drillDepth += dy;
    const target = this.weapon.drill;
    terrain.drillColumn(this.x | 0, this.y, dy + 1, 9);
    this.y += dy;
    if (this.view) this.view.position.set(this.x, this.y);
    if (this.game) {
      this.game.particles.trail(this.x, this.y, 0x998877, 3);
      if (this.time - (this._lastDrillSfx || -1) > 0.25) {
        this._lastDrillSfx = this.time;
        this.game.sfx('drill');
      }
    }
    if (this.drillDepth >= target) {
      this.explode(terrain, waterY);
    }
  }

  explode(terrain, waterY) {
    if (!this.alive) return;
    this.alive = false;
    // 存为「上一发弹道残影」（下一回合瞄准时以淡蓝小点重放）
    if (this.game && this.ghostPts && this.ghostPts.length > 4) {
      this.game.lastShotTrail = { pts: this.ghostPts, team: this.owner?.team ?? -1 };
      this.game.lastShotV++;
    }
    if (this.view) {
      this.view.destroy({ children: true });
      this.view = null;
    }
    this.onExplode?.(this.x, this.y, this);
  }
}

// ---------------- 空袭运输机（卡通造型，朝右设计、按方向镜像） ----------------
export class Plane {
  constructor(game, targetX, dir, owner = null) {
    this.game = game;
    this.dir = dir > 0 ? 1 : -1;
    this.owner = owner;
    this.x = this.dir > 0 ? -120 : game.terrain.W + 120;
    this.y = 130 + Math.random() * 60;
    this.vx = this.dir * 340;
    this.dropX = targetX;
    this.dropped = 0;
    this.alive = true;
    this.t = 0;

    const g = new PIXI.Container();
    const b = new PIXI.Graphics();
    // 主翼（压在机身下）
    b.ellipse(-6, 7, 21, 6).fill(0xd3dce6);
    b.ellipse(-6, 7, 21, 6).stroke({ width: 1.5, color: 0xaeb9c6 });
    // 尾翼
    b.moveTo(-26, -6).lineTo(-38, 10).lineTo(-20, 7).fill(0xe0e7ef);
    b.moveTo(-26, -6).lineTo(-38, 10).lineTo(-20, 7).stroke({ width: 1.5, color: 0xaeb9c6 });
    // 垂直尾翼
    b.moveTo(-25, -7).lineTo(-35, -26).lineTo(-16, -8).fill(0xe8eef5);
    b.moveTo(-25, -7).lineTo(-35, -26).lineTo(-16, -8).stroke({ width: 2, color: 0xaeb9c6 });
    // 圆润机身
    b.roundRect(-28, -9, 56, 18, 9).fill(0xf4f7fa);
    b.roundRect(-28, -9, 56, 18, 9).stroke({ width: 2, color: 0xaeb9c6 });
    // 橙色机头锥
    b.moveTo(26, -8).lineTo(43, 0).lineTo(26, 8).fill(0xff8c42);
    b.moveTo(26, -8).lineTo(43, 0).lineTo(26, 8).stroke({ width: 2, color: 0xd96a26 });
    // 驾驶舱
    b.ellipse(1, -11, 10, 7).fill(0x9fd4ff);
    b.ellipse(1, -11, 10, 7).stroke({ width: 2, color: 0x6d92ad });
    // 舷窗
    for (let i = 0; i < 4; i++) b.circle(-24 + i * 9, -2, 2.4).fill(0xffd93d);
    g.addChild(b);

    // 螺旋桨
    this.prop = new PIXI.Graphics();
    this.prop.circle(0, 0, 2.6).fill(0x55606a);
    this.prop.ellipse(0, 0, 2, 11).fill({ color: 0x55606a, alpha: 0.85 });
    this.prop.position.set(44, 0);
    g.addChild(this.prop);

    g.scale.set(this.dir, 1);
    this.view = g;
    game.layers.ents.addChild(g);
    game.sfx('plane');
  }

  step(dt) {
    if (!this.alive) return;
    this.t += dt;
    this.x += this.vx * dt;
    this.prop.rotation += dt * 40;
    this.view.scale.set(this.dir, 1);
    this.view.position.set(this.x, this.y + Math.sin(this.t * 3) * 2.5);
    // 尾气
    if (this.game && Math.random() < 0.3) {
      this.game.particles.spawn({
        x: this.x - this.dir * 30, y: this.view.y + 3,
        vx: -this.dir * 40 + (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 15,
        life: 0.5, size: 3.5, color: 0xdddddd, shrink: true,
      });
    }
    // 投弹窗口
    const dropStart = this.dropX - 60, dropEnd = this.dropX + 60;
    const n = 5;
    if (this.x > dropStart && this.x < dropEnd && this.dropped < n) {
      if (Math.abs(this.x - (dropStart + (dropEnd - dropStart) * (this.dropped / (n - 1)))) < 12) {
        this.dropped++;
        this.game.spawnAirstrikeBomb(this.x, this.y + 8, this.dir, this.owner);
      }
    }
    if (this.x < -200 || this.x > this.game.terrain.W + 200) {
      this.alive = false;
      this.view.destroy({ children: true });
    }
  }
}
