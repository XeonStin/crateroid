// ============ 对局主控：回合流转 / 物理 / 伤害 / 目标 / 胜负 ============
import { Terrain } from '../world/terrain.js';
import { Water } from '../world/water.js';
import { Sky } from '../world/sky.js';
import { Worm } from '../entities/worm.js';
import { Crate, pickCrateType } from '../entities/crate.js';
import { Particles } from '../entities/particles.js';
import { explosionEffects } from '../entities/projectile.js';
import { fireWeapon, simulateTrajectory, spawnBomblets, spawnAirstrikeBomb, MIN_SPEED, MAX_SPEED } from '../weapons/index.js';
import { AIBrain } from '../ai/brain.js';
import * as C from '../config.js';
import * as PIXI from 'pixi.js';
import { recordMatch, recordWeaponDamage, recordLongestShot, setChallengeRank, unlockAchievement, completeTutorial } from './save.js';
import { sfx, setMusicMode } from './audio.js';

export class Game {
  constructor(env) {
    // env: {app, layers, camera, hud, menus, touch, settings, mobile}
    Object.assign(this, env);
    this.time = 0;
    this.running = false;
    this.paused = false;
    this.debugAuto = false;
    this.aiFast = false;

    // 瞄准 UI 层
    this.aimUI = new PIXI.Graphics();
    this.aimUI.zIndex = 900;
    this.layers.world.addChild(this.aimUI);
  }

  // ---------------- 开局 ----------------
  startMatch(cfg) {
    this.matchConfig = cfg;
    this.challenge = cfg.challenge || null;
    // 清理旧场景并释放 GPU 纹理（保留复用的 aimUI）
    for (const c of [...this.layers.world.children]) {
      if (c === this.aimUI) continue;
      if (this.particles && c === this.particles.layer) {
        // 粒子层使用模块级共享圆点纹理，绝不能连带销毁（否则下一局渲染崩溃）
        c.destroy({ children: true });
        continue;
      }
      c.destroy({ children: true, texture: true, textureSource: true });
    }
    this.layers.world.removeChildren();
    for (const c of [...this.layers.sky.children]) {
      c.destroy({ children: true, texture: true, textureSource: true });
    }
    this.layers.sky.removeChildren();
    this._popups = [];
    this.shotsLeft = 0;
    this._targetMark = null;
    this._powerOffset = 0;
    this._lastCursor = null;
    this._aimHintShown = false;
    this.dashLeft = 1;
    this._playerBerserk = false;
    this._projT = 0;
    this.brain = null;
    // 本局数据统计（结算面板展示）
    this.matchStats = { shots: 0, hits: 0, dmgDealt: 0, dmgTaken: 0, kills: 0, longest: 0, crates: 0 };

    this.terrain = new Terrain();
    this.terrain.attach(this.layers.world);
    this.terrain.generate(cfg.theme, cfg.seed);
    // 主题天空渐变应用到页面背景（canvas 透明）
    const sky = C.THEMES[cfg.theme]?.sky;
    if (sky) document.body.style.background = `linear-gradient(180deg, ${sky.join(', ')})`;

    this.water = new Water(cfg.theme);
    this.water.setLevel(this.challenge?.waterY ?? this.terrain.waterY);
    this.layers.world.addChild(this.water.view);

    this.sky = new Sky(cfg.theme, this.mobile);
    this.layers.sky.addChild(this.sky.container);

    this.particles = new Particles(this.mobile);
    this.layers.world.addChild(this.particles.layer);

    // 实体层（虫虫/投射物/补给箱）
    this.layers.ents = new PIXI.Container();
    this.layers.ents.zIndex = 100;
    this.layers.world.addChild(this.layers.ents);

    this.layers.world.addChild(this.aimUI);

    // 虫虫
    this.worms = [];
    let id = 0;
    const mk = (spec, team) => {
      const w = new Worm({
        id: id++, team, x: spec.x, y: 0,
        name: spec.name, color: spec.color, hat: spec.hat,
        isAI: team === 1 || !!spec.isAI, hp: spec.hp ?? 100,
      });
      const gy = this.terrain.findSurfaceY(spec.x | 0, 0) ?? 600;
      w.y = gy;
      this.worms.push(w);
      this.layers.ents.addChild(w.view);
    };
    for (const s of cfg.playerWorms) mk(s, 0);
    for (const s of cfg.enemyWorms) mk(s, 1);

    // 弹药池
    this.ammoPool = [this._makeAmmo(cfg.ammoPlayer), this._makeAmmo(cfg.ammoEnemy)];

    this.projectiles = [];
    this.planes = [];
    this.crates = [];
    this.turnCount = 0;
    this.round = 1;
    this.suddenDeath = false;
    this.selectedWeapon = 'bazooka';
    this.charging = false;
    this.chargePower = 0;
    this.slingshot = null;      // {angle, power}
    this.targetingWeapon = null;
    this.aiChargeWorm = null;
    this.wind = 0;
    this.matchOver = false;
    this.surviveTurnsLeft = this.challenge?.surviveTurns ?? null;
    this.brain = null;
    this.state = 'turnStart';
    this.stateTimer = 0;

    // 基础缩放：世界变小后拉近一点，手机端不至于太远
    const baseZoom = Math.max(this.camera.minZoom(), Math.min(1.05, this.camera.viewW / 1500));
    this.camera.zoom = baseZoom;
    this.camera.tzoom = baseZoom;
    // 教学关：初始化提示队列（每回合递进显示一条）
    const tut = cfg.challenge?.tutorial ? cfg.challenge : null;
    this._tutHints = tut ? [...(tut.hints || [])] : null;
    this._tutIdx = 0;
    setMusicMode('battle');
    this.nextTurn(true);
    if (tut) {
      this.hud.banner(`📖 ${tut.name}`, '跟着提示慢慢来，靶子不会还手');
      if (tut.intro) this.hud.message(tut.intro);
    }
    this.running = true;
  }

  _makeAmmo(overrides) {
    const a = {};
    for (const w of C.WEAPONS) a[w.id] = w.ammo;
    if (overrides) for (const [k, v] of Object.entries(overrides)) a[k] = v;
    return a;
  }

  weaponById(id) { return C.WEAPON_BY_ID[id]; }
  windAccel() {
    // 主题风力倍率：雪原风大、沙漠风小
    return this.wind * C.WIND_MAX_ACC * (this.terrain?.theme?.windScale ?? 1);
  }
  sfx(name, opt) { sfx(name, opt); }
  camShake(a) { this.camera.shake(a); }
  say(worm, text, dur) { if (worm && worm.alive) worm.say(text, dur); }

  dirtColor() {
    return this.terrain.theme ? this.terrain.theme.body : 0x8a5a33;
  }

  // ---------------- 回合 ----------------
  teamWorms(t) { return this.worms.filter(w => w.team === t); }
  teamAlive(t) { return this.worms.some(w => w.team === t && w.alive); }

  nextTurn(first = false) {
    this.turnCount++;
    this.round = Math.floor((this.turnCount - 1) / 2) + 1;
    const team = (this.turnCount - 1) % 2;

    // 突死
    const sdRound = this.challenge?.suddenDeathRound ?? C.SUDDEN_DEATH_ROUND;
    if (!this.suddenDeath && this.round >= sdRound && !this.challenge?.noSuddenDeath) {
      this.suddenDeath = true;
      for (const w of this.worms) if (w.alive) w.hp = 1;
      this.hud.banner('☠️ 突死模式！', '水位上涨 · 全员 1 HP');
      sfx('lose');
    }
    if (this.suddenDeath) this.water.rise(C.WATER_RISE * 3);

    // 依次选取该队下一只存活虫虫
    const teamWormsAll = this.teamWorms(team);
    if (!this._teamCursor) this._teamCursor = [0, 0];
    let tries = 0, cur = null;
    while (tries++ < teamWormsAll.length + 1) {
      const idx = this._teamCursor[team] % teamWormsAll.length;
      this._teamCursor[team]++;
      if (teamWormsAll[idx].alive) { cur = teamWormsAll[idx]; break; }
    }
    if (!cur) { this._checkWin(); return; }

    this.currentWorm = cur;
    this.wind = (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6);
    this.selectedWeapon = 'bazooka';
    this.shotsLeft = 0;
    this._powerOffset = 0;
    this.chargePower = 0;
    this.charging = false;
    // 背水一战：全队只剩自己时移速+15%、冲刺+1（对 AI 同样生效）
    const teamSize = this.teamWorms(cur.team).length;
    const aliveCount = this.teamWorms(cur.team).filter(w => w.alive).length;
    cur.berserk = teamSize > 1 && aliveCount === 1;
    this.dashLeft = cur.berserk ? 2 : 1;
    if (cur.berserk && !cur._berserkMsg) {
      cur._berserkMsg = true;
      this.hud.message(`🔥 ${cur.name} 背水一战！移速 +15% · 冲刺 ×2`);
      if (cur.team === 0) this._playerBerserk = true;
    }
    // 清理上一回合残留的移动意图：否则「回合结束瞬间按住方向」会让旧虫一直走
    for (const w of this.worms) {
      w.walkDir = 0; w.wantJump = false; w.wantJet = false; w.dashT = 0;
    }
    this.stateTimer = first ? 1.0 : C.BANNER_TIME;
    this.state = 'turnStart';
    this.turnTimer = this.challenge?.turnTime ?? C.TURN_TIME;
    this.retreatLeft = 0;

    cur.showArrow(true);
    this.camera.follow(cur.x, cur.y - 60);
    this.hud.setControlsHint('');
    if (!cur.isAI) sfx('voice', { pitch: 1.1 });
    // 首回合操作提示（教学关有自己的提示序列，不重复）
    if (!cur.isAI && !this._aimHintShown && !this.challenge?.tutorial) {
      this._aimHintShown = true;
      if (this.mobile) {
        this.hud.message('📱 按住屏幕拖拽＝拉弓瞄准，松手发射');
        this.hud.message('◀ ▶ 行走 · ⤒ 跳跃 · 🎒 换武器');
      } else {
        this.hud.message('🖱 按住左键：鼠标离虫虫越远力度越大，松手发射');
        this.hud.message('滚轮微调力度 · Esc/右键取消瞄准 · 双击方向冲刺');
      }
    }

    this.hud.banner(
      this.challenge ? '挑战进行中' : `第 ${this.round} 回合`,
      `${cur.name} ${cur.isAI ? '（AI）' : ''} 的回合`
    );
    this.hud.setWind(this.wind);
    this.hud.setRound(this.round, this.suddenDeath);
    this.hud.setTimer(this.turnTimer, false);
    this.syncWeaponBar();
    // 教学提示：每个玩家回合递进一条
    if (!cur.isAI && this._tutHints && this._tutIdx < this._tutHints.length) {
      this.hud.message(this._tutHints[this._tutIdx++]);
    }
    this.hud.setFuel(cur.jetFuel);
    this.touch?.setJetMode(cur.jetFuel > 0);
    this.updateInputMode();
  }

  // 当前操作者的输入模式
  updateInputMode() {
    const human = !this.currentWorm?.isAI;
    const retreat = this.state === 'projectile' && this.retreatLeft > 0;
    if (human && this.targetingWeapon) this.input.mode = 'target';
    else if (human && (this.state === 'active' || retreat)) this.input.mode = 'aim';
    else this.input.mode = 'idle';
    this.input.mode2 = this.settings.aimMode;
    this.touch?.setFireMode(this.settings.aimMode);
    this.touch?.setControlsEnabled(human && (this.state === 'active' || retreat));
  }

  syncWeaponBar() {
    const human = !this.currentWorm?.isAI;
    this.hud.setWeaponBar(
      C.WEAPONS.filter(w => !w.hidden),
      this.ammoPool[this.currentWorm?.team ?? 0],
      this.selectedWeapon,
      human && this.state === 'active'
    );
  }

  selectWeapon(id) {
    if (this.currentWorm?.isAI || this.state !== 'active') return;
    const w = this.weaponById(id);
    if (!w || this.ammoPool[this.currentWorm.team][id] <= 0) return;
    this.selectedWeapon = id;
    this.shotsLeft = w.shots || 0;   // 散弹枪本回合剩余弹数
    this.cancelTargeting();
    sfx('click');
    this.syncWeaponBar();
  }

  consumeAmmo(worm, weaponId) {
    const pool = this.ammoPool[worm.team];
    if (Number.isFinite(pool[weaponId]) && pool[weaponId] > 0) pool[weaponId]--;
    this.syncWeaponBar();
  }

  // ---------------- 开火 ----------------
  fireWeapon(worm, weaponId, angle, power, targetX, opts) {
    if (!worm || !worm.alive) return false; // 死亡虫虫不能射击
    const entered = fireWeapon(this, worm, weaponId, angle, power, targetX, opts);
    if (!entered && worm.team === 0 && this.matchStats) this.matchStats.shots++;
    return entered;
  }

  // 冲刺：双击方向键 / 双击虚拟方向键（普通 1 次/回合，背水一战 2 次）
  tryDash(dir) {
    const cur = this.currentWorm;
    if (!cur || cur.isAI || this.state !== 'active') return;
    if (!cur.alive || !cur.onGround || this.dashLeft <= 0) return;
    if (Math.abs(dir) !== 1) return;
    this.dashLeft--;
    cur.dashT = C.DASH_TIME;
    cur.dashDir = dir;
    this.sfx('boing');
    this.hud.message('💨 冲刺！');
  }

  // 成就解锁（去重，金色提示）
  ach(id) {
    if (unlockAchievement(id)) {
      const a = C.ACHIEVEMENTS[id];
      if (a) {
        this.hud.toast(`🏅 成就解锁：${a.name}（${a.desc}）`);
        sfx('pickup');
      }
    }
  }

  // 散弹枪地形破坏：只挖坑，不触发爆炸伤害/震屏
  carveShot(x, y, r) {
    this.terrain.carve(x, y, r);
    this.particles.sparkle(x, y, this.dirtColor(), 5);
  }

  // 散弹枪每发弹调用（shots>0 时同回合可连射）
  onShotgunShot(worm, w, opts) {
    this.shotsLeft = Math.max(0, this.shotsLeft - 1);
    const ammo = this.ammoPool[worm.team][w.id];
    if (opts?.aiSingle || this.shotsLeft <= 0 || ammo <= 0) {
      this.shotsLeft = 0;
      this.afterFire(worm, false);
    } else {
      this.hud.message(`🔫 还可发射 ${this.shotsLeft} 发`);
    }
  }

  enterTargeting(weaponId) {
    this.targetingWeapon = weaponId;
    this.updateInputMode();
    this.hud.message(weaponId === 'airstrike' ? '📍 点击地图标记空袭点' : '📍 点击地图标记奶牛落点');
  }

  cancelTargeting() {
    if (!this.targetingWeapon) return;
    this.targetingWeapon = null;
    this.updateInputMode();
  }

  confirmTarget(wx, wy) {
    if (!this.targetingWeapon) return;
    const wid = this.targetingWeapon;
    this.targetingWeapon = null;
    this.fireWeapon(this.currentWorm, wid, 0, 0, wx);
  }

  afterFire(worm, projectile) {
    this.charging = false;
    this.chargePower = 0;
    this.slingshot = null;
    this.state = 'projectile';
    this._projT = 0;
    this.retreatLeft = worm.isAI ? 0 : C.RETREAT_TIME;
    this.hud.powerHide();
    this.updateInputMode();
    this.syncWeaponBar();
    this.hud.setControlsHint(this.retreatLeft > 0 ? `撤退！${C.RETREAT_TIME}s` : '');
  }

  skipTurnByAI() {
    this.hud.message(`${this.currentWorm.name} 放弃了回合`);
    this._endTurnCommon();
  }

  // 玩家跳过
  skipTurn() {
    if (this.state !== 'active' || this.currentWorm?.isAI) return;
    this.say(this.currentWorm, '这回合先让给你们！');
    this._endTurnCommon();
  }

  _endTurnCommon() {
    this.charging = false;
    this.slingshot = null;
    this.hud.powerHide();
    this._postTurn();
  }

  // ---------------- 弹道与爆炸 ----------------
  projectileExplode(x, y, proj) {
    const w = proj.weapon;
    if (w.cluster) {
      spawnBomblets(this, x, y, w.cluster);
      this.explode(x, y, w.radius * 0.6, w.dmg * 0.5, { owner: proj.owner, weaponId: proj.weapon.id, origin: proj.owner });
      return;
    }
    if (w.holy) {
      this.hud.banner('ALLELUIA!', '💥');
      sfx('holy');
    }
    this.explode(x, y, w.radius, w.dmg, { owner: proj.owner, weaponId: proj.weapon.id, origin: proj.owner });
  }

  explode(x, y, r, dmg, opts = {}) {
    // 暴击：7% 概率 1.6 倍伤害
    if (dmg >= 18 && Math.random() < C.CRIT_CHANCE) {
      dmg = Math.round(dmg * C.CRIT_MULT);
      this.popup(x, y - 18, '💥 暴击！', 0xffd93d);
      this.particles.sparkle(x, y, 0xffd93d, 14);
      this.ach('crit');
    }
    this.terrain.carve(x, y, r);
    this.particles.explosion(x, y, r, this.dirtColor(), this.mobile);
    this.camShake(Math.min(14, r / 4));
    sfx(r > 55 ? 'exploBig' : r < 30 ? 'exploTiny' : 'explo');

    const eff = explosionEffects(this.worms, x, y, r, dmg);
    const wasAlive = new Map(eff.map(e => [e.worm.id, e.worm.alive]));
    const wasHp = new Map(eff.map(e => [e.worm.id, e.worm.hp]));
    for (const e of eff) {
      this.damageWorm(e.worm, e.dmg, opts.origin, opts.weaponId);
      if (e.worm.alive) e.worm.applyKnockback(e.kx, e.ky);
    }
    // 擦身而过：没被波及但离爆心很近的虫虫会被吓一跳
    for (const w of this.worms) {
      if (!w.alive || eff.some(e => e.worm === w)) continue;
      const d = Math.hypot(w.x - x, w.bodyY - y);
      if (d < r + 46 && Math.random() < 0.35) this.say(w, '好险！', 1.1);
    }
    // 连杀播报：一次爆炸击倒 2/3+ 只敌人
    if (opts.origin) {
      let killed = 0, enemyHit = 0;
      for (const e of eff) {
        if (e.worm.team === opts.origin.team || !wasAlive.get(e.worm.id)) continue;
        enemyHit++;
        if (!e.worm.alive) killed++;
      }
      if (opts.origin.team === 0 && this.matchStats && enemyHit > 0) this.matchStats.hits++;
      if (killed >= 3) {
        this.hud.banner('💥 三杀！', `${opts.origin.name} 一炸三只！`);
        this.ach('triple_kill');
      } else if (killed >= 2) {
        this.hud.banner('💥 双杀！', opts.origin.name);
        this.ach('double_kill');
      }
    }
    // 补给箱被炸毁
    for (const c of this.crates) {
      if (!c.alive) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < r + 10) {
        c.destroy();
        this.particles.sparkle(c.x, c.y, 0xffd23d, 10);
      }
    }
    // 最远一击统计
    if (opts.origin && opts.origin.team === 0 && opts.origin.alive) {
      const dist = Math.hypot(x - opts.origin.x, y - opts.origin.bodyY);
      if (dist > 250 && eff.some(e => e.worm.team === 1)) {
        recordLongestShot(dist);
        if (this.matchStats && dist > this.matchStats.longest) this.matchStats.longest = Math.round(dist);
        if (dist > 700) this.ach('long_shot');
      }
    }
  }

  cowStomp(p) {
    const eff = explosionEffects(this.worms, p.x, p.y - 8, 40, p.weapon.dmg);
    for (const e of eff) {
      this.damageWorm(e.worm, e.dmg, p.owner, 'cow');
      if (e.worm.alive) e.worm.applyKnockback(e.kx, e.ky);
    }
    this.particles.splash(p.x, p.y, 0xcccccc, 8);
    this.camShake(5);
  }

  spawnAirstrikeBomb(x, y, dir) { spawnAirstrikeBomb(this, x, y, dir); }

  // 投射物出界/落水后由 update 统一过滤
  projectileGone(p) { /* noop */ }

  damageWorm(worm, dmg, source, weaponId) {
    if (!worm.alive || dmg <= 0.5) return;
    const d = Math.max(1, Math.round(dmg));
    const wasAlive = worm.alive;
    worm.hp = Math.max(0, worm.hp - d);
    worm.hurtFlash = 0.4;
    worm.stunnedT = 0.8;
    this.popup(worm.x, worm.bodyY - 26, `-${d}`, 0xff6b81);
    sfx('hurt');
    if (Math.random() < 0.4) this.say(worm, C.OUCHES[Math.floor(Math.random() * C.OUCHES.length)], 1.4);
    if (source && source.team === 0 && weaponId) recordWeaponDamage(weaponId, d);
    if (this.matchStats) {
      if (source && source.team === 0 && worm.team === 1) this.matchStats.dmgDealt += d;
      if (worm.team === 0) this.matchStats.dmgTaken += d;
      if (worm.hp <= 0 && wasAlive && source && source.team === 0 && worm.team === 1) this.matchStats.kills++;
    }
    if (worm.hp <= 0) {
      // 击杀者嘲讽一句
      if (source && source.alive && source !== worm && Math.random() < 0.5) {
        this.say(source, C.TAUNTS[Math.floor(Math.random() * C.TAUNTS.length)], 1.4);
      }
      this.killWorm(worm);
    }
    this.hud.updateTeamPips(this.worms);
  }

  applyFallDamage(worm, dmg) {
    this.damageWorm(worm, dmg, null, null);
    this.popup(worm.x, worm.bodyY - 26, '摔伤！', 0xffa843);
  }

  drownWorm(worm) {
    if (!worm.alive) return;
    this.splashAt(worm.x, this.water.level);
    sfx('drown');
    worm.hp = 0;
    worm.alive = false;
    worm.view.visible = false;
    this.popup(worm.x, this.water.level - 30, '扑通…', 0x9fd4ff);
    this.hud.message(`💧 ${worm.name} 落水了！`);
    sfx('death');
    this.hud.updateTeamPips(this.worms);
  }

  killWorm(worm) {
    if (!worm.alive) return;
    worm.hp = 0;
    sfx('death');
    this.say(worm, C.DEATH_WORDS[Math.floor(Math.random() * C.DEATH_WORDS.length)], 2);
    worm.die(this, C.EPITAPHS[Math.floor(Math.random() * C.EPITAPHS.length)]);
    this.hud.message(`🪦 ${worm.name} 阵亡`);
    this.hud.updateTeamPips(this.worms);
  }

  splashAt(x, y) {
    this.particles.splash(x, y, this.terrain.theme.lava ? 0xff7a30 : 0x9fd4ff, 16);
    sfx('splash');
  }

  // ---------------- 补给箱 ----------------
  maybeSpawnCrate() {
    if (this.challenge?.noCrates) return;
    if (this.crates.filter(c => c.alive).length >= C.MAX_CRATES) return;
    if (Math.random() > C.CRATE_CHANCE) return;
    const type = pickCrateType();
    const x = 80 + Math.random() * (this.terrain.W - 160);
    let payload = null;
    if (type.id === 'weapon') {
      const drops = C.CRATE_WEAPON_DROPS;
      const total = drops.reduce((s, d) => s + d[2], 0);
      let r = Math.random() * total;
      for (const [wid, n, wt] of drops) { r -= wt; if (r <= 0) { payload = { wid, n }; break; } }
    }
    const crate = new Crate(this, x, type.id, payload);
    this.crates.push(crate);
    this.hud.message('📦 补给箱空投中…');
  }

  handleCrates(dt) {
    for (const c of this.crates) {
      if (!c.alive) continue;
      c.step(dt, this.terrain, this.windAccel());
      for (const w of this.worms) {
        if (!w.alive || w.isAI) continue; // AI 不主动捡箱子
        if (c.tryPickup(w)) this.pickupCrate(c, w);
      }
    }
    this.crates = this.crates.filter(c => c.alive);
  }

  pickupCrate(crate, worm) {
    sfx('pickup');
    this.particles.sparkle(crate.x, crate.y, crate.type.color, 12);
    if (this.matchStats && worm.team === 0) {
      this.matchStats.crates++;
      if (this.matchStats.crates >= 3) this.ach('crate_addict');
    }
    if (crate.kind === 'health') {
      worm.hp = Math.min(100, worm.hp + 25);
      this.popup(worm.x, worm.bodyY - 26, '+25', 0x6bd968);
    } else if (crate.kind === 'weapon' && crate.payload) {
      const { wid, n } = crate.payload;
      this.ammoPool[worm.team][wid] += n;
      this.hud.message(`🎁 ${worm.name} 获得 ${C.WEAPON_BY_ID[wid].name} ×${n}`);
    } else if (crate.kind === 'tool') {
      worm.jetFuel = 100;
      this.hud.message(`🔧 ${worm.name} 获得喷气背包（按住跳跃推进）`);
      this.touch?.setJetMode(true);
    }
    this.syncWeaponBar();
    this.hud.updateTeamPips(this.worms);
  }

  // ---------------- 浮动文字 ----------------
  popup(x, y, text, color) {
    const t = new PIXI.Text({
      text,
      style: { fontFamily: 'sans-serif', fontSize: 15, fontWeight: 'bold', fill: color, stroke: { color: 0x222233, width: 3 } },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.zIndex = 950;
    this.layers.world.addChild(t);
    this._popups = this._popups || [];
    this._popups.push({ t, life: 1.1, vy: -40 });
  }

  drawShotgunTracer(x1, y1, x2, y2) {
    const g = new PIXI.Graphics();
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2.5, color: 0xffe9a8, alpha: 0.9 });
    this.layers.world.addChild(g);
    this._popups = this._popups || [];
    this._popups.push({ t: g, life: 0.12, tracer: true });
  }

  // ---------------- 主更新 ----------------
  update(dt) {
    if (!this.running) return;
    this.time += dt;

    this.water.update(dt);
    this.sky.update(dt, this.camera.x);
    this.particles.update(dt);

    // 虫虫物理
    for (const w of this.worms) w.step(dt, this.terrain, this);
    // 投射物
    for (const p of this.projectiles) if (p.alive) p.step(dt, this.terrain, this.windAccel(), this.water.level);
    this.projectiles = this.projectiles.filter(p => p.alive);
    for (const pl of this.planes) pl.step(dt);
    this.planes = this.planes.filter(p => p.alive);
    this.handleCrates(dt);

    // 浮动文字/弹道闪光
    if (this._popups) {
      for (const p of this._popups) {
        p.life -= dt;
        if (!p.tracer) { p.t.y += p.vy * dt; p.t.alpha = Math.min(1, p.life * 2); p.t.scale.set(1 + (1.1 - p.life) * 0.3); }
      }
      this._popups = this._popups.filter(p => {
        if (p.life <= 0) { p.t.destroy(); return false; }
        return true;
      });
    }

    this._updateState(dt);
    this._updateAimUI();
    this._updateCamera();
    // 视图同步
    for (const w of this.worms) w.updateView(this.time);
  }

  _updateState(dt) {
    const cur = this.currentWorm;
    switch (this.state) {
      case 'turnStart': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'active';
          if (cur.isAI || this.debugAuto) this.brain = new AIBrain(this, cur);
          this.updateInputMode();
          this.syncWeaponBar();
        }
        break;
      }
      case 'active': {
        // 当前虫虫（操作中）阵亡 → 立即结束回合，杜绝死虫射击
        if (cur && !cur.alive) {
          this.hud.message(`💀 ${cur.name} 已阵亡，回合结束`);
          this._endTurnCommon();
          break;
        }
        if (cur.isAI || this.debugAuto) {
          let done = false;
          try {
            done = this.brain?.update(dt * (this.aiFast ? 4 : 1)) ?? false;
          } catch (e) {
            console.error('[AI]', e);
            this.hud.message(`🤖 ${cur.name} 犯了迷糊（AI 异常已兜底）`);
            this._endTurnCommon();
            return;
          }
          if (done) this.brain = null;
        } else {
          this._humanControl(dt);
        }
        // 回合计时
        this.turnTimer -= dt;
        const secs = Math.ceil(this.turnTimer);
        if (secs <= 5 && secs !== this._lastTick) { this._lastTick = secs; sfx('tick'); }
        this.hud.setTimer(Math.max(0, this.turnTimer), this.turnTimer < 10);
        if (this.turnTimer <= 0) {
          this.hud.message(`${cur.name} 超时了！`);
          this._endTurnCommon();
        }
        break;
      }
      case 'projectile': {
        // 看门狗：弹道阶段异常卡死（>10s）强制推进
        this._projT = (this._projT || 0) + dt;
        if (this._projT > 10) {
          this.hud.message('⏱ 弹道异常，强制结束回合');
          this.state = 'postturnWait';
          this.stateTimer = 0.1;
          break;
        }
        if (this.retreatLeft > 0 && !cur.isAI) {
          this.retreatLeft -= dt;
          this._humanMoveOnly();
          if (Math.ceil(this.retreatLeft) !== this._lastRetreat) {
            this._lastRetreat = Math.ceil(this.retreatLeft);
            this.hud.setControlsHint(this._lastRetreat > 0 ? `撤退！${this._lastRetreat}s` : '');
          }
          if (this.retreatLeft <= 0) { this.hud.setControlsHint(''); this.touch?.setControlsEnabled(false); }
        }
        const busy = this.projectiles.length > 0 || this.planes.length > 0;
        const settled = this.worms.every(w => !w.alive || w.onGround || w.y > this.water.level);
        // 撤退时间必须给满：即使弹丸已落地，也要等玩家用完 5 秒撤退窗口
        if (!busy && settled && this.retreatLeft <= 0) {
          this.state = 'postturnWait';
          this.stateTimer = 0.45;
        }
        break;
      }
      case 'postturnWait': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this._postTurn();
        break;
      }
    }
  }

  _humanControl(dt) {
    const cur = this.currentWorm;
    // 移动
    cur.walkDir = this.input.moveDir();
    if (cur.walkDir !== 0) cur.facing = cur.walkDir;
    // 跳跃 / 喷气
    if (cur.jetFuel > 0) {
      cur.wantJet = this.input.jumpHeld();
      cur.wantJump = false; // 喷气时不能跳
    } else {
      cur.wantJet = false;
      if (this._jumpEdge) { cur.wantJump = true; this._jumpEdge = false; }
    }
    // 蓄力：hold 模式力度条来回摆动（0→1→0，1.6s 单程）；drag 模式由鼠标距离决定
    if (this.charging) {
      if (this._chargeStyle !== 'drag') {
        const t = (this.time - this._chargeStart) % 3.2;
        this.chargePower = t < 1.6 ? t / 1.6 : (3.2 - t) / 1.6;
      }
      this.hud.powerUpdate(this.chargePower, cur.aimAngle);
    }
  }

  _humanMoveOnly() {
    const cur = this.currentWorm;
    cur.walkDir = this.input.moveDir();
    if (cur.walkDir !== 0) cur.facing = cur.walkDir;
    if (this._jumpEdge) { cur.wantJump = true; this._jumpEdge = false; }
    if (cur.jetFuel > 0) cur.wantJet = this.input.jumpHeld();
  }

  _postTurn() {
    if (this.matchOver) return;
    this._projT = 0;
    this.maybeSpawnCrate();
    // 挑战：生存判定
    if (this.surviveTurnsLeft != null) {
      this.surviveTurnsLeft--;
      if (this.surviveTurnsLeft <= 0 && this.teamAlive(0)) { this.endMatch(1, '生存成功！'); return; }
      if (!this.teamAlive(0)) { this.endMatch(-1, '全员阵亡'); return; }
    } else {
      this._checkWin();
      if (this.matchOver) return;
    }
    for (const w of this.worms) w.showArrow(false);
    this.nextTurn();
  }

  _checkWin() {
    if (this.matchOver) return;
    const p = this.teamAlive(0), e = this.teamAlive(1);
    if (!p && !e) this.endMatch(0, '同归于尽…');
    else if (!e) this.endMatch(1, this.challenge ? (this.challenge.tutorial ? '教学完成！' : '挑战完成！') : '玩家队获胜！');
    else if (!p) this.endMatch(-1, '虫虫军团获胜…');
  }

  endMatch(result, subtitle) {
    this.matchOver = true;
    this.running = false;
    this.input.mode = 'idle';
    this.touch?.setControlsEnabled(false);
    // 停止所有移动意图，防止结算后虫虫继续走
    for (const w of this.worms) {
      w.showArrow(false);
      w.walkDir = 0; w.wantJump = false; w.wantJet = false; w.dashT = 0;
    }
    setMusicMode('menu');
    if (result === 1) { sfx('win'); this.particles.confetti(this.camera.x, this.camera.y - 100); }
    else if (result === -1) sfx('lose');
    const isTutorial = !!this.challenge?.tutorial;
    if (!isTutorial) recordMatch(result);
    // 成就结算（教学关不计入）
    if (result === 1 && !isTutorial) {
      this.ach('first_win');
      if (this.matchStats && this.matchStats.dmgTaken === 0) this.ach('flawless');
      if (this._playerBerserk) this.ach('berserk_win');
    }
    if (isTutorial) {
      if (result === 1) {
        completeTutorial(this.challenge.id);
        this.hud.banner('🎓 教学完成！', '去主菜单试试下一课或挑战关卡');
        this.hud.message('🎓 本课已记录，可在教学列表查看完成状态');
      }
      this.hud.showGameover(result, subtitle, { stats: this.matchStats });
    } else if (this.challenge && result === 1) {
      const turns = Math.ceil(this.turnCount / 2);
      const hpLeft = this.teamWorms(0).reduce((s, w) => s + Math.max(0, w.hp), 0);
      const rank = turns <= this.challenge.rankS && hpLeft >= this.challenge.rankSHp ? 'S'
        : turns <= this.challenge.rankA ? 'A' : 'B';
      setChallengeRank(this.challenge.id, rank);
      this.hud.showGameover(result, subtitle, { rank, turns, hpLeft, stats: this.matchStats });
    } else {
      this.hud.showGameover(result, subtitle, { stats: this.matchStats });
    }
  }

  // ---------------- 玩家输入回调（由 main 注入） ----------------
  onAimDrag(dx, dy) {
    if (this.state !== 'active' || this.currentWorm?.isAI) return;
    if (!this.currentWorm?.alive) return;
    // 空袭/奶牛：触屏一按即进入目标标记模式
    if (C.WEAPON_BY_ID[this.selectedWeapon]?.targeting) {
      if (!this.targetingWeapon) this.enterTargeting(this.selectedWeapon);
      return;
    }
    // 弹弓：拖拽反向即发射方向
    const angle = Math.atan2(dy, -dx) * 180 / Math.PI;
    const power = Math.min(1, Math.hypot(dx, dy) / 230);
    this.slingshot = { angle: (angle + 360) % 360, power };
    this.currentWorm.aimAngle = (angle + 360) % 360;
    this.currentWorm.facing = Math.cos(angle * Math.PI / 180) >= 0 ? 1 : -1;
  }

  onAimRelease(dx, dy) {
    if (this.state !== 'active' || this.currentWorm?.isAI || !this.slingshot) return;
    const { angle, power } = this.slingshot;
    this.slingshot = null;
    if (power < 0.06) { this.hud.powerHide(); return; }
    this.fireWeapon(this.currentWorm, this.selectedWeapon, angle, power);
  }

  onAimCancel() {
    this.slingshot = null;
    this.charging = false;
    this.chargePower = 0;
    this._powerOffset = 0;
    this.hud.powerHide();
  }

  onAimMove(wx, wy) {
    if (this.currentWorm?.isAI) return;
    const cur = this.currentWorm;
    if (this.targetingWeapon) {
      this._targetMark = { x: wx, y: wy };
      return;
    }
    if (this.state !== 'active' || !cur) return;
    // 鼠标绝对瞄准
    const angle = Math.atan2(-(wy - (cur.bodyY - 6)), wx - cur.x) * 180 / Math.PI;
    cur.aimAngle = (angle + 360) % 360;
    cur.facing = Math.cos(angle * Math.PI / 180) >= 0 ? 1 : -1;
    // 拖拽力度：移动即重算
    this._lastCursor = { x: wx, y: wy };
    if (this.charging && this._chargeStyle === 'drag') {
      this.chargePower = this._computeDragPower(wx, wy);
      this.hud.powerUpdate(this.chargePower, cur.aimAngle);
    }
  }

  // 桌面力度模式：'drag' 拖拽距离（鼠标离虫虫越远力度越大，无限时间微调）
  //               'hold' 经典按住蓄力（力度条来回摆动，永不粘顶）
  _powerMode() { return this.settings.powerMode || 'drag'; }

  // 鼠标距虫虫的屏幕距离 → 力度（520 屏幕像素 = 满力）
  _computeDragPower(wx, wy) {
    const cur = this.currentWorm;
    if (!cur) return this.chargePower;
    const s = this.camera.worldToScreen(cur.x, cur.bodyY - 6);
    const p = this.camera.worldToScreen(wx, wy);
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    const base = Math.min(1, Math.max(0.05, d / 520));
    return Math.min(1, Math.max(0.05, base + (this._powerOffset || 0)));
  }

  onChargeStart(wx, wy) {
    if (this.state !== 'active' || this.currentWorm?.isAI) return;
    if (!this.currentWorm?.alive) return;
    if (C.WEAPON_BY_ID[this.selectedWeapon]?.targeting) {
      // 空袭/奶牛：按下左键直接进入目标标记模式（再点击地图确认）
      if (!this.targetingWeapon) this.enterTargeting(this.selectedWeapon);
      return;
    }
    this.charging = true;
    this._chargeStart = this.time;
    this._powerOffset = 0;
    // drag：鼠标带坐标 → 拖拽距离决定力度；hold：触屏开火键/经典模式 → 摆动
    this._chargeStyle = (this._powerMode() === 'drag' && wx !== undefined) ? 'drag' : 'hold';
    if (this._chargeStyle === 'drag') {
      this.chargePower = this._computeDragPower(wx, wy);
      this.hud.powerUpdate(this.chargePower, this.currentWorm.aimAngle);
    } else {
      this.chargePower = 0.05;
    }
  }

  onChargeEnd() {
    if (!this.charging) return;
    const held = this.time - this._chargeStart;
    const power = this.chargePower;
    this.charging = false;
    this._powerOffset = 0;
    this.chargePower = 0;
    this.hud.powerHide();
    // 误触保护：极短点击不发射
    if (held < 0.12) return;
    if (power < 0.06) return;
    if (this.state === 'active' && !this.currentWorm?.isAI) {
      this.fireWeapon(this.currentWorm, this.selectedWeapon, this.currentWorm.aimAngle, power);
    }
  }

  onTarget(wx, wy) {
    if (this.targetingWeapon && !this.currentWorm?.isAI) this.confirmTarget(wx, wy);
  }

  onJumpPress() {
    this._jumpEdge = true;
  }

  onZoom(mx, my, delta) {
    // 拖拽力度模式下，瞄准中滚轮 = 力度微调（每次 ±2%）
    if (this.charging && this._chargeStyle === 'drag' && this.state === 'active' && !this.currentWorm?.isAI) {
      this._powerOffset = (this._powerOffset || 0) + (delta < 0 ? 0.02 : -0.02);
      this._powerOffset = Math.max(-1, Math.min(1, this._powerOffset));
      if (this._lastCursor) this.chargePower = this._computeDragPower(this._lastCursor.x, this._lastCursor.y);
      this.hud.powerUpdate(this.chargePower, this.currentWorm.aimAngle);
      return;
    }
    const w = this.camera.screenToWorld(mx, my);
    this.camera.setZoom(this.camera.tzoom * (delta < 0 ? 1.13 : 1 / 1.13), w.x, w.y);
  }

  onPan(dx, dy) {
    if (this.state === 'active' && this.settings.aimMode === 'slingshot' && !this.currentWorm?.isAI) return;
    this.camera.pan(dx, dy);
  }

  showAICharge(worm, power) {
    this.hud.powerUpdate(power, worm.aimAngle);
    this.camera.follow(worm.x, worm.y - 60);
  }

  hideAICharge() { this.hud.powerHide(); }

  // ---------------- 瞄准 UI（弹道预览/目标标记/弹弓） ----------------
  _updateAimUI() {
    const g = this.aimUI;
    const cur = this.currentWorm;
    // 增量重绘：状态未变化时跳过 clear+重建（固定步长下每帧最多重建 6 次，是 CPU 热点）
    const key = [
      this.state,
      cur?.id ?? -1,
      cur?.alive ? 1 : 0,
      cur?.isAI ? 1 : 0,
      Math.round(cur?.aimAngle ?? 0),
      this.charging ? Math.round(this.chargePower * 100) : -1,
      this.slingshot ? `${Math.round(this.slingshot.angle)}_${Math.round(this.slingshot.power * 100)}` : '-',
      this.targetingWeapon || '-',
      this._targetMark ? `${Math.round(this._targetMark.x)}_${Math.round(this._targetMark.y)}` : '-',
    ].join('|');
    if (key === this._aimKey) return;
    this._aimKey = key;
    g.clear();
    if (!cur || !cur.alive || cur.isAI) { this._drawTargetMark(g); return; }

    const w = C.WEAPON_BY_ID[this.selectedWeapon];
    const canPreview = this.settings.trajectory && w && !w.targeting && !w.hitscan && this.state === 'active';

    // 弹弓状态
    if (this.slingshot) {
      const m = { x: cur.x, y: cur.bodyY - 6 };
      const v = { x: Math.cos(this.slingshot.angle * Math.PI / 180), y: -Math.sin(this.slingshot.angle * Math.PI / 180) };
      // 拉弓线
      g.moveTo(m.x, m.y).lineTo(m.x - v.x * 40, m.y - v.y * 40).stroke({ width: 3, color: 0xffffff, alpha: 0.5, cap: 'round' });
      if (canPreview) this._drawTrajectory(g, cur, w);
      this.hud.powerUpdate(this.slingshot.power, cur.aimAngle);
    } else if (this.charging && canPreview) {
      this._drawTrajectory(g, cur, w);
    } else if (this.state === 'active') {
      // 常显瞄准方向短线（触屏也有，避免「不知道可以瞄准」）
      const a = cur.aimAngle * Math.PI / 180;
      const m = { x: cur.x, y: cur.bodyY - 6 };
      const lw = 3 / Math.max(0.5, this.camera.zoom);
      g.moveTo(m.x + Math.cos(a) * 20, m.y - Math.sin(a) * 20)
        .lineTo(m.x + Math.cos(a) * 34, m.y - Math.sin(a) * 34)
        .stroke({ width: lw, color: 0xffffff, alpha: 0.75, cap: 'round' });
    }
    this._drawTargetMark(g);
  }

  _drawTrajectory(g, cur, w) {
    const m = { x: cur.x, y: cur.bodyY - 6 };
    const angle = this.slingshot ? this.slingshot.angle : cur.aimAngle;
    const power = this.slingshot ? this.slingshot.power : this.chargePower;
    if (power < 0.03) return;
    // 缓存模拟结果：仅在角度/力度跨步变化时重新积分
    const key = `${w.id}|${Math.round(angle * 2)}|${Math.round(power * 60)}`;
    if (key !== this._trajKey || !this._trajM || Math.abs(this._trajM.x - m.x) > 2 || Math.abs(this._trajM.y - m.y) > 2) {
      this._trajKey = key;
      this._trajM = { x: m.x, y: m.y };
      const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power;
      const a = angle * Math.PI / 180;
      this._trajPts = simulateTrajectory(this.terrain, m.x + Math.cos(a) * 10, m.y - Math.sin(a) * 10,
        Math.cos(a) * speed, -Math.sin(a) * speed, w, this.windAccel(), this.water.level, 34);
    }
    const pts = this._trajPts || [];
    // 按摄像机缩放补偿点径，手机小屏也看得清
    const dotScale = Math.min(2.2, 1.4 / Math.max(0.45, this.camera.zoom));
    for (let i = 0; i < pts.length; i++) {
      const t = i / pts.length;
      g.circle(pts[i].x, pts[i].y, (2.6 - t * 1.4) * dotScale).fill({ color: 0xffffff, alpha: 0.8 - t * 0.5 });
    }
  }

  _drawTargetMark(g) {
    if (!this.targetingWeapon || !this._targetMark) return;
    const { x, y } = this._targetMark;
    g.circle(x, y, 14).stroke({ width: 2.5, color: 0xff5a5a });
    g.moveTo(x - 22, y).lineTo(x - 8, y).moveTo(x + 8, y).lineTo(x + 22, y).stroke({ width: 2.5, color: 0xff5a5a });
    g.moveTo(x, y - 22).lineTo(x, y - 8).moveTo(x, y + 8).lineTo(x, y + 22).stroke({ width: 2.5, color: 0xff5a5a });
  }

  _updateCamera() {
    // 跟随目标：弹道 > 运输机 > 移动中的当前虫虫
    // 弹丸飞出世界外（打上天/出界）时不再跟，避免镜头被拖到空白区域
    const p = this.projectiles[0];
    const cur = this.currentWorm;
    const pInView = p && p.x > -150 && p.x < this.terrain.W + 150 && p.y > -260 && p.y < this.terrain.H + 160;
    if (pInView) this.camera.follow(p.x, p.y);
    else if (this.planes[0]) this.camera.follow(this.planes[0].x, this.planes[0].y);
    else if (cur && this.state !== 'active') this.camera.follow(cur.x, cur.y - 60);
    else if (cur && this.state === 'active' && (cur.isAI || cur.walkDir !== 0 || !cur.onGround)) {
      this.camera.follow(cur.x, cur.y - 60);
    }
    this.camera.update(1 / 60);
  }
}
