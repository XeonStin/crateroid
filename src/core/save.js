// ============ localStorage 存档：战绩 / 设置 / 挑战评级 ============
const KEY = 'crateroid.save.v1';

const DEFAULTS = {
  settings: {
    sfx: 0.8, music: 0.5, shake: true,
    aimMode: 'slingshot',      // 触屏: slingshot 弹弓 | charge 拖拽+开火键
    powerMode: 'drag',         // 桌面力度: drag 拖拽距离（精确）| hold 按住蓄力（经典摆动）
    trajectory: true,          // 弹道预览
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

export function loadSave() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // 深合并：老存档缺新字段时补默认值
    cache = {
      ...structuredClone(DEFAULTS),
      ...parsed,
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      stats: { ...DEFAULTS.stats, ...(parsed.stats || {}) },
      achievements: { ...(parsed.achievements || {}) },
    };
  } catch {
    cache = structuredClone(DEFAULTS);
  }
  return cache;
}

export function persist() {
  if (!cache) return;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 隐私模式忽略 */ }
}

export function recordMatch(win) {
  const s = loadSave().stats;
  s.matches++;
  if (win === 1) s.wins++; else if (win === -1) s.losses++; else s.draws++;
  persist();
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
  persist();
  return true;
}

// 教学关卡完成
export function completeTutorial(id) {
  const s = loadSave();
  if (!s.tutorials) s.tutorials = {};
  if (s.tutorials[id]) return false;
  s.tutorials[id] = Date.now();
  persist();
  return true;
}

export function setChallengeRank(levelId, rank) {
  const r = loadSave().challengeRanks;
  const order = { S: 3, A: 2, B: 1 };
  if (!r[levelId] || order[rank] > order[r[levelId]]) { r[levelId] = rank; persist(); }
}

export function resetSave() {
  cache = structuredClone(DEFAULTS);
  persist();
}
