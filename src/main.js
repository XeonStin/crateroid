// ============ 引导：Pixi 初始化 / 主循环 / 输入接线 / 调试面板 ============
import * as PIXI from 'pixi.js';
import { Camera } from './core/camera.js';
import { Input } from './core/input.js';
import { TouchControls } from './core/touch.js';
import { Game } from './core/game.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { loadSave, persist } from './core/save.js';
import { initAudio, unlockAudio, setVolumes, setMusicMode, setMusicTheme, sfx } from './core/audio.js';
import { WEAPONS } from './config.js';
import * as planner from './ai/planner.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
window.__boot = ['imported'];

// 手机浏览器地址栏/工具栏会改变可视高度：以 visualViewport 为准，
// 避免画布比实际可视区域大、相机中心落到屏幕外（表现为只看到天空）。
function readViewportSize() {
  const vv = window.visualViewport;
  const w = vv?.width || document.documentElement.clientWidth || window.innerWidth || 1;
  const h = vv?.height || document.documentElement.clientHeight || window.innerHeight || 1;
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

async function boot() {
  window.__boot.push('boot-start');
  const save = loadSave();
  const settings = save.settings;
  const mobile = TouchControls.isTouchDevice;
  const vp0 = readViewportSize();
  document.documentElement.style.setProperty('--vvw', `${vp0.w}px`);
  document.documentElement.style.setProperty('--vvh', `${vp0.h}px`);

  // ---- Pixi ----
  const app = new PIXI.Application();
  await app.init({
    width: vp0.w,
    height: vp0.h,
    backgroundAlpha: 0,
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
    onDash: () => game && game.onDashBtn(),
  });

  const game = new Game({ app, layers, camera, input, touch, settings, mobile });
  game.hud = new HUD(game);
  game.touch = touch;
  touch.game = game;
  if (mobile) document.body.classList.add('touch');

  let lastCfg = null;
  const menus = new Menus({
    game,
    startMatch(cfg) {
      sfx('click');
      lastCfg = cfg;
      menus.hideAll();
      game.paused = false;
      game.hud.hideGameover();
      game.hud.show();
      game.startMatch(cfg);
      game.hud.updateTeamPips(game.worms);
      game._pipsDirty = false;
    },
    resumeGame() { game.paused = false; },
    restartMatch() { if (lastCfg) { game.hud.hideGameover(); game.startMatch(lastCfg); } game.paused = false; },
    quitToTitle() {
      game.running = false; game.paused = false;
      setMusicMode('menu');
      setMusicTheme('islands');
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
  input.onStickStart = () => game.onStickStart();
  input.onStickMove = (a, p) => game.onStickMove(a, p);
  input.onStickEnd = (a, p) => game.onStickEnd(a, p);
  input.onTapAim = (wx, wy) => game.onTapAim(wx, wy);
  input.onTarget = (wx, wy) => game.onTarget(wx, wy);
  input.onZoom = (mx, my, dy, continuous) => game.onZoom(mx, my, dy, continuous);
  input.onPan = (dx, dy) => game.onPan(dx, dy);
  input.onJumpPress = () => game.onJumpPress();
  input.onDigit = (n) => { const w = WEAPONS[n - 1]; if (w) game.selectWeapon(w.id); };
  input.onWeaponMenu = () => document.getElementById('weapon-bar').classList.toggle('collapsed');
  input.onCancelKey = () => { game.cancelTargeting(); game.onAimCancel(); };
  input.onDashKey = (dir) => game.tryDash(dir);
  input.onAimNudge = (dir, fine) => game.nudgeAim(dir, fine);
  input.onSkipKey = () => game.skipTurn();

  // ---- 音频解锁 ----
  const audioKick = () => {
    initAudio(settings.sfx, settings.music);
    unlockAudio();
    setVolumes(settings.sfx, settings.music);
  };
  window.addEventListener('pointerdown', audioKick, { once: false });
  window.addEventListener('keydown', audioKick, { once: false });

  // ---- 尺寸：以 visualViewport 为准（地址栏伸缩/横竖屏切换都同步） ----
  let lastPortrait = vp0.h > vp0.w;
  let lastVpW = 0, lastVpH = 0;
  let vpRaf = 0;
  const applyViewport = () => {
    const { w, h } = readViewportSize();
    const dimsChanged = w !== lastVpW || h !== lastVpH;
    if (dimsChanged) {
      lastVpW = w; lastVpH = h;
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--vvw', `${w}px`);
      rootStyle.setProperty('--vvh', `${h}px`);
    }
    if (dimsChanged || Math.abs(app.screen.width - w) > 0.5 || Math.abs(app.screen.height - h) > 0.5) {
      app.renderer.resize(w, h);
    }
    if (dimsChanged || Math.abs(camera.viewW - w) > 0.5 || Math.abs(camera.viewH - h) > 0.5) {
      camera.resize(w, h);
    }
    const portrait = h > w;
    if (portrait !== lastPortrait) {
      lastPortrait = portrait;
      if (game.running) {
        const z = camera.defaultZoom();
        camera.zoom = z; camera.tzoom = z;
        if (game.currentWorm) game.frameTurnCamera(game.currentWorm);
      }
    }
  };
  const syncViewport = () => {
    // 先同步一次：部分手机 WebView 在切后台/地址栏动画时 rAF 会被暂停，
    // 只靠 rAF 会导致画面尺寸和相机尺寸长期不一致。
    applyViewport();
    if (vpRaf) return;
    vpRaf = requestAnimationFrame(() => { vpRaf = 0; applyViewport(); });
  };
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', () => {
    syncViewport();
    setTimeout(syncViewport, 250);
    setTimeout(syncViewport, 650);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
  // 兜底轮询：即使浏览器没有派发 resize（部分 WebView / 自动化环境），也能在 0.5s 内纠正
  setInterval(syncViewport, 500);
  syncViewport();

  // ---- 主循环：固定步长 ----
  // 注意：不以 document.hidden 作为门控——rAF 本身只在可见时触发，
  // 而部分手机内置 WebView（微信/QQ）会误报 hidden，导致整个游戏冻结。
  const FIXED = 1 / 60;
  let last = performance.now(), acc = 0;
  let lastFrameAt = last;
  const menusVisible = () => !menus.root.classList.contains('hidden');

  app.ticker.add(() => {
    // 每帧兜底检查可视区域：部分手机浏览器在地址栏伸缩时不会派发 resize
    applyViewport();
    const now = performance.now();
    lastFrameAt = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!menusVisible() && game.running && !game.paused) {
      // timeScale：击杀慢镜头只乘在累积器上（固定步长与 6 步 guard 不变）
      acc += dt * (game.timeScale || 1);
      let guard = 0;
      while (acc >= FIXED && guard++ < 6) { game.update(FIXED); acc -= FIXED; }
    } else {
      acc = 0;
    }
    camera.applyTo(layers.world);
    if (DEBUG) debugTick(dt);
  });
  // 兜底：rAF 停转（真后台/被节流）超过 400ms 时用定时器补步进
  // 必须按固定步长逐步步进：单步 dt=1/6s 会让虫虫一帧下落 ~150px 直接穿透浮岛
  setInterval(() => {
    const stalled = performance.now() - lastFrameAt > 400;
    if ((stalled || document.hidden) && game.running && !game.paused && !menusVisible()) {
      lastFrameAt = performance.now();
      for (let i = 0; i < 10; i++) game.update(FIXED);
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
