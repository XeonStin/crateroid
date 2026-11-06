// ============ 虫虫实体：Q版形象 / 移动物理 / 生命 / 表情 ============
import * as PIXI from 'pixi.js';
import { WORM_R, WALK_SPEED, JUMP_VY, GRAVITY, STEP_UP, MAX_FALL_NO_DMG, FALL_DMG_K, AIR_CONTROL, DASH_SPEED, DASH_TIME, TEAM_INFO } from '../config.js';

const BODY_W = 24, BODY_H = 30;

export class Worm {
  constructor(cfg) {
    this.id = cfg.id;
    this.team = cfg.team;
    this.name = cfg.name;
    this.color = cfg.color;
    this.hat = cfg.hat;
    this.isAI = !!cfg.isAI;
    this.teamColor = TEAM_INFO[cfg.team]?.color || '#4d96ff';
    this.teamColorHex = new PIXI.Color(this.teamColor).toNumber();
    this.dashT = 0;
    this.dashDir = 1;
    this.berserk = false; // 背水一战：移速 +15%

    this.x = cfg.x; this.y = cfg.y;      // 脚底中心
    this.vx = 0; this.vy = 0;
    this.hp = cfg.hp ?? 100;
    this.alive = true;
    this.onGround = true;
    this.jumpsUsed = 0;
    this.facing = cfg.facing ?? (this.team === 0 ? 1 : -1);
    this.aimAngle = this.facing > 0 ? 35 : 145; // 度，0=右 90=上
    this.jetFuel = 0;                     // >0 = 本回合有喷气背包
    this.walkDir = 0;
    this.wantJump = false;
    this.wantJet = false;

    // 动画状态
    this.squashT = 0; this.stretchT = 0;
    this.blinkT = 1 + Math.random() * 3;
    this.walkPhase = 0;
    this.hurtFlash = 0;
    this.stunnedT = 0;
    this.dyingT = 0;
    this.bubbleText = null; this.bubbleT = 0;
    // 变换缓存（避免静止时每帧把 transform 标脏）
    this._vx = NaN; this._vy = NaN;
    this._lsx = 1; this._lsy = 1; this._lrot = 0; this._lpy = 0;

    this.view = new PIXI.Container();
    this.view.zIndex = 1000;
    this.buildView();
  }

  get bodyY() { return this.y - BODY_H * 0.55; } // 身体中心（用于爆炸距离）

  buildView() {
    const c = new PIXI.Container();
    // 队伍识别：脚下队伍色光环
    this.teamRing = new PIXI.Graphics();
    this.teamRing.ellipse(0, 1, 15, 5).fill({ color: this.teamColorHex, alpha: 0.28 });
    this.teamRing.ellipse(0, 1, 15, 5).stroke({ width: 1.5, color: this.teamColorHex, alpha: 0.8 });
    c.addChild(this.teamRing);
    this.bodyG = new PIXI.Container();
    c.addChild(this.bodyG);

    const col = new PIXI.Color(this.color);
    const [cr, cg, cb] = [col.red * 255, col.green * 255, col.blue * 255];
    const mix = (r, g, b) => (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
    const dark = mix(cr * 0.6, cg * 0.6, cb * 0.6);
    const light = mix(cr * 1.35 + 30, cg * 1.35 + 30, cb * 1.35 + 30);

    // 身体（豆形）
    const body = new PIXI.Graphics();
    body.ellipse(0, -BODY_H * 0.5, BODY_W / 2, BODY_H / 2).fill({ color: dark });
    body.ellipse(0, -BODY_H * 0.5 + 1, BODY_W / 2 - 1.5, BODY_H / 2 - 1.5).fill({ color: col.toNumber() });
    // 肚皮
    body.ellipse(0, -BODY_H * 0.34, 7, 8).fill({ color: light, alpha: 0.85 });
    this.bodyG.addChild(body);

    // 眼睛
    this.eyes = new PIXI.Graphics();
    this.bodyG.addChild(this.eyes);

    // 帽子
    const hat = new PIXI.Graphics();
    this.drawHat(hat);
    hat.position.set(0, -BODY_H + 2);
    this.bodyG.addChild(hat);

    // HP 条（加宽加高 + 队伍色边框 + 数字，常显）
    this.hpBar = new PIXI.Graphics();
    this.hpBar.position.set(0, -BODY_H - 16);
    c.addChild(this.hpBar);
    this.hpText = new PIXI.Text({
      text: '100',
      style: { fontFamily: 'sans-serif', fontSize: 9, fontWeight: 'bold', fill: 0xffffff, stroke: { color: 0x222233, width: 2 } },
    });
    this.hpText.anchor.set(0.5);
    this.hpText.position.set(0, -BODY_H - 12.5);
    c.addChild(this.hpText);

    // 名字（队伍色描边）
    this.nameText = new PIXI.Text({
      text: this.name,
      style: {
        fontFamily: 'sans-serif', fontSize: 11, fill: 0xffffff,
        stroke: { color: this.teamColor, width: 3.5 }, align: 'center',
      },
    });
    this.nameText.anchor.set(0.5, 1);
    this.nameText.position.set(0, -BODY_H - 19);
    c.addChild(this.nameText);

    // 当前回合指示箭头
    this.arrow = new PIXI.Graphics();
    this.arrow.moveTo(-7, 0).lineTo(7, 0).lineTo(0, 8).fill({ color: 0xffd23d });
    this.arrow.stroke({ width: 2, color: 0x222233 });
    this.arrow.position.set(0, -BODY_H - 40);
    this.arrow.visible = false;
    c.addChild(this.arrow);

    // 语音气泡
    this.bubble = new PIXI.Container();
    this.bubble.visible = false;
    this.bubbleBg = new PIXI.Graphics();
    this.bubbleText = new PIXI.Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 12, fill: 0x333344 } });
    this.bubbleText.anchor.set(0.5, 0.5);
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.position.set(0, -BODY_H - 42);
    c.addChild(this.bubble);

    // 受击眩晕星星
    this.starsG = new PIXI.Graphics();
    c.addChild(this.starsG);

    this.view.addChild(c);
    this.inner = c;
  }

  drawHat(g) {
    switch (this.hat) {
      case 'cap':
        g.circle(0, -4, 9).fill(0xd64550);
        g.rect(-2, -4, 14, 3.5).fill({ color: 0xb03240 });
        break;
      case 'bow':
        g.circle(0, -6, 3).fill(0xff7ba9);
        g.moveTo(0, -6).lineTo(-11, -11).lineTo(-10, -2).fill(0xff7ba9);
        g.moveTo(0, -6).lineTo(11, -11).lineTo(10, -2).fill(0xff7ba9);
        break;
      case 'tophat':
        g.rect(-11, -6, 22, 3).fill(0x333344);
        g.rect(-7, -20, 14, 15).fill(0x333344);
        g.rect(-7, -9, 14, 3).fill(0xff5566);
        break;
      case 'flower':
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          g.circle(Math.cos(a) * 4.5, -7 + Math.sin(a) * 4.5, 3).fill(0xffa8c8);
        }
        g.circle(0, -7, 3).fill(0xffd23d);
        break;
      case 'helmet':
        g.circle(0, -4, 9).fill(0x5a7d4f);
        g.circle(0, -4, 6.5).fill(0x6f9660);
        break;
      case 'bandana':
        g.rect(-9, -8, 18, 5).fill(0xe84f4f);
        g.moveTo(-9, -6).lineTo(-15, -3).lineTo(-10, -1).fill(0xe84f4f);
        break;
    }
  }

  // ---------- 物理 ----------
  step(dt, terrain, game) {
    if (!this.alive) return;
    const waterY = game.water.level;

    // 落水
    if (this.y > waterY + 2) { game.drownWorm(this); return; }

    // 喷气背包
    if (this.wantJet && this.jetFuel > 0) {
      this.vy -= GRAVITY * 1.6 * dt;
      this.jetFuel -= dt * 34;
      if ((game.time * 8 | 0) % 2 === 0) {
        game.particles.spawn({ x: this.x, y: this.y - 4, vx: (Math.random() - 0.5) * 30, vy: 80, life: 0.3, size: 4, color: 0xffb545, shrink: true });
        if (Math.random() < 0.3) game.sfx('jet');
      }
    }

    // 冲刺（双击方向触发，每回合一次）
    if (this.dashT > 0) {
      this.dashT -= dt;
      const nx = this.x + this.dashDir * DASH_SPEED * dt;
      if (nx > 10 && nx < terrain.W - 10) {
        let gy = null;
        for (let y = Math.round(this.y - 16); y <= Math.round(this.y + 16); y++) {
          if (y >= 0 && !terrain.isSolid(nx, y - 1) && terrain.isSolid(nx, y)) { gy = y; break; }
        }
        if (gy !== null) { this.x = nx; this.y = gy; this.onGround = true; }
        else if (!terrain.isSolid(nx, this.y - 3)) { this.x = nx; this.onGround = false; this.vy = 0; }
        else { this.dashT = 0; } // 撞墙
        this.facing = this.dashDir;
        if (game && Math.random() < 0.45) {
          game.particles.spawn({ x: this.x, y: this.y - 2, vx: -this.dashDir * 60, vy: -20, life: 0.3, size: 3, color: 0xdddddd, gravity: 200 });
        }
      } else this.dashT = 0;
    } else if (this.onGround && this.walkDir !== 0) {
      // 行走（背水一战加速）
      const speed = WALK_SPEED * (this.berserk ? 1.15 : 1);
      const nx = this.x + this.walkDir * speed * dt;
      if (nx > 10 && nx < terrain.W - 10) {
        const gy = this.findStandY(terrain, nx, this.y);
        if (gy !== null) {
          this.x = nx; this.y = gy;
          this.facing = this.walkDir;
          this.walkPhase += dt * 11;
        } else if (!terrain.isSolid(nx, this.y - 3) && !terrain.isSolid(nx, this.y - BODY_H + 2)) {
          // 台阶/悬崖边缘：允许继续走出，进入下落状态
          this.x = nx;
          this.onGround = false;
          this.vy = 0;
          this.facing = this.walkDir;
          this.walkPhase += dt * 8;
        }
      }
    }

    // 空中左右控制（斜向跳跃）
    if (!this.onGround && this.dashT <= 0 && this.walkDir !== 0) {
      const ac = AIR_CONTROL * (this.berserk ? 1.15 : 1);
      const nx = this.x + this.walkDir * ac * dt;
      if (nx > 10 && nx < terrain.W - 10
        && !terrain.isSolid(nx, this.y - 3)
        && !terrain.isSolid(nx, this.y - BODY_H + 2)) {
        this.x = nx;
        this.facing = this.walkDir;
      }
    }

    // 跳跃（jump 边沿触发在 game 里设置 wantJump）
    if (this.wantJump) {
      this.wantJump = false;
      if (this.onGround) {
        this.vy = JUMP_VY; this.onGround = false; this.jumpsUsed = 1;
        this.stretchT = 0.2;
        game.sfx('jump');
      } else if (this.jumpsUsed < 2) {
        this.vy = JUMP_VY * 0.92; this.jumpsUsed = 2;
        this.stretchT = 0.2;
        game.sfx('boing');
      }
    }

    // 空中积分
    if (!this.onGround) {
      const wasVy = this.vy;
      this.vy += GRAVITY * dt * (this.wantJet && this.jetFuel > 0 ? 0.25 : 1);
      // 水平击退漂移
      this.x += this.vx * dt;
      this.vx *= Math.pow(0.35, dt);
      if (this.x < 10) { this.x = 10; this.vx = 0; }
      if (this.x > terrain.W - 10) { this.x = terrain.W - 10; this.vx = 0; }
      this.y += this.vy * dt;

      // 头顶碰撞
      if (this.vy < 0 && terrain.isSolid(this.x, this.y - BODY_H - 2)) {
        this.vy = 0;
      }
      // 落地
      if (this.vy > 0 && terrain.isSolid(this.x, this.y)) {
        const gy = this.findStandY(terrain, this.x, this.y - 2);
        this.y = gy ?? this.y;
        this.onGround = true; this.vy = 0; this.vx = 0; this.jumpsUsed = 0;
        this.squashT = 0.25;
        if (wasVy > MAX_FALL_NO_DMG) {
          const dmg = Math.round((wasVy - MAX_FALL_NO_DMG) * FALL_DMG_K);
          if (dmg > 0) game.applyFallDamage(this, dmg);
        }
        game.sfx('bounce');
      }
    } else {
      // 地面检查：脚下是否还有地（挖掉/击退后）
      if (!terrain.isSolid(this.x, this.y + 1)) {
        const gy = this.findStandY(terrain, this.x, this.y);
        if (gy === null || gy > this.y + STEP_UP + 2) {
          this.onGround = false; this.vy = 0;
        } else if (gy !== null) {
          this.y = gy; // 地面略微变化（挖坑边缘）
        }
      }
    }

    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  }

  // 在 (x, refY) 附近找可站立 y：上方无遮挡且脚下 1px 实心
  findStandY(terrain, x, refY) {
    for (let y = Math.round(refY - STEP_UP); y <= Math.round(refY + STEP_UP); y++) {
      if (y < 0) continue;
      if (!terrain.isSolid(x, y - 1) && terrain.isSolid(x, y)) return y;
    }
    return null;
  }

  applyKnockback(ix, iy) {
    this.vx += ix; this.vy += iy;
    this.onGround = false;
  }

  // ---------- 表现 ----------
  say(text, dur = 2.2) {
    this.bubbleText.text = text;
    this.bubbleT = dur;
    this.bubble.visible = true;
    this._layoutBubble();
  }

  _layoutBubble() {
    const w = Math.max(30, this.bubbleText.width + 14), h = 20;
    this.bubbleBg.clear();
    this.bubbleBg.roundRect(-w / 2, -h, w, h, 7).fill({ color: 0xffffff, alpha: 0.94 });
    this.bubbleBg.moveTo(-5, 0).lineTo(0, 6).lineTo(5, 0).fill({ color: 0xffffff, alpha: 0.94 });
    this.bubbleText.position.set(0, -h / 2);
  }

  showArrow(v) { this.arrow.visible = v; }

  updateView(time) {
    if (this.x !== this._vx || this.y !== this._vy) {
      this.view.position.set(this.x, this.y);
      this._vx = this.x; this._vy = this.y;
    }
    if (!this.alive) { this.updateTomb(time); return; }

    // 挤压拉伸（仅变化时写 transform）
    let sx = 1, sy = 1;
    if (this.squashT > 0) { this.squashT -= 1 / 60; const t = this.squashT / 0.25; sx = 1 + 0.25 * t; sy = 1 - 0.28 * t; }
    else if (this.stretchT > 0) { this.stretchT -= 1 / 60; const t = this.stretchT / 0.2; sx = 1 - 0.18 * t; sy = 1 + 0.22 * t; }
    if (sx !== this._lsx || sy !== this._lsy) {
      this.inner.scale.set(sx, sy);
      this._lsx = sx; this._lsy = sy;
    }

    // 行走摆动
    let rot = 0, ipy = 0;
    if (this.walkDir !== 0 && this.onGround) {
      rot = Math.sin(this.walkPhase) * 0.09;
      ipy = -Math.abs(Math.sin(this.walkPhase)) * 2;
    }
    if (rot !== this._lrot) { this.inner.rotation = rot; this._lrot = rot; }
    if (ipy !== this._lpy) { this.inner.position.y = ipy; this._lpy = ipy; }

    // 受击眩晕星星
    if (this.stunnedT > 0) {
      this.stunnedT -= 1 / 60;
      const g = this.starsG;
      g.clear();
      if (this.stunnedT > 0) {
        for (let i = 0; i < 3; i++) {
          const a = time * 7 + i * 2.09;
          g.circle(Math.cos(a) * 11, -BODY_H - 4 + Math.sin(a) * 3, 2).fill(0xffd93d);
        }
      }
    }

    // 眨眼 + 瞳孔看向瞄准方向（增量缓存：仅状态变化时重绘）
    this.blinkT -= 1 / 60;
    const blinking = this.blinkT <= 0;
    if (this.blinkT < -0.12) this.blinkT = 1.5 + Math.random() * 3.5;
    const ea = this.aimAngle * Math.PI / 180;
    const px = Math.round(Math.cos(ea) * 1.6), py = Math.round(-Math.sin(ea) * 1.2);
    const eyeKey = blinking ? 'b' : `${px}|${py}|${this.facing}`;
    if (eyeKey !== this._eyeKey) {
      this._eyeKey = eyeKey;
      this.eyes.clear();
      for (const side of [-1, 1]) {
        const ex = side * 5 + (this.facing > 0 ? 1.5 : -1.5), ey = -BODY_H * 0.68;
        if (blinking) {
          this.eyes.moveTo(ex - 3, ey).lineTo(ex + 3, ey).stroke({ width: 1.6, color: 0x222233, cap: 'round' });
        } else {
          this.eyes.circle(ex, ey, 3.4).fill(0xffffff);
          this.eyes.circle(ex + px, ey + py, 1.7).fill(0x222233);
        }
      }
      // 敌方虫虫：怒眉（一眼区分敌我）
      if (this.team === 1) {
        for (const side of [-1, 1]) {
          const ex = side * 5 + (this.facing > 0 ? 1.5 : -1.5), ey = -BODY_H * 0.68;
          this.eyes.moveTo(ex - 3.6, ey - 5.6).lineTo(ex + 3.6, ey - 3.4)
            .stroke({ width: 1.9, color: 0x222233, cap: 'round' });
        }
      }
    }

    // HP 条（增量缓存）：加宽 34×7 + 队伍色边框 + 数字
    const hpKey = `${Math.round(this.hp)}`;
    if (hpKey !== this._hpKey) {
      this._hpKey = hpKey;
      const pct = Math.max(0, this.hp) / 100;
      this.hpBar.clear();
      this.hpBar.roundRect(-17, 0, 34, 7, 3.5).fill({ color: 0x181826, alpha: 0.9 });
      this.hpBar.roundRect(-17, 0, 34, 7, 3.5).stroke({ width: 1.6, color: this.teamColorHex, alpha: 0.95 });
      const c = pct > 0.6 ? 0x6bd968 : pct > 0.3 ? 0xffd23d : 0xff5a5a;
      if (pct > 0) {
        this.hpBar.roundRect(-15.5, 1.5, 31 * pct, 4, 2).fill({ color: c });
        this.hpBar.roundRect(-15.5, 1.5, 31 * pct, 1.7, 1).fill({ color: 0xffffff, alpha: 0.35 });
      }
      this.hpText.text = String(Math.max(0, Math.round(this.hp)));
      this.hpText.visible = this.hp > 0;
    }

    // 气泡
    if (this.bubbleT > 0) {
      this.bubbleT -= 1 / 60;
      this.bubble.visible = this.bubbleT > 0;
      this.bubble.alpha = Math.min(1, this.bubbleT * 3);
    }

    // 受伤闪白
    this.bodyG.tint = this.hurtFlash > 0 ? 0xff8888 : 0xffffff;

    // 指示箭头浮动
    if (this.arrow.visible) this.arrow.y = -BODY_H - 40 + Math.sin(time * 5) * 3;
  }

  updateTomb(time) {
    // 死亡时 view 被替换为墓碑（见 die()），这里只做浮动动画
    if (this.tomb) this.tomb.y = Math.sin(time * 1.2) * 1;
  }

  die(game, epitaph) {
    this.alive = false;
    this.walkDir = 0;
    this.bubble.visible = false;
    this.arrow.visible = false;
    this.view.removeChildren();
    // 墓碑
    const t = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.roundRect(-9, -20, 18, 21, 4).fill(0x9aa3ad);
    g.roundRect(-7, -18, 14, 17, 3).fill(0xb8c0c8);
    g.moveTo(-5, -6).lineTo(5, -6).moveTo(0, -11).lineTo(0, -1).stroke({ width: 2.2, color: 0x7a838d, cap: 'round' });
    g.roundRect(-12, 0, 24, 4, 2).fill(0x9aa3ad);
    const word = new PIXI.Text({
      text: epitaph || '安息',
      style: { fontFamily: 'sans-serif', fontSize: 8, fill: 0x55606a },
    });
    word.anchor.set(0.5, 0);
    word.position.set(0, 4);
    t.addChild(g, word);
    this.tomb = t;
    this.view.addChild(t);
  }
}
