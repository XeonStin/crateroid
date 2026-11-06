// ============ 对局 HUD（DOM 覆盖层） ============
import { sfx } from '../core/audio.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.$ = (id) => document.getElementById(id);
    this.root = this.$('hud');
    this.bannerTimer = null;
    this._bind();
  }

  _bind() {
    this.$('btn-pause').addEventListener('click', () => { sfx('click'); this.game.menus.showPause(); });
    this.$('btn-skip').addEventListener('click', () => { sfx('click'); this.game.skipTurn(); });
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

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

  setRound(round, suddenDeath) {
    const el = this.$('round-label');
    el.textContent = `第${round}回合${suddenDeath ? ' ☠️' : ''}`;
    el.classList.toggle('sd', !!suddenDeath);
    el.title = '当前回合数（双方各行动一轮记 1 回合）';
  }

  setTimer(t, warn) {
    const el = this.$('timer');
    const s = Math.ceil(t);
    if (s !== this._lastTimerShown) {
      this._lastTimerShown = s;
      el.textContent = s;
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
    if (!fuel || fuel <= 0) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    this.$('fuel-fill').style.width = fuel + '%';
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
    title.textContent = result === 1 ? '🏆 胜利！' : result === -1 ? '💀 战败…' : '🤝 平局';
    title.className = result === 1 ? 'win' : result === -1 ? 'lose' : 'draw';
    this.$('go-sub').textContent = subtitle || '';
    const detail = this.$('go-detail');
    detail.innerHTML = '';
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
