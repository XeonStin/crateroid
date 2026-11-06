// ============ 引导：Pixi 初始化 / 主循环 / 输入接线 / 调试面板 ============
import * as PIXI from 'pixi.js';
import { Camera } from './core/camera.js';
import { Input } from './core/input.js';
import { TouchControls } from './core/touch.js';
import { Game } from './core/game.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { loadSave, persist } from './core/save.js';
import { initAudio, unlockAudio, setVolumes, sfx } from './core/audio.js';
import { WEAPONS } from './config.js';
import * as planner from './ai/planner.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
window.__boot = ['imported'];

async function boot() {
  window.__boot.push('boot-start');
  const save = loadSave();
  const settings = save.settings;
  const mobile = TouchControls.isTouchDevice;

  // ---- Pixi ----
  const app = new PIXI.Application();
  await app.init({
    backgroundAlpha: 0,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: 'webgl',
  });
  document.getElementById('game-canvas').appendChild(app.canvas);
  window.__boot.push('pixi-init-ok');

  // WebGL 上下文丢失兜底（手机切后台/内存紧张时常见，页面会变全空）
  app.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (document.getElementById('gl-lost')) return;
    const d = document.createElement('div');
    d.id = 'gl-lost';
    d.innerHTML = `<div class="go-card">
      <div style="font-size:22px">⚠️ 渲染中断</div>
      <p style="margin:10px 0;opacity:.8;font-size:14px">图形上下文丢失（切后台或内存不足时常见）</p>
      <button class="mbtn big" id="gl-reload">🔄 重新加载</button></div>`;
    document.body.appendChild(d);
    document.getElementById('gl-reload').onclick = () => location.reload();
  });

  // ---- 图层 ----
  const layers = { sky: new PIXI.Container(), world: new PIXI.Container() };
  app.stage.addChild(layers.sky);
  app.stage.addChild(layers.world);

  // ---- 核心 ----
  const camera = new Camera();
  const input = new Input(app.canvas, camera);
  const touch = new TouchControls(input, {
    onWeaponPanel: () => document.getElementById('weapon-bar').classList.toggle('collapsed'),
    onSkip: () => game && game.skipTurn(),
  });

  const game = new Game({ app, layers, camera, input, touch, settings, mobile });
  game.hud = new HUD(game);
  game.touch = touch;
  touch.game = game;
  if (mobile) document.body.classList.add('touch');

  let lastCfg = null;
  const menus = new Menus({
    startMatch(cfg) {
      sfx('click');
      lastCfg = cfg;
      menus.hideAll();
      game.paused = false;
      game.hud.hideGameover();
      game.hud.show();
      game.startMatch(cfg);
      game.hud.updateTeamPips(game.worms);
    },
    resumeGame() { game.paused = false; },
    restartMatch() { if (lastCfg) { game.hud.hideGameover(); game.startMatch(lastCfg); } game.paused = false; },
    quitToTitle() {
      game.running = false; game.paused = false;
      game.hud.hide();
      menus.show('menu-title');
    },
  });
  game.menus = menus;

  // 结算按钮
  document.getElementById('go-retry').onclick = () => { sfx('click'); menus.hooks.restartMatch(); };
  document.getElementById('go-menu').onclick = () => { sfx('click'); menus.hooks.quitToTitle(); game.hud.hideGameover(); };

  // ---- 输入接线 ----
  input.onAimDrag = (dx, dy) => game.onAimDrag(dx, dy);
  input.onAimRelease = (dx, dy) => game.onAimRelease(dx, dy);
  input.onAimCancel = () => game.onAimCancel();
  input.onAimMove = (wx, wy) => game.onAimMove(wx, wy);
  input.onChargeStart = (wx, wy) => game.onChargeStart(wx, wy);
  input.onChargeEnd = () => game.onChargeEnd();
  input.onTarget = (wx, wy) => game.onTarget(wx, wy);
  input.onZoom = (mx, my, dy) => game.onZoom(mx, my, dy);
  input.onPan = (dx, dy) => game.onPan(dx, dy);
  input.onJumpPress = () => game.onJumpPress();
  input.onDigit = (n) => { const w = WEAPONS[n - 1]; if (w) game.selectWeapon(w.id); };
  input.onWeaponMenu = () => document.getElementById('weapon-bar').classList.toggle('collapsed');
  input.onCancelKey = () => { game.cancelTargeting(); game.onAimCancel(); };
  input.onDashKey = (dir) => game.tryDash(dir);

  // ---- 音频解锁 ----
  const audioKick = () => {
    initAudio(settings.sfx, settings.music);
    unlockAudio();
    setVolumes(settings.sfx, settings.music);
  };
  window.addEventListener('pointerdown', audioKick, { once: false });
  window.addEventListener('keydown', audioKick, { once: false });

  // ---- 尺寸 ----
  const onResize = () => camera.resize(app.screen.width, app.screen.height);
  window.addEventListener('resize', onResize);
  onResize();

  // ---- 主循环：固定步长 ----
  // 注意：不以 document.hidden 作为门控——rAF 本身只在可见时触发，
  // 而部分手机内置 WebView（微信/QQ）会误报 hidden，导致整个游戏冻结。
  const FIXED = 1 / 60;
  let last = performance.now(), acc = 0;
  let lastFrameAt = last;
  const menusVisible = () => !menus.root.classList.contains('hidden');

  app.ticker.add(() => {
    const now = performance.now();
    lastFrameAt = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!menusVisible() && game.running && !game.paused) {
      acc += dt;
      let guard = 0;
      while (acc >= FIXED && guard++ < 6) { game.update(FIXED); acc -= FIXED; }
    } else {
      acc = 0;
    }
    camera.applyTo(layers.world);
    if (DEBUG) debugTick(dt);
  });
  // 兜底：rAF 停转（真后台/被节流）超过 400ms 时用定时器补步进
  setInterval(() => {
    const stalled = performance.now() - lastFrameAt > 400;
    if ((stalled || document.hidden) && game.running && !game.paused && !menusVisible()) {
      lastFrameAt = performance.now();
      game.update(FIXED * 10);
    }
  }, 250);

  // ---- 调试面板 / 自动化钩子 ----
  if (DEBUG) buildDebugPanel(game, app);
  window.__crateroid = {
    game, app, menus, camera, planner,
    screenshot: (name = 'shot') => shot(game.app, name),
    state: () => ({
      running: game.running, state: game.state, turn: game.turnCount,
      worms: game.worms?.map(w => ({ name: w.name, team: w.team, hp: w.hp, alive: w.alive, x: w.x, y: w.y })),
      wind: game.wind, projectiles: game.projectiles.length,
    }),
    startQuick: (difficulty = 'normal', theme = 'islands') => {
      menus.hooks.startMatch(menus.buildMatchConfig(theme, 20260000 + Math.floor(Math.random() * 999), difficulty));
    },
  };
  if (params.get('quick')) {
    // 自动化快速开局
    setTimeout(() => window.__crateroid.startQuick(params.get('diff') || 'normal', params.get('theme') || 'islands'), 300);
  }
  if (params.get('auto')) game.debugAuto = true;

  setVolumes(settings.sfx, settings.music);
}

// ---------------- 调试面板 ----------------
let debugTick = () => {};
function buildDebugPanel(game, app) {
  const p = document.createElement('div');
  p.id = 'debug-panel';
  p.innerHTML = `
    <b>🛠 DEBUG</b>
    <div id="dbg-state">-</div>
    <button id="dbg-auto">🤖 双方自动对战</button>
    <button id="dbg-fast">⏩ AI 快进</button>
    <button id="dbg-wind">🌪 换风</button>
    <button id="dbg-shot">📸 截图</button>
    <button id="dbg-skip">⏭ 强制跳过</button>`;
  document.body.appendChild(p);
  const st = p.querySelector('#dbg-state');
  debugTick = () => {
    st.textContent = `${game.running ? game.state : 'idle'} | T${game.turnCount ?? 0} | 风${(game.wind ?? 0).toFixed(2)} | 弹${game.projectiles?.length ?? 0}`;
  };
  p.querySelector('#dbg-auto').onclick = () => { game.debugAuto = !game.debugAuto; };
  p.querySelector('#dbg-fast').onclick = () => { game.aiFast = !game.aiFast; };
  p.querySelector('#dbg-wind').onclick = () => { game.wind = (Math.random() * 2 - 1); game.hud?.setWind(game.wind); };
  p.querySelector('#dbg-shot').onclick = () => shot(app, 'debug');
  p.querySelector('#dbg-skip').onclick = () => game.skipTurn();
}

async function shot(app, name) {
  try {
    const canvas = app.renderer.extract.canvas(app.stage);
    const url = canvas.toDataURL('image/png');
    const blob = await (await fetch(url)).blob();
    const res = await fetch(`/__save?name=${encodeURIComponent(name + '-' + Date.now())}.png`, { method: 'POST', body: blob });
    const j = await res.json();
    console.log('[shot]', j.path);
    return j.path;
  } catch (e) {
    console.warn('shot failed', e);
  }
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML += `<pre style="color:#f66;padding:20px">启动失败: ${e.message}\n${e.stack}</pre>`;
});
