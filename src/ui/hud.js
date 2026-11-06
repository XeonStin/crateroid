// ============ 对局 HUD（DOM 覆盖层） ============
import { sfx } from '../core/audio.js';

export class HUD {
  constructor(game) {
    this.game = game;
    // DOM 节点缓存（index.html 骨架静态，节点不会增删）：update 路径每帧多次取引用，免反复查询
    this._elCache = {};
    this.$ = (id) => this._elCache[id] || (this._elCache[id] = document.getElementById(id));
    this.root = this.$('hud');
    this.bannerTimer = null;
    this._bind();
  }

  _bind() {
    this.$('btn-pause').addEventListener('click', () => { sfx('click'); this.game.menus.showPause(); });
    this.$('btn-skip').addEventListener('click', () => { sfx('click'); this.game.skipTurn(); });
    this.$('tp-skip').addEventListener('click', () => { sfx('click'); this.game.tutorial?.skipStage(); });
    this.$('tp-prev').addEventListener('click', () => { sfx('click'); this.game.tutorial?.prevStage(); });
  }

  show() { this.root.classList.remove('hidden'); }
  hide() {
    this.root.classList.add('hidden');
    this.hideTutorial();
  }

  banner(title, sub) {
    const b = this.$('banner');
    this.$('banner-title').textContent = title;
    this.$('banner-sub').textContent = sub || '';
    b.classList.remove('hidden');
    b.classList.remove('pop');
    void b.offsetWidth; // 重启动画
    b.classList.add('pop');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 1600);
  }

  setWind(w) {
    const arrow = this.$('wind-arrow');
    const fill = this.$('wind-fill');
    const strength = Math.abs(w);
    arrow.textContent = w > 0.05 ? '→' : w < -0.05 ? '←' : '·';
    arrow.style.color = strength > 0.7 ? '#ff6b81' : strength > 0.3 ? '#ffd93d' : '#9fd4ff';
    // 中间向两侧延伸
    const pct = Math.min(100, strength * 100);
    fill.style.width = pct + '%';
    fill.style.left = w >= 0 ? '50%' : (50 - pct) + '%';
    fill.style.background = strength > 0.7 ? '#ff6b81' : strength > 0.3 ? '#ffd93d' : '#9fd4ff';
  }

  setRound(round, suddenDeath, label) {
    const el = this.$('round-label');
    el.textContent = label || `第${round}回合${suddenDeath ? ' ☠️' : ''}`;
    el.classList.toggle('sd', !!suddenDeath);
    el.title = label ? label : '当前回合数（双方各行动一轮记 1 回合）';
  }

  // 本回合剩余冲刺次数；left=null 时隐藏（AI 回合）
  setDash(left, max = 1) {
    const el = this.$('dash-ind');
    if (!el) return;
    if (left == null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = `💨 ${left}/${max}`;
    el.classList.toggle('empty', left <= 0);
    el.title = `本回合剩余冲刺 ${left}/${max} 次（双击方向键）`;
  }

  setTimer(t, warn) {
    const el = this.$('timer');
    const s = Number.isFinite(t) ? Math.ceil(t) : Infinity;
    if (s !== this._lastTimerShown) {
      this._lastTimerShown = s;
      el.textContent = s === Infinity ? '∞' : s;
    }
    if (warn !== this._lastTimerWarn) {
      this._lastTimerWarn = warn;
      el.classList.toggle('warn', !!warn);
    }
  }

  setWeaponBar(weapons, pool, selected, enabled) {
    const bar = this.$('weapon-bar');
    bar.classList.toggle('disabled', !enabled);
    bar.innerHTML = '';
    weapons.forEach((w, i) => {
      const chip = document.createElement('button');
      const ammo = pool[w.id];
      const rare = w.id === 'holy' || w.id === 'cow';
      chip.className = 'wchip'
        + (w.id === selected ? ' sel' : '')
        + (ammo === 0 ? ' empty' : '')
        + (rare ? ' rare' : '')
        + (ammo === 1 ? ' low' : '');
      chip.innerHTML = `<span class="wicon">${w.icon}</span><span class="wammo">${ammo === Infinity || ammo === undefined ? '∞' : ammo}</span><span class="wkey">${i + 1}</span>`;
      chip.title = w.name;
      chip.addEventListener('click', () => { if (enabled) this.game.selectWeapon(w.id); });
      bar.appendChild(chip);
    });
  }

  powerUpdate(power, angleDeg) {
    const wrap = this.$('power-wrap');
    if (wrap.classList.contains('hidden')) wrap.classList.remove('hidden');
    // 只在数值变化时写 DOM（每帧写会引发持续重排）
    const pct = Math.round(power * 100);
    const a = Math.round(((angleDeg % 360) + 360) % 360);
    if (this._lastPowerPct !== pct) {
      this._lastPowerPct = pct;
      this.$('power-fill').style.width = pct + '%';
    }
    if (this._lastPowerTxt !== `${a}|${pct}`) {
      this._lastPowerTxt = `${a}|${pct}`;
      this.$('angle-readout').textContent = `${a}° · ${pct}%`;
    }
  }

  powerHide() { this.$('power-wrap').classList.add('hidden'); }

  setFuel(fuel) {
    const wrap = this.$('fuel-wrap');
    if (!fuel || fuel <= 0) {
      if (!wrap.classList.contains('hidden')) wrap.classList.add('hidden');
      this._lastFuelShown = 0;
      return;
    }
    wrap.classList.remove('hidden');
    const pct = Math.round(fuel);
    if (pct !== this._lastFuelShown) {
      this._lastFuelShown = pct;
      this.$('fuel-fill').style.width = pct + '%';
    }
  }

  message(text) {
    const feed = this.$('msg-feed');
    const el = document.createElement('div');
    el.className = 'msg';
    el.textContent = text;
    feed.appendChild(el);
    while (feed.children.length > 5) feed.firstChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, 3800);
  }

  // 金色成就提示
  toast(text) {
    const feed = this.$('msg-feed');
    const el = document.createElement('div');
    el.className = 'msg toast';
    el.textContent = text;
    feed.appendChild(el);
    while (feed.children.length > 6) feed.firstChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, 5200);
  }

  setControlsHint(text) {
    const el = this.$('controls-hint');
    el.textContent = text;
    el.classList.toggle('hidden', !text);
  }

  // ---------------- 教学常驻提示 ----------------
  showTutorial(info) {
    const panel = this.$('tut-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.classList.toggle('practice', !!info.practice);
    this.$('tp-badge').textContent = info.practice ? '♾️' : '📖';
    this.$('tp-name').textContent = info.name || '';
    this.$('tp-progress').textContent = info.progress || '';
    this.$('tp-prev').classList.toggle('hidden', !info.canPrev);
    this.$('tp-skip').classList.toggle('hidden', !info.skippable);
    const intro = this.$('tp-intro');
    intro.textContent = info.intro || '';
    intro.classList.toggle('hidden', !info.intro);

    const steps = this.$('tp-steps');
    steps.innerHTML = '';
    this._tutStepEls = [];
    for (const s of info.steps || []) {
      const el = document.createElement('div');
      el.className = 'tp-step ' + (s.state || 'todo');
      el.textContent = s.title;
      steps.appendChild(el);
      this._tutStepEls.push(el);
    }

    this.$('tp-title').textContent = info.title || '';
    this.$('tp-text').textContent = info.text || '';
    const keys = this.$('tp-keys');
    keys.innerHTML = '';
    for (const k of info.keys || []) {
      const chip = document.createElement('span');
      chip.className = 'tp-key';
      chip.textContent = k;
      keys.appendChild(chip);
    }
    const goal = this.$('tp-goal');
    goal.textContent = info.goal ? `🎯 ${info.goal}` : '';
    goal.classList.toggle('hidden', !info.goal);

    panel.classList.remove('tp-pop');
    void panel.offsetWidth;
    panel.classList.add('tp-pop');
  }

  markTutorialStepDone(index) {
    const el = this._tutStepEls?.[index];
    if (!el) return;
    el.className = 'tp-step done';
  }

  hideTutorial() {
    const panel = this.$('tut-panel');
    if (panel) panel.classList.add('hidden');
    this._tutStepEls = [];
  }

  updateTeamPips(worms) {
    const box = this.$('team-pips');
    box.innerHTML = '';
    for (let team = 0; team < 2; team++) {
      const row = document.createElement('div');
      row.className = 'pip-row t' + team;
      for (const w of worms.filter(x => x.team === team)) {
        const pip = document.createElement('div');
        pip.className = 'pip' + (!w.alive ? ' dead' : '');
        if (w.alive) {
          const pct = Math.max(0, w.hp) / 100;
          pip.style.setProperty('--hp', (pct * 100) + '%');
          pip.style.setProperty('--hpc', pct > 0.6 ? '#6bd968' : pct > 0.3 ? '#ffd93d' : '#ff5a5a');
        }
        pip.title = `${w.name} ${w.alive ? w.hp + 'HP' : '阵亡'}`;
        row.appendChild(pip);
      }
      box.appendChild(row);
    }
  }

  showGameover(result, subtitle, extra) {
    const s = this.$('gameover');
    const title = this.$('go-title');
    title.textContent = extra?.title || (result === 1 ? '🏆 胜利！' : result === -1 ? '💀 战败…' : '🤝 平局');
    title.className = result === 1 ? 'win' : result === -1 ? 'lose' : 'draw';
    this.$('go-sub').textContent = subtitle || '';
    const detail = this.$('go-detail');
    detail.innerHTML = '';
    if (extra?.hint) {
      detail.innerHTML += `<div class="go-hint">${extra.hint}</div>`;
    }
    if (extra?.rank) {
      detail.innerHTML += `<div class="rank-big">${extra.rank}</div>
        <div>用时 ${extra.turns} 回合 · 剩余 HP ${extra.hpLeft}</div>`;
    }
    if (extra?.stats) {
      const st = extra.stats;
      const acc = st.shots ? Math.min(100, Math.round((st.hits / st.shots) * 100)) : 0;
      detail.innerHTML += `<div class="go-stats">
        🎯 发射 ${st.shots} 次 · 命中 ${st.hits} 次（${acc}%）<br>
        ⚔️ 造成 ${Math.round(st.dmgDealt)} 伤害 · 承受 ${Math.round(st.dmgTaken)} · 击杀 ${st.kills} · 最远 ${st.longest}px
      </div>`;
    }
    s.classList.remove('hidden');
  }

  hideGameover() {
    this.$('gameover').classList.add('hidden');
  }
}
