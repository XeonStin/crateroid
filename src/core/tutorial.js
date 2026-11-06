// ============ 教学导演：分步引导 / 持久提示 / 场景切换 / 世界标记 ============
import * as PIXI from 'pixi.js';
import { Crate } from '../entities/crate.js';

const STEP_DELAY = 0.7;       // 完成一步后停留，让玩家看到 ✅
const STAGE_DELAY = 1.35;     // 场景完成的过场

export class TutorialDirector {
  constructor(game, level, stageIndex = 0) {
    this.game = game;
    this.level = level;
    this.stageIndex = Math.max(0, Math.min((level.stages?.length || 1) - 1, stageIndex | 0));
    this.stage = level.stages?.[this.stageIndex] || null;
    this.practice = !!level.practice;
    this.steps = (this.stage?.steps || []).filter((s) => !s.when || s.when(game));
    this.enemies = game.worms.filter((w) => w.team === 1);
    this.stepIndex = -1;
    this.step = null;
    this.vars = {};
    this.events = [];
    this.spawnedCrates = [];
    this.pickedKinds = new Set();
    this._pending = null;
    this._pendingT = 0;
    this._done = false;
    this._markerKey = '';
    this._lastFuelShown = -1;
    this._crateRetryT = 0;
    this._nudgeT = 0;

    // 世界内目标标记
    this.markerG = new PIXI.Graphics();
    this.markerG.zIndex = 940;
    this.markerText = new PIXI.Text({
      text: '',
      style: {
        fontFamily: 'sans-serif', fontSize: 13, fontWeight: 'bold', fill: 0xffffff,
        stroke: { color: 0x23233a, width: 4 }, align: 'center',
      },
    });
    this.markerText.anchor.set(0.5);
    this.markerText.zIndex = 941;
    this.markerText.visible = false;
    game.layers.world.addChild(this.markerG, this.markerText);
  }

  // ---------- 便捷访问 ----------
  get player() {
    const list = this.game.worms.filter((w) => w.team === 0);
    return list.find((w) => w.alive) || list[0] || null;
  }
  enemy(i) { return this.enemies[i] || null; }
  hasEvent(name, pred) {
    return this.events.some((e) => e.name === name && (!pred || pred(e.data)));
  }
  crateOf(kind) {
    return this.spawnedCrates.find((c) => c.kind === kind && c.alive) ||
      this.game.crates.find((c) => c.kind === kind && c.alive) || null;
  }
  ensureAmmo(id, n) {
    const pool = this.game.ammoPool[0];
    if (!pool) return;
    if (!(pool[id] >= n)) pool[id] = n;
    this.game.syncWeaponBar();
  }

  // ---------- 生命周期 ----------
  start() {
    this.game.tutLock = false;
    if (this.practice) {
      this.showPracticePanel();
      return;
    }
    this.spawnScriptedCrates();
    if (this.steps.length) this.enterStep(0);
  }

  spawnScriptedCrates() {
    const list = this.stage?.scriptedCrates;
    if (!list) return;
    for (const spec of list) {
      const gy = this.game.terrain.findSurfaceY(spec.x, 0) ?? 400;
      const crate = new Crate(this.game, spec.x, spec.kind, spec.payload || null, {
        y: gy - 140, fast: true,
      });
      this.spawnedCrates.push(crate);
      this.game.crates.push(crate);
    }
  }

  showPracticePanel() {
    this.game.hud.showTutorial({
      name: this.level.name,
      progress: '自由练习',
      intro: this.stage?.intro || '',
      steps: [],
      title: '♾️ 无限弹药 · 靶子复活',
      text: '所有武器弹药无限；靶子被打倒后约 2 秒原地复活；没有回合计时，永远是你的回合。',
      keys: this.game.mobile
        ? ['◀ ▶ 行走', '⤒ 跳跃', '拖拽 瞄准', '🎒 换武器']
        : ['A / D 行走', 'W / 空格 跳跃', '按住左键 瞄准', '1-8 换武器'],
      goal: '随便打，练到满意为止',
      practice: true,
    });
  }

  enterStep(i) {
    this.stepIndex = i;
    this.step = this.steps[i];
    this.game.tutLock = false;
    this.game._jumpEdge = false;
    this.vars = {
      startX: this.player?.x ?? 0,
      minRel: 0, maxRel: 0,
    };
    this.events = [];
    this._markerKey = '';
    const s = this.step;
    if (!s) return;
    if (s.ammo) {
      Object.assign(this.game.ammoPool[0], s.ammo);
      this.game.syncWeaponBar();
    }
    if (s.select) {
      this.game.selectedWeapon = s.select;
      this.game.syncWeaponBar();
    }
    try { s.enter?.(this); } catch (e) { console.error('[tutorial step enter]', e); }
    this.game.sfx('click');
    this.showStepPanel();
    this.game.updateInputMode();
  }

  showStepPanel() {
    const s = this.step;
    if (!s) return;
    const total = this.steps.length;
    const stages = this.level.stages?.length || 1;
    const progress = stages > 1
      ? `场景 ${this.stageIndex + 1}/${stages} · 步骤 ${this.stepIndex + 1}/${total}`
      : `步骤 ${this.stepIndex + 1}/${total}`;
    this.game.hud.showTutorial({
      name: this.level.name,
      progress,
      intro: this.stage?.intro || '',
      steps: this.steps.map((st, idx) => ({
        title: st.title,
        state: idx < this.stepIndex ? 'done' : idx === this.stepIndex ? 'cur' : 'todo',
      })),
      title: s.title,
      text: this.game.mobile ? (s.touchText || s.text) : s.text,
      keys: this.game.mobile ? (s.touchKeys || s.keys) : s.keys,
      goal: s.goal,
      practice: false,
      skippable: !!this.level.skippable && this.stageIndex < (this.level.stages?.length || 1) - 1,
      canPrev: this.stageIndex > 0,
    });
  }

  // 跳过当前场景（仅多场景教学；最后一关不显示按钮）
  skipStage() {
    if (this._done || this._pending || this.practice) return;
    const total = this.level.stages?.length || 1;
    const next = this.stageIndex + 1;
    if (next >= total) return;
    this._done = true;
    this.game.tutLock = true;
    this.game.onAimCancel?.();
    this.game.startMatch(this.game.menus.challengeConfig(this.level, next));
    this.game.hud.message('⏭ 已跳过上一场景');
  }

  // 返回上一场景（多场景教学；第一关不显示按钮）
  prevStage() {
    if (this._done || this._pending || this.practice) return;
    const prev = this.stageIndex - 1;
    if (prev < 0) return;
    this._done = true;
    this.game.tutLock = true;
    this.game.onAimCancel?.();
    this.game.startMatch(this.game.menus.challengeConfig(this.level, prev));
    this.game.hud.message('⏮ 已返回上一场景');
  }

  completeStep() {
    if (this._pending || !this.step) return;    this._pending = { type: 'step' };
    this._pendingT = STEP_DELAY;
    this.game.tutLock = true;
    this.game.onAimCancel?.();
    // 立刻停下移动意图，避免过场期间虫虫继续滑步
    for (const w of this.game.worms) {
      w.walkDir = 0; w.wantJump = false; w.wantJet = false; w.dashT = 0;
    }
    this.game._jumpEdge = false;
    this.game.sfx('pickup');
    this.game.hud.markTutorialStepDone(this.stepIndex);
    const isLast = this.stepIndex >= this.steps.length - 1;
    if (isLast) {
      const hasNext = this.stageIndex + 1 < (this.level.stages?.length || 1);
      if (hasNext) {
        this._pending = { type: 'stage' };
        this._pendingT = STAGE_DELAY;
        this.game.hud.banner('✅ 场景完成', '进入下一个场景…');
      } else {
        this._pending = { type: 'finish' };
        this._pendingT = STAGE_DELAY;
        this.game.hud.banner('🎓 教学目标完成！', '本课已记录');
      }
    }
  }

  update(dt) {
    if (this._done) return;
    if (this._pending) {
      this._pendingT -= dt;
      this._drawMarker();
      if (this._pendingT <= 0) {
        const type = this._pending.type;
        this._pending = null;
        if (type === 'step') {
          this.enterStep(this.stepIndex + 1);
        } else if (type === 'stage') {
          this._done = true;
          const next = this.stageIndex + 1;
          this.game.startMatch(this.game.menus.challengeConfig(this.level, next));
        } else if (type === 'finish') {
          this._done = true;
          this.game.endMatch(1, '教学目标全部完成！');
        }
      }
      return;
    }
    if (this.practice || !this.step) { this._drawMarker(); return; }

    const p = this.player;
    if (p) {
      const rel = p.x - (this.vars.startX ?? p.x);
      this.vars.minRel = Math.min(this.vars.minRel ?? 0, rel);
      this.vars.maxRel = Math.max(this.vars.maxRel ?? 0, rel);
      // 喷气关：落地后补满燃料，允许反复尝试
      if (this.step.jetRefill && p.onGround && p.jetFuel < 100) {
        p.jetFuel = 100;
        this.game.hud.setFuel(100);
        this.game.touch?.setJetMode(true);
      }
    }
    // 特殊武器步骤：弹药打空后自动补 3 发，避免卡关
    if (this.step.ammoId) {
      const pool = this.game.ammoPool[0];
      if (!(pool[this.step.ammoId] > 0)) {
        pool[this.step.ammoId] = 3;
        this.game.syncWeaponBar();
        this.game.hud.message('🎁 教学补给：特殊武器弹药 +3');
      }
    }

    // 补给箱被炸毁的兜底：还没拾取就重新投一个
    this._crateRetryT -= dt;
    if (this._crateRetryT <= 0 && this.stage?.scriptedCrates) {
      this._crateRetryT = 2.5;
      for (const spec of this.stage.scriptedCrates) {
        if (this.pickedKinds.has(spec.kind)) continue;
        if (!this.crateOf(spec.kind)) {
          const gy = this.game.terrain.findSurfaceY(spec.x, 0) ?? 400;
          const crate = new Crate(this.game, spec.x, spec.kind, spec.payload || null, {
            y: gy - 140, fast: true,
          });
          this.spawnedCrates.push(crate);
          this.game.crates.push(crate);
          this.game.hud.message('📦 补给箱重新投下了…');
        }
      }
    }

    let ok = false;
    try { ok = !!this.step.check?.(this); } catch (e) { console.error('[tutorial check]', e); }
    if (ok) { this.completeStep(); this._drawMarker(); return; }

    // 打倒了靶子但用错武器：靶子会自动复活，提示一下
    if (this.stage?.weaponTest && this._nudgeT <= 0) {
      for (const t of this.enemies) {
        if (!t.alive && !this.stage.weaponTest.includes(t.lastHitWeapon)) {
          this._nudgeT = 2.2;
          this.game.hud.message(`🎯 靶子倒了，但本关要用 ${this.stage.weaponName || '指定武器'}！靶子马上复活…`);
          break;
        }
      }
    }
    if (this._nudgeT > 0) this._nudgeT -= dt;
    this._drawMarker();
  }

  // 事件由 Game 在关键时刻调用
  event(name, data) {
    this.events.push({ name, data, t: this.game.time });
    if (this.events.length > 120) this.events.shift();
    if (name === 'crate' && data?.crate) this.pickedKinds.add(data.crate.kind);
    if (name === 'crate') {
      // 停下其它补给箱的兜底重投
      this._crateRetryT = 2.5;
    }
  }

  // ---------- 世界标记 ----------
  _drawMarker() {
    const s = this.step;
    let m = null;
    if (s && s.marker) {
      try { m = typeof s.marker === 'function' ? s.marker(this) : s.marker; } catch (e) { m = null; }
    }
    if (!m || m.x == null) {
      if (this.markerG.visible || this.markerText.visible) {
        this.markerG.visible = false;
        this.markerText.visible = false;
        this.markerG.clear();
        this._markerKey = '';
      }
      return;
    }
    const pulse = Math.round((Math.sin(this.game.time * 4) + 1) * 3);
    const key = `${Math.round(m.x)}|${Math.round(m.y)}|${m.label || ''}|${m.color ?? 0xffd23d}|${pulse}`;
    if (key === this._markerKey) return;
    this._markerKey = key;
    const color = m.color ?? 0xffd23d;
    const g = this.markerG;
    g.visible = true;
    g.clear();
    g.circle(m.x, m.y, 17 + pulse).stroke({ width: 3, color, alpha: 0.9 });
    g.circle(m.x, m.y, 4).fill({ color, alpha: 0.9 });
    g.moveTo(m.x, m.y - 27).lineTo(m.x, m.y - 51)
      .stroke({ width: 3, color, alpha: 0.85 });
    g.moveTo(m.x - 7, m.y - 42).lineTo(m.x, m.y - 27).lineTo(m.x + 7, m.y - 42)
      .stroke({ width: 3, color, alpha: 0.95 });
    this.markerText.visible = !!m.label;
    if (m.label) {
      this.markerText.text = m.label;
      this.markerText.position.set(m.x, m.y - 62);
      this.markerText.style.fill = 0xffffff;
    }
  }
}
