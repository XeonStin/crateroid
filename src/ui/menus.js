// ============ 菜单系统：标题 / 组队 / 选图 / 挑战 / 战绩 / 设置 / 暂停 ============
import { THEMES, DIFFICULTY, PLAYER_COLORS, ENEMY_COLORS, HATS, WORM_NAMES, WEAPONS, WORLD_W, MAP_SIZES, MAP_W_MIN, MAP_W_MAX, ACHIEVEMENTS } from '../config.js';
import { CHALLENGES } from '../levels/challenges.js';
import { TUTORIALS } from '../levels/tutorials.js';
import { loadSave, persist, resetSave } from '../core/save.js';
import { sfx, setVolumes, setMusicMode } from '../core/audio.js';

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const $ = (id) => document.getElementById(id);

export class Menus {
  constructor(hooks) {
    // hooks: {startMatch(cfg), resumeGame(), restartMatch(), quitToTitle(), game}
    this.hooks = hooks;
    this.root = $('menus');
    this.returnTo = 'menu-title';
    this.buildTeamDefaults();
    this.buildScreens();
    setMusicMode('menu');
    this.show('menu-title');
  }

  buildTeamDefaults() {
    const save = loadSave();
    if (!save.settings.teamSetup) {
      save.settings.teamSetup = {
        playerCount: 3, enemyCount: 3,
        players: [0, 1, 2, 3, 4].slice(0, 5).map((i) => ({
          name: WORM_NAMES[i], color: PLAYER_COLORS[i], hat: HATS[i % HATS.length],
        })),
      };
      persist();
    }
    this.team = save.settings.teamSetup;
  }

  show(id) {
    this.root.classList.remove('hidden');
    for (const s of this.root.querySelectorAll('.screen')) s.classList.add('hidden');
    $(id).classList.remove('hidden');
  }

  hideAll() { this.root.classList.add('hidden'); }

  // ---------------- 标题 ----------------
  buildScreens() {
    const title = $('menu-title');
    title.innerHTML = `
      <div class="logo">
        <div class="logo-planet"></div>
        <h1>弹坑星球</h1>
        <div class="logo-en">CRATEROID</div>
        <div class="logo-tag">回合制炮术虫虫对战</div>
      </div>
      <div class="menu-btns">
        <button class="mbtn big" id="m-battle">🐛 新的战斗</button>
        <button class="mbtn" id="m-tutorial">📖 教学关卡</button>
        <button class="mbtn" id="m-challenge">🏅 挑战关卡</button>
        <button class="mbtn" id="m-stats">📊 战绩</button>
        <button class="mbtn" id="m-settings">⚙️ 设置</button>
      </div>
      <div class="title-foot">WASD/触屏游玩 · 手机与电脑同一 Wi-Fi 可联机对战本机</div>`;
    $('m-battle').onclick = () => { sfx('click'); this.show('menu-team'); this.renderTeam(); };
    $('m-tutorial').onclick = () => { sfx('click'); this.show('menu-tutorial'); this.renderTutorials(); };
    $('m-challenge').onclick = () => { sfx('click'); this.show('menu-challenge'); this.renderChallenges(); };
    $('m-stats').onclick = () => { sfx('click'); this.show('menu-stats'); this.renderStats(); };
    $('m-settings').onclick = () => { sfx('click'); this.returnTo = 'menu-title'; this.show('menu-settings'); this.renderSettings(); };

    this.buildTeamScreen();
    this.buildMapScreen();
    this.buildTutorialScreen();
    this.buildChallengeScreen();
    this.buildStatsScreen();
    this.buildSettingsScreen();
    this.buildPauseScreen();
  }

  // ---------------- 教学 ----------------
  buildTutorialScreen() {
    const s = $('menu-tutorial');
    s.innerHTML = `<h2>📖 教学关卡</h2>
      <div class="ch-list" id="tut-list"></div>
      <div class="menu-btns row"><button class="mbtn" id="tut-back">← 返回</button></div>`;
    $('tut-back').onclick = () => this.show('menu-title');
  }

  renderTutorials() {
    const list = $('tut-list');
    const save = loadSave();
    list.innerHTML = '';
    TUTORIALS.forEach((lv, i) => {
      const done = !!save.tutorials?.[lv.id];
      const card = el('button', 'ch-card');
      card.innerHTML = `
        <div class="ch-num">${lv.practice ? '∞' : i + 1}</div>
        <div class="ch-info"><div class="ch-name">${lv.icon} ${lv.name}</div><div class="ch-desc">${lv.desc}</div></div>
        <div class="ch-rank" style="color:${lv.practice ? '#9fd4ff' : '#6bd968'}">${lv.practice ? '靶场' : done ? '✓' : ''}</div>`;
      card.onclick = () => { sfx('click'); this.hooks.startMatch(this.challengeConfig(lv, 0)); };
      list.appendChild(card);
    });
  }

  // ---------------- 组队 ----------------
  buildTeamScreen() {
    const s = $('menu-team');
    s.innerHTML = `
      <h2>组建你的虫虫小队</h2>
      <div class="team-rows" id="team-rows"></div>
      <div class="row-center">
        <label>队员数
          <select id="team-count"></select>
        </label>
        <label>敌军数量
          <select id="enemy-count"></select>
        </label>
        <button class="mbtn small" id="team-random">🎲 随机萌名</button>
      </div>
      <div class="menu-btns row">
        <button class="mbtn" id="team-back">← 返回</button>
        <button class="mbtn big" id="team-next">选择地图 →</button>
      </div>`;
    for (const n of [2, 3, 4, 5]) $('team-count').append(new Option(n + ' 只', n));
    for (const n of [1, 2, 3, 4, 5]) $('enemy-count').append(new Option(n + ' 只', n));
    $('team-count').value = this.team.playerCount;
    $('enemy-count').value = this.team.enemyCount;
    $('team-count').onchange = (e) => { this.team.playerCount = +e.target.value; this.renderTeam(); };
    $('enemy-count').onchange = (e) => { this.team.enemyCount = +e.target.value; };
    $('team-random').onclick = () => {
      const shuffled = [...WORM_NAMES].sort(() => Math.random() - 0.5);
      this.team.players.forEach((p, i) => { p.name = shuffled[i % shuffled.length]; });
      this.renderTeam();
    };
    $('team-back').onclick = () => this.show('menu-title');
    $('team-next').onclick = () => { persist(); this.show('menu-map'); this.renderMap(); };
  }

  renderTeam() {
    const rows = $('team-rows');
    rows.innerHTML = '';
    this.team.players.slice(0, this.team.playerCount).forEach((p, i) => {
      const row = el('div', 'team-row');
      const swatches = el('div', 'swatches');
      PLAYER_COLORS.forEach((c) => {
        const sw = el('button', 'swatch' + (c === p.color ? ' sel' : ''));
        sw.style.background = c;
        sw.onclick = () => { p.color = c; this.renderTeam(); };
        swatches.appendChild(sw);
      });
      const hats = el('div', 'hat-pick');
      const hatBtn = el('button', 'hat-btn', `${hatIcon(p.hat)} <span>${hatName(p.hat)}</span>`);
      hatBtn.onclick = () => {
        p.hat = HATS[(HATS.indexOf(p.hat) + 1) % HATS.length];
        this.renderTeam();
      };
      hats.appendChild(hatBtn);
      const name = el('input', 'name-input');
      name.maxLength = 6; name.value = p.name;
      name.oninput = () => { p.name = name.value || `虫虫${i + 1}`; };
      row.append(el('div', 'team-idx', `${i + 1}`), name, swatches, hats);
      rows.appendChild(row);
    });
  }

  // ---------------- 选图 ----------------
  buildMapScreen() {
    const s = $('menu-map');
    s.innerHTML = `
      <h2>选择战场</h2>
      <div class="map-cards" id="map-cards"></div>
      <div class="row-center">
        <label>种子 <input id="map-seed" class="seed-input" placeholder="随机" maxlength="12"></label>
        <button class="mbtn small" id="map-dice">🎲 换个种子</button>
        <button class="mbtn small" id="map-today">📅 今日种子</button>
      </div>
      <div class="row-center">
        <label>地图大小 <select id="map-size"></select></label>
        <label>AI 难度 <select id="map-diff"></select></label>
      </div>
      <div class="row-center">
        <label>自定义宽度 <input type="range" id="map-custom" min="${MAP_W_MIN}" max="${MAP_W_MAX}" step="50" value="800"> <span id="map-custom-val">800px</span></label>
      </div>
      <div class="menu-btns row">
        <button class="mbtn" id="map-back">← 返回</button>
        <button class="mbtn big" id="map-start">🚀 开战！</button>
      </div>`;
    for (const [k, d] of Object.entries(DIFFICULTY)) $('map-diff').append(new Option(d.name, k));
    $('map-diff').value = 'normal';
    for (const [k, s] of Object.entries(MAP_SIZES)) $('map-size').append(new Option(`${s.name} · ${s.w}px`, k));
    $('map-size').append(new Option('自定义 · 用下面滑块', 'custom'));
    $('map-size').value = 'medium';
    // 自定义宽度滑块：拖动即切到「自定义」档
    $('map-custom').oninput = (e) => {
      $('map-custom-val').textContent = e.target.value + 'px';
      $('map-size').value = 'custom';
    };
    $('map-size').onchange = () => {
      if ($('map-size').value === 'custom') $('map-custom-val').textContent = $('map-custom').value + 'px';
    };
    $('map-dice').onclick = () => { $('map-seed').value = Math.floor(Math.random() * 99999); };
    // 今日固定种子（每天不同的地图，可和朋友对同一张图）
    $('map-today').onclick = () => {
      const d = new Date();
      const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      $('map-seed').value = seed;
      this.hooks.game.hud?.message?.('📅 今日种子已填入：' + seed);
    };
    $('map-back').onclick = () => this.show('menu-team');
    $('map-start').onclick = () => {
      sfx('click');
      const themeKey = this.selectedTheme || 'islands';
      const seedStr = $('map-seed').value.trim();
      let seed = 0;
      if (seedStr) { for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; }
      else seed = Math.floor(Math.random() * 1e9);
      this.hooks.startMatch(this.buildMatchConfig(themeKey, seed, $('map-diff').value, $('map-size').value));
    };
  }

  renderMap() {
    const cards = $('map-cards');
    cards.innerHTML = '';
    for (const [key, t] of Object.entries(THEMES)) {
      const card = el('button', 'map-card' + (this.selectedTheme === key ? ' sel' : ''));
      card.innerHTML = `<div class="map-preview" style="background:linear-gradient(160deg, ${t.sky[0]}, ${t.sky[2]})">
          <div class="mp-ground" style="background:${hexCss(t.top)}"></div>
          <div class="mp-water" style="background:${hexCss(t.water)}"></div>
        </div><div class="map-name">${t.icon} ${t.name}</div><div class="map-desc">${t.desc || ''}</div>`;
      card.onclick = () => { this.selectedTheme = key; sfx('click'); this.renderMap(); };
      cards.appendChild(card);
    }
  }

  buildMatchConfig(themeKey, seed, difficulty, sizeKey = 'medium') {
    const n = this.team.playerCount, en = this.team.enemyCount;
    let W;
    if (sizeKey === 'custom') {
      const slider = document.getElementById('map-custom');
      W = Math.max(MAP_W_MIN, Math.min(MAP_W_MAX, (slider && +slider.value) || 800));
    } else {
      W = MAP_SIZES[sizeKey]?.w || WORLD_W;
    }
    // 出生区按地图宽度比例缩放，窄图（自定义 500px）也不会叠在一起
    const margin = Math.min(140, W * 0.12);
    const px0 = margin, px1 = W * 0.35;
    const ex0 = W * 0.65, ex1 = W - margin;
    const playerWorms = this.team.players.slice(0, n).map((p, i) => ({
      x: px0 + (px1 - px0) * (n === 1 ? 0.5 : i / (n - 1)) + jitter(46),
      name: p.name, color: p.color, hat: p.hat,
    }));
    const names = [...WORM_NAMES].sort(() => Math.random() - 0.5);
    const enemyWorms = [];
    for (let i = 0; i < en; i++) {
      enemyWorms.push({
        x: ex0 + (ex1 - ex0) * (en === 1 ? 0.5 : i / (en - 1)) + jitter(46),
        name: names[i], color: ENEMY_COLORS[i % ENEMY_COLORS.length], hat: HATS[(i + 3) % HATS.length],
      });
    }
    return { theme: themeKey, seed, difficulty, playerWorms, enemyWorms, challenge: null, worldW: W };
  }

  // ---------------- 挑战 ----------------
  buildChallengeScreen() {
    const s = $('menu-challenge');
    s.innerHTML = `<h2>🏅 挑战关卡</h2><div class="ch-list" id="ch-list"></div>
      <div class="menu-btns row"><button class="mbtn" id="ch-back">← 返回</button></div>`;
    $('ch-back').onclick = () => this.show('menu-title');
  }

  renderChallenges() {
    const list = $('ch-list');
    const save = loadSave();
    list.innerHTML = '';
    CHALLENGES.forEach((lv, i) => {
      const rank = save.challengeRanks[lv.id] || '-';
      const card = el('button', 'ch-card');
      card.innerHTML = `
        <div class="ch-num">${i + 1}</div>
        <div class="ch-info"><div class="ch-name">${lv.icon} ${lv.name}</div><div class="ch-desc">${lv.desc}</div></div>
        <div class="ch-rank r-${rank}">${rank}</div>`;
      card.onclick = () => { sfx('click'); this.hooks.startMatch(this.challengeConfig(lv)); };
      list.appendChild(card);
    });
  }

  challengeConfig(lv, stageIndex = 0) {
    if (lv.stages?.length) {
      const idx = Math.max(0, Math.min(lv.stages.length - 1, stageIndex | 0));
      const st = lv.stages[idx];
      return {
        theme: st.theme || lv.theme || 'islands',
        seed: st.seed ?? lv.seed ?? 1,
        difficulty: lv.difficulty || 'easy',
        playerWorms: (st.player ? [st.player] : []).map((p) => ({ ...p })),
        enemyWorms: (st.enemies || []).map((p) => ({ ...p, isAI: true })),
        challenge: lv,
        tutStage: idx,
        scene: st.scene,
        waterY: st.waterY,
        ammoPlayer: st.ammoPlayer,
        ammoEnemy: st.ammoEnemy,
        respawn: !!st.respawn,
      };
    }
    return {
      theme: lv.theme, seed: lv.seed, difficulty: lv.difficulty,
      playerWorms: lv.playerWorms.map((p) => ({ ...p })),
      enemyWorms: lv.enemies.map((p) => ({ ...p, isAI: true })),
      challenge: lv,
      scene: lv.scene,
      ammoPlayer: lv.ammoPlayer, ammoEnemy: lv.ammoEnemy,
    };
  }

  // ---------------- 战绩 ----------------
  buildStatsScreen() {
    const s = $('menu-stats');
    s.innerHTML = `<h2>📊 战绩</h2><div id="stats-body"></div>
      <div class="menu-btns row">
        <button class="mbtn small danger" id="stats-reset">🗑 重置战绩</button>
        <button class="mbtn" id="stats-back">← 返回</button>
      </div>`;
    $('stats-back').onclick = () => this.show('menu-title');
    $('stats-reset').onclick = () => {
      if (confirm('确定清空所有战绩与评级？')) { resetSave(); this.renderStats(); }
    };
  }

  renderStats() {
    const save = loadSave();
    const st = save.stats;
    const body = $('stats-body');
    const total = st.matches;
    const winRate = total ? Math.round(st.wins / total * 100) : 0;
    let weaponRows = '';
    for (const w of WEAPONS.filter(x => !x.hidden)) {
      const d = st.weaponDamage[w.id] || 0;
      const max = Math.max(1, ...WEAPONS.filter(x => !x.hidden).map(x => st.weaponDamage[x.id] || 0));
      weaponRows += `<div class="stat-row"><span class="stat-ic">${w.icon}</span><span class="stat-name">${w.name}</span>
        <div class="stat-bar"><div style="width:${(d / max * 100) || 0}%;background:${hexCss(w.id === 'holy' ? 0xffd23d : 0x4d96ff)}"></div></div>
        <span class="stat-num">${d}</span></div>`;
    }
    const ranks = CHALLENGES.map((lv) => {
      const r = save.challengeRanks[lv.id];
      return `<span class="ch-mini">${lv.icon}${r ? `<b class="r-${r}">${r}</b>` : '<i>·</i>'}</span>`;
    }).join('');
    const achList = Object.entries(ACHIEVEMENTS);
    const achGot = achList.filter(([id]) => save.achievements?.[id]).length;
    const achHtml = achList.map(([id, a]) => {
      const got = !!save.achievements?.[id];
      return `<div class="ach-row${got ? ' got' : ''}"><span class="ach-ic">${got ? a.icon : '🔒'}</span><span class="ach-name">${a.name}</span><span class="ach-desc">${a.desc}</span></div>`;
    }).join('');
    body.innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><b>${st.wins}</b><span>胜</span></div>
        <div class="stat-box"><b>${st.losses}</b><span>负</span></div>
        <div class="stat-box"><b>${winRate}%</b><span>胜率</span></div>
        <div class="stat-box"><b>${st.longestShot}</b><span>最远一击(px)</span></div>
      </div>
      <h3>武器总伤害</h3>${weaponRows}
      <h3>挑战评级</h3><div class="ch-ranks">${ranks}</div>
      <h3>成就（${achGot}/${achList.length}）</h3><div class="ach-grid">${achHtml}</div>`;
  }

  // ---------------- 设置 ----------------
  buildSettingsScreen() {
    const s = $('menu-settings');
    s.innerHTML = `<h2>⚙️ 设置</h2>
      <div class="set-rows" id="set-rows"></div>
      <div class="menu-btns row"><button class="mbtn" id="set-back">← 返回</button></div>`;
    $('set-back').onclick = () => this.show(this.returnTo);
  }

  renderSettings() {
    const save = loadSave();
    const st = save.settings;
    const rows = $('set-rows');
    rows.innerHTML = '';
    const slider = (label, key, cb) => {
      const row = el('div', 'set-row');
      row.innerHTML = `<span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${st[key]}">`;
      row.querySelector('input').oninput = (e) => { st[key] = +e.target.value; persist(); cb?.(); };
      rows.appendChild(row);
    };
    const toggle = (label, key, cb) => {
      const row = el('div', 'set-row');
      const b = el('button', 'toggle' + (st[key] ? ' on' : ''), st[key] ? '开' : '关');
      b.onclick = () => { st[key] = !st[key]; persist(); b.className = 'toggle' + (st[key] ? ' on' : ''); b.textContent = st[key] ? '开' : '关'; sfx('click'); cb?.(); };
      row.append(el('span', '', label), b);
      rows.appendChild(row);
    };
    slider('🔊 音效音量', 'sfx', () => setVolumes(st.sfx, st.music));
    slider('🎵 音乐音量', 'music', () => setVolumes(st.sfx, st.music));
    toggle('📳 屏幕震动', 'shake', () => { this.hooks.game.camera.enabled = st.shake; });
    toggle('📈 弹道预览', 'trajectory');
    toggle('⏩ AI 回合加速', 'aiFast', () => { this.hooks.game.aiFast = st.aiFast; });
    // 桌面力度控制方式
    const prow = el('div', 'set-row');
    prow.innerHTML = `<span>🖱 桌面力度控制</span>
      <select id="set-powermode">
        <option value="drag">拖拽距离（精确，推荐）</option>
        <option value="hold">按住蓄力（经典摆动）</option>
      </select>`;
    prow.querySelector('select').value = st.powerMode || 'drag';
    prow.querySelector('select').onchange = (e) => { st.powerMode = e.target.value; persist(); };
    rows.appendChild(prow);
    setVolumes(st.sfx, st.music);
  }

  // ---------------- 暂停 ----------------
  buildPauseScreen() {
    const s = $('menu-pause');
    s.innerHTML = `<h2>⏸ 暂停</h2>
      <div class="menu-btns col">
        <button class="mbtn big" id="p-resume">▶ 继续战斗</button>
        <button class="mbtn" id="p-restart">🔄 重新开始</button>
        <button class="mbtn" id="p-settings">⚙️ 设置</button>
        <button class="mbtn danger" id="p-quit">🏠 回主菜单</button>
      </div>`;
    $('p-resume').onclick = () => { sfx('click'); this.hideAll(); this.hooks.resumeGame(); };
    $('p-restart').onclick = () => { sfx('click'); this.hideAll(); this.hooks.restartMatch(); };
    $('p-settings').onclick = () => { this.returnTo = 'menu-pause'; this.show('menu-settings'); this.renderSettings(); };
    $('p-quit').onclick = () => { sfx('click'); this.hideAll(); this.hooks.quitToTitle(); };
  }

  showPause() { this.show('menu-pause'); }
}

function jitter(n) { return (Math.random() * 2 - 1) * n; }
function hexCss(num) {
  return '#' + num.toString(16).padStart(6, '0');
}
function hatIcon(h) {
  return { cap: '🧢', bow: '🎀', tophat: '🎩', flower: '🌸', helmet: '⛑️', bandana: '🔴' }[h] || '🧢';
}
function hatName(h) {
  return { cap: '棒球帽', bow: '蝴蝶结', tophat: '礼帽', flower: '小花', helmet: '钢盔', bandana: '头带' }[h] || h;
}
