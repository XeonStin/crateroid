// ============ localStorage 存档：战绩 / 设置 / 挑战评级 ============
const KEY = 'crateroid.save.v1';

const DEFAULTS = {
  settings: {
    sfx: 0.8, music: 0.5, shake: true,
    aimMode: 'slingshot',      // （已废弃）旧版触屏瞄准模式，现为固定双摇杆；保留兼容旧存档
    powerMode: 'drag',         // 桌面力度: drag 拖拽距离（精确）| hold 按住蓄力（经典摆动）
    trajectory: true,          // 弹道预览
    aiFast: false,             // AI 回合加速 ×4（对局内 ⏩ 按钮同款）
  },
  stats: {
    wins: 0, losses: 0, draws: 0, matches: 0,
    weaponDamage: {},          // weaponId -> 累计伤害
    longestShot: 0,            // 最远一击 px
  },
  achievements: {},            // id -> 解锁时间戳
  tutorials: {},               // 教学关卡完成记录
  challengeRanks: {},          // levelId -> 'S'|'A'|'B'
};

let cache = null;

// 老 WebView 可能没有 structuredClone：回退到 JSON 深拷贝
function cloneDefaults() {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(DEFAULTS); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

export function loadSave() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // 深合并：老存档缺新字段时补默认值；子对象可能被写成 null（脏档），统一防御
    const obj = (v) => (v && typeof v === 'object') ? v : {};
    cache = {
      ...cloneDefaults(),
      ...parsed,
      settings: { ...DEFAULTS.settings, ...obj(parsed.settings) },
      stats: { ...DEFAULTS.stats, ...obj(parsed.stats), weaponDamage: obj(parsed.stats?.weaponDamage) },
      achievements: obj(parsed.achievements),
      tutorials: obj(parsed.tutorials),
      challengeRanks: obj(parsed.challengeRanks),
    };
  } catch {
    cache = cloneDefaults();
  }
  return cache;
}

let _saveTimer = null;

function writeNow() {
  if (!cache) return;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 隐私模式忽略 */ }
}

// 高频统计（每次伤害）用 300ms 合并写；关键进度（通关/成就）用 persistNow
export function persist() {
  if (!cache) return;
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    writeNow();
  }, 300);
}

export function persistNow() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  writeNow();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistNow);
  window.addEventListener('beforeunload', persistNow);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persistNow();
  });
}

export function recordMatch(win) {
  const s = loadSave().stats;
  s.matches++;
  if (win === 1) s.wins++; else if (win === -1) s.losses++; else s.draws++;
  persistNow();
}

export function recordWeaponDamage(weaponId, dmg) {
  const s = loadSave().stats;
  s.weaponDamage[weaponId] = (s.weaponDamage[weaponId] || 0) + Math.round(dmg);
  persist();
}

export function recordLongestShot(dist) {
  const s = loadSave().stats;
  if (dist > s.longestShot) { s.longestShot = Math.round(dist); persist(); return true; }
  return false;
}

// 解锁成就；返回是否首次解锁
export function unlockAchievement(id) {
  const s = loadSave();
  if (!s.achievements) s.achievements = {};
  if (s.achievements[id]) return false;
  s.achievements[id] = Date.now();
  persistNow();
  return true;
}

// 教学关卡完成
export function completeTutorial(id) {
  const s = loadSave();
  if (!s.tutorials) s.tutorials = {};
  if (s.tutorials[id]) return false;
  s.tutorials[id] = Date.now();
  persistNow();
  return true;
}

export function setChallengeRank(levelId, rank) {
  const r = loadSave().challengeRanks;
  const order = { S: 3, A: 2, B: 1 };
  if (!r[levelId] || order[rank] > order[r[levelId]]) { r[levelId] = rank; persistNow(); }
}

export function resetSave() {
  // 只清空战绩与挑战评级；设置/成就/教学进度保留（按钮文案也是如此）
  const s = loadSave();
  const fresh = cloneDefaults();
  s.stats = fresh.stats;
  s.challengeRanks = fresh.challengeRanks;
  persistNow();
}
