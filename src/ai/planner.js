// ============ AI 规划器：克隆世界状态 + 弹道模拟寻优 ============
// 与真实物理共用 Projectile 积分，保证 AI 预判与实际弹道一致
import { Projectile, explosionEffects } from '../entities/projectile.js';
import { muzzlePos, launchVelocity } from '../weapons/index.js';
import { WORM_R, GRAVITY, WEAPON_BY_ID, MAX_FALL_NO_DMG, FALL_DMG_K } from '../config.js';

export class SimTerrain {
  constructor(mask, W, H) { this.mask = mask; this.W = W; this.H = H; }
  isSolid(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || x >= this.W) return true;
    if (y < 0 || y >= this.H) return false;
    return this.mask[y * this.W + x] === 1;
  }
  findSurfaceY(x, yStart = 0) {
    x |= 0;
    if (x < 0 || x >= this.W) return null;
    for (let y = Math.max(0, yStart | 0); y < this.H; y++) if (this.mask[y * this.W + x]) return y;
    return null;
  }
  // AI 每个候选中都应从同一初始地形出发；钻地弹的挖洞不参与评分，
  // 这里保持掩码不变，避免一次候选把后续候选的模拟地形污染。
  drillColumn() { /* no-op */ }
}

class SimWorm {
  constructor(w) {
    this.id = w.id; this.team = w.team; this.hp = w.hp; this.alive = w.alive;
    this.x = w.x; this.y = w.y; this.vx = 0; this.vy = 0;
    this.flying = false; this.onGround = true;
  }
  get bodyY() { return this.y - 16.5; }
  // 探测走位用副本：必须走构造器克隆——spread({...w}) 会丢掉原型上的 bodyY getter
  clone() { return new SimWorm(this); }
}

export function makeSim(game) {
  // 复用同一块模拟掩码，避免每个 AI 回合分配 1.8MB 的 Uint8Array
  const src = game.terrain.mask;
  let buf = game._simMask;
  if (!buf || buf.length !== src.length) {
    buf = new Uint8Array(src.length);
    game._simMask = buf;
  }
  buf.set(src);
  return {
    terrain: new SimTerrain(buf, game.terrain.W, game.terrain.H),
    worms: game.worms.map(w => new SimWorm(w)),
    windAccel: game.windAccel(),
    waterY: game.water.level,
  };
}

function settleWorm(w, sim, dmgMap) {
  // 击退后的简化落体模拟
  if (!w.alive || !w.flying) return;
  const dt = 1 / 60;
  const airDecay = Math.pow(0.4, dt);
  for (let i = 0; i < 150; i++) {
    if (w.y > sim.waterY) { addDmg(dmgMap, w, 999); w.alive = false; return; } // 落水
    w.vy += GRAVITY * dt;
    w.x += w.vx * dt; w.y += w.vy * dt;
    w.vx *= airDecay;
    if (w.x < 12 || w.x > sim.terrain.W - 12) w.vx = 0;
    if (w.vy > 0 && sim.terrain.isSolid(w.x, w.y)) {
      let guard = 0;
      while (sim.terrain.isSolid(w.x, w.y) && guard++ < 40) w.y -= 1;
      // 摔伤参数与真实 Worm.step 保持一致（MAX_FALL_NO_DMG / FALL_DMG_K）
      if (w.vy > MAX_FALL_NO_DMG) addDmg(dmgMap, w, (w.vy - MAX_FALL_NO_DMG) * FALL_DMG_K);
      w.flying = false; return;
    }
  }
  w.flying = false;
}

function addDmg(dmgMap, worm, dmg) {
  dmgMap.set(worm.id, (dmgMap.get(worm.id) || 0) + dmg);
}

// 模拟一发射击，返回 {dmgMap, endX, endY}
export function simulateShot(sim, owner, weaponId, angle, power) {
  const w = WEAPON_BY_ID[weaponId];
  const dmgMap = new Map();
  // NaN：出界/落水的弹没有落点，scoreShot 的 Number.isFinite 会跳过落点接近分
  let endX = NaN, endY = NaN;

  if (w.hitscan) {
    // 散弹枪射线
    const a = angle * Math.PI / 180;
    const dx = Math.cos(a), dy = -Math.sin(a);
    const sx = owner.x, sy = owner.bodyY - 6;
    let t = Math.min(w.range, 240);
    for (let d = 6; d < t; d += 3) {
      if (sim.terrain.isSolid(sx + dx * d, sy + dy * d)) { t = d; break; }
    }
    for (const o of sim.worms) {
      if (!o.alive || o.id === owner.id) continue;
      const ox = o.x - sx, oy = o.bodyY - sy;
      const proj = ox * dx + oy * dy;
      if (proj < 0 || proj > t) continue;
      if (ox * ox + oy * oy - proj * proj < (WORM_R + 4) ** 2) addDmg(dmgMap, o, w.dmg);
    }
    endX = sx + dx * t; endY = sy + dy * t;
    return { dmgMap, endX, endY };
  }

  const m = muzzlePos({ x: owner.x, bodyY: owner.bodyY }, angle);
  const v = launchVelocity(angle, power);
  const active = [];
  const spawn = (wid, x, y, vx, vy, own) => {
    const p = new Projectile({ weaponId: wid, owner: own, x, y, vx, vy, game: null, onExplode: null });
    p.simWorms = sim.worms;
    p.onExplode = (ex, ey, proj) => {
      endX = ex; endY = ey;
      // 集束主爆按真实路径折减（game.projectileExplode: 0.6 径 / 0.5 伤）
      const isCl = !!proj.weapon.cluster;
      const r = isCl ? proj.weapon.radius * 0.6 : proj.weapon.radius;
      const dmg = isCl ? proj.weapon.dmg * 0.5 : proj.weapon.dmg;
      const eff = explosionEffects(sim.worms, ex, ey, r, dmg);
      const kbX = proj.weapon.id === 'cow' ? 0.2 : 1; // 与真实奶牛击退保持一致
      for (const e of eff) {
        addDmg(dmgMap, e.worm, e.dmg);
        if (e.worm.alive) { e.worm.vx += e.kx * kbX; e.worm.vy += e.ky; e.worm.flying = true; }
      }
      if (proj.weapon.cluster) {
        for (let i = 0; i < proj.weapon.cluster; i++) {
          const ba = -Math.PI / 2 + (i - (proj.weapon.cluster - 1) / 2) * 0.36 + (Math.random() - 0.5) * 0.14;
          const sp = 125 + Math.random() * 75;
          // 子雷 owner 传发射者（与真实 spawnBomblets 一致，保留发射者豁免语义）
          spawn('bomblet', ex, ey - 4, Math.cos(ba) * sp, Math.sin(ba) * sp, own);
        }
      }
    };
    if (wid === 'cow') p.onCowBounce = (p2) => {
      const eff = explosionEffects(sim.worms, p2.x, p2.y - 8, 40, w.dmg);
      for (const e of eff) {
        addDmg(dmgMap, e.worm, e.dmg);
        if (e.worm.alive) {
          const pull = Math.max(-110, Math.min(110, -(e.worm.x - p2.x) * 2.4));
          e.worm.vx += pull;
          e.worm.flying = true;
        }
      }
    };
    active.push(p);
  };

  spawn(weaponId, m.x, m.y, v.vx, v.vy, owner);

  let t = 0;
  while (active.some(p => p.alive) && t < 9) {
    for (const p of active) if (p.alive) p.step(1 / 60, sim.terrain, sim.windAccel, sim.waterY);
    t += 1 / 60;
  }
  for (const sw of sim.worms) settleWorm(sw, sim, dmgMap);
  return { dmgMap, endX, endY };
}

// 评分：敌方收益 − 友方/自伤惩罚
export function scoreShot(sim, owner, result) {
  let enemy = 0, ally = 0, own = 0;
  for (const [wid, dmg] of result.dmgMap) {
    const w = sim.worms.find(x => x.id === wid);
    if (!w) continue;
    if (w.id === owner.id) own += dmg;
    else if (w.team === owner.team) ally += dmg;
    else enemy += dmg;
  }
  let score = enemy - ally * 2.2 - own * 1.9;
  // 击杀奖励
  for (const [wid, dmg] of result.dmgMap) {
    const w = sim.worms.find(x => x.id === wid);
    if (w && w.team !== owner.team && w.alive && w.hp - dmg <= 0) score += 45;
  }
  // 落点靠近敌人加分：避免 AI 朝无人区/边缘开火（打不中也打得有方向）
  if (result.endX !== undefined && Number.isFinite(result.endX)) {
    let nearest = Infinity;
    for (const w of sim.worms) {
      if (!w.alive || w.team === owner.team) continue;
      const d = Math.hypot(w.x - result.endX, w.bodyY - result.endY);
      if (d < nearest) nearest = d;
    }
    if (nearest < 420) score += Math.max(0, 24 - nearest * 0.055);
  }
  return score;
}

// 一轮武器全候选搜索（生成器，方便分帧）
// 迭代产出 {weaponId, angle, power, score, result}
export function* searchCandidates(sim, owner, weaponIds, opts) {
  const { angleStep, powerStep, refine } = opts;
  for (const weaponId of weaponIds) {
    const w = WEAPON_BY_ID[weaponId];
    let best = null;
    const angles = [];
    for (let a = 8; a <= 172; a += angleStep) angles.push(a);
    const powers = [];
    for (let p = 0.25; p < 1; p += powerStep) powers.push(p);
    powers.push(1); // 满力必须显式覆盖（浮点步进到不了 1.0）

    const tryShot = function* (angle, power) {
      const r = simulateShot(sim, owner, weaponId, angle, power);
      const s = scoreShot(sim, owner, r);
      const c = { weaponId, angle, power, score: s, result: r };
      if (!best || s > best.score) best = c;
      yield c;
    };

    for (const a of angles) for (const p of powers) yield* tryShot(a, p);
    // 迭代细化
    let step = angleStep / 2;
    let pStep = powerStep / 2;
    for (let it = 0; it < refine && best; it++) {
      const base = { ...best };
      for (const da of [-step, 0, step]) for (const dp of [-pStep, 0, pStep]) {
        if (da === 0 && dp === 0) continue;
        yield* tryShot(clampA(base.angle + da), clampP(base.power + dp));
      }
      step /= 2; pStep /= 2;
    }
    if (best) yield { ...best, _best: true };
  }
}

function clampA(a) { return Math.max(3, Math.min(177, a)); }
function clampP(p) { return Math.max(0.12, Math.min(1, p)); }

// 空袭/奶牛目标启发式：选择最暴露的敌人
export function pickTargetWorm(sim, owner) {
  // -Infinity：唯一敌人哪怕被遮挡+友军邻近（惩罚后为负）也要选出来，不能弃用特殊武器
  let best = null, bestScore = -Infinity;
  for (const w of sim.worms) {
    if (!w.alive || w.team === owner.team) continue;
    // 上方遮挡检测
    let blocked = 0;
    for (let y = w.y - 30; y > w.y - 260 && y > 0; y -= 12) {
      if (sim.terrain.isSolid(w.x, y)) { blocked = 1; break; }
    }
    // 附近友军误伤
    let friendly = 0;
    for (const o of sim.worms) {
      if (o.alive && o.team === owner.team && Math.hypot(o.x - w.x, o.y - w.y) < 70) friendly = 1;
    }
    const s = w.hp - blocked * 60 - friendly * 120;
    if (s > bestScore) { bestScore = s; best = w; }
  }
  return best;
}
