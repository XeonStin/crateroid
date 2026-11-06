// ============ AI 大脑：难度人格 / 分帧搜索 / 瞄准演出 ============
import { makeSim, searchCandidates, simulateShot, scoreShot, pickTargetWorm } from './planner.js';
import { WEAPON_BY_ID, DIFFICULTY, TAUNTS } from '../config.js';

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class AIBrain {
  constructor(game, worm) {
    this.game = game;
    this.worm = worm;
    this.diff = DIFFICULTY[game.matchConfig.difficulty] || DIFFICULTY.normal;
    this.phase = 'think';
    this.timer = 0.9 + Math.random() * 0.8;
    this.best = null;
    this.searchIter = null;
    this.simsDone = 0;
    this.walkTarget = null;
    this.aimFrom = 0; this.aimTo = 0; this.aimT = 0;
    this.chargeT = 0; this.chargeDur = 0.55;
    this.retreatDir = 0; this.retreatT = 0;
    this.sim = null;
    this.finished = false;
  }

  // 每帧驱动，返回 true 表示回合动作已完成（已发射/放弃）
  update(dt) {
    if (this.finished) return true;
    switch (this.phase) {
      case 'think': return this.upThink(dt);
      case 'move': return this.upMove(dt);
      case 'search': return this.upSearch(dt);
      case 'special': return this.upSpecial(dt);
      case 'aim': return this.upAim(dt);
      case 'charge': return this.upCharge(dt);
      case 'retreat': return this.upRetreat(dt);
    }
    return false;
  }

  upThink(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.sim = makeSim(this.game);
      // 简单档不模拟风（打法飘忽是难度的一部分）
      if (!this.diff.simulateWind) this.sim.windAccel = 0;
      // 决定候选武器（弹药为 0 的武器不参与寻优——教学关的哑靶虫因此会直接跳过回合）
      const ammo = this.game.ammoPool[this.worm.team];
      const ids = [];
      if (ammo.bazooka > 0) ids.push('bazooka');
      if (ammo.grenade > 0) ids.push('grenade');
      if (ammo.cluster > 0) ids.push('cluster');
      if (ammo.shotgun > 0) ids.push('shotgun');
      if (ammo.driller > 0) ids.push('driller');
      if (ammo.holy > 0) ids.push('holy');
      if (this.diff.smartWeapon) {
        if (ammo.airstrike > 0) ids.push('airstrike');
        if (ammo.cow > 0) ids.push('cow');
      }
      this.weaponIds = ids;

      // 走位（困难）：先评估移动
      if (this.diff.moveIQ > 0) {
        const spot = this.probeMoveSpot();
        if (spot !== null && Math.abs(spot - this.worm.x) > 18) {
          this.walkTarget = spot;
          this.phase = 'move';
          this.worm.say('换个位置…', 1.4);
          return false;
        }
      }
      // 特殊目标武器（空袭/奶牛）：困难必考虑，普通三成概率
      const special = this.weaponIds.find(id => WEAPON_BY_ID[id].targeting);
      const specialAllowed = this.diff.smartWeapon || (this.diff.refine > 0 && Math.random() < 0.35);
      if (special && specialAllowed && Math.random() < 0.75) {
        this.specialWeapon = special;
        this.phase = 'special';
        this.timer = 0.5;
        return false;
      }
      this.startSearch();
    }
    return false;
  }

  // 困难走位探测：少量快速模拟比较立足点（dx=0 的现站位分由 quickScoreHere 覆盖，不重复算）
  probeMoveSpot() {
    const sim = this.sim;
    const me = this.worm;
    let bestX = null, bestScore = -Infinity;
    for (const dx of [-45, 45, -90, 90]) {
      const nx = me.x + dx;
      if (nx < 30 || nx > sim.terrain.W - 30) continue;
      const gy = sim.terrain.findSurfaceY(nx | 0, Math.max(0, me.y - 60));
      if (gy === null || gy > sim.waterY - 25 || Math.abs(gy - me.y) > 42) continue; // 去不了/悬崖
      // 快速探测：2 角度 × 2 力度
      let s = 0;
      const probeSim = {
        terrain: sim.terrain, waterY: sim.waterY, windAccel: sim.windAccel,
        worms: sim.worms.map(w => w.clone()),
      };
      const fakeOwner = probeSim.worms.find(w => w.id === me.id);
      for (const a of [40, 140]) {
        for (const p of [0.45, 0.9]) {
          const r = simulateShot(probeSim, fakeOwner, 'bazooka', a, p);
          s += scoreShot(probeSim, fakeOwner, r);
        }
      }
      if (s > bestScore) { bestScore = s; bestX = nx; }
    }
    const s0 = this.quickScoreHere();
    return bestScore > s0 + 8 ? bestX : null;
  }

  quickScoreHere() {
    const sim = this.sim;
    const probeSim = { terrain: sim.terrain, waterY: sim.waterY, windAccel: sim.windAccel, worms: sim.worms.map(w => w.clone()) };
    const fakeOwner = probeSim.worms.find(w => w.id === this.worm.id);
    let s = 0;
    for (const a of [40, 140]) for (const p of [0.45, 0.9]) {
      s += scoreShot(probeSim, fakeOwner, simulateShot(probeSim, fakeOwner, 'bazooka', a, p));
    }
    return s;
  }

  upMove(dt) {
    const d = this.walkTarget - this.worm.x;
    if (Math.abs(d) < 10 || this.timer < -2.5) {
      this.worm.walkDir = 0;
      // 走位改变了自身位置：必须基于新位置重建模拟并清掉旧最优解，
      // 否则拿到的是「旧位置的解」，从新位置开火系统性偏移
      this.sim = makeSim(this.game);
      if (!this.diff.simulateWind) this.sim.windAccel = 0;
      this.bestSoFar = null;
      const special = this.weaponIds.find(id => WEAPON_BY_ID[id].targeting);
      const specialAllowed = this.diff.smartWeapon || (this.diff.refine > 0 && Math.random() < 0.35);
      if (special && specialAllowed && Math.random() < 0.75) { this.specialWeapon = special; this.phase = 'special'; this.timer = 0.5; return false; }
      this.startSearch();
      return false;
    }
    this.worm.walkDir = Math.sign(d);
    this.worm.facing = this.worm.walkDir;
    this.timer -= dt;
    return false;
  }

  startSearch() {
    this.phase = 'search';
    this.searchIter = searchCandidates(this.sim, this.worm, this.weaponIds.filter(id => !WEAPON_BY_ID[id].targeting && !WEAPON_BY_ID[id].hitscan), {
      angleStep: this.diff.angleStep,
      powerStep: this.diff.powerStep,
      refine: this.diff.refine,
    });
    this.searchDeadline = 4.5;
    if (Math.random() < 0.5) this.worm.say(TAUNTS[Math.floor(Math.random() * TAUNTS.length)], 1.8);
  }

  upSearch(dt) {
    this.searchDeadline -= dt;
    let n = 0;
    // 每固定步 10 次模拟：修复炮口自爆后单次模拟成本大增（真跑完整弹道），
    // 14/步会使 g.update 均值超出 0.1ms 预算（实测 0.11~0.12），10/步摊薄到 ~0.09
    while (n < 10) {
      const r = this.searchIter.next();
      if (r.done) { this.finishSearch(); return false; }
      n++;
      if (!this.bestSoFar || r.value.score > this.bestSoFar.score) this.bestSoFar = r.value;
    }
    if (this.searchDeadline <= 0) this.finishSearch();
    return false;
  }

  finishSearch() {
    // 散弹枪近距离单独评估
    const me = this.worm;
    const ammo = this.game.ammoPool[me.team];
    let best = this.bestSoFar;
    if (ammo.shotgun > 0) {
      const r = this.tryShotgun();
      if (r && (!best || r.score > best.score + 6)) best = r;
    }
    if (!best) { this.skipTurn(); return; }
    if (best.score < -28) { this.skipTurn(); return; }

    // 没有好机会 → 尝试向最近敌人走位再搜一次（每回合最多一次）
    if (best.score < 10 && !this.movedOnce) {
      const spot = this.walkTowardEnemy();
      if (spot !== null && Math.abs(spot - me.x) > 15) {
        this.movedOnce = true;
        this.walkTarget = spot;
        this.timer = 0;
        this.phase = 'move';
        return;
      }
    }

    // 命中噪声
    const angle = best.angle + gauss() * this.diff.angleNoise;
    const power = Math.max(0.15, Math.min(1, best.power + gauss() * this.diff.powerNoise));
    this.chosen = { weaponId: best.weaponId, angle, power };
    this.best = best;

    // 发射后撤退方向：弹着点离自己近就跑
    if (this.diff.retreat && best.result && Math.hypot(best.result.endX - me.x, best.result.endY - me.y) < 110) {
      this.retreatDir = best.result.endX > me.x ? -1 : 1;
    }
    this.phase = 'aim';
    this.aimFrom = me.aimAngle;
    this.aimTo = this.chosen.angle;
    this.aimT = 0;
    this.game.sfx('voice', { pitch: 0.9 });
  }

  // 走向最近敌人的安全路径点（最多 110px，不落水）
  walkTowardEnemy() {
    const sim = this.sim, me = this.worm;
    let enemy = null, bestD = Infinity;
    for (const w of sim.worms) {
      if (!w.alive || w.team === me.team) continue;
      const d = Math.abs(w.x - me.x);
      if (d < bestD) { bestD = d; enemy = w; }
    }
    if (!enemy) return null;
    const dir = Math.sign(enemy.x - me.x) || 1;
    for (const dist of [110, 80, 50, 30]) {
      const nx = me.x + dir * dist;
      if (nx < 30 || nx > sim.terrain.W - 30) continue;
      const gy = sim.terrain.findSurfaceY(nx | 0, Math.max(0, me.y - 60));
      if (gy !== null && gy < sim.waterY - 25 && Math.abs(gy - me.y) < 46) return nx;
    }
    return null;
  }

  tryShotgun() {
    const sim = this.sim;
    const me = this.worm;
    // 找视线内最近敌人
    let target = null, bestD = 235;
    for (const o of sim.worms) {
      if (!o.alive || o.team === me.team || o.id === me.id) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d < bestD) {
        // 视线检查
        const steps = Math.ceil(d / 8);
        let clear = true;
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          if (sim.terrain.isSolid(me.x + (o.x - me.x) * t, me.bodyY - 6 + (o.bodyY - 6 - (me.bodyY - 6)) * t)) { clear = false; break; }
        }
        if (clear) { target = o; bestD = d; }
      }
    }
    if (!target) return null;
    const angle = Math.atan2(-(target.bodyY - 6 - (me.bodyY - 6)), target.x - me.x) * 180 / Math.PI;
    // 近距离约 3 颗弹丸命中
    const dmgMap = new Map([[target.id, WEAPON_BY_ID.shotgun.dmg * 3]]);
    const score = scoreShot(sim, me, { dmgMap });
    return { weaponId: 'shotgun', angle, power: 1, score, result: { dmgMap, endX: target.x, endY: target.y } };
  }

  // 空袭 / 奶牛
  upSpecial(dt) {
    this.timer -= dt;
    if (this.timer > 0) return false;
    const target = pickTargetWorm(this.sim, this.worm);
    if (!target) { this.startSearch(); return false; }
    const noise = gauss() * (this.diff.angleNoise * 2.2);
    this.game.fireWeapon(this.worm, this.specialWeapon, 0, 0, target.x + noise);
    this.worm.say(this.specialWeapon === 'cow' ? '奶牛来了！' : '天降正义！', 1.6);
    this.finished = true;
    return true;
  }

  upAim(dt) {
    this.aimT += dt / 0.85;
    const t = Math.min(1, this.aimT);
    // 归一化角度插值
    let from = this.aimFrom, to = this.aimTo;
    let d = to - from;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    this.worm.aimAngle = from + d * t;
    this.worm.facing = Math.cos(this.worm.aimAngle * Math.PI / 180) >= 0 ? 1 : -1;
    if (t >= 1) {
      this.phase = 'charge';
      this.chargeT = 0;
    }
    return false;
  }

  upCharge(dt) {
    this.chargeT += dt;
    this.game.showAICharge(this.worm, Math.min(1, this.chargeT / this.chargeDur) * this.chosen.power);
    if (this.chargeT >= this.chargeDur) {
      this.game.hideAICharge();
      const opts = this.chosen.weaponId === 'shotgun' ? { aiSingle: true } : undefined;
      this.game.fireWeapon(this.worm, this.chosen.weaponId, this.chosen.angle, this.chosen.power, undefined, opts);
      if (this.diff.retreat && this.retreatDir !== 0) {
        this.phase = 'retreat';
        this.retreatT = 1.1;
        return false;
      }
      this.finished = true;
      return true;
    }
    return false;
  }

  upRetreat(dt) {
    this.retreatT -= dt;
    this.worm.walkDir = this.retreatDir;
    this.worm.facing = this.retreatDir;
    if (this.retreatT <= 0) {
      this.worm.walkDir = 0;
      this.finished = true;
      return true;
    }
    return false;
  }

  skipTurn() {
    this.worm.say('先观望一下…', 1.6);
    this.game.skipTurnByAI();
    this.finished = true;
  }
}
