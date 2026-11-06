// ============ 武器行为：发射 / 弹道预览 / 瞬发 / 目标标记 ============
import { Projectile, Plane } from '../entities/projectile.js';
import { WORM_R } from '../config.js';

export const MIN_SPEED = 330, MAX_SPEED = 1180;

export function muzzlePos(worm, angleDeg, dist = 17) {
  // 角度约定 0=右 90=上（与 launchVelocity 的 -sin 一致）：竖直向上时炮口在头顶
  const a = angleDeg * Math.PI / 180;
  return { x: worm.x + Math.cos(a) * dist, y: worm.bodyY - 6 - Math.sin(a) * dist };
}

export function launchVelocity(angleDeg, power) {
  const a = angleDeg * Math.PI / 180;
  const sp = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.max(0, Math.min(1, power));
  return { vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp };
}

// 发射入口。返回 true 表示已进入目标标记模式（回合未消耗）
export function fireWeapon(game, worm, weaponId, angle, power, targetX, opts = {}) {
  const w = game.weaponById(weaponId);
  if (!w) return false;

  if (w.targeting) {
    // 需要玩家确认目标点的武器（空袭/奶牛/传送）
    if (targetX === undefined) {
      game.enterTargeting(weaponId);
      return true;
    }
    if (w.teleport) {
      // 落点校验与坐标应用已在 confirmTarget → tryTeleport 完成，这里只结算
      game.consumeAmmo(worm, weaponId);
      game.afterFire(worm, false);
      return false;
    }
    game.consumeAmmo(worm, weaponId);
    if (weaponId === 'airstrike') {
      const dir = targetX < worm.x ? -1 : 1; // 飞机从虫虫一侧进入
      game.planes.push(new Plane(game, targetX, dir > 0 ? 1 : -1, worm));
    } else if (weaponId === 'cow') {
      spawnCow(game, worm, targetX);
    }
    game.afterFire(worm, false);
    return false;
  }

  if (w.hitscan) {
    // 散弹枪两发一组：只在第一发扣 1 发弹药，第二发免费打完
    if (!(game._shotgunUsedThisTurn > 0)) game.consumeAmmo(worm, weaponId);
    shotgunBlast(game, worm, w, angle, power);
    worm.recoilT = 0.25;
    game.onShotgunShot(worm, w, opts);
    return false;
  }

  // 常规抛射
  game.consumeAmmo(worm, weaponId);
  const m = muzzlePos(worm, angle);
  const v = launchVelocity(angle, power);
  const p = new Projectile({
    weaponId, owner: worm, x: m.x, y: m.y, vx: v.vx, vy: v.vy,
    game,
    onExplode: (x, y, proj) => game.projectileExplode(x, y, proj),
  });
  game.projectiles.push(p);
  worm.recoilT = 0.25;
  game.sfx('shoot');
  game.afterFire(worm, true);
  return false;
}

// 散弹枪：瞬发 5 颗弹丸（锥形散布），每颗独立判虫/判地形，
// 命中地形会打出小坑（可用来挖地/打穿薄土）
// power 收束散布：满力 2.75° / 空力 7.15°——蓄力对 hitscan 终于有实际作用
function shotgunBlast(game, worm, w, angle, power = 1) {
  game.sfx('shotgun');
  const sx = worm.x, sy = worm.bodyY - 6;
  const pellets = w.pellets || 5;
  const spread = (w.spread || 5) * (1.3 - 0.8 * Math.max(0, Math.min(1, power)));
  let anyWormHit = false, enemyHits = 0;
  for (let i = 0; i < pellets; i++) {
    const a = (angle + (Math.random() - 0.5) * 2 * spread) * Math.PI / 180;
    const dx = Math.cos(a), dy = -Math.sin(a);
    let hitT = w.range;
    // 射线 vs 地形
    for (let t = 8; t < w.range; t += 4) {
      if (game.terrain.isSolid(sx + dx * t, sy + dy * t)) { hitT = t; break; }
    }
    // 射线 vs 虫虫（取最近：多虫在弹道上时命中 proj 最小者）
    let hitWorm = null, hitProj = Infinity;
    for (const other of game.worms) {
      if (!other.alive || other === worm) continue;
      const ox = other.x - sx, oy = other.bodyY - sy;
      const proj = ox * dx + oy * dy;
      if (proj < 0 || proj > hitT) continue;
      const perp2 = ox * ox + oy * oy - proj * proj;
      if (perp2 < (WORM_R + 4) ** 2 && proj < hitProj) { hitWorm = other; hitProj = proj; }
    }
    if (hitWorm) hitT = hitProj;
    const ex = sx + dx * hitT, ey = sy + dy * hitT;
    game.drawShotgunTracer(sx + dx * 14, sy + dy * 14, ex, ey);
    if (hitWorm) {
      game.damageWorm(hitWorm, w.dmg, worm, 'shotgun');
      hitWorm.applyKnockback(dx * w.kb, dy * w.kb - 25);
      game.particles.sparkle(ex, ey, 0xffe9a8, 3);
      anyWormHit = true;
      if (worm.team === 0 && hitWorm.team === 1) enemyHits++;
    } else if (hitT < w.range) {
      // 地形破坏：小弹孔
      game.carveShot(ex, ey, w.crater || 13);
      // 散弹没有爆炸结算：弹着点贴近油桶时显式点燃
      for (const d of game.drums || []) {
        if (d.alive && d.fuse < 0 && Math.hypot(d.x - ex, d.y - ey) < 22) game.igniteDrum(d, 0.15, worm);
      }
    }
  }
  if (worm.team === 0 && enemyHits >= pellets) game.ach('full_pellets');
  if (anyWormHit) {
    game.sfx('hurt');
  }
  game.camShake(3);
}

function spawnCow(game, worm, targetX) {
  const p = new Projectile({
    weaponId: 'cow', owner: worm,
    x: Math.max(30, Math.min(game.terrain.W - 30, targetX)), y: -40,
    vx: 0, vy: 60, game,
    onExplode: (x, y, proj) => game.projectileExplode(x, y, proj),
  });
  game.projectiles.push(p);
  game.sfx('moo');
}

// 空袭炸弹（由飞机投放）
export function spawnAirstrikeBomb(game, x, y, dir, owner = null) {
  const p = new Projectile({
    weaponId: 'bomb', owner, x, y,
    vx: dir * 60, vy: 40, game,
    onExplode: (bx, by, proj) => game.projectileExplode(bx, by, proj),
  });
  game.projectiles.push(p);
}

// 集束炸弹分裂
export function spawnBomblets(game, x, y, count, owner = null) {
  for (let i = 0; i < count; i++) {
    // 收窄散布：子雷落在爆点附近，避免整片区域都炸不到
    const a = -Math.PI / 2 + (i - (count - 1) / 2) * 0.36 + (Math.random() - 0.5) * 0.14;
    const sp = 125 + Math.random() * 75;
    const p = new Projectile({
      weaponId: 'bomblet', owner, x, y: y - 4,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, game,
      onExplode: (bx, by, proj) => game.projectileExplode(bx, by, proj),
    });
    game.projectiles.push(p);
  }
}

// 弹道预览（也供 AI 复用思路）：返回轨迹点数组
export function simulateTrajectory(terrain, x, y, vx, vy, weapon, windAccel, waterY, maxPoints = 46) {
  const pts = [];
  const dt = 1 / 60 / 4;
  let alive = true;
  for (let i = 0; i < maxPoints * 4 && alive; i++) {
    vx += windAccel * (weapon.wind ?? 0) * dt;
    vy += 900 * (weapon.gravity ?? 1) * dt;
    x += vx * dt; y += vy * dt;
    if (terrain.isSolid(x, y) || y > waterY || x < 0 || x > terrain.W) alive = false;
    if (i % 4 === 0) pts.push({ x, y });
  }
  return pts;
}
