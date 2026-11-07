// ============ 对局主控：回合流转 / 物理 / 伤害 / 目标 / 胜负 ============
import { Terrain } from '../world/terrain.js';
import { mulberry32 } from '../world/terrain.js';
import { Water } from '../world/water.js';
import { Sky } from '../world/sky.js';
import { Worm } from '../entities/worm.js';
import { Crate, pickCrateType } from '../entities/crate.js';
import { OilDrum } from '../entities/drum.js';
import { Particles } from '../entities/particles.js';
import { explosionEffects } from '../entities/projectile.js';
import { fireWeapon, simulateTrajectory, spawnBomblets, spawnAirstrikeBomb, muzzlePos, MIN_SPEED, MAX_SPEED } from '../weapons/index.js';
import { AIBrain } from '../ai/brain.js';
import { TutorialDirector } from './tutorial.js';
import { TUTORIAL_SCENES } from '../levels/tutorialScenes.js';
import * as C from '../config.js';
import * as PIXI from 'pixi.js';
import { recordMatch, recordWeaponDamage, recordLongestShot, setChallengeRank, unlockAchievement, completeTutorial } from './save.js';
import { sfx, setMusicMode, setMusicTheme } from './audio.js';

export class Game {
  constructor(env) {
    // env: {app, layers, camera, hud, menus, touch, settings, mobile}
    Object.assign(this, env);
    this.time = 0;
    this.running = false;
    this.paused = false;
    this.debugAuto = false;
    this.aiFast = false;
    this.timeScale = 1;           // 击杀慢镜头：main.js 累积器乘它，固定步长本身不变
    this._slowT = 0;
    this.lastShotTrail = null;    // 上一发弹道采样点（ghost 预览）
    this.lastShotV = 0;           // ghost 版本号（触发 aimUI 重绘）
    this._ambientT = 0;           // 主题环境粒子节流
    this._gustT = 0;              // 沙漠阵风节流
    this._gustTarget = 0;
    this._windShown = 0;          // 阵风 HUD 节流的「上次显示值」基准
    this.tutLock = false;
    this.tutorial = null;
    if (this.camera && this.settings) this.camera.enabled = this.settings.shake !== false;

    // 瞄准 UI 层
    this.aimUI = new PIXI.Graphics();
    this.aimUI.zIndex = 900;
    this.layers.world.addChild(this.aimUI);
  }

  // ---------------- 开局 ----------------
  startMatch(cfg) {
    this.matchConfig = cfg;
    this.challenge = cfg.challenge || null;
    const lv = this.challenge;
    const stage = lv?.stages ? (lv.stages[cfg.tutStage ?? 0] || lv.stages[0]) : null;
    this.stage = stage;
    this.tutorialLevel = (lv?.tutorial || lv?.practice) ? lv : null;
    this.practice = !!(lv?.practice || cfg.practice);
    this.tutorialLike = !!(this.tutorialLevel || this.practice);
    this.respawnEnabled = !!(stage?.respawn ?? cfg.respawn);
    this.noCrates = !!(stage?.noCrates ?? lv?.noCrates);
    this.noSuddenDeath = !!(stage?.noSuddenDeath ?? lv?.noSuddenDeath);
    this.tutorial = null;
    this.tutLock = false;
    if (!this.tutorialLike) this.hud?.hideTutorial();
    // 清理旧场景并释放 GPU 纹理（保留复用的 aimUI 与粒子池）
    for (const c of [...this.layers.world.children]) {
      if (c === this.aimUI) continue;
      // 粒子层使用模块级共享圆点纹理；整个池跨局复用，不能销毁
      if (this.particles && c === this.particles.layer) continue;
      c.destroy({ children: true, texture: true, textureSource: true });
    }
    this.layers.world.removeChildren();
    // aimUI 跨局复用：清掉上一局残留的弹道/标记并强制重绘
    this.aimUI.clear();
    this._aimKey = null;
    this._trajKey = null;
    this._trajPts = null;
    this._trajM = null;
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
    this._portraitHintShown = false;
    this.dashLeft = 1;
    this.dashMax = 1;
    this._playerBerserk = false;
    this._projT = 0;
    this._lastRetreat = null;
    this._lastTick = null;
    this.brain = null;
    this.hud?.powerHide();
    // 本局数据统计（结算面板展示）
    this.matchStats = { shots: 0, hits: 0, dmgDealt: 0, dmgTaken: 0, kills: 0, longest: 0, crates: 0 };
    this._shotHitCounted = false;
    this.timeScale = 1; this._slowT = 0;
    this.lastShotTrail = null; this.lastShotV = 0;
    this._ambientT = 0; this._gustT = 0; this._gustTarget = 0;
    this._windShown = 0;
    this.aiFast = !!this.settings.aiFast;

    this.terrain = new Terrain(cfg.worldW || C.WORLD_W, C.WORLD_H);
    this.terrain.attach(this.layers.world);
    const sceneFn = cfg.scene ? TUTORIAL_SCENES[cfg.scene] : null;
    this.terrain.generate(cfg.theme, cfg.seed, sceneFn);
    // 地图尺寸可随「大/中/小」变化，相机边界与水面宽度都要跟随
    this.camera.setWorldSize(this.terrain.W, this.terrain.H);
    // 主题天空渐变应用到页面背景（canvas 透明）
    const sky = C.THEMES[cfg.theme]?.sky;
    if (sky) document.body.style.background = `linear-gradient(180deg, ${sky.join(', ')})`;

    this.water = new Water(cfg.theme, this.terrain.W, this.terrain.H);
    this.water.setLevel(stage?.waterY ?? lv?.waterY ?? cfg.waterY ?? this.terrain.waterY);
    this.layers.world.addChild(this.water.view);

    this.sky = new Sky(cfg.theme, this.mobile);
    this.layers.sky.addChild(this.sky.container);

    this.particles = this.particles || new Particles(this.mobile);
    this.particles.clear();
    this.layers.world.addChild(this.particles.layer);

    // 实体层（虫虫/投射物/补给箱）
    this.layers.ents = new PIXI.Container();
    this.layers.ents.zIndex = 100;
    this.layers.world.addChild(this.layers.ents);

    this.layers.world.addChild(this.aimUI);

    // 虫虫
    this.worms = [];
    this.wormHomes = new Map();
    let id = 0;
    const mk = (spec, team) => {
      const w = new Worm({
        id: id++, team, x: spec.x, y: 0,
        name: spec.name, color: spec.color, hat: spec.hat,
        isAI: team === 1 || !!spec.isAI, hp: spec.hp ?? 100,
      });
      const gy = spec.y ?? this.terrain.findSurfaceY(spec.x | 0, 0) ?? 600;
      w.y = gy;
      this.worms.push(w);
      this.wormHomes.set(w, { x: w.x, y: w.y, hp: w.hp });
      this.layers.ents.addChild(w.view);
    };
    for (const s of cfg.playerWorms || []) mk(s, 0);
    for (const s of cfg.enemyWorms || []) mk(s, 1);
    this._pipsDirty = true;

    // 弹药池
    this.ammoPool = [this._makeAmmo(cfg.ammoPlayer), this._makeAmmo(cfg.ammoEnemy)];

    this.projectiles = [];
    this.planes = [];
    this.crates = [];
    this.drums = [];
    // 油桶要在 worms/drums 都就绪后放置（同种子同桶位）
    this.spawnDrums();
    this.respawnQueue = [];
    this._teamCursor = [0, 0];
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
    this.surviveTurnsLeft = stage?.surviveTurns ?? this.challenge?.surviveTurns ?? null;
    this.brain = null;
    this.state = 'turnStart';
    this.stateTimer = 0;

    // 基础缩放：横屏按宽度，竖屏适度拉远（同时允许双指继续缩放）
    const baseZoom = this.camera.defaultZoom();
    this.camera.zoom = baseZoom;
    this.camera.tzoom = baseZoom;
    setMusicMode('battle');
    setMusicTheme(cfg.theme);
    this.nextTurn(true);
    if (this.tutorialLevel) {
      this.tutorial = new TutorialDirector(this, this.tutorialLevel, cfg.tutStage ?? 0);
      this.tutorial.start();
      if (this.practice) {
        this.hud.banner('🎯 练习靶场', '无限弹药 · 靶子会复活 · 永远是你的回合');
      } else {
        this.hud.banner(
          stage?.bannerTitle || this.tutorialLevel.name,
          stage?.bannerSub || '跟着右侧的提示一步步来'
        );
      }
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
    this.round = this.tutorialLike ? 1 : Math.floor((this.turnCount - 1) / 2) + 1;
    const team = this.tutorialLike ? 0 : (this.turnCount - 1) % 2;

    // 突死（教学/练习关不会触发）
    const sdRound = this.stage?.suddenDeathRound ?? this.challenge?.suddenDeathRound ?? C.SUDDEN_DEATH_ROUND;
    if (!this.tutorialLike && !this.suddenDeath && this.round >= sdRound && !this.noSuddenDeath) {
      this.suddenDeath = true;
      for (const w of this.worms) if (w.alive) w.hp = C.SUDDEN_DEATH_HP;
      this._pipsDirty = true;
      this.hud.banner('☠️ 突死模式！', `水位上涨 · 全员 ${C.SUDDEN_DEATH_HP} HP`);
      sfx('lose');
    }
    if (this.suddenDeath) this.water.rise(C.WATER_RISE * (this.terrain.theme?.waterRiseMult ?? 1));

    // 教学/练习兜底：玩家虫虫万一倒下，直接原地扶起，避免无虫可操作
    if (this.tutorialLike && !this.teamAlive(0)) {
      for (const w of this.worms) {
        if (w.team !== 0 || w.alive) continue;
        const home = this.wormHomes.get(w);
        if (home) this.reviveWorm(w, home);
      }
    }

    // 依次选取该队下一只存活虫虫
    const teamWormsAll = this.teamWorms(team);
    if (!this._teamCursor) this._teamCursor = [0, 0];
    let tries = 0, cur = null;
    while (teamWormsAll.length && tries++ < teamWormsAll.length + 1) {
      const idx = this._teamCursor[team] % teamWormsAll.length;
      this._teamCursor[team]++;
      if (teamWormsAll[idx].alive) { cur = teamWormsAll[idx]; break; }
    }
    if (!cur) { this._checkWin(); return; }

    this.currentWorm = cur;
    this.wind = (this.tutorialLike || this.challenge?.noWind) ? 0 : (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6);
    this._gustTarget = this.wind; this._gustT = 0;
    this._windShown = this.wind; // 阵风 HUD 节流的「上次显示值」基准
    // 选武器：普通/挑战默认火箭弹（没弹药时自动选第一件可用武器）；
    // 教学/练习保留玩家上次选择。避免选中 0 弹药武器后还能开火。
    const pool = this.ammoPool[cur.team];
    if (!this.tutorialLike) {
      this.selectedWeapon = (pool.bazooka > 0) ? 'bazooka' : null;
    }
    if (!this.selectedWeapon || !(pool[this.selectedWeapon] > 0)) {
      const avail = C.WEAPONS.find((w) => !w.hidden && pool[w.id] > 0);
      this.selectedWeapon = avail ? avail.id : 'bazooka';
    }
    this.shotsLeft = C.WEAPON_BY_ID[this.selectedWeapon]?.shots || 0;
    this._shotgunUsedThisTurn = 0;
    this._powerOffset = 0;
    this._jumpEdge = false;
    this.chargePower = 0;
    this.charging = false;
    // 背水一战：全队只剩自己时移速+15%、冲刺+1（对 AI 同样生效）
    const teamSize = this.teamWorms(cur.team).length;
    const aliveCount = this.teamWorms(cur.team).filter(w => w.alive).length;
    cur.berserk = teamSize > 1 && aliveCount === 1;
    this.dashMax = cur.berserk ? 2 : 1;
    this.dashLeft = this.dashMax;
    this.hud.setDash(cur.isAI ? null : this.dashLeft, this.dashMax);
    if (cur.berserk && !cur._berserkMsg) {
      cur._berserkMsg = true;
      this.hud.message(`🔥 ${cur.name} 背水一战！移速 +15% · 冲刺 ×2`);
      if (cur.team === 0) this._playerBerserk = true;
    }
    // 清理上一回合残留的移动意图：否则「回合结束瞬间按住方向」会让旧虫一直走
    for (const w of this.worms) {
      w.walkDir = 0; w.wantJump = false; w.wantJet = false; w.dashT = 0;
    }
    this.stateTimer = first ? (this.tutorialLike ? 0.6 : 1.0) : (this.tutorialLike ? 0.45 : C.BANNER_TIME);
    this.state = 'turnStart';
    this.turnTimer = this.tutorialLike ? Infinity : (this.stage?.turnTime ?? this.challenge?.turnTime ?? C.TURN_TIME);
    this.retreatLeft = 0;

    cur.showArrow(true);
    this.frameTurnCamera(cur);
    this.hud.setControlsHint('');
    if (!cur.isAI) sfx('voice', { pitch: 1.1 });
    // 首回合操作提示（教学关有自己的持久提示面板，不重复）
    if (!cur.isAI && !this._aimHintShown && !this.tutorialLike) {
      this._aimHintShown = true;
      if (this.mobile && this.isPortrait()) {
        this._portraitHintShown = true;
        this.hud.message('📱 竖屏：单指拖动平移，双指张合缩放');
      }
      if (this.mobile) {
        this.hud.message('📱 右摇杆：方向＝发射方向，行程＝力度，松手发射');
        this.hud.message('左摇杆行走 · ⤒ 跳跃 · 💨 冲刺 · 拖到「取消蓄力」取消');
      } else {
        this.hud.message('🖱 按住左键：鼠标离虫虫越远力度越大，松手发射');
        this.hud.message('滚轮微调力度 · Esc/右键取消瞄准 · 双击方向冲刺');
      }
    }

    if (!this.tutorialLike) {
      this.hud.banner(
        this.challenge ? '挑战进行中' : `第 ${this.round} 回合`,
        `${cur.name} ${cur.isAI ? '（AI）' : ''} 的回合`
      );
    }
    this.hud.setWind(this.wind);
    this.hud.setRound(this.round, this.suddenDeath,
      this.practice ? '练习' : this.tutorialLevel ? '教学' : null);
    this.hud.setTimer(this.turnTimer, false);
    this.syncWeaponBar();
    this.hud.setFuel(cur.jetFuel);
    this.touch?.setJetMode(cur.jetFuel > 0);
    this.updateInputMode();
  }

  // 当前操作者的输入模式
  updateInputMode() {
    const human = !this.currentWorm?.isAI && !this.tutLock;
    const retreat = this.state === 'projectile' && this.retreatLeft > 0;
    if (human && this.targetingWeapon) this.input.mode = 'target';
    else if (human && (this.state === 'active' || retreat)) this.input.mode = 'aim';
    else this.input.mode = 'idle';
    this.touch?.resetStick();
    this.touch?.setControlsEnabled(human && (this.state === 'active' || retreat));
    // AI 回合显示「⏩ 加速」按钮
    this.hud?.setAIFast?.(!!(this.currentWorm?.isAI || this.debugAuto), !!this.aiFast);
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
    // 散弹枪连射中锁定武器：第一发打完必须先把这一组子弹打完
    if (this._shotgunUsedThisTurn > 0 && this.shotsLeft > 0) {
      if (id !== this.selectedWeapon) this.hud.message('🔫 散弹枪连射中，打完这一组再换武器');
      return;
    }
    const w = this.weaponById(id);
    if (!w || this.ammoPool[this.currentWorm.team][id] <= 0) return;
    this.selectedWeapon = id;
    // 散弹枪每回合 2 发：反复点同一武器不能刷新剩余弹数
    const used = id === 'shotgun' ? (this._shotgunUsedThisTurn || 0) : 0;
    this.shotsLeft = Math.max(0, (w.shots || 0) - used);
    this.cancelTargeting();
    sfx('click');
    this.syncWeaponBar();
    this.tutEvent('weapon', { id });
  }

  consumeAmmo(worm, weaponId) {
    const pool = this.ammoPool[worm.team];
    if (Number.isFinite(pool[weaponId]) && pool[weaponId] > 0) pool[weaponId]--;
    this.syncWeaponBar();
  }

  // ---------------- 开火 ----------------
  fireWeapon(worm, weaponId, angle, power, targetX, opts) {
    if (!worm || !worm.alive) return false; // 死亡虫虫不能射击
    const pool = this.ammoPool?.[worm.team];
    // 散弹枪两发一组只扣 1 发弹药：第二发时池子可能已归零，仍要允许打完
    const midBurst = weaponId === 'shotgun' && this._shotgunUsedThisTurn > 0 && this.shotsLeft > 0;
    if (pool && !(pool[weaponId] > 0) && !midBurst) return false; // 0 弹药不能开火（挑战关约束）
    // 新的一次开火：先清空命中标记，散弹枪这种同步结算的武器也能正确计数
    if (worm.team === 0 && this.matchStats) this._shotHitCounted = false;
    const entered = fireWeapon(this, worm, weaponId, angle, power, targetX, opts);
    if (!entered) {
      if (worm.team === 0 && this.matchStats) this.matchStats.shots++;
      if (worm.team === 0) this.tutEvent?.('shot', { weaponId, worm, angle, power });
    }
    return entered;
  }

  // 教学导演事件（未开始时静默）
  tutEvent(name, data) {
    if (this.tutorial && this.running) this.tutorial.event(name, data);
  }

  // 触屏冲刺按钮：沿当前移动方向（没在走则沿面向）冲刺
  onDashBtn() {
    const cur = this.currentWorm;
    if (!cur || cur.isAI) return;
    const dir = this.input.moveDir() || cur.facing || 1;
    this.tryDash(dir);
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
    this.hud.setDash(this.dashLeft, this.dashMax || 1);
    this.sfx('boing');
    this.hud.message('💨 冲刺！');
    this.tutEvent('dash', { dir });
  }

  // ↑/↓ 键盘微调瞄准角（Shift 细调 0.25°）；蓄力中同步力度条角度
  nudgeAim(dir, fine) {
    if (this.tutLock || this.state !== 'active' || this.currentWorm?.isAI) return;
    const cur = this.currentWorm;
    if (!cur?.alive) return;
    let a = cur.aimAngle + (fine ? 0.25 : 1) * dir;
    if (a > 180) a = 180;
    if (a < 0) a = 0;
    cur.aimAngle = a;
    if (this.charging) this.hud.powerUpdate(this.chargePower, cur.aimAngle);
  }

  // 击杀慢镜头：gt 为游戏秒（timeScale=0.3 时真实时长 ≈ gt/0.3）
  slowMo(gt) {
    if (this.mobile) gt *= 0.7; // 手机上慢镜头更短，避免拖节奏
    this.timeScale = 0.3;
    this._slowT = Math.max(this._slowT, gt);
  }

  // 成就解锁（去重，金色提示；教学/练习不计）
  ach(id) {
    if (this.tutorialLike) return;
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
    this._shotgunUsedThisTurn = (this._shotgunUsedThisTurn || 0) + 1;
    this.shotsLeft = Math.max(0, this.shotsLeft - 1);
    // 两发一组的弹药在第一次射击时已经扣过，第二发不因池子归零而中断
    if (opts?.aiSingle || this.shotsLeft <= 0) {
      this.shotsLeft = 0;
      this.afterFire(worm, false);
    } else {
      this.hud.message(`🔫 还可发射 ${this.shotsLeft} 发`);
    }
  }

  enterTargeting(weaponId) {
    this.targetingWeapon = weaponId;
    this._targetMark = null;
    this.updateInputMode();
    const hint = weaponId === 'airstrike' ? '📍 点击地图标记空袭点'
      : weaponId === 'cow' ? '📍 点击地图标记奶牛落点'
      : '📍 点击地图选择传送落点';
    this.hud.message(hint);
  }

  cancelTargeting() {
    if (!this.targetingWeapon) return;
    this.targetingWeapon = null;
    this._targetMark = null;
    this.updateInputMode();
  }

  confirmTarget(wx, wy) {
    if (!this.targetingWeapon) return;
    const wid = this.targetingWeapon;
    // 弹药兜底校验：传送是「先应用坐标、后进 fireWeapon 结算」的顺序，
    // 若弹药异常归零绝不能白送一次瞬移（正常路径 selectWeapon 已挡 0 弹药）
    if (wid === 'teleport' && !((this.ammoPool?.[this.currentWorm?.team ?? 0] || {})[wid] > 0)) {
      this.cancelTargeting();
      return;
    }
    // 传送失败不退出标记模式（不扣弹药），提示后可重新点选
    if (wid === 'teleport' && !this.tryTeleport(this.currentWorm, wx, wy)) return;
    this.targetingWeapon = null;
    this.fireWeapon(this.currentWorm, wid, 0, 0, wx, { targetY: wy });
  }

  // 传送：落到点击列的地表（点浮岛上表面落岛上、点洞内落洞底）；无效位置返回 false
  tryTeleport(worm, tx, ty) {
    if (!worm || !worm.alive) return false;
    const terrain = this.terrain;
    const x = Math.max(20, Math.min(terrain.W - 20, tx | 0));
    const yStart = Math.max(0, (ty | 0) - 40); // ty 缺省时 |0 归 0，从顶扫起
    const gy = terrain.findSurfaceY(x, yStart);
    if (gy === null || gy < 40 || gy > this.water.level - 6) { this.hud.message('🌀 无法传送到那里'); return false; }
    for (let y = gy - 34; y < gy; y++) {
      if (y >= 0 && terrain.isSolid(x, y)) { this.hud.message('🌀 那里站不下'); return false; }
    }
    this.particles.sparkle(worm.x, worm.y - 16, 0x9fd4ff, 12);
    worm.x = x; worm.y = gy;
    worm.vx = 0; worm.vy = 0;
    worm.onGround = true; worm.jumpsUsed = 0;
    this.particles.sparkle(x, gy - 16, 0x9fd4ff, 14);
    this.sfx('boing');
    this.camera.follow(x, gy - 60);
    if (worm.team === 0 && !this.tutorialLike) this.ach('teleport_use');
    this.frameTurnCamera(worm);
    return true;
  }

  afterFire(worm, projectile) {
    this.charging = false;
    this.chargePower = 0;
    this.slingshot = null;
    this.state = 'projectile';
    this._projT = 0;
    this.retreatLeft = (worm.isAI || this.tutorialLike) ? 0 : C.RETREAT_TIME;
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
    // 目标标记模式不能泄漏到下一回合（否则新回合粘在 target 模式，点地图直接开火）
    this.cancelTargeting();
    this.hud.powerHide();
    this._postTurn();
  }

  // 竖屏回合构图：把当前虫虫和最近的敌人一起放进视野
  isPortrait() { return this.camera.viewH > this.camera.viewW; }

  nearestEnemy(worm) {
    if (!worm) return null;
    let best = null, bestD = Infinity;
    for (const w of this.worms) {
      if (!w.alive || w.team === worm.team) continue;
      const d = Math.abs(w.x - worm.x);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  frameTurnCamera(cur) {
    // 回合开始默认构图：缩放到能把所有存活虫虫（含靶子）都装进画面，
    // 中心对准包围盒；不需要拉远时保持默认缩放（只拉远不放大）
    const cam = this.camera;
    const ws = this.worms.filter(w => w.alive);
    const def = cam.defaultZoom();
    let zoom = def, cx = cur.x, cy = cur.y - 60;
    if (ws.length) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const w of ws) {
        if (w.x < minX) minX = w.x;
        if (w.x > maxX) maxX = w.x;
        if (w.y < minY) minY = w.y;
        if (w.y > maxY) maxY = w.y;
      }
      const zFit = Math.min(
        cam.viewW / (maxX - minX + 240),
        cam.viewH / (maxY - minY + 200),
      );
      zoom = Math.max(cam.minZoom(), Math.min(def, zFit));
      cx = (minX + maxX) / 2;
      cy = (minY + maxY) / 2 - 30;
    }
    cam.setZoom(zoom);
    cam.follow(cx, cy);
  }

  // ---------------- 弹道与爆炸 ----------------
  projectileExplode(x, y, proj) {
    const w = proj.weapon;
    if (w.cluster) {
      spawnBomblets(this, x, y, w.cluster, proj.owner);
      this.explode(x, y, w.radius * 0.6, w.dmg * 0.5, { owner: proj.owner, weaponId: proj.weapon.id, origin: proj.owner, directHit: proj.directHit === true });
      return;
    }
    if (w.holy) {
      this.hud.banner('ALLELUIA!', '💥');
      sfx('holy');
    }
    // 奶牛：冲击波横向击退大幅减弱，避免把虫虫推离奶牛的踩踏路线
    this.explode(x, y, w.radius, w.dmg, {
      owner: proj.owner, weaponId: proj.weapon.id, origin: proj.owner,
      kbX: w.id === 'cow' ? 0.2 : 1,
      directHit: proj.directHit === true,
    });
  }

  explode(x, y, r, dmg, opts = {}) {
    // 暴击：弹丸直接命中虫体必暴（技术奖励）；否则 7% 概率 1.6 倍
    if (opts.directHit || (dmg >= 18 && Math.random() < C.CRIT_CHANCE)) {
      dmg = Math.round(dmg * C.CRIT_MULT);
      this.popup(x, y - 18, opts.directHit ? '💥 直接命中暴击！' : '💥 暴击！', 0xffd93d);
      this.particles.sparkle(x, y, 0xffd93d, 14);
      this.ach('crit');
    }
    this.terrain.carve(x, y, r);
    this.particles.explosion(x, y, r, this.dirtColor(), this.mobile);
    this.camShake(Math.min(14, r / 4));
    this.camera.punch(Math.min(0.06, r / 900));
    sfx(r > 55 ? 'exploBig' : r < 30 ? 'exploTiny' : 'explo');

    const eff = explosionEffects(this.worms, x, y, r, dmg);
    const wasAlive = new Map(eff.map(e => [e.worm.id, e.worm.alive]));
    let enemyDmg = 0;
    for (const e of eff) {
      this.damageWorm(e.worm, e.dmg, opts.origin, opts.weaponId);
      if (opts.origin?.team === 0 && e.worm.team === 1) enemyDmg += e.dmg;
      if (e.worm.alive) e.worm.applyKnockback(e.kx * (opts.kbX ?? 1), e.ky);
    }
    if (enemyDmg >= 100) this.ach('big_shot');
    // 擦身而过：没被波及但离爆心很近的虫虫会被吓一跳
    for (const w of this.worms) {
      if (!w.alive || eff.some(e => e.worm === w)) continue;
      const d = Math.hypot(w.x - x, w.bodyY - y);
      if (d < r + 46 && Math.random() < 0.35) this.say(w, '好险！', 1.1);
    }
    // 连杀播报：一次爆炸击倒 2/3+ 只敌人
    if (opts.origin) {
      let killed = 0;
      for (const e of eff) {
        if (e.worm.team === opts.origin.team || !wasAlive.get(e.worm.id)) continue;
        if (!e.worm.alive) killed++;
      }
      if (killed >= 3) {
        this.hud.banner('💥 三杀！', `${opts.origin.name} 一炸三只！`);
        this.ach('triple_kill');
        this.slowMo(0.24);
      } else if (killed >= 2) {
        this.hud.banner('💥 双杀！', opts.origin.name);
        this.ach('double_kill');
        this.slowMo(0.24);
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
    // 油桶被波及 → 延迟引爆（距离越远延迟越长，链式连锁更可读）
    for (const d of this.drums) {
      if (!d.alive || d.fuse >= 0) continue;
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < r + 14) d.ignite(0.12 + dist * 0.004, opts.origin || null);
    }
    // 最远一击统计
    if (opts.origin && opts.origin.team === 0 && opts.origin.alive) {
      const dist = Math.hypot(x - opts.origin.x, y - opts.origin.bodyY);
      if (dist > 250 && eff.some(e => e.worm.team === 1)) {
        if (!this.tutorialLike) recordLongestShot(dist);
        if (this.matchStats && dist > this.matchStats.longest) this.matchStats.longest = Math.round(dist);
        if (dist > 700) this.ach('long_shot');
      }
    }
  }

  cowStomp(p) {
    const eff = explosionEffects(this.worms, p.x, p.y - 8, 40, p.weapon.dmg);
    for (const e of eff) {
      this.damageWorm(e.worm, e.dmg, p.owner, 'cow');
      // 把被踩到的虫虫往坑中心带，让它顺着刚挖出的坑掉下去，等奶牛下一次踩踏
      const dx = e.worm.x - p.x;
      if (e.worm.alive) e.worm.applyKnockback(Math.max(-110, Math.min(110, -dx * 2.4)), 0);
    }
    // 每次踩踏都挖地：坑挖出来后虫虫会跟着掉进坑里，奶牛下一次踩踏继续命中
    this.terrain.carve(p.x, p.y, 34);
    this.particles.sparkle(p.x, p.y, this.dirtColor(), 10);
    this.particles.splash(p.x, p.y, 0xcccccc, 8);
    this.camShake(5);
  }

  spawnAirstrikeBomb(x, y, dir, owner) { spawnAirstrikeBomb(this, x, y, dir, owner); }

  // 投射物出界/落水后由 update 统一过滤
  projectileGone(p) { /* noop */ }

  damageWorm(worm, dmg, source, weaponId) {
    if (!worm.alive || dmg <= 0.5) return;
    const d = Math.max(1, Math.round(dmg));
    const wasAlive = worm.alive;
    worm.hp = Math.max(0, worm.hp - d);
    // 教学/练习：学员不会被伤害打死（落水另有救援），避免卡关
    if (worm.team === 0 && this.tutorialLike && worm.hp <= 0) worm.hp = 1;
    worm.hurtFlash = 0.4;
    worm.stunnedT = 0.8;
    (worm.hitLog || (worm.hitLog = [])).push(weaponId || null);
    if (worm.hitLog.length > 80) worm.hitLog.shift();
    worm.lastHitWeapon = weaponId || null;
    this.tutEvent('damage', { worm, dmg: d, weaponId: weaponId || null, source });
    this.popup(worm.x, worm.bodyY - 26, `-${d}`, 0xff6b81);
    sfx('hurt');
    if (Math.random() < 0.4) this.say(worm, C.OUCHES[Math.floor(Math.random() * C.OUCHES.length)], 1.4);
    if (source && source.team === 0 && weaponId && !this.tutorialLike) {
      // 子雷/航空炸弹按母武器统计，避免战绩里出现隐藏武器
      const statId = weaponId === 'bomblet' ? 'cluster' : weaponId === 'bomb' ? 'airstrike' : weaponId;
      recordWeaponDamage(statId, d);
    }
    if (this.matchStats) {
      if (source && source.team === 0 && worm.team === 1) {
        this.matchStats.dmgDealt += d;
        // 命中按「开火次数」计：一次射击无论多少弹丸/子雷命中，都只算 1 次
        if (!this._shotHitCounted) {
          this._shotHitCounted = true;
          this.matchStats.hits++;
        }
      }
      if (worm.team === 0) this.matchStats.dmgTaken += d;
      if (worm.hp <= 0 && wasAlive && source && source.team === 0 && worm.team === 1) this.matchStats.kills++;
    }
    if (worm.hp <= 0) {
      // 击杀者嘲讽一句
      if (source && source.alive && source !== worm && Math.random() < 0.5) {
        this.say(source, C.TAUNTS[Math.floor(Math.random() * C.TAUNTS.length)], 1.4);
      }
      // 击杀类成就（按武器归因；教学/练习不计）
      if (source && source.team === 0 && worm.team === 1 && !this.tutorialLike) {
        if (source.hp <= 10) this.ach('low_hp_kill');
        const kid = { driller: 'driller_kill', holy: 'holy_kill', cow: 'cow_kill', bomb: 'airstrike_kill', airstrike: 'airstrike_kill', shotgun: 'shotgun_kill' }[weaponId];
        if (kid) this.ach(kid);
      }
      this.killWorm(worm);
    }
    this._pipsDirty = true;
  }

  applyFallDamage(worm, dmg) {
    this.damageWorm(worm, dmg, null, null);
    this.popup(worm.x, worm.bodyY - 26, '摔伤！', 0xffa843);
  }

  drownWorm(worm) {
    if (!worm.alive) return;
    this.splashAt(worm.x, this.water.level);
    sfx('drown');
    // 教学/练习：学员落水不会被淘汰，直接捞回起点
    if (worm.team === 0 && this.tutorialLike) {
      const home = this.wormHomes.get(worm);
      if (home) {
        worm.x = home.x; worm.y = home.y;
        worm.vx = 0; worm.vy = 0;
        worm.onGround = true;
        worm.hurtFlash = 0;
      }
      this.camera.follow(worm.x, worm.y - 60);
      this.hud.message('💧 掉水里了！已经把你捞回岸边');
      this._pipsDirty = true;
      return;
    }
    worm.hp = 0;
    worm.alive = false;
    worm._drowned = true;
    worm.lastHitWeapon = 'water';
    (worm.hitLog || (worm.hitLog = [])).push('water');
    if (worm.team === 1 && !this.tutorialLike) this.ach('terrain_kill');
    if (!this.tutorialLike) this.slowMo(0.15); // 与 killWorm 同款门控：教学/练习不播慢镜头
    worm.view.visible = false;
    this.popup(worm.x, this.water.level - 30, '扑通…', 0x9fd4ff);
    this.hud.message(`💧 ${worm.name} 落水了！`);
    sfx('death');
    this.tutEvent('drown', { worm });
    this._queueRespawn(worm);
    this._pipsDirty = true;
  }

  killWorm(worm) {
    if (!worm.alive) return;
    if (!this.tutorialLike) this.slowMo(0.15);
    worm.hp = 0;
    sfx('death');
    this.say(worm, C.DEATH_WORDS[Math.floor(Math.random() * C.DEATH_WORDS.length)], 2);
    worm.die(this, C.EPITAPHS[Math.floor(Math.random() * C.EPITAPHS.length)]);
    this.hud.message(`🪦 ${worm.name} 阵亡`);
    this.tutEvent('kill', { worm, weaponId: worm.lastHitWeapon });
    this._queueRespawn(worm);
    this._pipsDirty = true;
  }

  splashAt(x, y) {
    const lava = !!this.terrain.theme.lava;
    const color = lava ? 0xff7a30 : 0x9fd4ff;
    this.particles.splash(x, y, color, 16);
    // 水花柱：更陡更快的第二波，落水更有分量
    for (let i = 0; i < 8; i++) {
      this.particles.spawn({ x: x + (Math.random() - 0.5) * 10, y,
        vx: (Math.random() - 0.5) * 40, vy: -160 - Math.random() * 160,
        life: 0.5 + Math.random() * 0.3, size: 2 + Math.random() * 2.5, color, gravity: 900 });
    }
    if (!lava) this.ringAt(x, y, color);
    sfx('splash');
  }

  // 扩散圆环波纹（借 _popups 的生命周期管理与销毁）
  ringAt(x, y, color) {
    const g = new PIXI.Graphics();
    g.circle(0, 0, 12).stroke({ width: 2, color, alpha: 0.8 });
    g.position.set(x, y);
    this.layers.world.addChild(g);
    this._popups = this._popups || [];
    this._popups.push({ t: g, life: 0.5, ring: true });
  }

  // ---------------- 训练靶子复活（教学/练习） ----------------
  _queueRespawn(worm) {
    if (!this.respawnEnabled || this.matchOver) return;
    if (worm.team !== 1) return;
    if (this.respawnQueue.some((r) => r.worm === worm)) return;
    this.respawnQueue.push({ worm, at: this.time + 2.0 });
  }

  reviveWorm(worm, home) {
    if (!worm || worm.alive) return;
    worm.revive(home.hp, home.x, home.y);
    this.layers.ents.addChild(worm.view);
    this._pipsDirty = true;
    this.hud.message(`🎯 ${worm.name} 重新出现`);
  }

  _updateRespawns() {
    if (!this.respawnQueue.length) return;
    const due = this.respawnQueue.filter((r) => this.time >= r.at);
    if (!due.length) return;
    this.respawnQueue = this.respawnQueue.filter((r) => this.time < r.at);
    for (const r of due) {
      const home = this.wormHomes.get(r.worm);
      if (home) this.reviveWorm(r.worm, home);
    }
  }

  // ---------------- 补给箱 ----------------
  maybeSpawnCrate() {
    if (this.noCrates) return;
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
        if (!w.alive) continue; // AI 也会捡（brain 顺路时会主动走过去）
        if (c.tryPickup(w)) this.pickupCrate(c, w);
      }
    }
    let n = 0;
    for (let i = 0; i < this.crates.length; i++) {
      if (this.crates[i].alive) this.crates[n++] = this.crates[i];
    }
    this.crates.length = n;
  }

  pickupCrate(crate, worm) {
    sfx('pickup');
    this.tutEvent('crate', { crate, worm });
    this.particles.sparkle(crate.x, crate.y, crate.type.color, 12);
    if (worm.team === 0 && !worm.onGround && !this.tutorialLike) this.ach('air_crate');
    if (this.matchStats && worm.team === 0) {
      this.matchStats.crates++;
      if (this.matchStats.crates >= 3) this.ach('crate_addict');
    }
    if (crate.kind === 'health') {
      const heal = crate.payload?.heal ?? 25;
      worm.hp = Math.min(100, worm.hp + heal);
      this.popup(worm.x, worm.bodyY - 26, `+${heal}`, 0x6bd968);
      this.hud.message(`❤️ ${worm.name} 回复 ${heal} HP`);
    } else if (crate.kind === 'weapon' && crate.payload) {
      const { wid, n } = crate.payload;
      this.ammoPool[worm.team][wid] += n;
      this.hud.message(`🎁 ${worm.name} 获得 ${C.WEAPON_BY_ID[wid].name} ×${n}`);
    } else if (crate.kind === 'tool') {
      worm.jetFuel = 100;
      this.hud.message(`🔧 ${worm.name} 获得喷气背包（起跳后按住跳跃推进）`);
      this.touch?.setJetMode(true);
    } else if (crate.kind === 'kit' && crate.payload) {
      const g = crate.payload;
      if (g.weapons) {
        for (const [wid, n] of Object.entries(g.weapons)) {
          this.ammoPool[worm.team][wid] = (this.ammoPool[worm.team][wid] || 0) + n;
        }
      }
      if (g.jetFuel) {
        worm.jetFuel = Math.max(worm.jetFuel, g.jetFuel);
        this.touch?.setJetMode(true);
      }
      const got = [];
      if (g.jetFuel) got.push('🔧 喷气背包');
      if (g.weapons?.airstrike) got.push('✈️ 空袭');
      if (g.weapons?.holy) got.push('🐑 神圣手雷');
      if (g.weapons?.cow) got.push('🐮 奶牛空袭');
      this.hud.message(`🎒 装备到手：${got.join(' · ')}`);
      this.hud.setFuel(worm.jetFuel);
    }
    this.syncWeaponBar();
    this._pipsDirty = true;
  }

  // ---------------- 油桶 ----------------
  // 开局在平坦地表放几个油桶（同种子同桶位）；被爆炸波及会延迟连锁引爆
  spawnDrums() {
    if (this.tutorialLike) return; // 教学关地形是精摆的，不放
    const t = this.terrain;
    const count = t.W < 1000 ? 2 : t.W < 2000 ? 3 : 4;
    const seedBase = (this.matchConfig.seed | 0) || 12345;
    const rng = mulberry32(((seedBase * 7919 + 1)) >>> 0);
    let placed = 0, tries = 0;
    while (placed < count && tries++ < 40) {
      const x = 60 + Math.floor(rng() * (t.W - 120));
      const sy = t.findSurfaceY(x, 0);
      // 用当前水位（挑战关可覆写 waterY）而非主题默认值，避免桶生成在水面下秒沉
      if (sy === null || sy > this.water.level - 30 || sy < 60) continue;
      const l = t.findSurfaceY(x - 16, 0), r2 = t.findSurfaceY(x + 16, 0);
      if (l === null || r2 === null || Math.abs(l - sy) > 14 || Math.abs(r2 - sy) > 14) continue;
      if (this.worms.some(w => Math.abs(w.x - x) < 70)) continue;
      if (this.drums.some(d => Math.abs(d.x - x) < 60)) continue;
      this.drums.push(new OilDrum(this, x, sy));
      placed++;
    }
  }

  igniteDrum(d, delay, attacker) {
    if (!d || !d.alive || d.fuse >= 0) return;
    d.ignite(delay, attacker);
  }

  drumExplode(d) {
    if (!d || !d.alive) return;
    const { x, y, attacker } = d;
    d.destroy();
    this.explode(x, y - 10, 55, 55, { origin: attacker || null, weaponId: 'drum' });
  }

  // ---------------- 主题环境效果 ----------------
  // 沙漠阵风：回合内风向缓变（预览/AI 用 windAccel() 实时值，自动一致）
  _updateGust(dt) {
    const theme = this.terrain?.theme;
    if (!theme?.gust || this.tutorialLike || this.challenge?.noWind) return;
    if (this.state !== 'active' && this.state !== 'projectile') return;
    this._gustT -= dt;
    if (this._gustT <= 0) {
      this._gustT = 0.8;
      this._gustTarget = Math.max(-1, Math.min(1, this.wind + (Math.random() * 2 - 1) * 0.18));
    }
    const prev = this.wind;
    this.wind += (this._gustTarget - this.wind) * Math.min(1, dt * 1.5);
    // 收敛末段吸附到目标：长期停留时 HUD/预览不吃残差
    if (Math.abs(this._gustTarget - this.wind) < 0.004) this.wind = this._gustTarget;
    // HUD 节流必须按「与上次显示值的累计差」而非单步差：
    // 缓动单步增量最大 ~0.0045，按单步差判断（旧阈值 0.015/0.008）永远不触发，
    // 表现为整个回合 HUD 风向冻在开局值
    if (this._windShown === undefined || this._windShown === null) this._windShown = this.wind;
    if (Math.abs(this.wind - this._windShown) > 0.03) {
      this._windShown = this.wind;
      this.hud.setWind(this.wind);
    }
  }

  // 主题环境粒子：雪原飘雪 / 沙漠沙尘 / 熔岩余烬（低频撒，粒子池预算 ~30 活粒子）
  _updateAmbient(dt) {
    const theme = this.terrain?.theme;
    if (!theme || this.matchOver) return;
    const kind = theme.slide ? 'snow' : theme.gust ? 'dust' : theme.waterRiseMult ? 'ember' : null;
    if (!kind) return;
    this._ambientT -= dt;
    if (this._ambientT > 0) return;
    this._ambientT = this.mobile ? 0.24 : 0.12;
    const cam = this.camera;
    const z = Math.max(0.08, cam.zoom);
    const halfW = cam.viewW / z / 2, halfH = cam.viewH / z / 2;
    const cx = cam.x, cy = cam.y;
    const P = this.particles;
    if (kind === 'snow') {
      P.spawn({ x: cx + (Math.random() * 2 - 1) * halfW, y: cy - halfH - 10,
        vx: this.wind * 26 + (Math.random() - 0.5) * 12, vy: 46 + Math.random() * 36,
        life: 3.5 + Math.random(), size: 1.6 + Math.random() * 1.6, color: 0xffffff });
    } else if (kind === 'dust') {
      P.spawn({ x: cx + (Math.random() * 2 - 1) * halfW, y: cy + (Math.random() * 1.4 - 0.2) * halfH,
        vx: (this.wind || 0.3) * (60 + Math.random() * 50), vy: (Math.random() - 0.5) * 10,
        life: 1.2 + Math.random() * 0.6, size: 1.5 + Math.random() * 1.5, color: 0xd9a860 });
    } else { // ember：从岩浆面升起
      P.spawn({ x: cx + (Math.random() * 2 - 1) * halfW, y: this.water.level - 4,
        vx: (Math.random() - 0.5) * 20, vy: -24 - Math.random() * 26,
        life: 1.4 + Math.random() * 0.8, size: 1.5 + Math.random() * 1.5,
        color: [0xff8c42, 0xffb545, 0xff5a2a][Math.random() * 3 | 0] });
    }
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
    // 慢镜头计时（游戏秒；真实时长 ≈ gt / timeScale）
    if (this._slowT > 0) {
      this._slowT -= dt;
      if (this._slowT <= 0) { this._slowT = 0; this.timeScale = 1; }
    }
    this._updateGust(dt);
    this._updateAmbient(dt);

    this.water.update(dt);
    this.sky.update(dt, this.camera.x, this.camera.viewW);
    this.particles.update(dt);

    // 虫虫物理
    for (const w of this.worms) w.step(dt, this.terrain, this);
    // 喷气背包燃料条随消耗实时更新（HUD 内部有变化检测）
    if (this.currentWorm) this.hud.setFuel(this.currentWorm.jetFuel);
    // 投射物（原地压缩代替 filter：update 每固定步都跑，filter 的短命数组被 6 步/帧放大）
    for (const p of this.projectiles) if (p.alive) p.step(dt, this.terrain, this.windAccel(), this.water.level);
    let n = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.alive) this.projectiles[n++] = p;
    }
    this.projectiles.length = n;
    for (const pl of this.planes) pl.step(dt);
    n = 0;
    for (let i = 0; i < this.planes.length; i++) {
      const p = this.planes[i];
      if (p.alive) this.planes[n++] = p;
    }
    this.planes.length = n;
    this.handleCrates(dt);
    for (const d of this.drums) if (d.alive) d.step(dt, this.terrain);
    let dn = 0;
    for (let i = 0; i < this.drums.length; i++) {
      if (this.drums[i].alive) this.drums[dn++] = this.drums[i];
    }
    this.drums.length = dn;
    this._updateRespawns();

    // 浮动文字/弹道闪光
    if (this._popups && this._popups.length) {
      for (const p of this._popups) {
        p.life -= dt;
        if (p.ring) {
          const k = 1 - Math.max(0, p.life) / 0.5;
          p.t.scale.set(1 + k * 2.2);
          p.t.alpha = Math.max(0, Math.min(1, p.life * 2));
        } else if (!p.tracer) {
          p.t.y += p.vy * dt; p.t.alpha = Math.min(1, p.life * 2); p.t.scale.set(1 + (1.1 - p.life) * 0.3);
        }
      }
      n = 0;
      for (let i = 0; i < this._popups.length; i++) {
        const p = this._popups[i];
        if (p.life > 0) this._popups[n++] = p;
        else p.t.destroy();
      }
      this._popups.length = n;
    }

    this._updateState(dt);
    this._updateAimUI();
    this._updateCamera();
    // 视图同步
    for (const w of this.worms) w.updateView(this.time);
    // 血条/队伍 pips 每帧最多重建一次（一次爆炸命中多只虫时合并）
    if (this._pipsDirty) {
      this._pipsDirty = false;
      this.hud.updateTeamPips(this.worms);
    }
    // 教学导演最后跑：可能在场景完成时重建整局
    this.tutorial?.update(dt);
  }

  _updateState(dt) {
    const cur = this.currentWorm;
    switch (this.state) {
      case 'turnStart': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'active';
          // 进入操作阶段时重新构图：turnStart 期间相机会跟随当前虫虫，
          // 竖屏下需要把镜头拉回“虫虫 + 最近敌人”的中间
          this.frameTurnCamera(cur);
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
          if (!this.tutLock) this._humanControl(dt);
        }
        // 回合计时（教学/练习关无时限）
        if (!this.tutorialLike) {
          this.turnTimer -= dt;
          const secs = Math.ceil(this.turnTimer);
          if (secs <= 5 && secs !== this._lastTick) { this._lastTick = secs; sfx('tick'); }
          this.hud.setTimer(Math.max(0, this.turnTimer), this.turnTimer < 10);
          if (this.turnTimer <= 0) {
            this.hud.message(`${cur.name} 超时了！`);
            this._endTurnCommon();
          }
        }
        break;
      }
      case 'projectile': {
        // 看门狗：弹道阶段异常卡死（>10s）强制推进
        this._projT = (this._projT || 0) + dt;
        if (this._projT > 10) {
          this.hud.message('⏱ 弹道异常，强制结束回合');
          this._stopWormIntent(cur);
          this.state = 'postturnWait';
          this.stateTimer = 0.1;
          break;
        }
        // 困难 AI「发射后撤退」：brain 在开火后进入 retreat phase，
        // 投射物飞行期间继续驱动它走位（回合状态已切到 projectile，active 分支不再调 brain）
        if (this.brain && this.brain.phase === 'retreat') {
          const done = this.brain.update(dt * (this.aiFast ? 4 : 1));
          if (done) this.brain = null;
        }
        if (this.retreatLeft > 0 && !cur.isAI) {
          this.retreatLeft -= dt;
          this._humanMoveOnly();
          if (Math.ceil(this.retreatLeft) !== this._lastRetreat) {
            this._lastRetreat = Math.ceil(this.retreatLeft);
            this.hud.setControlsHint(this._lastRetreat > 0 ? `撤退！${this._lastRetreat}s` : '');
          }
          if (this.retreatLeft <= 0) {
            // 撤退窗口结束：清掉移动意图，否则最后的 walkDir 冻结、虫虫无输入持续行走
            this._stopWormIntent(cur);
            this.hud.setControlsHint('');
            this.touch?.setControlsEnabled(false);
          }
        }
        const busy = this.projectiles.length > 0 || this.planes.length > 0;
        const settled = this.worms.every(w => !w.alive || w.onGround || w.y > this.water.level);
        // 撤退时间必须给满：即使弹丸已落地，也要等玩家用完 5 秒撤退窗口
        if (!busy && settled && this.retreatLeft <= 0) {
          this._stopWormIntent(cur);
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
    // 跳跃 / 喷气：有喷气背包时先起跳，之后按住不放 = 喷气
    if (cur.jetFuel > 0) {
      if (this._jumpEdge) {
        cur.wantJump = true;
        cur.wantJet = false;
        this._jumpEdge = false;
      } else {
        cur.wantJet = this.input.jumpHeld() && !cur.onGround;
        cur.wantJump = false;
      }
    } else {
      cur.wantJet = false;
      if (this._jumpEdge) { cur.wantJump = true; this._jumpEdge = false; }
    }
    // 蓄力：hold 模式力度条来回摆动（0→1→0，1.6s 单程）；drag/stick 模式由指针/摇杆行程决定
    if (this.charging) {
      if (this._chargeStyle === 'hold') {
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
    if (cur.jetFuel > 0 && !cur.wantJump) cur.wantJet = this.input.jumpHeld() && !cur.onGround;
  }

  // 清空当前虫虫的移动意图（撤退结束/弹道阶段转场时调用，防止冻结的 walkDir 让虫继续走）
  _stopWormIntent(worm) {
    if (!worm) return;
    worm.walkDir = 0; worm.wantJump = false; worm.wantJet = false;
  }

  _postTurn() {
    if (this.matchOver) return;
    this._projT = 0;
    this.maybeSpawnCrate();
    if (!this.tutorialLike) {
      // 挑战：生存判定
      if (this.surviveTurnsLeft != null) {
        this.surviveTurnsLeft--;
        if (this.surviveTurnsLeft <= 0 && this.teamAlive(0)) { this.endMatch(1, '生存成功！'); return; }
        if (!this.teamAlive(0)) { this.endMatch(-1, '全员阵亡'); return; }
      } else {
        this._checkWin();
        if (this.matchOver) return;
      }
    }
    for (const w of this.worms) w.showArrow(false);
    this.nextTurn();
  }

  _checkWin() {
    if (this.matchOver || this.tutorialLike) return;
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
    this.hud.setDash(null);
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
      if (this.suddenDeath) this.ach('sudden_win');
    }
    if (isTutorial) {
      if (result === 1) {
        completeTutorial(this.challenge.id);
        this.hud.banner('🎓 教学完成！', '去主菜单试试下一课或挑战关卡');
        this.hud.message('🎓 本课已记录，可在教学列表查看完成状态');
      }
      this.hud.showGameover(result, subtitle, {
        stats: this.matchStats,
        title: result === 1 ? '🎓 教学目标完成' : undefined,
        hint: result === 1 ? '本课已记录 · 可在教学列表查看完成状态' : undefined,
      });
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
    if (this.tutLock) return;
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
    if (this.tutLock) return;
    if (this.state !== 'active' || this.currentWorm?.isAI || !this.slingshot) return;
    const { angle, power } = this.slingshot;
    this.slingshot = null;
    if (power < 0.06) { this.hud.powerHide(); return; }
    this.fireWeapon(this.currentWorm, this.selectedWeapon, angle, power);
  }

  onAimCancel() {
    this.slingshot = null;
    this.charging = false;
    this._chargeStyle = null;
    this.chargePower = 0;
    this._powerOffset = 0;
    this.hud.powerHide();
    this.touch?.setCancelArmed(false);
    this.tutEvent('cancelAim');
  }

  onAimMove(wx, wy) {
    if (this.tutLock) return;
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
    if (this.tutLock) return;
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

  // ---------------- 触屏右摇杆：方向=发射方向，行程=力度，松手发射 ----------------
  onStickStart() {
    if (this.tutLock) return;
    if (this.state !== 'active' || this.currentWorm?.isAI) return;
    if (!this.currentWorm?.alive) return;
    if (C.WEAPON_BY_ID[this.selectedWeapon]?.targeting) {
      // 空袭/奶牛：推杆直接进入目标标记模式（之后轻点地图确认落点）
      if (!this.targetingWeapon) this.enterTargeting(this.selectedWeapon);
      return;
    }
    this.charging = true;
    this._chargeStart = this.time;
    this._chargeStyle = 'stick';
    this._powerOffset = 0;
    this.chargePower = 0.06;
    this.hud.powerUpdate(this.chargePower, this.currentWorm.aimAngle);
    this.touch?.setCancelArmed(true);
  }

  onStickMove(angleDeg, power) {
    if (this.tutLock) return;
    if (!this.charging || this._chargeStyle !== 'stick') return;
    if (this.state !== 'active' || this.currentWorm?.isAI) return;
    const cur = this.currentWorm;
    cur.aimAngle = angleDeg;
    cur.facing = Math.cos(angleDeg * Math.PI / 180) >= 0 ? 1 : -1;
    this.chargePower = Math.min(1, Math.max(0.06, power));
    this.hud.powerUpdate(this.chargePower, cur.aimAngle);
  }

  onStickEnd(angleDeg, power) {
    if (this.tutLock) return;
    if (!this.charging || this._chargeStyle !== 'stick') return;
    this.charging = false;
    this._chargeStyle = null;
    this._powerOffset = 0;
    this.chargePower = 0;
    this.hud.powerHide();
    this.touch?.setCancelArmed(false);
    const p = Math.max(0, Math.min(1, power));
    // 松手时摇杆已推回中心（行程≈0）= 取消瞄准，不消耗回合
    if (p < 0.06) { this.tutEvent('cancelAim'); return; }
    if (this.state === 'active' && !this.currentWorm?.isAI) {
      this.fireWeapon(this.currentWorm, this.selectedWeapon, angleDeg, p);
    }
  }

  onTarget(wx, wy) {
    if (this.tutLock) return;
    if (this.targetingWeapon && !this.currentWorm?.isAI) this.confirmTarget(wx, wy);
  }

  // 触屏轻点地图（瞄准模式）：目标类武器（空袭/奶牛）= 进入标记模式，其余忽略
  onTapAim(wx, wy) {
    if (this.tutLock) return;
    if (this.state !== 'active' || this.currentWorm?.isAI) return;
    if (this.targetingWeapon || !this.currentWorm?.alive) return;
    if (C.WEAPON_BY_ID[this.selectedWeapon]?.targeting) this.enterTargeting(this.selectedWeapon);
  }

  onJumpPress() {
    this._jumpEdge = true;
  }

  onZoom(mx, my, delta, continuous) {
    // 拖拽力度模式下，瞄准中滚轮 = 力度微调（每次 ±2%）
    if (this.charging && this._chargeStyle === 'drag' && this.state === 'active' && !this.currentWorm?.isAI) {
      this._powerOffset = (this._powerOffset || 0) + (delta < 0 ? 0.02 : -0.02);
      this._powerOffset = Math.max(-1, Math.min(1, this._powerOffset));
      if (this._lastCursor) this.chargePower = this._computeDragPower(this._lastCursor.x, this._lastCursor.y);
      this.hud.powerUpdate(this.chargePower, this.currentWorm.aimAngle);
      this.tutEvent('wheel', { delta });
      return;
    }
    const w = this.camera.screenToWorld(mx, my);
    // 双指捏合：原始像素增量做指数映射（~320px 捏合 = 2.7 倍），避免轻捏就猛跳
    const z = continuous
      ? this.camera.tzoom * Math.exp(delta / 320)
      : this.camera.tzoom * (delta < 0 ? 1.13 : 1 / 1.13);
    this.camera.setZoom(z, w.x, w.y);
    this.tutEvent('cameraZoom', { delta });
  }

  onPan(dx, dy) {
    // 中键/Shift+左键/双指拖动都走这里；不再按 aimMode 拦截
    this.camera.pan(dx, dy);
    this.tutEvent('cameraPan', { dx, dy });
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
    // key 必须含虫虫坐标：行走时状态/角度都不变，但瞄准线要跟着虫虫走
    const key = [
      this.state,
      cur?.id ?? -1,
      cur?.alive ? 1 : 0,
      cur?.isAI ? 1 : 0,
      Math.round(cur?.x ?? 0), Math.round(cur?.y ?? 0),
      Math.round(cur?.aimAngle ?? 0),
      this.charging ? Math.round(this.chargePower * 100) : -1,
      this.slingshot ? `${Math.round(this.slingshot.angle)}_${Math.round(this.slingshot.power * 100)}` : '-',
      this.targetingWeapon || '-',
      this._targetMark ? `${Math.round(this._targetMark.x)}_${Math.round(this._targetMark.y)}` : '-',
      this.lastShotV,
      // 风也在 key 里：沙漠阵风漂移时弹道预览必须跟着重算，否则点阵是过期弹道
      Math.round(this.windAccel() * 50),
    ].join('|');
    if (key === this._aimKey) return;
    this._aimKey = key;
    g.clear();
    this._drawGhostTrail(g);
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
    const angle = this.slingshot ? this.slingshot.angle : cur.aimAngle;
    const power = this.slingshot ? this.slingshot.power : this.chargePower;
    if (power < 0.03) return;
    // 与真实发射同源：起点直接用 muzzlePos（修复前这里是手写 -sin，与旧 muzzlePos 的 +sin 不一致）
    const m = muzzlePos(cur, angle);
    // 缓存模拟结果：仅在角度/力度/风跨步变化时重新积分
    const key = `${w.id}|${Math.round(angle * 2)}|${Math.round(power * 60)}|${Math.round(this.windAccel() * 50)}`;
    if (key !== this._trajKey || !this._trajM || Math.abs(this._trajM.x - m.x) > 2 || Math.abs(this._trajM.y - m.y) > 2) {
      this._trajKey = key;
      this._trajM = { x: m.x, y: m.y };
      const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power;
      const a = angle * Math.PI / 180;
      this._trajPts = simulateTrajectory(this.terrain, m.x, m.y,
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

  // 上一发弹道残影：淡蓝小点重放真实飞行轨迹（学习反馈——「差一点点」变得可见可调）
  _drawGhostTrail(g) {
    const t = this.lastShotTrail;
    if (!t || !t.pts || !t.pts.length || !this.settings.trajectory) return;
    if (!(this.state === 'active' && this.currentWorm && !this.currentWorm.isAI)) return;
    for (let i = 0; i < t.pts.length; i++) {
      g.circle(t.pts[i].x, t.pts[i].y, 1.6).fill({ color: 0x9fd4ff, alpha: 0.13 });
    }
  }

  _drawTargetMark(g) {
    if (!this.targetingWeapon || !this._targetMark) return;
    const { x, y } = this._targetMark;
    // 落点预示：空袭=航线+投弹窗落地范围；奶牛=落点竖直参考线（新手不再盲标）
    const cur = this.currentWorm;
    if (this.targetingWeapon === 'airstrike') {
      const dir = cur && x < cur.x ? -1 : 1; // 与 Plane 进场方向一致
      const py = 150;
      this._dashLine(g, x - dir * 60, py, x - dir * 330, py, 0xff5a5a, 0.45);
      for (const bx of [x - 60, x, x + 60]) {
        const sy = this.terrain.findSurfaceY(bx | 0, 0);
        if (sy !== null) this._dashLine(g, bx, py + 6, bx, sy, 0xff5a5a, 0.3);
      }
    } else if (this.targetingWeapon === 'cow') {
      const sy = this.terrain.findSurfaceY(x | 0, 0);
      if (sy !== null) this._dashLine(g, x, 60, x, sy, 0xff5a5a, 0.3);
    }
    g.circle(x, y, 14).stroke({ width: 2.5, color: 0xff5a5a });
    g.moveTo(x - 22, y).lineTo(x - 8, y).moveTo(x + 8, y).lineTo(x + 22, y).stroke({ width: 2.5, color: 0xff5a5a });
    g.moveTo(x, y - 22).lineTo(x, y - 8).moveTo(x, y + 8).lineTo(x, y + 22).stroke({ width: 2.5, color: 0xff5a5a });
  }

  _dashLine(g, x1, y1, x2, y2, color, alpha) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(2, Math.floor(d / 14));
    const ux = (x2 - x1) / n, uy = (y2 - y1) / n;
    for (let i = 0; i < n; i++) {
      g.moveTo(x1 + ux * i, y1 + uy * i)
        .lineTo(x1 + ux * (i + 0.55), y1 + uy * (i + 0.55))
        .stroke({ width: 2, color, alpha });
    }
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
      // 回合开始的构图（frameTurnCamera）已保证全体虫虫入画；操作/观战阶段就近跟随
      this.camera.follow(cur.x, cur.y - 60);
    }
    this.camera.update(1 / 60);
  }
}
