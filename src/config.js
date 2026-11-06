// ============ 弹坑星球 CRATEROID — 全局配置 ============

export const WORLD_W = 1800;
export const WORLD_H = 1000;

// 普通对战可选地图宽度（高度保持 1000，主题地形的基准高度不变）
// 选「自定义」时用滑块在 500~2000 之间任调（选图界面）
export const MAP_SIZES = {
  small:  { name: '小', w: 800, desc: '贴脸混战，一屏看完' },
  medium: { name: '中', w: 1800, desc: '标准战场' },
  large:  { name: '大', w: 2400, desc: '远程对轰，弹道空间更大' },
};
export const MAP_W_MIN = 500;
export const MAP_W_MAX = 2000;

export const GRAVITY = 900;          // px/s²
export const WORM_R = 11;            // 虫虫碰撞半径
export const WALK_SPEED = 88;        // px/s
export const JUMP_VY = -400;
export const AIR_CONTROL = 64;       // 空中左右控制（斜向跳跃）px/s
export const DASH_SPEED = 430;       // 冲刺速度
export const DASH_TIME = 0.28;       // 冲刺时长
export const MAX_FALL_NO_DMG = 650;  // 超过此落地速度开始摔伤（调高=摔伤更宽松）
export const FALL_DMG_K = 0.042;     // 摔伤系数（调低=伤害更小）
export const WIND_MAX_ACC = 230;     // wind=1 时的水平加速度 px/s²

export const TURN_TIME = 45;         // 每回合操作秒数
export const RETREAT_TIME = 5;       // 发射后撤退秒数
export const BANNER_TIME = 1.5;
export const SUDDEN_DEATH_ROUND = 11; // 第 N 回合进入突死（回合=双方各行动一轮）
export const SUDDEN_DEATH_HP = 25;   // 突死全员压到该 HP（还剩 1~2 发的博弈，不是抢先手抽签）
export const WATER_RISE = 48;        // 突死每回合上涨 px（水面 y 每回合减小值；熔岩图 ×waterRiseMult）
export const CRATE_CHANCE = 0.3;     // 每回合补给箱概率
export const MAX_CRATES = 2;

export const STEP_UP = 8;            // 自动爬坡高度
export const SUBSTEPS = 4;           // 投射物每帧子步

// ---------------- 武器表 ----------------
export const WEAPONS = [
  { id: 'bazooka',  name: '火箭弹',   icon: '🚀', ammo: Infinity, charge: true,  wind: 1.0,  gravity: 1.0,  bounce: false, radius: 46, dmg: 48 },
  { id: 'grenade',  name: '手雷',     icon: '💣', ammo: Infinity, charge: true,  wind: 0.15, gravity: 1.0,  bounce: true,  fuse: 3.0,  radius: 42, dmg: 44 },
  { id: 'cluster',  name: '集束炸弹', icon: '🧨', ammo: 2, charge: true,  wind: 0.1,  gravity: 1.0,  bounce: false, fuse: 2.2, radius: 30, dmg: 26, cluster: 5 },
  // 散弹枪：瞬发 5 弹丸散布；每颗命中虫虫单发伤害，命中地形打小洞
  { id: 'shotgun',  name: '散弹枪',   icon: '🔫', ammo: 3, hitscan: true, shots: 2, pellets: 5, spread: 5.5, dmg: 11, kb: 60, range: 260, crater: 13 },
  { id: 'airstrike',name: '空袭',     icon: '✈️', ammo: 2, targeting: true, bombs: 5, radius: 36, dmg: 32 },
  { id: 'driller',  name: '钻地弹',   icon: '⛏️', ammo: 2, charge: true,  wind: 0,    gravity: 0.55, bounce: false, radius: 24, dmg: 30, drill: 90 },
  { id: 'holy',     name: '神圣手雷', icon: '🐑', ammo: 0, charge: true,  wind: 0.15, gravity: 1.0,  bounce: true,  fuse: 3.0,  radius: 84, dmg: 78, holy: true },
  { id: 'cow',      name: '奶牛空袭', icon: '🐮', ammo: 0, targeting: true, bounces: 5, dmg: 26, radius: 40 },
  // 传送：点地图任意可站立点瞬移（消耗回合）；点无效位置不扣弹、可重新标记
  { id: 'teleport', name: '传送',     icon: '🌀', ammo: 1, targeting: true, teleport: true },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
// 内部隐藏弹种（不在武器栏出现）
WEAPON_BY_ID.bomblet = { id: 'bomblet', name: '子雷', icon: '•', hidden: true, ammo: 0, wind: 0.4, gravity: 1, bounce: false, radius: 26, dmg: 24 };
WEAPON_BY_ID.bomb = { id: 'bomb', name: '航空炸弹', icon: '•', hidden: true, ammo: 0, wind: 0.3, gravity: 1, bounce: false, radius: 36, dmg: 32 };

// 武器箱可开出的弹药（权重）
export const CRATE_WEAPON_DROPS = [
  ['cluster', 1, 3], ['shotgun', 2, 3], ['airstrike', 1, 3],
  ['driller', 1, 2], ['holy', 1, 2], ['cow', 1, 2],
];

export const CRATE_TYPES = [
  { id: 'health', icon: '❤️', color: 0xff5a76, weight: 4 },
  { id: 'weapon', icon: '🎁', color: 0xffb545, weight: 4 },
  { id: 'tool',   icon: '🔧', color: 0x53c8ff, weight: 2 },
];

// ---------------- 地图主题 ----------------
// windScale: 该地图风力倍率；decor: 地表装饰物；地形高度按世界 1800×1000 缩放
export const THEMES = {
  islands: {
    name: '翠绿群岛', icon: '🏝️',
    sky: ['#7ec8f7 0%', '#bfe8ff 55%', '#e8f7ff 100%'],
    top: 0x58c24f, top2: 0x7ee06f, body: 0x8a5a33, body2: 0x6e4526, speck: 0xa8794a,
    water: 0x2f86d6, waterAlpha: 0.75, waterDeep: 0x155a9e,
    clouds: true, stars: 0, aurora: false, embers: false,
    base: 470, amps: [170, 78, 26], waterY: 852, islands: true, lakes: 1,
    mesas: false, windScale: 1.0, decor: 'palm',
    desc: '风格均衡：2~3 座浮岛，标准风力，适合新手',
  },
  desert: {
    name: '落日沙漠', icon: '🏜️',
    sky: ['#ff9a5a 0%', '#ffc27a 45%', '#ffe3b0 100%'],
    top: 0xe8c56a, top2: 0xf7dd97, body: 0xc98f4e, body2: 0xa86f3a, speck: 0xd9a860,
    water: 0x3a86c8, waterAlpha: 0.7, waterDeep: 0x1d5a90,
    clouds: true, stars: 0, aurora: false, embers: false,
    base: 500, amps: [128, 92, 20], waterY: 895, islands: false, lakes: 0, mesas: true,
    windScale: 0.7, decor: 'cactus', gust: true,
    desc: '风最小但有阵风：平顶台地+缓坡，回合内风向会漂移',
  },
  snow: {
    name: '极光雪原', icon: '🏔️',
    sky: ['#0e1e42 0%', '#1d3a6e 55%', '#2c5586 100%'],
    top: 0xeef6fb, top2: 0xffffff, body: 0x8fa6bd, body2: 0x6f87a3, speck: 0xa9bdd2,
    water: 0x2a6db5, waterAlpha: 0.8, waterDeep: 0x123f75,
    clouds: false, stars: 90, aurora: true, embers: false,
    base: 462, amps: [196, 88, 30], waterY: 858, islands: true, lakes: 0,
    mesas: false, windScale: 1.35, decor: 'pine', slide: true,
    desc: '风最大+冰面打滑：暴风雪山峰，走位会惯性滑出去',
  },
  lava: {
    name: '熔岩星球', icon: '🌋',
    sky: ['#1a0b12 0%', '#3d1418 55%', '#68220f 100%'],
    top: 0x6a5a66, top2: 0x84718a, body: 0x453d4a, body2: 0x332c38, speck: 0x5c4f60,
    water: 0xff5a1e, waterAlpha: 0.92, waterDeep: 0xc22e00, lava: true,
    clouds: false, stars: 60, aurora: false, embers: true,
    base: 486, amps: [182, 92, 26], waterY: 838, islands: true, lakes: 0,
    mesas: false, windScale: 1.15, decor: 'crystal', waterRiseMult: 2,
    desc: '熔岩扑面且突死涨水翻倍：风偏强，站位要更小心',
  },
};

// ---------------- AI 难度 ----------------
export const DIFFICULTY = {
  easy:   { name: '简单 🐣', angleStep: 30, powerStep: 0.28, angleNoise: 9,  powerNoise: 0.13, simulateWind: false, refine: 0, moveIQ: 0, retreat: false, smartWeapon: false },
  normal: { name: '普通 🐥', angleStep: 14, powerStep: 0.16, angleNoise: 3.5, powerNoise: 0.05, simulateWind: true,  refine: 1, moveIQ: 0, retreat: false, smartWeapon: false, firstShotNoise: 2.5 },
  hard:   { name: '困难 🦅', angleStep: 7,  powerStep: 0.1,  angleNoise: 1.4, powerNoise: 0.02, simulateWind: true,  refine: 2, moveIQ: 1, retreat: true,  smartWeapon: true },
};

// ---------------- 外观 ----------------
export const PLAYER_COLORS = ['#ff6b81', '#4d96ff', '#ffd93d', '#6bd968', '#b980ff', '#ff9f43'];
export const ENEMY_COLORS = ['#8d99ae', '#ef476f', '#06d6a0', '#f78c6b', '#9b5de5', '#00bbf9'];
export const HATS = ['cap', 'bow', 'tophat', 'flower', 'helmet', 'bandana'];
export const WORM_NAMES = ['蠕蠕', '弹弹', '咕咕', '球球', '泡泡', '呆呆', '麻薯', '布丁', '年糕', '汤圆', '糯米', '曲奇', '果冻', '薯条', '蛋挞', '团子', '花卷', '烧麦'];

export const TAUNTS = ['接招吧！', '看我的必杀技！', '嘿嘿，稳了～', '风我都算好了', '这波操作满分', '锁定目标！', '弹道无所谓，气势要足！', '给你挖个坑～'];
export const OUCHES = ['哎哟！', '好痛！', '我记住了！', '居然偷袭我', '呜哇！'];
export const DEATH_WORDS = ['安息吧~', '卒', '躺平了', '下次一定', '我先撤了'];
export const EPITAPHS = ['此处长眠一只虫', '卒于弹坑', '风没算对', '差一点就赢', '扑通'];

export const TEAM_INFO = [
  { name: '玩家队', color: '#4d96ff' },
  { name: '虫虫军团', color: '#ef476f' },
];

// 暴击：爆炸有概率打出 1.6 倍伤害
export const CRIT_CHANCE = 0.07;
export const CRIT_MULT = 1.6;

// ---------------- 成就 ----------------
export const ACHIEVEMENTS = {
  first_win:    { icon: '🏆', name: '初次胜利', desc: '赢下第一场对局' },
  double_kill:  { icon: '💥', name: '双杀',     desc: '一次爆炸击倒 2 只敌人' },
  triple_kill:  { icon: '☄️', name: '三杀',     desc: '一次爆炸击倒 3 只敌人' },
  long_shot:    { icon: '🎯', name: '神枪手',   desc: '700px 外命中敌人' },
  crit:         { icon: '✨', name: '暴击时刻', desc: '打出一次暴击' },
  flawless:     { icon: '🛡️', name: '毫发无伤', desc: '全员零受伤获胜' },
  crate_addict: { icon: '📦', name: '补给大亨', desc: '单局拾取 3 个补给箱' },
  berserk_win:  { icon: '🔥', name: '背水一战', desc: '仅剩 1 只虫虫时翻盘获胜' },
  terrain_kill: { icon: '🌊', name: '地形杀',   desc: '让一名敌人葬身水底' },
  driller_kill: { icon: '⛏️', name: '掘地三尺', desc: '用钻地弹击杀敌人' },
  holy_kill:    { icon: '🐑', name: '神圣制裁', desc: '用神圣手雷击杀敌人' },
  cow_kill:     { icon: '🐮', name: '天降奶牛', desc: '用奶牛空袭击杀敌人' },
  airstrike_kill:{ icon: '✈️', name: '空中支援', desc: '用空袭击杀敌人' },
  shotgun_kill: { icon: '🔫', name: '近身扫射', desc: '用散弹枪击杀敌人' },
  big_shot:     { icon: '💣', name: '重炮手',   desc: '单次爆炸对敌人造成 ≥100 伤害' },
  full_pellets: { icon: '🥇', name: '弹无虚发', desc: '散弹枪 5 颗弹丸全部命中敌人' },
  low_hp_kill:  { icon: '🩹', name: '濒死反杀', desc: '自己 HP ≤ 10 时击杀敌人' },
  sudden_win:   { icon: '☠️', name: '突死幸存', desc: '在突死阶段翻盘获胜' },
  air_crate:    { icon: '🪂', name: '空中接箱', desc: '在空中接到补给箱' },
  teleport_use: { icon: '🌀', name: '时空跳跃', desc: '首次使用传送' },
};
