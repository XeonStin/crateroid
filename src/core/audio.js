// ============ WebAudio 程序化音效 + Chiptune BGM 序列器 ============

let ctx = null, master = null, sfxGain = null, musicGain = null;
let unlocked = false;
let _noiseBuf = null;

export function initAudio(sfxVol = 0.8, musicVol = 0.5) {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = musicVol; musicGain.connect(master);
    startMusicLoop();
  } catch { /* 无音频环境 */ }
}

// 移动端首次触摸解锁
export function unlockAudio() {
  if (unlocked || !ctx) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
  unlocked = true;
  if (ctx.state === 'suspended') ctx.resume();
}

export function setVolumes(sfxVol, musicVol) {
  if (sfxGain) sfxGain.gain.value = sfxVol;
  if (musicGain) musicGain.gain.value = musicVol;
}

function now() { return ctx.currentTime; }

function env(g, t0, a, d, peak = 1) {
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + a + d);
}

function osc(type, f0, t0, dur, vol, f1, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0);
  if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  env(g, t0, 0.005, dur, vol);
  o.connect(g); g.connect(dest || sfxGain);
  o.start(t0); o.stop(t0 + dur + 0.1);
  return o;
}

function noise(t0, dur, vol, filterFreq, sweepTo) {
  // 复用 1 秒白噪声缓冲：爆炸/喷气等高频音效不再每次分配大 buffer
  if (!_noiseBuf) {
    const len = Math.max(1, ctx.sampleRate | 0);
    _noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = _noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = _noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(filterFreq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = ctx.createGain(); env(g, t0, 0.005, dur, vol);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.1);
}

// ---------------- SFX 库 ----------------
export function sfx(name, opt = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const t = now();
  switch (name) {
    case 'shoot':    osc('square', 520, t, 0.14, 0.25, 160); noise(t, 0.1, 0.12, 3000, 600); break;
    case 'exploBig':  noise(t, 0.65, 0.85, 2200, 90); osc('sine', 110, t, 0.5, 0.7, 32); break;
    case 'explo':     noise(t, 0.42, 0.6, 2600, 120); osc('sine', 150, t, 0.32, 0.5, 45); break;
    case 'exploTiny': noise(t, 0.2, 0.3, 3000, 300); osc('sine', 300, t, 0.15, 0.25, 90); break;
    case 'bounce':    osc('square', 340, t, 0.05, 0.14, 240); break;
    case 'jump':      osc('sine', 260, t, 0.16, 0.2, 560); break;
    case 'boing':     osc('triangle', 180, t, 0.2, 0.22, 420); break;
    case 'splash':    noise(t, 0.4, 0.35, 1400, 300); osc('sine', 500, t, 0.2, 0.12, 120); break;
    case 'pickup':    [523, 659, 784].forEach((f, i) => osc('square', f, t + i * 0.07, 0.1, 0.16)); break;
    case 'click':     osc('square', 800, t, 0.04, 0.1); break;
    case 'tick':      osc('square', 1100, t, 0.05, 0.14); break;
    case 'hurt':      osc('sawtooth', 380, t, 0.18, 0.22, 130); break;
    case 'death':     [392, 330, 262, 196].forEach((f, i) => osc('triangle', f, t + i * 0.12, 0.16, 0.2)); break;
    case 'drown':     noise(t, 0.5, 0.3, 900, 200); osc('sine', 300, t + 0.1, 0.3, 0.15, 80); break;
    case 'fuse':      noise(t, 0.12, 0.06, 5000); break;
    case 'holy':      [261, 329, 392, 523].forEach(f => { osc('sawtooth', f, t, 1.4, 0.07); osc('sawtooth', f * 1.005, t, 1.4, 0.07); }); break;
    case 'moo':       osc('sawtooth', 160, t, 0.5, 0.3, 90); osc('sawtooth', 164, t, 0.5, 0.2, 95); break;
    case 'shotgun':   noise(t, 0.18, 0.5, 4000, 500); osc('square', 220, t, 0.1, 0.3, 60); break;
    case 'plane':     osc('sawtooth', 90, t, 1.6, 0.14, 130); noise(t, 1.5, 0.08, 600); break;
    case 'drill':     noise(t, 0.5, 0.25, 1800, 900); osc('square', 90, t, 0.45, 0.14, 70); break;
    case 'win':       [523, 659, 784, 1046, 784, 1046].forEach((f, i) => osc('square', f, t + i * 0.13, 0.18, 0.2)); break;
    case 'lose':      [392, 349, 311, 262].forEach((f, i) => osc('sawtooth', f, t + i * 0.22, 0.3, 0.16)); break;
    case 'voice': {   // 虫虫啾啾声
      const f = (opt.pitch || 1) * (440 + Math.random() * 260);
      osc('sine', f, t, 0.09, 0.12, f * 1.3);
      break;
    }
    case 'jet':       noise(t, 0.1, 0.12, 1200, 500); break;
    case 'crate':     osc('triangle', 660, t, 0.1, 0.15, 440); break;
  }
}

// ---------------- BGM 双轨序列器 ----------------
// 五声音阶萌系小曲：低音三角波 + 旋律方波，130 BPM
const SCALE = [0, 2, 4, 7, 9]; // 大调五声
const BASS_PAT  = [0, 0, 3, 3, 4, 4, 3, 3];
const MEL_PAT = [
  [0, 2, 1, 2], [4, 2, 1, 0], [2, 1, 2, 4], [2, 0, 0, null],
  [1, 2, 4, 2], [4, 7 % 5, 4, 2], [1, 0, 1, 2], [0, null, null, null],
];
let musicTimer = null, step = 0, musicMode = 'battle';
const STEP_MS = 60000 / 130 / 2; // 八分音符

function noteFreq(deg, octave) {
  if (deg == null) return null;
  const o = Math.floor(deg / SCALE.length);
  const semi = SCALE[((deg % SCALE.length) + SCALE.length) % SCALE.length] + o * 12;
  return 220 * Math.pow(2, (semi + octave * 12) / 12);
}

function startMusicLoop() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running' || musicGain.gain.value <= 0.001) return;
    if (document.hidden) return;
    const t = now() + 0.05;
    const bar = Math.floor(step / 4) % 8, beat = step % 4;
    // 低音
    const b = noteFreq(BASS_PAT[bar], -12);
    if (b) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle';
      o.frequency.value = b; env(g, t, 0.01, STEP_MS / 1000 * 0.9, 0.16);
      o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + STEP_MS / 1000); }
    // 旋律（战斗模式每步都响，菜单模式每 2 步）
    if (musicMode === 'battle' || beat % 2 === 0) {
      const m = noteFreq(MEL_PAT[bar][beat], 12);
      if (m) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square';
        o.frequency.value = m; env(g, t, 0.01, STEP_MS / 1000 * 0.8, 0.05);
        o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + STEP_MS / 1000); }
    }
    step = (step + 1) % 32;
  }, STEP_MS);
}

export function setMusicMode(mode) { musicMode = mode; }
